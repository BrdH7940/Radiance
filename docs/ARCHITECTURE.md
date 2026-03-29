# Architecture — AWS Backend Deep Dive

> Tài liệu này dành cho Senior Engineer muốn hiểu sâu về từng quyết định kỹ thuật trong hệ thống Radiance backend.

---

## Table of Contents

1. [Data Flow — End-to-End](#1-data-flow--end-to-end)
2. [SQS — Tại sao Event-Driven là bắt buộc](#2-sqs--tại-sao-event-driven-là-bắt-buộc)
3. [DynamoDB — Schema Design](#3-dynamodb--schema-design)
4. [ECR — Tại sao Container Image thay vì Lambda Zip](#4-ecr--tại-sao-container-image-thay-vì-lambda-zip)
5. [S3 — Presigned URL Pattern](#5-s3--presigned-url-pattern)
6. [Lambda — Dual-Mode Handler](#6-lambda--dual-mode-handler)
7. [API Gateway — HTTP API vs REST API](#7-api-gateway--http-api-vs-rest-api)
8. [Dependency Injection trong Lambda](#8-dependency-injection-trong-lambda)

---

## 1. Data Flow — End-to-End

### Phase 1: Upload

```
Browser
  │
  ├─[1]─► POST /api/v1/resumes/upload-urls
  │          Lambda → S3.generate_presigned_url(method="PUT")
  │          ← { upload_url, s3_key }
  │
  └─[2]─► PUT {upload_url}  (trực tiếp đến S3, KHÔNG qua API Gateway)
              Content-Type: application/pdf
              ← 200 OK (S3 response)
```

**Tại sao upload trực tiếp lên S3?**

- API Gateway giới hạn request body size **10MB** đối với payload qua Lambda
- S3 Presigned URL cho phép upload **tối đa 5TB** một file
- Giảm tải bandwidth cho Lambda — Lambda chỉ sinh URL, không xử lý binary data
- Presigned URL có TTL `900s` (15 phút) — đủ để user chọn file và upload

### Phase 2: Trigger Analysis (Async)

```
Browser
  │
  ├─[3]─► POST /api/v1/analyses  { s3_key, jd_text }
  │          Lambda:
  │            1. Tạo AnalysisJob {id: uuid, status: PENDING, ...}
  │            2. DynamoDB.put_item(job)
  │            3. SQS.send_message({job_id, s3_key, jd_text})
  │          ← { id: job_id }  (trả về trong ~100ms)
  │
  └─[4]─► Polling: GET /api/v1/analyses/{id}  (mỗi 2 giây)
              Lambda → DynamoDB.query(UserId, FilterExpression: id = job_id)
              ← { status: PENDING | PROCESSING | COMPLETED | FAILED, ... }
```

### Phase 3: Background Worker

```
SQS message → Lambda (Event Source Mapping)
  │
  ├─[5]─ Download s3_key → in-memory bytes
  ├─[6]─ pdfplumber: extract text từ PDF
  ├─[7]─ LangGraph:
  │         Node 1 (Analyzer): CV text + JD → score, gaps, red_flags
  │         Node 2 (Enhancer): All above → CVResumeSchema (JSON)
  ├─[8]─ Jinja2 template → HTML → WeasyPrint → PDF bytes
  ├─[9]─ S3.put_object(enhanced-pdf/{job_id}.pdf)
  │         S3.generate_presigned_url(method="GET", expiration=3600s)
  └─[10]─ DynamoDB.update_item(status=COMPLETED, result=..., pdf_url=...)
```

### Phase 4: Workspace

```
Browser (sau khi polling thấy COMPLETED)
  │
  ├─── Tải CVResumeSchema (JSON) vào CVFormBuilder (Zustand store)
  ├─── User chỉnh sửa từng field trực tiếp
  │
  ├─[11]─► POST /api/v1/editor/refinements { selected_text, prompt }
  │           Gemini inline: "Refine this bullet using STAR method"
  │           ← { new_text }
  │
  └─[12]─► POST /api/v1/editor/renders { cv_data }
               WeasyPrint → PDF → S3.put → presigned_url
               ← { pdf_url }  (iframe src trong CVPreview)
```

---

## 2. SQS — Tại sao Event-Driven là bắt buộc

### Vấn đề: API Gateway Timeout Cứng 29 Giây

AWS API Gateway (HTTP API) có hard limit **29 giây** cho response. Lambda timeout có thể set đến **15 phút**, nhưng API Gateway sẽ ngắt connection và trả về `504 Gateway Timeout` sau 29s — dù Lambda vẫn đang chạy.

LLM pipeline của Radiance (Analyzer + Enhancer qua Gemini 2.5 Flash) thực tế mất **20–45 giây** tùy độ dài CV và JD. Synchronous call sẽ **100% fail ở production**.

### Solution: Decoupling với SQS

```
┌────────────────────────────────────────────────────────┐
│                   SQS Configuration                    │
│                                                        │
│  Queue name:         radiance-analysis-queue           │
│  Type:               Standard (not FIFO)               │
│  Visibility timeout: 330 seconds                       │
│  Message retention:  3600 seconds (1 hour)             │
│  Max message size:   256 KB                            │
│  Encryption:         SSE (SQS-managed keys)            │
└────────────────────────────────────────────────────────┘
```

**Tại sao `visibility_timeout = 330s` (không phải 300s)?**

Lambda timeout được set **300 giây**. SQS visibility timeout phải **lớn hơn** Lambda timeout để tránh tình huống:
1. Lambda đang xử lý, chưa xong
2. Visibility timeout hết → SQS nghĩ message chưa được xử lý
3. SQS re-deliver message → Lambda khác nhận cùng một job → race condition

Công thức: `visibility_timeout > lambda_timeout + buffer` → **330s = 300s + 30s buffer**.

### Retry Mechanism tự động

Khi Lambda throw exception (Gemini API rate limit, S3 timeout, network lỗi):

```
Lambda raises Exception
    → SQS: message trở về queue sau visibility_timeout
    → SQS re-delivers message đến Lambda instance tiếp theo
    → Lambda thử lại từ đầu
```

**Idempotency:** Pipeline an toàn khi retry vì:
- `job_id` là UUID cố định — DynamoDB update là idempotent
- S3 object overwrite là idempotent
- Gemini API call là stateless — kết quả có thể khác nhau giữa các lần retry (acceptable)

### SQS vs Alternatives

| Option | Vấn đề |
|--------|--------|
| WebSocket | Lambda stateless, không giữ connection. Cần API Gateway WebSocket ($$$) + connection management phức tạp |
| Step Functions | Overkill cho pipeline đơn giản. Thêm cost và complexity không cần thiết |
| EventBridge | Không có built-in retry cho Lambda processing failures |
| **SQS** ✅ | Native retry, dead-letter queue, visibility timeout, serverless, cheap |

### Message Schema

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "s3_key": "raw-pdf/550e8400-e29b-41d4-a716-446655440000.pdf",
  "jd_text": "We are looking for a Senior Software Engineer..."
}
```

JD text được embed trực tiếp vào message (không lưu S3 riêng) vì:
- JD text thường < 5KB — nằm thoải mái trong 256KB SQS limit
- Tránh thêm S3 read operation trong worker

---

## 3. DynamoDB — Schema Design

### Table Definition

```
Table name:    UserProfiles
Billing mode:  PAY_PER_REQUEST (On-Demand)
Partition key: UserId (String)
Sort key:      None (partition-only)

GSI:
  Name:         EmailIndex
  Partition key: Email (String)
  Projection:   ALL
```

### Item Structure (AnalysisJob)

Mỗi analysis job được lưu dưới dạng một DynamoDB item:

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
      { "name": "Kubernetes", "severity": "critical", "description": "..." },
      { "name": "Go", "severity": "recommended", "description": "..." }
    ],
    "red_flags": [
      { "title": "Unquantified Impact", "description": "...", "severity": "high" }
    ],
    "cv_data": { "...CVResumeSchema..." }
  },
  "pdf_url": "https://s3.amazonaws.com/...presigned..."
}
```

### Query Pattern: Partition-Only Table

Vì table chỉ có partition key (`UserId`), không có sort key, không thể dùng `GetItem` với `(UserId, job_id)`. Repository sử dụng:

```python
# DynamoJobRepository.get()
table.query(
    KeyConditionExpression=Key("UserId").eq(self._user_id),
    FilterExpression=Attr("id").eq(job_id)
)
```

`FilterExpression` trên non-key attribute được áp dụng **sau** khi DynamoDB đã read tất cả items của user đó — không efficient với nhiều jobs per user. Đây là trade-off chấp nhận được ở MVP vì:
- Số jobs per user nhỏ (< 100)
- On-demand billing nên không lãng phí provisioned capacity

**Production optimization:** Thêm `JobId` làm sort key, chuyển sang `GetItem(UserId, JobId)` — O(1) read.

### Tại sao DynamoDB thay vì RDS?

| | DynamoDB | RDS (PostgreSQL) |
|--|---------|-----------------|
| Cold start | Không có cold start | Không có cold start |
| Connection pooling | Không cần (HTTP-based) | Cần (Lambda → RDS connection storm) |
| Scaling | Auto, vô giới hạn | Cần provision |
| Schema | Flexible (JSON) | Cần migration |
| Cost | PAY_PER_REQUEST | Minimum ~$15/month |

Lambda + RDS gây ra **connection storm** khi scaling — mỗi Lambda instance mở connection mới. RDS Proxy giải quyết được nhưng thêm cost và complexity. DynamoDB serverless phù hợp hơn với Lambda.

---

## 4. ECR — Tại sao Container Image thay vì Lambda Zip

### Lambda Package Size Limits

| Package type | Size limit |
|-------------|-----------|
| .zip (deploy) | 50 MB compressed |
| .zip (unzipped) | 250 MB |
| Container Image | **10 GB** |

Backend của Radiance sử dụng:

```
FastAPI + Mangum        ~5 MB
LangChain + LangGraph   ~80 MB
langchain-google-genai  ~15 MB
WeasyPrint + Pango/Cairo ~100 MB (shared libs)
pdfplumber              ~10 MB
boto3 + pydantic        ~30 MB
─────────────────────────────
Total (unzipped):       ~240 MB  →  vượt 250MB limit nếu thêm bất kỳ dep nào
```

WeasyPrint cần **Pango, Cairo, gdk-pixbuf2, harfbuzz, fontconfig** — các native shared libraries phải cài vào OS, không thể bundle vào .zip Lambda layer. Container Image là giải pháp duy nhất khả thi.

### Dockerfile Strategy

```dockerfile
# Base: AWS Lambda Python 3.12 (Amazon Linux 2023)
FROM public.ecr.aws/lambda/python:3.12

# Install native shared libs cho WeasyPrint
RUN dnf install -y pango cairo gdk-pixbuf2 libffi harfbuzz \
    fontconfig dejavu-sans-fonts dejavu-serif-fonts && dnf clean all

# Python dependencies (dùng --prefer-binary để tránh compile từ source)
COPY services/cv-enhancer/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --prefer-binary -r /tmp/requirements.txt

# Smoke test WeasyPrint ngay khi build (fail fast nếu thiếu lib)
RUN python -c "from weasyprint import HTML; HTML(string='<h1>ok</h1>').write_pdf('/tmp/smoke.pdf')"

# App source
COPY services/cv-enhancer/src/ /var/task/
CMD ["main.handler"]
```

**Key decisions:**
- `dnf` thay `yum` — Amazon Linux 2023 dùng dnf
- `--prefer-binary` — tránh compile C extensions từ source trong CI (nhanh hơn)
- Smoke test WeasyPrint trong `RUN` — catch thiếu shared lib ngay lúc build, không phải lúc Lambda cold start

### ECR Repository

```
Name:       radiance-backend-image
Tag format: {git_sha} + latest
Scan:       On push (AWS ECR image scanning)
Encryption: AES256
```

Mỗi deployment tag bằng `${github.sha}` — rollback bằng cách chỉnh `image_uri` trong Lambda.

---

## 5. S3 — Presigned URL Pattern

### Hai S3 Buckets

| Bucket | Purpose | Access |
|--------|---------|--------|
| `radiance-frontend-{id}` | Host Next.js static export | Public (via CloudFront OAC) |
| `radiance-frontend-{cv-id}` | Store raw + enhanced PDFs | Private (presigned URLs only) |

### CV Storage Prefix Structure

```
s3://radiance-frontend-{cv-id}/
├── raw-pdf/
│   └── {job_id}.pdf          ← user uploads here via presigned PUT
└── enhanced-pdf/
    └── {job_id}.pdf          ← Lambda uploads here after processing
```

### Presigned URL Security

- **Upload (PUT):** TTL = 900s (15 phút). Chỉ cho phép upload đúng `job_id` prefix.
- **Download (GET):** TTL = 3600s (1 giờ). URL được lưu trong DynamoDB item và trả về khi polling.
- Bucket không có public access — mọi access đều qua presigned URL.

---

## 6. Lambda — Dual-Mode Handler

Cùng một Lambda function phục vụ hai loại event hoàn toàn khác nhau:

```python
def handler(event, context):
    # SQS event: {"Records": [...]}
    if isinstance(event, dict) and "Records" in event:
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(process_sqs_records(event))

    # HTTP event: API Gateway payload format
    return mangum_handler(event, context)
```

**Tại sao dùng chung một Lambda?**

- Giảm số Lambda function cần quản lý và monitor
- Shared codebase — bug fix một chỗ ảnh hưởng cả hai path
- Shared cold start warming — nếu HTTP requests warm instance, SQS processing hưởng lợi

**Trade-off:** Nếu HTTP traffic cao và SQS backlog lớn cùng lúc, Lambda concurrency bị chia sẻ. Giải quyết bằng `reserved_concurrent_executions` riêng cho SQS Event Source Mapping trong production.

### Mangum — ASGI to Lambda Bridge

`Mangum` chuyển đổi Lambda event (API Gateway v2 format) sang ASGI `scope`/`receive`/`send` mà FastAPI hiểu. `lifespan="on"` đảm bảo FastAPI `lifespan` context manager (warm-up singletons) được gọi khi Lambda cold start.

---

## 7. API Gateway — HTTP API vs REST API

Radiance dùng **HTTP API (v2)**, không phải REST API (v1):

| | HTTP API | REST API |
|--|---------|---------|
| Latency | ~1ms overhead | ~6ms overhead |
| Cost | $1/million | $3.5/million |
| Features | Routing, CORS, JWT auth | Full AWS integration |
| Timeout | **29 giây** | **29 giây** |

CORS được cấu hình tại API Gateway level (không cần middleware trong FastAPI — FastAPI CORS middleware là backup cho local dev):

```hcl
cors_configuration {
  allow_headers = ["content-type"]
  allow_methods = ["GET", "OPTIONS", "POST", "PUT"]
  allow_origins = ["https://{cloudfront-id}.cloudfront.net"]
}
```

---

## 8. Dependency Injection trong Lambda

### Vấn đề: Cold Start Cost

Lambda cold start: container boot + Python interpreter + import all modules + khởi tạo objects. Với image 600MB, cold start có thể mất **3–8 giây**. Khởi tạo GeminiLLMAdapter (compile LangGraph graph) và WeasyPrintPDFAdapter (load Jinja2 templates) mỗi request sẽ thêm **1–2 giây** mỗi lần.

### Solution: `@lru_cache` Singleton Pattern

```python
@lru_cache(maxsize=1)
def get_llm_service() -> ILLMService:
    """Singleton — LangGraph graph compiled once, reused across requests."""
    settings = get_settings()
    return GeminiLLMAdapter(api_key=settings.google_api_key, model=settings.gemini_model)
```

`lru_cache(maxsize=1)` trên module-level functions đảm bảo:
- Mỗi singleton được khởi tạo **đúng một lần** per Lambda instance (warm container)
- Subsequent requests trong cùng warm instance reuse object đã khởi tạo
- **Testable:** `get_llm_service.cache_clear()` trong tests reset singleton

### Dependency Graph

```
AppSettings (lru_cache)
  ├── S3StorageAdapter
  ├── PDFPlumberParser
  ├── GeminiLLMAdapter ← LangGraph compiled graph
  ├── DynamoJobRepository ← boto3 DynamoDB client
  ├── SQSService ← boto3 SQS client
  ├── WeasyPrintPDFAdapter ← Jinja2 Environment
  ├── EditorAIGeminiAdapter ← Gemini ChatModel
  └── AnalyzeCVUseCase ← injects all above
```

Toàn bộ graph được wire trong `container.py` bằng pure functions — không cần framework DI như `dependency-injector`. Đơn giản, predictable, dễ test.
