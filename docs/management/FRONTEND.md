# Frontend Technical Documentation

## Tổng quan

Frontend hiện tại sử dụng MockAPI. Tài liệu này mô tả các API và logic cần kết nối với backend thực tế.

## Kiến trúc Frontend

### State Management

- **Store**: `apps/web/store/useCVStore.ts` (Zustand)
- **State chính**:
    - `cvFile`: File PDF CV
    - `jdText`: Job Description text
    - `latexCode`: LaTeX code được generate
    - `pdfUrl`: URL PDF đã compile
    - `phase`: 'upload' | 'analyzing' | 'workspace'
    - `loadingStepIndex`: Index của loading step hiện tại

### Flow chính

1. **Upload Page** (`apps/web/app/page.tsx`)
    - User upload CV (PDF) và nhập JD
    - Gọi `uploadAndAnalyze()` khi click "Analyze & Enhance CV"
    - Chuyển sang workspace sau khi analyze xong

2. **Workspace Page** (`apps/web/app/workspace/page.tsx`)
    - Editor LaTeX (Monaco Editor)
    - PDF Preview
    - AI Edit: Select text → Gọi `aiEditSelectedText()`
    - Compile PDF: Gọi backend để compile LaTeX → PDF

## APIs cần kết nối Backend

### 1. Upload & Analyze CV

**Function**: `uploadAndAnalyze(cvFile: File, jdText: string, onStep?: (stepIndex: number) => void)`

**Location**: `apps/web/services/api.ts`

**Request**:

```typescript
POST /api/analyze
Content-Type: multipart/form-data

{
  cv: File,        // PDF file
  jd: string       // Job description text
}
```

**Response**:

```typescript
{
  latexCode: string,  // LaTeX code đã được enhance
  pdfUrl: string     // URL của PDF đã compile (hoặc temporary URL)
}
```

**Loading Steps** (từ `mockData.ts`):

1. Parsing PDF document… (900ms)
2. Extracting CV structure… (700ms)
3. Analyzing Job Description… (800ms)
4. Detecting skill gaps… (700ms)
5. Generating enhanced LaTeX… (900ms)

**Backend cần implement**:

- Upload file PDF
- Parse PDF → Extract text/structure
- Analyze JD → Detect skill gaps
- Generate enhanced LaTeX code
- Compile LaTeX → PDF (hoặc trả về LaTeX để frontend compile sau)
- Progress callback để update `loadingStepIndex`

---

### 2. AI Edit Selected Text

**Function**: `aiEditSelectedText(selectedText: string, prompt: string)`

**Location**: `apps/web/services/api.ts`

**Request**:

```typescript
POST /api/ai/edit
Content-Type: application/json

{
  selectedText: string,  // Text được user select trong LaTeX editor
  prompt: string         // User prompt (ví dụ: "Make it STAR format", "Add metrics")
}
```

**Response**:

```typescript
{
    newText: string // Text đã được AI rewrite
}
```

**Backend cần implement**:

- AI service (Gemini/OpenAI) để rewrite text theo prompt
- Context-aware editing dựa trên LaTeX structure

---

### 3. Compile LaTeX to PDF

**Function**: `handleCompile()` trong `apps/web/app/workspace/page.tsx`

**Request**:

```typescript
POST /api/compile
Content-Type: application/json

{
  latexCode: string  // LaTeX code từ editor
}
```

**Response**:

```typescript
{
  pdfUrl: string,      // URL của PDF đã compile
  success: boolean,
  error?: string       // Nếu có lỗi compile
}
```

**Backend cần implement**:

- LaTeX compiler (pdflatex/xelatex)
- Error handling và validation
- Return PDF URL hoặc binary stream

---

### 4. Download PDF

**Function**: `handleDownloadPDF()` trong `apps/web/app/workspace/page.tsx`

**Request**:

```typescript
GET /api/pdf/:id
// hoặc
GET /api/pdf/download?url={pdfUrl}
```

**Response**: PDF binary stream

**Backend cần implement**:

- Serve PDF file từ storage
- Hoặc compile LaTeX on-demand và return PDF

---

## Data Structures

### AnalyzeResult

```typescript
interface AnalyzeResult {
    latexCode: string
    pdfUrl: string
}
```

### AIEditResult

```typescript
interface AIEditResult {
    newText: string
}
```

### CVStore (Zustand)

```typescript
interface CVStore {
    cvFile: File | null
    jdText: string
    latexCode: string
    pdfUrl: string
    phase: 'upload' | 'analyzing' | 'workspace'
    loadingStepIndex: number
    loadingSteps: Array<{ id: number; label: string; duration: number }>
}
```

## Integration Points

### File: `apps/web/services/api.ts`

Thay thế các mock functions bằng real API calls:

```typescript
// Thay đổi từ:
export async function uploadAndAnalyze(...) {
  // Mock implementation
}

// Thành:
export async function uploadAndAnalyze(cvFile: File, jdText: string, onStep?: (stepIndex: number) => void) {
  const formData = new FormData();
  formData.append('cv', cvFile);
  formData.append('jd', jdText);

  const response = await fetch('/api/analyze', {
    method: 'POST',
    body: formData,
    // Handle progress if backend supports streaming/progress events
  });

  if (!response.ok) throw new Error('Analysis failed');

  return await response.json();
}
```

### Environment Variables

Thêm vào `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000  # Backend URL
```

## Error Handling

Frontend hiện tại có basic error handling:

- `uploadAndAnalyze()`: Catch error → Set `validationError` → Reset phase
- `aiEditSelectedText()`: Catch error → Show error message trong FloatingAIMenu

**Backend nên trả về**:

- HTTP status codes chuẩn (400, 500, etc.)
- Error message trong response body:
    ```json
    {
        "error": "Error message",
        "code": "ERROR_CODE"
    }
    ```

## Notes

- Frontend không có authentication hiện tại → Backend cần handle nếu cần auth
- PDF Preview hiện tại parse LaTeX để render HTML → Backend có thể trả về PDF binary để embed trực tiếp
- Loading steps có thể được backend control qua WebSocket hoặc Server-Sent Events để real-time progress
- LaTeX code được lưu trong Zustand store → Có thể persist vào localStorage hoặc backend session nếu cần
