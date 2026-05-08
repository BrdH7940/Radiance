# Radiance — System Architecture

> Tài liệu mô tả kiến trúc hệ thống đầy đủ: infrastructure, data flow, security, và các design decisions.

---

## 1. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          USER BROWSER                                │
│                                                                      │
│  Next.js 14 Static Export (S3 + CloudFront CDN)                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  React App: Landing / Dashboard / Gallery / History / Editor  │   │
│  │  Zustand Store (useCVStore) — global state                    │   │
│  │  WebWorker (ai.worker.ts) — Transformers.js models            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└────────────┬───────────────────────────────────────┬────────────────┘
             │ HTTPS API calls                        │ PUT (presigned URL)
             │ Authorization: Bearer <JWT>            │ (direct S3 upload)
             ▼                                        ▼
┌──────────────────────────┐          ┌────────────────────────────────┐
│  AWS API Gateway HTTP v2  │          │  Amazon S3 (raw-pdf/ prefix)   │
│  CORS: configured         │          │  Private bucket, presigned PUTs│
│  $1/million requests      │          └────────────────────────────────┘
└───────────┬──────────────┘
            │ Lambda proxy
            ▼
┌───────────────────────────────────────────────────────────────────┐
│           AWS Lambda (Container Image — ECR)                      │
│           FastAPI + Mangum · Python 3.12 · 2 GB RAM · 300s timeout│
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  HTTP Mode (API Gateway → Mangum → FastAPI)                │  │
│  │                                                            │  │
│  │  POST /api/v1/resumes/upload-urls  → S3 presigned PUT URL  │  │
│  │  POST /api/v1/analyses             → DynamoDB + SQS        │  │
│  │  GET  /api/v1/analyses/{id}        → DynamoDB poll         │  │
│  │  POST /api/v1/analyses/enhance-from-gallery → DynamoDB+SQS │  │
│  │  POST /api/v1/fallback/client-ai   → Gemini inline         │  │
│  │  POST /api/v1/editor/renders       → WeasyPrint → S3       │  │
│  │  CRUD /api/v1/projects             → Supabase              │  │
│  │  CRUD /api/v1/history              → Supabase              │  │
│  └──────────────────────────────────────────────────────────  │  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  SQS Worker Mode (SQS Records → Lambda handler)            │  │
│  │                                                            │  │
│  │  type: "legacy_enhance"                                    │  │
│  │    1. Download PDF from S3                                 │  │
│  │    2. Parse text (pdfplumber)                              │  │
│  │    3. LangGraph: Analyzer → Enhancer (Gemini 2.5 Flash)   │  │
│  │    4. Render PDF (Jinja2 + WeasyPrint)                     │  │
│  │    5. Upload to S3 + update DynamoDB → COMPLETED           │  │
│  │    6. Save CVHistoryEntry to Supabase                      │  │
│  │                                                            │  │
│  │  type: "gallery_enhance"                                   │  │
│  │    1. Enhance CV with verified gallery projects (Gemini)   │  │
│  │    2. Update DynamoDB → COMPLETED                          │  │
│  └────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
         │                     │                    │
         ▼                     ▼                    ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│  Amazon DynamoDB │  │  Amazon SQS       │  │  Supabase (Postgres) │
│  Analysis jobs   │  │  analysis-queue   │  │  ── Auth (JWT)        │
│  (PAY_PER_REQUEST│  │  visibility: 330s │  │  ── project_gallery   │
│   table)         │  │  retention: 1h    │  │  ── cv_history        │
└─────────────────┘  │  DLQ: configured  │  └──────────────────────┘
                      └──────────────────┘
                               │ (enhanced-pdf/ prefix)
                               ▼
                     ┌──────────────────────────┐
                     │  Amazon S3               │
                     │  (enhanced-pdf/ prefix)  │
                     │  Presigned GET URLs       │
                     └──────────────────────────┘
```

---

## 2. Các Thành Phần Kiến Trúc

### 2.1 Frontend Layer

**Next.js 14 Static Export** — không có server-side runtime.

| Thành phần | Mô tả |
|-----------|-------|
| **S3 + CloudFront** | Static files hosting. OAC → S3 (private bucket). Global CDN. |
| **Supabase Auth** | Magic link + OAuth. JWT issued by Supabase, verified bởi backend. |
| **Zustand Store** | Single source of truth: auth state, CV data, job state, gallery FSM. |
| **WebWorker** | `ai.worker.ts` — runs `all-MiniLM-L6-v2` + `SmolLM2-135M` entirely in browser. Off UI thread. |
| **API Client** | `services/api.ts` — typed fetch wrapper, auto-inject Bearer token. |

### 2.2 API Gateway Layer

**AWS API Gateway HTTP API v2** — entry point cho tất cả backend requests.

- CORS configured (origin whitelist từ env var)
- Lambda proxy integration
- $1/million requests billing
- No custom auth at gateway level (auth happens in Lambda)

### 2.3 Compute Layer — AWS Lambda (Dual-Mode)

**Một Lambda function duy nhất** vận hành ở hai chế độ:

```python
def handler(event, context):
    if "Records" in event:       # SQS trigger
        return asyncio.run(process_sqs_records(event))
    return mangum_handler(event, context)  # HTTP trigger
```

| Config | Value |
|--------|-------|
| Runtime | Python 3.12 (Container Image) |
| RAM | 2 GB |
| Timeout | 300 seconds |
| Concurrency | Unreserved (scales to demand) |
| Packaging | Docker → ECR → Lambda |

**Cold start mitigation:**
- `@lru_cache(maxsize=1)` singletons — không re-init heavy adapters per request
- Không init tại startup — adapters lazy-init on first use
- CORS preflight (OPTIONS) returns trước khi bất kỳ adapter nào được khởi tạo

### 2.4 Async Messaging Layer — Amazon SQS

**Giải quyết bài toán API Gateway 29-second hard timeout:**

```
POST /analyses (~100ms response)
    │
    ├── DynamoDB: save job (QUEUED)
    └── SQS: enqueue message
              │
              └── Lambda Worker (20–45s processing)
                      │
                      └── DynamoDB: update job (COMPLETED/FAILED)
```

| Config | Value |
|--------|-------|
| Queue type | Standard Queue |
| Visibility timeout | 330s (buffer trên Lambda 300s timeout) |
| Message retention | 1 hour |
| SSE | Enabled (AWS-managed keys) |
| DLQ | Configured (permanent failures) |

SQS `Records` event phân biệt job type qua `body.type` field:
- `"legacy_enhance"` → standard CV analysis
- `"gallery_enhance"` → strategic gallery enhancement

### 2.5 Storage Layer

#### Amazon S3

Hai prefix trên cùng một bucket (private):

| Prefix | Nội dung | Upload method | Download method |
|--------|----------|---------------|-----------------|
| `raw-pdf/` | CV PDF gốc từ người dùng | Browser → Presigned PUT (bypass API GW) | Server-only (Lambda downloads) |
| `enhanced-pdf/` | Enhanced CV PDF sau WeasyPrint | Server upload (Lambda) | Browser → Presigned GET URL (TTL 1h) |

**Presigned URL pattern:** Client không bao giờ có quyền trực tiếp vào bucket. Tất cả access đều qua time-limited presigned URLs.

#### Amazon DynamoDB

Lưu trạng thái từng `AnalysisJob` dưới dạng document.

| Config | Value |
|--------|-------|
| Billing | PAY_PER_REQUEST |
| Partition key | `UserId` |
| TTL | Configurable |

Document structure: `id`, `user_id`, `status`, `s3_key`, `jd_text`, `result` (JSON), `error`, `created_at`, `updated_at`.

### 2.6 Database Layer — Supabase (Postgres)

Supabase lưu trữ dữ liệu persistent (không expiring, cross-session):

| Table | Mô tả |
|-------|-------|
| `project_gallery` | User projects: id, user_id, title, description, technologies[], is_active, created_at |
| `cv_history` | CV enhancement records: user_id, job_title, company_name, jd_text, matching_score, enhanced_cv_json, pdf_s3_key, created_at |

**Supabase Auth:** Cấp JWT cho frontend → frontend gửi đến backend → backend verify bằng JWT secret (HS256) hoặc JWKS (ES256/RS256).

**Backend access:** Service role key (server-side only, không expose ra frontend).

### 2.7 Observability Stack

| Tool | Vai trò |
|------|---------|
| **CloudWatch Logs** | Lambda stdout → structured log entries |
| **AWS X-Ray** | Distributed tracing cho HTTP requests + SQS records |
| **LangSmith** | LLM call tracing (inputs, outputs, latency, token count) |
| **DeepEval** | Offline LLM quality evaluation suite (Docker-based) |

---

## 3. Data Flow Chi Tiết

### 3.1 Legacy CV Analysis Flow

```
Browser                API GW       Lambda HTTP      SQS     Lambda Worker
   │                      │               │           │             │
   │  POST /resumes/upload-urls           │           │             │
   │─────────────────────────────────────►│           │             │
   │◄─────────────────────────────────────│           │             │
   │  { upload_url, s3_key }              │           │             │
   │                                      │           │             │
   │  PUT {upload_url} (direct S3)        │           │             │
   │──────────────────────────────────────────────────────────────► S3
   │                                      │           │             │
   │  POST /analyses                      │           │             │
   │─────────────────────────────────────►│           │             │
   │                   DynamoDB.save(QUEUED)           │             │
   │                   SQS.send_job()     │─────────► │             │
   │◄─────────────────────────────────────│           │             │
   │  { id: jobId, status: "queued" }     │           │   consume   │
   │                                      │           │────────────►│
   │  (polling every 2s)                  │           │             │ S3.download(cv.pdf)
   │  GET /analyses/{jobId}               │           │             │ parse PDF
   │─────────────────────────────────────►│           │             │ LangGraph(Gemini)
   │◄─────────────────────────────────────│           │             │ WeasyPrint → PDF
   │  { status: "processing" }            │           │             │ S3.upload(enhanced.pdf)
   │                                      │           │             │ DynamoDB.update(COMPLETED)
   │  GET /analyses/{jobId}               │           │             │ Supabase.save(history)
   │─────────────────────────────────────►│           │             │
   │◄─────────────────────────────────────│           │             │
   │  { status: "completed", result: {...} }           │             │
```

### 3.2 Strategic Gallery Flow

```
Browser (WebWorker)          API GW       Lambda HTTP      SQS     Lambda Worker
   │                           │               │            │            │
   │  loadGallery()            │               │            │            │
   │  GET /api/v1/projects ────────────────────►            │            │
   │◄──────────────────────────────────────────            │            │
   │  [projects...]            │               │            │            │
   │                           │               │            │            │
   │  spawn ai.worker.ts       │               │            │            │
   │  Phase 1: all-MiniLM embeddings           │            │            │
   │  Phase 2: SmolLM2 reasoning               │            │            │
   │  → Top-5 ClientAIResult[]                 │            │            │
   │                           │               │            │            │
   │  (user selects projects)  │               │            │            │
   │                           │               │            │            │
   │  POST /analyses/enhance-from-gallery       │            │            │
   │  { cv_text, jd_text, client_results }      │            │            │
   │───────────────────────────────────────────►            │            │
   │          verify_selected() → Supabase verify           │            │
   │          DynamoDB.save(QUEUED)             │            │            │
   │          SQS.send_gallery_job()            │───────────►│            │
   │◄──────────────────────────────────────────            │   consume  │
   │  { id: jobId, status: "queued" }           │           │───────────►│
   │                                            │           │            │ Gemini.enhance_from_gallery()
   │  (polling every 2s)                        │           │            │ DynamoDB.update(COMPLETED)
   │  GET /analyses/{jobId}                     │           │            │
   │───────────────────────────────────────────►            │            │
   │◄──────────────────────────────────────────            │            │
   │  { status: "completed", enhanced_cv_json }             │            │
```

### 3.3 WebWorker Fallback Flow

```
Browser
   │
   ├── spawn ai.worker.ts
   │      │
   │      └── Error / FALLBACK_REQUIRED
   │
   └── callFallbackClientAI({ jd_text, project_gallery })
          POST /api/v1/fallback/client-ai
               │
               └── GeminiLLMAdapter.rank_projects_for_jd()
                     → List[ClientAIResult]  (same shape as WebWorker output)
```

---

## 4. Backend Clean Architecture

```
presentation/         ← HTTP boundary (FastAPI routers)
    │                    - Input validation (Pydantic DTOs)
    │                    - Auth injection (Depends)
    │                    - Rate limiting (Depends)
    │                    - HTTP → domain translation
    ▼
core/use_cases/       ← Business logic (depends on ports only)
    │                    - AnalyzeCVUseCase (8-step pipeline)
    │                    - No infrastructure imports
    ▼
core/ports/           ← Interfaces (ABCs)
    │                    - ILLMService, IStorageService, IJobRepository
    │                    - IDocumentParser, IPDFRenderService
    │                    - ISQSService, IProjectRepository, IHistoryRepository
    ▼
infrastructure/       ← Concrete implementations
                         - GeminiLLMAdapter, GroqLLMAdapter, FallbackLLMAdapter
                         - S3StorageAdapter, DynamoJobRepository, SQSService
                         - WeasyPrintPDFAdapter, PDFPlumberParser
                         - SupabaseProjectRepository, SupabaseHistoryRepository
```

**DI Container (`container.py`):**
- `@lru_cache(maxsize=1)` → singleton per Lambda instance
- Provider functions = FastAPI `Depends()` dependencies
- Testable via `cache.cache_clear()` in tests

---

## 5. Security Architecture

### 5.1 Authentication Flow

```
User → Supabase Auth → JWT (HS256 or ES256/RS256)
  │
  └── Sent as Authorization: Bearer <token>
        │
        └── Backend: get_current_user_id()
              ├── Parse header algorithm
              ├── HS256: verify with SUPABASE_JWT_SECRET
              └── ES256/RS256: verify via JWKS endpoint
                    (cached PyJWKClient)
              → return user_id (JWT sub claim)
```

### 5.2 Authorization Model

| Resource | Guard |
|----------|-------|
| Analysis jobs | Ownership check: `job.user_id == request.user_id` (404 instead of 403) |
| Projects | Repository-level ownership filter |
| History | Repository-level ownership filter |
| Gallery security | `verify_selected()` re-fetches from Supabase — never trusts frontend IDs |

### 5.3 S3 Security

- Bucket is **private** — no public access
- CV uploads: browser uses **presigned PUT URL** (temporary, scoped to one object)
- PDF downloads: backend generates **presigned GET URL** (1-hour TTL)
- Lambda has IAM role với least-privilege S3 permissions

### 5.4 CORS

```python
allow_origins = cors_allowed_origins_from_env()  # comma-separated env var
allow_credentials = True
allow_methods = ["*"]
allow_headers = ["*"]
```

Wildcards không được dùng vì không tương thích với `allow_credentials=True`.

---

## 6. Infrastructure as Code (Terraform)

Toàn bộ AWS resources được định nghĩa trong `infra/main.tf`. Không có resource nào tạo tay.

| Resource | Terraform resource |
|----------|-------------------|
| Lambda function | `aws_lambda_function` |
| API Gateway | `aws_apigatewayv2_api` + routes |
| SQS queue + DLQ | `aws_sqs_queue` |
| DynamoDB table | `aws_dynamodb_table` |
| S3 buckets (2) | `aws_s3_bucket` |
| ECR repository | `aws_ecr_repository` |
| CloudFront distribution | `aws_cloudfront_distribution` |
| IAM roles + policies | `aws_iam_role` + `aws_iam_policy` |
| CloudWatch alarms | `aws_cloudwatch_metric_alarm` |

**Remote state backend:** S3 bucket + DynamoDB table (state locking).

---

## 7. CI/CD Pipeline

### GitHub Actions Workflows

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `frontend-deploy.yml` | Push to `main` (apps/web changes) | Build → S3 sync → CloudFront invalidation |
| `backend-deploy.yml` | Push to `main` (services/cv-enhancer changes) | Docker build → ECR push → Lambda update |
| `_terraform.yml` | Push to `main` (infra/ changes) | `terraform plan` → `terraform apply` |

### Deployment Flow

```
Developer pushes → GitHub Actions
    │
    ├── Frontend: npm run build → out/ → S3 → CloudFront
    │
    ├── Backend: docker build → ECR → aws lambda update-function-code
    │
    └── Infra: terraform plan → approve → terraform apply
```

---

## 8. Local Development Setup

### Backend

```bash
cd services/cv-enhancer
cp .env.example .env  # Fill in credentials
pip install -r requirements.txt
IN_PROCESS_WORKER=1 python src/main.py  # No SQS needed
```

`IN_PROCESS_WORKER=1`: analysis jobs run in-process via `asyncio.create_task()`.

### Frontend

```bash
cd apps/web
cp .env.local.example .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```

### Eval Suite

```bash
cd eval/cv-enhancer-deepeval
cp .env.example .env  # GOOGLE_API_KEY required
docker compose run --rm eval
```

---

## 9. Scalability Considerations

| Bottleneck | Current approach | Production upgrade |
|-----------|-----------------|-------------------|
| Rate limiting | In-memory per Lambda instance | DynamoDB / Redis distributed counter |
| Job state | DynamoDB on-demand | Scales automatically |
| LLM throughput | Gemini API rate limits + Groq fallback | Multiple API keys, request queuing |
| PDF rendering | WeasyPrint in Lambda (CPU-bound) | Dedicated PDF service / container |
| WebWorker models | Browser cache (~113 MB) | Service Worker pre-cache strategy |
| Supabase connections | Supabase Python SDK (connection pool) | PgBouncer or connection limiting |
