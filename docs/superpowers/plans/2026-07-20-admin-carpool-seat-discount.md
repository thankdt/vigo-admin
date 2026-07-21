# Admin: Giảm giá CARPOOL theo ghế + auto-switch bao xe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) [BẮT BUỘC] Form tạo chuyến gửi `requestedVehicleType` cho CARPOOL
(hiện thêm UI chọn "Loại xe" khi CARPOOL — hiện tại UI này chỉ tồn tại cho
RIDE) để backend auto-switch CARPOOL→RIDE hoạt động được cho chuyến admin/đại
lý tạo. (2) [Enhance] Nhóm 4 key `CARPOOL_SEAT_DISCOUNT_2/3/4/5` vào nhóm "Giá
& Hoa hồng" trong trang cấu hình. (3) [Enhance] Hiển thị dòng giảm giá theo
ghế + badge "đã chuyển bao xe" ở chi tiết booking.

**Backend contract (đã deploy dev, KHÔNG đổi trong plan này):**
`POST /pricing/calculate` và response booking đã có thêm: top-level
`effectiveServiceType` (string), `switchedToWholeCar` (boolean); trong
`breakdown`: `seatDiscountPercent` (0-100), `seatDiscountAmount` (VND).
Auto-switch chỉ chạy nếu request có `requestedVehicleType` VÀ
`requestedSeats >= sức chứa` (`CAR_4`=4, `CAR_7`=6).

**Spec:** [docs/superpowers/specs/2026-07-20-admin-carpool-seat-discount-design.md](../specs/2026-07-20-admin-carpool-seat-discount-design.md)

**Kiểm tĩnh (theo CLAUDE.md dự án):** `npx tsc --noEmit` + `npx vitest run`
(repo có sẵn vitest + `@testing-library/react`/`jest-dom`/`user-event`, xem
`vitest.config.ts`, `vitest.setup.ts`).

**Quy trình BẮT BUỘC trước khi code (CLAUDE.md, đã hoàn tất bước này khi soạn
plan):** cắt nhánh `feat/*` từ `main` (đang ở `main`, sạch — `git status`
verify trước khi cắt). Plan này đã qua vòng tự-review đối kháng (xem cuối
file) trước khi trình user.

---

## File Structure

| File | Thay đổi |
|---|---|
| `src/app/(app)/bookings/components/vehicle-type-utils.ts` | **Mới.** Pure helper `resolveRequestedVehicleType`. |
| `src/app/(app)/bookings/components/vehicle-type-utils.test.ts` | **Mới.** Test cho helper trên. |
| `src/app/(app)/bookings/components/create-booking-dialog.tsx` | Dùng helper ở 2 chỗ gửi payload; thêm UI "Loại xe" cho CARPOOL; dời vị trí Ghi chú CARPOOL. |
| `src/app/(app)/bookings/components/create-booking-dialog.test.tsx` | **Mới.** RTL smoke test: chọn CARPOOL → hiện select "Loại xe"; DELIVERY vẫn hiện Ghi chú (regression). |
| `src/app/(app)/settings/components/system-config-groups.ts` | Thêm điều kiện `CARPOOL_SEAT_DISCOUNT` vào nhóm `pricing`. |
| `src/app/(app)/settings/components/system-config-groups.test.ts` | Thêm test case cho 4 key mới (file đã tồn tại, mở rộng). |
| `src/app/(app)/bookings/components/price-breakdown-utils.ts` | **Mới.** Pure helper `buildDiscountRows`. |
| `src/app/(app)/bookings/components/price-breakdown-utils.test.ts` | **Mới.** Test cho helper trên. |
| `src/app/(app)/bookings/components/bookings-table.tsx` | `PriceBreakdownCard` dùng `buildDiscountRows` + thêm `export`; thêm badge `switchedToWholeCar` trong `BookingDetail`. |
| `src/app/(app)/bookings/components/bookings-table.test.tsx` | **Mới.** RTL test cho `PriceBreakdownCard` (export mới) với/không có `seatDiscountAmount`. |
| `src/lib/types.ts` | `PriceBreakdown` thêm `seatDiscountPercent?`, `seatDiscountAmount?`; `Booking` thêm `effectiveServiceType?`, `switchedToWholeCar?`. |

Không có file bị xoá. Không đổi API layer (`src/lib/api.ts`) — `estimateTripPrice`/
`createAdminBooking` đã có `requestedVehicleType?: 'CAR_4' | 'CAR_7'` sẵn.

---

## Task 0: Cắt nhánh — ĐÃ LÀM

- [x] Nhánh `feat/admin-carpool-seat-discount` đã cắt & rebase lên `origin/main` (`fece6db`); spec+plan đã commit.

> ⚠️ **CẬP NHẬT BASE (2026-07-20):** base là `origin/main = fece6db`. So với bản draft đầu, **`create-booking-dialog.tsx` đã đổi (+69/-44)** nên SỐ DÒNG dịch — cấu trúc thì GIỮ NGUYÊN (đã verify). Anchor hiện tại cần dùng:
> - 2 site payload `requestedVehicleType: serviceType === 'RIDE' ? vehicleType : undefined`: `handleEstimate` **:132**, `handleSubmit` **:302** (không phải 128/286).
> - Ternary "Loại xe" (if `serviceType==='RIDE'`) : "Ghi chú" (else, `id="cb-note"`): **:490-508**.
> - Khối Ghi chú RIDE-only riêng: **:511-516** (mở rộng điều kiện sang CARPOOL).
> - `showPassengerFields = serviceType==='RIDE' || 'CARPOOL'`: **:65** (CARPOOL đã hiện passenger fields).
> - `const [vehicleType]` state: **:52**. 3 file còn lại (bookings-table, system-config-groups, types) KHÔNG đổi → anchor plan giữ nguyên.
> **Người code PHẢI grep snippet neo để định vị lại**, số dòng chỉ là gợi ý.

---

## Task 1: [BẮT BUỘC] Pure helper `resolveRequestedVehicleType` (TDD)

**Files:**
- Mới: `src/app/(app)/bookings/components/vehicle-type-utils.ts`
- Mới: `src/app/(app)/bookings/components/vehicle-type-utils.test.ts`

Lý do extract: 2 nơi (`handleEstimate`, `handleSubmit`) hiện lặp inline ternary
`serviceType === 'RIDE' ? vehicleType : undefined`. Nếu sửa cả 2 chỗ độc lập dễ
lệch (đã có tiền lệ — 2 chỗ y hệt nhau trong file). Gom vào 1 hàm pure, theo
đúng pattern hiện có của repo (`schedule-utils.ts`, `voucher-utils.ts`: pure
helper colocated + test riêng, không cần render React để test logic).

- [ ] **Bước 1 — viết test trước** (`vehicle-type-utils.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { resolveRequestedVehicleType } from './vehicle-type-utils';

describe('resolveRequestedVehicleType', () => {
  it('trả về vehicleType khi RIDE', () => {
    expect(resolveRequestedVehicleType('RIDE', 'CAR_4')).toBe('CAR_4');
    expect(resolveRequestedVehicleType('RIDE', 'CAR_7')).toBe('CAR_7');
  });

  it('trả về vehicleType khi CARPOOL (fix chính của task này)', () => {
    expect(resolveRequestedVehicleType('CARPOOL', 'CAR_4')).toBe('CAR_4');
    expect(resolveRequestedVehicleType('CARPOOL', 'CAR_7')).toBe('CAR_7');
  });

  it('trả về undefined khi DELIVERY (không đổi hành vi cũ)', () => {
    expect(resolveRequestedVehicleType('DELIVERY', 'CAR_4')).toBeUndefined();
  });
});
```

Chạy `npx vitest run vehicle-type-utils` — phải FAIL (module chưa tồn tại).

- [ ] **Bước 2 — implement** (`vehicle-type-utils.ts`). Tách riêng
  `isVehicleTypeApplicable` làm **1 nguồn sự thật duy nhất** cho CẢ 2 mối
  quan tâm — (a) JSX có hiện select "Loại xe" không, (b) payload có gửi
  `requestedVehicleType` không — để không thể lệch nhau về sau (khác lỗi gốc
  của bug này: điều kiện UI và điều kiện payload từng là 2 chỗ độc lập, dễ
  quên đồng bộ):

```ts
// Pure helper: quyết định CARPOOL/RIDE có áp dụng "loại xe" không — dùng
// CHUNG cho (a) điều kiện hiện select "Loại xe" trong JSX và (b) điều kiện
// gửi requestedVehicleType lên backend, để 2 nơi này KHÔNG THỂ lệch nhau
// (bug gốc của tính năng này: UI ẩn field mà payload logic lại tưởng có
// field để gửi — vì 2 điều kiện từng được viết độc lập ở 2 nơi).
// Backend dùng requestedVehicleType để auto-switch CARPOOL→RIDE khi
// requestedSeats >= sức chứa xe (CAR_4=4, CAR_7=6) — CHỈ chạy nếu field này
// có mặt trong request.
export type ServiceType = 'RIDE' | 'DELIVERY' | 'CARPOOL';
export type VehicleType = 'CAR_4' | 'CAR_7';

export function isVehicleTypeApplicable(serviceType: ServiceType): boolean {
  return serviceType === 'RIDE' || serviceType === 'CARPOOL';
}

export function resolveRequestedVehicleType(
  serviceType: ServiceType,
  vehicleType: VehicleType,
): VehicleType | undefined {
  return isVehicleTypeApplicable(serviceType) ? vehicleType : undefined;
}
```

Cập nhật test ở Bước 1 để cover thêm `isVehicleTypeApplicable` (RIDE/CARPOOL
→ `true`, DELIVERY → `false`) trước khi viết implementation.

- [ ] **Bước 3:** `npx vitest run vehicle-type-utils` — PASS.

---

## Task 2: [BẮT BUỘC] Sửa `create-booking-dialog.tsx` — payload + UI "Loại xe" cho CARPOOL

**Files:** `src/app/(app)/bookings/components/create-booking-dialog.tsx`

- [ ] **Bước 1 — import helper + dùng ở 2 chỗ gửi payload.**

Thêm import:
```ts
import { isVehicleTypeApplicable, resolveRequestedVehicleType } from './vehicle-type-utils';
```

Dòng ~128 (`handleEstimate`), đổi:
```ts
requestedVehicleType: serviceType === 'RIDE' ? vehicleType : undefined,
```
thành:
```ts
requestedVehicleType: resolveRequestedVehicleType(serviceType, vehicleType),
```

Dòng ~286 (`handleSubmit`), đổi y hệt.

- [ ] **Bước 2 — hiện UI "Loại xe" khi CARPOOL** (dòng 452-485, khối
  "Service & Vehicle").

Hiện tại (dòng 466-484):
```tsx
{serviceType === 'RIDE' ? (
  <div className="space-y-1.5">
    <Label>Loại xe <span className="text-destructive">*</span></Label>
    <Select value={vehicleType} onValueChange={(v) => { setVehicleType(v as any); clearEstimate(); }}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="CAR_4">🚗 5 chỗ</SelectItem>
        <SelectItem value="CAR_7">🚙 7 chỗ</SelectItem>
      </SelectContent>
    </Select>
  </div>
) : (
  <div className="space-y-1.5">
    <Label htmlFor="cb-note">Ghi chú</Label>
    <Textarea id="cb-note" placeholder="Ghi chú..." value={note} onChange={(e) => setNote(e.target.value)} rows={1} className="min-h-[36px] resize-none" />
  </div>
)}
```

Đổi thành (điều kiện `RIDE || CARPOOL` cho nhánh "Loại xe"; giữ nguyên nhánh
Ghi chú cho DELIVERY; thêm chú thích khi CARPOOL; bỏ dấu `*` khi CARPOOL vì
không bắt buộc):

```tsx
{isVehicleTypeApplicable(serviceType) ? (
  <div className="space-y-1.5">
    <Label>
      Loại xe {serviceType === 'RIDE' && <span className="text-destructive">*</span>}
    </Label>
    <Select value={vehicleType} onValueChange={(v) => { setVehicleType(v as any); clearEstimate(); }}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="CAR_4">🚗 5 chỗ</SelectItem>
        <SelectItem value="CAR_7">🚙 7 chỗ</SelectItem>
      </SelectContent>
    </Select>
    {serviceType === 'CARPOOL' && (
      <p className="text-xs text-muted-foreground">
        Đặt đủ số ghế của loại xe này (5 chỗ = 4 khách, 7 chỗ = 6 khách) sẽ tự chuyển sang Bao xe (tính giá cả xe, KHÔNG áp giảm giá theo ghế).
      </p>
    )}
  </div>
) : (
  <div className="space-y-1.5">
    <Label htmlFor="cb-note">Ghi chú</Label>
    <Textarea id="cb-note" placeholder="Ghi chú..." value={note} onChange={(e) => setNote(e.target.value)} rows={1} className="min-h-[36px] resize-none" />
  </div>
)}
```

(Dùng `isVehicleTypeApplicable(serviceType)` — KHÔNG viết lại
`serviceType === 'RIDE' || serviceType === 'CARPOOL'` inline — để điều kiện
JSX này và điều kiện payload ở Bước 1 luôn bám 1 nguồn duy nhất.)

- [ ] **Bước 3 — dời khối Ghi chú riêng cho CARPOOL dùng chung với RIDE.**

Dòng ~487-492, hiện tại:
```tsx
{serviceType === 'RIDE' && (
  <div className="space-y-1.5">
    <Label htmlFor="cb-note">Ghi chú</Label>
    <Textarea id="cb-note" placeholder="VD: Khách VIP, hành lý cồng kềnh..." value={note} onChange={(e) => setNote(e.target.value)} rows={1} className="min-h-[36px] resize-none" />
  </div>
)}
```

Đổi điều kiện thành:
```tsx
{isVehicleTypeApplicable(serviceType) && (
```

(Giữ nguyên phần còn lại — placeholder có thể giữ chung, không cần đổi text.)

- [ ] **Bước 4 — cập nhật comment dòng 58-60 cho khớp code mới** (không bắt
  buộc về hành vi nhưng tránh comment nói sai): comment hiện nói "Passenger
  fields don't apply to DELIVERY" — vẫn đúng, KHÔNG cần sửa. Chỉ cần đảm bảo
  không có comment nào khẳng định "vehicleType chỉ hiện cho RIDE" sai lệch với
  code mới (kiểm bằng mắt sau khi sửa, không có dòng nào như vậy trong file
  hiện tại nên bước này chỉ là double-check, không phải sửa bắt buộc).

- [ ] **Bước 5 — typecheck:** `npx tsc --noEmit` từ root `vigo-admin` — 0 lỗi.

---

## Task 3: [BẮT BUỘC] RTL smoke test cho UI mới trong `create-booking-dialog.tsx`

**Files:** Mới `src/app/(app)/bookings/components/create-booking-dialog.test.tsx`

Mục tiêu: xác nhận (a) chọn CARPOOL → select "Loại xe" xuất hiện (fix chính
của gap), (b) DELIVERY vẫn hiện Ghi chú ở cột 2 (regression — không phá
DELIVERY), (c) RIDE vẫn có dấu `*` bắt buộc, CARPOOL không có.

Component gọi API thật khi mount (`getAvailableDrivers`, `getVouchers`) và khi
tương tác (`lookupCustomerByPhone`, `estimateTripPrice`, `createAdminBooking`)
— mock cả module `@/lib/api` để test chỉ cần render + đổi `serviceType`, không
cần đi hết luồng submit.

**Rủi ro đã biết trước khi viết task này (verify lại trong review, không phải
giả định):** repo dùng Radix `Select` (`@radix-ui/react-select`) qua
`src/components/ui/select.tsx`, và `vitest.setup.ts` hiện **chỉ có
`@testing-library/jest-dom/vitest`** — không có polyfill
`hasPointerCapture`/`scrollIntoView`/`PointerEvent` nào. Grep toàn repo xác
nhận **chưa có test nào từng lái tương tác 1 Radix `Select` bằng
`userEvent`** — đây là incompatibility jsdom+Radix rất phổ biến (lỗi kiểu
`target.hasPointerCapture is not a function` hoặc `PointerEvent is not
defined`), KHÔNG phải chuyện chỉnh selector. Nếu bỏ qua, task này rất dễ ăn
lỗi crash khi thực thi, không phải lỗi assertion sai. Xử lý ngay trong file
test (không đụng `vitest.setup.ts` global — scope rủi ro chỉ trong file này):

- [ ] **Bước 1 — viết test**, kèm polyfill jsdom cho Radix Select ở đầu file:

```tsx
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateBookingDialog } from './create-booking-dialog';

vi.mock('@/lib/api', () => ({
  createAdminBooking: vi.fn(),
  getAvailableDrivers: vi.fn().mockResolvedValue([]),
  lookupCustomerByPhone: vi.fn(),
  estimateTripPrice: vi.fn(),
  getVouchers: vi.fn().mockResolvedValue([]),
}));

// Polyfill jsdom cho Radix Select (@radix-ui/react-select) — jsdom không
// implement Pointer Events / scrollIntoView, Radix gọi các API này khi mở
// dropdown nên userEvent.click trên SelectTrigger sẽ throw nếu thiếu. Chưa
// có test nào trong repo lái 1 Select trước task này nên chưa ai cần thêm
// polyfill này — đây là lần đầu, scope trong file test này (không sửa
// vitest.setup.ts global, tránh ảnh hưởng test khác).
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

async function openDialog() {
  const user = userEvent.setup();
  render(<CreateBookingDialog onSuccess={() => {}} />);
  await user.click(screen.getByRole('button', { name: /tạo chuyến/i }));
  return user;
}

async function selectServiceType(user: ReturnType<typeof userEvent.setup>, label: string) {
  // "Loại dịch vụ" select — dùng trigger theo Label liền kề, khớp cấu trúc
  // Radix Select hiện có trong dialog (không có name/role text trực tiếp).
  const trigger = screen.getByText('Loại dịch vụ').closest('div')!.querySelector('[role="combobox"]')!;
  await user.click(trigger);
  await user.click(await screen.findByText(label));
}

describe('CreateBookingDialog — chọn Loại xe cho CARPOOL (auto-switch bao xe)', () => {
  it('hiện select "Loại xe" khi chọn CARPOOL (trước đây bị ẩn — root cause auto-switch không chạy)', async () => {
    const user = await openDialog();
    await selectServiceType(user, '🚌 Đi chung');
    expect(screen.getByText('Loại xe')).toBeInTheDocument();
    // Không bắt buộc — không có dấu * đỏ.
    const label = screen.getByText('Loại xe').closest('label')!;
    expect(within(label).queryByText('*')).not.toBeInTheDocument();
  });

  it('RIDE vẫn hiện Loại xe và bắt buộc (*)', async () => {
    const user = await openDialog();
    await selectServiceType(user, '🚗 Bao xe');
    const label = screen.getByText(/Loại xe/).closest('label')!;
    expect(within(label).getByText('*')).toBeInTheDocument();
  });

  it('DELIVERY không hiện Loại xe — vẫn hiện Ghi chú (regression)', async () => {
    const user = await openDialog();
    await selectServiceType(user, '📦 Giao hàng');
    expect(screen.queryByText('Loại xe')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ghi chú')).toBeInTheDocument();
  });
});
```

**Ghi chú khi thực thi task này:** chạy `npx vitest run create-booking-dialog`
đầu tiên và đọc lỗi thực tế trước khi sửa bất cứ gì (systematic-debugging,
không đoán mù):
- Nếu vẫn crash ở bước mở dropdown dù đã có 3 polyfill trên (một số version
  Radix còn cần `PointerEvent` constructor thật sự tồn tại trên `window`,
  không chỉ prototype method) → thêm
  `if (!window.PointerEvent) { window.PointerEvent = MouseEvent as any; }`
  trong cùng `beforeAll`.
- Nếu selector text/role lệch so với DOM thật (`role="combobox"`, cấu trúc
  `closest('div')`) do version shadcn — sửa theo lỗi thực tế, giữ nguyên 3
  assertion (nội dung cần verify, không phải cách query).
- Nếu sau các polyfill chuẩn ở trên mà tương tác Radix Select trong jsdom vẫn
  không ổn định (flaky/crash lặp lại) — **hạ mục tiêu test xuống 1 bậc thay
  vì bỏ task**: giữ nguyên 3 case nhưng đổi cách đưa component vào trạng thái
  CARPOOL/RIDE/DELIVERY từ "lái UI qua Select" sang set `serviceType` bằng
  cách khác khả thi trong file thật (vd nếu về sau `serviceType` được refactor
  thành prop/controlled — hiện chưa phải vậy, đây chỉ là phương án dự phòng).
  Ưu tiên vẫn là polyfill + lái UI thật, vì đây đúng là hành vi user thật sự
  thao tác.

- [ ] **Bước 2:** `npx vitest run create-booking-dialog` — PASS cả 3 case.

---

## Task 4: [Enhance] Nhóm 4 key vào "Giá & Hoa hồng" (TDD)

**Files:**
- `src/app/(app)/settings/components/system-config-groups.ts`
- `src/app/(app)/settings/components/system-config-groups.test.ts` (mở rộng
  file đã có)

- [ ] **Bước 1 — viết test trước**, thêm vào `describe('groupIdFor — other groups unchanged (precedence guard)')` hoặc 1 `describe` mới:

```ts
describe('groupIdFor — CARPOOL seat discount keys', () => {
  const seatDiscountKeys = [
    'CARPOOL_SEAT_DISCOUNT_2',
    'CARPOOL_SEAT_DISCOUNT_3',
    'CARPOOL_SEAT_DISCOUNT_4',
    'CARPOOL_SEAT_DISCOUNT_5',
  ];

  it.each(seatDiscountKeys)('routes %s to the pricing group', (key) => {
    expect(groupIdFor(key)).toBe('pricing');
  });

  it('does not fall through to misc (catch-all)', () => {
    expect(groupIdFor('CARPOOL_SEAT_DISCOUNT_2')).not.toBe('misc');
  });
});
```

Chạy `npx vitest run system-config-groups` — 5 test mới FAIL (hiện đang rơi
vào `misc`).

- [ ] **Bước 2 — implement:** dòng 11, đổi:
```ts
{ id: 'pricing', label: 'Giá & Hoa hồng', icon: DollarSign, match: (k) => k.startsWith('PRICING_') || k.endsWith('COMMISSION_RATE') },
```
thành:
```ts
{ id: 'pricing', label: 'Giá & Hoa hồng', icon: DollarSign, match: (k) => k.startsWith('PRICING_') || k.endsWith('COMMISSION_RATE') || k.startsWith('CARPOOL_SEAT_DISCOUNT') },
```

- [ ] **Bước 3:** `npx vitest run system-config-groups` — toàn bộ PASS (5 mới
  + không regress test cũ).

---

## Task 5: [Enhance] Mở rộng type `PriceBreakdown`/`Booking`

**Files:** `src/lib/types.ts`

- [ ] **Bước 1** — `PriceBreakdown` (dòng 172-187), thêm 2 field optional sau
  `promotionDiscount`:

```ts
export type PriceBreakdown = {
  transportPrice: number;
  sizeSurcharge: number;
  weightSurcharge: number;
  weekendSurcharge: number;
  holidaySurcharge: number;
  serviceFee: number;
  vatAmount: number;
  loyaltyDiscount: number;
  promotionDiscount: number;
  // Giảm giá CARPOOL theo số ghế đặt (2-5 ghế). Optional — chuyến cũ /
  // chuyến không phải CARPOOL không có field này (hoặc = 0).
  seatDiscountPercent?: number;
  seatDiscountAmount?: number;
  priceBeforeDiscount?: number;
};
```

- [ ] **Bước 2** — `Booking` (dòng 222+), thêm 2 field optional gần
  `serviceType`/`isPooled` (dòng ~231-234):

```ts
  serviceType?: string;
  // Loại dịch vụ THỰC TẾ sau khi backend auto-switch CARPOOL→RIDE (đủ ghế
  // = sức chứa xe). serviceType giữ nguyên loại GỐC khách/admin chọn;
  // effectiveServiceType phản ánh loại đã áp dụng. Optional — backend cũ /
  // chuyến không switch có thể không có field, hoặc trùng serviceType.
  effectiveServiceType?: string;
  switchedToWholeCar?: boolean;
  isPooled?: boolean;
  requestedSeats?: number;
  requestedVehicleType?: string | null;
```

- [ ] **Bước 3:** `npx tsc --noEmit` — 0 lỗi (thêm field optional không phá
  chỗ nào đang dùng `Booking`/`PriceBreakdown`).

---

## Task 6: [Enhance] Pure helper `buildDiscountRows` (TDD)

**Files:**
- Mới: `src/app/(app)/bookings/components/price-breakdown-utils.ts`
- Mới: `src/app/(app)/bookings/components/price-breakdown-utils.test.ts`

Lý do extract: mảng `discounts` trong `PriceBreakdownCard` (dòng 124-127) là
logic lọc/label thuần, không cần render React để test — theo đúng pattern
`schedule-utils.ts`/`voucher-utils.ts`. Giữ `PriceBreakdownCard` mỏng.

- [ ] **Bước 1 — viết test trước:**

```ts
import { describe, it, expect } from 'vitest';
import { buildDiscountRows } from './price-breakdown-utils';
import type { PriceBreakdown } from '@/lib/types';

const base: PriceBreakdown = {
  transportPrice: 100000, sizeSurcharge: 0, weightSurcharge: 0,
  weekendSurcharge: 0, holidaySurcharge: 0, serviceFee: 0, vatAmount: 0,
  loyaltyDiscount: 0, promotionDiscount: 0,
};

describe('buildDiscountRows', () => {
  it('trả về [] khi breakdown null/undefined', () => {
    expect(buildDiscountRows(null)).toEqual([]);
    expect(buildDiscountRows(undefined)).toEqual([]);
  });

  it('bỏ qua các dòng = 0 (không regress hành vi cũ)', () => {
    expect(buildDiscountRows(base)).toEqual([]);
  });

  it('giữ nguyên 2 dòng cũ khi > 0', () => {
    const rows = buildDiscountRows({ ...base, loyaltyDiscount: 5000, promotionDiscount: 20000 });
    expect(rows).toEqual([
      { label: 'Khách thân thiết', value: 5000 },
      { label: 'Mã khuyến mãi', value: 20000 },
    ]);
  });

  it('thêm dòng giảm giá theo ghế khi seatDiscountAmount > 0, không có percent', () => {
    const rows = buildDiscountRows({ ...base, seatDiscountAmount: 15000 });
    expect(rows).toEqual([
      { label: 'Giảm giá theo số ghế (đi chung)', value: 15000 },
    ]);
  });

  it('thêm % vào label khi có seatDiscountPercent > 0', () => {
    const rows = buildDiscountRows({ ...base, seatDiscountAmount: 15000, seatDiscountPercent: 10 });
    expect(rows).toEqual([
      { label: 'Giảm giá theo số ghế (đi chung, -10%)', value: 15000 },
    ]);
  });

  it('không thêm dòng khi seatDiscountAmount = 0 hoặc thiếu', () => {
    expect(buildDiscountRows({ ...base, seatDiscountAmount: 0 })).toEqual([]);
    expect(buildDiscountRows(base)).toEqual([]);
  });
});
```

Chạy `npx vitest run price-breakdown-utils` — FAIL (module chưa tồn tại).

- [ ] **Bước 2 — implement:**

```ts
import type { PriceBreakdown } from '@/lib/types';

export type DiscountRow = { label: string; value: number };

/**
 * Danh sách dòng giảm giá hiển thị trong PriceBreakdownCard (chi tiết
 * booking). Lọc value > 0 (đồng nhất với hành vi cũ) — chuyến không có
 * giảm giá loại nào thì dòng đó không hiện.
 */
export function buildDiscountRows(breakdown: PriceBreakdown | null | undefined): DiscountRow[] {
  if (!breakdown) return [];
  const rows: DiscountRow[] = [];
  const loyalty = Number(breakdown.loyaltyDiscount ?? 0);
  if (loyalty > 0) rows.push({ label: 'Khách thân thiết', value: loyalty });
  const promotion = Number(breakdown.promotionDiscount ?? 0);
  if (promotion > 0) rows.push({ label: 'Mã khuyến mãi', value: promotion });
  const seatDiscount = Number(breakdown.seatDiscountAmount ?? 0);
  if (seatDiscount > 0) {
    const percent = Number(breakdown.seatDiscountPercent ?? 0);
    const label = percent > 0
      ? `Giảm giá theo số ghế (đi chung, -${percent}%)`
      : 'Giảm giá theo số ghế (đi chung)';
    rows.push({ label, value: seatDiscount });
  }
  return rows;
}
```

- [ ] **Bước 3:** `npx vitest run price-breakdown-utils` — PASS toàn bộ.

---

## Task 7: [Enhance] Wire `buildDiscountRows` + badge switch vào `bookings-table.tsx`

**Files:** `src/app/(app)/bookings/components/bookings-table.tsx`

- [ ] **Bước 1 — import helper:**
```ts
import { buildDiscountRows } from './price-breakdown-utils';
```

- [ ] **Bước 2 — thay mảng `discounts` inline (dòng 124-127)** bằng:
```ts
const discounts = buildDiscountRows(breakdown);
```
(Xoá hoàn toàn khối `Array<{ label: string; value: number }> = breakdown ? [...] : []` cũ — logic đã chuyển vào helper. Giữ nguyên biến `totalDiscount` dòng 130 dùng `discounts.reduce(...)` — không đổi.)

- [ ] **Bước 3 — export `PriceBreakdownCard`** (dòng 106): đổi
```ts
function PriceBreakdownCard({ booking }: { booking: Booking }) {
```
thành
```ts
export function PriceBreakdownCard({ booking }: { booking: Booking }) {
```
(Chỉ thêm từ khoá — không đổi hành vi, không đổi chữ ký. Cho phép test độc
lập ở Task 8 không phải mock `getBookingDetails`.)

- [ ] **Bước 4 — thêm badge switch** trong `BookingDetail`, ngay sau badge
  `serviceType` (dòng 438-442):

```tsx
{booking.serviceType && (
  <Badge variant="outline" className="text-xs">
    {serviceTypeMap[booking.serviceType] ?? booking.serviceType}
  </Badge>
)}
{booking.switchedToWholeCar && (
  <Badge className="text-xs bg-amber-600 text-white hover:bg-amber-600">
    🔁 Đã tự chuyển sang Bao xe
  </Badge>
)}
```

- [ ] **Bước 5:** `npx tsc --noEmit` — 0 lỗi.

---

## Task 8: [Enhance] RTL test cho `PriceBreakdownCard` (export mới)

**Files:** Mới `src/app/(app)/bookings/components/bookings-table.test.tsx`

- [ ] **Bước 1 — viết test:**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriceBreakdownCard } from './bookings-table';
import type { Booking, PriceBreakdown } from '@/lib/types';

const breakdown: PriceBreakdown = {
  transportPrice: 100000, sizeSurcharge: 0, weightSurcharge: 0,
  weekendSurcharge: 0, holidaySurcharge: 0, serviceFee: 0, vatAmount: 0,
  loyaltyDiscount: 0, promotionDiscount: 0,
};

const baseBooking: Booking = {
  id: 'b1', customerId: 'c1', pickupAddress: 'A', dropoffAddress: 'B',
  price: 100000, status: 'COMPLETED', createdAt: new Date().toISOString(),
  customer: null,
} as Booking;

describe('PriceBreakdownCard — giảm giá theo ghế (CARPOOL)', () => {
  it('không hiện dòng giảm giá theo ghế khi seatDiscountAmount = 0/thiếu', () => {
    render(<PriceBreakdownCard booking={{ ...baseBooking, priceBreakdown: breakdown }} />);
    expect(screen.queryByText(/Giảm giá theo số ghế/)).not.toBeInTheDocument();
  });

  it('hiện dòng giảm giá theo ghế kèm % khi có seatDiscountAmount > 0', () => {
    render(
      <PriceBreakdownCard
        booking={{ ...baseBooking, priceBreakdown: { ...breakdown, seatDiscountAmount: 15000, seatDiscountPercent: 10 } }}
      />,
    );
    expect(screen.getByText('Giảm giá theo số ghế (đi chung, -10%)')).toBeInTheDocument();
  });

  it('vẫn hiện 2 dòng giảm giá cũ khi có (regression)', () => {
    render(
      <PriceBreakdownCard
        booking={{ ...baseBooking, priceBreakdown: { ...breakdown, loyaltyDiscount: 5000, promotionDiscount: 20000 } }}
      />,
    );
    expect(screen.getByText('Khách thân thiết')).toBeInTheDocument();
    expect(screen.getByText('Mã khuyến mãi')).toBeInTheDocument();
  });
});
```

- [ ] **Bước 2:** `npx vitest run bookings-table` — PASS. Nếu fixture
  `Booking`/`PriceBreakdown` thiếu field bắt buộc gây lỗi TS trong test, bổ
  sung field tối thiểu cần thiết (không dùng `as any` tràn lan — chỉ cast
  `as Booking` một lần ở object literal cơ sở như mẫu trên, khớp pattern
  test khác trong repo dùng fixture rút gọn).

**Ghi chú:** Badge `switchedToWholeCar` (Task 7 bước 4) KHÔNG có test RTL
riêng — nó nằm trong `BookingDetail`, không export, phụ thuộc
`getBookingDetails` (network). JSX 1 điều kiện, rủi ro thấp; verify bằng
`tsc --noEmit` + kiểm mắt qua dev server (`npm run dev`, mở 1 booking có
`switchedToWholeCar: true` trả từ backend dev) thay vì thêm hạ tầng mock
`getBookingDetails` chỉ để cover 3 dòng JSX.

---

## Task 9: Vòng lặp chất lượng (CLAUDE.md — BẮT BUỘC)

- [ ] **Bước 1 — full test + typecheck:**
```bash
cd /Volumes/exSSD/dev/projects/vigo-admin
npx tsc --noEmit
npx vitest run
```
0 lỗi TS, tất cả test PASS (cũ + mới).

- [ ] **Bước 2 — self-review diff:** `git diff` — đọc lại từng site đã đổi
  theo checklist:
  - CARPOOL giờ gửi `requestedVehicleType` ở CẢ `handleEstimate` và
    `handleSubmit` (không lệch nhau).
  - DELIVERY không bị đổi hành vi (vẫn Ghi chú ở cột 2, không có Loại xe).
  - `maxTotal`/`maxExtras` CARPOOL không đổi.
  - Field mới trên `Booking`/`PriceBreakdown` đều optional.
  - Không field/label nào bằng tiếng Anh trong UI mới (Loại xe, chú thích,
    badge, label giảm giá — soát lại 1 lượt).

- [ ] **Bước 3 — dispatch 1 sub-agent fresh-context, adversarial** review
  diff thật (không phải plan) sau khi code xong — theo quy trình
  `superpowers:requesting-code-review` / CLAUDE.md bước 2c. Áp findings, lặp
  tới khi sạch.

- [ ] **Bước 4 — kiểm tương thích ngược client cũ** (CLAUDE.md bước 4):
  - Field response chỉ THÊM (`seatDiscountPercent/Amount`,
    `effectiveServiceType`, `switchedToWholeCar`) — không xoá/đổi tên field
    cũ nào client (ở đây: các trang admin khác dùng `Booking`/`PriceBreakdown`)
    đang đọc.
  - Request `createAdminBooking`/`estimateTripPrice` chỉ đổi GIÁ TRỊ gửi
    (`requestedVehicleType` không còn luôn `undefined` với CARPOOL) — không
    đổi shape/field request. Backend đã hỗ trợ field này cho CARPOOL theo
    contract → an toàn.
  - `vigo-admin` không phải app khách/tài xế — không cần kiểm `vigo`/`vigo-driver`.

---

## Task 10: Commit

- [ ] `git add` các file đã đổi (liệt kê tường minh theo bảng File Structure
  — KHÔNG dùng `git add -A`/`git add .`).
- [ ] Commit message (ví dụ, sửa theo diff thật):

```
feat(bookings): CARPOOL gửi requestedVehicleType + hiện giảm giá theo ghế/badge switch bao xe

- Form tạo chuyến giờ cho chọn Loại xe khi Đi chung (CARPOOL), gửi kèm
  requestedVehicleType ở cả tính giá và tạo chuyến — trước đây field này bị
  ẩn hoàn toàn cho CARPOOL nên backend không bao giờ tự chuyển Bao xe được.
- Nhóm 4 key CARPOOL_SEAT_DISCOUNT_2..5 vào "Giá & Hoa hồng" trong cấu hình.
- Chi tiết booking hiện thêm dòng giảm giá theo số ghế + badge khi chuyến đã
  tự chuyển từ Đi chung sang Bao xe.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

- [ ] `git status` verify staged == working tree, không sót file.

Sau commit: push nhánh `feat/*`, chờ user duyệt trước khi mở PR
`feat→main` (theo quy trình branching — KHÔNG PR `dev→main`, KHÔNG
cherry-pick, resync `main→dev` sau khi PR merge).

---

## Tự-review đối kháng đã áp dụng vào plan này (trước khi trình user)

### Vòng 1 — tự-review

- **Tìm thấy & sửa:** ban đầu định chỉ đổi 2 dòng ternary payload — review
  chỉ ra UI chọn "Loại xe" hoàn toàn không tồn tại cho CARPOOL nên sửa payload
  không đủ (backend không bao giờ nhận field) → thêm Task 2 (UI) làm phần
  BẮT BUỘC, không phải optional.
- **Tìm thấy & sửa:** ban đầu định để `maxTotal` CARPOOL biến đổi theo
  `vehicleType` giống RIDE — review chỉ ra comment gốc trong code (dòng
  58-60) chốt cap=6 cho CARPOOL bất kể xe, đổi sẽ vừa ngoài phạm vi vừa có
  thể phá trải nghiệm hiện có → giữ nguyên, chỉ ghi nhận hệ quả phụ.
  vehicleType có thể lệch capacity xe thật là hành vi CHỦ Ý (kích hoạt switch),
  không phải bug — ghi rõ trong spec để không bị hiểu nhầm lúc review code.
- **Tìm thấy & sửa:** `PriceBreakdownCard` không export → không test được
  độc lập; thêm `export` (Task 7 bước 3) là đổi tối thiểu, không đổi hành vi,
  thay vì test qua toàn bộ `BookingDetail` (phải mock network, nặng hơn nhiều
  cho cùng mục tiêu).
- **Cân nhắc, giữ nguyên có ghi chú:** không viết test RTL cho badge
  `switchedToWholeCar` (trong `BookingDetail`, không export) — chấp nhận
  rủi ro thấp (1 điều kiện JSX) đổi lấy không phải dựng mock
  `getBookingDetails` cho cả `BookingDetail`; đã ghi rõ trade-off ở Task 8 để
  reviewer/QA biết cần kiểm mắt qua dev server.
- **Cân nhắc, giữ nguyên có ghi chú:** không mở rộng `estimateTripPrice` để
  đọc `switchedToWholeCar`/`breakdown` trong dialog "Tính giá" — ngoài phạm
  vi 3 điểm user đã chốt; nêu ở spec mục "Điểm cần user quyết".

### Vòng 2 — dispatch sub-agent fresh-context, đối kháng (đọc trực tiếp code
thật, không tin snippet trong plan)

Verdict sub-agent: các claim về vị trí/nội dung code (dòng số, hành vi hiện
tại) trong spec+plan đều khớp thật (không hallucinate). Sub-agent chỉ ra 2
finding cụ thể:

1. **[Đã fix]** Task 3 (RTL test cho `create-booking-dialog.tsx`) lái tương
   tác qua Radix `Select` bằng `userEvent`, nhưng `vitest.setup.ts` không có
   polyfill jsdom nào cho Radix (`hasPointerCapture`/`scrollIntoView`/
   `PointerEvent`), và **chưa có test nào trong repo từng lái 1 Radix
   `Select`** — verify lại bằng grep, đúng như sub-agent nói. Nguy cơ thật là
   **crash lúc chạy** (API thiếu trên jsdom), không phải "selector lệch nhẹ"
   như bản đầu ghi. → Đã thêm `beforeAll` polyfill 3 API
   (`hasPointerCapture`, `releasePointerCapture`, `scrollIntoView`) + hướng
   dẫn debug tiếp (`PointerEvent` polyfill, hạ mục tiêu test) nếu vẫn crash,
   scope trong file test này (không sửa `vitest.setup.ts` global).
2. **[Verify, không phải rủi ro thật]** Sub-agent hỏi: gửi
   `requestedVehicleType` cho CARPOOL có an toàn nếu PR admin đi tới prod
   TRƯỚC khi backend seat-discount/switch lên `main`? Đã đọc trực tiếp
   `vigo-backend/src/booking/dto/admin-create-booking.dto.ts:31-33` và
   `agent-create-booking.dto.ts:37-39`: field `requestedVehicleType` **đã có
   sẵn trên DTO** (dùng cho RIDE) với `@ValidateIf(serviceType===RIDE)` —
   decorator này chỉ tắt *validate* khi không phải RIDE, KHÔNG khiến
   `whitelist:true` strip field (field có decorator thì luôn giữ). → Gửi field
   này cho CARPOOL AN TOÀN với backend ở bất kỳ version nào, không cần thêm
   gate rollout. Đã ghi kết quả verify (không phải giả định) vào spec, mục
   "Backward-compat với backend — đã verify".

Không còn finding mới sau vòng 2 → plan hội tụ, sẵn sàng trình user duyệt.
