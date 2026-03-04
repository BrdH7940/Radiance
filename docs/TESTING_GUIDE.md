# Radiance — Testing Guide

Quick commands to verify each component. Run from project root unless noted.

---

## Prerequisites

```bash
# Backend: Python 3.11+, pdflatex, env vars
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
# Expect: {"status":"healthy","service":"cv-enhancer","version":"2.0.0"}
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
# Expect: status (queued|processing|completed|failed), result when completed
```

### Editor Refinements (Phase 4)

```bash
curl -X POST http://localhost:8000/api/v1/editor/refinements \
  -H "Content-Type: application/json" \
  -d '{"selected_text":"Led migration of monolithic service.","prompt":"Make it STAR format"}'
# Expect: {"new_text":"..."}
```

### Editor Renders (Phase 4)

```bash
curl -X POST http://localhost:8000/api/v1/editor/renders \
  -H "Content-Type: application/json" \
  -d '{"latex_code":"\\documentclass{article}\\begin{document}Hello\\end{document}"}'
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

| Flow                  | Steps                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Upload → Dashboard    | Upload PDF, paste JD (50+ chars), click "Analyze & Enhance CV" → overlay → redirect to `/dashboard` |
| Dashboard → Workspace | Click "Enhance with AI" → `/workspace` with LaTeX + PDF                                             |
| AI Edit               | Select text in editor → click Zap icon → enter prompt → "Generate" → text replaced                  |
| Compile PDF           | Click "Compile PDF" → iframe shows compiled PDF                                                     |
| Download PDF          | After compile, click "PDF" → download starts                                                        |

---

## 4. Quick E2E Checklist

```text
[ ] Backend /health returns 200
[ ] POST /resumes/upload-urls returns presigned URL
[ ] POST /analyses returns job id
[ ] GET /analyses/{id} eventually returns status=completed
[ ] POST /editor/refinements returns new_text
[ ] POST /editor/renders returns pdf_url (requires pdflatex)
[ ] Frontend: Upload → Dashboard → Workspace
[ ] Frontend: AI edit replaces selection
[ ] Frontend: Compile shows PDF in iframe
```

---

## 5. Troubleshooting

| Issue                 | Check                                                      |
| --------------------- | ---------------------------------------------------------- |
| CORS errors           | Backend `allow_origins=["*"]` in main.py                   |
| 422 on analyses       | JD must be ≥50 chars                                       |
| Refinements 500       | `GOOGLE_API_KEY` set                                       |
| Renders success=false | `pdflatex` on PATH (`which pdflatex`)                      |
| S3 upload fails       | AWS creds + bucket exist; CORS on bucket for presigned PUT |
