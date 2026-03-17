## CV-Enhancer — Hướng dẫn cấu hình AWS (step-by-step)

Tài liệu này hướng dẫn cấu hình các dịch vụ AWS cần thiết để chạy backend `cv-enhancer` ở môi trường dev/staging/production.

---

## 1. Yêu cầu trước khi bắt đầu

- **AWS account** hoạt động.
- **Quyền IAM** đủ để tạo S3 bucket, DynamoDB table, SQS queue, và IAM policy/user/role.
- Đã cài:
  - `awscli` (`aws --version`)
  - Python môi trường chạy được service

Khuyến nghị dùng **1 IAM role/user riêng cho Radiance** với quyền tối thiểu (least privilege).

---

## 2. Chọn region & chuẩn bị profile AWS CLI

- Chọn 1 region cố định, ví dụ: `us-east-1`.
- Cấu hình AWS CLI (nếu chưa có):

```bash
aws configure --profile radiance
# AWS Access Key ID: <access-key>
# AWS Secret Access Key: <secret-key>
# Default region name: us-east-1
# Default output format: json
```

Từ giờ, khi chạy CLI bạn có thể thêm `--profile radiance` hoặc đặt profile mặc định cho terminal.

---

## 3. Tạo S3 bucket cho CV

Backend cần 1 bucket để chứa:
- CV gốc người dùng upload (`raw-pdf/`)
- PDF enhanced đã render (`enhanced-pdf/`)

### 3.1 Tạo bucket

```bash
AWS_REGION=us-east-1
BUCKET_NAME=<your-unique-radiance-bucket>

aws s3api create-bucket \
  --bucket "$BUCKET_NAME" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"
```

> Gợi ý: đặt tên theo convention, ví dụ: `radiance-cv-${ENV}-${ACCOUNT_ID_HASH}`.

### 3.2 Cấu hình CORS (cho phép frontend upload trực tiếp)

Tạo file `s3-cors.json`:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://<your-frontend-domain>", "http://localhost:3000"],
      "AllowedMethods": ["GET", "PUT"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

Áp dụng:

```bash
aws s3api put-bucket-cors \
  --bucket "$BUCKET_NAME" \
  --cors-configuration file://s3-cors.json
```

---

## 4. Tạo DynamoDB table cho AnalysisJob

Service dùng `DynamoJobRepository` để lưu trạng thái job phân tích CV.

### 4.1 Thiết kế bảng

- **Table name**: `radiance-cv-analyses` (ví dụ, bạn có thể đổi nhưng cần cập nhật env).
- **Partition key**: `id` (String) — chính là `job_id`.
- Không dùng sort key ở phiên bản hiện tại.

### 4.2 Tạo bảng

```bash
TABLE_NAME=radiance-cv-analyses

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

Đợi bảng ở trạng thái `ACTIVE`:

```bash
aws dynamodb describe-table --table-name "$TABLE_NAME" --query "Table.TableStatus"
```

---

## 5. (Tuỳ chọn) Tạo SQS queue cho job async

Code hiện tại có `SQSService` để gửi message job lên SQS (ví dụ để worker khác xử lý).

Nếu bạn chưa dùng SQS, có thể để trống `SQS_QUEUE_URL`. Nếu muốn tích hợp SQS:

### 5.1 Tạo queue

```bash
QUEUE_NAME=radiance-cv-analysis-queue

aws sqs create-queue --queue-name "$QUEUE_NAME"

QUEUE_URL=$(aws sqs get-queue-url --queue-name "$QUEUE_NAME" --query "QueueUrl" --output text)
echo "QUEUE_URL=$QUEUE_URL"
```

### 5.2 (Tuỳ chọn) Hạn chế truy cập queue bằng policy

Thông thường bạn sẽ cho phép chỉ IAM role/user của backend được gửi message. Ví dụ policy resource SQS sẽ được gán ở bước IAM bên dưới.

---

## 6. Tạo IAM policy tối thiểu cho cv-enhancer

Mục tiêu: cho phép service:
- Truy cập S3 bucket (GET/PUT object, presign),
- Đọc/ghi vào DynamoDB table,
- (Tuỳ chọn) Gửi message lên SQS queue.

Tạo file `radiance-cv-enhancer-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3AccessForCvEnhancer",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::<your-unique-radiance-bucket>",
        "arn:aws:s3:::<your-unique-radiance-bucket>/*"
      ]
    },
    {
      "Sid": "DynamoAccessForCvEnhancer",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DescribeTable"
      ],
      "Resource": "arn:aws:dynamodb:<region>:<account-id>:table/radiance-cv-analyses"
    },
    {
      "Sid": "SqsSendMessageForCvEnhancer",
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage"
      ],
      "Resource": "arn:aws:sqs:<region>:<account-id>:radiance-cv-analysis-queue"
    }
  ]
}
```

Thay `<your-unique-radiance-bucket>`, `<region>`, `<account-id>` và tên queue theo thông tin thực tế.

Tạo policy:

```bash
aws iam create-policy \
  --policy-name radiance-cv-enhancer-policy \
  --policy-document file://radiance-cv-enhancer-policy.json
```

Lưu lại ARN policy trả về (ví dụ `arn:aws:iam::<account-id>:policy/radiance-cv-enhancer-policy`).

---

## 7. Gán policy cho IAM user/role chạy backend

Bạn có hai lựa chọn:

- **IAM User** + Access keys: dùng cho container chạy ngoài AWS (local, on-prem, một số PaaS).
- **IAM Role**: dùng khi chạy trên ECS/EKS/Lambda/EC2 với role gắn trực tiếp.

### 7.1 Gắn policy cho IAM User (dùng `.env`/access key)

```bash
IAM_USER_NAME=radiance-cv-enhancer

aws iam create-user --user-name "$IAM_USER_NAME"

aws iam attach-user-policy \
  --user-name "$IAM_USER_NAME" \
  --policy-arn arn:aws:iam::<account-id>:policy/radiance-cv-enhancer-policy

aws iam create-access-key --user-name "$IAM_USER_NAME"
```

Giữ kín `AccessKeyId` và `SecretAccessKey` ở chỗ an toàn (không commit vào git).

### 7.2 Gắn policy cho IAM Role (khi chạy trên AWS)

Nếu bạn có role tên `radiance-backend-role`:

```bash
aws iam attach-role-policy \
  --role-name radiance-backend-role \
  --policy-arn arn:aws:iam::<account-id>:policy/radiance-cv-enhancer-policy
```

Khi đó container không cần `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`; SDK sẽ dùng IAM Role.

---

## 8. Cấu hình biến môi trường cho cv-enhancer

Các biến quan trọng được backend dùng (tham chiếu `config.AppSettings`):

- **AI**
  - `GOOGLE_API_KEY`
  - `GEMINI_MODEL` (ví dụ `gemini-1.5-flash` hoặc `gemini-2.5-flash`)
- **AWS creds/region**
  - `AWS_REGION`
  - `AWS_ACCESS_KEY_ID` (nếu dùng IAM User)
  - `AWS_SECRET_ACCESS_KEY` (nếu dùng IAM User)
  - `AWS_SESSION_TOKEN` (tuỳ chọn)
- **S3**
  - `AWS_S3_BUCKET`
  - `AWS_S3_RAW_PREFIX` (mặc định `raw-pdf/`)
  - `AWS_S3_ENHANCED_PREFIX` (mặc định `enhanced-pdf/`)
  - `AWS_S3_PRESIGNED_UPLOAD_EXPIRATION_SECONDS` (mặc định `900`)
  - `AWS_S3_PRESIGNED_DOWNLOAD_EXPIRATION_SECONDS` (mặc định `3600`)
- **DynamoDB**
  - `DYNAMODB_ANALYSIS_TABLE_NAME` (ví dụ `radiance-cv-analyses`)
- **SQS (tuỳ chọn)**
  - `SQS_QUEUE_URL` (URL queue tạo ở bước 5)

Ví dụ `.env` (không commit file này lên git):

```env
GOOGLE_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-1.5-flash

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=XXXXXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

AWS_S3_BUCKET=your-unique-radiance-bucket
AWS_S3_RAW_PREFIX=raw-pdf/
AWS_S3_ENHANCED_PREFIX=enhanced-pdf/

DYNAMODB_ANALYSIS_TABLE_NAME=radiance-cv-analyses
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/<account-id>/radiance-cv-analysis-queue
```

---

## 9. Chạy cv-enhancer local với AWS thật

Ở thư mục `services/cv-enhancer`:

```bash
cd services/cv-enhancer

export GOOGLE_API_KEY=your-gemini-key
export GEMINI_MODEL=gemini-1.5-flash

export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_S3_BUCKET=your-unique-radiance-bucket

export DYNAMODB_ANALYSIS_TABLE_NAME=radiance-cv-analyses
export SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/<account-id>/radiance-cv-analysis-queue

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir src
```

Nếu dùng `.env`, chỉ cần đảm bảo các biến trên tồn tại và để `AppSettings` đọc `.env` (đã cấu hình sẵn).

---

## 10. Kiểm tra end-to-end sau khi cấu hình

1. **Health check**

   ```bash
   curl http://localhost:8000/health
   ```

2. **Upload URL**

   ```bash
   curl -X POST http://localhost:8000/api/v1/resumes/upload-urls \
     -H "Content-Type: application/json" \
     -d '{"file_name": "cv.pdf", "content_type": "application/pdf"}'
   ```

   - Kiểm tra response có `upload_url`, `s3_key`, `bucket` khớp bucket bạn tạo.

3. **Upload file lên S3 qua presigned URL** (dùng curl hoặc frontend).

4. **Trigger analysis**

   ```bash
   curl -X POST http://localhost:8000/api/v1/analyses \
     -H "Content-Type: application/json" \
     -d '{
       "s3_key": "raw-pdf/xxx_cv.pdf",
       "jd_text": "Senior Python Engineer with 5+ years..."
     }'
   ```

5. **Poll status**

   ```bash
   curl http://localhost:8000/api/v1/analyses/<job_id>
   ```

   - Khi `status = "completed"`, kiểm tra:
     - Có record trong DynamoDB table với `id = <job_id>`.
     - `pdf_url` hoạt động (download được file từ S3).

---

## 11. Ghi chú bảo mật & best practices

- Không commit `.env` hoặc AWS keys lên git.
- Ở production, ưu tiên chạy trên **ECS/EKS/EC2 với IAM Role**, không dùng access key.
- Giới hạn CORS trên S3 chỉ cho domain frontend thật, không để `*` trong production.
- Xem xét bật các feature sau:
  - Versioning trên S3 bucket.
  - Server-side encryption (S3 SSE-S3 hoặc SSE-KMS).
  - CloudWatch Logs/Alarms cho DynamoDB & SQS nếu dùng production.

