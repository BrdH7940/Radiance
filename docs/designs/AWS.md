# Radiance — Deployment Infrastructure Summary

## Infrastructure as Code

Toàn bộ AWS infrastructure của Radiance được quản lý bằng **Terraform**, bao gồm 9 services: API Gateway, SQS, ECR, CloudFront, IAM Role, DynamoDB, S3 (×2), và Lambda.

---

## CI/CD Pipeline

Hệ thống CI/CD gồm **2 workflows GitHub Actions**:

**Frontend workflow** thực hiện build Next.js static export, sync lên S3, sau đó invalidate toàn bộ CloudFront edge cache (Để cập nhật ngay lập tức khi code thay đổi).

**Backend workflow** chạy test trước, sau đó build Docker image, tag theo git commit SHA, push lên ECR, và cập nhật Lambda function.

---

## IAM

Cấp đúng các quyền cần thiết, không cấp quyền Admin.

---

## CloudWatch Monitoring

Logging hiện ở dạng plain text. Các metrics quan trọng cần theo dõi gồm Lambda `Duration` (P95/P99), `Errors`, `Throttles`, và SQS `ApproximateAgeOfOldestMessage` để phát hiện worker stuck.

---

## CloudFront CDN

CloudFront phục vụ Next.js static export.
