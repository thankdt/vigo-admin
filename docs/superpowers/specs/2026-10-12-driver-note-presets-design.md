# Ghi chú tài xế dạng danh mục chọn sẵn (driver note presets)

Ngày: 2026-10-12 · Repo: vigo-backend (trước) + vigo-admin · Trạng thái: chờ duyệt

**Nhánh (làm hết rồi merge 1 thể, không tách PR):**
- backend: `feat/booking-driver-cs-note` (đã có `driver.csNote` trong danh sách chuyến) + presets.
- admin: `fix/driver-cs-note-ui` (đã gộp `feat/booking-driver-cs-note-tag`) + presets.
Cả hai nhánh hiện mới ở `dev`, chưa vào `main`.

## Mục tiêu
Ghi chú của tài xế (`driver.csNote`, hiện ở cột "Ghi chú" trang `/drivers` và thành tag cạnh
tài xế ở danh sách chuyến đi) chuyển từ gõ tự do sang **chọn từ danh mục có sẵn**. Người có
quyền riêng mới được thêm mục mới; người còn lại chỉ chọn mục đã có.

## Phạm vi
- Mỗi tài xế **một** ghi chú (chọn 1 mục). Nhiều tag để sau.
- Quản lý mục: **thêm / đổi tên / xoá (gỡ)**, trong một dialog "Quản lý ghi chú tài xế" mở từ
  dropdown (chỉ hiện khi có quyền) — KHÔNG làm trang settings riêng (đỡ thêm menu/route).
  Chưa có sắp xếp thứ tự (theo `sortOrder` mặc định rồi tên).
- KHÔNG đụng "CSKH — Lịch sử làm việc" (nút "Ghi nhận", bảng `driver_customer_call_event`) —
  đó là nhật ký riêng, không liên thông với `csNote`.
- KHÔNG đụng dialog chi tiết ở trang đơn vị vận tải/HTX (`driver-detail-dialog.tsx`).

## Dữ liệu (backend)
Bảng mới `driver_note_preset`: `id` uuid pk, `label` varchar(100) (duy nhất không phân biệt
hoa thường, trim), `sortOrder` int, `createdAt`,
`createdByUserId` uuid null.
Migration seed 3 mục: "Chuyên chạy ghép", "Chưa chạy ghép bao giờ",
"Bắt đầu tìm hiểu và đã chạy ghép". `driver.csNote` giữ nguyên (chuỗi = nội dung mục đã chọn).

## API & quyền
- Quyền mới `driver-note-presets` thêm vào `MENU_FUNCTIONS` (`rbac.constants.ts`), không cấp
  mặc định cho role nào; cập nhật spec RBAC/route-coverage liên quan.
- `GET /drivers/admin/note-presets` — `@RequireFunction('drivers')`; trả toàn bộ mục, theo
  `sortOrder, label`.
- `POST /drivers/admin/note-presets` `{label}` — `@RequireFunction('driver-note-presets')`;
  trim, 1–100 ký tự; trùng nhãn (không phân biệt hoa thường) → trả mục có sẵn (idempotent).
- `PATCH /drivers/admin/:id/cs-status` giữ hợp đồng. Thêm kiểm tra phía service cho `csNote`:
  - rỗng/khoảng trắng (xoá) → luôn cho;
  - bằng giá trị hiện tại → luôn cho (không chặn lưu `csCalled` kèm theo);
  - khớp nhãn một mục trong danh mục → cho;
  - còn lại → người có `driver-note-presets` cho (đồng thời tạo mục vào danh mục), người không
    có → 403.
  Kiểm tra ở backend, không chỉ ẩn UI.
- `PATCH /drivers/admin/note-presets/:id` `{label}` và `DELETE .../:id` — cùng quyền
  `driver-note-presets`. Đổi tên: trong 1 transaction, cập nhật preset + `UPDATE driver SET
  "csNote" = <mới> WHERE "csNote" = <cũ>` (để tài xế đã gán không bị lệch); nhãn mới trùng mục
  khác → 409. Xoá: **chỉ khi không tài xế nào đang dùng**
  (`COUNT(driver WHERE csNote = label) = 0`, kiểm tra + xoá cùng transaction); có người dùng
  → 409 kèm số tài xế, buộc phải đổi tên thay vì xoá. Xoá thật (hard delete) hàng preset.
- Cách biết quyền người gọi (đã kiểm tra): `DriversModule` đã import `RbacModule`; dùng
  `RbacService.isSuperAdmin(userId)` + `getEffectiveFunctions(userId).has('driver-note-presets')`
  — cùng mẫu `driver-penalty.service.ts` `assertScope`. Super admin luôn có quyền.
- Cần thêm key vào `MENU_FUNCTIONS` (BE `rbac.constants.ts`, giống `loyalty-adjust`) VÀ
  `SPECIAL_FUNCTIONS` (FE `src/lib/rbac.ts`) — thiếu FE thì không tick cấp được ở `/roles`.
  Cập nhật test parity (`rbac.constants.spec.ts`, `function-catalog.test.ts`).

## Giao diện (admin)
- Component dùng chung `DriverNoteSelect`: dropdown các mục + "Không có ghi chú" (xoá) và,
  khi có quyền, "+ Thêm ghi chú mới…" (nhập tên → tạo → chọn luôn).
- Thay ô nhập inline ở cột "Ghi chú" (`drivers-table.tsx`) và textarea "Ghi chú CSKH" ở dialog
  chi tiết `/drivers` (nhánh `fix/driver-cs-note-ui`). Đổi tên mục dialog thành
  "Ghi chú tài xế (hiện ở danh sách chuyến đi)" để khỏi nhầm với nhật ký CSKH.
- Giá trị hiện tại không thuộc danh mục (vd `jjj`) hiện là "(tự nhập) …" đang chọn; chỉ người
  có quyền mới giữ/đổi tự do, người khác phải chọn mục có sẵn.
- Quyền hiện tại: `can('driver-note-presets')` (hook `canFn` ở `src/lib/rbac.ts`, như
  `customer-loyalty-card.tsx` dùng `can('loyalty-adjust')`; super admin tự có).
- Tag ở danh sách chuyến đi giữ nguyên.

## Tương thích cũ
Chỉ thêm bảng/endpoint; response cũ không đổi; app tài xế/khách không đụng. Backend deploy
trước admin; admin mới + backend cũ → dropdown báo lỗi tải danh mục.

## Kiểm thử
- Backend: spec service (thêm mới, trùng nhãn, 403 khi không quyền, giữ nguyên giá trị cũ,
  xoá), controller + route-coverage/RBAC constants.
- Admin: test `DriverNoteSelect` có/không quyền, giá trị ngoài danh mục.
- Test đầy đủ do Jenkins DEV chạy (máy dev 8GB: chỉ `tsc` + spec lẻ).

## Rủi ro
- Quyền/guard: phân loại **CAO** (RBAC) → cần 1 lượt review độc lập cho plan/code.
- Rename mục sau này không tự cập nhật `csNote` đã gán (chấp nhận ở v1).
