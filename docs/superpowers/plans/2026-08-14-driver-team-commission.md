# Kế hoạch: % hoa hồng riêng cho tài xế Đội tài chuyên nghiệp

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép đặt % hoa hồng riêng cho từng tài xế trong Đội tài chuyên nghiệp (mặc định 0% khi vào team), áp cho mọi chuyến mới, không đụng số của chuyến cũ.

**Architecture:** Một service duy nhất (`DriverCommissionService`) phân giải tỉ lệ; tỉ lệ được **chốt snapshot lên booking/đơn đặt hộ tại thời điểm nhận chuyến**; mọi tính toán và báo cáo về sau đọc snapshot đó thay vì tính lại theo config. `computeTripEarnings` nhận **hai** tỉ lệ — mức riêng (`r`) cho phần tính tiền của tài, mức chuẩn (`R`) cho phần chia HTX — nên phần HTX không đổi và VIGO gánh phần ưu đãi.

**Tech Stack:** NestJS + TypeORM + PostgreSQL (vigo-backend), Jest. Next.js 15 App Router + React 19 + shadcn/ui (vigo-admin), Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-14-driver-team-commission-design.md`](../specs/2026-08-14-driver-team-commission-design.md)

## Thư mục làm việc

Cả hai repo dùng thư mục chính, nhánh `feat/driver-commission` (worktree tạm đã gỡ sau khi
session `docs/crm-spec` kết thúc):

- Backend: `/Volumes/exSSD/dev/projects/vigo-backend`
- Admin: `/Volumes/exSSD/dev/projects/vigo-admin`

Task 1–14 ở backend. Task 15–18 ở admin. Task 19 đụng cả hai.

## Global Constraints

- **Bất biến số 1:** khi tài không có mức riêng (`r = R`), **mọi con số phải y hệt hiện tại**. Toàn bộ spec commission hiện có phải PASS **không sửa một con số nào**. Phải sửa một con số = thiết kế sai → DỪNG, báo user, không sửa test cho khớp code.
- Mọi `numeric` từ Postgres về là **chuỗi**. Bắt buộc transformer trên entity; mọi `getRawMany()` phải `Number(...)` tường minh. **Tuyệt đối không dùng `||` để fallback tỉ lệ** — `0` là giá trị hợp lệ nghĩa "miễn phí", `||` biến nó thành "chưa set".
- `htxShareRate` chia cho **`R`** (mức chuẩn), không bao giờ chia cho `r`.
- `vigoVatRemit` dùng **`r`** (mức thực thu) — kế toán chốt.
- Format mô tả dòng sổ `"... Commission (N)"` giữ **nguyên tuyệt đối** (`driver-penalty` parse chuỗi này).
- Không thêm giá trị enum mới nào (app tài xế ném lỗi khi gặp `TransactionType` lạ).
- Timezone: mọi mốc ngày là VN (UTC+7); backend chạy `TZ=UTC`. Chạy test bằng `TZ=UTC npx jest`.
- Commit message kết bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **`git add` phải giới hạn theo đường dẫn của task, KHÔNG dùng `-A` hay `.`.** Cả hai repo
  đang có file untracked không liên quan (`docs/audits/`, `scripts/audit-missing-routes.js`,
  `scripts/inspect-carpool-pricing.ts`, `scripts/tmp-verify-gps-watch.ts`, mấy file
  `docs/superpowers/*.md`) — `-A` sẽ nuốt sạch vào commit đầu tiên. Mỗi bước commit trong
  kế hoạch này đã ghi sẵn đường dẫn đúng; giữ nguyên, đừng nới rộng.

## Cấu trúc file

**Tạo mới (backend):**

| File | Trách nhiệm |
|---|---|
| `src/commission/commission.module.ts` | Module độc lập, export 2 service |
| `src/commission/driver-commission.service.ts` | Phân giải tỉ lệ — dùng được ở luồng tiền |
| `src/commission/driver-commission-display.service.ts` | Bản đồ tỉ lệ cache 10s — CHỈ hiển thị |
| `src/commission/driver-commission.service.spec.ts` | Test resolver |
| `src/commission/no-display-service-in-money-path.spec.ts` | Test tĩnh cấm import chéo |
| `src/booking/trip-earnings.equivalence.spec.ts` | Test tương đương, xoá sau Task 1 |
| `src/database/migrations/1793500000000-AddDriverCommissionRate.ts` | 5 cột + CHECK |

**Sửa (backend):** `src/booking/trip-earnings.util.ts`, `src/booking/booking.service.ts`, `src/booking/entities/booking.entity.ts`, `src/multi-stop-order/multi-stop-lifecycle.service.ts`, `src/multi-stop-order/entities/multi-stop-order.entity.ts`, `src/driver-team/*`, `src/finance/finance.service.ts`, `src/htx/htx.service.ts`, `src/wallet/wallet.service.ts`, `src/drivers/drivers.service.ts`, `src/dispatch/dispatch.processor.ts`, `src/dispatch/schedule-confirm.processor.ts`.

**Sửa (admin):** `src/lib/types.ts`, `src/lib/api.ts`, `src/app/(app)/driver-team/components/driver-team-drawer.tsx`, `src/app/(app)/driver-team/components/driver-team-screen.tsx`, `src/app/(app)/bookings/components/bookings-table.tsx`, `src/app/(app)/finance/components/finance-stat-cards.tsx`, `src/app/(app)/finance/components/finance-drilldown-chart.tsx`, `src/app/(app)/dashboard/page.tsx`.

---

## Task 1: Chứng minh hai hàm tính thu nhập tương đương, rồi xoá bản sao

Trước khi đụng vào công thức, phải xoá bản sao. `BookingService.buildDriverEarnings` (`booking.service.ts:304-407`) là bản chép tay của `computeTripEarnings` (`trip-earnings.util.ts:42-112`). **Task này KHÔNG được đổi bất kỳ phép tính nào** — nếu con số đổi thì sau này không biết do gom hay do sửa.

**Files:**
- Test: `src/booking/trip-earnings.equivalence.spec.ts` (tạo, xoá ở Step 6)
- Modify: `src/booking/booking.service.ts:304-407` (xoá hàm), `:443`, `:461`, `:1542`, `:2885` (đổi call-site)

**Interfaces:**
- Consumes: `computeTripEarnings(booking, rates)` từ `src/booking/trip-earnings.util.ts`
- Produces: `BookingService` không còn `buildDriverEarnings`; mọi call-site gọi `computeTripEarnings`

- [ ] **Step 1: Viết test tương đương**

Tạo `src/booking/trip-earnings.equivalence.spec.ts`:

```ts
import { computeTripEarnings } from './trip-earnings.util';
import { BookingService } from './booking.service';

// Gọi hàm private qua any — test này SỐNG NGẮN, chỉ để chứng minh tương đương
// trước khi xoá bản sao. Xoá cả file ở Step 6.
const legacy = (b: any, R: number, h: number, pit: number, vat: number) =>
  (BookingService.prototype as any).buildDriverEarnings.call(
    { extractFinalPriceVAT: (x: any) => Number(x?.priceBreakdown?.vatAmount ?? 0) || 0,
      extractDiscountAmount: (x: any) => {
        const l = Number(x?.priceBreakdown?.loyaltyDiscount ?? 0);
        const p = Number(x?.priceBreakdown?.promotionDiscount ?? 0);
        const t = (Number.isFinite(l) ? l : 0) + (Number.isFinite(p) ? p : 0);
        return t > 0 ? t : 0;
      } },
    b, R, h, pit, vat,
  );

const CASES: Array<[string, any, number, number]> = [
  ['thường', { price: 1_000_000, finalPrice: 1_080_000, priceBreakdown: { vatAmount: 80_000 } }, 0.2, 0.05],
  ['KM lớn hơn hoa hồng', { price: 1_250_000, finalPrice: 1_080_000, priceBreakdown: { vatAmount: 80_000, promotionDiscount: 250_000 } }, 0.2, 0.05],
  ['finalPrice = 0 (dòng cũ)', { price: 500_000, finalPrice: 0, priceBreakdown: { loyaltyDiscount: 50_000 } }, 0.15, 0.05],
  ['price = 0', { price: 0, finalPrice: 0, priceBreakdown: {} }, 0.2, 0.05],
  ['h = 0', { price: 1_000_000, finalPrice: 1_080_000, priceBreakdown: { vatAmount: 80_000 } }, 0.2, 0],
  ['h > R', { price: 1_000_000, finalPrice: 1_080_000, priceBreakdown: { vatAmount: 80_000 } }, 0.2, 0.25],
  ['R = 0', { price: 1_000_000, finalPrice: 1_080_000, priceBreakdown: { vatAmount: 80_000 } }, 0, 0.05],
];

describe('buildDriverEarnings ≡ computeTripEarnings', () => {
  it.each(CASES)('%s', (_name, booking, R, h) => {
    const a = legacy(booking, R, h, 0.015, 0.08);
    const b = computeTripEarnings(booking, {
      bookingCommissionRate: R, htxCommissionRate: h, pitRate: 0.015, vatRate: 0.08,
    });
    expect(a).toEqual(b);
  });

  it('khớp trên 500 input ngẫu nhiên', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 500; i++) {
      const price = Math.round(rnd() * 5_000_000);
      const vatAmount = Math.round(price * 0.08);
      const booking = {
        price,
        finalPrice: rnd() > 0.2 ? price + vatAmount : 0,
        priceBreakdown: { vatAmount, promotionDiscount: Math.round(rnd() * price * 0.4) },
      };
      const R = Math.round(rnd() * 40) / 100;
      const h = Math.round(rnd() * 30) / 100;
      expect(legacy(booking, R, h, 0.015, 0.08)).toEqual(
        computeTripEarnings(booking, { bookingCommissionRate: R, htxCommissionRate: h, pitRate: 0.015, vatRate: 0.08 }),
      );
    }
  });
});
```

- [ ] **Step 2: Chạy test — phải PASS ngay**

Run: `cd /Volumes/exSSD/dev/projects/vigo-backend-driver-commission && TZ=UTC npx jest src/booking/trip-earnings.equivalence.spec.ts`
Expected: **PASS**. Nếu FAIL thì hai hàm KHÔNG tương đương → dừng, báo user, đừng xoá gì cả.

- [ ] **Step 3: Xoá bản sao, trỏ call-site sang util**

Trong `src/booking/booking.service.ts`:
- Xoá hàm `private buildDriverEarnings(...)` (dòng ~304–407) và hằng `DRIVER_DISCOUNT_BONUS_RATIO` nếu chỉ nó dùng.
- Thêm import: `import { computeTripEarnings } from './trip-earnings.util';`
- Đổi 4 call-site — `:443`, `:461`, `:1542`, `:2885` — từ
  `this.buildDriverEarnings(b, bookingRate, htxRate, pitRate, vatRate)` thành
  `computeTripEarnings(b, { bookingCommissionRate: bookingRate, htxCommissionRate: htxRate, pitRate, vatRate })`
- Đổi kiểu trả về ở `:434` và `:448` từ `ReturnType<BookingService['buildDriverEarnings']>` thành `ReturnType<typeof computeTripEarnings>`.

- [ ] **Step 4: Chạy TOÀN BỘ test backend**

Run: `TZ=UTC npx jest 2>&1 | tail -30`
Expected: PASS toàn bộ. `booking.service.spec.ts` vẫn `EXPECTED_COMMISSION = 18400`, **không sửa số nào**.

- [ ] **Step 5: Kiểm tĩnh**

Run: `npx tsc --noEmit`
Expected: không lỗi.

- [ ] **Step 6: Xoá test tương đương và commit**

```bash
cd /Volumes/exSSD/dev/projects/vigo-backend-driver-commission
rm src/booking/trip-earnings.equivalence.spec.ts
git add src/booking/
git commit -m "refactor(booking): xoá bản sao buildDriverEarnings, dùng computeTripEarnings

Hai hàm đã được chứng minh tương đương bằng test (7 ca biên + 500 input
ngẫu nhiên) TRƯỚC khi xoá. Không đổi một phép tính nào — toàn bộ test cũ
xanh không sửa số.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `computeTripEarnings` nhận hai tỉ lệ

**Files:**
- Modify: `src/booking/trip-earnings.util.ts`
- Test: `src/booking/trip-earnings.util.spec.ts` (tạo)

**Interfaces:**
- Produces: `TripEarningsRates` thêm `driverCommissionRate?: number`; kết quả thêm `standardCommissionRate`, `standardCommission`, `forgoneCommission`

- [ ] **Step 1: Viết test — bất biến "không có mức riêng thì không đổi gì"**

Tạo `src/booking/trip-earnings.util.spec.ts`:

```ts
import { computeTripEarnings } from './trip-earnings.util';

const TRIP = { price: 1_000_000, finalPrice: 1_080_000, priceBreakdown: { vatAmount: 80_000 } };
const BASE = { bookingCommissionRate: 0.2, htxCommissionRate: 0.05, pitRate: 0.015, vatRate: 0.08 };

describe('computeTripEarnings — mức riêng', () => {
  it('không truyền driverCommissionRate ⇒ y hệt hành vi cũ', () => {
    const a = computeTripEarnings(TRIP, BASE);
    const b = computeTripEarnings(TRIP, { ...BASE, driverCommissionRate: 0.2 });
    expect(a).toEqual(b);
    expect(a.commissionAmount).toBe(200_000);
    expect(a.htxCommission).toBe(50_000);
    expect(a.vigoCommission).toBe(150_000);
    expect(a.vigoVatRemit).toBe(16_000);
    expect(a.htxVatRemit).toBe(64_000);
    expect(a.personalIncomeTaxAmount).toBe(12_000);
    expect(a.tripCashKept).toBe(788_000);
    expect(a.forgoneCommission).toBe(0);
  });

  it('tài 0% + HTX 5% ⇒ HTX ăn ĐỦ, VIGO âm, VAT full về HTX', () => {
    const e = computeTripEarnings(TRIP, { ...BASE, driverCommissionRate: 0 });
    expect(e.commissionAmount).toBe(0);
    expect(e.standardCommission).toBe(200_000);
    expect(e.forgoneCommission).toBe(200_000);
    expect(e.htxCommission).toBe(50_000);      // KHÔNG đổi
    expect(e.vigoCommission).toBe(-50_000);    // VIGO chịu lỗ
    expect(e.vigoVatRemit).toBe(0);            // kế toán chốt
    expect(e.htxVatRemit).toBe(80_000);
    expect(e.personalIncomeTaxAmount).toBe(15_000);
    expect(e.tripCashKept).toBe(985_000);
  });

  it('tài 0% KHÔNG có HTX ⇒ không ai âm', () => {
    const e = computeTripEarnings(TRIP, { ...BASE, htxCommissionRate: 0, driverCommissionRate: 0 });
    expect(e.htxCommission).toBe(0);
    expect(e.vigoCommission).toBe(0);
  });

  it('tài 10% ⇒ HTX không đổi, VIGO giảm đúng phần ưu đãi', () => {
    const full = computeTripEarnings(TRIP, BASE);
    const e = computeTripEarnings(TRIP, { ...BASE, driverCommissionRate: 0.1 });
    expect(e.htxCommission).toBe(full.htxCommission);
    expect(e.vigoCommission).toBe(full.vigoCommission - e.forgoneCommission);
    expect(e.vigoVatRemit).toBe(8_000);
  });

  it('htxShareRate chia cho mức CHUẨN, không phải mức riêng', () => {
    const e = computeTripEarnings(TRIP, { ...BASE, driverCommissionRate: 0 });
    expect(e.htxShareRate).toBeCloseTo(0.25, 6);   // 0.05/0.2, KHÔNG phải 0.05/0
    expect(Number.isFinite(e.htxShareRate)).toBe(true);
  });

  it('mức riêng CAO HƠN mức chuẩn (0.5 > 0.2) ⇒ forgone âm, tài xế bị thu nhiều hơn', () => {
    // CHECK cho phép 0..1 nên super admin đặt 0.5 là hợp lệ. Chiều này gây thiệt cho
    // TÀI XẾ, ngược với chiều ưu đãi — công thức phải nhất quán ở cả hai chiều.
    const e = computeTripEarnings(TRIP, { ...BASE, driverCommissionRate: 0.5 });
    expect(e.commissionAmount).toBe(500_000);
    expect(e.forgoneCommission).toBe(-300_000);
    expect(e.htxCommission).toBe(50_000);            // vẫn KHÔNG đổi
    expect(e.vigoCommission).toBe(450_000);          // 150.000 − (−300.000)
    expect(e.vigoVatRemit).toBe(40_000);
    expect(e.tripCashKept).toBeGreaterThanOrEqual(0);
  });

  it('tài 0% + khuyến mãi lớn ⇒ chỉ vigoCommission được âm', () => {
    const trip = { price: 1_250_000, finalPrice: 1_080_000,
                   priceBreakdown: { vatAmount: 80_000, promotionDiscount: 250_000 } };
    const e = computeTripEarnings(trip, { ...BASE, driverCommissionRate: 0 });
    for (const k of ['commissionAmount', 'htxCommission', 'taxableEarnings', 'tripCashKept',
                     'personalIncomeTaxAmount', 'htxVatRemit', 'vigoVatRemit', 'htxTotalReceived'] as const) {
      expect(e[k]).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Chạy — phải FAIL**

Run: `TZ=UTC npx jest src/booking/trip-earnings.util.spec.ts`
Expected: FAIL — `forgoneCommission` undefined, `driverCommissionRate` chưa có tác dụng.

- [ ] **Step 3: Sửa `trip-earnings.util.ts`**

```ts
export type TripEarningsRates = {
  /** = R, mức CHUẨN theo config. Dùng cho: standardCommission, htxShareRate. */
  bookingCommissionRate: number;
  /**
   * = r, mức riêng của tài xế. Mặc định = bookingCommissionRate.
   * Dùng cho: commissionAmount, vigoVatRemit, taxableEarnings, tripCashKept.
   * KHÔNG bao giờ dùng làm mẫu số của htxShareRate — r = 0 sẽ cho Infinity,
   * bị clamp về 1, và HTX ăn trọn phần vốn đã bằng 0.
   */
  driverCommissionRate?: number;
  htxCommissionRate: number;
  pitRate: number;
  vatRate: number;
};
```

Trong thân hàm, thay khối tính hoa hồng:

```ts
  const R = bookingCommissionRate;
  const r = rates.driverCommissionRate ?? R;

  const htxShareRate = R > 0 ? Math.min(1, Math.max(0, htxCommissionRate / R)) : 0;
  const vigoShareRate = 1 - htxShareRate;

  const commissionAmount = Math.round(priceAfterDiscount * r);
  const standardCommission = Math.round(priceAfterDiscount * R);
  const forgoneCommission = standardCommission - commissionAmount;

  // Phần nền tảng theo mức CHUẨN — cơ sở chia cho HTX. HTX ăn đủ như cũ (Q4).
  const platformIncomeStd = Math.max(0, standardCommission - discountAmount);
  const htxCommission = Math.round(platformIncomeStd * htxShareRate);

  // Giữ NGHĨA CŨ: phần nền tảng THỰC THU sau khuyến mãi. Trường này được ghi vào
  // earningsBreakdown và client đang đọc — đổi nghĩa là đổi ngầm hợp đồng.
  const platformIncomeAfterKm = Math.max(0, commissionAmount - discountAmount);

  // VIGO gánh trọn phần ưu đãi ⇒ có thể ÂM. Viết dưới dạng "legacy − forgone" để
  // khi r = R thì forgone = 0 và biểu thức thu về đúng công thức cũ, kể cả nhánh max(0,…).
  const vigoCommission = (platformIncomeStd - htxCommission) - forgoneCommission;
```

Phần thuế:

```ts
  const taxableEarnings = Math.max(0, priceAfterDiscount - platformIncomeAfterKm);
  const personalIncomeTaxAmount = Math.round(taxableEarnings * pitRate);
  const tripCashKept = Math.max(0, priceAfterDiscount - commissionAmount - personalIncomeTaxAmount);

  // VAT chia theo doanh thu THỰC THU (kế toán chốt 2026-08-14): VIGO chỉ kê VAT
  // trên phần hoa hồng thực thu. Tài 0% ⇒ VIGO kê 0, HTX kê hộ toàn bộ.
  const vigoVatRemit = Math.round(vatAmount * r);
  const htxVatRemit = vatAmount - vigoVatRemit;
```

Thêm vào object trả về: `standardCommissionRate: R`, `standardCommission`, `forgoneCommission`. Giữ `commissionRate: r` (alias cũ — app tài xế đọc, phải là mức tài thực chịu).

- [ ] **Step 4: Chạy test mới + toàn bộ test cũ**

Run: `TZ=UTC npx jest src/booking/trip-earnings.util.spec.ts && TZ=UTC npx jest 2>&1 | tail -30`
Expected: tất cả PASS, **không sửa số nào trong test cũ**.

- [ ] **Step 5: Commit**

```bash
git add src/booking/trip-earnings.util.ts src/booking/trip-earnings.util.spec.ts && git commit -m "feat(earnings): computeTripEarnings nhận mức hoa hồng riêng theo tài

Hai tỉ lệ tách bạch: bookingCommissionRate (chuẩn) chia phần HTX,
driverCommissionRate (riêng) tính tiền tài xế + VAT thực thu. Mặc định
bằng nhau nên mọi call-site cũ không đổi hành vi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Migration 5 cột + entity + chặn rò rỉ ra response

**Files:**
- Create: `src/database/migrations/1793500000000-AddDriverCommissionRate.ts`
- Modify: `src/driver-team/entities/driver-team-member.entity.ts`, `src/booking/entities/booking.entity.ts`, `src/multi-stop-order/entities/multi-stop-order.entity.ts`
- Test: `src/database/migrations/__tests__/driver-commission-migration.spec.ts`

**Interfaces:**
- Produces: `DriverTeamMember.commissionRate: number | null`; `Booking.driverCommissionRate / standardCommissionRate: number | null`; `MultiStopOrder` tương tự

- [ ] **Step 1: Viết migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverCommissionRate1793500000000 implements MigrationInterface {
  name = 'AddDriverCommissionRate1793500000000';

  public async up(q: QueryRunner): Promise<void> {
    // `booking` là bảng nóng nhất hệ thống. ADD COLUMN NULL không DEFAULT trên PG 11+
    // là metadata-only (không rewrite), NHƯNG vẫn cần ACCESS EXCLUSIVE: một query dài
    // đang chạy (dashboard tài chính quét 365 ngày, finance.service.ts:291 getMany()
    // không phân trang) sẽ khiến ALTER xếp hàng, và MỌI đọc/ghi booking xếp hàng sau
    // nó → app tài xế đứng hình. lock_timeout cho migration fail nhanh và retry được.
    await q.query(`SET LOCAL lock_timeout = '5s'`);

    await q.query(`ALTER TABLE "driver_team_member" ADD COLUMN "commissionRate" numeric(5,4)`);
    await q.query(`
      ALTER TABLE "driver_team_member" ADD CONSTRAINT "chk_dtm_commission_rate"
      CHECK ("commissionRate" IS NULL OR ("commissionRate" >= 0 AND "commissionRate" <= 1))
    `);

    // GỘP 2 cột cùng bảng vào MỘT câu ALTER — lấy ACCESS EXCLUSIVE một lần thay vì hai.
    await q.query(`ALTER TABLE "booking"
      ADD COLUMN "driverCommissionRate" numeric(5,4),
      ADD COLUMN "standardCommissionRate" numeric(5,4)`);
    await q.query(`ALTER TABLE "multi_stop_order"
      ADD COLUMN "driverCommissionRate" numeric(5,4),
      ADD COLUMN "standardCommissionRate" numeric(5,4)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "multi_stop_order" DROP COLUMN "standardCommissionRate"`);
    await q.query(`ALTER TABLE "multi_stop_order" DROP COLUMN "driverCommissionRate"`);
    await q.query(`ALTER TABLE "booking" DROP COLUMN "standardCommissionRate"`);
    await q.query(`ALTER TABLE "booking" DROP COLUMN "driverCommissionRate"`);
    await q.query(`ALTER TABLE "driver_team_member" DROP CONSTRAINT "chk_dtm_commission_rate"`);
    await q.query(`ALTER TABLE "driver_team_member" DROP COLUMN "commissionRate"`);
  }
}
```

**KHÔNG** đặt file spec cạnh migration — `typeorm-cli.config.ts` glob `src/database/migrations/*.ts` sẽ nạp nó và `describe is not defined` làm chết cả đợt migration (đã xảy ra 2026-08-10). Test đi vào `__tests__/`.

- [ ] **Step 2: Thêm cột vào 3 entity, kèm transformer**

Vào cả 3 file, dùng đúng mẫu `transport-company.entity.ts:45-51`:

```ts
  /**
   * Mức hoa hồng riêng, 0..1. NULL = chưa set → dùng mức chung.
   * `0` là giá trị HỢP LỆ nghĩa "miễn hoa hồng" — không được `||` fallback.
   * transformer bắt buộc: pg trả numeric dạng CHUỖI, thiếu nó thì '0.0000'
   * trượt qua Number.isFinite và tài team im lặng bị trừ đủ mức chung.
   */
  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true,
    transformer: { to: (v) => v, from: (v) => (v == null ? null : Number(v)) } })
  commissionRate: number | null;
```

Với `Booking` và `MultiStopOrder` là `driverCommissionRate` và `standardCommissionRate`.

⛔ **KHÔNG dùng `@Column({ select: false })`.** Nó trông gọn nhưng đổi một vấn đề nhỏ lấy
một lỗi tiền im lặng: `complete()` đọc `lockedBooking` để dựng `earningsBreakdown` — cột
không được select thì `undefined`, `ratesForBooking` rơi về config, và **số chốt sổ ghi sai
mức, không lỗi, không log**.

- [ ] **Step 3: Gỡ 2 cột mới khỏi response khách hàng**

Mức độ: **vệ sinh dữ liệu, không phải rò rỉ giữa các bên.** Snapshot chỉ ghi lúc NHẬN chuyến
nên ở `buildOfferPayload` (chuyến chưa có tài) và `:854` (`createBooking`) giá trị **luôn
`NULL`**; ở `attachDriverEarnings*` và chi tiết chuyến thì tài xế chỉ thấy mức **của chính
mình**. Không có đường nào để tài A đọc mức của tài B.

Đã bỏ cơ chế tự động (`select: false`) nên **danh sách gỡ tay phải ĐỦ**. Đừng dò theo dấu
`...booking` — hai điểm cuối bảng dưới trả **thẳng entity**, không spread, nên dò kiểu đó
sẽ không thấy chúng.

| Điểm | Ai nhận | Trạng thái chuyến | Giá trị |
|---|---|---|---|
| `buildOfferPayload` `dispatch.processor.ts:158-160` | nhiều tài xế | chưa có tài | `NULL` |
| `booking.service.ts:854` `{ ...booking, shareLink }` (`createBooking`) | khách | vừa tạo | `NULL` |
| `attachDriverEarnings` / `…List` | chính tài xế đó, hoặc admin | mọi | mức của chính mình |
| **`getOne` `:2880` `{ ...booking, … }`** | **khách** | **mọi** | **non-null** |
| **`getCurrentBooking` `:3077` `return bookings`** | **khách** | **ACCEPTED…PICKED_UP** | **non-null** |
| **`getHistory` `:1471` `Object.assign(b, { pointsEarned })`** | **khách** | **COMPLETED** | **non-null** |

Ba dòng in đậm là **khách đọc được mức hoa hồng VIGO thu của tài xế chở mình** — rò rỉ
thương mại thật. Chính `getOne` đã có tiền lệ đúng loại này: chú thích ở `:2892-2895` kể lại
bug leak `driverEarnings` ngày 2026-06-10.

Thêm helper vào `src/booking/booking.service.ts` và dùng ở **cả 6** điểm trên:

```ts
/**
 * Gỡ tỉ lệ hoa hồng khỏi payload gửi client. Mức riêng là dữ liệu đàm phán nội bộ
 * của Đội tài chuyên nghiệp (quyền `driver-team`) — app tài xế và mọi client khác
 * KHÔNG được đọc. Số tiền thì vẫn trả bình thường qua driverEarnings.
 */
export function stripCommissionRates<T extends object>(b: T): T {
  const { driverCommissionRate, standardCommissionRate, ...rest } = b as any;
  return rest as T;
}
```

- [ ] **Step 4: Viết test migration**

Tạo `src/database/migrations/__tests__/driver-commission-migration.spec.ts`:

```ts
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIR = join(__dirname, '..');

describe('migration AddDriverCommissionRate', () => {
  const src = readFileSync(join(DIR, '1793500000000-AddDriverCommissionRate.ts'), 'utf8');

  it('có lock_timeout — booking là bảng nóng', () => {
    expect(src).toContain(`SET LOCAL lock_timeout`);
  });

  it('KHÔNG đặt DEFAULT (sẽ rewrite bảng booking)', () => {
    expect(src).not.toMatch(/ADD COLUMN[^;]*DEFAULT/i);
  });

  it('KHÔNG override transaction mode — CLI chạy mode "all", override sẽ ném ForbiddenTransactionModeOverrideError cho CẢ đợt', () => {
    expect(src).not.toMatch(/transaction\s*=/);
  });

  it('down() đảo đủ 6 thay đổi', () => {
    const down = src.slice(src.indexOf('public async down'));
    for (const c of ['chk_dtm_commission_rate', 'commissionRate',
                     'driverCommissionRate', 'standardCommissionRate']) {
      expect(down).toContain(c);
    }
  });

  it('không có file .spec.ts nào nằm cạnh migration (glob CLI sẽ nạp và chết)', () => {
    expect(readdirSync(DIR).filter((f) => f.endsWith('.spec.ts'))).toEqual([]);
  });
});
```

- [ ] **Step 5: Chạy test + kiểm tĩnh**

Run: `TZ=UTC npx jest src/database/migrations/__tests__ && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/database/migrations/ src/driver-team/entities/ src/booking/entities/ src/multi-stop-order/entities/ src/booking/booking.service.ts && git commit -m "feat(db): thêm cột mức hoa hồng riêng + snapshot trên booking/đơn đặt hộ

5 cột NULL-able, transformer numeric->number trên cả 3 entity, CHECK 0..1
trên driver_team_member (bảng đang 0 dòng nên an toàn). lock_timeout 5s vì
booking là bảng nóng. Gỡ 2 cột tỉ lệ khỏi mọi response trả client.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `CommissionModule` — nguồn phân giải tỉ lệ duy nhất

**Files:**
- Create: `src/commission/commission.module.ts`, `driver-commission.service.ts`, `driver-commission-display.service.ts`, `driver-commission.service.spec.ts`, `no-display-service-in-money-path.spec.ts`

**Interfaces:**
- Produces:
  - `DriverCommissionService.standardRate(isVinow: boolean): Promise<number>`
  - `DriverCommissionService.effectiveRate(driverId: string | null, isVinow: boolean, manager?: EntityManager): Promise<{ rate: number; standardRate: number; isCustom: boolean }>`
  - `DriverCommissionDisplayService.customRateMapByUserIdForDisplayOnly(): Promise<Map<string, number>>`
  - `DriverCommissionDisplayService.invalidate(): void`

- [ ] **Step 1: Viết test resolver**

Tạo `src/commission/driver-commission.service.spec.ts`:

```ts
import { DriverCommissionService } from './driver-commission.service';

const makeSvc = (cfg: Record<string, string>, rows: any[]) =>
  new DriverCommissionService(
    { getSystemConfig: async (k: string) => cfg[k] } as any,
    { query: async () => rows } as any,
  );

describe('DriverCommissionService.effectiveRate', () => {
  const CFG = { BOOKING_COMMISSION_RATE: '0.2', VINOW_COMMISSION_RATE: '0.15' };

  it('không có dòng team ⇒ mức chung', async () => {
    const r = await makeSvc(CFG, []).effectiveRate('d1', false);
    expect(r).toEqual({ rate: 0.2, standardRate: 0.2, isCustom: false });
  });

  it('Vi-now dùng mức Vi-now khi không có mức riêng', async () => {
    const r = await makeSvc(CFG, []).effectiveRate('d1', true);
    expect(r.rate).toBe(0.15);
    expect(r.standardRate).toBe(0.15);
  });

  it('mức riêng 0 (CHUỖI từ pg) ⇒ 0, KHÔNG rơi về mức chung', async () => {
    const r = await makeSvc(CFG, [{ commissionRate: '0.0000' }]).effectiveRate('d1', false);
    expect(r.rate).toBe(0);
    expect(r.isCustom).toBe(true);
    expect(r.standardRate).toBe(0.2);
  });

  it('mức riêng đè cả Vi-now (Q2: mọi chuyến)', async () => {
    const r = await makeSvc(CFG, [{ commissionRate: '0.0000' }]).effectiveRate('d1', true);
    expect(r.rate).toBe(0);
    expect(r.standardRate).toBe(0.15);
  });

  it('driverId null ⇒ mức chung, không truy vấn', async () => {
    const r = await makeSvc(CFG, [{ commissionRate: '0.0000' }]).effectiveRate(null, false);
    expect(r.isCustom).toBe(false);
  });

  it('giá trị rác trong DB ⇒ kẹp về mức chung, không NaN', async () => {
    const r = await makeSvc(CFG, [{ commissionRate: 'abc' }]).effectiveRate('d1', false);
    expect(r.rate).toBe(0.2);
    expect(r.isCustom).toBe(false);
  });

  it('mức riêng > 1 ⇒ kẹp về 1', async () => {
    const r = await makeSvc(CFG, [{ commissionRate: '5' }]).effectiveRate('d1', false);
    expect(r.rate).toBe(1);
  });
});
```

- [ ] **Step 2: Chạy — FAIL (chưa có file)**

Run: `TZ=UTC npx jest src/commission`
Expected: FAIL "Cannot find module".

- [ ] **Step 3: Viết `driver-commission.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { MasterDataService } from '../master-data/master-data.service';

const DEFAULT_RATE = 0.2;

/**
 * Nguồn DUY NHẤT phân giải tỉ lệ hoa hồng của một chuyến.
 *
 * Trước module này, logic đọc tỉ lệ bị chép ra 9 nơi (booking, wallet, drivers,
 * finance, htx ×2, 2 dispatch processor, multi-stop) — thêm mức riêng theo tài mà
 * bỏ sót một chỗ là tài team vẫn bị trừ đủ mức chung ở luồng đó.
 *
 * Module cố ý KHÔNG import DriverTeamModule (kéo theo controller + guard admin) —
 * đọc driver_team_member bằng SQL thô để 9 module khác import vào mà không tạo
 * vòng phụ thuộc.
 */
@Injectable()
export class DriverCommissionService {
  constructor(
    private readonly masterData: MasterDataService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private parseRate(raw: unknown, fallback: number): number {
    const n = Number(raw);
    if (raw === null || raw === undefined || raw === '' || !Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  }

  /** Mức chuẩn theo config — KHÔNG phụ thuộc tài xế. */
  async standardRate(isVinow: boolean): Promise<number> {
    if (isVinow) {
      const raw = await this.masterData.getSystemConfig('VINOW_COMMISSION_RATE');
      const n = Number(raw);
      if (raw && Number.isFinite(n) && n >= 0 && n <= 1) return n;
    }
    return this.parseRate(
      await this.masterData.getSystemConfig('BOOKING_COMMISSION_RATE'),
      DEFAULT_RATE,
    );
  }

  /**
   * Mức áp dụng cho một tài xế cụ thể. ĐỌC TƯƠI từ DB — dùng ở luồng trừ tiền.
   * Truyền `manager` để chạy trong transaction của caller.
   *
   * Điều kiện `stage = 'JOINED'` nằm TRONG câu truy vấn: tài rời team là mức riêng
   * mất hiệu lực ngay (Q6), không phụ thuộc caller nhớ kiểm tra.
   */
  async effectiveRate(
    driverId: string | null | undefined,
    isVinow: boolean,
    manager?: EntityManager,
  ): Promise<{ rate: number; standardRate: number; isCustom: boolean }> {
    const standard = await this.standardRate(isVinow);
    if (!driverId) return { rate: standard, standardRate: standard, isCustom: false };

    const runner = manager ?? this.dataSource;
    const rows = await runner.query(
      `SELECT m."commissionRate" FROM "driver_team_member" m
        WHERE m."driverId" = $1 AND m.stage = 'JOINED' AND m."commissionRate" IS NOT NULL
        LIMIT 1`,
      [driverId],
    );

    const raw = rows?.[0]?.commissionRate;
    if (raw === undefined || raw === null) {
      return { rate: standard, standardRate: standard, isCustom: false };
    }
    // pg trả numeric dạng CHUỖI. Number() tường minh, KHÔNG `||` (0 là hợp lệ).
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return { rate: standard, standardRate: standard, isCustom: false };
    }
    return { rate: Math.min(1, Math.max(0, n)), standardRate: standard, isCustom: true };
  }
}
```

- [ ] **Step 4: Viết `driver-commission-display.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const TTL_MS = 10_000;

/**
 * Bản đồ userId → mức riêng, cache trong bộ nhớ.
 *
 * ⚠️ CHỈ dùng cho HIỂN THỊ / ƯỚC LƯỢNG (payload mời chuyến). TUYỆT ĐỐI không dùng ở
 * luồng trừ tiền — dùng DriverCommissionService.effectiveRate() đọc tươi.
 * Có test tĩnh cấm import class này vào booking.service / multi-stop-lifecycle.
 *
 * Dispatch chạy ở process riêng và nhiều ECS task ⇒ mỗi task một Map ⇒ trong ≤10s
 * hai tài có thể thấy hai số ước lượng khác nhau. Đây là hành vi MONG ĐỢI.
 */
@Injectable()
export class DriverCommissionDisplayService {
  private cache: Map<string, number> | null = null;
  private loadedAt = 0;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Gọi ngay sau khi PATCH mức riêng hoặc đổi stage, để CEO sửa xong thấy số mới. */
  invalidate(): void {
    this.cache = null;
    this.loadedAt = 0;
  }

  async customRateMapByUserIdForDisplayOnly(): Promise<Map<string, number>> {
    const now = Date.now();
    if (this.cache && now - this.loadedAt < TTL_MS) return this.cache;

    // Bảng driver_team_member rất nhỏ (đội tài do CEO chăm, vài chục dòng) nên
    // nạp trọn là rẻ hơn nhiều so với truy vấn theo từng lượt dispatch.
    const rows = await this.dataSource.query(
      `SELECT d."userId" AS "userId", m."commissionRate" AS "rate"
         FROM "driver_team_member" m
         JOIN "driver" d ON d.id = m."driverId"
        WHERE m.stage = 'JOINED' AND m."commissionRate" IS NOT NULL`,
    );

    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const n = Number(row.rate);
      if (row.userId && Number.isFinite(n)) map.set(row.userId, Math.min(1, Math.max(0, n)));
    }
    this.cache = map;
    this.loadedAt = now;
    return map;
  }
}
```

- [ ] **Step 5: Viết `commission.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { MasterDataModule } from '../master-data/master-data.module';
import { DriverCommissionService } from './driver-commission.service';
import { DriverCommissionDisplayService } from './driver-commission-display.service';

@Global()
@Module({
  imports: [MasterDataModule],
  providers: [DriverCommissionService, DriverCommissionDisplayService],
  exports: [DriverCommissionService, DriverCommissionDisplayService],
})
export class CommissionModule {}
```

Đăng ký `CommissionModule` trong `src/app.module.ts`.

- [ ] **Step 6: Viết test tĩnh cấm dùng cache ở luồng tiền**

Tạo `src/commission/no-display-service-in-money-path.spec.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

// Luồng TRỪ TIỀN THẬT phải đọc tỉ lệ tươi từ DB. Dùng bản đồ cache 10s ở đây
// nghĩa là có cửa sổ 10 giây trừ sai tiền của tài xế, và trên nhiều ECS task thì
// hai tài cùng lúc bị trừ hai mức khác nhau. Test này là rào chắn.
const MONEY_PATHS = [
  'booking/booking.service.ts',
  'multi-stop-order/multi-stop-lifecycle.service.ts',
];

describe('cache mức hoa hồng không được rò vào luồng trừ tiền', () => {
  it.each(MONEY_PATHS)('%s không import DriverCommissionDisplayService', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    expect(src).not.toContain('DriverCommissionDisplayService');
    expect(src).not.toContain('ForDisplayOnly');
  });
});
```

- [ ] **Step 7: Chạy test + kiểm tĩnh**

Run: `TZ=UTC npx jest src/commission && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/commission/ src/app.module.ts && git commit -m "feat(commission): service phân giải tỉ lệ hoa hồng duy nhất

Tách 2 class: DriverCommissionService đọc tươi (luồng tiền) và
DriverCommissionDisplayService cache 10s (chỉ hiển thị), kèm test tĩnh cấm
import cache vào booking/multi-stop. Điều kiện stage='JOINED' nằm trong SQL
nên tài rời team là mức riêng mất hiệu lực ngay, không phụ thuộc caller.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Luồng trừ tiền của booking — snapshot + gom bản sao Vi-now

**Files:**
- Modify: `src/booking/booking.service.ts` — `computeBookingCommission` `:861`, accept `:1040`, Vi-now claim `:1326-1339`, reassign `:4246`, confirmSchedule `:5050`
- Test: `src/booking/booking.service.commission-rate.spec.ts` (tạo)

**Interfaces:**
- Consumes: `DriverCommissionService.effectiveRate`
- Produces: `computeBookingCommission(booking, driverId, manager)` trả `{ commission, rate, standardRate }` và **caller chịu trách nhiệm gán 2 cột snapshot lên booking**

- [ ] **Step 1: Viết test**

```ts
// src/booking/booking.service.commission-rate.spec.ts
describe('trừ hoa hồng theo mức riêng', () => {
  it('tài 0% ⇒ KHÔNG gọi deductDriverWallet', async () => { /* mock effectiveRate → 0 */ });
  it('tài 0% ⇒ booking.driverCommissionRate = 0, standardCommissionRate = 0.2', async () => {});
  it('tài thường ⇒ trừ đúng 20% priceAfterDiscount, snapshot 0.2/0.2', async () => {});
  it('Vi-now: tài thường ⇒ dùng 0.15; tài có mức riêng ⇒ dùng mức riêng', async () => {});
  it('mô tả dòng sổ giữ nguyên "Booking Commission (N)" / "Vi-now Commission (N)"', async () => {});
  it('gán lại tài: snapshot ghi đè theo tài MỚI', async () => {});
});
```

Viết đầy đủ theo mẫu mock của `booking.service.spec.ts` hiện có (dùng cùng helper repo mock — nhớ `query` trả `[]`).

- [ ] **Step 2: Chạy — FAIL**

Run: `TZ=UTC npx jest src/booking/booking.service.commission-rate.spec.ts`

- [ ] **Step 3: Sửa `computeBookingCommission`**

```ts
  /**
   * Hoa hồng trừ của tài xế = priceAfterDiscount × mức của TÀI ĐÓ.
   * Trả kèm 2 tỉ lệ để caller chốt snapshot lên booking — mọi tính toán về sau
   * (breakdown lúc hoàn thành, báo cáo tài chính) đọc snapshot, KHÔNG tính lại
   * theo config. Đây là thứ làm cho "chỉ áp cho chuyến mới" thành sự thật.
   */
  private async computeBookingCommission(
    booking: Booking,
    driverId: string,
    manager?: EntityManager,
  ): Promise<{ commission: number; rate: number; standardRate: number }> {
    const { rate, standardRate } = await this.driverCommission.effectiveRate(
      driverId, booking.isVinow, manager,
    );
    const vatAmt = this.extractFinalPriceVAT(booking);
    const discountAmt = this.extractDiscountAmount(booking);
    const finalPriceNum = Number(booking.finalPrice ?? 0);
    const grossPriceNum = Number(booking.price ?? 0);
    const priceAfterDiscount = finalPriceNum > 0
      ? Math.max(0, finalPriceNum - vatAmt)
      : Math.max(0, grossPriceNum - discountAmt);
    return { commission: Math.round(priceAfterDiscount * rate), rate, standardRate };
  }
```

- [ ] **Step 4: Sửa 4 call-site**

Ở accept (`:1040`), Vi-now claim, reassign, confirmSchedule — cùng một khuôn:

```ts
          const { commission, rate, standardRate } =
            await this.computeBookingCommission(booking, driverId, manager);
          booking.driverCommissionRate = rate;
          booking.standardCommissionRate = standardRate;
          // Guard đồng bộ với reassign/multi-stop. KHÔNG phải biện pháp bảo vệ dòng
          // tiền — deductDriverWallet(0) vốn đã không sinh dòng sổ. Chặn số dư nằm ở
          // gate ký quỹ phía trên (:988), không nằm ở đây.
          if (commission > 0) {
            await this.walletService.deductDriverWallet(
              userId, commission, booking.id,
              `${booking.isVinow ? 'Vi-now' : 'Booking'} Commission (${commission})`,
            );
          }
```

**Vi-now claim (`:1326-1339`)**: xoá toàn bộ khối tính inline, thay bằng khuôn trên.
Đã kiểm: `claimVinow` lọc `isVinow: true` (`:1210`) nên `getCommissionRate(booking.isVinow)` ≡ `getCommissionRate(true)` — gom được, không đổi tiền.

**Reassign (`:4246`)**: ghi đè snapshot theo tài MỚI. `refundDriverCommission` đảo theo dòng sổ có thật nên rate-agnostic, **không sửa**.

Xoá `private async getCommissionRate` (`:133`) — không còn ai gọi.

- [ ] **Step 5: Chạy test + toàn bộ**

Run: `TZ=UTC npx jest src/booking && TZ=UTC npx jest 2>&1 | tail -20`
Expected: PASS, `EXPECTED_COMMISSION = 18400` không đổi.

- [ ] **Step 6: Commit**

```bash
git add src/booking/ && git commit -m "feat(booking): trừ hoa hồng theo mức riêng + chốt snapshot tỉ lệ

Gom bản sao inline của Vi-now claim về computeBookingCommission. Thêm guard
commission > 0 cho accept/Vi-now/confirmSchedule (đồng bộ 5/5 luồng). Giữ
nguyên tuyệt đối format mô tả dòng sổ — driver-penalty parse chuỗi đó.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Đơn đặt hộ — snapshot lúc nhận, ĐỌC snapshot lúc hoàn thành

`orderSettlement` chạy **hai lần**: `:222` (nhận đơn, trừ hoa hồng) và `:298` (hoàn thành, giữ hộ PIT + VAT). Nếu lần thứ hai resolve lại theo `driverId`, tài rời team giữa chừng sẽ bị giữ hộ thuế theo mức khác mức đã trừ — đơn 10 triệu lệch **30.000đ PIT**, và lệch theo cả hai chiều.

**Files:**
- Modify: `src/multi-stop-order/multi-stop-lifecycle.service.ts:55-80`, `:200-245`, `:290-310`
- Test: `src/multi-stop-order/multi-stop-lifecycle.commission.spec.ts` (tạo)

**Interfaces:**
- Produces: `orderSettlement(order, rates: { rate: number; standardRate: number })` — **không tự resolve**

- [ ] **Step 1: Viết test — ca khoá lỗi**

```ts
it('đổi mức riêng GIỮA nhận đơn và hoàn thành ⇒ giữ hộ thuế theo mức LÚC NHẬN', async () => {
  // accept với rate 0 → snapshot 0 ; đổi tài về mức chung ; complete
  // kỳ vọng: PIT tính trên taxableEarnings của mức 0 (toàn bộ cước), KHÔNG phải mức 0.2
});
it('đơn cũ (driverCommissionRate NULL) ⇒ dùng config, số y hệt trước', async () => {});
```

- [ ] **Step 2: Chạy — FAIL**

- [ ] **Step 3: Sửa `orderSettlement` nhận tỉ lệ từ ngoài**

```ts
  private async orderSettlement(
    order: MultiStopOrder,
    rates: { rate: number; standardRate: number },
  ) {
    const pb: any = order.priceBreakdown ?? {};
    return computeTripEarnings(
      { price: Number(pb.subtotalPreVat), finalPrice: Number(order.totalFare),
        priceBreakdown: { vatAmount: Number(pb.vat) } },
      {
        bookingCommissionRate: rates.standardRate,
        driverCommissionRate: rates.rate,
        htxCommissionRate: 0.05, // chỉ để chia báo cáo; không ảnh hưởng commission/PIT/VAT
        pitRate: this.num(await this.masterData.getSystemConfig('DRIVER_PERSONAL_INCOME_TAX_RATE'), 0.015),
        vatRate: this.num(await this.masterData.getSystemConfig('PRICING_VAT_PERCENT'), 8) / 100,
      },
    );
  }
```

Ở **accept (`:222`)**:

```ts
        const { rate, standardRate } =
          await this.driverCommission.effectiveRate(driver.id, false, manager);
        order.driverCommissionRate = rate;
        order.standardCommissionRate = standardRate;
        const earnings = await this.orderSettlement(order, { rate, standardRate });
```

Ở **complete (`:298`)** — đọc snapshot, KHÔNG resolve lại:

```ts
        // ĐỌC SNAPSHOT. Resolve lại theo driverId ở đây sẽ khiến tài đổi mức giữa
        // chừng bị giữ hộ thuế theo mức khác mức đã bị trừ lúc nhận đơn.
        const standardRate = order.standardCommissionRate
          ?? (await this.driverCommission.standardRate(false));
        const rate = order.driverCommissionRate ?? standardRate;
        const earnings = await this.orderSettlement(order, { rate, standardRate });
```

- [ ] **Step 4: Chạy test**

Run: `TZ=UTC npx jest src/multi-stop-order`
Expected: PASS, `multi-stop-lifecycle.service.spec.ts` cũ không đổi số.

- [ ] **Step 5: Commit**

```bash
git add src/multi-stop-order/ && git commit -m "feat(multi-stop): chốt snapshot tỉ lệ lúc nhận đơn, complete đọc snapshot

orderSettlement chạy ở CẢ accept lẫn complete. Complete resolve lại theo
driverId sẽ lệch thuế giữ hộ khi tài đổi mức giữa chừng (30k/đơn 10 triệu,
lệch cả hai chiều).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Chốt sổ lúc hoàn thành + API trả app tài xế đọc snapshot

**Files:**
- Modify: `src/booking/booking.service.ts:434-462` (`attachDriverEarnings*`), `:1530-1560`, `:1662-1692` (`earningsBreakdown`), `:2880-2885`

- [ ] **Step 1: Viết test**

```ts
it('earningsBreakdown lưu cả standardCommissionRate và forgoneCommission', async () => {});
it('chuyến cũ (snapshot NULL) ⇒ dùng config hiện tại, số y hệt trước', async () => {});
it('mẫu số của htxShareRate là standardCommissionRate, không phải bookingCommissionRate', async () => {});
```

- [ ] **Step 2: Chạy — FAIL**

- [ ] **Step 3: Thêm helper đọc tỉ lệ từ snapshot**

```ts
  /**
   * Tỉ lệ để tính lại số của MỘT chuyến. Ưu tiên snapshot đã chốt lúc nhận chuyến;
   * chuyến cũ (NULL) rơi về config hiện tại — giữ nguyên hành vi trước tính năng này.
   */
  private async ratesForBooking(b: { isVinow?: boolean; driverCommissionRate?: number | null;
                                     standardCommissionRate?: number | null }) {
    const standardRate = b.standardCommissionRate
      ?? (await this.driverCommission.standardRate(b.isVinow ?? false));
    const rate = b.driverCommissionRate ?? standardRate;
    return { bookingCommissionRate: standardRate, driverCommissionRate: rate };
  }
```

Dùng ở cả 4 chỗ gọi `computeTripEarnings` trong `booking.service.ts`.

- [ ] **Step 4: Bổ sung `earningsBreakdown`**

Thêm 2 trường vào object ghi ở `:1662`:

```ts
        standardCommissionRate: earnings.standardCommissionRate,
        forgoneCommission: earnings.forgoneCommission,
```

Sửa chú thích ngay trên khối đó:

```ts
      // LƯU Ý khi đọc lại jsonb này: bookingCommissionRate là mức của TÀI (có thể 0),
      // còn mẫu số của htxShareRate/vigoShareRate là standardCommissionRate.
      // Suy ngược htxCommissionRate / bookingCommissionRate sẽ ra Infinity với tài 0%.
```

- [ ] **Step 5: Chạy toàn bộ + kiểm tĩnh**

Run: `TZ=UTC npx jest && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/booking/ && git commit -m "feat(booking): breakdown + API thu nhập đọc tỉ lệ đã chốt

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Báo cáo tài chính đọc snapshot + cột giải thích cho đối soát HTX

**Files:**
- Modify: `src/finance/finance.service.ts:292-325`, `:349-405`, `:751-757`
- Test: `src/finance/finance.service.commission-rate.spec.ts` (tạo)

- [ ] **Step 1: Viết test**

```ts
it('đọc driverCommissionRate từ booking, không tính lại theo config', async () => {});
it('đổi BOOKING_COMMISSION_RATE sau khi chuyến hoàn thành ⇒ số chuyến cũ KHÔNG đổi', async () => {});
it('chuyến NULL ⇒ số y hệt trước', async () => {});
it('HTX_SUM_KEYS có standardFeeGross và forgoneCommission', async () => {});
it('vigoCommission âm cộng dồn đúng, không bị Math.max(0,…) nuốt', async () => {});
```

- [ ] **Step 2: Chạy — FAIL**

- [ ] **Step 3: Sửa `loadTripEarnings`**

Thêm `'b.driverCommissionRate', 'b.standardCommissionRate'` vào `.select([...])`, rồi:

```ts
      const standardRate = b.standardCommissionRate
        ?? (b.isVinow ? vinowRate : standardConfigRate);
      const driverRate = b.driverCommissionRate ?? standardRate;
      return {
        earnings: computeTripEarnings(b, {
          bookingCommissionRate: standardRate,
          driverCommissionRate: driverRate,
          htxCommissionRate, pitRate, vatRate,
        }),
        ...
```

`loadMultiStopEarnings` dùng `getRawMany()` → **phải `Number(...)` tường minh**:

```ts
      const stdRate = r.standardCommissionRate == null
        ? bookingCommissionRate : Number(r.standardCommissionRate);
      const drvRate = r.driverCommissionRate == null ? stdRate : Number(r.driverCommissionRate);
```

- [ ] **Step 4: Thêm cột giải thích vào đối soát HTX**

Thêm `standardFeeGross` (Σ `standardCommission`) và `forgoneCommission` vào `HTX_SUM_KEYS` (`:751`).

Không có 2 cột này thì dòng đối soát đọc lên vô lý: chuyến 1 triệu của tài 0% cho
`platformFeeGross = 0`, `km = 0`, mà `htxCommission = 50.000`, `vigoCommission = −50.000` —
người đối soát sẽ hỏi "phí nền tảng 0đ sao HTX ăn 50.000?" và không có cột nào trả lời.

- [ ] **Step 5: Thêm endpoint số liệu ưu đãi cho màn Đội tài**

Tính ngay trong `loadTripEarnings` (đã load sẵn mọi chuyến trong kỳ, gồm cả đơn đặt hộ),
**không** quét jsonb `earningsBreakdown` (không index, và `multi_stop_order` không có cột đó):

```ts
  // GET /admin/driver-team/subsidy-summary?from&to
  // forgone  = Σ forgoneCommission                              → "Doanh thu bỏ qua"
  // cashLoss = Σ max(0, −vigoCommission) CHỈ chuyến có HTX THẬT  → "Lỗ tiền mặt bù HTX"
  // Hai con số KHÁC nhau (200k vs 50k trên chuyến 1 triệu) — phải gắn nhãn tách bạch.
  //
  // ⚠️ Bộ lọc HTX là BẮT BUỘC. resolveHtxCommissionRate rơi về DEFAULT = 0.05 khi tài
  // KHÔNG thuộc HTX nào, và cả khi HTX có rate <= 0 (~25/111 HTX trên PROD để 0.0000).
  // Không lọc thì thẻ báo VIGO lỗ tiền mặt cho khoản KHÔNG HỀ CHI RA, trên ~57% số
  // chuyến — mà đây đúng là con số CEO dùng để quyết định.
  //
  // Điều kiện: tcId IS NOT NULL AND tc."htxCommissionRate" THẬT > 0.
  // Lọc theo tcId KHÔNG THÔI là chưa đủ — nhánh raw <= 0 -> DEFAULT vẫn để lọt.
```

⛔ **KHÔNG lọc bằng `r.earnings.htxCommissionRate > 0` — luôn true, bộ lọc thành vô nghĩa.**
Trường đó là tỉ lệ **đã bị default-hoá** ở `:320-323` / `:378-381` rồi mới truyền vào
`computeTripEarnings`, nên nó không bao giờ nhỏ hơn `0.05`. `TripEarningsRow` hiện **không
mang** tỉ lệ HTX thô, nên người code bám đúng comment vẫn viết ra bộ lọc không lọc gì.

Phải mang cờ từ nguồn. Trong **cả hai** loader, tính TRƯỚC nhánh `→ DEFAULT`:

```ts
// finance.service.ts — TripEarningsRow thêm một trường
type TripEarningsRow = { /* … */ hasRealHtx: boolean };

// loadTripEarnings (:318-323)
const rawHtx = Number(driver?.transportCompany?.htxCommissionRate);
const hasRealHtx = driver?.transportCompanyId != null && Number.isFinite(rawHtx) && rawHtx > 0;
let htxCommissionRate = rawHtx;
if (!Number.isFinite(htxCommissionRate) || htxCommissionRate <= 0 || htxCommissionRate > 1) {
  htxCommissionRate = DEFAULT_HTX_RATE;   // giữ nguyên — đổi sẽ vỡ bất biến §10
}
// … trả về { earnings, hasRealHtx, … }

// loadMultiStopEarnings (:376-381) — y hệt, đọc r.htxRate (getRawMany → Number())
```

Thẻ lỗ tiền mặt: `trips.filter(t => t.hasRealHtx).reduce((s, t) => s + Math.max(0, -t.earnings.vigoCommission), 0)`.

Ca test bắt buộc: **chuyến của tài độc lập (không HTX) KHÔNG vào thẻ lỗ tiền mặt**, dù
`earnings.htxCommission = 50.000` và `vigoCommission = −50.000`.

- [ ] **Step 6: Chạy + commit**

```bash
TZ=UTC npx jest src/finance && git add src/finance/ && git commit -m "feat(finance): báo cáo đọc tỉ lệ đã chốt + cột giải thích ưu đãi

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Portal HTX — viết lại truy vấn theo từng chuyến

Query hiện `GROUP BY b.driverId` rồi nhân tỉ lệ lên **số tổng** (`:212`) — tỉ lệ theo từng chuyến không áp được lên tổng đã gộp.

**Files:**
- Modify: `src/htx/htx.service.ts:196-232`, `:249`, `:612-663`
- Test: `src/htx/htx.service.commission-rate.spec.ts` (tạo)

- [ ] **Step 1: Viết test**

```ts
it('HTX có 1 tài mức chung + 1 tài 0% ⇒ commissionAmount chỉ tính tài mức chung', async () => {});
it('PIT của tài 0% TĂNG (thu nhập chịu thuế là toàn bộ cước)', async () => {});
it('htxCommissionAmount = grossRevenue × tc.htxCommissionRate — KHÔNG đổi', async () => {});
```

- [ ] **Step 2: Chạy — FAIL**

- [ ] **Step 3: Đổi `GROUP BY b.driverId` thành `GROUP BY b."driverId", b."driverCommissionRate", b."isVinow"`**

Rồi cộng dồn ngoài JS theo từng nhóm. Giữ `lifetimeIncome` (`:249`) dùng cùng đường —
lưu ý nó chạy cho **toàn bộ** tài của một HTX, **không giới hạn thời gian**: đo lại thời
gian truy vấn sau khi đổi, nếu chậm thì thêm chỉ mục ở đợt sau (ghi vào runbook, **không**
tự tạo index trên PROD — quy tắc user: index chạy tay, không qua CI/CD).

- [ ] **Step 4: Chạy + commit**

```bash
TZ=UTC npx jest src/htx && git add src/htx/ && git commit -m "feat(htx): portal tính hoa hồng theo tỉ lệ từng chuyến

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Thu nhập tài xế nhìn thấy + ước lượng lúc chào chuyến

**Files:**
- Modify: `src/wallet/wallet.service.ts:150-195`, `:236`; `src/drivers/drivers.service.ts:1238-1300`; `src/dispatch/dispatch.processor.ts:157-230`, `:481`, `:729`; `src/dispatch/schedule-confirm.processor.ts:40-60`, `:181`

- [ ] **Step 1: Viết test**

```ts
it('lịch sử ví: chuyến của tài 0% hiện đúng số, không trừ 20%', async () => {});
it('doanh thu hôm nay: dùng snapshot của từng chuyến', async () => {});
it('payload mời chuyến: tài có mức riêng nhận driverEarnings theo mức của mình', async () => {});
it('payload mời chuyến: tài thường nhận payload gốc, không tạo object mới', async () => {});
```

- [ ] **Step 2: Chạy — FAIL**

- [ ] **Step 3: Wallet + drivers đọc snapshot**

Thêm `'driverCommissionRate'` vào `select` của cả hai query, dùng `b.driverCommissionRate ?? rateTheoConfig`.

⚠️ Hai chỗ này dùng `booking.price` **thô** (chưa trừ khuyến mãi) và một công thức thứ ba.
Sửa tỉ lệ **giảm lệch nhưng KHÔNG hết lệch** — chuyến có khuyến mãi vẫn lệch. Chuyển sang
`priceAfterDiscount` là **ngoài phạm vi** (đổi số của MỌI tài xế). Ghi chú vào code.

- [ ] **Step 4: Dispatch đè `driverEarnings` theo từng tài**

```ts
    const base = await this.buildOfferPayload(booking);
    const customRates = await this.commissionDisplay.customRateMapByUserIdForDisplayOnly();
    await Promise.all(validated.map(async (userId) => {
      // Đội tài chuyên nghiệp rất nhỏ nên nhánh này gần như không bao giờ chạy —
      // nhưng nếu bỏ, tài 0% thấy popup "trừ hoa hồng 200.000đ" và từ chối chuyến,
      // hỏng đúng mục đích của tính năng.
      const payload = customRates.has(userId)
        ? { ...base, driverEarnings: this.earningsAtRate(booking.price, customRates.get(userId)!) }
        : base;
      await this.notifyOfferWithFallback(userId, bookingId, payload);
      await this.redis.sadd(`notified_drivers:${bookingId}`, userId);
    }));
```

⚠️ **KHÔNG "tiện tay sửa"** hai processor này: chúng chỉ đọc `BOOKING_COMMISSION_RATE`
(không bao giờ đọc `VINOW_COMMISSION_RATE`) và dùng `booking.price` thô. Đó là sai **có
sẵn**; sửa sẽ đổi số hiển thị của mọi tài xế. Nợ riêng.

- [ ] **Step 5: Chạy + commit**

```bash
TZ=UTC npx jest src/wallet src/drivers src/dispatch && git add src/wallet/ src/drivers/ src/dispatch/ && git commit -m "feat(driver): thu nhập và lời mời chuyến theo mức hoa hồng của tài

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Backend — danh sách thành viên đội, KHÔNG đi qua booking

Màn Đội tài hiện dựng **toàn bộ** từ chuyến đã hoàn thành trong khoảng ngày đang chọn —
kể cả danh sách người trong team (`driver-team.sql.ts:124-127` là
`FROM "booking" b JOIN "driver_team_member" m ... AND b."completedAt" BETWEEN $1 AND $2`).

Hệ quả: **tài mới mời vào team mà chưa chạy chuyến nào thì không hiện ở đâu cả**, và tài
trong team không chạy chuyến nào trong kỳ đang lọc thì biến mất. Không thể đặt % hoa hồng
cho người mà màn hình không hiện ra → đây là điều kiện tiên quyết của Task 12.

**Files:**
- Modify: `src/driver-team/driver-team.sql.ts`, `driver-team-stats.service.ts`, `driver-team-admin.controller.ts`, `dto/driver-team.dto.ts`
- Test: `src/driver-team/driver-team-members.sql.integration.spec.ts` (tạo, theo mẫu `driver-team.sql.integration.spec.ts` — testcontainers, Postgres thật)

**Interfaces:**
- Produces: `GET /admin/driver-team/members?stage=&q=&ownerId=&from=&to=` → `{ members: TeamMemberRow[] }`
  ```ts
  type TeamMemberRow = {
    driverId: string; fullName: string | null; phone: string | null;
    stage: DriverTeamStage; commissionRate: number | null;
    ownerAdminUserId: string | null; ownerName: string | null;
    assignedRouteIds: number[]; assignedRouteNames: string[];
    nextFollowUpAt: string | null; stageChangedAt: string | null; createdAt: string;
    completedTripsInRange: number;   // tham khảo, CÓ THỂ 0
    lastCompletedAt: string | null;
  };
  ```

- [ ] **Step 1: Viết test tích hợp**

```ts
// src/driver-team/driver-team-members.sql.integration.spec.ts
it('tài trong team CHƯA có chuyến nào vẫn hiện, completedTripsInRange = 0', async () => {});
it('khoảng ngày chỉ ảnh hưởng completedTripsInRange, KHÔNG lọc bớt thành viên', async () => {});
it('lọc stage=JOINED trả đúng người trong team', async () => {});
it('q khớp tên hoặc số điện thoại', async () => {});
it('assignedRouteNames giữ tuyến đã xoá mềm dưới dạng "Tuyến đã xoá (#id)"', async () => {});
it('commissionRate trả về SỐ, không phải chuỗi numeric', async () => {});
```

- [ ] **Step 2: Chạy — FAIL**

Run: `cd /Volumes/exSSD/dev/projects/vigo-backend && TZ=UTC npx jest src/driver-team/driver-team-members.sql.integration.spec.ts`

- [ ] **Step 3: Viết SQL trong `driver-team.sql.ts`**

```ts
/**
 * Danh sách thành viên đội — đi từ `driver_team_member`, KHÔNG từ `booking`.
 *
 * Đây là khác biệt cốt lõi so với MEMBER_CTE của màn theo tuyến: ở đó thành viên chỉ
 * hiện khi có chuyến hoàn thành trong kỳ, nên tài mới mời vào team (chưa chạy chuyến
 * nào) vô hình. Ở đây khoảng ngày CHỈ dùng để đếm `completedTripsInRange`, không bao
 * giờ lọc bớt dòng — LEFT JOIN, không phải JOIN.
 */
export const MEMBERS_SQL = `
  SELECT m."driverId", m.stage, m."commissionRate", m."ownerAdminUserId",
         m."assignedRouteIds", m."nextFollowUpAt", m."stageChangedAt", m."createdAt",
         u."fullName", u.phone,
         COALESCE(t."trips", 0)::int AS "completedTripsInRange",
         t."lastCompletedAt"
    FROM "driver_team_member" m
    JOIN "driver" d ON d.id = m."driverId"
    LEFT JOIN "user" u ON u.id = d."userId"
    LEFT JOIN (
      SELECT b."driverId", COUNT(*)::int AS "trips", MAX(b."completedAt") AS "lastCompletedAt"
        FROM "booking" b
       WHERE b.status = 'COMPLETED' AND b."driverId" IS NOT NULL
         AND b."completedAt" >= $1 AND b."completedAt" <= $2
       GROUP BY b."driverId"
    ) t ON t."driverId" = m."driverId"
   WHERE ($3::text IS NULL OR m.stage = $3::driver_team_stage_enum)
     AND ($4::text IS NULL OR u."fullName" ILIKE $4 OR u.phone ILIKE $4)
     AND ($5::uuid IS NULL OR m."ownerAdminUserId" = $5)
   ORDER BY m."stageChangedAt" DESC NULLS LAST, m."createdAt" DESC`;
```

- [ ] **Step 4: Service + controller**

Trong `driver-team-stats.service.ts` thêm `listMembers(params)`. Nhớ:
- `Number(row.commissionRate)` tường minh — `query()` thô **không** đi qua transformer.
- Bơm `ownerName` bằng `withOwnerName()` sẵn có.
- Đổi `assignedRouteIds` → tên tuyến, tuyến xoá mềm hiện `Tuyến đã xoá (#id)`.
- Trả `{ members }` — **KHÔNG** trả `{ data, meta }`: `TransformInterceptor` dựng lại mọi
  object có `data`+`meta` và **vứt bỏ mọi field khác** (đã dính lỗi này 2026-08-10).

Controller: thêm `@Get('members')` **TRƯỚC** route `:driverId`, giữ `@RequireFunction('driver-team')`
ở class (không cần super admin — đây chỉ là đọc danh sách).

- [ ] **Step 5: Test response shape**

```ts
it('response KHÔNG có key data/meta (TransformInterceptor sẽ nuốt members)', () => {
  const out = service.listMembers(params);
  expect(Object.keys(out)).not.toContain('data');
  expect(Object.keys(out)).not.toContain('meta');
});
```

- [ ] **Step 6: Chạy + kiểm tĩnh + commit**

```bash
TZ=UTC npx jest src/driver-team && npx tsc --noEmit
git add src/driver-team/ && git commit -m "feat(driver-team): endpoint danh sách thành viên đội

Đi từ driver_team_member chứ không từ booking: tài mới mời vào team mà chưa
chạy chuyến nào trước đây không hiện ở đâu cả. Khoảng ngày chỉ dùng để đếm
số chuyến, không lọc bớt thành viên.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: Sửa lỗi CÓ SẴN — tạo thành viên thẳng ở một trạng thái không sinh sự kiện

**Lỗi này có sẵn, độc lập với hoa hồng. Commit riêng, làm TRƯỚC Task 13** — vì hook auto-ghi
`0.0000` sẽ treo ở đúng nhánh đang hỏng.

`driver-team.service.ts:67-78`:

```ts
const member = existing ?? this.members.create({ stage: body.stage ?? CONTACTED });
if (body.stage !== undefined && body.stage !== member.stage) {   // 'JOINED' !== 'JOINED' → false
```

Với tài **chưa có dòng nào**, `stage` được gán vào `member` TRƯỚC khi so sánh nên điều kiện
luôn `false`. Hôm nay: tạo thành viên thẳng ở "Trong team" **không sinh dòng `STAGE_CHANGE`**.
Sau Task 13 mà không sửa: `commissionRate` ở lại `NULL` → resolver rơi về mức chung →
**tài xế bị thu 20% trong khi CEO tưởng đã miễn**, im lặng, không log.

**Files:**
- Modify: `src/driver-team/driver-team.service.ts:60-86`
- Test: `src/driver-team/driver-team.service.spec.ts` (bổ sung)

**Interfaces:**
- Produces: `patchMember` sinh `STAGE_CHANGE` với `fromStage = existing?.stage ?? null` cho **cả** dòng mới lẫn dòng cũ

- [ ] **Step 1: Viết test**

```ts
describe('patchMember — sinh sự kiện đổi trạng thái', () => {
  it('tài CHƯA có dòng, PATCH stage=JOINED ⇒ sinh STAGE_CHANGE với fromStage = null', async () => {
    // existing = null, body.stage = 'JOINED'
    // kỳ vọng: 1 event { type: STAGE_CHANGE, fromStage: null, toStage: 'JOINED' }
  });

  it('tài CHƯA có dòng, PATCH chỉ note ⇒ stage mặc định CONTACTED, VẪN sinh STAGE_CHANGE', async () => {
    // đường đi có thật từ drawer: ghi chú cho một tài "Tiềm năng"
  });

  it('tài ĐÃ có dòng ở CONTACTED, PATCH stage=JOINED ⇒ fromStage = CONTACTED', async () => {});

  it('tài ĐÃ có dòng ở JOINED, PATCH stage=JOINED ⇒ KHÔNG sinh sự kiện (không đổi gì)', async () => {});
});
```

- [ ] **Step 2: Chạy — ca 1 và ca 2 phải FAIL**

Run: `cd /Volumes/exSSD/dev/projects/vigo-backend && TZ=UTC npx jest src/driver-team/driver-team.service.spec.ts`
Expected: ca 1, 2 FAIL (không có event nào). Ca 3, 4 PASS.

- [ ] **Step 3: Sửa**

```ts
    const existing = await this.members.findOne({ where: { driverId } });
    const now = new Date();

    // So với trạng thái CŨ THẬT SỰ (null nếu chưa có dòng), KHÔNG so với member.stage:
    // member vừa được create() với stage đã gán, nên 'JOINED' !== 'JOINED' luôn false và
    // dòng mới không bao giờ sinh sự kiện.
    const prevStage: DriverTeamStage | null = existing?.stage ?? null;
    const nextStage: DriverTeamStage = body.stage ?? existing?.stage ?? DriverTeamStage.CONTACTED;

    const member =
      existing ??
      this.members.create({
        driverId,
        stage: nextStage,
        assignedRouteIds: [],
        createdByAdminUserId: adminUserId,
      });

    const pending: Partial<DriverTeamEvent>[] = [];

    if (nextStage !== prevStage) {
      pending.push({ type: DriverTeamEventType.STAGE_CHANGE, fromStage: prevStage, toStage: nextStage });
      member.stage = nextStage;
      member.stageChangedAt = now;
    }
```

- [ ] **Step 4: Chạy — cả 4 ca PASS, test driver-team cũ không đổi**

Run: `TZ=UTC npx jest src/driver-team && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/driver-team/ && git commit -m "fix(driver-team): tạo thành viên thẳng ở một trạng thái vẫn sinh sự kiện

member được create() với stage đã gán rồi mới so sánh với chính nó, nên
dòng mới không bao giờ sinh STAGE_CHANGE. So với trạng thái cũ thật sự
(null nếu chưa có dòng).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 13: API sửa mức riêng — chỉ super admin, có nhật ký

**Files:**
- Modify: `src/driver-team/driver-team-admin.controller.ts`, `driver-team.service.ts`, `dto/driver-team.dto.ts`, `driver-team.enums.ts`
- Test: `src/driver-team/driver-team.commission.spec.ts` (tạo)

**Interfaces:**
- Produces: `PATCH /admin/driver-team/:driverId/commission-rate` body `{ commissionRate: number | null }`

- [ ] **Step 1: Viết test**

```ts
it('không phải super admin ⇒ 403 (AUTH_003)', async () => {});
it('super admin ⇒ 200 và lưu đúng giá trị', async () => {});
it('rate < 0 hoặc > 1 ⇒ 400', async () => {});
it('mỗi lần đổi ghi 1 dòng driver_team_event kèm giá trị cũ và mới', async () => {});
it('chuyển stage sang JOINED khi commissionRate NULL ⇒ tự ghi 0 KÈM một dòng sự kiện', async () => {});
it('TẠO THẲNG thành viên ở stage JOINED ⇒ cũng tự ghi 0 + sự kiện (phụ thuộc Task 12)', async () => {});
it('sửa xong thì cache hiển thị bị xoá', async () => {});
it('gửi commissionRate qua PATCH :driverId chung ⇒ bị bỏ qua, KHÔNG ghi vào DB', async () => {
  // Chặn hai lớp: main.ts:74 whitelist:true strip field không decorator, và patchMember
  // gán TỪNG field có tên (không Object.assign). Test này khoá cả hai lại.
});
it('mức riêng > mức chuẩn (vd 0.5) vẫn lưu được, nhưng forgone âm và UI phải cảnh báo', async () => {});
```

- [ ] **Step 2: Chạy — FAIL**

- [ ] **Step 3: Thêm DTO**

```ts
export class UpdateCommissionRateDto {
  /** 0..1. null = gỡ mức riêng, tài về ăn chia mức chung. */
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate: number | null;
}
```

- [ ] **Step 4: Thêm endpoint**

```ts
  /**
   * Sửa % hoa hồng riêng. SuperOnlyGuard ở MỨC METHOD — đây là nút trực tiếp làm
   * VIGO mất doanh thu, không uỷ quyền cho ai khác được.
   *
   * Vì sao không dùng @RequireFunction('driver-team','settings.pricing'):
   * FunctionAccessGuard dùng required.some(...) tức là HOẶC, và
   * getAllAndOverride([handler, class]) khiến decorator ở method XOÁ decorator ở
   * class. Hạ tầng hiện tại không diễn đạt được "cần CẢ hai quyền".
   */
  @Patch(':driverId/commission-rate')
  @UseGuards(SuperOnlyGuard)
  async updateCommissionRate(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() body: UpdateCommissionRateDto,
    @Req() req: any,
  ) {
    return this.service.updateCommissionRate(driverId, body.commissionRate, req.user.id);
  }
```

- [ ] **Step 5: Service — ghi nhật ký + xoá cache**

Thêm `DriverTeamEventType.COMMISSION_RATE_CHANGED`. Trong `dataSource.transaction`:
đọc giá trị cũ, ghi giá trị mới, chèn một dòng `driver_team_event` mô tả
`"Đổi hoa hồng: 20% → 0%"`, rồi `this.commissionDisplay.invalidate()` sau commit.

Trong `patchMember`, khi `stage` chuyển sang `JOINED` mà `commissionRate` đang `NULL`:
gán `0` **và ghi một dòng sự kiện riêng** — nếu không sẽ có tài hưởng 0% mà không ai
nhớ vì sao.

- [ ] **Step 6: Chạy + kiểm tĩnh + commit**

```bash
TZ=UTC npx jest src/driver-team src/rbac && npx tsc --noEmit
git add src/driver-team/ && git commit -m "feat(driver-team): endpoint sửa % hoa hồng riêng, chỉ super admin

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 14: Backend — dọn 9 bản sao đọc tỉ lệ, chạy trọn bộ kiểm

**Files:**
- Modify: `src/wallet/wallet.service.ts:236`, `src/drivers/drivers.service.ts:1288`, `src/finance/finance.service.ts:293`, `src/htx/htx.service.ts:206`, `:612`, `src/multi-stop-order/multi-stop-lifecycle.service.ts:64`

- [ ] **Step 1: Xoá từng bản sao `getCommissionRate` / `readRate('*_COMMISSION_RATE')`**, thay bằng `DriverCommissionService.standardRate()`.

- [ ] **Step 2: Kiểm không còn sót**

Run:
```bash
grep -rn "BOOKING_COMMISSION_RATE\|VINOW_COMMISSION_RATE" src --include='*.ts' | grep -v "commission/\|migrations/\|rbac.constants"
```
Expected: **rỗng**.

- [ ] **Step 3: Chạy trọn bộ**

Run: `TZ=UTC npx jest && npx tsc --noEmit`
Expected: PASS toàn bộ, không sửa số nào trong test cũ.

- [ ] **Step 4: Commit + đẩy nhánh**

```bash
git add src/wallet/ src/drivers/ src/finance/ src/htx/ src/multi-stop-order/ && git commit -m "refactor(commission): xoá 9 bản sao đọc tỉ lệ hoa hồng

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -u origin feat/driver-commission
```

---

## Task 15: Admin — kiểu dữ liệu + hàm gọi API

**Files:**
- Modify: `/Volumes/exSSD/dev/projects/vigo-admin-driver-commission/src/lib/types.ts`, `src/lib/api.ts`
- Test: `src/lib/api-driver-commission.test.ts` (tạo)

**Interfaces:**
- Produces:
  - `updateTeamCommissionRate(driverId: string, rate: number | null): Promise<DriverTeamDetail>`
  - `getTeamSubsidySummary(range): Promise<{ forgone: number; cashLoss: number }>`
  - `getTeamMembers(params: { from: string; to: string; stage?: string; q?: string; ownerId?: string }): Promise<{ members: TeamMemberRow[] }>` — đọc `{ members }`, **không** `{ data, meta }`

- [ ] **Step 1: Viết test** (theo mẫu `api-driver-team.test.ts` sẵn có)

```ts
it('gửi commissionRate = 0 chứ không bỏ qua (0 là giá trị hợp lệ)', async () => {
  await updateTeamCommissionRate('d1', 0);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ commissionRate: 0 });
});
it('null = gỡ mức riêng, vẫn được gửi', async () => {});
```

- [ ] **Step 2–4: Chạy FAIL → cài đặt → chạy PASS**

Thêm `commissionRate?: number | null` vào `TeamMemberState`/`DriverTeamDetail`, và
`standardCommissionRate?: number`, `forgoneCommission?: number` vào type breakdown.

- [ ] **Step 5: Commit**

---

## Task 16: Admin — tab "Đội tài", danh sách thành viên

Màn Đội tài hiện chỉ có **một** lối vào: cây tuyến, phụ thuộc khoảng ngày. Nó tốt cho việc
*tìm người mới* (tuyến nào nhiều tài chạy tốt) nhưng không dùng để *quản người đã có* —
tài chưa chạy chuyến nào trong kỳ thì không hiện.

Thêm **hai tab**, giữ nguyên phần theo tuyến đang có:
- **Theo tuyến** — như hiện tại, tìm người mới.
- **Đội tài** — bảng phẳng từ endpoint Task 11, không phụ thuộc khoảng ngày.

**Files:**
- Create: `src/app/(app)/driver-team/components/team-members-table.tsx`
- Modify: `src/app/(app)/driver-team/components/driver-team-screen.tsx`, `src/lib/driver-team-export.ts`
- Test: `src/app/(app)/driver-team/components/team-members-table.test.ts`

**Interfaces:**
- Consumes: `getTeamMembers(params)` từ Task 14
- Produces: `<TeamMembersTable rows onOpenDriver />` — bấm dòng gọi `onOpenDriver(driverId)`, mở đúng `DriverTeamDrawer` sẵn có

- [ ] **Step 1: Viết test cho phần logic thuần**

```ts
it('tài chưa chạy chuyến nào ⇒ cột "Chuyến trong kỳ" hiện 0, KHÔNG ẩn dòng', () => {});
it('sắp xếp mặc định: người vào team gần nhất lên đầu', () => {});
it('mức riêng null ⇒ hiện "Mức chung", mức 0 ⇒ hiện "0%" kèm dấu cảnh báo', () => {});
it('xuất Excel có cột % hoa hồng', () => {});
```

Ca thứ ba là ca dễ sai nhất: `null` và `0` phải hiện **khác nhau** — `null` là "chưa set,
ăn chia bình thường", `0` là "miễn hoa hồng". Lẫn hai cái là hiểu sai 200.000đ/chuyến.

- [ ] **Step 2: Chạy — FAIL**

Run: `cd /Volumes/exSSD/dev/projects/vigo-admin && npx vitest run src/app/\(app\)/driver-team`

- [ ] **Step 3: Dựng bảng**

Cột: tài xế (tên + SĐT) · trạng thái · **% hoa hồng** · người phụ trách · tuyến phụ trách ·
hẹn gọi lại · ngày vào team · chuyến trong kỳ · chuyến gần nhất.

Lọc: trạng thái (mặc định **Trong team**), người phụ trách, tìm tên/SĐT. Bấm dòng mở
`DriverTeamDrawer`. Nút xuất Excel dùng lại `driver-team-export.ts`.

- [ ] **Step 4: Thêm tab vào `driver-team-screen.tsx`**

Giữ nguyên toàn bộ phần theo tuyến. Bộ lọc khoảng ngày vẫn áp cho cả hai tab, nhưng ở tab
Đội tài nó **chỉ đổi cột "chuyến trong kỳ"**, không lọc bớt người — ghi rõ câu này lên UI
để không ai tưởng danh sách bị thiếu.

- [ ] **Step 5: Chạy + kiểm tĩnh**

Run: `npx vitest run && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/driver-team/ src/lib/driver-team-export.ts && git commit -m "feat(driver-team): tab Đội tài — danh sách thành viên không phụ thuộc khoảng ngày

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 17: Admin — ô nhập % + cảnh báo + hai thẻ tổng

**Files:**
- Modify: `src/app/(app)/driver-team/components/driver-team-drawer.tsx`, `driver-team-screen.tsx`
- Test: `src/app/(app)/driver-team/components/commission-warning.test.ts` (tạo)

- [ ] **Step 1: Viết test cho hàm tính cảnh báo**

```ts
it('tài HTX 5%, mức riêng 0% ⇒ cảnh báo nêu lỗ 50.000đ/chuyến 1 triệu', () => {});
it('mức riêng = mức chuẩn ⇒ không cảnh báo', () => {});
```

- [ ] **Step 2–4: FAIL → cài đặt → PASS**

- Ô "% hoa hồng riêng" **chỉ hiện khi stage = Trong team**; không phải super admin thì
  hiện chỉ-đọc kèm lý do.
- Cảnh báo đỏ nêu **số cụ thể**.
- Hai thẻ **tách bạch nhãn** ở đầu màn — bản gộp cho hai con số lệch nhau 4 lần trên cùng
  một chuyến (200.000 vs 50.000):
  - "Doanh thu bỏ qua" = Σ `forgoneCommission`
  - "Lỗ tiền mặt (bù HTX)" = Σ `max(0, −vigoCommission)`
  - Chú thích: chỉ đếm chuyến **đã hoàn thành**.

- [ ] **Step 5: Commit**

---

## Task 18: Admin — chịu được số âm ở mọi màn tài chính

**Files:**
- Modify: `src/app/(app)/bookings/components/bookings-table.tsx:190`, `:198`, `:222`; `src/app/(app)/finance/components/finance-stat-cards.tsx:35`; `src/app/(app)/finance/components/finance-drilldown-chart.tsx:68`; `src/app/(app)/dashboard/page.tsx:149`
- Test: `src/app/(app)/htx-reconciliation/htx-recon-shared.test.ts` (bổ sung)

- [ ] **Step 1: Viết test**

```ts
it('hasNewSplit đúng khi htxCommission = 0 và vigoCommission = 0', () => {});
it('vigoCommission âm ⇒ driverNet và driverIncome vẫn đọc được, không vượt cước', () => {});
it('cột 20 "Phí HTX" = 50.000 đứng cạnh cột 10 "Phí APP trước VAT" = 0 — có cột giải thích', () => {
  // Đây mới là ca đáng test. customerTotal == grossRevenue là đồng nhất thức ĐỘC LẬP
  // với r (htxFareBeforeVat + appFeeBeforeVat luôn = priceBeforeVat theo cấu tạo)
  // nên luôn xanh và không bảo vệ được gì.
});
```

- [ ] **Step 2: Chạy — FAIL**

- [ ] **Step 3: Sửa 4 chỗ**

```ts
// bookings-table.tsx:198 — kiểm SỰ TỒN TẠI, không kiểm dấu.
// Cũ: htxCommission > 0 || vigoCommission > 0
// Với tài 0% không thuộc HTX thì cả hai = 0 → rơi nhánh legacy dành cho chuyến
// trước migration 1782000000000, mất luôn ô "Tổng kiểm tra".
const hasNewSplit =
  earnings.htxCommission !== undefined && earnings.vigoCommission !== undefined;
```

- `bookings-table.tsx:222`: bỏ dấu `-` cứng khi giá trị đã âm (tránh `--40.000`).
- `finance-stat-cards.tsx:35` và `dashboard/page.tsx:149`: màu theo dấu, thêm chú thích
  khi âm ("gồm phần VIGO bù cho HTX của tài hưởng ưu đãi").
- `finance-drilldown-chart.tsx:68`: `radius={0}` — recharts không lật bo góc cho cột âm.

- [ ] **Step 4: Chạy + kiểm tĩnh**

Run: `npx vitest run && npx tsc --noEmit`

- [ ] **Step 5: Commit + đẩy nhánh**

```bash
git add src/app/\(app\)/bookings/ src/app/\(app\)/finance/ src/app/\(app\)/dashboard/ src/app/\(app\)/htx-reconciliation/ && git commit -m "fix(admin): các màn tài chính chịu được hoa hồng VIGO âm

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -u origin feat/driver-commission
```

---

## Task 19: Review đối kháng code + triển khai

- [ ] **Step 1: Review đối kháng — LƯỢT DUY NHẤT còn lại**

CLAUDE.md 0.5.e: tối đa 1 lượt reviewer cho **cả** thay đổi (đếm toàn cục). Lượt review
spec đã dùng ở giai đoạn thiết kế. Dùng lượt này cho **diff code**, fresh-context, đọc
file đụng + call-site trực tiếp, ghi báo cáo ra scratchpad.

Trọng tâm review: (a) có chỗ nào truyền `r` vào mẫu số `htxShareRate` không;
(b) có chỗ nào `||` thay vì `??` khi fallback tỉ lệ không; (c) có `getRawMany` nào quên
`Number()` không; (d) test cũ có bị sửa số không.

- [ ] **Step 2: Merge vào `dev`, test trên môi trường DEV — CỔNG BẮT BUỘC**

Backend trước, admin sau. Kiểm bằng tay trên DEV:
1. Đưa một tài vào "Trong team" → xác nhận `commissionRate` tự về 0 và có dòng nhật ký.
2. Tài đó nhận một chuyến → ví **không** bị trừ hoa hồng.
3. Hoàn thành chuyến → app tài xế hiện đúng số; bảng đối soát HTX cho `vigoCommission` âm.
4. Dashboard tài chính hiện "Doanh thu VIGO" âm với **màu đỏ**.
5. Tài khoản không phải super admin → ô % là chỉ-đọc, gọi API thẳng trả 403.

- [ ] **Step 3: PR `feat/driver-commission → main` từng repo, backend trước**

- [ ] **Step 4: Deploy PROD**

Backend: `bash scripts/deploy.sh` (migration chạy trong đó). **Chọn khung giờ thấp điểm** —
`lock_timeout` 5s sẽ làm migration fail nhanh nếu `booking` đang bị khoá, khi đó chạy lại.

Admin: `npm run build` (build **và** đồng bộ S3 prod).

- [ ] **Step 5: Resync `main → dev` cả hai repo, xoá worktree**

```bash
git worktree remove /Volumes/exSSD/dev/projects/vigo-backend-driver-commission
git worktree remove /Volumes/exSSD/dev/projects/vigo-admin-driver-commission
```

---

## Tự soát kế hoạch

**Phủ spec:** §3 → Task 3; §4 → Task 2; §5A → Task 5–6; §5B/C → Task 7; §5D → Task 10;
§5E → Task 10; §5F → Task 8; §5G → Task 9; §5G′ → Task 18; §6.1 → Task 14; §6.2 → Task 4;
§6.3 → Task 1; §7.1/7.2 → Task 13; §7.3 → Task 11 + 16; §7.4 → Task 12; §7.5 → Task 8;
§8 → Task 17; §9 → Task 3 Step 3; §10 → rải khắp; §13 → Task 19.

**Ngoài spec ban đầu, phát hiện khi lập kế hoạch và khi review:**
- Task 11 + 16 (danh sách thành viên đội) — spec giả định người trong team luôn nhìn thấy
  được để đặt %; thực tế màn hình dựng từ chuyến hoàn thành trong kỳ nên tài chưa chạy
  chuyến nào là vô hình.
- Task 12 (sửa `patchMember`) — lỗi có sẵn khiến hook auto-0% không bao giờ chạy cho thành
  viên tạo thẳng ở "Trong team".
- Task 8 bộ lọc HTX thật cho thẻ "Lỗ tiền mặt" — nếu không, thẻ báo lỗ cho ~57% chuyến của
  tài độc lập, do 5% "phần HTX" ảo có sẵn trong `resolveHtxCommissionRate`.

**Nhất quán tên:** `effectiveRate` / `standardRate` / `customRateMapByUserIdForDisplayOnly`
dùng thống nhất Task 4 → 5 → 6 → 10. `driverCommissionRate` / `standardCommissionRate` là
tên cột DB, tên trường entity, và tên trong `TripEarningsRates` — cùng một chuỗi ở mọi nơi.

**Khoảng trống đã biết:** Task 5, 6, 8–13, 15–18 ghi tiêu đề test thay vì thân
test đầy đủ. Người thực hiện phải viết thân test **trước** khi cài đặt (TDD), theo mẫu mock
của spec liền kề trong cùng thư mục. Task 1–4 có thân test đầy đủ vì đó là phần công thức
tiền — nơi sai một dấu là sai tiền mà không có gì báo.
