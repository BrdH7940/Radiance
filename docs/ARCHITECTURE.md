# Radiance Backend — High-Level Architecture Summary

## Tổng quan hệ thống

Hệ thống Radiance backend được triển khai trên AWS, áp dụng kiến trúc **serverless event-driven**, với toàn bộ compute layer chạy trên AWS Lambda. Pipeline xử lý CV được thiết kế tách biệt thành hai luồng: **synchronous HTTP** (phục vụ client trực tiếp) và **asynchronous background processing** (xử lý LLM pipeline).

---

## Các thành phần kiến trúc

### Compute Layer — AWS Lambda (Dual-Mode)

Hệ thống sử dụng một Lambda function duy nhất vận hành ở hai chế độ: tiếp nhận HTTP request từ API Gateway thông qua ASGI bridge (Mangum + FastAPI), và xử lý SQS message. Lambda được đóng gói dưới dạng **container image** lưu trữ trên Amazon ECR.

### API Layer — AWS API Gateway (HTTP API v2)

Client giao tiếp với hệ thống thông qua API Gateway HTTP API. Tầng này xử lý routing, CORS.

### Async Messaging Layer — Amazon SQS

Khi client trigger một analysis job, Lambda API handler ghi job vào DynamoDB, đẩy message vào SQS queue, và trả về `job_id` ngay lập tức (~100ms). Worker Lambda tiêu thụ message từ queue một cách bất đồng bộ, xử lý toàn bộ LLM pipeline (20–45 giây) mà không bị ràng buộc bởi API Gateway timeout. Cơ chế visibility timeout của SQS đảm bảo retry tự động khi worker gặp lỗi.

### Storage Layer — Amazon S3 + DynamoDB

**S3** được sử dụng theo **Presigned URL pattern**: client upload PDF trực tiếp lên S3 thông qua pre-signed PUT URL (bypass API Gateway), và download kết quả thông qua pre-signed GET URL có TTL giới hạn. Toàn bộ bucket được giữ ở chế độ private.

**DynamoDB** lưu trữ trạng thái của từng `AnalysisJob` dưới dạng document, bao gồm `status`, `result` (JSON từ LLM), và `pdf_url`. Table sử dụng `UserId` làm partition key với on-demand billing. Client thực hiện polling định kỳ lên endpoint `GET /analyses/{id}` để theo dõi trạng thái job.

---

## Data Flow tổng quan

```
Client → API Gateway → Lambda (HTTP)
                          ├── DynamoDB (write job: PENDING)
                          └── SQS (enqueue message)
                                    ↓
                          Lambda (Worker)
                              ├── S3 (read raw PDF)
                              ├── LLM Pipeline (LangGraph + Gemini)
                              ├── WeasyPrint (render enhanced PDF)
                              ├── S3 (write enhanced PDF)
                              └── DynamoDB (update job: COMPLETED)

Client → Polling → Lambda (HTTP) → DynamoDB (read job status)
```

---

## Dependency Management trong Lambda Runtime

Hệ thống áp dụng **singleton pattern với `lru_cache`** để khởi tạo các service object (LLM adapter, PDF renderer, DynamoDB client, v.v.) một lần duy nhất per Lambda instance.
