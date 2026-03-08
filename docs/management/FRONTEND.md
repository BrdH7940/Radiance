# Radiance Frontend — Technical Documentation

## 1. Tổng quan

Frontend Radiance là ứng dụng Next.js 14 (App Router) kết nối với backend CV-Enhancer qua REST API. Luồng chính:

1. **Upload** — User upload CV (PDF) và paste Job Description
2. **Analysis** — Backend phân tích async, frontend poll kết quả
3. **Dashboard** — Hiển thị score, skill gaps, red flags
4. **Workspace** — Editor LaTeX + PDF preview + AI refinement

---

## 2. Cấu trúc thư mục

```
apps/web/
├── app/
│   ├── layout.tsx           # Root layout (Inter font, metadata)
│   ├── page.tsx             # Upload page (/)
│   ├── dashboard/page.tsx   # Analysis dashboard (/dashboard)
│   ├── workspace/page.tsx   # LaTeX editor + PDF preview (/workspace)
│   └── globals.css          # Tailwind, CSS vars, animations
├── components/
│   ├── dashboard/
│   │   ├── AnalysisDashboard.tsx  # Score + SkillGaps + RedFlags + CTA
│   │   ├── ScoreGauge.tsx         # Circular ATS score (0–100)
│   │   ├── SkillGaps.tsx          # Missing skills list
│   │   └── RedFlags.tsx           # Red flags list
│   ├── editor/
│   │   ├── MonacoEditorWrapper.tsx # LaTeX Monaco editor
│   │   └── FloatingAIMenu.tsx     # AI rewrite popover
│   └── ui/
│       ├── NavBar.tsx             # 3-step nav (Input → Analysis → Forge)
│       ├── CVDropzone.tsx          # PDF upload (drag & drop)
│       ├── JDTextarea.tsx          # Job description input
│       ├── PDFPreview.tsx          # LaTeX preview / PDF iframe
│       └── AnalyzingOverlay.tsx    # Loading overlay during analysis
├── services/
│   ├── api.ts               # API client, types, orchestration
│   └── mockData.ts          # LOADING_STEPS, MOCK_LATEX_CODE
├── store/
│   └── useCVStore.ts        # Zustand CV state
├── next.config.mjs          # output: 'export', trailingSlash
├── tailwind.config.ts
└── package.json
```

---

## 3. Routing và Pages

| Route | File | Mô tả |
|-------|------|-------|
| `/` | `app/page.tsx` | Upload: CVDropzone + JDTextarea + "Analyze & Enhance CV" |
| `/dashboard` | `app/dashboard/page.tsx` | Kết quả: score, skill gaps, red flags, "Enhance with AI" |
| `/workspace` | `app/workspace/page.tsx` | LaTeX editor + PDF preview + AI refinements |

**Luồng:** Upload → Analyze → Dashboard → Workspace

**Cấu hình Next.js:**
- `output: 'export'` — Static export
- `trailingSlash: true`
- Tất cả pages dùng `'use client'`; routing qua `useRouter()` từ `next/navigation`

---

## 4. State Management — useCVStore

**File:** `apps/web/store/useCVStore.ts`

### Store shape

```typescript
interface CVStore {
  // Input data
  cvFile: File | null
  jdText: string

  // Async job
  jobId: string | null
  analysisResult: AnalysisResultState | null  // AnalysisResultDTO

  // Workspace data (populated when entering workspace from dashboard)
  latexCode: string
  pdfUrl: string

  // UI state
  phase: AppPhase  // 'upload' | 'analyzing' | 'dashboard' | 'workspace'
  loadingStepIndex: number
  loadingSteps: typeof LOADING_STEPS

  // Actions
  setCvFile, setJdText, setJobId, setAnalysisResult,
  setLatexCode, setPdfUrl, setPhase, setLoadingStepIndex, reset
}
```

### Data flow

1. **Upload:** CVDropzone / JDTextarea → `setCvFile` / `setJdText`
2. **Analyze:** `uploadAndAnalyze()` → `setJobId`, `setAnalysisResult`, `setPhase('dashboard')`
3. **Dashboard:** `handleEnhanceWithAI` → `setLatexCode`, `setPdfUrl`, `setPhase('workspace')`
4. **Workspace:** MonacoEditorWrapper → `setLatexCode`; `compileLaTeXToPdf` → `setPdfUrl`

---

## 5. API Service Layer

**File:** `apps/web/services/api.ts`

### Base URL

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
```

### Endpoints

| Method | Endpoint | Mục đích |
|--------|----------|----------|
| POST | `/api/v1/resumes/upload-urls` | Lấy presigned S3 upload URL |
| POST | `/api/v1/analyses` | Bắt đầu job phân tích (trả về job ID) |
| GET | `/api/v1/analyses/{id}` | Poll trạng thái job |
| POST | `/api/v1/editor/refinements` | AI rewrite LaTeX snippet |
| POST | `/api/v1/editor/renders` | Compile LaTeX → PDF |

### AnalysisService (low-level)

| Method | Mô tả |
|--------|-------|
| `getUploadUrl(fileName, contentType)` | → `{ upload_url, s3_key, bucket }` |
| `uploadToS3(file, uploadUrl)` | PUT file lên presigned URL |
| `triggerAnalysis(s3Key, jdText)` | → `{ id, status }` |
| `pollJobStatus(jobId)` | → `AnalysisStatusResponse` |

### Orchestration: uploadAndAnalyze()

1. Lấy presigned URL
2. Upload file lên S3
3. Trigger analysis
4. Poll mỗi 2s (tối đa ~10 phút)
5. Khi hoàn thành: `{ jobId, status, result, error }`
6. `onStep(0..4)` cho loading UI

### Workspace APIs

| Function | Mô tả |
|----------|-------|
| `aiEditSelectedText(selectedText, prompt)` | → `{ newText }` |
| `compileLaTeXToPdf(latexCode)` | → `{ pdf_url, success, error? }` |

---

## 6. Types và Interfaces

### API types (`services/api.ts`)

```typescript
// Upload
ResumeUploadUrlRequest { file_name, content_type }
ResumeUploadUrlResponse { upload_url, s3_key, bucket }

// Analysis
CreateAnalysisRequest { s3_key, jd_text }
CreateAnalysisResponse { id, status }
JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

SkillGapDTO { skill, importance }
RedFlagDTO { title, description, severity }
AnalysisResultDTO {
  matching_score, missing_skills, red_flags,
  latex_code, pdf_url
}
AnalysisStatusResponse { id, status, error?, result? }

// Editor
AIEditResult { newText }
EditorRenderResponse { pdf_url, success, error? }
```

### Component types

```typescript
// MonacoEditorWrapper
SelectionInfo {
  selectedText: string
  screenPosition: { top: number; left: number }
  monacoSelection: { startLineNumber, startColumn, endLineNumber, endColumn }
}

// PDFPreview
ParsedCV { name, location, email, linkedin, github, sections }
ParsedSection { title, entries, summary?, tableRows? }
ParsedEntry { title, subtitle?, date?, bullets }
```

---

## 7. Component Hierarchy

```
RootLayout (layout.tsx)
└── Page (route-specific)
    ├── NavBar (activeStep: 1 | 2 | 3)
    ├── [Upload] CVDropzone, JDTextarea, AnalyzingOverlay
    ├── [Dashboard] AnalysisDashboard
    │   ├── ScoreGauge
    │   ├── SkillGaps
    │   └── RedFlags
    └── [Workspace]
        ├── MonacoEditorWrapper (latexCode, onChange → setLatexCode)
        ├── PDFPreview (latexCode, pdfUrl)
        ├── FloatingAIMenu (aiEditSelectedText)
        └── Toast notifications
```

---

## 8. Chi tiết Components

### 8.1 CVDropzone

- Drag & drop hoặc click để chọn PDF
- Chỉ chấp nhận `application/pdf`
- Gọi `setCvFile(file)` khi có file
- Hiển thị tên file, size, nút Remove

### 8.2 JDTextarea

- Textarea cho Job Description
- `handlePaste`: parse HTML từ clipboard (li, p, h1–h6) → plain text
- Word count, char count; cảnh báo nếu < 50 từ
- `setJdText` khi thay đổi

### 8.3 NavBar

- 3 bước: Input (1), Analysis (2), Forge (3)
- `activeStep` quyết định bước đang active
- Badge "Model Active"

### 8.4 AnalyzingOverlay

- Full-screen overlay khi `phase === 'analyzing'`
- Hiển thị `loadingSteps` theo `loadingStepIndex`
- Progress bar, spinner

### 8.5 AnalysisDashboard

- `ScoreGauge`: gauge tròn 0–100 (emerald/amber/rose theo score)
- `SkillGaps`: danh sách skill thiếu với importance (critical/recommended/nice-to-have)
- `RedFlags`: danh sách red flags với severity (high/medium/low)
- CTA "Enhance with AI" → `onEnhanceWithAI` → set latexCode, pdfUrl, phase, navigate workspace

### 8.6 MonacoEditorWrapper

- Monaco Editor với LaTeX Monarch tokenizer
- Theme `radiance-dark`
- `onSelectionChange`: emit `SelectionInfo` khi user chọn text
- `onEditorMount`: expose editor instance cho parent (apply AI edits)

### 8.7 FloatingAIMenu

- Popover khi user chọn text và click Zap
- Quick prompts: "Make it STAR format", "Add metrics & numbers", etc.
- Input + Generate → gọi `aiEdit(selectedText, prompt)` → `onApply(newText, monacoSelection)`
- Parent dùng `editor.executeEdits()` để thay thế selection

### 8.8 PDFPreview

- **Khi có `pdfUrl`:** iframe hiển thị PDF đã compile
- **Khi chưa có:** parse LaTeX → render HTML (ParsedCV)
- Zoom, page navigation
- `onTextDoubleClick`: double-click text → tìm vị trí trong LaTeX → `handleNavigateToPosition`

---

## 9. Integration với Backend cv-enhancer

### Request/Response mapping

| Frontend | Backend |
|----------|---------|
| `POST /api/v1/resumes/upload-urls` | `resumes.py` → S3 presigned URL |
| `POST /api/v1/analyses` | `analyses.py` → BackgroundTask, job ID |
| `GET /api/v1/analyses/{id}` | `analyses.py` → job status + result |
| `POST /api/v1/editor/refinements` | `editor.py` → Gemini refinement |
| `POST /api/v1/editor/renders` | `editor.py` → pdflatex + S3 upload |

### Luồng phân tích (Backend)

1. Parse CV PDF (Docling)
2. Phân tích vs JD (Gemini LLM)
3. Tạo Markdown CV
4. Chuyển Markdown → LaTeX qua `resume_template.tex`
5. Compile LaTeX → PDF
6. Upload PDF lên S3
7. Lưu result vào job repository

### LaTeX Template (Backend)

**File:** `services/cv-enhancer/src/infrastructure/templates/resume_template.tex`

- Jinja2 với `<< body >>` (tránh conflict với LaTeX `{}`)
- Packages: `lmodern`, `geometry`, `hyperref`, `enumitem`, `titlesec`, `parskip`
- Body được inject bởi `latex_compiler_adapter.py` từ Markdown

### Editor AI flow

1. User chọn LaTeX trong Monaco
2. Click Zap → `FloatingAIMenu` mở
3. User nhập prompt (hoặc quick prompt)
4. `aiEditSelectedText(selectedText, prompt)` → `POST /api/v1/editor/refinements`
5. Backend: `editor_ai.refine()` (Gemini)
6. Frontend: `editor.executeEdits()` thay thế selection

---

## 10. Styling và Theming

### Tailwind

- `midnight` (#020408), `midnight-2` (#0a0f18)
- Font: Inter (Google)
- Utilities: `glow-blob`, `bg-grid`, `animate-in`, `fade-in`, `slide-in-from-bottom-8`

### CSS vars (`globals.css`)

```css
:root {
  --color-bg: #020408;
  --color-bg-2: #0a0f18;
  --font-inter: 'Inter', system-ui, sans-serif;
}
```

### Monaco theme

- `radiance-dark`: background `#05070a`, foreground `#CBD5E1`
- Tokens: comment, keyword.control, keyword, string.math, delimiter, number

---

## 11. Environment

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL |

---

## 12. Dependencies

| Package | Version | Mục đích |
|---------|---------|----------|
| next | 14.2.5 | Framework |
| react | ^18 | UI |
| zustand | ^5.0.11 | State management |
| @monaco-editor/react | ^4.7.0 | LaTeX editor |
| lucide-react | ^0.575.0 | Icons |
| tailwindcss | ^3.4.1 | Styling |

---

## 13. Chạy Frontend

```bash
cd apps/web
npm install
npm run dev
```

Build static:

```bash
npm run build
# Output: out/
```

---

## 14. Error Handling

- **uploadAndAnalyze:** catch → `setValidationError`, `setPhase('upload')`
- **aiEditSelectedText:** catch → hiển thị error trong FloatingAIMenu
- **compileLaTeXToPdf:** catch → toast notification (success/error)
- **Dashboard/Workspace:** `analysisResult === null` hoặc `!latexCode` → redirect về `/`

---

## 15. Loading Steps (mockData.ts)

```typescript
LOADING_STEPS = [
  { id: 1, label: 'Preparing upload…' },
  { id: 2, label: 'Uploading CV to storage…' },
  { id: 3, label: 'Starting analysis…' },
  { id: 4, label: 'Analyzing CV & job description…' },
  { id: 5, label: 'Generating enhanced CV…' },
]
```

`onStep(0..4)` được gọi tương ứng với từng bước trong `uploadAndAnalyze`.
