# CV-Enhancer Backend — Technical Documentation

## 1. Tổng quan

**CV-Enhancer** là microservice FastAPI thuộc Radiance Career Assistant. Service xử lý:

- **Phân tích CV** so với Job Description (JD) bằng AI (LangGraph + Gemini)
- **Điểm khớp ATS** (0–100), skill gaps và red flags
- **Tạo CV có cấu trúc** (`CVResumeSchema` — JSON) từ LLM, sau đó **render PDF** (HTML + WeasyPrint) và lưu trên **S3**
- **Editor**: tinh chỉnh từng đoạn plain text bằng AI; render lại PDF từ JSON

### Luồng xử lý tổng quan (production / AWS)

```
Frontend → presigned S3 upload → POST /analyses
         → job lưu DynamoDB + message gửi SQS
         → Lambda (SQS) chạy AnalyzeCVUseCase
         → Poll GET /analyses/{id} → result (enhanced_cv_json, pdf_url)
```

Chi tiết từng AWS service: [CV_ENHANCER_AWS_SERVICES_USAGE.md](./CV_ENHANCER_AWS_SERVICES_USAGE.md). Hướng dẫn provision: [CV_ENHANCER_AWS_SETUP.md](./CV_ENHANCER_AWS_SETUP.md).

---

## 2. Kiến trúc

### 2.1 Hexagonal (Ports & Adapters)

```
services/cv-enhancer/src/
├── main.py                 # FastAPI, CORS, health; Lambda handler (Mangum + SQS)
├── config.py               # Pydantic settings (env)
├── container.py            # DI singletons
├── domain/
│   ├── models.py           # SkillGap
│   └── ports.py            # IDocumentParser, IStorageService
├── core/
│   ├── domain/
│   │   ├── analysis_job.py    # AnalysisJob, AnalysisResult, JobStatus, RedFlag
│   │   └── cv_resume_schema.py
│   ├── ports/
│   │   ├── llm_port.py
│   │   ├── job_repository_port.py
│   │   ├── editor_ai_port.py
│   │   └── pdf_render_port.py    # IPDFRenderService (WeasyPrint)
│   ├── prompts/
│   │   └── cv_analysis_prompt.py
│   └── use_cases/
│       └── analyze_cv_use_case.py
├── infrastructure/
│   ├── adapters/
│   │   ├── gemini_llm_adapter.py
│   │   ├── editor_ai_gemini_adapter.py
│   │   ├── dynamo_job_repository.py   # DynamoDB
│   │   ├── sqs_service.py             # Producer SQS
│   │   ├── weasyprint_pdf_adapter.py
│   │   ├── in_memory_job_repository.py  # chủ yếu cho test
│   │   └── latex_compiler_adapter.py    # legacy, không gắn trong container hiện tại
│   ├── parsers/
│   │   └── pdfplumber_adapter.py
│   ├── storage/
│   │   └── s3_storage.py
│   └── templates/
│       ├── cv_template.html    # Jinja2 + WeasyPrint
│       └── resume_template.tex # legacy LaTeX (nếu dùng lại compiler cũ)
└── presentation/
    ├── resumes.py
    ├── analyses.py
    └── editor.py
```

### 2.2 Dependency graph (container)

```
AppSettings
  ├─ S3StorageAdapter          (IStorageService)
  ├─ PDFPlumberParser        (IDocumentParser)
  ├─ GeminiLLMAdapter         (ILLMService)
  ├─ DynamoJobRepository     (IJobRepository)
  ├─ SQSService              (enqueue job — bắt buộc khi deploy đầy đủ)
  ├─ WeasyPrintPDFAdapter    (IPDFRenderService)
  ├─ EditorAIGeminiAdapter   (IEditorAIService)
  └─ AnalyzeCVUseCase
```

---

## 3. AWS — vai trò trong backend

| Service | Vai trò |
| -------- | ------- |
| **S3** | Presigned PUT cho CV gốc (`raw-pdf/`); download PDF phân tích; upload PDF enhanced; presigned GET trả về `pdf_url`. |
| **SQS** | `POST /api/v1/analyses` tạo job trong DynamoDB rồi `send_message` với `{ job_id, s3_key, jd_text }`. Worker không chạy trong cùng process HTTP (trừ khi test đặc biệt). |
| **DynamoDB** | Lưu `AnalysisJob` (trạng thái poll). Partition key theo `ANALYSIS_USER_ID` + sort key tùy bảng (adapter đọc schema qua `DescribeTable` khi có quyền). |
| **Lambda** | Entry `handler` trong `main.py`: event có `Records` → xử lý SQS và gọi `AnalyzeCVUseCase.execute`; ngược lại → **Mangum** phục vụ HTTP (API Gateway / Function URL). |

File `Dockerfile.lambda` và test `tests/test_main_lambda_sqs.py` minh họa triển khai Lambda.

---

## 4. Domain models

### 4.1 Shared (`domain/models.py`)

| Class | Mô tả |
| ----- | ----- |
| **SkillGap** | Kỹ năng trong JD nhưng thiếu/yếu trong CV — `skill`, `importance` |

### 4.2 Analysis job (`core/domain/analysis_job.py`)

| Class | Mô tả |
| ----- | ----- |
| **JobStatus** | `queued` → `processing` → `completed` \| `failed` |
| **RedFlag** | `title`, `description`, `severity` |
| **AnalysisResult** | `matching_score`, `missing_skills`, `red_flags`, **`enhanced_cv_json`** (`CVResumeSchema`), `pdf_url` |
| **AnalysisJob** | `id`, `status`, `s3_key`, `jd_text`, `result`, `error`, timestamps |

### 4.3 CV schema (`core/domain/cv_resume_schema.py`)

**CVResumeSchema** — JSON thống nhất cho LLM output, editor API và render PDF.

---

## 5. Ports (rút gọn)

| Port | Nhiệm vụ chính |
| ---- | ---------------- |
| **IDocumentParser** | `parse_pdf(path) -> str` (text từ PDF) |
| **IStorageService** | Presigned upload/download, `download_object`, `upload_file` |
| **ILLMService** | `analyze_and_enhance` → score, gaps, flags, `enhanced_cv_json` |
| **IJobRepository** | `save` / `get` / `update` |
| **IEditorAIService** | `refine(selected_text, prompt) -> str` (plain text) |
| **IPDFRenderService** | `render_to_pdf(cv_data, output_dir) -> path` |

---

## 6. Use case: AnalyzeCVUseCase

Pipeline **7 bước** (được gọi từ **Lambda SQS worker** hoặc test):

1. Đánh dấu job `processing` trong DynamoDB.
2. Download PDF từ S3 → thư mục tạm.
3. Parse PDF bằng **pdfplumber** → text.
4. LLM (Analyzer → Enhancer) → `enhanced_cv_json` + metadata.
5. Render JSON → HTML (Jinja2) → PDF (**WeasyPrint**).
6. Upload PDF lên S3 (`enhanced-pdf/`).
7. Presigned download URL → lưu `AnalysisResult`, `completed`.

Lỗi ở bước 2–7 → job `failed` với `error` lưu trong DynamoDB.

---

## 7. API endpoints

### 7.1 Health

`GET /health` → `{ "status": "healthy", "service": "cv-enhancer", "version": "2.0.0" }`

### 7.2 `POST /api/v1/resumes/upload-urls`

Body: `{ "file_name", "content_type" }` → presigned PUT, `s3_key`, `bucket`.

### 7.3 `POST /api/v1/analyses`

- Tạo job, **lưu DynamoDB**, **gửi SQS** (không dùng `BackgroundTasks` của FastAPI cho bước phân tích chính).
- Response **202**: `{ "id", "status": "queued" }`.

### 7.4 `GET /api/v1/analyses/{job_id}`

- `completed`: `result` gồm `matching_score`, `missing_skills`, `red_flags`, **`enhanced_cv_json`** (object), `pdf_url`.
- Không còn trường `latex_code` trong response chuẩn hiện tại.

### 7.5 `POST /api/v1/editor/refinements`

`{ "selected_text", "prompt" }` → `{ "new_text" }` (Gemini, plain text).

### 7.6 `POST /api/v1/editor/renders`

Body: `{ "cv_data": <CVResumeSchema> }` — **không** nhận chuỗi LaTeX.

→ Upload PDF lên S3, `{ "pdf_url", "success", "error?" }`.

---

## 8. Biến môi trường

| Biến | Ghi chú |
| ---- | -------- |
| `GOOGLE_API_KEY` | Bắt buộc |
| `GEMINI_MODEL` | Mặc định `gemini-1.5-flash` |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Credentials |
| `AWS_SESSION_TOKEN` | Tuỳ chọn |
| `AWS_S3_BUCKET`, `AWS_S3_RAW_PREFIX`, `AWS_S3_ENHANCED_PREFIX` | S3 |
| `AWS_S3_PRESIGNED_*_SECONDS` | TTL presigned |
| `DYNAMODB_ANALYSIS_TABLE_NAME` | Bắt buộc |
| `DYNAMODB_ENDPOINT_URL` | LocalStack / dev |
| `ANALYSIS_USER_ID` | Partition user cho Dynamo (mặc định `local`) |
| `SQS_QUEUE_URL` | **Bắt buộc** trong `config` hiện tại |
| `SQS_ENDPOINT_URL` | LocalStack / dev |
| `PORT` | Local uvicorn (mặc định 8000) |

---

## 9. Dependencies (Python)

Tiêu biểu: `fastapi`, `uvicorn`, `pydantic-settings`, `boto3`, `pdfplumber`, `langchain-google-genai`, `langgraph`, `jinja2`, `weasyprint`, `Mangum` (Lambda ASGI).

Không còn **docling** trong `requirements.txt` hiện tại. PDF chính thức: **pdfplumber** + **WeasyPrint** (trên Lambda cần image/layer phù hợp thư viện hệ thống — xem comment trong `requirements.txt` về WeasyPrint và Amazon Linux 2).

---

## 10. LLM pipeline (GeminiLLMAdapter)

- **Analyzer**: score, `missing_skills`, `red_flags`.
- **Enhancer**: sinh **`CVResumeSchema`** (structured output).

Prompts: `core/prompts/cv_analysis_prompt.py`.

---

## 11. PDF

- **Chính**: `WeasyPrintPDFAdapter` — Jinja2 `cv_template.html` → WeasyPrint → PDF bytes.
- **Legacy**: `latex_compiler_adapter.py` / `resume_template.tex` có trong repo nhưng **không** được wire trong `container.py` cho pipeline phân tích hiện tại.

---

## 12. Chạy local

```bash
cd services/cv-enhancer
# Đặt đủ biến env (AWS, Gemini, DynamoDB, SQS hoặc mock/local endpoints)
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir src
```

Lưu ý: **phân tích end-to-end** cần worker tiêu thụ SQS (Lambda hoặc tiến trình gọi `AnalyzeCVUseCase` với message tương tự). Chỉ chạy API local không tự xử lý queue trừ khi bạn mô phỏng consumer.

---

## 13. Dependency injection

Singleton `@lru_cache` trong `container.py`; lifespan warm-up trong `main.py`.

---

## 14. Ghi chú vận hành

- **CORS**: hiện `allow_origins=["*"]` — production nên thu hẹp.
- **Bảo mật AWS**: ưu tiên IAM role trên Lambda thay vì long-lived keys khi deploy.
