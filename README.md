# Radiance — Serverless AI Career Assistant

![AWS](https://img.shields.io/badge/AWS-232F3E?style=for-the-badge&logo=amazon-web-services&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js_14-000000?style=for-the-badge&logo=next.js&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Terraform](https://img.shields.io/badge/Terraform-7B42BC?style=for-the-badge&logo=terraform&logoColor=white)
![Python](https://img.shields.io/badge/Python_3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

---

## Live Demo & Demo

> **Live:** [https://your-cloudfront-url.cloudfront.net](https://your-cloudfront-url.cloudfront.net) *(replace with your CloudFront URL after deploying)*

<!-- Replace the path below with your actual demo GIF -->
![Radiance Demo](docs/diagram/demo.gif)

---

## Elevator Pitch

> Một ứng dụng web Serverless giúp phân tích độ phù hợp của CV với Job Description, đồng thời tự động viết lại CV theo tiêu chuẩn STAR thông qua Agentic Workflow — không bao giờ lo API timeout dù LLM xử lý mất 30 giây.

---

## Key Features

- ⚡ **Smart Matchmaking** — Đánh giá điểm phù hợp (Matching Score 0–100) và phát hiện lỗ hổng kỹ năng (Skill Gaps) với phân loại `critical / recommended / nice-to-have`.
- ✍️ **STAR-Method Enhancement** — Tự động tối ưu hóa văn phong CV theo cấu trúc Situation-Task-Action-Result qua LangGraph Agentic Workflow.
- 🔄 **Real-time Asynchronous Processing** — Trải nghiệm UX mượt mà với cơ chế Polling 2 giây; kiến trúc Event-Driven đảm bảo không bao giờ timeout dù LLM cần đến 40 giây xử lý.
- 🏗️ **Fully Serverless** — Zero idle cost; AWS Lambda scale-to-zero, DynamoDB PAY_PER_REQUEST, SQS managed queue.
- 📄 **Structured CV Editor** — Chỉnh sửa trực tiếp từng trường CV; AI Refine trên từng câu; render PDF ngay trong trình duyệt.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                                │
│  Next.js 14 (Static Export on S3 + CloudFront CDN)                │
└───────────────┬─────────────────────────────────────┬──────────────┘
                │ HTTPS (CORS)                         │ PUT (presigned)
                ▼                                      ▼
┌──────────────────────┐                  ┌───────────────────────┐
│   API Gateway (HTTP) │                  │   S3 — CV Raw PDFs    │
│   radiance-api-gw    │                  │   (presigned upload)  │
└──────────┬───────────┘                  └───────────────────────┘
           │ Lambda proxy                          ▲
           ▼                                       │ download
┌──────────────────────────────────────────────────┴──────────────┐
│           AWS Lambda  (Container Image — ECR)                   │
│           FastAPI + Mangum  ·  Python 3.12  ·  2 GB RAM        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  HTTP Path (API Gateway → Mangum → FastAPI)                │ │
│  │   POST /api/v1/resumes/upload-urls  → S3 presigned URL     │ │
│  │   POST /api/v1/analyses             → DynamoDB + SQS enq.  │ │
│  │   GET  /api/v1/analyses/{id}        → DynamoDB polling     │ │
│  │   POST /api/v1/editor/refinements   → Gemini inline edit   │ │
│  │   POST /api/v1/editor/renders       → WeasyPrint PDF       │ │
│  └─────────────────────────────┬──────────────────────────────┘ │
│                                 │ SQS Event                       │
│  ┌──────────────────────────────▼──────────────────────────────┐ │
│  │  SQS Worker Path (SQS Trigger → Lambda handler)             │ │
│  │   1. Download PDF from S3                                   │ │
│  │   2. Parse text with pdfplumber                             │ │
│  │   3. LangGraph: Analyzer Node → Enhancer Node (Gemini)     │ │
│  │   4. Render enhanced CV to PDF (Jinja2 + WeasyPrint)       │ │
│  │   5. Upload PDF to S3; update DynamoDB → COMPLETED         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
           │ write/read                     │ send/receive
           ▼                                ▼
┌───────────────────┐           ┌───────────────────────────────┐
│  DynamoDB         │           │  SQS                          │
│  UserProfiles     │           │  radiance-analysis-queue      │
│  (PAY_PER_REQUEST)│           │  visibility timeout: 330s     │
└───────────────────┘           └───────────────────────────────┘
```

**Stack:**

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Zustand |
| Backend | FastAPI, Python 3.12, Mangum (Lambda adapter) |
| AI / LLM | LangGraph, LangChain, Google Gemini 2.5 Flash |
| PDF Parsing | pdfplumber |
| PDF Rendering | Jinja2 + WeasyPrint |
| AWS Services | **API Gateway, SQS, Lambda, DynamoDB, S3 (×2), ECR, CloudFront, IAM, CloudWatch** |
| IaC | Terraform 1.5 |
| CI/CD | GitHub Actions (3 workflows) |

---

## 🧠 Key Engineering Decisions

### Decision 1: Async/Event-Driven Over Synchronous API

**Problem:** Gọi Gemini để phân tích và viết lại CV tốn trung bình 20–40 giây. AWS API Gateway có giới hạn timeout cứng **29 giây** — nghĩa là synchronous call sẽ luôn thất bại ở production.

**Solution:** Kiến trúc **Event-Driven** hoàn toàn:

```
POST /analyses (instant ~50ms)
    → Tạo job {status: PENDING} trong DynamoDB
    → Enqueue message {job_id, s3_key, jd_text} vào SQS
    → Trả về {job_id} ngay lập tức

SQS → Lambda Worker (timeout 300s, SQS visibility 330s)
    → Chạy toàn bộ AI pipeline
    → Update DynamoDB {status: COMPLETED, result: ...}

Frontend polls GET /analyses/{id} mỗi 2 giây
    → Hiển thị kết quả ngay khi status = COMPLETED
```

**Trade-offs considered:**
- *WebSocket* — bị loại vì Lambda stateless không duy trì connection tốt
- *Long Polling* — bị loại vì API Gateway vẫn bị giới hạn 29s
- *SQS Polling* — được chọn vì: decoupled, auto-retry khi Gemini API lỗi (SQS natively retry khi Lambda throw exception), cost-effective

**Fault-Tolerance:** Nếu Lambda crash giữa chừng, SQS tự động re-deliver message sau `visibility_timeout` (330s). Job được xử lý lại từ đầu — an toàn vì pipeline là idempotent theo `job_id`.

---

### Decision 2: Optimizing AI Compute — pdfplumber vs Docling

**Problem:** Cần extract text từ PDF (có layout phức tạp — cột, table, header) để làm input context cho Gemini. Ban đầu chọn **Docling** (IBM) vì xử lý layout PDF rất tốt.

**Bottleneck phát hiện ra:**
- Docling kéo theo `torch`, `transformers`, và nhiều ML model weights → Docker image **vượt 2GB**
- Lambda Container Image limit là **10GB** nhưng image nặng làm tăng cold-start lên **20–30 giây**
- AI libs của Docling không cần thiết vì Gemini đã là LLM — Docling chỉ cần để "parse", không cần ML inference thứ hai

**Solution:** Chuyển sang **`pdfplumber`** — thư viện Python thuần, không có ML dependency:
- Docker image giảm đáng kể (từ ~2GB xuống ~600MB sau khi loại bỏ torch/transformers)
- Cold-start giảm tương ứng
- Text extraction đủ chính xác cho LLM context (Gemini tự hiểu structure từ raw text)
- `pdfplumber` chạy async wrapper để không block event loop của FastAPI

**Lesson:** Đừng dùng ML tool để làm pre-processing cho ML model khác nếu model chính đủ mạnh để handle noisy input.

---

### Decision 3: HTML/CSS PDF (WeasyPrint) thay vì LaTeX

**Problem:** Ban đầu thiết kế pipeline xuất CV dưới dạng LaTeX → `pdflatex`. Sau khi test với Gemini output:
- LLM generate LaTeX syntax error ở **~15% requests** (unescaped `&`, `%`, ký tự tiếng Việt)
- Debugging LaTeX error trong production Lambda rất khó
- User không thể preview LaTeX trong browser mà không cần server render

**Solution:** Chuyển sang **Jinja2 HTML template → WeasyPrint PDF**:
- HTML/CSS dễ debug hơn, browser có thể render preview trực tiếp
- LLM chỉ cần output structured JSON (CVResumeSchema) — template lo việc formatting
- WeasyPrint tạo PDF chất lượng tốt, hỗ trợ Unicode/tiếng Việt native
- Giữ lại `resume_template.tex` trong codebase nhưng không wire vào production container

---

## Project Structure

```
Radiance/
├── apps/
│   └── web/                    # Next.js 14 frontend (static export)
│       ├── app/                # App Router pages
│       ├── components/         # UI, dashboard, editor components
│       ├── services/           # API client (api.ts) + mock data
│       └── store/              # Zustand global state (useCVStore.ts)
├── services/
│   └── cv-enhancer/            # FastAPI backend microservice
│       ├── src/
│       │   ├── main.py         # Lambda handler + FastAPI app
│       │   ├── config.py       # Pydantic settings
│       │   ├── container.py    # DI container (lru_cache singletons)
│       │   ├── core/           # Domain + use cases + prompts
│       │   ├── infrastructure/ # Adapters (Gemini, S3, DynamoDB, SQS, PDF)
│       │   └── presentation/   # FastAPI routers
│       ├── Dockerfile.lambda   # Container image for Lambda
│       └── requirements.txt
├── infra/
│   └── main.tf                 # Terraform — all AWS resources
├── eval/
│   └── cv-enhancer-deepeval/   # DeepEval evaluation suite
├── docs/                       # Technical documentation
│   ├── ARCHITECTURE.md
│   ├── AI_WORKFLOW.md
│   └── DEPLOYMENT.md
└── .github/
    └── workflows/
        ├── frontend-deploy.yml # Next.js → S3 + CloudFront
        ├── backend-deploy.yml  # pytest → Docker → ECR → Lambda
        └── _terraform.yml      # Terraform fmt/plan/apply
```

---

## Quick Start (Local Development)

### Backend

```bash
cd services/cv-enhancer
cp .env.example .env
# Fill in GOOGLE_API_KEY, AWS credentials, DynamoDB table, SQS queue URL

pip install -r requirements.txt
cd src
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd apps/web
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000

npm install
npm run dev
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | AWS data flow, DynamoDB schema, SQS design, ECR rationale |
| [AI_WORKFLOW.md](docs/AI_WORKFLOW.md) | LangGraph nodes, prompt design, STAR methodology |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Terraform IaC, CI/CD pipeline, IAM, CloudWatch |

---

## Evaluation

Hệ thống được đánh giá bằng **DeepEval** framework với Gemini làm judge:

```bash
cd eval/cv-enhancer-deepeval
pip install -r requirements.txt
pytest test_cases/ -v
```

Xem chi tiết tại [`eval/cv-enhancer-deepeval/README.md`](eval/cv-enhancer-deepeval/README.md).
