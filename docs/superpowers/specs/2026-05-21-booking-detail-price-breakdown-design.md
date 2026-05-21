# Booking Detail Price Breakdown — Design Spec

**Date:** 2026-05-21
**Status:** Approved (pending implementation plan)
**Scope:** Admin booking detail dialog — itemized receipt of trip price (customer-facing breakdown + driver/platform split)

## Goal

In the admin booking detail dialog (Bookings → Xem chi tiết), expand the existing "Chi phí" card from showing only `price` + `finalPrice` into a full itemized receipt covering:

- **Customer-side:** base transport price, surcharges, VAT, discounts → final amount paid
- **Driver/platform split:** commission (with VAT), driver gross earnings, PIT, driver net earnings

This serves admin oversight: knowing exactly how a trip price was constructed and how it's distributed between customer payment, platform commission, taxes, and driver earnings.

## Out of scope

- Financial dashboard for HTX / drivers / affiliates (separate feature, separate spec)
- Affiliate trip commission per booking (handled separately)
- COD amount display for delivery (separate concern — delivery info card)
- Print / PDF export of receipt

## Backend changes

**File:** `vigo-backend/src/booking/booking.service.ts`

Update `getAdminBookingDetails(id)` to attach `driverEarnings` via the existing `attachDriverEarnings()` helper:

```ts
async getAdminBookingDetails(id: string) {
  const booking = await this.bookingRepository.findOne({
    where: { id },
    relations: ['customer', 'driver', 'driver.user', 'driver.user.vehicle'],
  });
  if (!booking) return null;

  const enriched = await this.attachDriverEarnings(booking as any);
  const backendUrl = this.configService.get<string>('BACKEND_PUBLIC_URL', 'https://vigo.vn');
  return { ...enriched, shareLink: `${backendUrl}/share/${booking.id}` };
}
```

After this change the admin endpoint returns:

- All existing fields including `priceBreakdown` (JSONB column already populated when booking was created)
- `driverEarnings` (computed on-read, not persisted)
- `finalPriceVAT` (VAT portion already included in `finalPrice`)

`attachDriverEarnings()` ([booking.service.ts:136](/Users/thanhitinn/Development/Projects/vigo-backend/src/booking/booking.service.ts#L136)) is already in use by `reassignDriver` and `adminUpdateStatus`, and `buildDriverEarnings()` ([booking.service.ts:106](/Users/thanhitinn/Development/Projects/vigo-backend/src/booking/booking.service.ts#L106)) is the canonical commission/VAT/PIT calculation. No new math.

## Frontend type updates

**File:** `vigo-admin/src/lib/types.ts`

Extend `Booking` type with optional breakdown fields:

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
};

export type DriverEarnings = {
  grossPrice: number;
  commissionRate: number;          // 0..1, e.g. 0.15
  commissionAmount: number;
  commissionVatRate: number;       // 0..1, e.g. 0.08
  commissionVatAmount: number;
  grossEarnings: number;           // price - commission - commissionVAT
  personalIncomeTaxRate: number;
  personalIncomeTaxAmount: number;
  netEarnings: number;             // grossEarnings - PIT
};

export type Booking = {
  // ...existing fields
  priceBreakdown?: PriceBreakdown | null;
  driverEarnings?: DriverEarnings;
  finalPriceVAT?: number;
  distanceKm?: number;
}
```

All new fields are optional — backend may return `priceBreakdown: null` for legacy bookings, and `driverEarnings` only appears on the admin endpoint (after the backend change).

## UI: receipt layout

**File:** `vigo-admin/src/app/(app)/bookings/components/bookings-table.tsx`

Replace the existing Chi phí card (currently a 2x2 grid showing Giá gốc / Giá cuối / Số ghế / Loại xe) with a vertically itemized receipt inside the same dialog.

### Visual structure

```
┌─ CHI PHÍ ──────────────────────────────────┐
│ Khoảng cách: 12.5 km                       │
│                                            │
│ ─ Tạm tính ─                               │
│ Giá vận chuyển              150,000 đ      │
│ Phụ phí cuối tuần           +20,000 đ      │
│ Phí dịch vụ                 +10,000 đ      │
│ Thuế VAT                    +14,400 đ      │
│ ─────────────────────────────────────      │
│ Giá gốc                     194,400 đ      │
│                                            │
│ ─ Giảm giá ─                               │
│ Khách thân thiết             -5,000 đ      │
│ Mã khuyến mãi               -20,000 đ      │
│ ─────────────────────────────────────      │
│ Khách trả                   169,400 đ ✓    │
│ Phương thức: 💵 Tiền mặt                   │
│                                            │
│ ─ Phân bổ doanh thu ─                      │
│ Hoa hồng nền tảng (15%)     -29,160 đ      │
│ VAT hoa hồng (8%)            -2,333 đ      │
│ Tài xế nhận (gross)         162,907 đ      │
│ Thuế TNCN tài xế (1.5%)      -2,444 đ      │
│ ─────────────────────────────────────      │
│ Tài xế thực nhận            160,463 đ      │
└────────────────────────────────────────────┘
```

### Display rules

- **Hide zero/null line items.** A surcharge or discount of 0 should not produce a row.
- **Subtotals always show.** "Giá gốc" and "Khách trả" render even if no surcharges/discounts.
- **Block "Phân bổ doanh thu" only renders if `driverEarnings` is present** in the API response.
- **Rates displayed as percentages** (e.g., `commissionRate: 0.15` → "15%").
- **Currency format:** reuse existing `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`.
- **Sign convention:** surcharges prefixed `+`, discounts and commission/tax prefixed `-`. Subtotals no sign.
- **Highlight final amount:** "Khách trả" rendered with stronger weight / color, same emphasis as current `finalPrice` row.

### Field relocation

- "Số ghế yêu cầu" (`requestedSeats`) and "Loại xe" (`requestedVehicleType`) — currently in Chi phí card — move to the Tuyến đường card (semantically closer to journey info than to pricing).

## Edge cases & fallbacks

| Case | Behavior |
|---|---|
| `priceBreakdown = null` (legacy bookings) | Hide "Tạm tính" and "Giảm giá" blocks. Show only "Giá gốc" (= `price`) and "Khách trả" (= `finalPrice ?? price`). Matches old UI behavior. |
| `driverEarnings = undefined` | Hide entire "Phân bổ doanh thu" block. |
| `finalPrice == null` or `finalPrice == price` | Still show "Khách trả" row, value = `finalPrice ?? price`. No checkmark needed since no discount applied. |
| Booking status `CANCELLED` | Show breakdown if available (it was computed before cancel). No special label inside Chi phí card — the existing "Lý do hủy" card already conveys cancellation. |
| `distanceKm = null` | Hide the "Khoảng cách" line. |
| All surcharges & discounts = 0 | "Tạm tính" reduces to "Giá vận chuyển" + "Giá gốc". "Giảm giá" block fully hidden. "Khách trả" = `finalPrice`. |

## Testing

**Manual verification** — no automated tests (pure presentation, no novel logic):

1. **Happy path:** open a recent COMPLETED booking. Verify all 3 blocks render. Verify arithmetic: `Σ(transportPrice + surcharges + vatAmount) ≈ price`; `price - loyaltyDiscount - promotionDiscount ≈ finalPrice`; `grossPrice - commissionAmount - commissionVatAmount = grossEarnings`; `grossEarnings - personalIncomeTaxAmount = netEarnings`.
2. **Legacy booking (`priceBreakdown = null`):** fallback to old 2-row layout, no errors.
3. **No discount:** "Giảm giá" block hidden, "Khách trả" still renders.
4. **No driver assigned yet (CREATED/SEARCHING):** `driverEarnings` still attaches — `buildDriverEarnings()` depends only on `price`, not on `driverId`. The "Phân bổ doanh thu" block renders, showing what the driver *would* receive when the trip is taken.
5. **Regression:** all other dialog sections (Khách hàng, Tài xế, Tuyến đường, Ghi chú, Lý do hủy, Timestamps, Share link) unchanged.

**Backend smoke test:** `GET /bookings/admin/{id}` response in DevTools shows `priceBreakdown` (object or null) and `driverEarnings` (object).

## Files touched

| File | Change |
|---|---|
| `vigo-backend/src/booking/booking.service.ts` | Update `getAdminBookingDetails` to call `attachDriverEarnings` |
| `vigo-admin/src/lib/types.ts` | Add `PriceBreakdown`, `DriverEarnings` types; extend `Booking` |
| `vigo-admin/src/app/(app)/bookings/components/bookings-table.tsx` | Replace Chi phí card with receipt layout; move `requestedSeats` / `requestedVehicleType` to Tuyến đường card |

No new files. No new dependencies. No DB migrations (`priceBreakdown` column already exists on the entity).
