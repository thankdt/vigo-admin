# Booking Detail Price Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the admin booking detail dialog's "Chi phí" card into a full itemized receipt covering customer-facing breakdown (transport, surcharges, VAT, discounts) and driver/platform split (commission, VAT, PIT, driver net earnings).

**Architecture:** Backend already stores customer-facing breakdown in `Booking.priceBreakdown` (JSONB) and can compute driver earnings via existing `attachDriverEarnings()` helper. We just (1) wire that helper into the admin endpoint, (2) extend the frontend `Booking` type, and (3) replace the existing 2x2 Chi phí grid with a vertically itemized receipt.

**Tech Stack:** NestJS + TypeORM backend (`vigo-backend`), Next.js + Radix UI + Tailwind frontend (`vigo-admin`). Both projects are sibling directories under `~/Development/Projects/`.

**Spec:** [docs/superpowers/specs/2026-05-21-booking-detail-price-breakdown-design.md](../specs/2026-05-21-booking-detail-price-breakdown-design.md)

---

## File Structure

| File | Change |
|---|---|
| `vigo-backend/src/booking/booking.service.ts` | Modify `getAdminBookingDetails` (line ~1767) to call `attachDriverEarnings` |
| `vigo-admin/src/lib/types.ts` | Add `PriceBreakdown`, `DriverEarnings` types; extend `Booking` |
| `vigo-admin/src/app/(app)/bookings/components/bookings-table.tsx` | Add `PriceBreakdownCard` sub-component (inside same file, matching existing inline-function pattern); replace Chi phí card in `BookingDetail`; relocate `requestedSeats` / `requestedVehicleType` to Tuyến đường card |

No new files. No DB migrations (`priceBreakdown` column already exists). No new dependencies.

---

## Task 1: Backend — attach driverEarnings to admin booking detail endpoint

**Files:**
- Modify: `vigo-backend/src/booking/booking.service.ts:1767-1779`

- [ ] **Step 1: Open the current implementation**

Confirm the current code reads exactly:

```ts
async getAdminBookingDetails(id: string) {
    const booking = await this.bookingRepository.findOne({
      where: { id },
      relations: ['customer', 'driver', 'driver.user', 'driver.user.vehicle'],
    });

    if (booking) {
      const backendUrl = this.configService.get<string>('BACKEND_PUBLIC_URL', 'https://vigo.vn');
      const shareLink = `${backendUrl}/share/${booking.id}`;
      return { ...booking, shareLink };
    }
    return null;
  }
```

The helpers `attachDriverEarnings` (line ~136) and `buildDriverEarnings` (line ~106) already exist in the same file. No new imports needed.

- [ ] **Step 2: Replace with the enriched version**

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

- [ ] **Step 3: Typecheck**

Run from `vigo-backend/`:

```bash
npx tsc --noEmit
```

Expected: zero errors. (If `npx tsc --noEmit` is too slow, run `npm run build` instead — both work.)

- [ ] **Step 4: Manual smoke test against the endpoint**

If the backend dev server is running locally:

```bash
# Replace <BOOKING_ID> with an existing booking id (preferably COMPLETED)
# Replace <ADMIN_TOKEN> with a valid admin JWT
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" \
  http://localhost:3000/bookings/admin/<BOOKING_ID> | jq '.data | {price, finalPrice, priceBreakdown, driverEarnings, finalPriceVAT}'
```

Expected: response includes `priceBreakdown` (object or null) and `driverEarnings` (object with `commissionAmount`, `netEarnings`, etc.).

If backend isn't running locally, skip — the frontend manual test in Task 3 will surface any issue.

- [ ] **Step 5: Commit**

```bash
cd ~/Development/Projects/vigo-backend
git add src/booking/booking.service.ts
git commit -m "feat(booking): attach driverEarnings to admin booking detail endpoint

Admin booking detail receipt UI needs commission + driver earnings
data. Uses existing attachDriverEarnings helper, no new math.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Frontend types — add PriceBreakdown and DriverEarnings

**Files:**
- Modify: `vigo-admin/src/lib/types.ts:126-158`

- [ ] **Step 1: Add the two new types and extend Booking**

Locate the existing `export type Booking = { ... }` block (line 126). Insert the two new types **directly before** the `Booking` type, and add the four new optional fields **at the end of** the `Booking` type (just before the closing `}`):

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
  grossEarnings: number;
  personalIncomeTaxRate: number;
  personalIncomeTaxAmount: number;
  netEarnings: number;
};

export type Booking = {
  id: string;
  customerId: string;
  driverId?: string | null;
  pickupAddress: string | { address: string; lat: number; lng: number };
  dropoffAddress: string | { address: string; lat: number; lng: number } | null;
  price: number;
  finalPrice?: number;
  status: BookingStatus;
  serviceType?: string;
  isPooled?: boolean;
  requestedSeats?: number;
  requestedVehicleType?: string | null;
  paymentMethod?: string;
  cancelReason?: string | null;
  note?: string | null;
  shareLink?: string;
  createdAt: string;
  updatedAt?: string;
  customer: {
    id: string;
    fullName: string;
    phone: string;
    role?: string;
    email?: string | null;
  } | null;
  driver?: {
    id: string;
    fullName?: string;
    name?: string;
    phone: string;
  } | null;
  // Added: pricing breakdown — see admin booking detail receipt
  priceBreakdown?: PriceBreakdown | null;
  driverEarnings?: DriverEarnings;
  finalPriceVAT?: number;
  distanceKm?: number;
}
```

(The `Booking` block above shows the full type with the new fields appended. Use `replace_all: false` Edit on the existing `export type Booking = { ... }` block.)

- [ ] **Step 2: Typecheck**

Run from `vigo-admin/`:

```bash
npm run typecheck
```

Expected: zero errors. Backend numeric fields arrive as `number` after JSON parsing (`buildDriverEarnings` uses `Math.round`); decimal columns from TypeORM may serialize as string, but `Intl.NumberFormat` accepts strings — no coercion needed at the type level.

- [ ] **Step 3: Commit**

```bash
cd ~/Development/Projects/vigo-admin
git add src/lib/types.ts
git commit -m "feat(types): add PriceBreakdown and DriverEarnings to Booking

Booking detail receipt UI needs typed access to customer-side
breakdown and driver/platform split. Fields are optional — legacy
bookings have priceBreakdown=null, driverEarnings only on admin endpoint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Frontend UI — build receipt and replace Chi phí card

**Files:**
- Modify: `vigo-admin/src/app/(app)/bookings/components/bookings-table.tsx` (specifically lines 182-241 in `BookingDetail`)

- [ ] **Step 1: Add a `PriceBreakdownCard` sub-component**

Insert this component **just before** `function BookingDetail` (around line 64, inside the same file — matches the inline-function pattern used by `ReassignDialog`, `getStatusBadge`, etc.):

```tsx
function PriceBreakdownCard({ booking }: { booking: Booking }) {
  const fmtVnd = (v: number | string | null | undefined) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v ?? 0));

  const fmtPct = (rate: number) => `${(rate * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

  const breakdown = booking.priceBreakdown;
  const earnings = booking.driverEarnings;

  // Customer-side surcharge rows — only render if value > 0
  const surcharges: Array<{ label: string; value: number }> = breakdown ? [
    { label: 'Phụ phí kích thước', value: Number(breakdown.sizeSurcharge ?? 0) },
    { label: 'Phụ phí trọng lượng', value: Number(breakdown.weightSurcharge ?? 0) },
    { label: 'Phụ phí cuối tuần', value: Number(breakdown.weekendSurcharge ?? 0) },
    { label: 'Phụ phí ngày lễ', value: Number(breakdown.holidaySurcharge ?? 0) },
    { label: 'Phí dịch vụ', value: Number(breakdown.serviceFee ?? 0) },
    { label: 'Thuế VAT', value: Number(breakdown.vatAmount ?? 0) },
  ].filter(r => r.value > 0) : [];

  const discounts: Array<{ label: string; value: number }> = breakdown ? [
    { label: 'Khách thân thiết', value: Number(breakdown.loyaltyDiscount ?? 0) },
    { label: 'Mã khuyến mãi', value: Number(breakdown.promotionDiscount ?? 0) },
  ].filter(r => r.value > 0) : [];

  const paymentMethodMap: Record<string, string> = {
    CASH: '💵 Tiền mặt',
    WALLET: '💳 Ví điện tử',
  };

  return (
    <Card className="p-3 space-y-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chi phí</div>

      {booking.distanceKm != null && (
        <div className="text-sm text-muted-foreground">
          Khoảng cách: <span className="font-medium text-foreground">{Number(booking.distanceKm).toFixed(1)} km</span>
        </div>
      )}

      {/* Tạm tính */}
      {breakdown ? (
        <div className="space-y-1.5 text-sm">
          <div className="text-xs font-medium text-muted-foreground">Tạm tính</div>
          <div className="flex justify-between">
            <span>Giá vận chuyển</span>
            <span>{fmtVnd(breakdown.transportPrice)}</span>
          </div>
          {surcharges.map(s => (
            <div key={s.label} className="flex justify-between">
              <span>{s.label}</span>
              <span>+{fmtVnd(s.value)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-1.5 font-medium">
            <span>Giá gốc</span>
            <span>{fmtVnd(booking.price)}</span>
          </div>
        </div>
      ) : (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Giá gốc</span>
          <span className="font-medium">{fmtVnd(booking.price)}</span>
        </div>
      )}

      {/* Giảm giá */}
      {discounts.length > 0 && (
        <div className="space-y-1.5 text-sm">
          <div className="text-xs font-medium text-muted-foreground">Giảm giá</div>
          {discounts.map(d => (
            <div key={d.label} className="flex justify-between text-orange-600">
              <span>{d.label}</span>
              <span>-{fmtVnd(d.value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Khách trả */}
      <div className="flex justify-between border-t pt-2 text-sm">
        <span className="font-semibold">Khách trả</span>
        <span className="font-semibold text-green-600">{fmtVnd(booking.finalPrice ?? booking.price)}</span>
      </div>
      {booking.paymentMethod && (
        <div className="text-xs text-muted-foreground -mt-1">
          Phương thức: {paymentMethodMap[booking.paymentMethod] ?? booking.paymentMethod}
        </div>
      )}

      {/* Phân bổ doanh thu */}
      {earnings && (
        <div className="space-y-1.5 text-sm border-t pt-2">
          <div className="text-xs font-medium text-muted-foreground">Phân bổ doanh thu</div>
          <div className="flex justify-between">
            <span>Hoa hồng nền tảng ({fmtPct(earnings.commissionRate)})</span>
            <span className="text-red-600">-{fmtVnd(earnings.commissionAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span>VAT hoa hồng ({fmtPct(earnings.commissionVatRate)})</span>
            <span className="text-red-600">-{fmtVnd(earnings.commissionVatAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tài xế nhận (gross)</span>
            <span>{fmtVnd(earnings.grossEarnings)}</span>
          </div>
          <div className="flex justify-between">
            <span>Thuế TNCN tài xế ({fmtPct(earnings.personalIncomeTaxRate)})</span>
            <span className="text-red-600">-{fmtVnd(earnings.personalIncomeTaxAmount)}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5 font-medium">
            <span>Tài xế thực nhận</span>
            <span>{fmtVnd(earnings.netEarnings)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Replace the existing Chi phí card in `BookingDetail` (lines 215-241)**

Find this block in `BookingDetail`:

```tsx
              {/* Pricing */}
              <Card className="p-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chi phí</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-muted-foreground">Giá gốc</div>
                    <div className="font-semibold">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.price)}</div>
                  </div>
                  {booking.finalPrice != null && booking.finalPrice !== booking.price && (
                    <div>
                      <div className="text-muted-foreground">Giá cuối</div>
                      <div className="font-semibold text-green-600">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.finalPrice)}</div>
                    </div>
                  )}
                  {booking.requestedSeats != null && (
                    <div>
                      <div className="text-muted-foreground">Số ghế yêu cầu</div>
                      <div className="font-semibold">{booking.requestedSeats}</div>
                    </div>
                  )}
                  {booking.requestedVehicleType && (
                    <div>
                      <div className="text-muted-foreground">Loại xe</div>
                      <div className="font-semibold">{booking.requestedVehicleType}</div>
                    </div>
                  )}
                </div>
              </Card>
```

Replace it with:

```tsx
              {/* Pricing */}
              <PriceBreakdownCard booking={booking} />
```

- [ ] **Step 3: Move `requestedSeats` and `requestedVehicleType` into the Tuyến đường card**

Find the Addresses block in `BookingDetail` (around line 182-212). The closing `</Card>` of that block ends the Tuyến đường card. Add a footer section to it **just before the closing `</Card>`**:

```tsx
                {(booking.requestedSeats != null || booking.requestedVehicleType) && (
                  <div className="flex gap-4 border-t pt-2 text-xs text-muted-foreground">
                    {booking.requestedSeats != null && (
                      <div>
                        <span className="font-medium">Số ghế:</span> {booking.requestedSeats}
                      </div>
                    )}
                    {booking.requestedVehicleType && (
                      <div>
                        <span className="font-medium">Loại xe:</span> {booking.requestedVehicleType}
                      </div>
                    )}
                  </div>
                )}
```

Specifically, this goes after the dropoff `<div className="flex gap-3">...</div>` block and inside the same outer `<Card>...</Card>`. The full updated Tuyến đường Card should look like:

```tsx
              {/* Addresses */}
              <Card className="p-3 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tuyến đường</div>
                <div className="space-y-2">
                  {/* ... existing pickup div ... */}
                  {/* ... existing dropoff div ... */}
                </div>
                {(booking.requestedSeats != null || booking.requestedVehicleType) && (
                  <div className="flex gap-4 border-t pt-2 text-xs text-muted-foreground">
                    {booking.requestedSeats != null && (
                      <div>
                        <span className="font-medium">Số ghế:</span> {booking.requestedSeats}
                      </div>
                    )}
                    {booking.requestedVehicleType && (
                      <div>
                        <span className="font-medium">Loại xe:</span> {booking.requestedVehicleType}
                      </div>
                    )}
                  </div>
                )}
              </Card>
```

- [ ] **Step 4: Typecheck and lint**

```bash
cd ~/Development/Projects/vigo-admin
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 5: Run dev server and manually verify in the browser**

```bash
npm run dev
```

Open `http://localhost:9002` (port from `package.json` dev script). Navigate to Bookings page, click "Xem chi tiết" on:

1. **A recent COMPLETED booking with priceBreakdown:** verify all 3 blocks (Tạm tính / Giảm giá / Phân bổ doanh thu) render. Arithmetic spot-check: `Σ surcharges + transportPrice + vatAmount ≈ price`; `price - loyaltyDiscount - promotionDiscount ≈ finalPrice`; `grossPrice - commissionAmount - commissionVatAmount = grossEarnings`; `grossEarnings - personalIncomeTaxAmount = netEarnings`.
2. **A booking with no discount applied:** verify "Giảm giá" block is hidden, "Khách trả" still renders.
3. **A legacy booking with `priceBreakdown = null` (if any exist):** verify fallback — only "Giá gốc" + "Khách trả" + maybe "Phân bổ doanh thu". No JS errors in console.
4. **A booking in SEARCHING/CREATED status:** "Phân bổ doanh thu" should render (computed from `price` alone).
5. **A CANCELLED booking:** breakdown still shows. "Lý do hủy" card renders below (unchanged).
6. **Pointer-events check:** close the dialog, then click around the page. Verify the recent `pointer-events: none` lockout bug doesn't resurface (the existing `onCloseAutoFocus` handler at [bookings-table.tsx:120](src/app/(app)/bookings/components/bookings-table.tsx#L120) already clears it).
7. **Layout regression:** verify Khách hàng, Tài xế, Tuyến đường (now with Số ghế / Loại xe at bottom), Ghi chú, Lý do hủy, Timestamps, Share link sections all render correctly.

If any case fails, fix and re-verify before committing.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/bookings/components/bookings-table.tsx
git commit -m "feat(bookings): itemized receipt in admin booking detail dialog

Replace the 2x2 Chi phí grid with a vertical receipt showing customer
breakdown (transport, surcharges, VAT, discounts) and driver/platform
split (commission, VAT, PIT, net earnings). Move seats/vehicle type to
the Tuyến đường card where they semantically belong.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Final verification before declaring done

- [ ] Backend typechecks pass.
- [ ] Frontend `npm run typecheck` passes.
- [ ] Manual browser checks (Task 3 Step 5) all pass.
- [ ] No console errors in DevTools when opening booking detail.
- [ ] The pointer-events lockout bug fixed earlier on this branch remains fixed (close dialog → can still click).
