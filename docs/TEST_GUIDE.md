## 1. Backend

### 1.1 Chạy cv-enhancer bằng Docker

Build `dockerfile.lambda`:

```
docker build \
  -f services/cv-enhancer/Dockerfile.lambda \
  -t cv-enhancer-lambda:latest \
  .

# Run container on local(lambda dockerfile)
docker run --rm \
  --network host \
  --entrypoint /bin/sh \
  --env-file services/cv-enhancer/.env \
  -v "$PWD/services/cv-enhancer:/app" \
  -w /app \
  cv-enhancer-lambda:dev \
  -lc "python -m uvicorn main:app --host 0.0.0.0 --port 8000 --app-dir /app/src"
```

Local dev note (no SQS worker):

Set `IN_PROCESS_WORKER=1` in `services/cv-enhancer/.env` to run analysis jobs inside the API process.
This keeps the same frontend polling flow but avoids running a separate SQS worker locally.

Testing Gemini:

```
docker run --rm \
  --network host \
  --entrypoint /bin/sh \
  --env-file services/cv-enhancer/.env \
  -e RUN_LIVE_AWS_GEMINI_TESTS=1 \
  -e LIVE_TEST_BASE_URL=http://localhost:8000 \
  -e LIVE_TEST_CV_PDF_PATH=/app/test_data/sample_cv.pdf \
  -v "$PWD/services/cv-enhancer:/app" \
  -w /app \
  cv-enhancer-lambda:latest \
  -lc "pip install -r requirements-dev.txt && python -m pytest -q tests/test_live_aws_gemini_e2e.py"
```

### 1.2 Update lambda image

```
export AWS_REGION="us-east-1"
export AWS_ACCOUNT_ID="651914029391"
export ECR_REPO_NAME="radiance-backend-image"   # tên repo trong ECR
export ECR_REGISTRY="651914029391.dkr.ecr.us-east-1.amazonaws.com"
export ECR_IMAGE_URI="651914029391.dkr.ecr.us-east-1.amazonaws.com/radiance-backend-image"

aws ecr get-login-password --region "$AWS_REGION" \
| docker login --username AWS --password-stdin "$ECR_REGISTRY"

docker tag cv-enhancer-lambda:latest "$ECR_IMAGE_URI"
docker push "$ECR_IMAGE_URI"

# Sửa lại biến URI (thêm :latest)
ECR_IMAGE_URI="651914029391.dkr.ecr.us-east-1.amazonaws.com/radiance-backend-image:latest"
LAMBDA_FUNCTION_NAME="radiance-backend-api"

# Chạy lại lệnh
aws lambda update-function-code \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --region "$AWS_REGION" \
  --image-uri "$ECR_IMAGE_URI"

# Check xem đang xài image nào:
aws lambda get-function \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --region "$AWS_REGION" \
  --query 'Code.ImageUri' \
  --output text
```

## 2. Frontend

```bash
cd apps/web
npm install
npm run dev
```
