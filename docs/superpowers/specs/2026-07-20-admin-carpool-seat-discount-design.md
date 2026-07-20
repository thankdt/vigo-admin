# Admin: Giảm giá CARPOOL theo ghế + auto-switch bao xe

**Ngày:** 2026-07-20
**Phạm vi:** `src/app/(app)/bookings/components/create-booking-dialog.tsx`,
`src/app/(app)/bookings/components/bookings-table.tsx`,
`src/app/(app)/settings/components/system-config-groups.ts`, `src/lib/types.ts`.
**Loại:** Tích hợp contract backend đã deploy dev (KHÔNG đổi backend). Additive-only.

## Bối cảnh

Backend (`vigo-backend`, đã deploy dev) đã xong 2 việc:

1. **Giảm giá theo số ghế cho CARPOOL** — 4 key `system_config`
   `CARPOOL_SEAT_DISCOUNT_2/3/4/5` (% giảm khi đặt 2/3/4/5 ghế). Response
   `POST /pricing/calculate` (và breakdown của booking) trả thêm trong
   `breakdown`: `seatDiscountPercent` (0-100), `seatDiscountAmount` (VND đã giảm).
2. **Auto-switch CARPOOL → RIDE ("bao xe")** khi `requestedSeats >= sức chứa xe`
   (`CAR_4` = 4, `CAR_7` = 6) — **chỉ chạy nếu request có `requestedVehicleType`**.
   Response booking trả thêm top-level: `effectiveServiceType` (string — `'RIDE'`
   nếu đã switch, ngược lại là `serviceType` gốc), `switchedToWholeCar` (boolean).

`vigo-admin` chưa đọc field mới nào, và **form tạo chuyến hiện KHÔNG gửi
`requestedVehicleType` khi `serviceType === 'CARPOOL'`** — nghĩa là auto-switch
sẽ **KHÔNG BAO GIỜ** kích hoạt cho chuyến admin/đại lý tạo, dù backend đã hỗ trợ.
Đây là gap bắt buộc phải vá, không chỉ là "hiển thị thêm field".

## Khảo sát code hiện trạng (đã verify)

### 1. `create-booking-dialog.tsx` — nguồn của gap

- State: `serviceType: 'RIDE' | 'DELIVERY' | 'CARPOOL'` (dòng 47),
  `vehicleType: 'CAR_4' | 'CAR_7'` (dòng 48, default `'CAR_4'`).
- `showPassengerFields = serviceType === 'RIDE' || serviceType === 'CARPOOL'`
  (dòng 61) — CARPOOL đã thu thập `requestedSeats` (tổng khách, derive từ
  customer + co-passengers) qua UI hành khách (dòng 494-547). Field này ĐÃ
  đúng, không cần đổi.
- `requestedVehicleType` chỉ được gửi khi `serviceType === 'RIDE'`, ở **2 nơi**:
  - `handleEstimate` (dòng 128): `requestedVehicleType: serviceType === 'RIDE' ? vehicleType : undefined,`
  - `handleSubmit` (dòng 286): y hệt.
- **UI chọn "Loại xe" CHỈ render khi `serviceType === 'RIDE'`** (dòng 466-478,
  nhánh `if` của ternary trong grid "Service & Vehicle"). Nhánh `else`
  (DELIVERY **hoặc CARPOOL**) render một ô Ghi chú thay vào chỗ đó (dòng
  479-484). Với CARPOOL, `vehicleType` chỉ tồn tại ngầm trong state (mặc định
  `CAR_4`, không có cách nào đổi qua UI).
  → **Đây là "việc ẩn": ngay cả khi sửa 2 dòng gửi payload ở trên, admin vẫn
  KHÔNG có cách chọn loại xe cho CARPOOL — luôn gửi `CAR_4` mặc định.** Phải
  thêm UI chọn `vehicleType` khi `serviceType === 'CARPOOL'` mới coi là xong.
- Ghi chú (note) cho RIDE có **2 vị trí** hiện tại: cột 2 của grid khi không
  phải RIDE (dòng 480-483, dùng cho DELIVERY/CARPOOL hiện nay), và một khối
  Ghi chú riêng bên dưới chỉ hiện khi `serviceType === 'RIDE'` (dòng 487-492).
  Khi thêm ô "Loại xe" vào cột 2 cho CARPOOL, ô Ghi chú của CARPOOL mất chỗ ở
  cột 2 → phải dời xuống khối Ghi chú riêng (mở rộng điều kiện dòng 487 từ
  `serviceType === 'RIDE'` sang `serviceType === 'RIDE' || serviceType === 'CARPOOL'`).
  DELIVERY giữ nguyên vị trí ghi chú ở cột 2 — không đổi hành vi DELIVERY.
- `maxTotal` cho CARPOOL đang **hardcode = 6** bất kể `vehicleType` (dòng 62:
  `serviceType === 'RIDE' ? (vehicleType === 'CAR_7' ? 6 : 4) : 6`). Comment
  dòng 58-60 xác nhận đây là chốt có chủ đích, khớp app khách. **Spec này
  KHÔNG đổi `maxTotal`** — chỉ thêm khả năng chọn `vehicleType` để gửi lên
  backend cho auto-switch; giới hạn UI số khách CARPOOL giữ 6 như cũ. Hệ quả
  phụ (chấp nhận được, không phải bug): admin có thể tạo CARPOOL + `CAR_4` với
  5-6 khách → backend tự switch sang RIDE `CAR_4`. Đây chính là tính năng cần
  test, không phải lỗi.
- `estimateTripPrice` (`src/lib/api.ts:680-710`) đã có tham số
  `requestedVehicleType?: 'CAR_4' | 'CAR_7'` sẵn — không cần đổi type, chỉ cần
  gọi đúng giá trị. Response type của hàm này (dòng 693) hiện KHÔNG map
  `effectiveServiceType`/`switchedToWholeCar`/`breakdown` — **ngoài phạm vi
  spec này** (dialog "Tính giá" chỉ hiển thị `price`/`finalPrice`, không hiển
  thị cảnh báo switch). Ghi nhận là hạn chế còn lại, không chặn scope hiện tại.
- `createAdminBooking` (`src/lib/api.ts:712+`) cũng đã có
  `requestedVehicleType?: 'CAR_4' | 'CAR_7'` sẵn — không cần đổi.

### 2. `system-config-groups.ts` — nhóm cấu hình

- `CONFIG_GROUPS` là danh sách match theo thứ tự, khớp phần tử ĐẦU tiên
  (dòng 4-6). Nhóm `pricing` (dòng 11): `match: (k) => k.startsWith('PRICING_') || k.endsWith('COMMISSION_RATE')`.
  4 key `CARPOOL_SEAT_DISCOUNT_2/3/4/5` không khớp prefix/suffix nào ở trên →
  rơi vào catch-all `misc` (dòng 31, luôn đứng cuối).
  Editor cấu hình (`system-config-manager.tsx`, ngoài phạm vi khảo sát chi
  tiết ở đây) là generic — hiện MỌI key trả về từ API, sửa được ngay không cần
  thêm gì. Việc nhóm chỉ ảnh hưởng khả năng TÌM key, không ảnh hưởng khả năng
  SỬA.

### 3. `bookings-table.tsx` — hiển thị chi tiết booking

- `PriceBreakdownCard` (hàm nội bộ, KHÔNG export, dòng 106-369) nhận
  `booking: Booking`, đọc `booking.priceBreakdown`.
- Mảng `discounts` (dòng 124-127) hiện có 2 dòng cứng: `loyaltyDiscount`
  (label "Khách thân thiết"), `promotionDiscount` (label "Mã khuyến mãi") —
  lọc `value > 0`. Render trong card ở dòng 326-336 (mỗi dòng: label trái,
  `-{fmtVnd(value)}` phải, màu `text-orange-600`).
- `serviceTypeMap` (dòng 395-399) map `RIDE/DELIVERY/CARPOOL` → label có
  emoji. Badge dùng nó ở dòng 438-441, **trong `BookingDetail`** (không phải
  trong `PriceBreakdownCard`) — cùng hàng với `getStatusBadge`, `isPooled`,
  `requestedSeats`, `requestedVehicleType`, `paymentMethod` (dòng 436-459).
  Đây đúng là chỗ cần thêm badge `switchedToWholeCar`.
- `vehicleTypeMap` (dòng 94-97) đã có sẵn map `CAR_4`/`CAR_7` → "Xe 4/7 chỗ",
  dùng cho badge `requestedVehicleType` hiện tại — tái dùng được nếu cần hiển
  thị loại xe đã switch sang (không bắt buộc, xem "Quyết định thiết kế").
- `PriceBreakdown` type (`src/lib/types.ts:172-187`): các field hiện có
  `transportPrice, sizeSurcharge, weightSurcharge, weekendSurcharge,
  holidaySurcharge, serviceFee, vatAmount, loyaltyDiscount,
  promotionDiscount, priceBeforeDiscount?`. Thiếu `seatDiscountPercent`,
  `seatDiscountAmount`.
- `Booking` type (`src/lib/types.ts:222-306`) có `serviceType?: string`,
  `isPooled?: boolean`, `requestedSeats?/requestedVehicleType?` nhưng KHÔNG
  có `effectiveServiceType`/`switchedToWholeCar`.
- `getBookingDetails` (`src/lib/api.ts:620-624`) trả thẳng `result.data`,
  không lọc/allowlist field nào → field mới từ backend tự động có mặt trên
  object JS ngay khi backend deploy, chỉ cần TS type + JSX đọc field là xong
  (không cần đổi hàm API).

## Quyết định thiết kế (chốt cho plan)

1. **[BẮT BUỘC] Thêm UI chọn "Loại xe" cho CARPOOL** (không chỉ sửa payload).
   - Hiện select "Loại xe" khi `serviceType === 'RIDE' || serviceType === 'CARPOOL'`.
     Với CARPOOL: KHÔNG bắt buộc (không có dấu `*` đỏ) — vẫn có default
     `CAR_4` nên luôn gửi được `requestedVehicleType`, admin có thể đổi sang
     `CAR_7` nếu muốn test/khai báo xe lớn hơn.
   - Thêm dòng chú thích nhỏ dưới select khi CARPOOL: "Dùng để tự động chuyển
     sang Bao xe khi đủ số ghế trên xe này." — giải thích lý do field xuất
     hiện, tránh admin hiểu nhầm đây là gán xe thật.
   - Ghi chú (note) của CARPOOL dời xuống khối Ghi chú riêng (chung khối với
     RIDE) do mất chỗ ở cột 2. DELIVERY không đổi.
   - `maxTotal`/`maxExtras` cho CARPOOL giữ nguyên (không phụ thuộc
     `vehicleType`) — xem lý do ở khảo sát trên.
2. **Payload:** đổi 2 dòng ternary trong `handleEstimate` và `handleSubmit`
   thành gửi `vehicleType` cho cả `RIDE` và `CARPOOL`. **Extract logic này
   thành 1 pure helper** (thay vì lặp inline ở 2 nơi) để unit-test độc lập,
   theo đúng pattern đã có của file (`schedule-utils.ts`, `voucher-utils.ts`):
   file mới `vehicle-type-utils.ts`, export
   `resolveRequestedVehicleType(serviceType, vehicleType)`.
3. **Nhóm config:** thêm `|| k.startsWith('CARPOOL_SEAT_DISCOUNT')` vào match
   của nhóm `pricing`. Không sửa gì trong editor (đã generic).
4. **Hiển thị chi tiết booking:**
   - `PriceBreakdown` type: thêm `seatDiscountPercent?: number;
     seatDiscountAmount?: number;` (optional — additive, chuyến cũ không có).
   - `Booking` type: thêm `effectiveServiceType?: string;
     switchedToWholeCar?: boolean;` (optional).
   - Dòng giảm giá theo ghế trong `discounts`: label
     `Giảm giá theo số ghế (đi chung)` khi `seatDiscountPercent` không có/0,
     hoặc `Giảm giá theo số ghế (đi chung, -N%)` khi có `seatDiscountPercent > 0`
     — chỉ hiện khi `seatDiscountAmount > 0` (đồng nhất cách lọc với 2 dòng
     hiện có). **Extract mảng `discounts` thành pure helper**
     `buildDiscountRows(breakdown)` trong file mới `price-breakdown-utils.ts`
     để unit-test độc lập (không phải render React).
   - Badge "Đã tự chuyển sang Bao xe" (màu amber, khác biệt các badge outline
     khác để nổi bật) hiện ngay sau badge `serviceType` khi
     `booking.switchedToWholeCar === true`. Badge `serviceType` giữ nguyên
     hiển thị loại dịch vụ GỐC khách/admin chọn (CARPOOL) — không đổi thành
     `effectiveServiceType` — để admin thấy cả yêu cầu gốc và kết quả switch.
   - `PriceBreakdownCard` được thêm từ khoá `export` (đổi tối thiểu, không
     đổi hành vi) để có thể unit-test component độc lập bằng
     `@testing-library/react` mà không phải mock toàn bộ `BookingDetail`
     (`getBookingDetails`, dialogs...).

## Không làm (ngoài phạm vi, ghi nhận để tránh hiểu lầm là thiếu)

- KHÔNG hiển thị cảnh báo/switch trong dialog "Tính giá" của
  `create-booking-dialog.tsx` (chỉ hiển thị giá cuối). `estimateTripPrice`
  response type không được mở rộng để đọc `switchedToWholeCar` — nếu muốn,
  cần một task riêng, không nằm trong phạm vi user đã chốt (1 bắt buộc + 2
  enhance).
- KHÔNG đổi `maxTotal`/logic giới hạn số khách CARPOOL theo `vehicleType`.
- KHÔNG đổi backend, KHÔNG đổi editor cấu hình generic.

## Tương thích ngược

- Tất cả field mới trên `PriceBreakdown`/`Booking` là **optional, additive**
  — booking cũ (không có field mới) vẫn render đúng như trước (điều kiện lọc
  `value > 0` / `booking.switchedToWholeCar === true` tự bỏ qua khi field
  `undefined`).
- Payload gửi lên backend: `requestedVehicleType` cho CARPOOL là field backend
  ĐÃ hỗ trợ (theo contract), không phải field mới — an toàn gửi ngay.
- Không đổi field nào app khách/tài xế đọc (đây là 2 file chỉ dùng ở
  `vigo-admin`).
- Không đổi enum, không đổi shape `request/response` hiện có — chỉ thêm.

## Điểm cần user quyết / rủi ro (đã tự quyết theo hướng an toàn nhất, nêu để user biết)

1. **Label giảm giá ghế** — đã chọn "Giảm giá theo số ghế (đi chung)". User có
   thể muốn từ khác (vd "Ưu đãi đi chung nhiều người") — dễ đổi 1 dòng nếu cần.
2. **Badge switch màu amber** — chọn màu khác với các badge `outline` hiện có
   để admin dễ nhận biết trạng thái đặc biệt; có thể đổi sang `variant`
   khác nếu user muốn đồng bộ hơn.
3. **Không hiện cảnh báo switch ở dialog "Tính giá"** — nếu user muốn admin
   thấy trước khi tạo chuyến (không chỉ sau khi xem chi tiết), cần thêm 1 task
   mở rộng `estimateTripPrice` type + UI — chưa nằm trong phạm vi 3 điểm đã
   chốt.
4. **Loại xe cho CARPOOL không bắt buộc (`*`)** — nếu user muốn ép admin luôn
   chọn tường minh (tránh phụ thuộc default `CAR_4` ngầm), đổi thành bắt buộc
   dễ dàng (thêm dấu `*` + validate ở `handleSubmit`).

## Backward-compat với backend — đã verify (không phải giả định)

Sub-agent review đặt câu hỏi: gửi `requestedVehicleType` cho CARPOOL có an
toàn nếu PR admin này lỡ đi tới prod TRƯỚC khi backend seat-discount/switch
merge `main` (backend hiện "đã deploy dev", chưa chắc đã ở prod)? Đã verify
trực tiếp trong `vigo-backend`, KHÔNG phải giả định:

- `src/booking/dto/admin-create-booking.dto.ts:31-33` và
  `src/booking/dto/agent-create-booking.dto.ts:37-39` (2 DTO
  `createAdminBooking`/agent dùng): field `requestedVehicleType` **đã tồn tại
  trên DTO từ trước** (dùng cho RIDE), chỉ có
  `@ValidateIf(o => o.serviceType === ServiceType.RIDE)` — decorator này CHỈ
  tắt việc *validate* enum khi không phải RIDE, KHÔNG khiến
  `ValidationPipe({ whitelist: true })` strip field (whitelist chỉ strip field
  KHÔNG có decorator nào trên DTO — field này có decorator nên luôn được giữ).
  → Gửi `requestedVehicleType` kèm `serviceType: 'CARPOOL'` tới BẤT KỲ version
  backend nào (cũ hay mới) đều được DTO chấp nhận, không 400. Backend cũ
  (chưa có logic switch) đơn giản nhận rồi không dùng tới — an toàn tuyệt đối,
  không phải rủi ro cần thêm gate rollout.
