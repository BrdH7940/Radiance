# Radiance — Testing Guide

Quick commands to verify each component. Run from project root unless noted.

---

## Prerequisites

```bash
# Backend: Python 3.11+, WeasyPrint (system deps via Docker), env vars
# Frontend: Node 18+
```

Create `services/cv-enhancer/.env`:

```env
GOOGLE_API_KEY=your_key
GEMINI_MODEL=gemini-1.5-flash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=your-bucket
```

---

## 1. Backend Health

Sau khi cấu hình đầy đủ AWS (S3, DynamoDB, SQS, IAM) và `.env`, bạn **không cần deploy gì thêm** để test cơ bản — chỉ cần chạy backend ở **localhost** (hoặc Docker) rồi gọi các API.

### 1.1 Chạy cv-enhancer local (uvicorn + .env)

```bash
cd services/cv-enhancer

# Đảm bảo .env đã có đủ GOOGLE_API_KEY + AWS_* + DYNAMODB_ANALYSIS_TABLE_NAME (+ SQS_QUEUE_URL nếu dùng)
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir src
```

Health check:

```bash
curl http://localhost:8000/health
# Expect: {"status":"healthy","service":"cv-enhancer","version":"2.0.0"}
```

### 1.2 Chạy cv-enhancer bằng Docker (dùng khi muốn giống môi trường deploy)

```bash
cd services/cv-enhancer

# Build image (uses services/cv-enhancer/Dockerfile)
docker build -t cv-enhancer:latest .

# Run container with env vars from .env
docker run --rm -p 8000:8000 \
  --env-file .env \
  -v "$(pwd)/src:/app/src" \
  radiance-cv-enhancer
```

```bash
curl http://localhost:8000/health
```

---

## 2. API Endpoints (curl)

### Upload URL (Phase 1)

```bash
curl -X POST http://localhost:8000/api/v1/resumes/upload-urls \
  -H "Content-Type: application/json" \
  -d '{"file_name":"cv.pdf","content_type":"application/pdf"}'
# Expect: upload_url, s3_key, bucket
```

### Trigger Analysis (Phase 2)

```bash
# 1. Upload a PDF to S3 using the presigned URL from above (PUT)
# 2. Trigger analysis with the returned s3_key

curl -X POST http://localhost:8000/api/v1/analyses \
  -H "Content-Type: application/json" \
  -d '{"s3_key":"raw-pdf/abc123_cv.pdf","jd_text":"Senior Python Engineer with 5+ years experience in FastAPI and AWS..."}'
# Expect: {"id":"<job_id>","status":"queued"}
```

### Poll Job Status

```bash
curl http://localhost:8000/api/v1/analyses/<job_id>
# Expect: status (queued|processing|completed|failed)
# When completed: result.enhanced_cv_json (structured CV), result.pdf_url
```

### Editor Refinements (plain-text AI rewrite)

```bash
curl -X POST http://localhost:8000/api/v1/editor/refinements \
  -H "Content-Type: application/json" \
  -d '{"selected_text":"Led migration of monolithic service.","prompt":"Make it STAR format"}'
# Expect: {"new_text":"..."} — plain text, no LaTeX
```

### Editor Renders (JSON → PDF via WeasyPrint)

```bash
curl -X POST http://localhost:8000/api/v1/editor/renders \
  -H "Content-Type: application/json" \
  -d '{"cv_data":{"personal_info":{"name":"Test","email":"test@example.com","links":[]},"summary":{"text":"Summary."},"experiences":[],"education":[],"skill_groups":[]}}'
# Expect: {"pdf_url":"https://...","success":true}
```

---

## 3. Frontend

```bash
cd apps/web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" >> .env.local
npm run dev
```

Open http://localhost:3000

| Flow                   | Steps                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| Upload → Dashboard     | Upload PDF, paste JD (50+ chars), click "Analyze & Enhance CV" → overlay → redirect to `/dashboard` |
| Dashboard → Workspace  | Click "Enhance with AI" → `/workspace` with Form Builder + live HTML preview                        |
| AI Rewrite (per field) | Click ✨ icon next to any text field → enter prompt → "Go" → field content replaced                 |
| Render PDF             | Click "Render PDF" → PDF iframe appears after server renders JSON → HTML → PDF                      |
| Download JSON          | Click "JSON" → downloads `cv-data.json`                                                             |
| Download PDF           | After render, click "PDF" → download starts                                                         |

---

## 4. Quick E2E Checklist

```text
[ ] Backend /health returns 200
[ ] POST /resumes/upload-urls returns presigned URL
[ ] PUT CV PDF lên S3 qua upload_url trả về
[ ] POST /analyses với s3_key vừa upload trả về job id
[ ] GET /analyses/{id} eventually returns status=completed with enhanced_cv_json + pdf_url hợp lệ
[ ] POST /editor/refinements returns new_text (plain text)
[ ] POST /editor/renders returns pdf_url (requires WeasyPrint in Docker)
[ ] Frontend: Upload → Dashboard → Workspace
[ ] Frontend: Form builder edits update live preview in real time
[ ] Frontend: AI Rewrite (✨) updates field content
[ ] Frontend: Render PDF shows PDF in iframe
```

---

## 5. Testing New Migration Features (JSON + HTML → PDF)

| Feature                  | How to test                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Structured CV output** | Poll job until completed → `result.enhanced_cv_json` has `personal_info`, `experiences`, `education`, `skill_groups` |
| **Form Builder**         | Workspace: add/remove experience, bullet, skill group; edit any field → right pane updates in real time              |
| **AI Rewrite per field** | Click ✨ next to a bullet or summary → enter "Make it STAR format" → "Go" → field content replaced                   |
| **Render PDF**           | Click "Render PDF" → wait ~5–10s → PDF appears in iframe; download via "PDF" button                                  |
| **Export JSON**          | Click "JSON" → file `cv-data.json` downloads with full CV schema                                                     |

---

## 6. Troubleshooting

| Issue                 | Check                                                           |
| --------------------- | --------------------------------------------------------------- |
| CORS errors           | Backend `allow_origins=["*"]` in main.py                        |
| 422 on analyses       | JD must be ≥50 chars                                            |
| Refinements 500       | `GOOGLE_API_KEY` set                                            |
| Renders success=false | WeasyPrint in Docker (check `docker build`; no pdflatex needed) |
| S3 upload fails       | AWS creds + bucket exist; CORS on bucket for presigned PUT      |
