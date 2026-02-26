# Backend Technical Documentation

## Tổng quan

Backend CV Enhancer là một microservice FastAPI độc lập, xử lý phân tích và nâng cấp CV dựa trên Job Description. Service sử dụng LangGraph + Gemini 1.5 Flash để phân tích CV và tạo bản CV được tối ưu hóa theo phương pháp STAR.

## Kiến trúc

```
Frontend → POST /api/v1/cv/enhance → EnhanceCVUseCase → [Parser + AI Agent] → Response
```

**Luồng xử lý:**

1. Parse PDF CV thành Markdown text (Docling)
2. Phân tích CV với JD bằng AI Agent (LangGraph + Gemini)
3. Tính matching score (0-100), xác định skill gaps, rewrite CV theo STAR method
4. Trả về kết quả dưới dạng JSON

## API Endpoints

### 1. Health Check

```http
GET /health
```

**Response:**

```json
{
    "status": "healthy",
    "service": "cv-enhancer"
}
```

### 2. Enhance CV

```http
POST /api/v1/cv/enhance
Content-Type: application/json
```

**Request Body:**

```json
{
    "cv_file_path": "/path/to/cv.pdf",
    "jd_text": "Job description text here..."
}
```

**Request Schema:**

- `cv_file_path` (string, required): Đường dẫn file PDF trên server
- `jd_text` (string, required, min 50 chars): Nội dung Job Description

**Response (200 OK):**

```json
{
    "matching_score": 75,
    "missing_skills": [
        {
            "skill": "Docker",
            "importance": "critical"
        },
        {
            "skill": "Kubernetes",
            "importance": "recommended"
        }
    ],
    "enhanced_cv_content": "# Enhanced CV\n\n## Experience\n\n..."
}
```

**Response Schema:**

- `matching_score` (int, 0-100): Điểm khớp CV với JD
- `missing_skills` (array): Danh sách kỹ năng thiếu
    - `skill` (string): Tên kỹ năng
    - `importance` (string): "critical" | "recommended" | "nice-to-have"
- `enhanced_cv_content` (string): CV đã được rewrite theo STAR method (Markdown format)

**Error Responses:**

- `404`: CV file không tìm thấy
- `422`: Validation error hoặc PDF không parse được
- `500`: Server error

## Cấu hình

### Environment Variables

```bash
GOOGLE_API_KEY=your_gemini_api_key  # Required
GEMINI_MODEL=gemini-1.5-flash       # Optional, default: gemini-1.5-flash
PORT=8000                           # Optional, default: 8000
```

### CORS

CORS đã được cấu hình cho tất cả origins (`allow_origins=["*"]`). Có thể tùy chỉnh trong `main.py` nếu cần.

## Chạy Service

### Local Development

```bash
cd services/cv-enhancer
export GOOGLE_API_KEY=your_key
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir src
```

### Docker

```bash
docker build -t cv-enhancer:latest .
docker run -d \
  --name cv-enhancer \
  -p 8000:8000 \
  -e GOOGLE_API_KEY=your_key \
  cv-enhancer:latest
```

## Lưu ý quan trọng cho Frontend Integration

### ⚠️ File Upload Handling

**Vấn đề hiện tại:** Backend hiện tại nhận `cv_file_path` (đường dẫn file trên server), không phải file upload trực tiếp.

**Giải pháp đề xuất:**

**Option 1: Upload file trước, sau đó gọi API**

1. Frontend upload file PDF lên server/storage (S3, local storage, etc.)
2. Nhận được file path/URL
3. Gọi `/api/v1/cv/enhance` với `cv_file_path` là path trên server

**Option 2: Modify backend để nhận file upload (Recommended)**

- Thay đổi endpoint để nhận `multipart/form-data` với file upload
- Parse file trong memory hoặc lưu tạm
- Cập nhật `EnhanceCVRequestDTO` để nhận file thay vì path

**Example modification:**

```python
from fastapi import UploadFile, File

@router.post("/enhance")
async def enhance_cv(
    cv_file: UploadFile = File(...),
    jd_text: str = Form(...),
    use_case: EnhanceCVUseCase = Depends(get_enhance_cv_use_case),
):
    # Save uploaded file temporarily
    # Parse and process
    # Clean up temp file
```

### Response Mapping

Frontend hiện tại expect:

```typescript
interface AnalyzeResult {
    latexCode: string
    pdfUrl: string
}
```

Backend trả về:

```typescript
interface EnhanceCVResponse {
    matching_score: number
    missing_skills: SkillGap[]
    enhanced_cv_content: string // Markdown format
}
```

**Cần mapping:**

- `enhanced_cv_content` → `latexCode` (có thể cần convert Markdown → LaTeX)
- `matching_score` và `missing_skills` → hiển thị trong UI
- `pdfUrl` → cần generate từ `enhanced_cv_content` (Markdown → PDF)

## Dependencies

- FastAPI 0.115.0+
- Docling 2.7.0+ (PDF parsing)
- LangChain 0.3.0+ (AI orchestration)
- LangGraph 0.2.0+ (workflow)
- Google Generative AI (Gemini)

## Testing

```bash
# Health check
curl http://localhost:8000/health

# Enhance CV
curl -X POST http://localhost:8000/api/v1/cv/enhance \
  -H "Content-Type: application/json" \
  -d '{
    "cv_file_path": "/app/test_data/sample_cv.pdf",
    "jd_text": "Senior Python Engineer..."
  }'
```

## Next Steps

1. **File Upload**: Modify backend để nhận file upload hoặc setup file storage
2. **Response Format**: Map backend response sang format frontend cần
3. **Error Handling**: Implement proper error handling và user feedback
4. **Loading States**: Backend không có streaming, cần handle long-running requests
5. **Markdown → LaTeX/PDF**: Convert `enhanced_cv_content` sang format frontend cần
