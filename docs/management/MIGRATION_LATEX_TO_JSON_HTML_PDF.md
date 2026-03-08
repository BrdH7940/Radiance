# Kế hoạch migration: Từ LaTeX sang JSON & HTML → PDF

Tài liệu này đối chiếu kế hoạch migration (LaTeX → JSON + HTML/WeasyPrint) với codebase thực tế và với [BACKEND.md](./BACKEND.md), [FRONTEND.md](./FRONTEND.md). Các đường dẫn file, tên class và API đã được kiểm tra với repo hiện tại.

---

## Tổng quan hiện trạng (đối chiếu với docs)

| Khía cạnh          | BACKEND.md / FRONTEND.md                                                               | Codebase thực tế                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend result** | `AnalysisResult`: `latex_code`, `pdf_url`                                              | `core/domain/analysis_job.py`: `AnalysisResult.latex_code`, `pdf_url`                                                                           |
| **LLM output**     | Enhancer → `enhanced_cv_markdown` (Markdown)                                           | `core/ports/llm_port.py`: `FullAnalysisOutput.enhanced_cv_markdown`; `gemini_llm_adapter.py`: `_EnhancerOutput` + `with_structured_output`      |
| **Lưu trữ job**    | InMemory hoặc DynamoDB (production)                                                    | Chỉ có `InMemoryJobRepository` + `JOBS_DB` trong `in_memory_job_repository.py`                                                                  |
| **Editor API**     | `POST /api/v1/editor/refinements` (LaTeX), `POST /api/v1/editor/renders` (LaTeX → PDF) | `presentation/editor.py`: `RefinementRequest.selected_text`, `RenderRequest.latex_code`                                                         |
| **Frontend store** | `latexCode`, `pdfUrl`                                                                  | `store/useCVStore.ts`: `latexCode`, `pdfUrl`                                                                                                    |
| **Workspace UI**   | Monaco + PDF preview + FloatingAIMenu                                                  | `app/workspace/page.tsx`: `MonacoEditorWrapper`, `PDFPreview`, `FloatingAIMenu`; `PDFPreview` dùng `parseLatex(latexCode)` khi chưa có `pdfUrl` |
| **PDF compile**    | LaTeX: Jinja2 + pdflatex                                                               | `latex_compiler_adapter.py` (markdown_to_latex, compile_to_pdf), `resume_template.tex`                                                          |
| **Docker**         | TeX Live (pdflatex)                                                                    | `Dockerfile`: texlive-latex-base, texlive-latex-recommended, texlive-fonts-recommended, lmodern, texlive-latex-extra                            |

---

## Phase 1: Sửa đổi AI & Data Contract (Backend FastAPI)

**Mục tiêu:** Chuyển đầu ra của Enhancer từ Markdown/LaTeX sang JSON cấu trúc chặt chẽ; lưu và trả về JSON thay cho `latex_code`.

### Task 1.1: Định nghĩa Pydantic Schema (Cấu trúc CV)

- [ ] **Tạo schema dùng chung cho Backend (và contract cho Frontend).**
    - **Đề xuất vị trí:** `services/cv-enhancer/src/core/domain/cv_resume_schema.py` (cùng layer với `analysis_job.py`).
    - Định nghĩa các class Pydantic:
        - `PersonalInfo`: `name`, `email`, `phone` (optional), `links` (optional list hoặc dict: linkedin, github, website).
        - `Summary`: `text: str`.
        - `Education`: `institution` (str - tên trường đại học/tổ chức giáo dục), `degree` (str - cấp bậc, ví dụ: Bachelor of Science), `major` (str - chuyên ngành đào tạo), `location` (optional str - địa điểm), `start_date` (str), `end_date` (str hoặc "Present"), `gpa` (optional str - điểm trung bình, ví dụ: "3.8/4.0" hoặc "8.5/10"), `honors` (optional list[str] - các danh hiệu như Dean's List, Valedictorian).
        - `Experience`: `company`, `role`, `date_range` (hoặc `start_date`, `end_date`), `bullets: list[str]`.
        - `Project`: `name` (str - Tên dự án), `role` (str - Vai trò trong dự án, ví dụ: "Backend Developer", "Project Lead"), `tech_stack` (list[str] - Danh sách các công nghệ hoặc ngôn ngữ lập trình chủ chốt được sử dụng), `start_date` (str), `end_date` (str hoặc "Present"), `link` (optional str - Đường dẫn tới repository GitHub, bài viết case study hoặc bản demo trực tuyến), `description` (list[str] - Danh sách các bullet points mô tả chi tiết về bài toán, giải pháp và kết quả đạt được, khuyến khích viết theo mô hình STAR).
        - `Skills`: `dict[str, list[str]]` (category → skills).
        - `AwardsAndCertification`: `title` (str - Tên giải thưởng, học bổng hoặc chứng chỉ chuyên môn, ví dụ: "AWS Certified Solutions Architect"), `link` (optional str - Đường dẫn tới chứng chỉ trực tuyến hoặc mã định danh ID để kiểm chứng).
    - **Root schema:** `CVResumeSchema` với các trường: `personal_info: PersonalInfo`, `summary: Summary | None`, `experiences: list[Experience]`, `education: list[Education]`, `skills: list[str] | dict`, `projects: list[Project]`, `awards_certifications: list[AwardsAndCertification]` (Optional).
    - **Đồng bộ Frontend:** Cần type TypeScript tương ứng (cùng tên trường) trong `apps/web/services/api.ts` hoặc `apps/web/types/cv.ts`; có thể sinh từ Pydantic (công cụ bên ngoài) hoặc giữ tay và ghi rõ trong FRONTEND.md/BACKEND.md.

**Tham chiếu docs:** BACKEND.md §3 Domain Models; hiện không có CV structure schema — đây là bổ sung mới.

### Task 1.2: Cập nhật Prompt & LangGraph Agent

- [ ] **Sửa Enhancer node: output là JSON (CVResumeSchema), không còn Markdown/LaTeX.**
    - **File:** `services/cv-enhancer/src/core/prompts/cv_analysis_prompt.py`: cập nhật `ENHANCER_SYSTEM_PROMPT` và `ENHANCER_HUMAN_PROMPT` — dặn model **không** sinh Markdown hay LaTeX; sinh đúng cấu trúc JSON mô tả bởi schema (có thể in ra mô tả schema trong prompt hoặc tham chiếu tên trường).
    - **File:** `services/cv-enhancer/src/infrastructure/adapters/gemini_llm_adapter.py`:
        - Thay `_EnhancerOutput` (hiện chỉ `enhanced_cv_markdown: str`) bằng output schema trùng với `CVResumeSchema` (hoặc một DTO trùng cấu trúc).
        - Giữ `llm.with_structured_output(...)` cho Enhancer; đảm bảo 100% output là JSON hợp lệ (Pydantic parse được).
    - **File:** `services/cv-enhancer/src/core/ports/llm_port.py`: đổi `FullAnalysisOutput.enhanced_cv_markdown: str` thành `enhanced_cv_json: CVResumeSchema` (hoặc `enhanced_cv: CVResumeSchema`). Cập nhật docstring.

**Tham chiếu docs:** BACKEND.md §10 LLM Pipeline, §10.2 Prompts; code: `_EnhancerOutput`, `analyzer_node`, `enhancer_node`, `FullAnalysisOutput`.

### Task 1.3: Cập nhật luồng lưu trữ (AnalysisResult & API)

- [ ] **Lưu JSON thay cho `latex_code` trong job result.**
    - **File:** `services/cv-enhancer/src/core/domain/analysis_job.py`:
        - Trong `AnalysisResult`: đổi `latex_code: str` thành `enhanced_cv_json: CVResumeSchema` (hoặc `dict` nếu muốn lưu raw JSON; Pydantic sẽ serialize khi gửi API). Nếu giữ tên cũ cho tạm thời tương thích có thể dùng alias.
    - **File:** `services/cv-enhancer/src/core/use_cases/analyze_cv_use_case.py`:
        - Bước 5–6: thay vì Markdown → LaTeX → compile PDF, sẽ thành: dùng trực tiếp `analysis.enhanced_cv_json` (đã là structured). Pipeline PDF ban đầu: có thể tạm bỏ bước LaTeX và dùng luôn HTML + WeasyPrint (xem Phase 4), hoặc tạm giữ bước cũ và thêm bước “JSON → HTML → PDF” song song rồi cắt LaTeX sau.
    - **Lưu result:** tạo `AnalysisResult(..., enhanced_cv_json=..., pdf_url=...)` (không còn `latex_code`). Cập nhật mọi chỗ gán `latex_code` trong use case.
    - **File:** `services/cv-enhancer/src/presentation/analyses.py`:
        - `AnalysisResultDTO`: đổi `latex_code: str` thành `enhanced_cv_json: dict` (hoặc Pydantic model tương thích JSON). Cập nhật chỗ map từ `AnalysisResult` sang DTO (hiện `r.latex_code` → cần `r.enhanced_cv_json`).

**Lưu ý:** Job repository vẫn là `InMemoryJobRepository` (dict `JOBS_DB`); BACKEND.md §14.1 nói production có thể dùng DynamoDB — migration này không bắt buộc đổi repository, chỉ đổi shape của `AnalysisJob.result`.

**Tham chiếu docs:** BACKEND.md §3.2 AnalysisResult, §7.3 Response completed; code: `analyze_cv_use_case.py` bước 5–8, `analyses.py` AnalysisResultDTO và response build.

---

## Phase 2: Đập đi xây lại Workspace (Frontend Next.js)

**Mục tiêu:** Thay Monaco + LaTeX bằng Form Builder (dynamic form từ JSON) và Real-time HTML Preview (A4).

### Task 2.1: Xóa bỏ Monaco Editor & LaTeX Parser

- [ ] **Gỡ Monaco và cập nhật state.**
    - Gỡ dependency: `@monaco-editor/react` trong `apps/web/package.json`.
    - **File:** `apps/web/store/useCVStore.ts`:
        - Đổi `latexCode: string` → `cvData: CVResumeSchema | null` (dùng type TypeScript trùng với backend schema).
        - Đổi `setLatexCode` → `setCvData`.
        - Cập nhật `initialState` và mọi action liên quan.
    - **File:** `apps/web/services/api.ts`:
        - `AnalysisResultDTO`: bỏ `latex_code`, thêm `enhanced_cv_json` (type là interface tương ứng `CVResumeSchema`).
        - Các hàm gọi API (poll, dashboard) dùng `result.enhanced_cv_json` thay vì `result.latex_code`.
    - **File:** `apps/web/app/dashboard/page.tsx`:
        - `handleEnhanceWithAI`: gọi `setCvData(analysisResult.enhanced_cv_json)`, `setPdfUrl(analysisResult.pdf_url)`; không còn `setLatexCode(analysisResult.latex_code)`.
    - Xóa hoặc tắt dùng:
        - `apps/web/components/editor/MonacoEditorWrapper.tsx` (có thể xóa sau khi Form Builder xong).
        - LaTeX parser trong `apps/web/components/ui/PDFPreview.tsx`: hàm `parseLatex`, `stripLatex`, `extractItems`, `parseSection`, các type `ParsedCV`, `ParsedSection`, `ParsedEntry` — chỉ giữ lại phần hiển thị PDF bằng iframe khi có `pdfUrl`; phần “preview từ LaTeX” thay bằng preview từ `cvData` (Task 2.3).

**Tham chiếu docs:** FRONTEND.md §4 useCVStore, §8.6 MonacoEditorWrapper, §8.8 PDFPreview; §6 Types (ParsedCV, ParsedSection, …).

### Task 2.2: Xây dựng Nửa Trái (Form Builder)

- [ ] **Form động từ `cvData` (accordion, add/remove).**
    - Dùng `react-hook-form` (hoặc state thuần với map) để render các trường từ `cvData`.
    - Cấu trúc UI: accordion (đóng/mở từng block: Thông tin cá nhân, Summary, Kinh nghiệm 1, Kinh nghiệm 2, …).
    - Nút “+ Thêm kinh nghiệm”, “Xóa bullet”, “Xóa mục giáo dục”, v.v. để chỉnh sửa list.
    - Mỗi thay đổi cập nhật state (Zustand `cvData`) để Nửa Phải (CVPreview) re-render real-time.
    - **File gợi ý:** component mới `apps/web/components/editor/CVFormBuilder.tsx` (hoặc tách nhỏ: `PersonalInfoForm`, `ExperiencesForm`, …). Trang workspace gọi component này thay cho `MonacoEditorWrapper`.

**Tham chiếu docs:** FRONTEND.md §7 Component hierarchy, §8.6; không có Form Builder hiện tại — bổ sung.

### Task 2.3: Xây dựng Nửa Phải (Real-time HTML A4 Preview)

- [ ] **Component `<CVPreview data={cvData} />`.**
    - Tạo component (ví dụ `apps/web/components/editor/CVPreview.tsx` hoặc mở rộng `PDFPreview.tsx`): nhận `data: CVResumeSchema | null`, render HTML (h1, ul, li, section, …) map từ `data`.
    - CSS A4:
        ```css
        .a4-preview {
            width: 210mm;
            min-height: 297mm;
            padding: 20mm;
            background: white;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        ```
    - Bất kỳ thay đổi nào từ Form Builder (Nửa Trái) → `cvData` thay đổi → Nửa Phải re-render ngay (real-time). Có thể dùng chung style với template WeasyPrint (Phase 4) để WYSIWYG.

**Tham chiếu docs:** FRONTEND.md §8.8 PDFPreview; hiện PDFPreview dùng `parseLatex(latexCode)` khi chưa có `pdfUrl` — thay bằng render từ `cvData`.

### Task 2.4: Cập nhật Workspace Page & API Render

- [ ] **Trang workspace dùng Form + Preview; gọi render API mới (JSON → PDF).**
    - **File:** `apps/web/app/workspace/page.tsx`:
        - Bỏ phụ thuộc `latexCode`, Monaco, TOC LaTeX; dùng `cvData`, `CVFormBuilder`, `CVPreview`.
        - Nút “Compile PDF” / “Export PDF”: gọi `POST /api/v1/editor/renders` với body `{ cv_data: cvData }` (Phase 4 sẽ đổi request từ `latex_code` sang `cv_data`).
    - **File:** `apps/web/services/api.ts`:
        - Hàm tương đương `compileLaTeXToPdf`: đổi tên/tham số thành `renderCvToPdf(cvData: CVResumeSchema)` và gửi `cv_data` (JSON). Response giữ `pdf_url`, `success`, `error`.

**Tham chiếu docs:** FRONTEND.md §5 Workspace APIs, §9 Request/Response mapping.

---

## Phase 3: Cập nhật AI Highlight & Edit (Refinements)

**Mục tiêu:** Refinement theo từng ô nội dung (plain text), không còn chọn đoạn LaTeX trong editor.

### Task 3.1: Frontend — Nút “AI Rewrite” cạnh Input

- [ ] **Mỗi ô text (ví dụ bullet, summary) có icon Sparkle (✨) mở popover.**
    - Popover: “Bạn muốn sửa đoạn này thế nào?” + input prompt (hoặc quick prompts).
    - Gửi nội dung ô hiện tại + prompt lên `POST /api/v1/editor/refinements`.
    - Nhận `new_text` → cập nhật đúng ô tương ứng trong `cvData` (không làm hỏng cấu trúc).

**Tham chiếu docs:** FRONTEND.md §8.7 FloatingAIMenu (hiện gắn với selection LaTeX); chuyển sang gắn với từng field trong Form Builder.

### Task 3.2: Backend — Cập nhật API `POST /api/v1/editor/refinements`

- [ ] **Contract: nhận “đoạn text cũ” + prompt, trả về “đoạn text mới” (plain text).**
    - **File:** `services/cv-enhancer/src/presentation/editor.py`:
        - Request: giữ hoặc đổi tên field: `selected_text` → có thể đổi thành `current_text` (hoặc giữ tên, chỉ đổi ý nghĩa: không còn LaTeX). `prompt` giữ nguyên.
        - Response: vẫn `new_text: str` (plain text, không LaTeX).
    - **File:** `services/cv-enhancer/src/core/ports/editor_ai_port.py`:
        - Docstring: refine “a piece of text” (e.g. bullet or summary), return refined plain text; không còn “LaTeX snippet”.
    - **File:** `services/cv-enhancer/src/infrastructure/adapters/editor_ai_gemini_adapter.py`:
        - System prompt: bỏ yêu cầu LaTeX; yêu cầu chỉ trả về đoạn văn bản đã chỉnh sửa (plain text), không markdown/LaTeX/code fence.
    - Frontend gọi cùng endpoint với `current_text` = nội dung ô, `prompt` = instruction; nhận `new_text` và gán lại vào field tương ứng trong `cvData`.

**Tham chiếu docs:** BACKEND.md §7.4 Editor Refinements; FRONTEND.md §9 Editor AI flow.

---

## Phase 4: Tích hợp WeasyPrint & HTML Export (PDF từ JSON)

**Mục tiêu:** Backend nhận JSON CV, render HTML (Jinja2), dùng WeasyPrint xuất PDF, upload S3, trả về `pdf_url`. Loại bỏ TeX/LaTeX khỏi Docker và use case.

### Task 4.1: Cập nhật Dockerfile & Dependencies

- [ ] **Gỡ TeX Live; thêm WeasyPrint và system deps.**
    - **File:** `services/cv-enhancer/Dockerfile`:
        - Xóa các gói: `texlive-latex-base`, `texlive-latex-recommended`, `texlive-fonts-recommended`, `lmodern`, `texlive-latex-extra`.
        - Thêm system packages cho WeasyPrint (Debian/Ubuntu), ví dụ:
            ```dockerfile
            RUN apt-get update && apt-get install -y --no-install-recommends \
                libpango-1.0-0 \
                libharfbuzz0b \
                libpangoft2-1.0-0 \
                libffi-dev \
                libjpeg-dev \
                libopenjp2-7-dev \
                # WeasyPrint thường cần thêm (kiểm tra weasyprint docs):
                # libcairo2 libgdk-pixbuf2.0-0 shared-mime-info
            && rm -rf /var/lib/apt/lists/*
            ```
        - Nên đối chiếu với [WeasyPrint dependencies](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html) cho image base đang dùng (`python:3.11-slim`).
    - **File:** `services/cv-enhancer/requirements.txt`:
        - Thêm `weasyprint` (version theo compatibility Python 3.11).
        - `jinja2` đã có; giữ nguyên.

**Tham chiếu docs:** BACKEND.md §9 Dependencies (system: pdflatex); §12.2 Docker.

### Task 4.2: Port & Adapter PDF từ HTML (thay LaTeX compiler)

- [ ] **Port mới (hoặc thay ILaTeXCompilerService): HTML + JSON → PDF.**
    - **Đề xuất:** tạo port `IPDFRenderService` (ví dụ `core/ports/pdf_render_port.py`) với method ví dụ: `render_cv_to_pdf(cv_data: CVResumeSchema, output_dir: str) -> str` (trả về đường dẫn file PDF local), hoặc `render_cv_to_pdf_bytes(cv_data: CVResumeSchema) -> bytes`.
    - Adapter: `WeasyPrintPDFAdapter` (hoặc đặt tên rõ ràng) implement port đó: Jinja2 render HTML từ `cv_data` → `HTML(string=html_string).write_pdf()` → trả về path hoặc bytes.
    - **File template:** `services/cv-enhancer/src/infrastructure/templates/cv_template.html` (Jinja2): biến từ `cv_data` (ví dụ `{{ personal_info.name }}`, `{{ summary.text }}`, vòng `for experience in experiences %}`, …). Thêm CSS in ấn:
        ```css
        @page {
            size: A4;
            margin: 20mm;
        }
        ```
    - Có thể copy cấu trúc/layout từ component `<CVPreview />` (Phase 2) sang Jinja2 để PDF giống preview.

### Task 4.3: Viết lại API `POST /api/v1/editor/renders` và pipeline analysis

- [ ] **Request: JSON `cv_data` (CVResumeSchema).**
    - **File:** `services/cv-enhancer/src/presentation/editor.py`:
        - `RenderRequest`: bỏ `latex_code`; thêm `cv_data` (Pydantic model `CVResumeSchema` hoặc dict validate bằng schema).
        - Handler: gọi `IPDFRenderService.render_cv_to_pdf(cv_data)` (hoặc tương đương) → file PDF → upload lên S3 `enhanced-pdf/` (tái sử dụng logic hiện tại) → `pdf_url`.
        - Response giữ nguyên: `RenderResponse(pdf_url=..., success=True, error=None)`.
    - **File:** `services/cv-enhancer/src/core/use_cases/analyze_cv_use_case.py`:
        - Bước 5–6: thay “Markdown → LaTeX → pdflatex” bằng “enhanced_cv_json → Jinja2 HTML → WeasyPrint → PDF”. Có thể gọi cùng `IPDFRenderService` (hoặc logic tương tự) với `analysis.enhanced_cv_json`.
    - **Container:** đăng ký adapter WeasyPrint thay cho (hoặc bên cạnh) `LocalLaTeXCompiler`; inject vào use case và editor route. Có thể xóa `ILaTeXCompilerService` / `LocalLaTeXCompiler` sau khi chuyển hết.

**Tham chiếu docs:** BACKEND.md §7.5 Editor Renders, §11 LaTeX Compilation; code: `editor.py` `create_render`, `analyze_cv_use_case.py` steps 5–7.

---

## Ràng buộc và ghi chú bổ sung

1. **Schema đồng bộ:** Backend (Pydantic) và Frontend (TypeScript) phải dùng cùng tên trường và cấu trúc. Nên có một nguồn chân lý (file schema hoặc doc) và cập nhật FRONTEND.md/BACKEND.md khi đổi.
2. **Thứ tự thực hiện:** Phase 1 (Backend schema + LLM + result) nên xong trước để API trả về `enhanced_cv_json`; Phase 2 (Frontend) dùng ngay JSON đó; Phase 3 và 4 có thể làm song song hoặc 4 trước 3 (export PDF sớm).
3. **Tương thích ngược:** Nếu cần chạy song song LaTeX và JSON trong giai đoạn chuyển tiếp, có thể tạm giữ cả `latex_code` và `enhanced_cv_json` trong DTO/result và feature-flag; sau khi ổn định thì xóa hẳn LaTeX.
4. **Repository:** Migration này không bắt buộc đổi `InMemoryJobRepository` sang DynamoDB; chỉ đổi kiểu dữ liệu trong `AnalysisResult`. Khi triển khai DynamoDB (BACKEND.md §14.1), chỉ cần đảm bảo serialization/deserialization của `enhanced_cv_json` (JSON/dict) tương thích.

---

## Checklist tóm tắt

| Phase | Task                                                        | File / vị trí chính                                               |
| ----- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| 1.1   | Pydantic CVResumeSchema                                     | `core/domain/cv_resume_schema.py`                                 |
| 1.2   | Enhancer → JSON (prompt + with_structured_output)           | `cv_analysis_prompt.py`, `gemini_llm_adapter.py`, `llm_port.py`   |
| 1.3   | AnalysisResult + DTO: enhanced_cv_json, bỏ latex_code       | `analysis_job.py`, `analyze_cv_use_case.py`, `analyses.py`        |
| 2.1   | Store + API types: cvData, bỏ Monaco/parseLatex             | `useCVStore.ts`, `api.ts`, `dashboard/page.tsx`, `PDFPreview.tsx` |
| 2.2   | Form Builder (accordion, add/remove)                        | `components/editor/CVFormBuilder.tsx` (mới)                       |
| 2.3   | CVPreview A4 real-time từ cvData                            | `CVPreview.tsx` hoặc mở rộng `PDFPreview.tsx`                     |
| 2.4   | Workspace page + render API (body cv_data)                  | `workspace/page.tsx`, `api.ts`                                    |
| 3.1   | Nút AI Rewrite cạnh từng ô, popover                         | Trong Form Builder components                                     |
| 3.2   | Refinements API: plain text in/out                          | `editor.py`, `editor_ai_port.py`, `editor_ai_gemini_adapter.py`   |
| 4.1   | Dockerfile + requirements (WeasyPrint, bỏ TeX)              | `Dockerfile`, `requirements.txt`                                  |
| 4.2   | Port + WeasyPrint adapter + Jinja2 template                 | `pdf_render_port.py`, WeasyPrint adapter, `cv_template.html`      |
| 4.3   | POST /renders nhận cv_data; analysis pipeline dùng HTML→PDF | `editor.py`, `analyze_cv_use_case.py`, container                  |

Sau khi hoàn tất, nên cập nhật [BACKEND.md](./BACKEND.md) và [FRONTEND.md](./FRONTEND.md) để mô tả luồng JSON/HTML/WeasyPrint và bỏ mọi mô tả LaTeX/Monaco còn sót.
