# CV-Enhancer Backend — Technical Documentation

## 1. Tổng quan

**CV-Enhancer** là microservice FastAPI độc lập thuộc hệ sinh thái Radiance Career Assistant. Service xử lý:

- **Phân tích CV** so với Job Description (JD) bằng AI (LangGraph + Gemini 1.5 Flash)
- **Tính điểm khớp ATS** (0–100), xác định skill gaps và red flags
- **Viết lại CV** theo phương pháp STAR (Situation → Task → Action → Result)
- **Chuyển đổi Markdown → LaTeX → PDF** và lưu trữ trên S3
- **Editor workspace**: tinh chỉnh LaTeX bằng AI và render PDF

### Luồng xử lý tổng quan

```
Frontend → Upload CV (presigned S3) → POST /analyses → Background pipeline
         → Poll GET /analyses/{id} → Nhận result (score, gaps, LaTeX, PDF URL)
         → Editor: refine LaTeX / render PDF
```

---

## 2. Kiến trúc

### 2.1 Hexagonal Architecture (Ports & Adapters)

Service sử dụng kiến trúc hexagonal với tách biệt rõ ràng giữa domain, use cases và infrastructure:

```
services/cv-enhancer/src/
├── main.py                    # FastAPI entry point, lifespan, CORS
├── config.py                  # Pydantic settings (env vars)
├── container.py               # DI container (singleton providers)
├── domain/                    # Shared domain models & ports
│   ├── models.py              # SkillGap (shared)
│   └── ports.py               # IDocumentParser, IStorageService
├── core/                      # Use cases, ports, prompts
│   ├── domain/
│   │   └── analysis_job.py    # AnalysisJob, AnalysisResult, JobStatus, RedFlag
│   ├── ports/                 # Outbound ports for analysis pipeline
│   │   ├── llm_port.py        # ILLMService
│   │   ├── job_repository_port.py
│   │   ├── editor_ai_port.py
│   │   └── latex_compiler_port.py
│   ├── prompts/
│   │   └── cv_analysis_prompt.py
│   └── use_cases/
│       └── analyze_cv_use_case.py
├── infrastructure/            # Adapters (implementations)
│   ├── adapters/
│   │   ├── gemini_llm_adapter.py
│   │   ├── editor_ai_gemini_adapter.py
│   │   ├── in_memory_job_repository.py
│   │   └── latex_compiler_adapter.py
│   ├── parsers/
│   │   └── docling_adapter.py
│   ├── storage/
│   │   └── s3_storage.py
│   └── templates/
│       └── resume_template.tex
└── presentation/              # HTTP layer (FastAPI routers)
    ├── resumes.py
    ├── analyses.py
    └── editor.py
```

### 2.2 Dependency Graph

```
AppSettings (config.py)
  ├─ S3StorageAdapter      (IStorageService)
  ├─ DoclingParser         (IDocumentParser)
  ├─ GeminiLLMAdapter      (ILLMService)
  ├─ InMemoryJobRepository (IJobRepository)
  ├─ LocalLaTeXCompiler    (ILaTeXCompilerService)
  └─ AnalyzeCVUseCase       ← consumes storage, parser, llm, job_repo, latex_compiler
```

---

## 3. Domain Models

### 3.1 Shared Domain (`domain/models.py`)

| Class | Mô tả |
|-------|-------|
| **SkillGap** | Kỹ năng/qualification có trong JD nhưng thiếu hoặc yếu trong CV |
| | `skill: str` — Tên cụ thể của kỹ năng |
| | `importance: "critical" \| "recommended" \| "nice-to-have"` |

### 3.2 Analysis Job Domain (`core/domain/analysis_job.py`)

| Class | Mô tả |
|-------|-------|
| **JobStatus** | Enum: `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED` |
| **RedFlag** | Vấn đề cấu trúc/nội dung CV |
| | `title: str`, `description: str`, `severity: "low" \| "medium" \| "high"` |
| **AnalysisResult** | Kết quả khi job hoàn thành |
| | `matching_score`, `missing_skills`, `red_flags`, `latex_code`, `pdf_url` |
| **AnalysisJob** | Trạng thái job: `id`, `status`, `s3_key`, `jd_text`, `result`, `error`, timestamps |

---

## 4. Ports (Interfaces)

### 4.1 Domain Ports (`domain/ports.py`)

| Port | Method | Mô tả |
|------|--------|-------|
| **IDocumentParser** | `parse_pdf(file_path) -> str` | PDF → Markdown/plain text |
| **IStorageService** | `generate_presigned_upload_url(object_key, content_type) -> str` | Presigned PUT URL |
| | `download_object(object_key, local_path) -> None` | Download object về local |
| | `upload_file(local_path, object_key, content_type) -> str` | Upload file lên storage |
| | `generate_presigned_download_url(object_key) -> str` | Presigned GET URL |

### 4.2 Core Ports (`core/ports/`)

| Port | Method | Mô tả |
|------|--------|-------|
| **ILLMService** | `analyze_and_enhance(cv_text, jd_text) -> FullAnalysisOutput` | Phân tích + enhance CV |
| **IJobRepository** | `save(job)`, `get(job_id)`, `update(job)` | CRUD AnalysisJob |
| **IEditorAIService** | `refine(selected_text, prompt) -> str` | Tinh chỉnh LaTeX snippet |
| **ILaTeXCompilerService** | `markdown_to_latex(markdown) -> str` | Markdown → LaTeX |
| | `compile_to_pdf(latex_code, output_dir) -> str` | LaTeX → PDF |

---

## 5. Adapters (Implementations)

| Adapter | Implements | Mô tả |
|---------|------------|-------|
| **DoclingParser** | IDocumentParser | Docling PDF → Markdown (async via executor) |
| **S3StorageAdapter** | IStorageService | AWS S3 presigned URLs, download, upload |
| **GeminiLLMAdapter** | ILLMService | LangGraph: Analyzer → Enhancer (Gemini 1.5 Flash) |
| **InMemoryJobRepository** | IJobRepository | In-memory dict với asyncio lock |
| **EditorAIGeminiAdapter** | IEditorAIService | Gemini refine LaTeX snippet |
| **LocalLaTeXCompiler** | ILaTeXCompilerService | Jinja2 + pdflatex (Markdown → LaTeX → PDF) |

---

## 6. Use Case: AnalyzeCVUseCase

**Pipeline 8 bước** (chạy trong BackgroundTask):

1. Đánh dấu job `PROCESSING`
2. Download PDF từ S3 về `/tmp`
3. Parse PDF → Markdown (Docling)
4. Chạy LLM pipeline (Analyzer → Enhancer) → score, gaps, red_flags, enhanced Markdown
5. Markdown → LaTeX (Jinja2 template)
6. Compile LaTeX → PDF (pdflatex)
7. Upload PDF lên S3 (`enhanced-pdf/`)
8. Tạo presigned download URL, lưu `AnalysisResult`, đánh dấu `COMPLETED`

Mọi exception trong bước 2–8 → job chuyển `FAILED` với error message.

---

## 7. API Endpoints

### 7.1 Health Check

```http
GET /health
```

**Response (200):**
```json
{
  "status": "healthy",
  "service": "cv-enhancer",
  "version": "2.0.0"
}
```

### 7.2 Resumes — Upload URL

```http
POST /api/v1/resumes/upload-urls
Content-Type: application/json
```

**Request:**
```json
{
  "file_name": "cv.pdf",
  "content_type": "application/pdf"
}
```

**Response (201):**
```json
{
  "upload_url": "https://...",
  "s3_key": "raw-pdf/<uuid>_cv.pdf",
  "bucket": "<bucket-name>"
}
```

**Luồng frontend:**
1. Gọi endpoint này để lấy `upload_url` và `s3_key`
2. PUT file PDF trực tiếp lên `upload_url` (browser → S3)
3. Dùng `s3_key` khi gọi POST `/api/v1/analyses`

### 7.3 Analyses — Async CV Analysis

#### Trigger analysis

```http
POST /api/v1/analyses
Content-Type: application/json
```

**Request:**
```json
{
  "s3_key": "raw-pdf/<uuid>_cv.pdf",
  "jd_text": "Full job description text (min 50 chars)..."
}
```

**Response (202 Accepted):**
```json
{
  "id": "<job_id>",
  "status": "queued"
}
```

#### Poll job status

```http
GET /api/v1/analyses/{job_id}
```

**Response (200) — Đang xử lý:**
```json
{
  "id": "<job_id>",
  "status": "processing",
  "error": null,
  "result": null
}
```

**Response (200) — Hoàn thành:**
```json
{
  "id": "<job_id>",
  "status": "completed",
  "error": null,
  "result": {
    "matching_score": 75,
    "missing_skills": [
      { "skill": "Kubernetes", "importance": "critical" }
    ],
    "red_flags": [
      {
        "title": "Employment Gap 2021-2022",
        "description": "...",
        "severity": "medium"
      }
    ],
    "latex_code": "\\documentclass...",
    "pdf_url": "https://..."
  }
}
```

**Response (200) — Thất bại:**
```json
{
  "id": "<job_id>",
  "status": "failed",
  "error": "Error message...",
  "result": null
}
```

**Error (404):** Job không tồn tại.

### 7.4 Editor — Refinements

```http
POST /api/v1/editor/refinements
Content-Type: application/json
```

**Request:**
```json
{
  "selected_text": "\\item Implemented feature X",
  "prompt": "Make it STAR format"
}
```

**Response (200):**
```json
{
  "new_text": "\\item Architected..."
}
```

### 7.5 Editor — Renders

```http
POST /api/v1/editor/renders
Content-Type: application/json
```

**Request:**
```json
{
  "latex_code": "\\documentclass[10pt,a4paper]{article}..."
}
```

**Response (200) — Thành công:**
```json
{
  "pdf_url": "https://...",
  "success": true,
  "error": null
}
```

**Response (200) — Thất bại:**
```json
{
  "pdf_url": "",
  "success": false,
  "error": "Error message..."
}
```

---

## 8. Cấu hình (Environment Variables)

| Biến | Bắt buộc | Mặc định | Mô tả |
|------|----------|---------|-------|
| `GOOGLE_API_KEY` | Có | — | Gemini API key |
| `GEMINI_MODEL` | Không | `gemini-1.5-flash` | Model Gemini |
| `AWS_REGION` | Có | — | AWS region |
| `AWS_ACCESS_KEY_ID` | Có | — | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Có | — | AWS secret key |
| `AWS_SESSION_TOKEN` | Không | `None` | Session token (optional) |
| `AWS_S3_BUCKET` | Có | — | Tên S3 bucket |
| `AWS_S3_RAW_PREFIX` | Không | `raw-pdf/` | Prefix cho CV upload |
| `AWS_S3_ENHANCED_PREFIX` | Không | `enhanced-pdf/` | Prefix cho PDF đã enhance |
| `AWS_S3_PRESIGNED_UPLOAD_EXPIRATION_SECONDS` | Không | `900` | TTL presigned upload (giây) |
| `AWS_S3_PRESIGNED_DOWNLOAD_EXPIRATION_SECONDS` | Không | `3600` | TTL presigned download (giây) |
| `PORT` | Không | `8000` | Port khi chạy local |

---

## 9. Dependencies

| Package | Version | Mục đích |
|---------|---------|----------|
| fastapi | ≥0.115.0 | Web framework |
| uvicorn | ≥0.32.0 | ASGI server |
| pydantic | ≥2.9.0 | Validation, settings |
| pydantic-settings | ≥2.5.0 | Env-based settings |
| docling | ≥2.7.0 | PDF parsing |
| langchain | ≥0.3.0 | LLM orchestration |
| langchain-google-genai | ≥2.0.0 | Gemini integration |
| langgraph | ≥0.2.0 | Analyzer → Enhancer graph |
| boto3 | ≥1.35.0 | S3 client |
| jinja2 | ≥3.1.0 | LaTeX templating |
| python-dotenv | ≥1.0.1 | `.env` loading |

**System dependency:** `pdflatex` (TeX Live) cho PDF compilation.

---

## 10. LLM Pipeline (GeminiLLMAdapter)

### 10.1 Graph: Analyzer → Enhancer

- **Analyzer node:** CV + JD → `matching_score`, `missing_skills`, `red_flags` (structured output)
- **Enhancer node:** CV + JD + gaps + red_flags → `enhanced_cv_markdown` (STAR Markdown)

### 10.2 Prompts

Prompts nằm trong `core/prompts/cv_analysis_prompt.py`:

- **Analyzer:** Đánh giá ATS, skill gaps, red flags
- **Enhancer:** Viết lại CV theo STAR, quantify results, address gaps

---

## 11. LaTeX Compilation

### 11.1 Markdown → LaTeX

`LocalLaTeXCompiler` chuyển Markdown sang LaTeX:

- H1 → centred name header
- H2 → section heading
- H3 → subsection (role/company)
- `- item` → `\item` trong `itemize`
- **bold**, *italic*, `code`, links → LaTeX equivalents

### 11.2 Template

`resume_template.tex` dùng Jinja2 với delimiters `<< >>` để inject body. Các package: `geometry`, `hyperref`, `enumitem`, `titlesec`, `parskip`.

### 11.3 pdflatex

Chạy pdflatex 2 lần để resolve cross-references. Output PDF được upload lên S3.

---

## 12. Chạy Service

### 12.1 Local Development

```bash
cd services/cv-enhancer
export GOOGLE_API_KEY=your_key
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_S3_BUCKET=your-bucket

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir src
```

### 12.2 Docker

```bash
docker build -t cv-enhancer:latest .
docker run -d \
  --name cv-enhancer \
  -p 8000:8000 \
  -e GOOGLE_API_KEY=your_key \
  -e AWS_REGION=... \
  -e AWS_ACCESS_KEY_ID=... \
  -e AWS_SECRET_ACCESS_KEY=... \
  -e AWS_S3_BUCKET=... \
  cv-enhancer:latest
```

### 12.3 Testing

```bash
# Health check
curl http://localhost:8000/health

# Upload URL
curl -X POST http://localhost:8000/api/v1/resumes/upload-urls \
  -H "Content-Type: application/json" \
  -d '{"file_name": "cv.pdf", "content_type": "application/pdf"}'

# Trigger analysis (sau khi đã upload file lên S3)
curl -X POST http://localhost:8000/api/v1/analyses \
  -H "Content-Type: application/json" \
  -d '{"s3_key": "raw-pdf/xxx_cv.pdf", "jd_text": "Senior Python Engineer with 5+ years..."}'

# Poll status
curl http://localhost:8000/api/v1/analyses/<job_id>
```

---

## 13. Dependency Injection

- Tất cả adapters là **singleton** qua `@lru_cache(maxsize=1)` trong `container.py`
- Lifespan warm-up: storage, LaTeX compiler, job repo, editor AI, analyze use case
- FastAPI `Depends()` inject vào route handlers

---

## 14. Migration Notes

### 14.1 Job Repository

`InMemoryJobRepository` phù hợp dev và single-instance. Production nên thay bằng `DynamoDBJobRepository` (implement `IJobRepository`) và cập nhật binding trong `container.py`.

### 14.2 CORS

Hiện tại `allow_origins=["*"]`. Production nên giới hạn origins cụ thể.
