# Plan — Tìm chuyến theo SĐT/tên: khớp cả thông tin lưu trên chuyến

## Bối cảnh (đã xác minh trên prod, read-only)
- RIDE/CARPOOL: `booking.senderInfo` = bản chụp {tên, SĐT} của TÀI KHOẢN lúc đặt (app khách lấy từ
  hồ sơ đang đăng nhập; admin/đại lý do backend chụp). Khách được phép đổi SĐT/tên (quyết định nghiệp vụ: giữ).
- Ví dụ: TK 79de2da0 đăng ký bằng 0375588908 "Ngọc(híp)", 05/09 đổi sang 0867283359 "Vân anh".
  393/14.366 chuyến chở khách có SĐT bản chụp ≠ SĐT tài khoản hiện tại.
- Admin `GET bookings/admin/list?q=` chỉ lọc tên/SĐT TK khách + tài xế HIỆN TẠI; bảng lại hiện bản chụp.
- Định dạng SĐT lưu trong DB không đồng nhất: phần lớn `0xxxxxxxxx`, nhưng có `84…`, `+84…`,
  `0xxx xxxxxxx`, dấu cách cuối, SOCIAL-…

## B — Backend (`vigo-backend`, nhánh `fix/booking-search-sender-snapshot`, deploy TRƯỚC)
Sửa tại chỗ mệnh đề `q` trong `findAllBookings`.

1. **Khớp thêm bản chụp:** `senderInfo->>'name'`, `senderInfo->>'phone'` (ngoài 4 cột cũ).
   `->>` trên jsonb không phải object trả NULL → không lỗi.
2. KHÔNG chuẩn hoá SĐT / escape wildcard (user chốt: DB còn nhiều SĐT sai định dạng) — giữ `ILIKE %q%` như cũ cho cả 6 cột.
3. q rỗng/chỉ khoảng trắng → không sinh mệnh đề (như cũ).
- Contract không đổi (cùng param `q`), chỉ mở rộng kết quả → tương thích client cũ. Chỉ admin
  `/bookings` gửi `q`; app khách/tài xế không dùng endpoint này.
- Hiệu năng: ~15k chuyến, mệnh đề vốn đã seq-scan (ILIKE `%…%`) → thêm vài biểu thức, chấp nhận.
- Test (jest): mở rộng test q sẵn có ở `booking.service.spec.ts` (~1870): đủ 6 cột, q rỗng không sinh mệnh đề.
- Giới hạn: test mock không chạy Postgres → smoke test trên DEV (tìm SĐT cũ của TK đã đổi số).

## A — Admin (`vigo-admin`, nhánh `fix/bookings-account-vs-snapshot`)
- Hàm thuần mới `currentAccountIfDiffers(booking)` → `{ name, phone } | null`:
  - Trả TK hiện tại CHỈ KHI SĐT bản chụp có giá trị, SĐT TK là SĐT VN hợp lệ, và
    `!sameVnPhone(bản chụp, TK)` (đã chuẩn hoá +84/khoảng trắng, dùng `@/lib/phone`).
  - Chỉ khác tên, cùng số → không hiện (tránh nhiễu). SĐT TK dạng SOCIAL-… → không hiện.
    Tên TK rỗng → "(không tên)".
- Bảng danh sách (`bookings-table.tsx`) + chi tiết chuyến (`booking-detail.tsx`): thêm dòng phụ nhỏ
  `TK: Vân anh · 0867283359`, tooltip "SĐT lưu trên chuyến khác SĐT hiện tại của tài khoản đặt chuyến".
  Giữ nguyên dòng bản chụp, badge "Chuyến đầu", dòng "Đặt hộ".
- Chi tiết chuyến không nạp TK đã xoá mềm → TK xoá mềm thì không có dòng phụ (chấp nhận).
- Sửa comment `getBookings.q` (`src/lib/api.ts`) cho khớp hành vi mới.
- Test (vitest): unit hàm thuần + render bảng (có dòng khi khác số, không có khi cùng số khác định dạng).

## Rollout
Backend → DEV test → PR main → deploy BE; admin → DEV test → PR main → deploy. A không phụ thuộc B.

## Đã chốt với user
- Không xử lý "Tạo lại chuyến".
- Khách đổi SĐT là bình thường, không chặn.
- KHÔNG chuẩn hoá ô tìm kiếm (DB còn nhiều SĐT sai định dạng).
