# AI Workflow — LangGraph, Prompt Design & STAR Method

> Tài liệu này giải thích chi tiết luồng AI trong Radiance: kiến trúc LangGraph, triết lý thiết kế prompt, và các quyết định kỹ thuật về output format.

---

## Table of Contents

1. [Agentic Workflow Overview](#1-agentic-workflow-overview)
2. [LangGraph: Nodes & Edges](#2-langgraph-nodes--edges)
3. [Node 1: Analyzer — Prompt Design](#3-node-1-analyzer--prompt-design)
4. [Node 2: Enhancer — STAR Method Prompt](#4-node-2-enhancer--star-method-prompt)
5. [Structured Output với Pydantic](#5-structured-output-với-pydantic)
6. [Editor AI — Inline Refinement](#6-editor-ai--inline-refinement)
7. [Từ bỏ LaTeX: Quyết định về Output Format](#7-từ-bỏ-latex-quyết-định-về-output-format)
8. [Model Selection: Gemini 2.5 Flash](#8-model-selection-gemini-25-flash)
9. [Error Handling trong AI Pipeline](#9-error-handling-trong-ai-pipeline)

---

## 1. Agentic Workflow Overview

Radiance sử dụng **LangGraph** để xây dựng một stateful, multi-step AI workflow. Thay vì một prompt duy nhất làm mọi thứ (dễ bị hallucination và output kém chất lượng), pipeline được tách thành 2 node chuyên biệt:

```
                    ┌─────────────────────────────────┐
                    │         LangGraph Graph          │
                    │                                  │
Input:              │  ┌──────────────┐               │
  cv_text ─────────►│  │   ANALYZER   │               │
  jd_text ─────────►│  │              │               │
                    │  │  - Score     │               │
                    │  │  - Gaps      │               │
                    │  │  - Red Flags │               │
                    │  └──────┬───────┘               │
                    │         │ state passes           │
                    │  ┌──────▼───────┐               │
                    │  │   ENHANCER   │               │
                    │  │              │               │
                    │  │  - STAR CVs  │               │
                    │  │  - JSON Schema│              │
                    │  └──────┬───────┘               │
                    │         │                        │
                    └─────────┼────────────────────────┘
                              │
Output:                       ▼
                    {
                      matching_score: 78,
                      missing_skills: [...],
                      red_flags: [...],
                      cv_data: CVResumeSchema
                    }
```

**Tại sao 2 node thay vì 1 mega-prompt?**

| | 1 Mega Prompt | 2-Node Pipeline |
|--|-------------|-----------------|
| Instruction following | LLM "forgets" đầu prompt khi output dài | Mỗi node có context ngắn, focused |
| Debug | Khó biết phần nào sai | Dễ isolate: Analyzer sai hay Enhancer sai |
| Output quality | Mixed quality khi nhiều tasks | Mỗi task được tối ưu riêng |
| Token efficiency | Một lần call nhưng rất dài | Hai lần call ngắn hơn, tổng token tương đương |

---

## 2. LangGraph: Nodes & Edges

### State Schema

```python
class CVAnalysisState(TypedDict):
    cv_text: str           # Raw text từ pdfplumber
    jd_text: str           # Job Description text
    # ── Analyzer output ──────────────────────────────
    matching_score: int    # 0–100
    missing_skills: list   # [{"name", "severity", "description"}]
    red_flags: list        # [{"title", "description", "severity"}]
    # ── Enhancer output ──────────────────────────────
    enhanced_cv: dict      # CVResumeSchema JSON
```

### Graph Definition

```python
from langgraph.graph import StateGraph, END

builder = StateGraph(CVAnalysisState)

# Nodes
builder.add_node("analyzer", analyzer_node)
builder.add_node("enhancer", enhancer_node)

# Edges (sequential — no conditional branching needed)
builder.set_entry_point("analyzer")
builder.add_edge("analyzer", "enhancer")
builder.add_edge("enhancer", END)

# Compile once at module load → singleton via lru_cache
graph = builder.compile()
```

### Node Functions

```python
async def analyzer_node(state: CVAnalysisState) -> CVAnalysisState:
    """Node 1: Phân tích CV vs JD, tính score và phát hiện gaps."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", ANALYZER_SYSTEM_PROMPT),
        ("human", ANALYZER_HUMAN_PROMPT),
    ])
    chain = prompt | llm.with_structured_output(_AnalyzerOutput)
    result = await chain.ainvoke({
        "cv_text": state["cv_text"],
        "jd_text": state["jd_text"],
    })
    return {
        **state,
        "matching_score": result.matching_score,
        "missing_skills": result.missing_skills,
        "red_flags": result.red_flags,
    }

async def enhancer_node(state: CVAnalysisState) -> CVAnalysisState:
    """Node 2: Rewrite CV theo STAR method, output CVResumeSchema."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", ENHANCER_SYSTEM_PROMPT),
        ("human", ENHANCER_HUMAN_PROMPT),
    ])
    chain = prompt | llm.with_structured_output(CVResumeSchema)
    result = await chain.ainvoke({
        "cv_text": state["cv_text"],
        "jd_text": state["jd_text"],
        "missing_skills_text": format_skills(state["missing_skills"]),
        "red_flags_text": format_flags(state["red_flags"]),
    })
    return {**state, "enhanced_cv": result.model_dump()}
```

---

## 3. Node 1: Analyzer — Prompt Design

### System Prompt

```
You are a senior ATS consultant and technical recruiter with 15+ years of experience
evaluating engineering candidates at FAANG-level companies.
Your analysis is objective, data-driven, and ruthlessly actionable.
You identify not only skill gaps but also the structural red flags that experienced
recruiters notice immediately and that cost candidates interviews.
```

**Triết lý:** Đặt persona cụ thể (ATS consultant + FAANG recruiter) thay vì chung chung ("You are a helpful assistant"). LLM respond tốt hơn khi được gán role với domain expertise rõ ràng.

### Human Prompt (key sections)

```
## Your Task
Perform a rigorous, structured evaluation of the CV against the Job Description.

### 1. Matching Score (0–100)
Score overall ATS fit using these weights:
- Technical skills & technology stack overlap → 40%
- Years and depth of directly relevant experience → 30%
- Domain / industry alignment → 20%
- Education, certifications & required qualifications → 10%

### 2. Missing Skills
...
Classify each gap:
- `critical`     → Deal-breaker; candidate will fail technical screening without it
- `recommended`  → Strongly preferred; significantly weakens application
- `nice-to-have` → Beneficial but candidate can still succeed

### 3. Red Flags
Identify structural issues that experienced recruiters flag:
- Unexplained employment gaps (> 3 months)
- Job-hopping (multiple roles < 1 year)
- Vague bullets with zero quantified results
- Mismatch between claimed seniority and described experience depth
- Buzzword-heavy skills section with no evidence of use
```

**Lessons từ prompt iteration:**

1. **Scoring weights phải explicit** — nếu chỉ nói "score 0-100" LLM sẽ cho điểm ngẫu nhiên và khó consistent
2. **Severity labels phải có definition** — `critical` / `recommended` / `nice-to-have` với mô tả rõ tránh LLM inconsistency
3. **Red flags phải enumerated** — list cụ thể những gì cần check, không để LLM tự quyết

---

## 4. Node 2: Enhancer — STAR Method Prompt

### System Prompt

```
You are an elite technical resume writer specialising in ATS optimisation and the STAR
methodology. You transform ordinary CVs into compelling, metric-rich structured data that
passes automated ATS filters and impresses senior hiring managers at top tech companies.
You write precisely, avoid fluff, and every claim you make is grounded in the original CV.
You output ONLY structured JSON — no Markdown, no LaTeX, no plain text explanation.
```

**Key constraint: "grounded in the original CV"** — tránh hallucination. LLM có xu hướng thêm achievements không có trong CV gốc (vd: "Increased revenue by 40%"). Constraint này force LLM chỉ rewrite, không fabricate.

### STAR Method Instructions (trích đoạn tinh túy nhất)

```
### experiences (highest priority — STAR method)
- For each position, rewrite every bullet using the STAR method:
  Situation → Task → Action → Result

- Begin each bullet with a strong past-tense action verb:
  Architected, Spearheaded, Reduced, Automated, Scaled, Shipped,
  Delivered, Optimised, Engineered, Led

- Quantify every result: percentages, latency/throughput numbers,
  team size, cost savings ($), revenue impact, uptime figures

- Eliminate all fluff:
  "responsible for", "helped with", "worked on", "participated in"

- Each bullet: a single dense sentence of 20–35 words

- Preserve company names, role titles, and date ranges EXACTLY
  from the original CV
```

### Anti-Hallucination Constraints

```
### personal_info (PRESERVE EXACTLY)
Copy the candidate's name, email, phone, location, and links verbatim.
Do NOT invent, alter, or omit any contact detail.

### education
institution, degree, major, start_date, end_date, location, gpa:
PRESERVE EXACTLY — do NOT invent any field.

### Addressing Red Flags
Vague bullets: transform with STAR method — do NOT fabricate specific
numbers; use ranges or qualitative improvements if needed.
```

**Tại sao cần viết "PRESERVE EXACTLY" thay vì "don't change"?**

Testing cho thấy "don't change" đôi khi bị LLM diễn giải là "don't change much". "PRESERVE EXACTLY" + "verbatim" cho signal mạnh hơn về intent.

### Full STAR Transformation Example

**Before (CV gốc):**
```
• Worked on microservices architecture for e-commerce platform
• Helped improve system performance
• Responsible for code reviews
```

**After (STAR-enhanced):**
```
• Architected event-driven microservices system handling 50K concurrent users,
  reducing inter-service latency by 35% through async message queuing with Kafka

• Diagnosed and resolved N+1 query bottleneck in product catalog service,
  cutting average response time from 800ms to 120ms (85% improvement)

• Led code review process for team of 8 engineers, establishing PR checklist
  that reduced production bugs by 40% over two quarters
```

---

## 5. Structured Output với Pydantic

`with_structured_output(Schema)` là feature của LangChain cho phép LLM output đúng format JSON được validate bởi Pydantic model. Gemini sử dụng **function calling** để đảm bảo output conform với schema.

### CVResumeSchema (trích)

```python
class ExperienceBullet(BaseModel):
    content: str  # STAR-method bullet text

class Experience(BaseModel):
    company: str
    role: str
    start_date: str
    end_date: str
    location: Optional[str]
    bullets: List[ExperienceBullet]

class SkillGroup(BaseModel):
    category: str     # "Programming Languages", "Cloud & DevOps", etc.
    skills: List[str]

class CVResumeSchema(BaseModel):
    personal_info: PersonalInfo
    summary: str
    experiences: List[Experience]
    education: List[Education]
    projects: List[Project]
    skill_groups: List[SkillGroup]
    awards_certifications: List[Award]
```

**Tại sao structured output quan trọng?**

Nếu output là raw text → frontend phải parse → fragile. Pydantic schema + `with_structured_output`:
1. Validation xảy ra ở LLM level (Gemini function calling)
2. Pydantic validation thêm một lần ở Python side
3. Frontend nhận clean JSON có thể bind trực tiếp vào React form state

---

## 6. Editor AI — Inline Refinement

Ngoài LangGraph pipeline chính, có một AI endpoint riêng cho việc chỉnh sửa inline trong workspace:

```
POST /api/v1/editor/refinements
{ "selected_text": "Worked on Python scripts", "prompt": "Rewrite as STAR bullet" }
← { "new_text": "Automated ETL pipeline processing 2M records daily..." }
```

### Editor System Prompt

```python
_SYSTEM_PROMPT = """You are an expert technical resume writer.
Your task is to refine a specific piece of text from a CV based on the user's instruction.

Rules:
1. Output ONLY the refined text — no explanation, no preamble, no quotes
2. Preserve the original meaning; do not fabricate achievements
3. Apply STAR method when rewriting experience bullets
4. Use strong action verbs and quantify results where evidence exists
5. Match the tone and style of professional technical resumes
6. Keep the refined text concise — same length or shorter than original"""
```

Đây là stateless Gemini call (không có LangGraph) vì:
- Input/output rất nhỏ (< 200 tokens)
- Không cần multi-step reasoning
- Latency ưu tiên < 3 giây để UX tốt

---

## 7. Từ bỏ LaTeX: Quyết định về Output Format

### Timeline

**Version 1.0:** LLM output → LaTeX string → `pdflatex` compile → PDF

**Vấn đề phát sinh trong testing:**

| Issue | Tần suất |
|-------|---------|
| Unescaped special chars (`&`, `%`, `_`, `#`) | ~20% requests |
| Vietnamese Unicode trong LaTeX packages | ~30% requests với CV tiếng Việt |
| `\begin{itemize}` không đóng đúng | ~10% requests |
| `pdflatex` không có trong Lambda base image | Cần custom layer |

15–30% error rate trong production là không thể chấp nhận.

**Version 2.0:** LLM output → CVResumeSchema (JSON) → Jinja2 HTML template → WeasyPrint → PDF

### Tại sao HTML/CSS thay LaTeX?

**1. LLM không cần biết về formatting**

Thay vì bắt LLM generate LaTeX (một DSL phức tạp), LLM chỉ cần output **structured data** (JSON). Template `cv_template.html` lo việc presentation. Separation of concerns: AI làm content, template làm design.

**2. Preview ngay trong browser**

HTML template có thể render trực tiếp trong browser (CVPreview component). User thấy preview realtime khi chỉnh sửa form — không cần call API để preview.

**3. WeasyPrint hỗ trợ Unicode natively**

Vietnamese, Chinese, Japanese characters render đúng mà không cần cài thêm LaTeX packages. Chỉ cần DejaVu fonts (có trong Dockerfile).

**4. CSS dễ maintain hơn LaTeX**

CV template designer có thể là Frontend Engineer quen CSS, không cần biết LaTeX. Responsive design, print media queries — ecosystem tooling phong phú hơn.

### LaTeX Legacy

File `resume_template.tex` và `latex_compiler_adapter.py` vẫn được giữ trong codebase nhưng **không được wire vào `container.py`**. Lý do giữ lại:
- Tài liệu lịch sử về quyết định design
- Có thể được kích hoạt lại nếu có nhu cầu export LaTeX

---

## 8. Model Selection: Gemini 2.5 Flash

### Tại sao Gemini thay vì GPT-4o/Claude?

| | Gemini 2.5 Flash | GPT-4o | Claude 3 Haiku |
|--|-----------------|--------|----------------|
| Context window | 1M tokens | 128K | 200K |
| Structured output | Native (function calling) | Native | Native |
| Speed | Fast | Medium | Fast |
| Cost (input/1M) | $0.15 | $2.50 | $0.25 |
| Vietnam region latency | Low (Google infra) | Medium | Medium |

CV text + JD thường < 10K tokens. Gemini 2.5 Flash đủ mạnh cho task này với cost thấp hơn GPT-4o 16x.

**1M context window:** Không cần chunking hay RAG cho CV analysis. Toàn bộ CV + JD fit vào một call.

### Model Version

Codebase configure qua env var `GEMINI_MODEL=gemini-2.5-flash` (`.env.example`). Lambda function env cũng set `GEMINI_MODEL=gemini-2.5-flash`. Dễ upgrade model mà không cần redeploy code — chỉ cần update Lambda env var.

---

## 9. Error Handling trong AI Pipeline

### Retry tự động qua SQS

Khi Gemini API trả về lỗi (rate limit, 503, network timeout), Lambda throw exception → SQS re-deliver message → retry tự động. Không cần implement retry logic trong application code.

### Pydantic Validation Errors

Nếu `with_structured_output` fail (LLM output không conform schema), LangChain raise `OutputParserException`. Pipeline catch và update DynamoDB `status=FAILED` với error message. Frontend hiển thị error state.

### Graceful Degradation

```python
async def execute(self, job_id: str, s3_key: str, jd_text: str):
    try:
        await self._job_repo.update(job_id, status="PROCESSING")
        # ... pipeline ...
        await self._job_repo.update(job_id, status="COMPLETED", result=result)
    except Exception as exc:
        logger.error("Pipeline failed for job %s: %s", job_id, exc, exc_info=True)
        await self._job_repo.update(job_id, status="FAILED", error=str(exc))
        raise  # Re-raise để SQS biết message chưa được xử lý thành công
```

`raise` sau khi update `FAILED` đảm bảo SQS vẫn retry — hữu ích nếu failure là transient (rate limit). Nếu failure là permanent (invalid PDF, schema luôn sai), DLQ (Dead Letter Queue) nên được cấu hình để tránh infinite retry.
