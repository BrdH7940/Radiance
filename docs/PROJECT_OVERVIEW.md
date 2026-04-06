# Radiance — Project Documentation

> Tài liệu tổng hợp về toàn bộ project: tổng quan, tính năng, technical stack, DevOps và LLMOps.

---

## Table of Contents

1. [Tổng quan project](#1-tổng-quan-project)
2. [Các tính năng chính](#2-các-tính-năng-chính)
3. [Technical Stack](#3-technical-stack)
4. [Kiến trúc hệ thống](#4-kiến-trúc-hệ-thống)
5. [DevOps](#5-devops)
6. [LLMOps](#6-llmops)

---

## 1. Tổng quan project

**Radiance** là một ứng dụng web Serverless giúp người dùng:

1. **Phân tích độ phù hợp** của CV với Job Description (JD) — tính điểm Matching Score, phát hiện Skill Gaps và Red Flags.
2. **Tự động viết lại CV** theo tiêu chuẩn STAR (Situation–Task–Action–Result) thông qua một Agentic AI Workflow.
3. **Chỉnh sửa CV** trong workspace tương tác, với AI Refine inline và preview PDF ngay trong trình duyệt.

### Đặc điểm nổi bật về mặt kỹ thuật

- **Fully Serverless trên AWS** — Lambda (Container Image), SQS, DynamoDB, S3, API Gateway, CloudFront. Zero idle cost, scale-to-zero.
- **Event-Driven Architecture** — Giải quyết bài toán AWS API Gateway hard timeout 29 giây trong khi LLM pipeline cần 20–45 giây. POST `/analyses` trả về ngay trong ~100ms; worker xử lý bất đồng bộ qua SQS; frontend polling mỗi 2 giây.
- **LangGraph Agentic Workflow** — Hai node AI chuyên biệt (Analyzer → Enhancer) thay vì một mega-prompt duy nhất, đảm bảo chất lượng output và khả năng debug.
- **Infrastructure as Code** — 100% AWS resources định nghĩa bằng Terraform, không có resource nào tạo tay qua Console.
- **CI/CD tự động** — 3 GitHub Actions workflows riêng biệt cho Frontend, Backend, và Terraform.

### Cấu trúc project

```
Radiance/
├── apps/
│   └── web/                    # Next.js 14 frontend (static export)
│       ├── app/                # App Router: /, /dashboard/, /workspace/
│       ├── components/         # Dashboard, editor, UI components
│       ├── services/           # HTTP API client (api.ts)
│       └── store/              # Zustand global state (useCVStore.ts)
├── services/
│   └── cv-enhancer/            # FastAPI backend microservice
│       ├── src/
│       │   ├── main.py         # Lambda dual-mode handler + FastAPI app
│       │   ├── config.py       # Pydantic Settings
│       │   ├── container.py    # DI container (lru_cache singletons)
│       │   ├── core/           # Domain models, use cases, prompts
│       │   ├── infrastructure/ # Adapters: Gemini, S3, DynamoDB, SQS, PDF
│       │   └── presentation/   # FastAPI routers
│       ├── tests/              # pytest: unit, integration, e2e
│       └── Dockerfile.lambda   # Container image cho AWS Lambda
├── infra/
│   └── main.tf                 # Terraform — toàn bộ AWS resources
├── eval/
│   └── cv-enhancer-deepeval/   # DeepEval evaluation suite (LLMOps)
├── docs/                       # Technical documentation
└── .github/
    └── workflows/
        ├── frontend-deploy.yml
        ├── backend-deploy.yml
        └── _terraform.yml
```

---

## 2. Các tính năng chính

### 2.1 Smart CV–JD Matching

Người dùng upload CV (PDF) và dán Job Description text. Hệ thống phân tích và trả về:

- **Matching Score (0–100)** — Tổng hợp mức độ phù hợp dựa trên 4 tiêu chí có trọng số:
  - Technical skills & technology stack overlap → 40%
  - Years and depth of directly relevant experience → 30%
  - Domain / industry alignment → 20%
  - Education, certifications & required qualifications → 10%

- **Skill Gaps** — Danh sách kỹ năng còn thiếu, phân loại theo mức độ ưu tiên:
  - `critical` — Deal-breaker; candidate sẽ fail technical screening
  - `recommended` — Strongly preferred; làm yếu đáng kể hồ sơ
  - `nice-to-have` — Có lợi nhưng không quyết định

- **Red Flags** — Phát hiện các vấn đề cấu trúc mà recruiter thường chú ý:
  - Unexplained employment gaps (> 3 tháng)
  - Job-hopping (nhiều roles < 1 năm)
  - Vague bullets không có con số định lượng
  - Mismatch giữa claimed seniority và mô tả thực tế
  - Buzzword-heavy skills section không có bằng chứng sử dụng

### 2.2 STAR-Method CV Enhancement

AI tự động viết lại toàn bộ CV theo chuẩn STAR (Situation–Task–Action–Result):

**Ví dụ transformation:**

| Trước (CV gốc) | Sau (STAR-enhanced) |
|----------------|---------------------|
| `Worked on microservices architecture for e-commerce platform` | `Architected event-driven microservices system handling 50K concurrent users, reducing inter-service latency by 35% through async message queuing with Kafka` |
| `Helped improve system performance` | `Diagnosed and resolved N+1 query bottleneck in product catalog service, cutting average response time from 800ms to 120ms (85% improvement)` |
| `Responsible for code reviews` | `Led code review process for team of 8 engineers, establishing PR checklist that reduced production bugs by 40% over two quarters` |

Kết quả được structured theo **CVResumeSchema** (Pydantic model) gồm: `personal_info`, `summary`, `experiences`, `education`, `projects`, `skill_groups`, `awards_certifications`.

### 2.3 Async Processing với Real-time Feedback

Toàn bộ AI pipeline (parse PDF → LangGraph → render PDF) mất 20–45 giây. Hệ thống xử lý bất đồng bộ:

```
POST /analyses  →  { job_id }   (~100ms)
         │
         └── SQS enqueue → Lambda Worker → DynamoDB update
                   ↑
Frontend polls GET /analyses/{id} mỗi 2 giây
         └── Hiển thị kết quả ngay khi status = COMPLETED
```

### 2.4 Interactive CV Workspace

Sau khi AI enhance, người dùng có thể:

- **Chỉnh sửa từng field** của CV trực tiếp trong form builder (CVFormBuilder component)
- **AI Refine inline** — chọn một đoạn text, nhập instruction, Gemini viết lại ngay lập tức (< 3 giây)
- **Preview PDF** trong trình duyệt — render realtime qua WeasyPrint → presigned S3 URL → `<iframe>`
- **Export PDF** — download CV đã enhanced

### 2.5 API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/health` | Liveness check |
| `POST` | `/api/v1/resumes/upload-urls` | Lấy S3 presigned PUT URL để upload CV PDF |
| `POST` | `/api/v1/analyses` | Tạo analysis job → trả về `job_id` ngay (~100ms) |
| `GET` | `/api/v1/analyses/{job_id}` | Poll trạng thái / lấy kết quả job |
| `POST` | `/api/v1/editor/refinements` | AI refine một đoạn text inline |
| `POST` | `/api/v1/editor/renders` | Render CVResumeSchema → PDF → presigned GET URL |

---

## 3. Technical Stack

### 3.1 Frontend

| Công nghệ | Version | Vai trò |
|-----------|---------|---------|
| **Next.js** | 14.2.5 | React framework, App Router, static export (`output: 'export'`) |
| **React** | 18 | UI rendering |
| **TypeScript** | 5 | Type safety |
| **Tailwind CSS** | 3.4 | Utility-first styling |
| **Zustand** | latest | Global state management (`useCVStore.ts`) — file, JD, job id, analysis result, CV JSON, PDF URL, phase |
| **Monaco Editor** | latest | Code editor cho JSON CV data (`@monaco-editor/react`) |
| **Lucide Icons** | latest | Icon library |

**Build strategy:** `next.config.mjs` với `output: 'export'` → static HTML/CSS/JS export ra `apps/web/out/`. Deploy lên S3 + CloudFront CDN, không cần server.

**Frontend routes (App Router):**
- `/` — Upload CV + JD, trigger analysis
- `/dashboard/` — Hiển thị Matching Score, Skill Gaps, Red Flags
- `/workspace/` — CV form editor, AI refine, PDF preview

### 3.2 Backend

| Công nghệ | Version | Vai trò |
|-----------|---------|---------|
| **Python** | 3.12 | Runtime |
| **FastAPI** | latest | Web framework, async, OpenAPI docs tự động |
| **Mangum** | latest | ASGI → Lambda event bridge (API Gateway v2 format) |
| **Uvicorn** | latest | ASGI server cho local development |
| **Pydantic** | v2 | Data validation, settings management, API schema |
| **pdfplumber** | latest | PDF text extraction (không dùng ML, image rinhe hơn) |
| **Jinja2** | latest | HTML CV template rendering |
| **WeasyPrint** | latest | HTML/CSS → PDF rendering (hỗ trợ Unicode/Vietnamese native) |
| **boto3** | latest | AWS SDK — S3, DynamoDB, SQS |

**Architecture pattern:** Clean Architecture với Ports & Adapters:
- `core/` — Domain models, use cases, port interfaces
- `infrastructure/` — Concrete adapters (Gemini, S3, DynamoDB, SQS, PDF)
- `presentation/` — FastAPI routers (HTTP layer)
- `container.py` — Dependency injection với `@lru_cache` singleton pattern

### 3.3 AI / LLM

| Công nghệ | Vai trò |
|-----------|---------|
| **Google Gemini 2.5 Flash** | LLM chính cho phân tích và enhancement |
| **LangChain** | LLM abstraction layer, prompt templates, structured output |
| **LangGraph** | Stateful multi-step agentic workflow (Analyzer → Enhancer) |
| **langchain-google-genai** | LangChain adapter cho Gemini |

**Tại sao Gemini 2.5 Flash?**

| | Gemini 2.5 Flash | GPT-4o | Claude 3 Haiku |
|--|-----------------|--------|----------------|
| Context window | **1M tokens** | 128K | 200K |
| Cost (input/1M tokens) | **$0.15** | $2.50 | $0.25 |
| Structured output | Native (function calling) | Native | Native |
| Speed | Fast | Medium | Fast |

CV + JD thường < 10K tokens — Gemini 2.5 Flash đủ mạnh với cost thấp hơn GPT-4o **16×**.

### 3.4 AWS Services

| Service | Cấu hình | Vai trò |
|---------|----------|---------|
| **Lambda** | Container Image, 2GB RAM, timeout 300s | Runtime cho cả HTTP handler và SQS worker |
| **API Gateway HTTP API** | CORS configured, $1/million requests | Entry point cho frontend requests |
| **SQS Standard Queue** | Visibility timeout 330s, retention 1h, SSE | Async job queue, built-in retry |
| **DynamoDB** | PAY_PER_REQUEST, `UserProfiles` table | Lưu trạng thái và kết quả analysis jobs |
| **S3** (×2) | Private bucket, presigned URLs | CV PDFs storage + Static frontend hosting |
| **ECR** | Image scanning on push, AES256 | Container registry cho Lambda image |
| **CloudFront** | OAC → S3, global CDN | Phân phối static frontend |
| **IAM** | Least privilege roles | Lambda execution permissions |
| **CloudWatch** | Logs, metrics, alarms | Monitoring và alerting |

### 3.5 Infrastructure & IaC

| Công nghệ | Vai trò |
|-----------|---------|
| **Terraform** 1.5 | Infrastructure as Code — toàn bộ AWS resources |
| **S3 + DynamoDB** | Terraform remote state backend + state locking |

### 3.6 Testing

| Công nghệ | Vai trò |
|-----------|---------|
| **pytest** | Unit tests, integration tests, e2e tests |
| **pytest-asyncio** | Async test support |
| **httpx** | HTTP client cho FastAPI test client |

Test coverage bao gồm: S3 adapter, DynamoDB repository, SQS service, pdfplumber parser, Gemini adapter, Lambda SQS handler, AnalyzeCVUseCase, và live AWS+Gemini e2e tests (gated bởi env var `RUN_LIVE_AWS_GEMINI_TESTS=1`).

---

## 4. Kiến trúc hệ thống

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                                │
│  Next.js 14 (Static Export on S3 + CloudFront CDN)                │
└───────────────┬─────────────────────────────────┬──────────────────┘
                │ HTTPS (CORS)                     │ PUT (presigned URL)
                ▼                                  ▼
┌──────────────────────┐            ┌───────────────────────┐
│  API Gateway HTTP API │            │   S3 — CV Raw PDFs    │
│  radiance-api-gw      │            │   (presigned upload)  │
└──────────┬────────────┘            └───────────────────────┘
           │ Lambda proxy                        ▲
           ▼                                     │ download
┌──────────────────────────────────────────────────────────────────┐
│              AWS Lambda  (Container Image — ECR)                 │
│              FastAPI + Mangum  ·  Python 3.12  ·  2 GB RAM      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  HTTP Path (API Gateway → Mangum → FastAPI)              │   │
│  │   POST /api/v1/resumes/upload-urls  → S3 presigned URL   │   │
│  │   POST /api/v1/analyses             → DynamoDB + SQS     │   │
│  │   GET  /api/v1/analyses/{id}        → DynamoDB polling   │   │
│  │   POST /api/v1/editor/refinements   → Gemini inline      │   │
│  │   POST /api/v1/editor/renders       → WeasyPrint PDF     │   │
│  └─────────────────────────┬────────────────────────────────┘   │
│                             │ SQS Event                          │
│  ┌──────────────────────────▼────────────────────────────────┐   │
│  │  SQS Worker Path (SQS Trigger → Lambda handler)           │   │
│  │   1. Download PDF from S3                                 │   │
│  │   2. Parse text (pdfplumber)                              │   │
│  │   3. LangGraph: Analyzer Node → Enhancer Node (Gemini)   │   │
│  │   4. Render enhanced CV (Jinja2 + WeasyPrint → PDF)      │   │
│  │   5. Upload PDF to S3; update DynamoDB → COMPLETED        │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
           │ write/read                   │ send/receive
           ▼                              ▼
┌───────────────────┐       ┌─────────────────────────────────┐
│  DynamoDB         │       │  SQS                            │
│  UserProfiles     │       │  radiance-analysis-queue        │
│  (PAY_PER_REQUEST)│       │  visibility timeout: 330s       │
└───────────────────┘       └─────────────────────────────────┘
```

### LangGraph AI Pipeline

```
Input: cv_text + jd_text
           │
           ▼
┌─────────────────────────┐
│       ANALYZER          │
│  (Gemini 2.5 Flash)     │
│                         │
│  → matching_score       │
│  → missing_skills       │
│  → red_flags            │
└──────────┬──────────────┘
           │ state passes (cv_text + jd_text + analysis result)
           ▼
┌─────────────────────────┐
│       ENHANCER          │
│  (Gemini 2.5 Flash)     │
│                         │
│  → CVResumeSchema (JSON)│
│    - personal_info      │
│    - summary            │
│    - experiences (STAR) │
│    - education          │
│    - projects           │
│    - skill_groups       │
│    - awards             │
└──────────┬──────────────┘
           ▼
Output: AnalysisResult {
  matching_score, missing_skills,
  red_flags, cv_data (CVResumeSchema)
}
```

### Lambda Dual-Mode Handler

Cùng một Lambda function phục vụ 2 loại event:

```python
def handler(event, context):
    if isinstance(event, dict) and "Records" in event:
        # SQS event → AI worker pipeline
        return loop.run_until_complete(process_sqs_records(event))
    # HTTP event → Mangum → FastAPI
    return mangum_handler(event, context)
```

### DynamoDB Schema (AnalysisJob item)

```json
{
  "UserId": "local",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "COMPLETED",
  "s3_key": "raw-pdf/550e8400.pdf",
  "jd_text": "We are looking for...",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:45Z",
  "result": {
    "matching_score": 78,
    "missing_skills": [
      { "name": "Kubernetes", "severity": "critical", "description": "..." }
    ],
    "red_flags": [
      { "title": "Unquantified Impact", "description": "...", "severity": "high" }
    ],
    "cv_data": { "...CVResumeSchema..." }
  },
  "pdf_url": "https://s3.amazonaws.com/...presigned..."
}
```

---

## 5. DevOps

### 5.1 Infrastructure as Code (Terraform)

Toàn bộ AWS resources được định nghĩa trong `infra/main.tf`. Không có resource nào tạo tay qua AWS Console.

**Remote state backend:**
```hcl
terraform {
  backend "s3" {
    bucket         = "radiance-s3"
    key            = "terraform/terraform.tfstate"
    region         = "<AWS_REGION>"
    encrypt        = true
    dynamodb_table = "terraform_locks"
  }
}
```

- S3 versioning → rollback state nếu apply sai
- DynamoDB state locking → ngăn concurrent apply

**Resources được quản lý:**

| Resource | Config |
|----------|--------|
| Lambda | 2GB RAM, 300s timeout, Container Image |
| SQS Queue | visibility 330s, retention 1h, SSE |
| DynamoDB | PAY_PER_REQUEST, partition key `UserId` |
| S3 (×2) | CV storage + frontend hosting |
| API Gateway | HTTP API v2, CORS configured |
| ECR | Image scan on push, AES256 encryption |
| CloudFront | OAC → S3, global CDN |
| IAM Role | Least privilege, Lambda execution |

### 5.2 CI/CD — GitHub Actions

Ba workflows riêng biệt, trigger theo đúng paths thay đổi:

#### Workflow 1: Frontend Deploy (`apps/web/**` → `main`)

```
Push to main
    │
    ▼
1. Setup Node 20
2. npm ci (với cache)
3. npm run lint
4. npm run build  →  apps/web/out/
5. aws s3 sync apps/web/out s3://{BUCKET} --delete
6. CloudFront Invalidation /*
```

- `--delete` flag: xóa stale files từ build cũ
- CloudFront Invalidation: buộc edge locations fetch file mới ngay lập tức

#### Workflow 2: Backend Deploy (`services/**` → `main`)

```
Push to main
    │
    ├── Job: test
    │     1. Python 3.12
    │     2. pip install
    │     3. pytest -v (all tests)
    │
    └── Job: deploy (needs: test)
          1. Configure AWS credentials
          2. ECR Login
          3. docker build -f Dockerfile.lambda
             Tag: {ECR_URI}:{sha} + :latest
          4. docker push (cả 2 tags)
          5. aws lambda update-function-code
             --image-uri {ECR_URI}:{sha}
          6. aws lambda wait function-updated
```

- Tag bằng `${github.sha}` → rollback bằng cách chỉnh `image_uri`
- `lambda wait function-updated` → block CI cho đến khi Lambda active

#### Workflow 3: Terraform (`infra/**` → `main`)

```
Push to main
    │
    ├── terraform fmt --check
    ├── terraform validate
    ├── terraform plan
    └── terraform apply (chỉ trên main branch)
```

### 5.3 Docker — Lambda Container Image

`services/cv-enhancer/Dockerfile.lambda`:

```dockerfile
FROM public.ecr.aws/lambda/python:3.12

# Native libs cho WeasyPrint (Pango, Cairo, gdk-pixbuf2, harfbuzz, fontconfig)
RUN dnf install -y pango cairo gdk-pixbuf2 libffi harfbuzz \
    fontconfig dejavu-sans-fonts dejavu-serif-fonts && dnf clean all

# Python dependencies
COPY services/cv-enhancer/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --prefer-binary -r /tmp/requirements.txt

# Smoke test WeasyPrint ngay khi build (fail fast nếu thiếu lib)
RUN python -c "from weasyprint import HTML; HTML(string='<h1>ok</h1>').write_pdf('/tmp/smoke.pdf')"

COPY services/cv-enhancer/src/ /var/task/
CMD ["main.handler"]
```

**Tại sao Container Image thay vì Lambda Zip?**

WeasyPrint cần `Pango, Cairo, gdk-pixbuf2, harfbuzz, fontconfig` — các native shared libraries không thể bundle vào `.zip`. Container Image limit là 10GB, giải quyết được giới hạn 250MB của Lambda Zip.

### 5.4 Environment Variables

**Backend (`services/cv-enhancer/.env.example`):**

| Variable | Mô tả |
|----------|-------|
| `GOOGLE_API_KEY` | Google AI API key |
| `GEMINI_MODEL` | Model name (e.g. `gemini-2.5-flash`) |
| `DYNAMODB_ANALYSIS_TABLE_NAME` | DynamoDB table name |
| `SQS_QUEUE_URL` | SQS queue URL |
| `AWS_REGION` | AWS region |
| `AWS_S3_BUCKET` | S3 bucket name cho CV PDFs |
| `AWS_ACCESS_KEY_ID` | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `ANALYSIS_USER_ID` | User ID trong DynamoDB (e.g. `"local"`) |
| `ENV` | Environment: `dev` / `production` |
| `PORT` | Local server port (default: 8000) |

**Frontend (`apps/web/.env.local`):**

| Variable | Mô tả |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | API Gateway URL (hoặc `http://localhost:8000` cho local) |

### 5.5 Local Development

**Backend:**
```bash
cd services/cv-enhancer
cp .env.example .env
# Điền GOOGLE_API_KEY, AWS credentials, DynamoDB table, SQS queue URL
pip install -r requirements.txt
cd src && uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd apps/web
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000
npm install && npm run dev
```

**Test với Lambda container (Docker):**
```bash
docker build -f services/cv-enhancer/Dockerfile.lambda -t radiance-backend .
docker run -p 9000:8080 --env-file services/cv-enhancer/.env radiance-backend
```

---

## 6. LLMOps

### 6.1 Tổng quan LLMOps

Radiance có một hệ thống **offline evaluation** riêng biệt tại `eval/cv-enhancer-deepeval/` để đánh giá chất lượng AI pipeline trước khi deploy thay đổi prompt hoặc model.

### 6.2 Evaluation Stack

| Công nghệ | Vai trò |
|-----------|---------|
| **DeepEval** | Evaluation framework với nhiều metrics sẵn có |
| **LangGraph** | Replicate production pipeline trong eval context |
| **google-genai** | Gemini SDK trực tiếp (tránh issue `max_retries` của langchain-google-genai) |
| **Docker Compose** | Reproducible eval environment |
| **YAML fixtures** | Test cases (sample CV + JD pairs) |

**Judge model:** Configurable qua `DEEPEVAL_JUDGE_MODEL` (e.g. `gemma-3-27b`) — tách biệt với production model.

### 6.3 Eval Suite Structure

```
eval/cv-enhancer-deepeval/
├── cv_pipeline.py          # LangGraph pipeline replica (google-genai trực tiếp)
├── prompts_snapshot.py     # Snapshot của production prompts (kept in sync)
├── schemas.py              # Pydantic schemas (mirror production)
├── eval_test.py            # Evaluation entry point
├── eval_judge_gemini.py    # DeepEval judge config với Gemini
├── test_cases/             # YAML fixtures: sample CV + JD + expected output
├── Dockerfile              # Eval image
├── docker-compose.yml      # Reproducible eval environment
└── .env.example            # GOOGLE_API_KEY, GEMINI_MODEL, DEEPEVAL_JUDGE_MODEL
```

### 6.4 Evaluation Metrics

DeepEval metrics được áp dụng để đánh giá:

- **Faithfulness** — Output có trung thực với CV gốc không (chống hallucination)?
- **Answer Relevancy** — Enhancement có phù hợp với JD requirement không?
- **Contextual Precision / Recall** — Skill gap detection có chính xác không?

### 6.5 Chạy Evaluation

```bash
cd eval/cv-enhancer-deepeval
cp .env.example .env
# Điền GOOGLE_API_KEY, GEMINI_MODEL, DEEPEVAL_JUDGE_MODEL

pip install -r requirements.txt
python eval_test.py

# Hoặc dùng Docker Compose
docker-compose up
```

### 6.6 Prompt Versioning Strategy

**`prompts_snapshot.py`** là file quan trọng nhất trong eval suite — nó giữ một bản snapshot của production prompts (`ANALYZER_SYSTEM_PROMPT`, `ENHANCER_SYSTEM_PROMPT`, etc.) và được **kept in sync manually** với `services/cv-enhancer/src/core/prompts/`.

**Workflow khi thay đổi prompt:**

```
1. Thay đổi prompt trong services/cv-enhancer/src/core/prompts/
2. Update prompts_snapshot.py với nội dung mới
3. Chạy eval suite: python eval_test.py
4. So sánh metrics với baseline
5. Nếu metrics không bị regression → merge + deploy
```

### 6.7 Key Engineering Decisions trong AI Pipeline

#### Decision 1: pdfplumber thay vì Docling

| | Docling (IBM) | pdfplumber |
|--|--------------|------------|
| PDF layout understanding | Tốt hơn | Đủ dùng |
| Dependencies | `torch`, `transformers`, ML models | Pure Python |
| Docker image size | ~2GB | ~600MB |
| Lambda cold start | 20–30s | 3–8s |

**Bài học:** Không dùng ML tool để pre-process cho ML model khác nếu model chính đủ mạnh để handle noisy input.

#### Decision 2: HTML/CSS (WeasyPrint) thay vì LaTeX

**Vấn đề với LaTeX:** LLM generate LaTeX có syntax error ở ~15–30% requests (unescaped `&`, `%`, Vietnamese Unicode, unclosed `\begin{itemize}`).

**Solution với WeasyPrint:**

| | LaTeX | Jinja2 + WeasyPrint |
|--|-------|---------------------|
| LLM output format | LaTeX DSL (error-prone) | Structured JSON (clean) |
| Unicode/Vietnamese | Cần extra packages | Native support |
| Browser preview | Không thể | Trực tiếp render |
| Debug | Khó (LaTeX compiler errors) | Dễ (HTML/CSS) |

#### Decision 3: 2-Node LangGraph thay vì 1 Mega-Prompt

| | 1 Mega Prompt | 2-Node Pipeline |
|--|-------------|-----------------|
| Instruction following | LLM "forgets" đầu prompt khi output dài | Mỗi node context ngắn, focused |
| Debug | Không biết phần nào sai | Isolate: Analyzer sai hay Enhancer sai |
| Output quality | Mixed | Mỗi task được tối ưu riêng |

#### Decision 4: SQS thay vì WebSocket/Step Functions

**Vấn đề:** API Gateway hard timeout 29 giây, LLM pipeline cần 20–45 giây.

| Option | Vấn đề |
|--------|--------|
| WebSocket | Lambda stateless, không giữ connection. API Gateway WebSocket tốn kém + phức tạp |
| Step Functions | Overkill cho pipeline 2 bước. Thêm cost và complexity |
| EventBridge | Không có built-in retry cho Lambda failures |
| **SQS** ✅ | Native retry, visibility timeout, serverless, $0.40/million messages |

**Fault-tolerance:** Nếu Lambda crash giữa chừng, SQS tự re-deliver message sau `visibility_timeout` (330s). Pipeline là **idempotent** theo `job_id` → safe to retry.

### 6.8 Error Handling trong AI Pipeline

```
Luồng xử lý lỗi:
├── Gemini API lỗi (rate limit, 503) → Lambda throw → SQS retry tự động
├── Pydantic validation fail (LLM output không conform schema) → FAILED status
├── PDF parse error (invalid/corrupt PDF) → FAILED status
└── S3/DynamoDB timeout → Lambda throw → SQS retry tự động
```

**Graceful degradation pattern:**
```python
async def execute(self, job_id, s3_key, jd_text):
    try:
        await repo.update(job_id, status="PROCESSING")
        # ... pipeline ...
        await repo.update(job_id, status="COMPLETED", result=result)
    except Exception as exc:
        await repo.update(job_id, status="FAILED", error=str(exc))
        raise  # Re-raise để SQS retry (nếu là transient error)
```

`raise` sau `FAILED` update đảm bảo SQS vẫn retry — hữu ích nếu failure là transient (rate limit). DLQ (Dead Letter Queue) nên được cấu hình cho permanent failures.

---

## Tài liệu liên quan

| Document | Mô tả |
|----------|-------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | AWS data flow, DynamoDB schema, SQS design, ECR rationale, Lambda dual-mode handler |
| [AI_WORKFLOW.md](AI_WORKFLOW.md) | LangGraph nodes, prompt design chi tiết, STAR methodology, model selection |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Terraform resources, CI/CD pipeline chi tiết, IAM, CloudWatch, secrets management |
| [TESTING_GUIDE_RUN.md](TESTING_GUIDE_RUN.md) | Hướng dẫn chạy tests local và với Docker |
| [eval/cv-enhancer-deepeval/README.md](../eval/cv-enhancer-deepeval/README.md) | Eval suite documentation |
