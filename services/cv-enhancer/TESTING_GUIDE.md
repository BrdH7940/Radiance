
---

### **Bước 5: Build Docker Image**

```bash
docker build -t cv-enhancer:latest .
```

### **Bước 6: Chạy Container**

**Cách 2: Sử dụng file .env (nếu bạn đã tạo)**
```bash
docker run -d \
  --name cv-enhancer \
  -p 8000:8000 \
  -v $(pwd)/test_data:/app/test_data:ro \
  --env-file .env \
  cv-enhancer:latest
```

**Giải thích:**
- `-d`: Chạy container ở background (detached mode)
- `--name cv-enhancer`: Đặt tên container
- `-p 8000:8000`: Map port 8000 của host → port 8000 của container
- `-v $(pwd)/test_data:/app/test_data:ro`: Mount thư mục test_data vào container (read-only)
- `-e GOOGLE_API_KEY`: Truyền API key vào container

---

### **Bước 7: Kiểm tra Container đang chạy**

```bash
# Xem danh sách containers
docker ps

# Xem logs của container (để debug nếu có lỗi)
docker logs cv-enhancer

# Xem logs real-time
docker logs -f cv-enhancer
```

Nếu container không chạy, kiểm tra lỗi:
```bash
docker logs cv-enhancer
```

---

### **Bước 8: Test Health Check Endpoint**

```bash
curl http://localhost:8000/health
```

Kết quả mong đợi:
```json
{"status":"healthy","service":"cv-enhancer"}
```

---

### **Bước 9: Test CV Enhancement Endpoint**

**Tạo file JSON request:**
```bash
cat > test_data/request.json << 'EOF'
{
  "cv_file_path": "/app/test_data/sample_cv.pdf",
  "jd_text": "Senior Python Backend Engineer\n\nWe are looking for an experienced Python Backend Engineer to join our team.\n\nRequirements:\n- 5+ years of experience in Python development\n- Strong knowledge of FastAPI, Django, or Flask\n- Experience with PostgreSQL, Redis, and message queues\n- Proficiency in Docker and Kubernetes\n- Understanding of microservices architecture\n- Experience with AWS or GCP cloud services"
}
EOF
```

**Gửi request bằng curl:**
```bash
curl -X POST http://localhost:8000/api/v1/cv/enhance \
  -H "Content-Type: application/json" \
  -d @test_data/request.json \
  | jq .
```

**Hoặc sử dụng file JD đã tạo:**
```bash
# Đọc nội dung JD từ file
JD_TEXT=$(cat test_data/sample_jd.txt)

# Tạo JSON payload
cat > /tmp/request.json << EOF
{
  "cv_file_path": "/app/test_data/sample_cv.pdf",
  "jd_text": $(echo "$JD_TEXT" | jq -Rs .)
}
EOF

# Gửi request
curl -X POST http://localhost:8000/api/v1/cv/enhance \
  -H "Content-Type: application/json" \
  -d @/tmp/request.json \
  | jq .
```

**Lưu kết quả vào file:**
```bash
curl -X POST http://localhost:8000/api/v1/cv/enhance \
  -H "Content-Type: application/json" \
  -d @test_data/request.json \
  -o test_data/response.json

# Xem kết quả
cat test_data/response.json | jq .
```

### **Bước 12: Dọn Dẹp (Cleanup)**

**Dừng container:**
```bash
docker stop cv-enhancer
```

**Xóa container:**
```bash
docker rm cv-enhancer
```

**Xóa image (nếu cần):**
```bash
docker rmi cv-enhancer:latest
```