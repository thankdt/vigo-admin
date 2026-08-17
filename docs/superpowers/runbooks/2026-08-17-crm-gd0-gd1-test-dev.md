# CRM GĐ0 + GĐ1 — checklist test trên DEV

> Bản này thay cho runbook nháp trong scratchpad (scratchpad nằm ở `/private/tmp`, mất khi
> khởi động lại máy). Cập nhật 2026-08-17.

**Trạng thái:** code xong cả 2 repo, đã ở `dev`, đã qua review đối kháng, mọi finding
CHẶN/ĐÁNG SỬA đã vá. **Còn thiếu đúng một thứ: người thật bấm thử trên DEV.**

## Nhánh

| Repo | Nhánh | Đã ở `dev` |
|---|---|---|
| vigo-backend | `feat/crm-queue-api` | ✅ |
| vigo-admin | `feat/crm-gd0-menu` (GĐ0) | ✅ |
| vigo-admin | `feat/crm-queue` (GĐ1, xếp chồng GĐ0) | ✅ |

> ⚠️ **CHƯA lên `main`, và chưa tới lúc.** Luật hiện hành (user chốt 2026-08-17): mảng việc
> nhiều giai đoạn thì **ở lại nhánh feature cho tới khi xong HẾT spec CRM** rồi mới lên `main`
> + deploy prod. Test DEV vẫn làm ngay sau mỗi giai đoạn — đó là mục đích của file này.

---

## 1. Kiểm migration đã chạy (SQL trên DB DEV)

```sql
\d booking   -- phải thấy callBeforeById, callAfterById, callBeforeStatus, callAfterStatus

SELECT c.relname AS indexname, i.indisvalid
  FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
 WHERE c.relname LIKE 'IDX_booking_call_%';        -- 2 dòng, indisvalid = t

SELECT value FROM system_config WHERE key = 'CSKH_CALL_AFTER_OVERDUE_HOURS';   -- '24'

SELECT key FROM admin_role WHERE 'crm-queue' = ANY(functions) ORDER BY key;
-- phải ra 4 dòng: cskh, full-access-legacy, quan-ly-chung, van-hanh
```

Cả 4 mục trên **đã được kiểm ngày 2026-08-17 và ĐẠT**. Chạy lại chỉ để chắc sau lần deploy DEV
gần nhất.

## 2. GĐ0 — menu (5 mục)

1. Menu trái: nhóm **"Khách hàng (CRM)"** ngay sau "Xử lý vi phạm", gồm 4 mục theo thứ tự
   Hàng đợi CSKH / Khách hàng / Hoạt động CSKH / Nguồn khách.
2. `/users` mặc định lọc **"Khách"**; đổi sang "Chủ HTX" vẫn ra danh sách chủ HTX. Tiêu đề
   trang là "Khách hàng", **không còn** nút "Thêm người dùng".
3. `/transport-companies` → menu ba chấm của công ty **đã gán chủ** → có "Xem hồ sơ tài khoản
   chủ", bấm mở đúng người.
4. Công ty **chưa gán chủ** → mục đó không hiện.
5. Tài khoản có `transport-companies` nhưng **không có** `users` → mục đó không hiện.

## 3. GĐ1 — hàng đợi `/crm-queue` (cần 2 người thử cùng lúc)

1. Tạo vai trò thử **chỉ có `crm-queue`**, gán cho một tài khoản. Tài khoản đó vào được
   `/crm-queue`, **không** thấy và **không** vào được `/bookings`.
2. **Cả 5 tab** trả đúng tập chuyến: *Cần gọi trước hoàn thành · Cần gọi sau hoàn thành ·
   Việc của tôi · Đang có người giữ · Quá hạn gọi sau*. Mỗi tab có dòng giải thích ngay dưới
   tiêu đề — đọc thử xem CSKH có hiểu không, đây là thứ cần feedback thật.
3. **Luồng chính (chỗ từng có lỗi CHẶN, đã vá):** ở tab *Cần gọi trước hoàn thành* bấm
   **Nhận gọi** → dòng rời tab đó → sang tab **Việc của tôi** → dòng đó phải hiện **2 nút kết
   quả** ("Đã gọi được" / "Không liên lạc được"), **KHÔNG** hiện lại "Nhận gọi", và cột
   "Người giữ việc" hiện **tên bạn**.
4. Ghi kết quả → dòng rời khỏi *Việc của tôi*.
5. Tab *Cần gọi sau hoàn thành*: ghi kết quả → dòng rời khỏi cả tab đó **và** tab *Quá hạn*.
6. Tab *Việc của tôi* chỉ hiện việc **của chính mình** (nhờ 2 người cùng thử).
7. Bấm nút mắt → dialog chi tiết mở; giờ trong dialog **khớp** giờ ở dòng (cả hai là giờ VN).
8. Vai trò cũ chỉ có `bookings` vẫn dùng `/bookings` bình thường; trang đó **không còn** 2
   dropdown lọc gọi và 2 cột trạng thái gọi, và hàng "Không tìm thấy chuyến nào" trải đúng hết
   chiều ngang ở **cả 4 tab** của trang đó (Tất cả / Hoàn thành / Đã huỷ / Đặt lịch).
9. `/cskh-activity` có thẻ **"Sót gọi trước hoàn thành — toàn thời gian"**, nằm ngoài lưới 4
   thẻ lọc theo ngày (cố ý: nó đếm toàn thời gian).
10. **Chính CSKH** dùng thử một buổi, xác nhận không thiếu việc gì so với cách cũ.

## 4. Dữ liệu thật trên DEV — đã đo 2026-08-17

Không cần chạy lại trừ khi muốn số mới. Kết luận: **không cần kẹp cửa sổ thời gian cho tab.**

| Số | Giá trị | Ý nghĩa |
|---|---|---|
| Chuyến COMPLETED chưa có gọi sau | 102 (71 cũ hơn 30 ngày) | Tab *Cần gọi sau* khởi đầu 102 dòng — vừa phải, không cần kẹp |
| Chuyến trong tab *Cần gọi trước* | 3, không có dòng nào cũ | Không có rác lịch sử |
| Tổng booking / COMPLETED | 8.171 / 142 | Quy mô DEV nhỏ |

## 5. Sau khi test xong

Báo lại kết quả. **Không** merge lên `main` — GĐ2 còn chưa code. Nếu có lỗi thì vá trên chính
nhánh feature cũ.

---

## Quyết định liên quan, đã chốt (để khỏi hỏi lại)

1. **Che SĐT khách** — `/crm-queue` **giữ hiện đủ**. Việc che + audit log đã được user chốt
   **làm ở GĐ2**, và chỉ áp cho `/users` + `/users/detail` (bề mặt tra cứu tuỳ ý), không áp cho
   `/crm-queue` / `/bookings` (bề mặt theo việc). Xem plan GĐ2 Task 2.5.
2. **Cửa sổ thời gian cho tab** — **không cần**, theo số đo ở mục 4.
3. **`user.password` thiếu `select: false`** — **hoãn vô thời hạn** (user chốt 2026-08-17).
   Code giữ ở nhánh `fix/user-password-select-false` của vigo-backend. Điều kiện duy nhất phải
   nhớ: **đừng tạo role production chỉ-có-`crm-queue`-không-`bookings`** (vai trò thử ở mục 3.1
   là tạm, test xong thì xoá). Chi tiết trong spec §13.6.

## Rollback (chỉ dùng khi đã lên prod — hiện CHƯA)

Lui admin: backend giữ cột mới vẫn an toàn (thuần thêm mới). Lui backend sau khi đã cấp quyền:
key `crm-queue` còn sót trong `admin_role.functions` sẽ làm `rbac.service` từ chối lưu role đó
(VAL_001) — dọn bằng:

```sql
UPDATE admin_role SET functions = array_remove(functions, 'crm-queue')
 WHERE 'crm-queue' = ANY(functions);
```
