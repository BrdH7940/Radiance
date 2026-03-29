# Deployment — Infrastructure, CI/CD & Security

> Tài liệu này dành cho Engineer muốn hiểu cách Radiance được deploy, quản lý infrastructure, và các quyết định về bảo mật.

---

## Table of Contents

1. [Infrastructure as Code — Terraform](#1-infrastructure-as-code--terraform)
2. [CI/CD Pipeline — GitHub Actions](#2-cicd-pipeline--github-actions)
3. [IAM — Principle of Least Privilege](#3-iam--principle-of-least-privilege)
4. [CloudWatch — Monitoring & Alerting](#4-cloudwatch--monitoring--alerting)
5. [CloudFront — CDN cho Static Frontend](#5-cloudfront--cdn-cho-static-frontend)
6. [Secrets Management](#6-secrets-management)
7. [Environment Setup — Lần đầu Deploy](#7-environment-setup--lần-đầu-deploy)

---

## 1. Infrastructure as Code — Terraform

Toàn bộ AWS infrastructure của Radiance được định nghĩa bằng **Terraform** trong `infra/main.tf`. Không có resource nào được tạo tay qua AWS Console — đảm bảo infrastructure reproducible và version-controlled.

### Resources được quản lý bởi Terraform

```hcl
# infra/main.tf

aws_apigatewayv2_api          "http_api"         # API Gateway HTTP API
aws_sqs_queue                 "analysis_queue"   # SQS Standard Queue
aws_ecr_repository            "backend_repo"     # ECR Container Registry
aws_cloudfront_distribution   "frontend_cf"      # CloudFront Distribution
aws_iam_role                  "lambda_exec_role" # Lambda IAM Role
aws_dynamodb_table            "analysis_table"   # DynamoDB Table
aws_s3_bucket                 "cv_storage_bucket"# S3 - CV PDFs
aws_s3_bucket                 "frontend_bucket"  # S3 - Static Frontend
aws_lambda_function           "backend_api"      # Lambda Function
```

### Terraform Backend: Remote State

State file được lưu trên S3 với DynamoDB locking — không lưu local để tránh state conflict khi nhiều người deploy:

```hcl
terraform {
  backend "s3" {
    bucket         = "radiance-s3"
    key            = "terraform/terraform.tfstate"
    region         = "<AWS_REGION>"
    encrypt        = true
    dynamodb_table = "terraform_locks"  # State locking
  }
}
```

**S3 state bucket features:**
- Versioning enabled — có thể rollback state nếu apply sai
- Server-side encryption (AES256)
- `terraform_locks` DynamoDB table ngăn concurrent apply

### Key Terraform Configuration Highlights

**Lambda — 2GB RAM, 300s timeout:**
```hcl
resource "aws_lambda_function" "backend_api" {
  function_name = "radiance-backend-api"
  package_type  = "Image"          # Container image, không phải zip
  memory_size   = 2048             # 2GB — WeasyPrint và LangGraph cần nhiều RAM
  timeout       = 300              # 5 phút cho AI pipeline
  image_uri     = "<ECR_URI>:latest"
  ...
}
```

**SQS visibility timeout > Lambda timeout:**
```hcl
resource "aws_sqs_queue" "analysis_queue" {
  name                       = "radiance-analysis-queue"
  visibility_timeout_seconds = 330  # Lambda timeout (300s) + 30s buffer
  message_retention_seconds  = 3600
  sqs_managed_sse_enabled    = true # Encryption at rest
}
```

**DynamoDB On-Demand (PAY_PER_REQUEST):**
```hcl
resource "aws_dynamodb_table" "analysis_table" {
  name         = "UserProfiles"
  billing_mode = "PAY_PER_REQUEST"  # Auto-scale, zero idle cost
  hash_key     = "UserId"
}
```

---

## 2. CI/CD Pipeline — GitHub Actions

Radiance có **3 GitHub Actions workflows** riêng biệt, mỗi workflow trigger theo đúng paths đã thay đổi:

```
.github/workflows/
├── frontend-deploy.yml   # Trigger: apps/web/**
├── backend-deploy.yml    # Trigger: services/**
└── _terraform.yml        # Trigger: infra/**
```

### Workflow 1: Frontend Deploy

```
Push to main (apps/web/**)
        │
        ▼
┌──────────────────────────────────────────────┐
│  Job: build-and-deploy                        │
│                                              │
│  1. actions/setup-node@v4 (Node 20)          │
│  2. npm ci (với cache)                        │
│  3. npm run lint                              │
│  4. npm run build  →  apps/web/out/           │
│     (Next.js static export)                  │
│  5. aws s3 sync apps/web/out s3://{BUCKET}   │
│     --delete (xóa file cũ)                   │
│  6. CloudFront Invalidation /*               │
│     (purge CDN cache ngay lập tức)           │
└──────────────────────────────────────────────┘
```

**`--delete` flag trong S3 sync:** Xóa file không còn trong build output khỏi S3 bucket. Đảm bảo không có stale files từ build cũ được serve.

**CloudFront Invalidation:** Sau khi S3 update, CloudFront edge cache vẫn còn file cũ (TTL mặc định). Invalidation `/*` buộc tất cả edge locations fetch file mới từ S3. Chi phí: $0.005/1000 paths (negligible).

### Workflow 2: Backend Deploy

```
Push to main (services/**)
        │
        ▼
┌───────────────────┐    ┌──────────────────────────────────────────┐
│  Job: test        │    │  Job: deploy (needs: test)               │
│                   │    │                                          │
│  1. Python 3.12   │───►│  1. Configure AWS credentials            │
│  2. pip install   │    │  2. ECR Login                            │
│  3. pytest -v     │    │  3. docker build -f Dockerfile.lambda .  │
│     (all tests)   │    │     Tag: {ECR_URI}:{sha} + :latest       │
└───────────────────┘    │  4. docker push (cả hai tags)            │
                         │  5. aws lambda update-function-code      │
                         │     --image-uri {ECR_URI}:{sha}          │
                         │  6. aws lambda wait function-updated     │
                         │     (block cho đến khi Lambda active)    │
                         └──────────────────────────────────────────┘
```

**Tại sao tag bằng `${github.sha}`?**

- Mỗi git commit → một Docker image tag duy nhất
- Rollback dễ dàng: `aws lambda update-function-code --image-uri {ECR}:{old_sha}`
- Audit trail: biết chính xác commit nào đang chạy trong production

**`aws lambda wait function-updated`:** Block workflow cho đến khi Lambda hoàn tất update (có thể mất 10–30s). Đảm bảo workflow không report thành công khi Lambda vẫn đang deploy.

**Docker build context là repo root (`docker build ... .`):**
```dockerfile
# Dockerfile.lambda phải COPY từ root context vì:
COPY services/cv-enhancer/requirements.txt /tmp/requirements.txt
COPY services/cv-enhancer/src/ /var/task/
```
Build được chạy từ repo root để có access đến `services/cv-enhancer/`.

### Workflow 3: Terraform CI

```
PR (infra/**)                     Push to main (infra/**)
      │                                    │
      ▼                                    ▼
┌─────────────────────┐      ┌─────────────────────────────┐
│  fmt-validate-plan  │      │  apply-prod (needs: plan)   │
│                     │      │                             │
│  1. Bootstrap S3/   │      │  1. Bootstrap S3/DynamoDB   │
│     DynamoDB/ECR    │      │     (idempotent check)      │
│     (idempotent)    │      │  2. terraform init          │
│  2. terraform fmt   │      │  3. terraform apply ECR     │
│  3. terraform init  │      │     (target: ECR repo only) │
│  4. terraform       │      │  4. Push placeholder image  │
│     validate        │      │     (Lambda cần image để    │
│  5. terraform plan  │      │      create thành công)     │
│  6. Upload plan     │      │  5. terraform apply full    │
│     artifact        │      └─────────────────────────────┘
└─────────────────────┘
```

**Bootstrap step (ECR trước Lambda):** Lambda Container Image phải tồn tại trước khi Terraform có thể tạo Lambda function. Thứ tự apply:
1. `terraform apply -target=aws_ecr_repository.backend` — tạo ECR repo
2. Push placeholder image (Python 3.11 base) vào ECR
3. `terraform apply` (full) — tạo Lambda với placeholder image
4. Workflow `backend-deploy.yml` sẽ update Lambda với actual image

---

## 3. IAM — Principle of Least Privilege

### Lambda Execution Role

```hcl
resource "aws_iam_role" "lambda_exec_role" {
  name = "radiance_lambda_role"
  assume_role_policy = jsonencode({
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}
```

### Permissions (Principle of Least Privilege)

Lambda chỉ được cấp quyền tối thiểu cần thiết:

| Service | Permissions | NOT granted |
|---------|------------|-------------|
| **SQS** | `ReceiveMessage`, `DeleteMessage`, `GetQueueAttributes` | `DeleteQueue`, `PurgeQueue`, `SendMessage` (HTTP API dùng riêng) |
| **DynamoDB** | `GetItem`, `PutItem`, `UpdateItem`, `Query` | `DeleteItem`, `DeleteTable`, `CreateTable`, `DescribeTable` (bị loại để tránh accidental delete) |
| **S3** | `GetObject`, `PutObject`, `GeneratePresignedUrl` | `DeleteObject`, `DeleteBucket`, `CreateBucket` |
| **CloudWatch Logs** | `CreateLogGroup`, `CreateLogStream`, `PutLogEvents` | — |
| **ECR** | `GetAuthorizationToken`, `BatchGetImage`, `GetDownloadUrlForLayer` | `DeleteRepository`, `PutImage` |

**Tại sao Lambda Worker KHÔNG có quyền xóa SQS message?**

SQS message deletion được xử lý tự động bởi **Lambda Event Source Mapping** (không phải application code). Khi Lambda return thành công, Lambda service tự xóa message khỏi queue. Khi throw exception, message được giữ lại để retry. Application code không cần (và không nên) gọi `sqs.delete_message()`.

**Tại sao Lambda không có `DynamoDB:DeleteItem`?**

Theo Principle of Least Privilege: Lambda chỉ cần create/update job records, không bao giờ cần xóa. Nếu có bug trong code gây ra accidental delete, IAM sẽ block — safety net thứ hai sau code review.

### GitHub Actions Credentials

Workflow dùng **long-lived IAM access keys** lưu trong GitHub Secrets:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

**Production recommendation:** Chuyển sang **OpenID Connect (OIDC)** với `aws-actions/configure-aws-credentials` + role assumption — loại bỏ long-lived credentials, mỗi workflow run nhận short-lived token.

---

## 4. CloudWatch — Monitoring & Alerting

### Lambda Logs

Lambda tự động log vào CloudWatch Logs group:
```
/aws/lambda/radiance-backend-api
```

Log format là **Text** (không phải JSON structured logging). Upgrade lên JSON format cho phép CloudWatch Logs Insights query hiệu quả hơn:

```python
# Hiện tại
logger.info("Worker processing Job ID: %s", job_id)

# Production-ready JSON logging
logger.info(json.dumps({
    "event": "job_processing_started",
    "job_id": job_id,
    "timestamp": datetime.utcnow().isoformat()
}))
```

### Metrics cần theo dõi

**Lambda Metrics:**
- `Duration` (P95, P99) — theo dõi AI pipeline latency
- `Errors` — số Lambda invocations failed
- `Throttles` — Lambda concurrency limit reached
- `ConcurrentExecutions` — đảm bảo không đụng quota

**SQS Metrics:**
- `ApproximateNumberOfMessagesVisible` — backlog size (nếu tăng đột biến = worker lag)
- `ApproximateAgeOfOldestMessage` — nếu message quá cũ = worker bị stuck
- `NumberOfMessagesFailed` — messages moved to DLQ

**Recommended Alarms:**

```hcl
# CloudWatch Alarm: Lambda Error Rate > 5%
resource "aws_cloudwatch_metric_alarm" "lambda_error_rate" {
  alarm_name          = "radiance-lambda-error-rate"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 5
  comparison_operator = "GreaterThanThreshold"
  dimensions = {
    FunctionName = "radiance-backend-api"
  }
  alarm_actions = [aws_sns_topic.alerts.arn]
}

# CloudWatch Alarm: SQS queue depth > 100
resource "aws_cloudwatch_metric_alarm" "sqs_depth" {
  alarm_name          = "radiance-sqs-depth"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  statistic           = "Maximum"
  period              = 300
  threshold           = 100
  comparison_operator = "GreaterThanThreshold"
  dimensions = {
    QueueName = "radiance-analysis-queue"
  }
}
```

### X-Ray Tracing

Lambda hiện cấu hình `tracing_config.mode = "PassThrough"`. Bật **Active** tracing cho phép trace end-to-end request từ API Gateway qua Lambda đến DynamoDB/S3:

```hcl
tracing_config {
  mode = "Active"  # Thay PassThrough
}
```

Yêu cầu thêm `xray:PutTraceSegments` và `xray:PutTelemetryRecords` vào IAM role.

---

## 5. CloudFront — CDN cho Static Frontend

### Distribution Setup

```
User Browser
    │ HTTPS
    ▼
CloudFront Edge (PriceClass_All — global)
    │
    │ Cache HIT → trả về cached content (~1ms)
    │ Cache MISS → fetch từ S3 origin
    ▼
S3 Bucket (radiance-frontend-*)
    │ Origin Access Control (OAC)
    │ (S3 bucket không public, chỉ CloudFront có quyền)
```

### Configuration Details

```hcl
resource "aws_cloudfront_distribution" "frontend_cf" {
  default_root_object = "index.html"
  http_version        = "http2"
  is_ipv6_enabled     = true
  price_class         = "PriceClass_All"  # Phục vụ toàn cầu

  # SPA routing: 403/404 từ S3 → trả về index.html
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  default_cache_behavior {
    viewer_protocol_policy = "redirect-to-https"  # HTTP → HTTPS redirect
    compress               = true                  # Gzip/Brotli compression
  }
}
```

**SPA Routing (custom_error_response):** Next.js static export với App Router cần 404 → index.html để client-side routing hoạt động. Khi user navigate trực tiếp đến `/dashboard`, S3 trả về 403 (key không tồn tại), CloudFront rewrite thành 200 với `index.html`, React Router handle routing phía client.

**`redirect-to-https`:** Force HTTPS trên tất cả requests — bắt buộc cho production.

### Cache Invalidation sau Deploy

```bash
aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/*"
```

Chạy tự động trong `frontend-deploy.yml` sau mỗi S3 sync. `/*` invalidate tất cả paths — simple và reliable cho small-scale deployment.

---

## 6. Secrets Management

### GitHub Secrets (CI/CD)

| Secret | Used by | Description |
|--------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | All workflows | IAM User access key |
| `AWS_SECRET_ACCESS_KEY` | All workflows | IAM User secret key |
| `AWS_REGION` | All workflows | AWS region (vd: `ap-southeast-1`) |
| `FRONTEND_BUCKET` | frontend-deploy | S3 bucket name cho static site |
| `CLOUDFRONT_DISTRIBUTION_ID` | frontend-deploy | CloudFront distribution ID |

### Lambda Environment Variables

Được set trong Terraform, không hardcode trong code:

```hcl
environment {
  variables = {
    GOOGLE_API_KEY               = var.google_api_key  # Gemini API key
    GEMINI_MODEL                 = "gemini-2.5-flash"
    AWS_S3_BUCKET                = var.cv_bucket_name
    DYNAMODB_ANALYSIS_TABLE_NAME = aws_dynamodb_table.analysis_table.name
    SQS_QUEUE_URL                = aws_sqs_queue.analysis_queue.url
    ANALYSIS_USER_ID             = var.analysis_user_id
  }
}
```

**Production best practice:** Sensitive values như `GOOGLE_API_KEY` nên được lưu trong **AWS Secrets Manager** hoặc **Parameter Store (SecureString)** và fetch khi Lambda cold start — tránh lộ trong Terraform state file plaintext.

---

## 7. Environment Setup — Lần đầu Deploy

### Prerequisites

```bash
# Install tools
brew install terraform awscli
aws configure  # Set access key, secret, region

# Clone repo
git clone https://github.com/your-username/Radiance.git
cd Radiance
```

### Step 1: Bootstrap Terraform Backend

```bash
# Tạo S3 bucket cho Terraform state (một lần duy nhất)
aws s3 mb s3://radiance-s3 --region <YOUR_REGION>
aws s3api put-bucket-versioning --bucket radiance-s3 \
  --versioning-configuration Status=Enabled

# Tạo DynamoDB lock table
aws dynamodb create-table \
  --table-name terraform_locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region <YOUR_REGION>
```

### Step 2: Deploy Infrastructure

```bash
cd infra
terraform init
terraform plan    # Review changes
terraform apply   # Deploy all AWS resources
```

### Step 3: Push Initial Docker Image

```bash
# Lấy ECR URI
ECR_URI=$(terraform output -raw ecr_repository_url)

# Build và push
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
docker build -t $ECR_URI:latest -f services/cv-enhancer/Dockerfile.lambda .
docker push $ECR_URI:latest

# Update Lambda với actual image
aws lambda update-function-code \
  --function-name radiance-backend-api \
  --image-uri $ECR_URI:latest
```

### Step 4: Deploy Frontend

```bash
cd apps/web
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL = API Gateway URL từ terraform output

npm install
npm run build

# Sync to S3
BUCKET=$(cd ../infra && terraform output -raw frontend_bucket_name)
aws s3 sync out "s3://$BUCKET" --delete

# Invalidate CloudFront
CF_ID=$(cd ../infra && terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"
```

### Step 5: Configure GitHub Secrets

Vào **Settings → Secrets and variables → Actions** trong GitHub repo, thêm:

```
AWS_ACCESS_KEY_ID          = <IAM User access key>
AWS_SECRET_ACCESS_KEY      = <IAM User secret key>
AWS_REGION                 = <your-region>
FRONTEND_BUCKET            = <S3 frontend bucket name>
CLOUDFRONT_DISTRIBUTION_ID = <CloudFront distribution ID>
```

Sau khi setup, mọi push vào `main` sẽ trigger deploy tự động.

---

## Architecture Summary: Tất cả 9 AWS Services

```
┌─────────────────────────────────────────────────────────────────┐
│                  Radiance AWS Architecture                       │
│                                                                  │
│  ① CloudFront ──── ② S3 (Frontend)                             │
│       │                                                          │
│  ③ API Gateway                                                  │
│       │                                                          │
│  ④ Lambda (Container)                                           │
│       │                                                          │
│       ├── ⑤ SQS (async queue)                                  │
│       │       │                                                  │
│       │       └── Lambda (same function, SQS trigger)           │
│       │                                                          │
│       ├── ⑥ DynamoDB (job state)                               │
│       │                                                          │
│       └── ⑦ S3 (CV PDFs)                                       │
│                                                                  │
│  ⑧ ECR (Docker images)                                          │
│  ⑨ IAM (roles & policies)                                       │
│  ⑩ CloudWatch (logs & metrics)                                  │
└─────────────────────────────────────────────────────────────────┘
```

| # | Service | Role |
|---|---------|------|
| ① | **CloudFront** | CDN phục vụ Next.js static export globally |
| ② | **S3** (frontend) | Host Next.js static export files |
| ③ | **API Gateway** (HTTP) | Route HTTPS requests đến Lambda |
| ④ | **Lambda** | FastAPI app + SQS worker trong một function |
| ⑤ | **SQS** | Decouple HTTP request từ LLM processing |
| ⑥ | **DynamoDB** | Store job state (PENDING → PROCESSING → COMPLETED) |
| ⑦ | **S3** (CV storage) | Store raw PDF (upload) và enhanced PDF (output) |
| ⑧ | **ECR** | Host Docker container image cho Lambda |
| ⑨ | **IAM** | Manage Lambda execution role (Least Privilege) |
| ⑩ | **CloudWatch** | Lambda logs, metrics, alerting |
