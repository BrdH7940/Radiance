# AI Workflow Technical Summary — Radiance

## 1. Kiến trúc tổng quan

**LangGraph** để xây dựng một stateful, multi-step AI pipeline gồm 2 node tuần tự: **Analyzer** → **Enhancer**.

---

## 2. Node 1 — Analyzer

Nhận `cv_text` và `jd_text` từ user, sau đó thực hiện ba nhiệm vụ song song trong một lần inference:

- **Scoring:** Tính điểm ATS fit từ 0–100 dựa trên bốn trọng số: technical skills overlap (40%), years of relevant experience (30%), domain alignment (20%), và education/certifications (10%).
- **Missing Skills Detection:** Phân loại từng kỹ năng còn thiếu theo ba mức độ — `critical`, `recommended`, `nice-to-have` — kèm mô tả rõ ràng.
- **Red Flag Identification:** Phát hiện các vấn đề cấu trúc như employment gaps, job-hopping, vague bullets, và mismatch giữa seniority được claim và experience thực tế.

Persona được inject vào system prompt là _senior ATS consultant + FAANG recruiter_ để tăng domain-specific instruction following. Output được validate bởi Pydantic model `_AnalyzerOutput`.

---

## 3. Node 2 — Enhancer

Node này nhận toàn bộ state từ Analyzer (bao gồm `missing_skills` và `red_flags` đã được format), sau đó rewrite CV theo **STAR methodology** và output theo schema `CVResumeSchema`.

Prompt template gồm những yếu tố:

- Mỗi bullet experience bắt đầu bằng strong past-tense action verb, có độ dài 20–35 words, và kết thúc bằng kết quả được quantify.
- Toàn bộ thông tin định danh (tên, email, phone, education) phải được bảo toàn — không được invent.
- Khi gặp vague bullets, hệ thống transform theo STAR nhưng không fabricate số liệu cụ thể; chỉ sử dụng ranges hoặc qualitative improvements nếu CV gốc không cung cấp dữ liệu.

Output cuối cùng là một JSON object conform với `CVResumeSchema`, được validate hai lớp: ở LLM level (Gemini function calling) và ở Python side (Pydantic).

---

## 4. Structured Output — CVResumeSchema

Schema để hiển thị trên dashboard cho người dùng, được thiết kế: `CVResumeSchema` → `Experience` → `ExperienceBullet`. Các entity chính bao gồm `personal_info`, `summary`, `experiences`, `education`, `projects`, `skill_groups`, và `awards_certifications`.

---

## 5. Editor AI — Stateless Refinement Endpoint

Ngoài LangGraph pipeline chính, hệ thống expose một endpoint riêng (`POST /api/v1/editor/refinements`) cho việc inline editing. Endpoint này là **stateless Gemini call** — không đi qua LangGraph — nhận `selected_text` và `prompt`, trả về `new_text` đã được rewrite.

---

## 6. Model Runtime

Toàn bộ pipeline sử dụng **Gemini 2.5 Flash** làm backbone LLM. Toàn bộ CV và JD fit vào một single call mà không cần chunking hay RAG.

---

## 7. Error Handling

Pipeline được bọc trong try/except tổng. Khi inference thất bại, hệ thống cập nhật trạng thái job thành `FAILED` trong DynamoDB rồi **re-raise exception** để SQS có thể retry tự động. Transient errors (rate limit, 503) được handle qua SQS re-delivery; permanent errors (schema violation, invalid input) được đẩy vào Dead Letter Queue để tránh infinite retry loop.
