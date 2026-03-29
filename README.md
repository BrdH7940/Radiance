# Radiance

## Tổng Quan Hệ Thống

Vấn đề: Hầu hết CV bị loại trước khi có người đọc — không phải vì ứng viên yếu, mà vì CV không match ATS và JD.

Radiance giải quyết điều đó: semantic matching CV–JD, phát hiện skill gap, và tự động enhance nội dung theo chuẩn STAR — kiến trúc Event-Driven trên AWS.

> **[👉 Radiance Live Demo](https://d23nq0zemkezkn.cloudfront.net/)**

---

## AI Pipeline & Agentic Workflow

Pipeline xử lý AI được thiết kế theo mô hình **Event-Driven Architecture**.

![Architecture](docs\images\Sequence.JPG)

---

## Evaluation

Chất lượng đầu ra của AI pipeline được đánh giá bằng framework **DeepEval** để đo Faithfulness và Relevancy.
