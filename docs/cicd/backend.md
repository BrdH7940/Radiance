Quy trình gồm 7 bước:

1.  **Detect Changes:** Kiểm tra xem file nào trong thư mục `services/` bị thay đổi để xác định service cần deploy.
2.  **AWS Auth:** Đăng nhập vào AWS bằng Access Key/Secret Key từ GitHub Secrets.
3.  **Metadata Setup:** Lấy ID tài khoản AWS để tạo URI cho Image. Nếu ECR Repo chưa tồn tại, nó sẽ tự động tạo mới.
4.  **ECR Login:** Cấp quyền cho Docker CLI để push image lên kho lưu trữ AWS ECR.
5.  **Build & Push Image:**
    - Build Docker image từ source code (sử dụng Dockerfile).
    - Gán tag cho image bằng hashed commit (`GITHUB_SHA`) để định danh phiên bản.
    - Đẩy image lên ECR.
6.  **Update Lambda:**
    - Ra lệnh cho Lambda chuyển sang sử dụng Image mới vừa push.
    - Cập nhật biến môi trường (như `LANGCHAIN_API_KEY`) trực tiếp vào cấu hình Lambda.
7.  **Smoke Test:** Test nhanh (gọi URL) để đảm bảo API hoạt động sau khi cập nhật.
