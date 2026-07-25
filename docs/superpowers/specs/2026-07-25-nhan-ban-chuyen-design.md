# Nhân bản chuyến (copy chuyến) trên admin — Design

Ngày: 2026-07-25 · Nhánh: `feat/duplicate-booking` · Phạm vi: chỉ vigo-admin (FE)

## 1. Mục tiêu

Admin đang phải gõ lại toàn bộ thông tin khi khách quen đặt lại chuyến giống chuyến
cũ (cùng khách, cùng tuyến, cùng giờ, chỉ đổi tài xế hoặc lệch chút địa điểm). Thêm
hành động **"Nhân bản chuyến"**: mở form Tạo chuyến đã điền sẵn thông tin của một
chuyến có sẵn, admin sửa phần cần đổi rồi tạo chuyến mới.

Không phải: sửa chuyến cũ, copy text ra clipboard, hay tạo chuyến định kỳ tự động.
Chuyến gốc không bị thay đổi gì.

## 2. Bối cảnh kỹ thuật (đã xác minh)

Backend **không cần đổi**. `GET /bookings/admin/list` và `GET /bookings/admin/:id`
đều serialize nguyên entity `Booking` (không DTO, không `select`), nên mọi trường
cần thiết đã có sẵn trên object booking mà admin đang giữ trong tay:

- `pickupAddress` / `dropoffAddress`: cột `jsonb`, shape chuẩn `{ address, lat, long }`
  (chú ý key **`long`**, không phải `lng`). Vì là jsonb tự do, rows cũ/bên thứ ba có
  thể mang biến thể `latitude` / `lng` / `longitude` — backend cũng phải fallback như
  vậy ở `dispatch.processor.ts`.
- `passengerNames: string[] | null` — index 0 là khách chính, phần còn lại là khách đi cùng.
- `promotionId: number | null` — **chỉ là số**, không có relation promotion nào được join.
- `note`, `serviceType`, `requestedSeats`, `requestedVehicleType`,
  `scheduledTime` / `scheduledFromTime` / `scheduledToTime`.

FE `src/lib/types.ts` hiện chưa khai báo `passengerNames` và `promotionId` trên type
`Booking` → thêm 2 field optional (additive, không phá chỗ nào).

File liên quan:
- `src/app/(app)/bookings/components/bookings-table.tsx` (~1524 dòng) — bảng chuyến,
  menu `...` mỗi dòng, component `BookingDetail`, nơi render `CreateBookingDialog`.
- `src/app/(app)/bookings/components/create-booking-dialog.tsx` (~789 dòng) — form tạo
  chuyến, dùng chung cho admin và agent-portal (`mode='agent'`).
- `src/app/(app)/bookings/components/address-autocomplete.tsx` — đã sync 2 chiều với
  prop `value` (set text khi có, xoá khi rỗng) → prefill và swap chỉ cần đổi state cha.
- `src/app/(app)/bookings/components/schedule-utils.ts` — `validateWindow` chặn giờ đón
  quá khứ (slack 60s) và `to <= from`; `toIso` đổi `datetime-local` → ISO.
- `src/app/(app)/bookings/components/voucher-utils.ts` — `isVoucherSelectable`.

## 3. Kiến trúc: mở rộng `CreateBookingDialog` thành controlled + nhận prefill

Đã cân nhắc và loại:
- **Component `DuplicateBookingDialog` riêng**: nhân đôi ~800 dòng logic ước giá tự
  động / voucher / hành khách → chắc chắn lệch khi bảo trì.
- **Query param `?duplicateFrom=<id>`**: deep-link được nhưng thêm 1 API call và state
  đồng bộ URL; static export + client routing sinh thêm ca lỗi. Chưa cần.

Chọn: giữ **một form duy nhất**, thêm đường controlled.

```
BookingsTable  (giữ state duplicateFrom: Booking | null)
  ├── menu "..." mỗi dòng      → setDuplicateFrom(booking)
  ├── BookingDetail            → onDuplicate(booking): đóng detail rồi setDuplicateFrom
  └── CreateBookingDialog
        - đường uncontrolled (như hiện tại): nút "Tạo chuyến" + DialogTrigger
        - đường controlled: props open / onOpenChange / initial
```

### 3.1 API của `CreateBookingDialog` (props mới, tất cả optional)

```ts
interface CreateBookingDialogProps {
  onSuccess: () => void;
  mode?: 'admin' | 'agent';
  // Controlled mode — dùng khi mở từ "Nhân bản chuyến". Khi truyền `open`,
  // dialog KHÔNG render DialogTrigger (không có nút "Tạo chuyến" thứ hai).
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Giá trị điền sẵn. Áp đúng MỘT LẦN mỗi lần dialog mở.
  initial?: BookingDraft | null;
}
```

Quy tắc: `open === undefined` → giữ nguyên hành vi hiện tại (agent-portal và nút "Tạo
chuyến" của admin không đổi gì). `open !== undefined` → state mở đóng do cha quyết,
`resetForm()` vẫn chạy khi đóng.

### 3.2 `duplicate-utils.ts` (file mới, thuần, có unit test)

```ts
export type BookingDraft = {
  sourceBookingId: string;
  customerPhone: string;
  customerName: string;
  pickup: { address: string; lat: number; long: number } | null;
  dropoff: { address: string; lat: number; long: number } | null;
  // Địa chỉ đọc được text nhưng THIẾU toạ độ → không dựng được điểm, cần chọn lại.
  missingCoords: Array<'pickup' | 'dropoff'>;
  serviceType: 'RIDE' | 'DELIVERY' | 'CARPOOL';
  vehicleType: 'CAR_4' | 'CAR_7';
  coPassengers: string[];
  note: string;
  isScheduled: boolean;
  scheduledFrom: string;   // 'YYYY-MM-DDTHH:mm' (local wall-clock)
  scheduledTo: string;
  promotionId: number | null;
};

export function bookingToDraft(b: Booking, now?: number): BookingDraft;
```

Quy tắc từng trường:

| Trường | Nguồn & quy tắc |
|---|---|
| `customerPhone` / `customerName` | `senderInfo` (snapshot lúc đặt, bền hơn) → fallback `customer.phone/fullName` → `''`. |
| `pickup` / `dropoff` | Object `{address, lat, long}`; đọc lat theo `lat \| latitude`, long theo `long \| lng \| longitude`. Address dạng string thuần hoặc thiếu toạ độ → field = `null` và ghi vào `missingCoords`. Toạ độ `0/0` coi như thiếu. |
| `serviceType` | Validate theo union; lệch/thiếu → `'CARPOOL'` (mặc định hiện tại của form). |
| `vehicleType` | `requestedVehicleType` nếu là `CAR_4`/`CAR_7`, ngược lại `'CAR_4'`. |
| `coPassengers` | `passengerNames.slice(1)`, bỏ chuỗi rỗng, **cắt theo trần ghế ngay trong draft** (RIDE CAR_4 → 3 khách đi cùng, CAR_7 → 5, CARPOOL/DELIVERY → 5). Effect `maxExtras` của form chỉ chạy khi cap ĐỔI nên không cắt được ca này. |
| `note` | Bóc tiền tố backend tự gắn (`[Admin] ` / `[Đặt hộ] `, kể cả đã cộng dồn nhiều lớp) vì BE gắn lại khi tạo chuyến mới; note mặc định ("Tạo bởi admin" / "Tạo bởi đại lý") → rỗng. Phần còn lại chép nguyên, admin sửa được. |
| Giờ đón | Có `scheduledFromTime` (hoặc `scheduledTime`) → `isScheduled = true`, `scheduledFrom = formatLocal(new Date(iso))`, `scheduledTo` = `scheduledToTime` nếu có, không thì `from + 30 phút`. Không có gì → `isScheduled = false`, hai chuỗi rỗng. |
| `promotionId` | Chép nguyên số; **lọc hiệu lực làm ở dialog** (nơi có danh sách voucher). |
| Tài xế | **Không chép.** |
| Giá | **Không chép** — effect ước giá tự động của form tự tính lại. |

`formatLocal` hiện là hàm nội bộ của `create-booking-dialog.tsx` → **chuyển sang
`schedule-utils.ts` và export**, để cả dialog lẫn `duplicate-utils` dùng chung một
bản (local wall-clock; `toIso` đổi ngược lại nên instant không lệch dù browser TZ
nào — giữ đúng quy ước sẵn có của picker). Đây là di chuyển thuần, không đổi hành vi.

### 3.3 Áp `initial` trong dialog

Effect chạy khi `open` chuyển `false → true` và `initial != null`:

1. Set toàn bộ state form theo draft (thay cho `resetForm`).
2. Khách: set `customerPhone` + `customerName`, đặt `customerStatus = 'checking'` rồi
   **tự gọi `checkCustomer()`** — admin không phải bấm "Kiểm tra", đồng thời tên được
   lấy mới nhất từ server (khách có thể đã đổi tên). Lookup lỗi → về `'idle'` như
   luồng thường, admin bấm tay.
3. Voucher: danh sách `vouchers` nạp bất đồng bộ khi mở dialog. Sau khi có danh sách,
   nếu `draft.promotionId` nằm trong `selectableVouchers` → chọn; ngược lại bỏ chọn và
   set cờ hiển thị dòng nhắc "Voucher của chuyến gốc không còn hiệu lực".
4. Ước giá: effect debounce 600ms sẵn có tự chạy khi đã có đủ đón/trả.

### 3.4 Cảnh báo trong form (chỉ khi nhân bản)

- **Giờ đón quá khứ**: banner vàng "Giờ đón của chuyến gốc đã qua — vui lòng chọn lại
  giờ." `validateWindow` sẵn có vẫn chặn submit → không có đường tạo chuyến quá khứ.
  Banner tự ẩn khi giờ đã hợp lệ.
- **Thiếu toạ độ** (`missingCoords` khác rỗng): banner vàng nêu rõ ô nào cần chọn lại;
  ô đó để trống. **Không** gửi `lat/long = 0` vì sẽ phá ước giá và dispatch.
- **Voucher hết hiệu lực**: dòng chữ nhỏ dưới ô voucher.

### 3.5 Nút đảo chiều đón ↔ trả

Nút icon (`ArrowUpDown`, `variant="ghost"`, `size="icon"`, `aria-label="Đảo chiều điểm
đón và điểm trả"`) đặt giữa hai ô địa chỉ, hiển thị **mọi lúc** (cả tạo chuyến thường
lẫn nhân bản, cả `mode='agent'`). Bấm → hoán đổi state `pickup` ↔ `dropoff`;
`AddressAutocomplete` tự sync text qua prop `value`, effect ước giá tự chạy lại.
Chỉ một bên có giá trị thì vẫn hoán đổi (bên kia thành rỗng) — không chặn.

### 3.6 Điểm vào UI

- **Menu `...` mỗi dòng bảng**: mục "Nhân bản chuyến" (icon `CopyPlus`), đặt trên
  nhóm huỷ/đổi trạng thái, có `DropdownMenuSeparator`. **Không disable theo trạng
  thái** — nhân bản chuyến COMPLETED/CANCELLED chính là ca dùng nhiều nhất.
- **`BookingDetail`**: nút "Nhân bản chuyến" (`variant="outline"`) ở `DialogFooter`.
  Nhận prop `onDuplicate: (b: Booking) => void` từ `BookingsTable`; bấm → `onClose()`
  rồi `setDuplicateFrom(b)`. `BookingDetail` không tự quản state nhân bản.
- Cả hai chỗ đều dùng object booking đang có sẵn — **không gọi thêm API**.
- Header form khi có `initial`: tiêu đề "Nhân bản chuyến", mô tả phụ
  "Từ chuyến #<8 ký tự đầu của id> — thông tin đã điền sẵn, sửa lại phần cần đổi."

Chỉ làm ở admin. Agent-portal (`mode='agent'`) không có bảng chuyến kiểu này nên
không thêm điểm vào; nó chỉ hưởng nút đảo chiều.

## 4. Luồng dữ liệu

```
row/detail Booking
   → bookingToDraft(b)            (thuần, không I/O)
   → setDuplicateFrom / draft
   → CreateBookingDialog open=true initial=draft
   → effect áp state + auto checkCustomer() + lọc voucher
   → effect ước giá (600ms debounce)
   → admin sửa → handleSubmit → createAdminBooking (payload KHÔNG đổi shape)
   → onSuccess() → reload() bảng; duplicateFrom = null
```

## 5. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| `checkCustomer` lỗi mạng | `customerStatus = 'idle'`, toast như luồng thường, admin bấm "Kiểm tra" tay. |
| Booking không có SĐT khách (customer bị xoá mềm, không có senderInfo) | Để trống SĐT, `customerStatus = 'idle'` — form đã bắt buộc nhập trước khi tạo. |
| Địa chỉ thiếu toạ độ | Ô trống + banner; submit bị chặn bởi validate "Vui lòng chọn địa chỉ đón/trả" sẵn có. |
| Giờ gốc ở quá khứ | Banner + `validateWindow` chặn submit. |
| Voucher hết hạn/hết lượt | Bỏ chọn + dòng nhắc; giá tính lại không giảm. |
| Danh sách voucher tải lỗi | Bỏ chọn voucher, phần còn lại vẫn điền bình thường. |
| `passengerNames` vượt giới hạn ghế | Effect `maxExtras` sẵn có tự cắt. |

## 6. Test

Vitest cho `duplicate-utils.test.ts` (`npx vitest run`):
- Địa chỉ đủ toạ độ dạng chuẩn `{address, lat, long}`.
- Biến thể key: `lng`, `latitude/longitude` → vẫn đọc được.
- Địa chỉ là string thuần, hoặc thiếu lat/long, hoặc `0/0` → `null` + `missingCoords`.
- `passengerNames` = null / `['Khách A']` / `['A','B','C']` → `coPassengers` đúng.
- Chuyến không đặt lịch → `isScheduled = false`.
- Có `scheduledFromTime` + `scheduledToTime` → map đủ cả hai.
- Chỉ có `scheduledTime` → `to = from + 30′`.
- `serviceType` lạ / `requestedVehicleType = null` → giá trị mặc định.
- `customer = null` nhưng có `senderInfo` → vẫn lấy được SĐT/tên.

Kiểm tĩnh: `npx tsc --noEmit` + `npx vitest run`.
Kiểm runtime trên DEV trước khi PR → main (cổng bắt buộc theo CLAUDE.md).

## 7. Rủi ro & tương thích

- Phân loại theo CLAUDE.md §0.5.b: đụng voucher + đường tạo chuyến → **rủi ro CAO**
  → đã chạy 1 lượt sub-agent review fresh-context (Opus) sau khi code xong. Kết quả:
  1 finding chặn + 2 nên sửa + 5 nhỏ, đã xử lý trong cùng nhánh:
  - **Chặn** — `resetForm()` set `customerStatus='idle'` cho cả `mode='agent'`, mà agent
    portal không có nút "Kiểm tra" → sau khi bấm Hủy thì kẹt, không đặt hộ được nữa
    (nút Hủy nay gọi `resetForm`). Sửa: reset về `mode === 'agent' ? 'new' : 'idle'`.
  - Lookup SĐT không sequencing → response của SĐT cũ đè tên lên SĐT mới (tạo khách mới
    mang tên người khác). Sửa: `lookupSeqRef` bỏ kết quả cũ. Ước giá cũng thêm
    `estimateSeqRef` (giá cũ đè giá mới → admin báo giá sai).
  - `AddressAutocomplete` trả `lat/long = 0` khi place-detail lỗi → chặn ở `handleSubmit`
    + banner tính theo `hasCoords()` thay vì chỉ `!= null` (banner cũng hết lệch nhãn
    sau khi bấm đảo chiều).
  - Note cộng dồn tiền tố `[Admin]`, `passengerNames` vượt trần ghế → xử lý trong draft.
  - Voucher: phân biệt "lỗi tải danh sách" với "hết hiệu lực" trong dòng nhắc.
- Còn tồn (chấp nhận, ngoài phạm vi): `getVouchers()` treo vô hạn (không resolve/reject)
  thì voucher gốc không áp và cũng không có cảnh báo; `formatLocal` hiển thị theo TZ máy
  admin — quy ước sẵn có của toàn bộ picker + bảng chuyến, muốn theo VN tuyệt đối phải
  đổi cả cụm (PR riêng).
- Tương thích client cũ: thay đổi **thuần FE admin**. Payload `createAdminBooking` /
  `createAgentBooking` giữ nguyên shape; không đụng endpoint dùng chung với app
  khách/tài xế. Thêm field optional vào type `Booking` của FE là additive.
- Rủi ro hồi quy đáng canh: refactor `open` của `CreateBookingDialog` không được làm
  hỏng đường uncontrolled ở agent-portal (`src/app/agent-portal/(portal)/dashboard/page.tsx`)
  và nút "Tạo chuyến" hiện tại của bảng.
