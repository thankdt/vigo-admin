# Báo cáo AI điều hành (AI Executive Reports) — Design (ý tưởng)

**Ngày:** 2026-07-22 · **Repos:** `vigo-backend` (AI + aggregation, rollout TRƯỚC) + `vigo-admin` (UI) · **Trạng thái:** SPEC Ý TƯỞNG — chờ chốt provider AI + API key trước khi làm plan/code.

> Ghi chú quy trình: đây là **spec ý tưởng** (theo yêu cầu user, commit lên main để review + chốt API sau). Khi triển khai: refine spec → **review phản biện (CLAUDE.md 0.5.b)** → plan → code → deploy.

---

## 1. Mục tiêu & bối cảnh

Thay hẳn trang **Báo cáo** hiện tại (đang là **mock**: `mockUsers` + AI stub tắt vì static export) bằng một module **báo cáo điều hành có AI**: đọc số liệu thật các mảng → **tóm tắt, đánh giá vấn đề, gợi ý hành động** cho lãnh đạo, xuất file được.

**Mảng đợt này (user chốt):** **Vận hành · Tài chính · Marketing · Hệ thống/Infra**. (Cung–cầu, HTX, KOL… bổ sung sau — thiết kế để thêm mảng dễ.)

### Báo cáo khác Dashboard thế nào (không trùng)
| Dashboard (đang có) | Báo cáo AI (mới) |
|---|---|
| Xem real-time từng mảng | **Tổng hợp liên-mảng** thành 1 đánh giá kỳ |
| Số liệu thô để theo dõi | AI **đọc → diễn giải → chấm vấn đề → gợi ý** |
| Không xuất | **Xuất PDF/Excel** để lưu/chia sẻ (hội đồng/nhà đầu tư) |
| Tức thời | Theo **kỳ** (tuần/tháng), có thể tự động sau |

---

## 2. Ràng buộc kiến trúc (quyết định nền)

1. **Admin là static export (S3) → KHÔNG chạy AI ở FE.** Genkit/`'use server'` không hoạt động. ⇒ **AI + tổng hợp số liệu chạy ở BACKEND** (`vigo-backend` NestJS); FE static chỉ gọi endpoint + hiển thị + export.
2. **AI cần API key (KHÔNG dùng được gói Claude Max/Pro cá nhân).** Backend gọi AI qua **API key** (Anthropic Claude API *hoặc* Google Gemini API). Provider để **cấu hình qua ENV**, thiết kế **provider-agnostic** (đổi provider không sửa business logic).
3. **AI diễn giải, KHÔNG bịa số.** Con số **luôn** từ aggregation deterministic ở BE (hiển thị bảng/biểu đồ + đưa vào prompt dạng đã-tính-sẵn). AI chỉ viết **narrative/đánh giá/gợi ý** trên số đã cho. Tránh AI tự chế số liệu.
4. **Không đưa PII vào prompt** — chỉ số liệu tổng hợp (không tên/SĐT khách/tài xế).

---

## 3. Kiến trúc tổng thể

```
FE (static, /reports)  ──POST /admin/reports/generate──►  BE (vigo-backend)
   chọn kỳ (VN) + mảng                                     1) Aggregation service: gom số thật
   hiện summary + bảng/chart                                  từng mảng theo kỳ (deterministic)
   export PDF/Excel                                        2) AI service (provider-agnostic):
                                                              feed số đã tính → summary/đánh giá/gợi ý
                                                           3) trả { metrics, ai } cho FE
```

- **Gate quyền:** endpoint gate `@RequireFunction('reports')`. Report gom data liên-mảng **server-side** → user chỉ cần quyền `reports` (không cần kèm finance/ops…). Đây là chủ đích: `reports` = quyền xem bản tổng hợp.
- **Rollout:** BE trước (endpoint + AI + aggregation) → FE sau (UI + export). Không migration (trừ khi làm lịch sử báo cáo — xem §7).

---

## 4. Các mảng báo cáo + nguồn số liệu

Mỗi mảng: BE có 1 **aggregator** trả cấu trúc số liệu kỳ (so với kỳ trước để tính xu hướng %).

| Mảng | Chỉ số ví dụ | Nguồn (tái dùng aggregation sẵn có) |
|---|---|---|
| **Vận hành** | chuyến tạo/hoàn thành/huỷ, tỉ lệ hoàn thành, tài xế online/duyệt, thời gian ghép, nghi vấn gian lận, tỉ lệ huỷ tài xế | overview + booking + drivers + leakage + cancel-rate |
| **Tài chính** | GMV, doanh thu VIGO, hoa hồng, dòng tiền tài xế, đối soát HTX, rút tiền, hoá đơn | finance dashboard/series + driver-cashflow + htx-recon + withdrawals |
| **Marketing** | khách mới, nguồn khách (acquisition), khuyến mãi dùng, affiliate/KOL, hạng thành viên | acquisition + referrals + kol + promotions + loyalty |
| **Hệ thống / Infra** | uptime, CPU/RAM ECS, số task, DB size/connections/latency (Neon), error rate, deploy gần nhất | **CloudWatch (ECS/RDS)** + **Neon metrics API** + logs — *KHÁC DB nghiệp vụ* |

> **Infra khác hẳn:** không ở DB app. BE cần quyền đọc **CloudWatch** (metrics ECS `vigo-cluster-prod`/`vigo-service-prod`) + **Neon** (dung lượng/kết nối). Cần bổ sung IAM/API-key cho các nguồn này (ghi ở §8).

---

## 5. Lớp AI (provider-agnostic)

- **Interface chung:** `AiSummarizer.summarize(domain, structuredMetrics) → { summary, assessment, suggestions[] }`. Đổi provider = đổi implementation, business logic không đổi.
- **Provider (chốt sau):**
  - **Claude API** (Anthropic key) — mạnh phân tích/đánh giá điều hành. SDK `@anthropic-ai/sdk` gọi trực tiếp trong NestJS.
  - **Gemini API** (Google key) — rẻ/nhanh; giữ Genkit (chạy được trong Node/NestJS) hoặc SDK trực tiếp.
  - Genkit **không bắt buộc** — có thể bỏ, gọi SDK vendor cho gọn; hoặc giữ Genkit để có schema/flow. Quyết ở plan.
- **Output có cấu trúc** (JSON schema, ép model trả đúng dạng):
  ```
  { overall: { summary, healthScore?, topRisks[] },
    perDomain: { operations|finance|marketing|infra: { summary, assessment, suggestions[] } } }
  ```
- **Prompt**: đưa số liệu đã-tính (kỳ này + kỳ trước + %thay đổi) theo mảng; yêu cầu: tóm tắt ngắn, chỉ ra 2–3 vấn đề đáng chú ý, 2–3 gợi ý hành động khả thi. **Cấm bịa số** — chỉ dùng số được cấp.
- **Chi phí + độ trễ**: gọi AI mỗi lần tạo báo cáo (vài giây). Cache theo (kỳ + mảng) để không gọi lại. Giới hạn tần suất.

---

## 6. Frontend (vigo-admin, static)

- Trang `/reports` viết lại (bỏ mock): chọn **kỳ (date-range VN)** + tick **mảng** → nút "Tạo báo cáo" → gọi `POST /admin/reports/generate`.
- Hiển thị: **AI executive summary** (overall + từng mảng: đánh giá + gợi ý) + **bảng/biểu đồ số liệu** (số từ BE, không từ AI).
- **Export**: PDF (bản in đẹp) + Excel/CSV (số liệu). Dùng lại tiện ích export sẵn có (như invoices) + thư viện PDF client-side.
- Trạng thái loading khi AI chạy; báo lỗi rõ nếu AI/endpoint fail.

---

## 7. Tuỳ chọn (bàn ở plan)
- **Lịch sử báo cáo**: lưu báo cáo đã tạo (bảng `report` + snapshot) để xem lại/so sánh → cần migration. Có thể phase sau.
- **Báo cáo định kỳ tự động** (cron tuần/tháng → tạo + gửi Telegram/email) → phase sau.
- **healthScore** tổng hợp (AI hoặc rule) cho trang chủ.

---

## 8. Cần chốt trước khi làm plan/code
1. **Provider AI**: Claude API hay Gemini? → **user cấp API key** vào ENV backend (`ANTHROPIC_API_KEY` / `GOOGLE_GENAI_API_KEY`).
2. **Quyền đọc Infra**: IAM cho BE đọc **CloudWatch** (ECS/RDS metrics) + **Neon metrics API key**. Nếu chưa sẵn → infra report bị chặn ở nguồn data.
3. **Định dạng export** ưu tiên (PDF trước? Excel?).
4. **Lịch sử/định kỳ**: làm ngay hay phase sau (mặc định: sau).

## 9. Rủi ro & giảm thiểu
| Rủi ro | Giảm thiểu |
|---|---|
| AI bịa/nhầm số | Số từ aggregation BE (deterministic); AI chỉ diễn giải; prompt cấm chế số; FE hiện số gốc riêng |
| Lộ PII vào AI | Chỉ feed số tổng hợp, không tên/SĐT |
| Chi phí AI tăng | Cache theo kỳ+mảng, rate-limit, model rẻ cho draft |
| Infra data không lấy được | Cần IAM/Neon key trước (§8.2); nếu thiếu → tách infra ra phase sau |
| Provider lock-in | Interface `AiSummarizer` provider-agnostic, đổi qua ENV |
| Endpoint nặng (gọi AI) | Async + loading UI; cân nhắc job nền nếu chậm |

---

## 10. Việc theo repo (tóm tắt cho plan sau)
**vigo-backend (trước):** aggregators 4 mảng (tái dùng finance/overview/acquisition… + thêm infra CloudWatch/Neon); `AiSummarizer` provider-agnostic (Claude/Gemini qua ENV); endpoint `POST /admin/reports/generate` gate `reports`; cache; tests (aggregation đúng số, AI service mock, prompt không PII).
**vigo-admin (sau):** trang `/reports` thật (bỏ mock `mockUsers` + stub); chọn kỳ VN + mảng; hiện summary + bảng/chart; export PDF/Excel; vitest.
