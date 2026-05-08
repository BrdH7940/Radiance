# Radiance — Backend Documentation

> **Service:** `services/cv-enhancer`  
> **Runtime:** Python 3.12 · FastAPI · AWS Lambda (Container Image)  
> **Version:** 2.0.0

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Pattern](#2-architecture-pattern)
3. [Directory Structure](#3-directory-structure)
4. [Configuration & Environment Variables](#4-configuration--environment-variables)
5. [Dependency Injection Container](#5-dependency-injection-container)
6. [API Endpoints](#6-api-endpoints)
7. [Domain Models](#7-domain-models)
8. [Use Cases](#8-use-cases)
9. [AI / LLM Pipeline](#9-ai--llm-pipeline)
10. [Infrastructure Adapters](#10-infrastructure-adapters)
11. [Authentication & Security](#11-authentication--security)
12. [Rate Limiting](#12-rate-limiting)
13. [AWS Lambda Integration](#13-aws-lambda-integration)
14. [Observability](#14-observability)
15. [Testing](#15-testing)
16. [Local Development](#16-local-development)
17. [Deployment](#17-deployment)

---

## 1. Overview

The `cv-enhancer` microservice is the **sole backend** of the Radiance platform. It is a FastAPI application packaged as an AWS Lambda container image that operates in two modes simultaneously:

- **HTTP Mode** — handles incoming API requests via API Gateway → Mangum → FastAPI
- **SQS Worker Mode** — consumes `Records` events from Amazon SQS to run the async AI pipeline

The service exposes a REST API that powers:
1. **CV-to-JD gap analysis** (ATS score, skill gaps, red flags)
2. **AI-driven CV rewriting** (STAR method via LangGraph → Gemini 2.5 Flash)
3. **PDF rendering** (CVResumeSchema JSON → HTML → WeasyPrint → S3)
4. **Project Gallery management** (CRUD, stored in Supabase)
5. **CV History** (persisted per-user enhancement records in Supabase)
6. **Strategic Gallery enhancement** (WebWorker-ranked projects injected into CV)
7. **Server-side fallback** for client-side AI ranking when WebWorker is unavailable

---

## 2. Architecture Pattern

The service follows **Clean Architecture** (Ports & Adapters / Hexagonal Architecture):

```
presentation/       ← FastAPI routers — HTTP boundary
    └── dependencies/  auth, rate_limiter
core/
    ├── domain/     ← Pydantic domain models (no infrastructure dependencies)
    ├── use_cases/  ← Orchestration logic (depends only on ports)
    ├── ports/      ← Abstract interfaces (ABCs)
    └── prompts/    ← LLM prompt templates (pure strings)
infrastructure/
    ├── adapters/   ← Concrete implementations of ports
    ├── parsers/    ← PDF text extraction
    ├── storage/    ← S3 adapter
    └── templates/  ← Jinja2 HTML template for PDF rendering
container.py        ← Singleton DI via @lru_cache
config.py           ← Pydantic Settings (env-driven)
main.py             ← FastAPI app + Lambda dual-mode handler
```

**Key design decisions:**
- Use cases depend only on `core/ports/` interfaces — never on boto3, Gemini SDK, or Supabase directly
- Infrastructure adapters can be swapped without touching business logic
- `@lru_cache(maxsize=1)` on provider functions creates singleton instances per Lambda instance
- No heavy initialisation at startup; adapters lazy-init on first request

---

## 3. Directory Structure

```
services/cv-enhancer/
├── src/
│   ├── main.py                         # FastAPI app + Lambda handler entry point
│   ├── config.py                       # AppSettings (Pydantic BaseSettings)
│   ├── container.py                    # DI container — all singleton providers
│   ├── local_sqs_worker.py             # Local dev SQS poll loop
│   ├── core/
│   │   ├── domain/
│   │   │   ├── analysis_job.py         # AnalysisJob, AnalysisResult, JobStatus, RedFlag
│   │   │   ├── cv_resume_schema.py     # CVResumeSchema (full structured CV data model)
│   │   │   ├── cv_history.py           # CVHistoryEntry, CVHistorySummary
│   │   │   ├── gallery_schemas.py      # ProjectItem, ClientAIResult, EnhanceFromGalleryRequest
│   │   │   ├── project.py              # Project, CreateProjectRequest
│   │   │   └── skill_gap.py            # SkillGap
│   │   ├── use_cases/
│   │   │   └── analyze_cv_use_case.py  # 8-step async CV pipeline
│   │   ├── ports/
│   │   │   ├── document_parser_port.py
│   │   │   ├── history_repository_port.py
│   │   │   ├── job_notifier_port.py
│   │   │   ├── job_repository_port.py
│   │   │   ├── llm_port.py             # ILLMService interface
│   │   │   ├── pdf_render_port.py
│   │   │   ├── project_repository_port.py
│   │   │   ├── sqs_port.py
│   │   │   └── storage_port.py
│   │   └── prompts/
│   │       └── cv_analysis_prompt.py   # All LLM prompt templates
│   ├── infrastructure/
│   │   ├── adapters/
│   │   │   ├── gemini_llm_adapter.py   # GeminiLLMAdapter (LangGraph pipeline)
│   │   │   ├── groq_llm_adapter.py     # GroqLLMAdapter (fallback LLM)
│   │   │   ├── fallback_llm_adapter.py # FallbackLLMAdapter (primary + fallback)
│   │   │   ├── dynamo_job_repository.py
│   │   │   ├── sqs_service.py
│   │   │   ├── weasyprint_pdf_adapter.py
│   │   │   ├── supabase_project_repository.py
│   │   │   ├── supabase_history_repository.py
│   │   │   ├── supabase_realtime_notifier.py
│   │   │   └── supabase_client.py
│   │   ├── parsers/
│   │   │   └── pdfplumber_adapter.py
│   │   ├── storage/
│   │   │   └── s3_storage.py
│   │   └── templates/
│   │       └── cv_template.html        # Jinja2 CV HTML template
│   ├── presentation/
│   │   ├── analyses.py                 # POST/GET /api/v1/analyses
│   │   ├── resumes.py                  # POST /api/v1/resumes/upload-urls
│   │   ├── editor.py                   # POST /api/v1/editor/renders
│   │   ├── fallback.py                 # POST /api/v1/fallback/client-ai
│   │   ├── projects.py                 # CRUD /api/v1/projects
│   │   ├── history.py                  # CRUD /api/v1/history
│   │   └── dependencies/
│   │       ├── auth.py                 # Supabase JWT verification
│   │       └── rate_limiter.py         # DynamoDB-backed rate limiter (in-memory fallback for local dev)
│   └── observability/
│       ├── langsmith.py                # LangSmith tracing init
│       └── xray.py                     # AWS X-Ray tracing init
├── tests/
│   ├── conftest.py
│   ├── test_analyze_cv_use_case_aws_flow.py
│   ├── test_auth_jwt.py
│   ├── test_dynamo_job_repository.py
│   ├── test_gemini_llm_adapter.py
│   ├── test_live_aws_gemini_e2e.py
│   ├── test_main_lambda_sqs.py
│   ├── test_pdfplumber_adapter.py
│   ├── test_s3_storage_adapter.py
│   ├── test_sqs_service.py
│   └── test_weasyprint_pdf_adapter.py
├── requirements.txt
├── Dockerfile.lambda
└── .env.example
```

---

## 4. Configuration & Environment Variables

All settings are validated at startup via `AppSettings` (Pydantic `BaseSettings`).

```python
# config.py — AppSettings fields
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_API_KEY` | ✅ | — | Google AI (Gemini) API key |
| `GEMINI_MODEL` | | `gemini-2.5-flash` | Gemini model name |
| `GROQ_API_KEY` | | `None` | Groq API key (enables LLM fallback if set) |
| `GROQ_MODEL` | | `openai/gpt-oss-120b` | Groq model name |
| `AWS_REGION` | ✅ | — | AWS region |
| `AWS_ACCESS_KEY_ID` | ✅ | — | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | ✅ | — | AWS credentials |
| `AWS_SESSION_TOKEN` | | `None` | Optional session token |
| `AWS_S3_BUCKET` | ✅ | — | S3 bucket name |
| `AWS_S3_RAW_PREFIX` | | `raw-pdf/` | S3 prefix for uploaded CVs |
| `AWS_S3_ENHANCED_PREFIX` | | `enhanced-pdf/` | S3 prefix for rendered PDFs |
| `AWS_S3_PRESIGNED_UPLOAD_EXPIRATION_SECONDS` | | `900` | Presigned PUT URL TTL (15 min) |
| `AWS_S3_PRESIGNED_DOWNLOAD_EXPIRATION_SECONDS` | | `3600` | Presigned GET URL TTL (1 hr) |
| `DYNAMODB_ANALYSIS_TABLE_NAME` | ✅ | — | DynamoDB table for job state |
| `DYNAMODB_ENDPOINT_URL` | | `None` | Local DynamoDB override |
| `ANALYSIS_USER_ID` | | `local` | Default user ID for unauthenticated local runs |
| `SQS_QUEUE_URL` | ✅ | — | SQS queue URL |
| `SQS_ENDPOINT_URL` | | `None` | Local SQS override (LocalStack) |
| `SUPABASE_URL` | ✅ | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | — | Supabase service role key (server-side) |
| `SUPABASE_JWT_SECRET` | ✅ | — | Supabase JWT secret for HS256 token verification |
| `CORS_ALLOWED_ORIGINS` | | `http://localhost:3000` | Comma-separated allowed origins |
| `IN_PROCESS_WORKER` | | `False` | Skip SQS; process jobs inline (local dev only) |

---

## 5. Dependency Injection Container

`container.py` uses `@lru_cache(maxsize=1)` to provide **singleton** instances of all infrastructure adapters. Each provider function is a dependency that FastAPI routers call via `Depends(...)`.

### Dependency Graph

```
AppSettings
  ├── S3StorageAdapter          → IStorageService
  ├── PDFPlumberParser          → IDocumentParser
  ├── GeminiLLMAdapter          ┐
  │     └── [FallbackLLMAdapter]┘ → ILLMService
  │           └── GroqLLMAdapter   (if GROQ_API_KEY set)
  ├── DynamoJobRepository       → IJobRepository
  ├── SQSService                → ISQSService
  ├── WeasyPrintPDFAdapter      → IPDFRenderService
  ├── SupabaseProjectRepository → IProjectRepository
  ├── SupabaseHistoryRepository → IHistoryRepository
  └── AnalyzeCVUseCase          ← consumes all of the above
```

### LLM Fallback Chain

When `GROQ_API_KEY` is set, `get_llm_service()` wraps Gemini in `FallbackLLMAdapter`:
- **Primary:** `GeminiLLMAdapter` (Gemini 2.5 Flash)
- **Fallback:** `GroqLLMAdapter` (triggered on any exception: 429, 503, timeout)
- The fallback is transparent — the use case never knows which adapter ran

---

## 6. API Endpoints

### Base URL
```
Production: https://<api-gateway-id>.execute-api.<region>.amazonaws.com
Local:      http://localhost:8000
```

### Endpoint Reference

#### Health

```
GET /health
```
Liveness probe. No auth required.

**Response `200`:**
```json
{ "status": "healthy", "service": "cv-enhancer", "version": "2.0.0" }
```

---

#### Resumes

```
POST /api/v1/resumes/upload-urls
Authorization: Bearer <supabase_access_token>
```

Generate a presigned S3 PUT URL for direct browser-to-S3 CV upload (bypasses API Gateway size limits).

**Request:**
```json
{
  "file_name": "resume.pdf",
  "content_type": "application/pdf"
}
```

**Response `201`:**
```json
{
  "upload_url": "https://s3.amazonaws.com/...",
  "s3_key": "raw-pdf/<uuid>_resume.pdf",
  "bucket": "radiance-cv-storage"
}
```

Only `application/pdf` is accepted. Returns `400` for other content types.

---

#### Analyses

```
POST /api/v1/analyses
Authorization: Bearer <supabase_access_token>
Rate limit: 10 requests/hour
```

Queue an async CV analysis job. Returns immediately with a job ID.

**Request:**
```json
{
  "s3_key": "raw-pdf/<uuid>_resume.pdf",
  "jd_text": "We are looking for a Senior Backend Engineer...",
  "job_title": "Senior Backend Engineer",
  "company_name": "Acme Corp"
}
```

`jd_text` minimum length: 50 characters.

**Response `202`:**
```json
{ "id": "a3f8c2d1e6b74a9f", "status": "queued" }
```

---

```
GET /api/v1/analyses/{job_id}
Authorization: Bearer <supabase_access_token>
```

Fetch the status of a queued/running job. Returns full result when `status == "completed"`.

**Realtime status events (recommended):**

Instead of polling this endpoint, clients subscribe to Supabase Realtime:

- Channel (topic): `job:<job_id>`
- Event: `status`
- Payload: `{ "status": "completed" | "failed", "job_id": "<job_id>" }`

The worker broadcasts when it marks the DynamoDB job `COMPLETED` or `FAILED`. The client then calls this endpoint once to fetch the full result payload.

**Response `200` (pending/processing):**
```json
{ "id": "a3f8c2d1e6b74a9f", "status": "processing", "error": null, "result": null }
```

**Response `200` (completed):**
```json
{
  "id": "a3f8c2d1e6b74a9f",
  "status": "completed",
  "error": null,
  "result": {
    "matching_score": 78,
    "missing_skills": [
      { "skill": "Kubernetes", "importance": "critical" },
      { "skill": "Terraform", "importance": "recommended" }
    ],
    "red_flags": [
      {
        "title": "Unquantified Impact",
        "description": "Multiple bullet points lack measurable outcomes.",
        "severity": "medium"
      }
    ],
    "enhanced_cv_json": { ... },
    "pdf_url": "https://s3.amazonaws.com/...?X-Amz-Expires=3600..."
  }
}
```

Returns `404` when job ID doesn't exist or doesn't belong to the requesting user (ownership guard — returns 404, not 403, to avoid confirming existence).

---

```
POST /api/v1/analyses/enhance-from-gallery
Authorization: Bearer <supabase_access_token>
Rate limit: 10 requests/hour
```

Strategic Gallery enhancement. Validates client-provided project IDs against Supabase, then enqueues a gallery enhancement job.

**Request:**
```json
{
  "cv_text": "John Doe\nSoftware Engineer...",
  "jd_text": "We are looking for...",
  "client_results": [
    {
      "project_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "fit_score": 0.87,
      "client_reasoning": "Directly applicable backend experience..."
    }
  ]
}
```

**Security:** Only `project_id` values are trusted from the frontend payload. All project data is re-fetched from Supabase via `verify_selected()` before being passed to the LLM.

**Response `202`:**
```json
{ "id": "b9e4d1a2c7f3e8b5", "status": "queued" }
```

Returns `403` if any project ID is invalid or doesn't belong to the authenticated user.

---

#### Fallback

```
POST /api/v1/fallback/client-ai
Authorization: Bearer <supabase_access_token>
```

Server-side equivalent of the browser `ai.worker.ts`. Called automatically when the WebWorker fails (no WebGPU, OOM, incompatible browser). Uses Gemini 2.5 Flash to rank and reason about projects.

**Request:**
```json
{
  "jd_text": "We are looking for...",
  "project_gallery": [
    {
      "id": "3fa85f64-...",
      "title": "Radiance CV Enhancer",
      "description": "AI-powered CV enhancement tool",
      "tech_stack": ["Python", "FastAPI", "LangGraph"]
    }
  ]
}
```

**Response `200`:**
```json
[
  {
    "project_id": "3fa85f64-...",
    "fit_score": 0.91,
    "client_reasoning": "Directly demonstrates the FastAPI and LangChain skills required by the JD."
  }
]
```

---

#### Editor

```
POST /api/v1/editor/renders
Authorization: Bearer <supabase_access_token>
Rate limit: 60 requests/hour
```

Render a `CVResumeSchema` JSON object to PDF server-side via Jinja2 HTML + WeasyPrint. Upload to S3, return presigned download URL. The CPU-bound WeasyPrint render and S3 upload both run in a thread pool via `asyncio.to_thread()` to avoid blocking the FastAPI event loop.

**Request:**
```json
{
  "cv_data": {
    "personal_info": { "name": "John Doe", "email": "john@example.com", ... },
    "summary": { "text": "..." },
    "experiences": [...],
    "education": [...],
    "projects": [...],
    "skill_groups": [...],
    "awards_certifications": [...]
  }
}
```

**Response `200`:**
```json
{
  "pdf_url": "https://s3.amazonaws.com/...?X-Amz-Expires=3600...",
  "success": true,
  "error": null
}
```

---

#### Projects (Gallery)

```
GET    /api/v1/projects                          List active projects
POST   /api/v1/projects                          Create project
DELETE /api/v1/projects/{project_id}             Soft-delete project
Authorization: Bearer <supabase_access_token>
```

**Create Request:**
```json
{
  "title": "Real-time Chat App",
  "description": "WebSocket-based chat with message history",
  "technologies": ["Go", "WebSocket", "Redis", "PostgreSQL"]
}
```

**Project Response:**
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "user_id": "abc123-...",
  "title": "Real-time Chat App",
  "description": "WebSocket-based chat with message history",
  "technologies": ["Go", "WebSocket", "Redis", "PostgreSQL"],
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z"
}
```

Delete returns `204 No Content`. Returns `404` if project not found or not owned by user.

---

#### History

```
GET    /api/v1/history                           List history summaries
GET    /api/v1/history/{history_id}              Get full history entry
PATCH  /api/v1/history/{history_id}              Update metadata
DELETE /api/v1/history/{history_id}              Delete entry
Authorization: Bearer <supabase_access_token>
```

**History Summary (list):**
```json
[
  {
    "id": "f1a2b3c4-...",
    "job_title": "Senior Backend Engineer",
    "company_name": "Acme Corp",
    "matching_score": 78,
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

**History Entry (full):**
```json
{
  "id": "f1a2b3c4-...",
  "user_id": "abc123-...",
  "job_title": "Senior Backend Engineer",
  "company_name": "Acme Corp",
  "jd_text": "We are looking for...",
  "matching_score": 78,
  "enhanced_cv_json": { ... },
  "pdf_s3_key": "enhanced-pdf/...",
  "created_at": "2024-01-15T10:30:00Z"
}
```

**PATCH Request** (partial update):
```json
{ "job_title": "Lead Backend Engineer", "company_name": null }
```

---

## 7. Domain Models

### JobStatus

```python
class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
```

Lifecycle: `QUEUED → PROCESSING → COMPLETED | FAILED`

### AnalysisJob

The complete state of one async CV analysis request, stored in DynamoDB.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `str` | UUID hex — unique job identifier |
| `user_id` | `Optional[str]` | Supabase auth user UUID |
| `status` | `JobStatus` | Current pipeline state |
| `s3_key` | `str` | S3 object key of raw CV PDF |
| `jd_text` | `str` | Job description text |
| `job_title` | `Optional[str]` | Target job title |
| `company_name` | `Optional[str]` | Target company |
| `created_at` | `datetime` | UTC creation timestamp |
| `updated_at` | `datetime` | UTC last-update timestamp |
| `result` | `Optional[AnalysisResult]` | Populated on `COMPLETED` |
| `error` | `Optional[str]` | Populated on `FAILED` |

### AnalysisResult

```python
class AnalysisResult(BaseModel):
    matching_score: int          # 0–100 ATS fit score
    missing_skills: List[SkillGap]
    red_flags: List[RedFlag]
    enhanced_cv_json: CVResumeSchema
    pdf_url: str                 # Presigned S3 download URL
```

### SkillGap

```python
class SkillGap(BaseModel):
    skill: str
    importance: Literal["critical", "recommended", "nice-to-have"]
```

### RedFlag

```python
class RedFlag(BaseModel):
    title: str       # Short scannable label
    description: str # Recruiter-perspective explanation
    severity: Literal["low", "medium", "high"]
```

### CVResumeSchema

The canonical data contract shared between LLM output, job storage, frontend rendering, and PDF generation.

```python
class CVResumeSchema(BaseModel):
    personal_info: PersonalInfo
    summary: Optional[Summary]
    experiences: List[Experience]
    education: List[Education]
    projects: List[Project]
    skill_groups: List[SkillGroup]
    awards_certifications: List[AwardsAndCertification]
    recommended_actions: List[str]  # Strategic mode only — project suggestions
```

Sub-models:
- **`PersonalInfo`**: `name`, `email`, `phone`, `location`, `links: List[Link]`
- **`Summary`**: `text` (3-sentence executive summary)
- **`Experience`**: `company`, `role`, `date_range`, `bullets: List[str]` (STAR-formatted)
- **`Education`**: `institution`, `degree`, `major`, `start_date`, `end_date`, `location`, `gpa`, `honors`
- **`Project`**: `name`, `role`, `tech_stack`, `start_date`, `end_date`, `link`, `description`
- **`SkillGroup`**: `category`, `skills: List[str]`
- **`AwardsAndCertification`**: `title`, `link`

### Project (Gallery)

```python
class Project(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    description: Optional[str]
    technologies: List[str]
    is_active: bool
    created_at: datetime
```

### CVHistoryEntry

```python
class CVHistoryEntry(BaseModel):
    id: Optional[UUID]
    user_id: UUID
    job_title: Optional[str]
    company_name: Optional[str]
    jd_text: Optional[str]
    matching_score: Optional[int]    # 0–100
    enhanced_cv_json: Optional[Dict[str, Any]]
    pdf_s3_key: Optional[str]
    created_at: Optional[datetime]
```

---

## 8. Use Cases

### AnalyzeCVUseCase

The sole orchestrator of the **8-step background CV analysis pipeline**. Depends only on port interfaces — never on concrete adapters.

```
Step 1  Mark job as PROCESSING in DynamoDB
Step 2  Download raw CV PDF from S3 to /tmp
Step 3  Parse PDF to text via pdfplumber
Step 4  Run LangGraph pipeline (Gemini): analyze + enhance
Step 5  Render CVResumeSchema → HTML → PDF via WeasyPrint
Step 6  Upload enhanced PDF to S3 (enhanced-pdf/ prefix)
Step 7  Generate presigned download URL; persist COMPLETED result to DynamoDB
Step 8  Persist CVHistoryEntry to Supabase (authenticated users only; non-critical)
```

**Error handling:**
- Any exception in steps 2–7 marks the job as `FAILED` with an error message
- The method never raises — all exceptions are caught and stored
- Step 8 is non-critical: failure is logged as a warning, does not fail the job

---

## 9. AI / LLM Pipeline

### LangGraph Two-Node Graph

Built in `GeminiLLMAdapter.build_llm_pipelines()` — reusable with any `BaseChatModel`.

```
INPUT: cv_text + jd_text
           │
           ▼
┌───────────────────────────┐
│  Node 1: ANALYZER         │
│  Model: Gemini 2.5 Flash  │
│  Output schema: _AnalyzerOutput│
│  ─────────────────────    │
│  → matching_score (0–100) │
│  → missing_skills[]       │
│  → red_flags[]            │
└────────────┬──────────────┘
             │ State passes: cv_text + jd_text
             │             + missing_skills
             │             + red_flags
             ▼
┌───────────────────────────┐
│  Node 2: ENHANCER         │
│  Model: Gemini 2.5 Flash  │
│  Output schema: CVResumeSchema │
│  ─────────────────────    │
│  → Full structured CV JSON│
│  (STAR rewrite + gap-aware│
│   enhancement)            │
└───────────────────────────┘
```

### Prompt Strategy

**Analyzer System Prompt Persona:**
> "Senior ATS consultant and technical recruiter with 15+ years of experience evaluating engineering candidates at FAANG-level companies."

**Analyzer Scoring Weights:**
- Technical skills & technology stack overlap → 40%
- Years and depth of directly relevant experience → 30%
- Domain / industry alignment → 20%
- Education, certifications, and required qualifications → 10%

**Enhancer STAR Rules (per bullet):**
- Starts with a strong past-tense action verb
- Contains a quantified result (%, $, x, ms, users)
- Single dense sentence of 20–35 words
- Never fabricates specific numbers; uses qualitative improvements when CV lacks data

**Structured Output:**
- Analyzer uses `llm.with_structured_output(_AnalyzerOutput)` — Gemini function calling
- Enhancer uses `StrOutputParser` + custom JSON extraction with fallback parsing

### Strategic Gallery Pipeline (`enhance_from_gallery`)

An alternative enhancement path that injects verified projects from the user's gallery:

```python
async def enhance_from_gallery(
    cv_text: str,
    jd_text: str,
    verified_projects: List[ProjectItem]
) -> CVResumeSchema
```

Uses a separate **Strategic Enhancer** prompt that:
1. Receives the full CV text, JD, and the AI-selected verified projects
2. Rewrites the CV to prominently feature those specific projects
3. Populates `recommended_actions` if gallery is empty/unrelated to the JD

### Fallback Project Ranker

Server-side equivalent of the browser WebWorker ranking task. Uses a dedicated Gemini prompt to rank up to Top-5 projects and produce one-sentence reasoning for each. Invoked via `POST /api/v1/fallback/client-ai`.

---

## 10. Infrastructure Adapters

### GeminiLLMAdapter

| Method | Description |
|--------|-------------|
| `analyze_and_enhance(cv_text, jd_text)` | Run the 2-node LangGraph pipeline; returns `FullAnalysisOutput` |
| `enhance_from_gallery(cv_text, jd_text, verified_projects)` | Strategic gallery enhancement |
| `rank_projects_for_jd(jd_text, projects)` | Server-side project ranking (fallback endpoint) |

Internally builds and compiles LangGraph `StateGraph` using `build_llm_pipelines(llm)` — the graph is compiled once and cached.

### GroqLLMAdapter

Implements the same `ILLMService` interface using `langchain-groq`. Uses the same `build_llm_pipelines()` function — supports any model on the Groq platform.

### FallbackLLMAdapter

Wraps `primary` (Gemini) + `fallback` (Groq). Catches any exception from the primary and retries with the fallback, transparently.

### S3StorageAdapter

| Method | Description |
|--------|-------------|
| `generate_presigned_upload_url(object_key, content_type)` | Returns PUT URL for browser upload |
| `upload_file(local_path, object_key, content_type)` | Server-side file upload |
| `download_object(object_key, local_path)` | Download file to local path |
| `generate_presigned_download_url(object_key)` | Returns time-limited GET URL |

### DynamoJobRepository

DynamoDB table access for `AnalysisJob` records.

| Method | Description |
|--------|-------------|
| `save(job)` | Create a new job record |
| `get(job_id)` | Fetch a job by ID |
| `update(job)` | Uses `update_item` for status-only transitions; uses `put_item` when writing the full COMPLETED payload |

Uses `PAY_PER_REQUEST` billing. Table partition key: `user_id` (configurable).

### SupabaseRealtimeNotifier

Broadcasts job completion/failure events via Supabase Realtime REST broadcast API:

- Topic: `job:<job_id>`
- Event: `status`
- Payload: `{ status, job_id }`

This reduces load by avoiding client-side polling loops.

### SQSService

| Method | Description |
|--------|-------------|
| `send_job(job_id, s3_key, jd_text)` | Enqueue a legacy analysis job message |
| `send_gallery_job(job_id, cv_text, jd_text, verified_projects)` | Enqueue a gallery enhancement message |

Message `type` field distinguishes job types: `"legacy_enhance"` (default) vs `"gallery_enhance"`.

### WeasyPrintPDFAdapter

Renders `CVResumeSchema` to a PDF file:
1. Load `cv_template.html` via Jinja2
2. Inject CV data as template variables
3. Convert HTML → PDF using WeasyPrint
4. Write to a temporary directory; return file path

Requires `pango`, `cairo`, `gdk-pixbuf2`, `harfbuzz`, `fontconfig` (installed in Dockerfile.lambda).

### PDFPlumberParser

Extracts text from PDF files using `pdfplumber`. Returns plain text suitable for LLM consumption.

### SupabaseProjectRepository

Wraps the Supabase Python SDK to read/write the `project_gallery` table.

| Method | Description |
|--------|-------------|
| `list(user_id)` | List active projects for a user |
| `create(user_id, payload)` | Insert a new project |
| `delete(user_id, project_id)` | Soft-delete (set `is_active=False`) |
| `verify_selected(user_id, project_ids)` | Security-fetch projects by IDs, ensuring ownership |

### SupabaseHistoryRepository

| Method | Description |
|--------|-------------|
| `list(user_id)` | List CVHistorySummary records (newest-first) |
| `get_by_id(user_id, history_id)` | Get full CVHistoryEntry |
| `save(entry)` | Insert a new history record |
| `update(user_id, history_id, ...)` | Update metadata fields |
| `delete(user_id, history_id)` | Delete a history entry |

---

## 11. Authentication & Security

### JWT Verification (`presentation/dependencies/auth.py`)

All protected endpoints use `get_current_user_id` as a FastAPI dependency:

```python
user_id: str = Depends(get_current_user_id)
```

**Algorithm support:**
- **HS256** — legacy Supabase JWT secret (`SUPABASE_JWT_SECRET`)
- **ES256 / RS256** — modern asymmetric keys via Supabase JWKS endpoint (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`)

The function auto-detects the algorithm from the JWT header. JWKS client is cached with `@lru_cache`.

**Error responses:**
- `401 Unauthorized` — missing, expired, malformed, or invalid token
- The `sub` claim (user UUID) is extracted as `user_id`

### Ownership Guard

`GET /api/v1/analyses/{id}` returns `404` (not `403`) when a user tries to access another user's job — avoids confirming job existence to unauthorised users.

### Gallery Security

`POST /api/v1/analyses/enhance-from-gallery` never trusts `project_id` values from the frontend payload as authoritative data. It calls `project_repo.verify_selected(user_id, selected_ids)` to re-fetch all project data from Supabase, ensuring:
1. All IDs exist in the database
2. All IDs belong to the requesting user
3. LLM only ever sees data from the authoritative source

---

## 12. Rate Limiting

DynamoDB-backed sliding-window rate limiter — shared across all Lambda instances.

| Limiter | Limit | Applied to |
|---------|-------|------------|
| `check_analysis_rate_limit` | 10 req/hour | `POST /analyses`, `POST /analyses/enhance-from-gallery` |
| `check_editor_rate_limit` | 60 req/hour | `POST /editor/renders` |

### Implementation

Rate-limit state is stored atomically in DynamoDB using `UpdateItem ADD` operations:

- **Key pattern:** PK = `ANALYSIS_USER_ID` (existing partition), SK = `RATE_LIMIT#<label>#<user_id>#<window>` (e.g. `RATE_LIMIT#analysis#abc123#2024-01-15T10`)
- **Window:** 1-hour UTC buckets (e.g. `2024-01-15T10` covers 10:00–10:59 UTC)
- **Atomic counter:** `ADD rate_count :one` — concurrent Lambda instances cannot race past the limit
- **TTL:** `expires_at` set to 2 hours after window start — DynamoDB auto-deletes expired items
- **Fallback:** If DynamoDB is unavailable (network error, local dev without DynamoDB Local), an in-memory sliding-window activates automatically. The fallback is per-instance and logs a warning.

Both check functions are `async` and run the DynamoDB call via `asyncio.to_thread()` to avoid blocking the event loop.

---

## 13. AWS Lambda Integration

`main.py` implements a **dual-mode Lambda handler**:

```python
def handler(event, context):
    if isinstance(event, dict) and "Records" in event:
        # SQS trigger path
        return asyncio.run(process_sqs_records(event))
    # HTTP path (API Gateway / Lambda Function URL)
    return mangum_handler(event, context)
```

### SQS Message Processing

`process_sqs_records()` dispatches each record based on `body.type`:

| `type` value | Handler | Description |
|-------------|---------|-------------|
| `"legacy_enhance"` (default) | `_process_legacy_record` | Standard CV analysis pipeline |
| `"gallery_enhance"` | `_process_gallery_record` | Strategic Gallery enhancement |

Each record is processed independently. On failure, the exception is re-raised so SQS retries according to the queue's redrive policy (Dead Letter Queue after max retries).

**X-Ray annotation safety:** `_process_legacy_record` annotates the record with `event_source`, `job_id`, and `s3_key` before calling `use_case.execute()`. The annotation block is wrapped in its own `try/except` — observability failure can never prevent or duplicate the pipeline run.

### Mangum Configuration

```python
mangum_handler = Mangum(app, lifespan="on")
```

`lifespan="on"` triggers FastAPI's lifespan context manager on Lambda invocation.

**Startup design:** No heavy initialisation at startup. All adapters lazy-init on first request via `Depends(get_*)`. This prevents cold-start failures from CORS preflight OPTIONS requests.

---

## 14. Observability

### LangSmith Tracing

`observability/langsmith.py` — initialised at startup if `LANGCHAIN_API_KEY` is set in the environment. All LangChain/LangGraph calls are automatically traced.

### AWS X-Ray

`observability/xray.py` — initialised if `AWS_XRAY_DAEMON_ADDRESS` is set. FastAPI middleware is instrumented to trace all HTTP requests. SQS records are annotated with `event_source`, `job_id`, and `s3_key` in a separate best-effort block that is fully isolated from the processing pipeline — annotation failure cannot cause duplicate or missing pipeline executions.

Both observability tools are **best-effort**: any failure in init or annotation is silently caught and never prevents the app from starting or processing jobs.

### CloudWatch Logs

All `logging.info/warning/error` calls go to stdout, which Lambda forwards to CloudWatch Logs automatically.

---

## 15. Testing

```
tests/
├── conftest.py                          # Shared fixtures, mock settings
├── test_analyze_cv_use_case_aws_flow.py # Unit: pipeline logic with mocked ports
├── test_auth_jwt.py                     # Unit: JWT verification edge cases
├── test_dynamo_job_repository.py        # Integration: DynamoDB CRUD
├── test_gemini_llm_adapter.py           # Unit: LLM adapter with mocked Gemini
├── test_live_aws_gemini_e2e.py          # Live E2E: real AWS + Gemini (gated)
├── test_main_lambda_sqs.py              # Unit: Lambda handler dispatch
├── test_pdfplumber_adapter.py           # Unit: PDF parsing
├── test_s3_storage_adapter.py           # Unit: S3 operations (mocked boto3)
├── test_sqs_service.py                  # Unit: SQS send operations
└── test_weasyprint_pdf_adapter.py       # Unit: PDF rendering
```

**Running tests:**
```bash
cd services/cv-enhancer
pip install -r requirements.txt
pytest tests/ -v --cov=src
```

**Live E2E test** (requires real AWS credentials + Gemini key):
```bash
RUN_LIVE_AWS_GEMINI_TESTS=1 pytest tests/test_live_aws_gemini_e2e.py -v
```

---

## 16. Local Development

### Setup

```bash
cd services/cv-enhancer
cp .env.example .env
# Fill in required env vars (can use LocalStack for AWS services)
pip install -r requirements.txt
```

### Run the API

```bash
IN_PROCESS_WORKER=1 python src/main.py
```

`IN_PROCESS_WORKER=1` skips SQS; analysis jobs run inline via `asyncio.create_task(_run_in_process_job(...))`. Any exception from the background task is logged at `ERROR` level and does not silently disappear. Clients still receive terminal job status via Supabase Realtime and fetch the full result via `GET /api/v1/analyses/{job_id}`.

### Run the local SQS worker (alternative)

```bash
python src/local_sqs_worker.py
```

Polls a local SQS queue (requires LocalStack or real SQS) and processes jobs.

---

## 17. Deployment

### Dockerfile.lambda

```dockerfile
FROM public.ecr.aws/lambda/python:3.12

# WeasyPrint system dependencies (AL2023)
RUN dnf install -y pango cairo gdk-pixbuf2 libffi harfbuzz fontconfig \
      dejavu-sans-fonts dejavu-serif-fonts && dnf clean all

COPY services/cv-enhancer/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --prefer-binary -r /tmp/requirements.txt
# Smoke test WeasyPrint at build time
RUN python -c "from weasyprint import HTML; HTML(string='<h1>ok</h1>').write_pdf('/tmp/smoke.pdf')"

WORKDIR /var/task
ENV PYTHONPATH=/var/task
COPY services/cv-enhancer/src/ /var/task/
CMD ["main.handler"]
```

### CI/CD (GitHub Actions)

`.github/workflows/backend-deploy.yml`:
1. Build Docker image
2. Push to Amazon ECR
3. Update Lambda function code (`aws lambda update-function-code`)

### Infrastructure (Terraform)

All AWS resources (Lambda, API Gateway, SQS, DynamoDB, S3, ECR, IAM, CloudWatch) are defined in `infra/main.tf`.

```bash
cd infra
terraform init
terraform plan
terraform apply
```
