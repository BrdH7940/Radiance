# AI Workflow — Radiance

> Technical deep-dive vào toàn bộ AI pipeline của hệ thống, bao gồm Legacy Analysis Flow, Strategic Gallery Flow, Client-Side AI (WebWorker), và Server-Side Fallback.

---

## 1. Tổng quan kiến trúc AI

Radiance có **hai luồng AI** chạy song song, phục vụ hai mục đích khác nhau:

| Luồng | Nơi chạy | Model | Mục đích |
|-------|----------|-------|----------|
| **Legacy Analysis** | Server (Lambda) | Gemini 2.5 Flash via LangGraph | Phân tích CV–JD gap, tính ATS score, rewrite STAR |
| **Strategic Gallery** — Phase 1 | Browser (WebWorker) | `all-MiniLM-L6-v2` (Transformers.js) | Embedding cosine similarity để rank projects |
| **Strategic Gallery** — Phase 2 | Browser (WebWorker) | `SmolLM2-135M-Instruct` (Transformers.js) | Generative reasoning (1 câu/project) |
| **Fallback** | Server (Lambda) | Gemini 2.5 Flash | Server-side thay thế khi WebWorker fail |
| **Strategic Enhancement** | Server (Lambda) | Gemini 2.5 Flash via LangGraph | Rewrite CV với verified projects từ Gallery |

---

## 2. Legacy Analysis Pipeline — LangGraph (Server-Side)

### 2.1 Kiến trúc LangGraph

Toàn bộ pipeline sử dụng **LangGraph StateGraph** với hai node tuần tự: **Analyzer** → **Enhancer**.

```
INPUT: cv_text + jd_text
           │
           ▼
┌──────────────────────────┐
│  Node 1: ANALYZER         │
│  Model: Gemini 2.5 Flash  │
│  Output: _AnalyzerOutput  │
│  (Pydantic structured)    │
│  ─────────────────────    │
│  → matching_score (0–100) │
│  → missing_skills[]       │
│  → red_flags[]            │
└───────────┬──────────────┘
            │ State: cv_text + jd_text
            │      + missing_skills (formatted)
            │      + red_flags (formatted)
            ▼
┌──────────────────────────┐
│  Node 2: ENHANCER         │
│  Model: Gemini 2.5 Flash  │
│  Output: CVResumeSchema   │
│  (JSON via StrOutputParser│
│  + custom JSON extraction)│
│  ─────────────────────    │
│  → complete structured CV │
│    (STAR rewrite,         │
│     gap-aware)            │
└──────────────────────────┘
           │
           ▼
    FullAnalysisOutput
    (score + gaps + flags + CVResumeSchema)
```

Graph được compile một lần và cached (`@lru_cache`). Hàm `build_llm_pipelines(llm: BaseChatModel)` là **provider-agnostic** — hoạt động với bất kỳ LangChain chat model nào (Gemini, Groq, OpenAI, ...).

### 2.2 Node 1 — Analyzer

**Persona (system prompt):**
> "Senior ATS consultant and technical recruiter with 15+ years of experience evaluating engineering candidates at FAANG-level companies."

**Nhiệm vụ:**

1. **Matching Score (0–100)** — ATS fit score với 4 trọng số:
   - Technical skills & technology stack overlap → **40%**
   - Years and depth of directly relevant experience → **30%**
   - Domain / industry alignment → **20%**
   - Education, certifications & required qualifications → **10%**

2. **Missing Skills** — Phân loại 3 mức:
   - `critical` — Deal-breaker; candidate fail technical screening
   - `recommended` — Strongly preferred; weakens application significantly
   - `nice-to-have` — Beneficial but not deciding

3. **Red Flags** — Các vấn đề cấu trúc recruiter ngay lập tức chú ý:
   - Unexplained employment gaps (> 3 months)
   - Job-hopping (multiple roles < 1 year)
   - Vague bullets với zero quantified results
   - Mismatch giữa claimed seniority và experience thực tế
   - Buzzword-heavy skills section không có bằng chứng
   - Outdated tech stack for target role
   - Missing sections (no summary, no education)

**Output validation:** Pydantic model `_AnalyzerOutput` qua `llm.with_structured_output()` (Gemini function calling).

### 2.3 Node 2 — Enhancer

Nhận toàn bộ Analyzer state → rewrite CV theo **STAR methodology**, output `CVResumeSchema`.

**STAR Rules (mỗi bullet experience):**
- Bắt đầu bằng strong past-tense action verb
- Chứa quantified result (`%`, `$`, `x`, `ms`, `users`)
- 20–35 words, single dense sentence
- Không fabricate số liệu cụ thể nếu CV gốc không cung cấp → dùng qualitative improvements

**Bảo toàn thông tin định danh:**
- `personal_info` (name, email, phone, links) → bắt buộc preserve exact
- `education` → preserve all details
- `projects`, `awards_certifications` → preserve từ CV gốc

**`recommended_actions`:** Chỉ populate khi gallery trống hoặc không liên quan đến JD. Mỗi entry là một actionable project suggestion cụ thể.

**Output:** JSON string, parsed bởi `StrOutputParser` + custom `_extract_first_json_object()` với regex fallback.

### 2.4 LLM Fallback Chain

```
get_llm_service()
    │
    ├── GROQ_API_KEY set?
    │     YES → FallbackLLMAdapter
    │              ├── Primary: GeminiLLMAdapter (Gemini 2.5 Flash)
    │              └── Fallback: GroqLLMAdapter  (catches ANY exception)
    │
    └── NO → GeminiLLMAdapter (direct)
```

`FallbackLLMAdapter` là transparent wrapper — use case không biết adapter nào đang chạy.

---

## 3. Strategic Gallery Pipeline

### 3.1 Phase 1 — Client-Side Embedding & Ranking (WebWorker)

```
Browser WebWorker (ai.worker.ts)

Model: Xenova/all-MiniLM-L6-v2 (quantized, ~23MB)
Task: feature-extraction

1. Embed JD text → jdEmbedding[384]
2. For each project in gallery:
   text = "{title}. {description}. Technologies: {tech_stack}"
   embed(text) → projectEmbedding[384]
   score = cosineSimilarity(jdEmbedding, projectEmbedding)
3. Sort by score DESC → Top 5
4. → postMessage({ type: 'PROGRESS', step: 1 })
```

### 3.2 Phase 2 — Client-Side Reasoning (WebWorker)

```
Browser WebWorker (ai.worker.ts)

Model: HuggingFaceTB/SmolLM2-135M-Instruct (q4, ~90MB)
Task: text-generation (chat mode)

For each Top-5 project:

Step A: Deterministic extractive reasoning (grounded)
  - Tìm tech_stack overlap với JD
  - Tìm câu tốt nhất từ description (cosine sim với JD)
  - Trích quantified signals (%, x, ms, $)
  - Build structured reasoning string

Step B: SmolLM2 generative reasoning
  messages = [
    system: "Senior technical recruiter. One sentence explaining why project is relevant.",
    user: "JD excerpt + project text"
  ]
  output: assistant content (max 80 tokens)

Step C: Faithfulness Gate
  - Build source vocab từ JD + project (title, description, tech_stack)
  - Tokenize generated sentence
  - Reject toàn bộ câu nếu bất kỳ token nào là:
      * Proper noun / mixed-case term không có trong source vocab
      * Tech term với digit/separator không có trong source vocab
  - Nếu pass: append "Summary: {generated}" vào extractive reasoning
  - Nếu fail (hallucination detected): chỉ dùng extractive reasoning

Step D: Result
  { project_id, fit_score, client_reasoning }
```

**Tại sao cần faithfulness gate?** Model 135M parameters thường hallucinate tech names (e.g., "Redis Cache Pro", "AWS Lambda X3"). Gate đảm bảo chỉ những token có trong source corpus được xuất hiện trong output.

### 3.3 WebWorker Fallback (Server-Side)

Khi WebWorker fail (OOM, no WebGPU, incompatible browser, Worker constructor error):

```
aiClientService.ts → fallback()
    │
    └── callFallbackClientAI({ jd_text, project_gallery })
          POST /api/v1/fallback/client-ai
               │
               └── GeminiLLMAdapter.rank_projects_for_jd()
                     Model: Gemini 2.5 Flash
                     Prompt: PROJECT_RANKER prompts
                     Output: List[ClientAIResult] (Top 5)
```

Response shape **giống hệt** WebWorker output — UI không cần branching logic.

### 3.4 Strategic Enhancement (Server-Side)

Sau khi user chọn projects trong `ProjectSelectionHub`:

```
Frontend → POST /api/v1/analyses/enhance-from-gallery
  { cv_text, jd_text, client_results: [{ project_id, fit_score, reasoning }] }

Security validation:
  project_repo.verify_selected(user_id, selected_ids)
  ↳ Re-fetch từ Supabase — không bao giờ trust frontend payload
  ↳ Raise 403 nếu bất kỳ ID nào invalid hoặc không thuộc user

SQS message (type: "gallery_enhance"):
  { job_id, cv_text, jd_text, verified_projects[] }

Lambda Worker:
  GeminiLLMAdapter.enhance_from_gallery(cv_text, jd_text, verified_projects)
  ↳ STRATEGIC_ENHANCER prompts
  ↳ Inject selected projects into CV rewrite
  ↳ Return CVResumeSchema (projects section replaced with selected gallery items)
```

---

## 4. Prompt Templates (`core/prompts/cv_analysis_prompt.py`)

| Constant | Node / Use | Description |
|----------|-----------|-------------|
| `ANALYZER_SYSTEM_PROMPT` | Analyzer | FAANG recruiter persona |
| `ANALYZER_HUMAN_PROMPT` | Analyzer | CV + JD → score/gaps/red-flags |
| `ENHANCER_SYSTEM_PROMPT` | Enhancer | Senior CV writing expert persona |
| `ENHANCER_HUMAN_PROMPT` | Enhancer | CV + gap analysis → CVResumeSchema JSON |
| `STRATEGIC_ENHANCER_SYSTEM_PROMPT` | Strategic mode | Strategic career consultant persona |
| `STRATEGIC_ENHANCER_HUMAN_PROMPT` | Strategic mode | CV + JD + verified projects → CVResumeSchema |
| `PROJECT_RANKER_SYSTEM_PROMPT` | Fallback ranker | Technical recruiter persona |
| `PROJECT_RANKER_HUMAN_PROMPT` | Fallback ranker | Gallery + JD → Top-5 ClientAIResult |

Tất cả prompts là **module-level constants** — không inline trong graph node functions. Dễ diff, dễ version control.

---

## 5. Structured Output — CVResumeSchema

Schema là **single source of truth** cho toàn bộ CV pipeline:

```
LLM Enhancer output
      │
      ▼
CVResumeSchema (Pydantic, validated)
      │
      ├── Stored in DynamoDB (AnalysisResult.enhanced_cv_json)
      ├── Sent to frontend (AnalysisStatusResponse.result.enhanced_cv_json)
      ├── Rendered to HTML → PDF (WeasyPrint) server-side
      └── Used by CVFormBuilder for live editing + CVPreview for display
```

```python
class CVResumeSchema(BaseModel):
    personal_info: PersonalInfo         # name, email, phone, location, links
    summary: Optional[Summary]          # 3-sentence executive summary
    experiences: List[Experience]       # STAR bullets, reverse chrono
    education: List[Education]          # Preserved exactly
    projects: List[Project]             # Tech stack, STAR descriptions
    skill_groups: List[SkillGroup]      # JD-relevant skills first
    awards_certifications: List[...]    # Preserved exactly
    recommended_actions: List[str]      # Strategic mode only
```

---

## 6. Error Handling & Retry

### SQS Retry Strategy

```
Lambda Worker exception
    │
    ├── Re-raise → SQS marks message NOT DELETED
    │              → Retry after visibility timeout (330s)
    │              → Max retries: configurable (default 3)
    │
    └── Max retries exceeded → Dead Letter Queue (DLQ)
                               (permanent errors, schema violations)
```

**Double-execute prevention:** X-Ray annotations (`annotate_kv`) run in a separate `try/except` block *before* `use_case.execute()`. If annotation fails for any reason, `execute()` still runs exactly once — observability failure can never cause the pipeline to run twice.

### Job Status Propagation

```
AnalyzeCVUseCase.execute():
    Step 1–7 exception → job.status = FAILED, job.error = str(exc)
    Step 8 exception   → WARNING log only (non-critical history save)

Frontend (Realtime-first):
    subscribe Supabase Realtime channel job:<jobId>
    ├── broadcast received → fetch GET /analyses/{jobId} once for full payload
    ├── CHANNEL_ERROR / TIMED_OUT → fallback to HTTP polling (_pollUntilDone)
    └── Realtime timeout (10 min) → fallback to HTTP polling

HTTP polling fallback (_pollUntilDone):
    interval: 3 000 ms
    max attempts: 200 (~10 min total)
    error tolerance: up to 3 consecutive network errors silently retried
    status == 'failed' → display error, allow retry (reset())
    max attempts exceeded → timeout error
```

### LLM Error Handling

- **GeminiLLMAdapter**: JSON parsing failures → custom regex fallback → if still fails, raises exception
- **FallbackLLMAdapter**: Gemini exception → transparent retry on Groq
- **WebWorker**: Any import/model error → `FALLBACK_REQUIRED` message → server-side Gemini

---

## 7. Model Selection Rationale

### Gemini 2.5 Flash (primary server model)

| | Gemini 2.5 Flash | GPT-4o | Claude 3 Haiku |
|--|-----------------|--------|----------------|
| Context window | **1M tokens** | 128K | 200K |
| Cost (input/1M tokens) | **$0.15** | $2.50 | $0.25 |
| Structured output | Native (function calling) | Native | Native |
| Speed | Fast | Medium | Fast |

CV + JD thường < 10K tokens. Gemini 2.5 Flash đủ mạnh với cost thấp hơn GPT-4o **16×**.

### all-MiniLM-L6-v2 (WebWorker embeddings)

- 23 MB quantized — tải nhanh trong browser
- 384-dimensional embeddings — đủ chất lượng cho semantic similarity ranking
- Chạy hoàn toàn offline sau lần đầu cache

### SmolLM2-135M-Instruct (WebWorker reasoning)

- 90 MB (q4) — minimal footprint
- Instruction-tuned → follows chat template
- Giới hạn: 135M params confabulate → faithfulness gate bắt buộc

---

## 8. Observability (LLMOps)

### LangSmith Tracing

- Tự động trace tất cả LangChain/LangGraph calls khi `LANGCHAIN_API_KEY` được set
- Mỗi `analyze_and_enhance()` call tạo 1 trace với 2 spans (Analyzer, Enhancer)
- Visible: inputs, outputs, latency, token count, model name

### DeepEval Evaluation Suite (`eval/cv-enhancer-deepeval/`)

Chạy trong Docker container:
```bash
docker compose run --rm eval
```

Đánh giá chất lượng LLM output theo các metrics:
- **Faithfulness** — output có trung thực với input không?
- **Relevancy** — bullets có liên quan đến JD không?
- **STAR adherence** — bullets có đúng format STAR không?

Yêu cầu `GOOGLE_API_KEY` trong `.env`.

### AWS X-Ray

- HTTP request tracing qua FastAPI middleware
- SQS records được annotate với `event_source`, `job_id`, `s3_key`
- Best-effort (silent failure if X-Ray daemon not available)
