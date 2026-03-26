## Radiance CV-Enhancer — AWS Services Usage (Backend)

Tài liệu này ghi rõ cách các AWS services được sử dụng trong backend `services/cv-enhancer/`.

## Tổng quan kiến trúc

Backend `cv-enhancer` chạy một FastAPI service đồng thời có thể hoạt động như một AWS Lambda “dispatcher”:
- Với HTTP request: Lambda (thông qua `Mangum`) gọi các router FastAPI.
- Với SQS event: Lambda nhận event từ SQS và chạy pipeline bất đồng bộ để xử lý CV.

Các AWS services đang được dùng trong code:
- `Amazon S3`: lưu file CV gốc và file CV đã enhance (kèm presigned URLs).
- `Amazon SQS`: hàng đợi để trigger worker xử lý job phân tích CV.
- `Amazon DynamoDB`: lưu trạng thái và kết quả của từng `AnalysisJob` để client có thể poll.
- `AWS Lambda`: entry point để xử lý cả HTTP và SQS.

## 1) Amazon S3 (object storage)

### 1.1. S3 presigned upload URL cho CV gốc

Endpoint:
- `POST /api/v1/resumes/upload-urls` (router `src/presentation/resumes.py`)

Luồng:
1. Backend tạo `s3_key` theo prefix cấu hình (mặc định `raw-pdf/`):
   - `s3_key = f"{settings.s3_raw_prefix}{uuid4().hex}_{payload.file_name}"`
2. Backend gọi `IStorageService.generate_presigned_upload_url()` (implemented bởi `src/infrastructure/storage/s3_storage.py`).
3. Frontend upload trực tiếp lên S3 bằng HTTP PUT thông qua presigned URL.

Tham chiếu code:
- `src/presentation/resumes.py` (tạo `upload_url`, `s3_key`)
- `src/infrastructure/storage/s3_storage.py` (generate presigned PUT URL)

### 1.2. Download CV gốc và upload CV đã enhance

Nơi xử lý chính:
- `AnalyzeCVUseCase.execute()` (file `src/core/use_cases/analyze_cv_use_case.py`)

Luồng pipeline liên quan S3 (tóm tắt theo comment ở đầu file):
1. Download raw CV PDF từ S3 về local `/tmp`:
   - `self._storage.download_object(object_key=s3_key, local_path=local_pdf_path)`
2. Render CV đã enhance thành PDF (WeasyPrint).
3. Upload PDF đã render lên S3 dưới prefix enhanced (mặc định `enhanced-pdf/`):
   - `s3_pdf_key = f"{settings.s3_enhanced_prefix}{uuid4().hex}_enhanced_cv.pdf"`
   - `self._storage.upload_file(local_path=local_pdf_out, object_key=s3_pdf_key, content_type="application/pdf")`

Tham chiếu code:
- `src/core/use_cases/analyze_cv_use_case.py` (Step 2 và Step 6)
- `src/infrastructure/storage/s3_storage.py` (`download_file`, `upload_file`)

### 1.3. S3 presigned download URL trả về cho client

Sau khi upload file enhanced:
- Backend tạo presigned GET URL:
  - `pdf_url = self._storage.generate_presigned_download_url(s3_pdf_key)`

`pdf_url` được lưu vào `AnalysisResult` và persisted vào DynamoDB để client poll lấy về.

Ngoài pipeline phân tích:
- Endpoint editor render cũng upload lên S3 và trả về presigned download URL:
  - `POST /api/v1/editor/renders` (file `src/presentation/editor.py`)
  - tạo `s3_key = f"{settings.s3_enhanced_prefix}{uuid4().hex}_workspace.pdf"`
  - gọi `storage.upload_file(...)` rồi `storage.generate_presigned_download_url(s3_key)`

### 1.4. Quy ước keys & thời hạn presigned URL

Các prefix/policy đang dùng:
- Prefix raw CV:
  - env: `AWS_S3_RAW_PREFIX` (default `raw-pdf/`)
- Prefix enhanced CV:
  - env: `AWS_S3_ENHANCED_PREFIX` (default `enhanced-pdf/`)
- Thời hạn presigned upload:
  - env: `AWS_S3_PRESIGNED_UPLOAD_EXPIRATION_SECONDS` (default `900`)
- Thời hạn presigned download:
  - env: `AWS_S3_PRESIGNED_DOWNLOAD_EXPIRATION_SECONDS` (default `3600`)

## 2) Amazon SQS (job queue)

### 2.1. Backend “enqueue” job khi nhận request phân tích

Endpoint:
- `POST /api/v1/analyses` (file `src/presentation/analyses.py`)

Luồng:
1. Backend tạo `AnalysisJob` với `status = queued`.
2. Backend persist job vào repository (hiện tại container bind DynamoDB).
3. Backend enqueue một message lên SQS để worker Lambda xử lý job:
   - `SQSService.send_job(job_id, payload.s3_key, payload.jd_text)`

Payload message:
- `{"job_id": <job_id>, "s3_key": <s3_key>, "jd_text": <jd_text>}`

Tham chiếu code:
- `src/presentation/analyses.py` (tạo job + gọi `sqs_service.send_job(...)`)
- `src/infrastructure/adapters/sqs_service.py` (send JSON message)

### 2.2. Lambda worker xử lý message SQS

Trong `src/main.py`:
- `handler(event, context)` phân loại event:
  - Nếu `event` là dict và có key `Records` => coi như event từ SQS.
- Với SQS event:
  - `process_sqs_records(event)` lặp qua từng record,
  - parse `record["body"]` thành JSON,
  - lấy `job_id`, `s3_key`, `jd_text`,
  - gọi `AnalyzeCVUseCase.execute(job_id=..., s3_key=..., jd_text=...)`.

Tham chiếu code:
- `src/main.py` (dispatch SQS records + chạy async pipeline)

## 3) Amazon DynamoDB (job persistence & polling)

### 3.1. DynamoDB repository

Adapter:
- `DynamoJobRepository` (file `src/infrastructure/adapters/dynamo_job_repository.py`)

Container bind:
- `src/container.py` hiện tạo singleton `DynamoJobRepository` với:
  - `table_name=settings.dynamodb_table_name`
  - `region_name=settings.aws_region`
  - `endpoint_url=settings.dynamodb_endpoint_url` (tuỳ chọn)
  - `user_id=settings.analysis_user_id`

### 3.2. Persist/Update trạng thái job

`AnalyzeCVUseCase.execute()` cập nhật trạng thái theo pipeline:
- Bước 1: update `status = processing`
  - `await self._job_repo.update(job.model_copy(update={...}))`
- Khi thành công:
  - update `status = completed` + `result = AnalysisResult(...)`
- Khi thất bại bất kỳ exception nào:
  - gọi `_mark_failed(...)` và update `status = failed` + `error = <message>`

Tham chiếu code:
- `src/core/use_cases/analyze_cv_use_case.py` (Step 1, Completed, Failed)

### 3.3. Poll job status từ client

Endpoint:
- `GET /api/v1/analyses/{job_id}` (file `src/presentation/analyses.py`)

Luồng:
1. `job = await job_repo.get(job_id)`
2. Trả `status`, `error` nếu failed.
3. Nếu `status == completed` và có `result`:
   - trả `matching_score`, `missing_skills`, `red_flags`, `enhanced_cv_json`, `pdf_url`.

Tham chiếu code:
- `src/presentation/analyses.py` (logic mapping DTO khi job hoàn thành)

### 3.4. Key schema: tự phát hiện theo DynamoDB table

`DynamoJobRepository` có hàm `_init_key_schema(...)`:
- cố gắng `describe_table` để lấy `KeySchema` thật của table,
- chọn partition key (`KeyType == HASH`) và sort key (`KeyType == RANGE`),
- nếu không mô tả được thì dùng default:
  - partition key: `UserId`
  - sort key: `id`

Khi `save/update`:
- luôn set `item[pk_name] = user_id` (từ env `ANALYSIS_USER_ID`, mặc định `local`)
- nếu có sort key: set `item[sk_name] = job.id`

## 4) AWS Lambda (entry point cho HTTP và SQS)

`src/main.py` định nghĩa:
- `mangum_handler = Mangum(app, lifespan="on")`: dùng cho HTTP requests tới FastAPI.
- `handler(event, context)`: là hàm Lambda entry point thực tế.

Dispatching:
- Nếu `event` có `Records` => xử lý như SQS event (worker).
- Ngược lại => chuyển tiếp sang `mangum_handler` để xử lý HTTP (ví dụ API Gateway hoặc Lambda Function URL).

Tham chiếu code:
- `src/main.py` (phần `handler` và `process_sqs_records`)

## Data flow End-to-End (từ client đến kết quả)

1. Upload CV PDF:
   - Client gọi `POST /api/v1/resumes/upload-urls`
   - Client upload trực tiếp lên S3 bằng presigned PUT (`raw-pdf/`).
2. Trigger analysis:
   - Client gọi `POST /api/v1/analyses` với `{ s3_key, jd_text }`
   - Backend:
     - ghi job vào DynamoDB (`queued`)
     - gửi message lên SQS (`job_id`, `s3_key`, `jd_text`)
3. Worker xử lý:
   - Lambda nhận SQS event
   - chạy `AnalyzeCVUseCase.execute()`:
     - download từ S3
     - parse + LLM analysis
     - render PDF
     - upload enhanced PDF lên S3 (`enhanced-pdf/`)
     - tạo presigned download URL (`pdf_url`)
     - update DynamoDB (`completed` + result) hoặc `failed` + error
4. Poll kết quả:
   - Client gọi `GET /api/v1/analyses/{job_id}`
   - Khi `completed` backend trả về `pdf_url` (URL tải file từ S3).

## Mapping nhanh theo file (để tìm code)

- `src/presentation/resumes.py`: presigned upload URL (S3)
- `src/presentation/analyses.py`: enqueue SQS + poll DynamoDB
- `src/presentation/editor.py`: render/upload PDF lên S3 + presigned download URL
- `src/main.py`: Lambda dispatch HTTP vs SQS worker
- `src/core/use_cases/analyze_cv_use_case.py`: pipeline S3 download/upload + update DynamoDB
- `src/infrastructure/storage/s3_storage.py`: implement S3 presigned GET/PUT + upload/download
- `src/infrastructure/adapters/sqs_service.py`: implement enqueue job (SQS)
- `src/infrastructure/adapters/dynamo_job_repository.py`: implement persist/query/update job (DynamoDB)

