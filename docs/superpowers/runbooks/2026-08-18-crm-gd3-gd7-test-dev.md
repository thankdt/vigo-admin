# CRM GĐ3 → GĐ7 — checklist test trên DEV

Cập nhật 2026-08-18. Bản cho GĐ0/GĐ1 nằm ở `2026-08-17-crm-gd0-gd1-test-dev.md`.

**Trạng thái:** code xong cả 2 repo, **đã merge vào `dev` và đã push** (backend `aa81d0b`,
admin `915a7c2`). Hai lượt review độc lập đã vá xong. Kiểm máy: backend `tsc` sạch · 3731
unit · 169 integration (Postgres thật); admin `tsc` sạch · 1009 test · `next build` sạch.

**Còn thiếu đúng một thứ: người thật bấm thử trên DEV.** GĐ0→GĐ7 đang xếp chồng 8 giai đoạn,
chưa giai đoạn nào được test tay.

| Repo | Nhánh feature | Đã ở `dev` | Trên `main` |
|---|---|---|---|
| vigo-backend | `feat/crm-queue-api` | ✅ `aa81d0b` | ❌ chưa, và chưa tới lúc |
| vigo-admin | `feat/crm-queue` | ✅ `915a7c2` | ❌ chưa, và chưa tới lúc |

> Luật hiện hành: mảng nhiều giai đoạn thì **ở lại nhánh feature tới khi xong hết spec** rồi
> mới lên `main` + deploy prod. Test DEV làm ngay — đó là mục đích của file này.

---

## 0. Migration đã chạy chưa (SQL trên DB DEV)

⚠️ 9 migration CRM đã được **đánh số lại** sang `1794300000000+` để hết trùng với `dev`.
Chúng CHƯA từng chạy ở đâu, nên lần deploy DEV này là lần đầu.

```sql
-- 9 migration phải có mặt, KHÔNG thiếu cái nào
SELECT name FROM migrations WHERE name LIKE '%17943%' ORDER BY timestamp;

-- 11 bảng CRM
SELECT tablename FROM pg_tables
 WHERE tablename LIKE 'crm\_%' OR tablename = 'zns_send_log' ORDER BY 1;
-- crm_account, crm_account_event, crm_account_member, crm_campaign,
-- crm_campaign_recipient, crm_customer_metrics, crm_customer_note, crm_customer_tag,
-- crm_message_optout, crm_segment, crm_ticket, crm_ticket_event, zns_send_log

-- Ràng buộc CHỊU LỰC — phải đủ 5 dòng, và 2 cái đầu phải là PARTIAL (có WHERE)
SELECT indexname, indexdef FROM pg_indexes
 WHERE indexname IN ('uq_crm_account_tax_code','uq_crm_account_member_user',
                     'uq_crm_recipient_campaign_user','uq_crm_customer_tag',
                     'uq_crm_segment_name');

-- Khoá ngoại GĐ6 — 3 dòng
SELECT conname FROM pg_constraint WHERE conname LIKE 'fk_crm_account%';

-- Quyền: crm-compensate CHỈ quan-ly-chung. Thấy 'cskh' ở đây là SAI NGHIÊM TRỌNG.
SELECT key FROM admin_role WHERE 'crm-compensate' = ANY(functions);
SELECT key FROM admin_role WHERE 'crm-tickets'    = ANY(functions) ORDER BY key;

-- Trần đền bù
SELECT key, value FROM system_config WHERE key LIKE 'CRM_%' ORDER BY key;
```

## 1. GĐ3 — Ticket khiếu nại + SLA + đền bù (VÙNG TIỀN THẬT)

1. `/crm-tickets` → tạo ticket cho một khách, chọn loại + mức đề xuất. Ticket hiện trong danh
   sách kèm hạn SLA.
2. Mở hồ sơ khách (`/users/detail?id=…`) → khối **Ticket** hiện đúng ticket vừa tạo, và
   timeline có dòng nguồn TICKET.
3. **Nhập `500.000`** vào ô tiền → phải hiểu là 500000, KHÔNG phải 500.
4. Tài khoản **không có** `crm-compensate` → không thấy nút duyệt đền bù. Đây là ranh giới
   chịu lực: CSKH chỉ ĐỀ XUẤT, không tự duyệt.
5. Tài khoản **có** `crm-compensate` → duyệt một khoản nhỏ (vd 20.000đ) → kiểm:
   ```sql
   SELECT type, amount, "referenceId", description FROM wallet_transaction
    WHERE "referenceId" LIKE 'crm-ticket:%' ORDER BY "createdAt" DESC LIMIT 5;
   SELECT type, balance FROM wallet WHERE "userId" = '<userId khách>';
   ```
   Ví phải là loại **`USER`** (không phải `USER_REFERRAL` — dùng nhầm là hỏng đối soát affiliate).
6. **Vượt trần**: thử duyệt một khoản lớn hơn trần/ca → phải bị CHẶN, không có đường mật khẩu
   nào để vượt.
7. Khách **chưa có ví** → duyệt đền bù vẫn chạy (hệ thống tạo ví số dư 0).

## 2. GĐ4 — Chỉ số RFM + phân khúc

1. Chạy tay `POST /admin/crm/segments/recompute` (nút "Tính lại" trên `/crm-segments`) —
   **ngày đầu bắt buộc**, nếu không mọi phân khúc đều rỗng và không ai hiểu vì sao.
2. Bấm "Tính lại" **hai lần liên tiếp thật nhanh** → lần hai phải bị bỏ qua (khoá), không
   trộn hai mốc thời gian. Kiểm log: "một lượt tính khác đang chạy — bỏ qua lượt này".
3. `/crm-segments` → dựng một tệp bằng rule, xem trước ra **số khách + mẫu 20 người**.
4. Hồ sơ 360 của một khách → hàng chỉ số hiện kèm **mốc `computedAt`** (đây là ảnh chụp cron
   03:00, không phải realtime).
5. **Ca then chốt của GĐ4**: tìm một khách CŨ nghỉ hơn 180 ngày → phân khúc phải là
   **"Đã rời bỏ"**, TUYỆT ĐỐI không phải "Chưa đi chuyến". Sai chỗ này là họ sẽ nhận tin
   onboarding "chào mừng bạn đến với ViGo".
   ```sql
   SELECT "userId", "tripsCompleted", segment, "churnRisk", "lastTripAt"
     FROM crm_customer_metrics
    WHERE "lastTripAt" < now() - interval '180 days' LIMIT 10;
   -- segment phải là DA_ROI_BO hoặc MOT_LAN_ROI_THOI, KHÔNG có CHUA_DI_CHUYEN
   ```
6. Gửi rule rác (`{"all":[{"field":"constructor","op":"eq","value":1}]}`) → phải ra **400 sạch**,
   không phải 500 kèm thông điệp DB.

## 3. GĐ5 — Chiến dịch chăm sóc (GỬI RA NGOÀI — cẩn thận)

> ⚠️ Test trên DEV vẫn gửi ZNS/push THẬT nếu số điện thoại là thật. Dùng tệp 1 người là
> chính bạn.

1. **Danh sách chặn trước đã** (đây là thứ mới có đường vào): hồ sơ 360 → khối **"Tin chăm
   sóc"** → bấm "Ngừng gửi tin chăm sóc" kèm lý do → kiểm `SELECT * FROM crm_message_optout;`
   phải có dòng, `revokedAt IS NULL`.
2. Bấm "Cho phép gửi lại" → dòng đó **VẪN CÒN**, chỉ thêm `revokedAt` + `revokedByAdminId`.
   Mất dòng = xoá cứng = sai.
3. Tài khoản chỉ có `users` (không có `crm-campaigns`) → **bật** chặn được, nhưng **không**
   thấy nút "Cho phép gửi lại".
4. `/crm-campaigns` với tài khoản chỉ có `crm-campaigns` (không có `crm-segments`) → trang
   phải MỞ ĐƯỢC và chọn được tệp. 403 ở đây nghĩa là function đó tự nó vô dụng.
5. Tạo chiến dịch PUSH cho tệp 1 người → bấm Gửi → toast phải nói **"đang gửi trong nền"**,
   không nói "đã gửi N". Đợi ít phút rồi bấm "Kết quả".
6. Gửi cho khách **đang bị chặn** → kết quả ghi `SKIPPED / Khách đã yêu cầu ngừng nhận`.
7. Gửi cho khách **không cài app** → `SKIPPED / Khách chưa cài app`, KHÔNG phải "đã gửi".
8. Chiến dịch ZNS trong khung **22h–6h giờ VN** → phải bị từ chối ngay với câu giải thích,
   không được để cả tệp FAILED.
9. Chiến dịch đang ở trạng thái **"Đang gửi"** → nút Gửi vẫn còn, bấm lại KHÔNG gửi trùng
   cho người đã nhận.
10. Bộ đếm tần suất: gửi cho một khách 2 lần trong tuần (mặc định `CRM_MAX_MESSAGES_PER_WEEK`
    = 2) rồi gửi lần 3 → `SKIPPED / Đã nhận đủ số tin cho phép trong tuần`. Rồi bắn tay một
    tin khuyến mãi từ `/notifications` cho chính khách đó và kiểm bộ đếm có tính không.

## 4. GĐ6 — Khách doanh nghiệp

1. `/crm-accounts` → tạo hồ sơ công ty có MST → tạo hồ sơ thứ hai **cùng MST** → phải bị chặn
   với câu rõ ràng.
2. Gán nhân viên bằng **UUID bịa** → phải báo "Không tìm thấy khách hàng với ID này", KHÔNG
   được tạo thành công một "nhân viên ma".
3. Gán một khách vào công ty A, rồi thử gán vào công ty B → bị chặn. Bấm **"Gỡ"** ở A rồi gán
   lại vào B → phải CHẠY ĐƯỢC (trước đây kẹt vĩnh viễn vì không có nút Gỡ).
4. Người đã gỡ vẫn hiện trong danh sách (gạch ngang, "đã gỡ") — không biến mất.
5. **SĐT nhân viên phải BỊ CHE** (dạng `09*****78`). Thấy số đầy đủ ở đây là lỗ hổng: nó là
   đường vòng qua chốt ghi vết `reveal-phone` của GĐ2.
6. Sửa chiết khấu 5% → 25% → mục Lịch sử phải ghi **"Chiết khấu 5% → 25%"**, không phải chỉ
   "25%". Bấm Lưu mà không đổi gì → ghi "không có điều khoản nào thay đổi".
7. **Ca tiền**: bấm "Xem chuyến 30 ngày" cho công ty có nhân viên đã đi chuyến CÓ KHUYẾN MẠI
   → con số phải khớp `SUM(finalPrice)`, và nhãn ghi "tiền khách trả (gồm VAT)".
   ```sql
   SELECT COUNT(*), SUM(COALESCE(b."finalPrice", b.price)) AS dung,
          SUM(b.price) AS sai_truoc_day
     FROM booking b JOIN crm_account_member m ON m."userId" = b."customerId"
    WHERE m."accountId" = '<id công ty>' AND b.status = 'COMPLETED'
      AND b."completedAt" >= now() - interval '30 days';
   ```
8. **Ca số liệu quá khứ không đổi ngược**: ghi lại con số kỳ → gỡ một nhân viên → xem lại
   cùng kỳ đó → con số phải **GIỮ NGUYÊN**.

## 5. GĐ7 — Insights

1. `/crm-insights` → 4 khối đều lên. Nếu một khối lỗi thì 3 khối kia vẫn hiện (không trắng trang).
2. Bảng cohort: hàng của **tháng VN hiện tại** phải có nhãn **"(chưa đủ kỳ quan sát)"**.
3. Dưới bảng có câu nói rõ cột "quay lại" đếm **toàn thời gian**, không phải trong kỳ.
4. **Ca đối chiếu chéo** — hai màn phải nói cùng một con số:
   ```sql
   -- /crm-insights (tripFrequency) đếm khách đi đúng 1 chuyến
   SELECT COUNT(*) FROM (
     SELECT b."customerId" FROM booking b
       JOIN "user" u ON u.id = b."customerId" AND u.role = 'USER'
      WHERE b.status='COMPLETED' GROUP BY 1 HAVING COUNT(*)=1) x;
   -- /crm-segments (metrics) — cùng tập khách
   SELECT COUNT(*) FROM crm_customer_metrics WHERE "tripsCompleted" = 1;
   ```
   Hai số lệch nhau nhiều = định nghĩa tập khách đã lệch lại, phải báo.
5. Bảng "Lý do CSKH ghi nhận khi gọi" **không được** có dòng nào `outcome = CLAIMED`.
6. CSAT hiện phân bố sao 5→1, và mức không ai chấm vẫn hiện `0 (0%)`.
7. Đổi múi giờ máy sang Mỹ (hoặc mở từ máy khác múi giờ) → khoảng ngày mặc định **không đổi**.

## 6. Ranh giới quyền (làm cuối, cần 1 tài khoản test)

Tạo một role hẹp rồi bật/tắt từng function, kiểm menu VÀ kiểm gõ thẳng URL:

| Function | Thấy menu | Vào được | KHÔNG được thấy |
|---|---|---|---|
| `crm-tickets` | Ticket khách hàng | `/crm-tickets` | nút duyệt đền bù |
| `crm-segments` | Phân khúc | `/crm-segments` | `/crm-campaigns`, `/crm-accounts` |
| `crm-campaigns` | Chiến dịch | `/crm-campaigns` (+ chọn được tệp) | nút "Xem trước" rule tuỳ ý |
| `crm-accounts` | Khách doanh nghiệp | `/crm-accounts` | — |
| `crm-insights` | Insights | `/crm-insights` | — |
| `crm-compensate` | (không có menu) | tick được ở `/roles` nhóm "Chức năng đặc biệt" | — |

## 7. Sau khi test xong

- ĐẠT hết → PR `feat/crm-queue-api` → `main` và `feat/crm-queue` → `main` (KHÔNG PR `dev → main`,
  KHÔNG cherry-pick), merge xong resync `main → dev`.
- Có lỗi → ghi vào đây kèm bước tái hiện, sửa trên nhánh feature, merge lại `dev`, test lại.

## Nợ đã biết (đừng báo lại như lỗi mới)

- Trang "Hồ sơ công ty" **chưa hiện được hồ sơ**: `contactName/Phone/Email` chỉ set được lúc
  tạo, `paymentTermDays`/`contractNote` có API sửa nhưng FE chưa gửi. Là thiếu tính năng, chờ
  quyết định.
- Ô gán nhân viên vẫn bắt **dán UUID**, chưa có ô tìm khách theo tên/SĐT.
- `User.password` thiếu `select: false` — hoãn vô thời hạn theo quyết định user; GĐ3 chỉ vá
  hẹp ở riêng response `getAdminUserDetail`.
- 3 cặp migration trùng timestamp trên `dev` (không cặp nào của CRM) — xem
  `migration-runner-safety.spec.ts`, chủ sở hữu từng feature nên dọn trước khi promote.
