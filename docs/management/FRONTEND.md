# Radiance Frontend — Technical Documentation

## 1. Tổng quan

Frontend nằm trong **`apps/web`**: Next.js 14 (App Router), static export, kết nối backend CV-Enhancer qua REST. Luồng sản phẩm:

1. **Upload** — PDF CV + Job Description  
2. **Phân tích** — upload S3 → trigger job → poll kết quả  
3. **Dashboard** — điểm ATS, skill gaps, red flags  
4. **Workspace** — chỉnh sửa CV dạng **form structured JSON** (`CVResumeSchema`), preview HTML/PDF, AI refine từng trường, render PDF qua API  

Backend lưu job trên **DynamoDB** và xử lý bất đồng bộ qua **SQS + Lambda**; frontend chỉ cần `NEXT_PUBLIC_API_URL` trỏ tới API (xem [BACKEND.md](./BACKEND.md) phần AWS).

---

## 2. Cấu trúc thư mục (`apps/web/`)

```
apps/web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # Upload (/)
│   ├── dashboard/page.tsx    # /dashboard
│   └── workspace/page.tsx    # /workspace
├── components/
│   ├── dashboard/
│   │   ├── AnalysisDashboard.tsx
│   │   ├── ScoreGauge.tsx
│   │   ├── SkillGaps.tsx
│   │   └── RedFlags.tsx
│   ├── editor/
│   │   ├── CVFormBuilder.tsx    # Form chỉnh CVResumeSchema + AI popover
│   │   ├── CVPreview.tsx        # Live HTML preview hoặc iframe PDF
│   │   ├── FloatingAIMenu.tsx    # (legacy / Monaco helper, không gắn page chính)
│   │   └── MonacoEditorWrapper.tsx
│   └── ui/
│       ├── NavBar.tsx
│       ├── CVDropzone.tsx
│       ├── JDTextarea.tsx
│       ├── AnalyzingOverlay.tsx
│       └── PDFPreview.tsx       # không dùng bởi workspace hiện tại
├── services/
│   ├── api.ts              # Client, types, uploadAndAnalyze, aiRefineText, renderCvToPdf
│   └── mockData.ts         # LOADING_STEPS
├── store/
│   └── useCVStore.ts       # Zustand
├── next.config.mjs
├── tailwind.config.ts
└── package.json
```

---

## 3. Routing

| Route | File | Mô tả |
| ----- | ---- | ----- |
| `/` | `app/page.tsx` | Upload, validate JD ≥ 50 ký tự, `uploadAndAnalyze` |
| `/dashboard` | `app/dashboard/page.tsx` | Kết quả phân tích, CTA vào workspace |
| `/workspace` | `app/workspace/page.tsx` | `CVFormBuilder` + `CVPreview`, render PDF |

**Next.js:** `output: 'export'`, `trailingSlash: true`, `images.unoptimized`. Các page chính dùng `'use client'`.

---

## 4. State — `store/useCVStore.ts`

| Field | Ý nghĩa |
| ----- | -------- |
| `cvFile`, `jdText` | Input upload |
| `jobId`, `analysisResult` | Job async + `AnalysisResultDTO` |
| **`cvData`** | `CVResumeSchema \| null` — dữ liệu workspace (từ `enhanced_cv_json`) |
| `pdfUrl` | URL PDF (presigned) sau render hoặc từ kết quả phân tích |
| `phase` | `upload` \| `analyzing` \| `dashboard` \| `workspace` |
| `loadingStepIndex`, `loadingSteps` | Overlay khi phân tích |

**Luồng dữ liệu:** Dashboard `setCvData(analysisResult.enhanced_cv_json)` + `setPdfUrl(pdf_url)` trước khi vào workspace. Workspace cập nhật `cvData` khi user sửa form; render PDF gọi `renderCvToPdf(cvData)`.

---

## 5. API — `services/api.ts`

**Base URL:** `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'`

| Hàm / area | Endpoint | Ghi chú |
| ---------- | -------- | ------- |
| `AnalysisService.getUploadUrl` | `POST /api/v1/resumes/upload-urls` | |
| `AnalysisService.uploadToS3` | PUT presigned | |
| `AnalysisService.triggerAnalysis` | `POST /api/v1/analyses` | 202 + job id |
| `AnalysisService.pollJobStatus` | `GET /api/v1/analyses/{id}` | 2s interval, max ~10 phút |
| `uploadAndAnalyze` | orchestration | `onStep(0..4)` cho UI |
| `aiRefineText` | `POST /api/v1/editor/refinements` | plain text → `new_text` |
| **`renderCvToPdf`** | `POST /api/v1/editor/renders` | Body `{ cv_data: CVResumeSchema }` |

### Types quan trọng

- **`AnalysisResultDTO`**: `matching_score`, `missing_skills`, `red_flags`, **`enhanced_cv_json`**, `pdf_url` — **không** dùng `latex_code` trong contract hiện tại.
- **`CVResumeSchema`** và các interface lồng (`CVPersonalInfo`, `CVExperience`, …) mirror backend Pydantic.

---

## 6. Components chính

### Upload & layout

- **CVDropzone** — chỉ PDF.  
- **JDTextarea** — paste HTML → plain text; gợi ý độ dài JD.  
- **AnalyzingOverlay** — `phase === 'analyzing'`, steps từ `mockData`.  
- **NavBar** — bước Input / Analysis / Forge.

### Dashboard

- **AnalysisDashboard** — gauge, skill gaps, red flags, `onEnhanceWithAI`.

### Workspace

- **CVFormBuilder** — sections theo schema (personal, experience, education, …); nút AI mở popover gọi `aiRefineText` cho từng field.  
- **CVPreview** — khi có `pdfUrl`: iframe PDF; không thì preview HTML từ `cvData`.  
- **MonacoEditorWrapper / FloatingAIMenu** — vẫn trong repo nhưng **không** được mount trên `workspace/page.tsx` hiện tại; workspace dùng form + popover nội bộ.

---

## 7. Tích hợp backend

| Frontend | Backend |
| -------- | ------- |
| Upload URL + PUT S3 | `resumes.py` + S3 presigned |
| POST analyses | DynamoDB + **SQS** (worker Lambda chạy pipeline) |
| GET analyses | Đọc job từ DynamoDB |
| Refinements | Gemini, plain text |
| Renders | **WeasyPrint** + S3 — input là **JSON**, không phải LaTeX |

Pipeline phân tích server: PDF → text (pdfplumber) → LLM → **CVResumeSchema** → HTML → PDF → S3.

---

## 8. Styling

Tailwind, palette `midnight`, font Inter, utility (`glow-blob`, `bg-grid`, animation classes). Theme tùy chỉnh chủ yếu trong `app/globals.css` và `tailwind.config.ts`.

---

## 9. Environment

| Biến | Mặc định | Mô tả |
| ---- | -------- | ----- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL API CV-Enhancer |

---

## 10. Dependencies (package.json)

- `next` 14.2.5, `react` 18, `zustand`, `@monaco-editor/react`, `lucide-react`, `tailwindcss`, TypeScript.

---

## 11. Chạy dev / build

```bash
cd apps/web
npm install
npm run dev
```

Static export:

```bash
npm run build
# output: out/
```

---

## 12. Xử lý lỗi (tiêu biểu)

- **uploadAndAnalyze** — lỗi → quay `phase` về `upload`, hiển thị message.  
- **renderCvToPdf / aiRefineText** — toast hoặc notification trên workspace.  
- **Dashboard / workspace** — guard: không có `analysisResult` / `cvData` thì redirect về `/`.

---

## 13. Loading steps (`services/mockData.ts`)

Các bước hiển thị khi phân tích (upload → S3 → trigger → poll) được map với `onStep` trong `uploadAndAnalyze` (xem code để đồng bộ index với UI).
