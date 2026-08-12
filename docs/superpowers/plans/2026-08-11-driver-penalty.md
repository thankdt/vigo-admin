# Phạt tài xế vi phạm — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development hoặc
> superpowers:executing-plans để thực thi từng task. Steps dùng checkbox (`- [ ]`).

**Spec:** `docs/superpowers/specs/2026-08-11-driver-penalty-design.md` (đọc TRƯỚC — mọi con số,
chuỗi mô tả ledger và lý do thiết kế nằm ở đó).

**Goal:** Admin xác minh tài xế vi phạm rồi thu lại đúng khoản commission của chuyến đã huỷ, thay
vì để hệ thống hoàn về ví tài xế.

**Architecture:** Bảng `driver_penalty` ghi vụ phạt; tiền đi qua **hàm ví có sẵn**
(`deductDriverWallet` khi phạt, `refundDriverCommission` khi huỷ phạt) với
`referenceId = 'penalty:<id>'`. Số tiền **đọc từ ledger lịch sử**, không tính lại theo công thức.
Trang admin `/driver-penalties` + nút phạt nhúng ở 2 màn soát.

**Tech Stack:** NestJS + TypeORM + Postgres (vigo-backend) · Next.js 15 App Router + shadcn/ui
(vigo-admin) · Jest (BE) · Vitest (FE).

## Global Constraints

- **Múi giờ:** mọi mốc ngày người dùng thấy/lọc là **Việt Nam UTC+7**. FE gửi `YYYY-MM-DD` VN,
  BE hiểu là `+07:00`.
- **Lệnh kiểm BE:** `npx tsc --noEmit` + **`npm test`** (KHÔNG `npx jest` — `test/jest-setup-tz.js`
  ném lỗi khi process không UTC). Test chạm Postgres đặt tên `*.integration.spec.ts`.
- **Lệnh kiểm FE:** `npx tsc --noEmit` + `npx vitest run`. **KHÔNG chạy `npm run build`** (nó
  deploy thẳng lên S3 prod) — dùng `npx next build` nếu cần smoke.
- **KHÔNG thêm giá trị mới cho `LedgerType`** (app tài xế hard-map enum → vỡ parse).
- **KHÔNG dùng `referenceId = bookingId`** cho dòng phạt (xem spec §4.4).
- **Mọi lời gọi ví truyền `manager` PHẢI kèm `{ deferNotify: true }`** và tự bắn `__notify` sau commit.
- Nhánh: `feat/driver-penalty` ở **cả hai repo**, cắt từ `main`.
- Commit message kết bằng `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

### vigo-backend

| File | Trách nhiệm |
|---|---|
| `src/driver-penalty/entities/driver-penalty.entity.ts` | Bảng + 2 enum (`reasonCode`, `status`, `source`) |
| `src/database/migrations/1793100000000-AddDriverPenalty.ts` | Tạo bảng + index (kể cả unique partial) |
| `src/driver-penalty/penalty-amount.util.ts` | **Hàm thuần** giải số tiền phạt từ các dòng ledger. Không đụng DB → test dễ, đây là chỗ dễ sai nhất |
| `src/driver-penalty/penalty-amount.util.spec.ts` | Test cho util trên |
| `src/driver-penalty/driver-penalty.service.ts` | preview / create / reverse / queue / list |
| `src/driver-penalty/driver-penalty.service.spec.ts` | Test service (mock repo + wallet) |
| `src/driver-penalty/driver-penalty-admin.controller.ts` | 5 route, guard chain ở mức class |
| `src/driver-penalty/dto/driver-penalty.dto.ts` | DTO + validation |
| `src/driver-penalty/driver-penalty.module.ts` | Wiring |
| `src/rbac/rbac.constants.ts` | +`'driver-penalties'` vào `MENU_FUNCTIONS` |
| `src/booking/booking.service.ts` | Guard: không rời `CANCELLED` khi có phạt ACTIVE |
| `src/booking/booking.module.ts` | `forFeature([DriverPenalty])` (tránh circular dep) |
| `src/finance/finance.service.ts` | +nhóm `penalty` vào `cashflowCategories()` |
| `src/app.module.ts` | Đăng ký `DriverPenaltyModule` |

### vigo-admin

| File | Trách nhiệm |
|---|---|
| `src/lib/api.ts` | 5 hàm client + types |
| `src/lib/rbac.ts` | +`'/driver-penalties'` |
| `src/lib/nav-items.tsx` | +mục menu |
| `src/app/(app)/driver-penalties/penalty-labels.ts` | Nhãn lý do/trạng thái/nguồn + class badge |
| `src/app/(app)/driver-penalties/penalty-labels.test.ts` | Test nhãn |
| `src/app/(app)/driver-penalties/components/penalty-dialog.tsx` | Dialog phạt **dùng chung 3 màn** |
| `src/app/(app)/driver-penalties/components/penalty-dialog.test.tsx` | Test dialog (gate nút, cảnh báo âm ví) |
| `src/app/(app)/driver-penalties/page.tsx` | Trang 2 tab |
| `src/app/(app)/driver-cancel-review/components/driver-detail-dialog.tsx` | +nút Phạt mỗi dòng chuyến huỷ |
| `src/app/(app)/leakage-review/components/trace-detail-dialog.tsx` | +nút Phạt |
| `src/app/(app)/driver-cashflow/page.tsx` | +nhãn `penalty` |

---

## Task 1 — Entity + migration `driver_penalty`

**Files:**
- Create: `src/driver-penalty/entities/driver-penalty.entity.ts`
- Create: `src/database/migrations/1793100000000-AddDriverPenalty.ts`

**Interfaces — Produces:**
```ts
export enum PenaltyReasonCode { OFF_PLATFORM, NO_SHOW, FORCED_CANCEL, FAKE_TRIP, OTHER }
export enum PenaltyStatus { ACTIVE = 'ACTIVE', REVERSED = 'REVERSED' }
export enum PenaltySource { PENALTY_PAGE, CANCEL_REVIEW, LEAKAGE_REVIEW }
@Entity('driver_penalty') export class DriverPenalty { … }
```

- [x] **Step 1: Viết entity**

Cột theo spec §5. `amount`/`fromMain`/`fromDeposit` dùng `bigint` + transformer về `number`
(mirror cách repo xử lý số tiền), `sourceCommissionLedgerIds` là `int[]` (jsonb không cần —
chỉ là danh sách id).

- [x] **Step 2: Viết migration**

```sql
CREATE TABLE IF NOT EXISTS "driver_penalty" ( … );
CREATE UNIQUE INDEX IF NOT EXISTS "uq_driver_penalty_active_booking"
  ON "driver_penalty" ("bookingId") WHERE "status" = 'ACTIVE';
CREATE INDEX IF NOT EXISTS "idx_driver_penalty_driver_created"
  ON "driver_penalty" ("driverEntityId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_driver_penalty_created" ON "driver_penalty" ("createdAt" DESC);
```
`down()` drop bảng + type enum.

- [x] **Step 3: `npx tsc --noEmit`** → sạch.

- [x] **Step 4: Commit** `feat(driver-penalty): bảng driver_penalty + migration`

---

## Task 2 — Util giải số tiền phạt (phần dễ sai nhất, TDD trước)

**Files:**
- Create: `src/driver-penalty/penalty-amount.util.ts`
- Test: `src/driver-penalty/penalty-amount.util.spec.ts`

**Interfaces — Produces:**
```ts
export type CommissionRow = { id: number; amount: number; description: string; sourceWalletId: number };
export type RefundRow = { id: number; description: string };
export type ResolveFailure = 'NO_COMMISSION' | 'NOT_REFUNDED' | 'LEDGER_ANOMALY';
export type ResolveResult =
  | { ok: true; amount: number; ledgerIds: number[] }
  | { ok: false; reason: ResolveFailure };

export function stripWalletSuffix(description: string): string;
export function parseCommissionTotal(description: string): number | null;
export function resolvePenaltyAmount(args: {
  commissionRows: CommissionRow[]; // ĐÃ lọc + ORDER BY id DESC
  refundRows: RefundRow[];         // REFUND của booking, SYSTEM_REVENUE → ví tài xế
}): ResolveResult;
```

- [x] **Step 1: Viết test TRƯỚC** (`penalty-amount.util.spec.ts`)

```ts
const row = (id: number, amount: number, description: string, sourceWalletId: number)
  : CommissionRow => ({ id, amount, description, sourceWalletId });
const refundOf = (id: number, paymentId: number): RefundRow =>
  ({ id, description: `Booking Commission Refund (reverse #${paymentId})` });

describe('parseCommissionTotal', () => {
  it('lấy nhóm ngoặc SỐ CUỐI CÙNG', () => {
    expect(parseCommissionTotal('Booking Commission (12345)')).toBe(12345);
    expect(parseCommissionTotal('Booking Commission (admin reassign) (12345)')).toBe(12345);
    expect(parseCommissionTotal('Vi-now Commission (999)')).toBe(999);
  });
  it('trả null khi không có nhóm số', () => {
    expect(parseCommissionTotal('Booking Commission')).toBeNull();
  });
});

describe('stripWalletSuffix', () => {
  it('bỏ đúng hậu tố ví, không đụng phần còn lại', () => {
    expect(stripWalletSuffix('Booking Commission (12345) (Main)')).toBe('Booking Commission (12345)');
    expect(stripWalletSuffix('Booking Commission (12345) (Deposit)')).toBe('Booking Commission (12345)');
    expect(stripWalletSuffix('Booking Commission (12345)')).toBe('Booking Commission (12345)');
  });
});

describe('resolvePenaltyAmount', () => {
  it('NO_COMMISSION khi chuyến chưa từng bị trừ', () => {
    expect(resolvePenaltyAmount({ commissionRows: [], refundRows: [] }))
      .toEqual({ ok: false, reason: 'NO_COMMISSION' });
  });

  it('một dòng Main duy nhất', () => {
    const rows = [row(10, 20000, 'Booking Commission (20000) (Main)', 1)];
    expect(resolvePenaltyAmount({ commissionRows: rows, refundRows: [refundOf(11, 10)] }))
      .toEqual({ ok: true, amount: 20000, ledgerIds: [10] });
  });

  it('commission chia 2 ví → gom cả 2 dòng', () => {
    const rows = [
      row(21, 15000, 'Booking Commission (20000) (Deposit)', 2),
      row(20, 5000, 'Booking Commission (20000) (Main)', 1),
    ];
    const res = resolvePenaltyAmount({
      commissionRows: rows, refundRows: [refundOf(30, 20), refundOf(31, 21)],
    });
    expect(res).toEqual({ ok: true, amount: 20000, ledgerIds: [21, 20] });
  });

  it('vòng mới trừ hết ở Main, vòng cũ hết ở Deposit, CÙNG mô tả → chỉ lấy 1×', () => {
    const rows = [
      row(40, 20000, 'Booking Commission (20000) (Main)', 1),    // vòng gần nhất
      row(30, 20000, 'Booking Commission (20000) (Deposit)', 2), // vòng trước
    ];
    const res = resolvePenaltyAmount({
      commissionRows: rows, refundRows: [refundOf(31, 30), refundOf(41, 40)],
    });
    expect(res).toEqual({ ok: true, amount: 20000, ledgerIds: [40] });
  });

  it('mô tả admin reassign vẫn ra đúng số', () => {
    const rows = [row(50, 18000, 'Booking Commission (admin reassign) (18000) (Main)', 1)];
    expect(resolvePenaltyAmount({ commissionRows: rows, refundRows: [refundOf(51, 50)] }))
      .toEqual({ ok: true, amount: 18000, ledgerIds: [50] });
  });

  it('NOT_REFUNDED khi dòng trừ chưa được hoàn', () => {
    const rows = [row(60, 20000, 'Booking Commission (20000) (Main)', 1)];
    expect(resolvePenaltyAmount({ commissionRows: rows, refundRows: [] }))
      .toEqual({ ok: false, reason: 'NOT_REFUNDED' });
  });

  it('LEDGER_ANOMALY khi không tổ hợp nào khớp N', () => {
    const rows = [row(70, 7000, 'Booking Commission (20000) (Main)', 1)];
    expect(resolvePenaltyAmount({ commissionRows: rows, refundRows: [refundOf(71, 70)] }))
      .toEqual({ ok: false, reason: 'LEDGER_ANOMALY' });
  });

  it('LEDGER_ANOMALY khi mô tả không có số', () => {
    const rows = [row(80, 7000, 'Booking Commission (Main)', 1)];
    expect(resolvePenaltyAmount({ commissionRows: rows, refundRows: [refundOf(81, 80)] }))
      .toEqual({ ok: false, reason: 'LEDGER_ANOMALY' });
  });
});
```

- [x] **Step 2: Chạy test → FAIL** (`npm test -- penalty-amount`)

- [x] **Step 3: Implement**

```ts
const WALLET_SUFFIX = / \((?:Main|Deposit)\)$/;
export const stripWalletSuffix = (d: string) => d.replace(WALLET_SUFFIX, '');

export function parseCommissionTotal(description: string): number | null {
  const groups = stripWalletSuffix(description).match(/\((\d+)\)/g);
  if (!groups?.length) return null;
  return Number(groups[groups.length - 1].slice(1, -1));
}

export function resolvePenaltyAmount({ commissionRows, refundRows }): ResolveResult {
  if (!commissionRows.length) return { ok: false, reason: 'NO_COMMISSION' };
  // N đọc TỪ DÒNG ID LỚN NHẤT — tỉ lệ commission đổi được giữa 2 vòng nhận–huỷ.
  const n = parseCommissionTotal(commissionRows[0].description);
  if (n === null) return { ok: false, reason: 'LEDGER_ANOMALY' };

  // Thử 1 dòng, rồi 2 dòng khác ví. Một lần trừ sinh tối đa 1 Main + 1 Deposit.
  let picked: CommissionRow[] | null = null;
  if (commissionRows[0].amount === n) picked = [commissionRows[0]];
  else if (
    commissionRows.length >= 2 &&
    commissionRows[0].sourceWalletId !== commissionRows[1].sourceWalletId &&
    commissionRows[0].amount + commissionRows[1].amount === n
  ) picked = [commissionRows[0], commissionRows[1]];
  if (!picked) return { ok: false, reason: 'LEDGER_ANOMALY' };

  const reversed = new Set<number>();
  for (const r of refundRows) {
    const m = /reverse #(\d+)/.exec(r.description || '');
    if (m) reversed.add(Number(m[1]));
  }
  if (!picked.every((p) => reversed.has(p.id))) return { ok: false, reason: 'NOT_REFUNDED' };

  return { ok: true, amount: n, ledgerIds: picked.map((p) => p.id) };
}
```

- [x] **Step 4: Chạy test → PASS**
- [x] **Step 5: Commit** `feat(driver-penalty): util giải số tiền phạt từ ledger + test`

---

## Task 3 — Service: preview / create / reverse

**Files:**
- Create: `src/driver-penalty/driver-penalty.service.ts`
- Test: `src/driver-penalty/driver-penalty.service.spec.ts`

**Interfaces — Consumes:** `resolvePenaltyAmount` (Task 2), `DriverPenalty` (Task 1),
`WalletService.deductDriverWallet` / `.refundDriverCommission`.

**Interfaces — Produces:**
```ts
type Actor = { userId: string; functions: Set<string> };
preview(bookingId: string, actor: Actor): Promise<{
  amount: number; willOweDeposit: number; blockedReason: string | null;
}>
create(dto: { bookingId; reasonCode; note?; source }, actor: Actor): Promise<DriverPenalty>
reverse(id: string, note: string | undefined, actor: Actor): Promise<DriverPenalty>
```

**Logic bắt buộc (spec §4):**

1. `assertScope(bookingId, actor)` — actor không có `driver-penalties` thì `bookingId` phải nằm
   trong `leakage_trace` (nếu có `leakage-review`) hoặc là chuyến huỷ có tài xế (nếu có
   `driver-cancel-review`). Áp cho **cả `preview` lẫn `create`**.
2. `loadPenalizable(bookingId, manager?)` → trả `{ booking, driver, amount, ledgerIds }` hoặc
   `blockedReason` theo bảng §4.7:
   - status ≠ CANCELLED → `NOT_CANCELLED`
   - `completedAt IS NOT NULL` **HOẶC** tồn tại ledger cùng `referenceId = bookingId` với
     `description LIKE 'Booking Earnings%' OR LIKE 'Giữ hộ thuế:%'` → `WAS_COMPLETED`
   - đã có penalty ACTIVE → `ALREADY_PENALIZED`
   - `resolvePenaltyAmount` fail → map `NO_COMMISSION` / `NOT_REFUNDED` / `LEDGER_ANOMALY`
3. `create` chạy **1 transaction**:
   - `manager.findOne(Booking, { where: { id }, lock: { mode: 'pessimistic_write' } })` rồi
     **kiểm lại `status === CANCELLED`** trong txn.
   - `loadPenalizable` lại **bên trong** txn.
   - `save(DriverPenalty)` trước để có `id`.
   - `deductDriverWallet(driverUserId, amount, 'penalty:'+id, desc, true, manager,
     { strategy: 'MAIN_FIRST', deferNotify: true })`.
   - cập nhật `fromMain`/`fromDeposit` từ kết quả, `save` lại.
   - **Sau commit**: bắn `__notify` + `usersService.sendPushToUser(driverUserId, 'Bạn bị phạt vi
     phạm', body, { type: 'DRIVER_PENALTY', bookingId, penaltyId }, 'system', DeviceApp.DRIVER)`.
4. `reverse`: khoá hàng `driver_penalty` (`pessimistic_write`), chặn nếu đã `REVERSED`,
   `refundDriverCommission(driverUserId, 'penalty:'+id, desc, manager, { deferNotify: true })`,
   set `REVERSED` + `reversedBy/At/Note`. Sau commit bắn `wallet.refunded` + push.

- [x] **Step 1: Viết test TRƯỚC** — mock `WalletService`, `Repository`, `DataSource.transaction`
      chạy callback với manager giả. Ca bắt buộc:
      `NOT_CANCELLED` · `WAS_COMPLETED` (cả 2 dấu hiệu, kể cả `completedAt = null` + dấu vết ledger)
      · `ALREADY_PENALIZED` · `NO_COMMISSION` · `NOT_REFUNDED` · phạt thành công gọi
      `deductDriverWallet` đúng tham số (`referenceId = 'penalty:<id>'`, `allowNegative = true`,
      `strategy: 'MAIN_FIRST'`, `deferNotify: true`) · rollback thì **không** bắn socket ·
      `reverse` gọi `refundDriverCommission` với `'penalty:<id>'` và chặn reverse lần 2 ·
      `assertScope` ném 403 cho actor chỉ có `leakage-review` với booking không có trace.
- [x] **Step 2: Chạy test → FAIL**
- [x] **Step 3: Implement service**
- [x] **Step 4: Chạy test → PASS** (`npm test -- driver-penalty`)
- [x] **Step 5: Commit** `feat(driver-penalty): service phạt/huỷ phạt + test`

---

## Task 4 — Queue + list (truy vấn đọc)

**Files:**
- Modify: `src/driver-penalty/driver-penalty.service.ts`
- Test: `src/driver-penalty/driver-penalty.service.spec.ts`

**Produces:**
```ts
queue(q: { from: string; to: string; flag?: 'all'|'leakage'|'cancelAlert'|'unpenalized'|'penalized';
           q?: string; page?: number; limit?: number }): Promise<{ data: QueueRow[]; meta }>
list(q: { from; to; status?; reasonCode?; q?; page?; limit? }):
  Promise<{ data: PenaltyRow[]; meta; totals: { count: number; amount: number } }>
```

**Bắt buộc (spec §5):**
- Lọc: `status = CANCELLED AND driverId IS NOT NULL AND completedAt IS NULL`, `cancelledAt` trong
  khoảng VN (`+07:00`).
- **Không JOIN thẳng** `cancel_enforcement_alert` (nhiều alert/booking → nhân dòng): gom bằng
  subquery `DISTINCT ON (bookingId)` hoặc aggregate, giữ cờ `shadow`.
- Cột "Thu được": **một truy vấn ledger theo lô** cho tập `bookingId` của trang, không N+1.

- [x] **Step 1: Test** — 1 booking có 3 alert → `queue` trả **đúng 1 dòng**; `meta.total` không bị thổi.
- [x] **Step 2: FAIL** → **Step 3: Implement** → **Step 4: PASS**
- [x] **Step 5: Commit** `feat(driver-penalty): hàng đợi soát + lịch sử phạt`

---

## Task 5 — Controller + module + RBAC

**Files:**
- Create: `src/driver-penalty/driver-penalty-admin.controller.ts`, `dto/driver-penalty.dto.ts`,
  `driver-penalty.module.ts`
- Modify: `src/rbac/rbac.constants.ts`, `src/app.module.ts`

**Routes (spec §6)** — guard chain ở **mức class** (`JwtAuthGuard, RolesGuard, FunctionAccessGuard`
+ `@Roles(ADMIN)`) để `route-coverage.spec` tự phủ; route nào cần any-of thì đặt
`@RequireFunction(...)` ở **mức method** (override class).

```
GET  /admin/driver-penalties/queue     @RequireFunction('driver-penalties')
GET  /admin/driver-penalties/preview   @RequireFunction('driver-penalties','driver-cancel-review','leakage-review')
POST /admin/driver-penalties           @RequireFunction('driver-penalties','driver-cancel-review','leakage-review')
GET  /admin/driver-penalties           @RequireFunction('driver-penalties')
POST /admin/driver-penalties/:id/reverse @RequireFunction('driver-penalties')
```
⚠️ Khai `queue` và `preview` **TRƯỚC** `:id` (Nest khớp theo thứ tự).

- [x] **Step 1:** Thêm `'driver-penalties'` vào `MENU_FUNCTIONS`.
- [x] **Step 2:** Viết DTO (`class-validator`: `bookingId` UUID, `reasonCode` enum, `note` optional
      string ≤ 500, **bắt buộc note khi `reasonCode = OTHER`**).
- [x] **Step 3:** Viết controller + module, đăng ký ở `app.module.ts`.
- [x] **Step 4:** Thêm assert vào `src/rbac/route-coverage.spec.ts`: mọi key trong
      `@RequireFunction` phải thuộc `ALL_FUNCTION_KEYS` (spec §7.4 — gõ sai key hiện đang pass hết test).
- [x] **Step 5:** `npm test` + `npx tsc --noEmit` → sạch.
- [x] **Step 6: Commit** `feat(driver-penalty): controller + RBAC driver-penalties`

---

## Task 6 — Guard: không rời `CANCELLED` khi có phạt ACTIVE

**Files:**
- Modify: `src/booking/booking.service.ts` (`adminUpdateStatus`, ~`:3881`)
- Modify: `src/booking/booking.module.ts`
- Test: `src/booking/booking.service.penalty-guard.spec.ts`

**Cách đấu dây (spec §4.6):** `TypeOrmModule.forFeature([DriverPenalty])` trong `BookingModule` +
inject `Repository<DriverPenalty>`. **KHÔNG** inject `DriverPenaltyService` (circular dep).

- [x] **Step 1: Test** — booking `CANCELLED` có `driver_penalty` ACTIVE, gọi
      `adminUpdateStatus(id, ACCEPTED)` → ném `BadRequestException` với thông điệp
      *"Chuyến đang có vụ phạt còn hiệu lực — huỷ phạt trước khi đổi trạng thái."*;
      không có phạt ACTIVE → đổi bình thường.
- [x] **Step 2: FAIL** → **Step 3: Implement** → **Step 4: PASS**
- [x] **Step 5: Commit** `feat(driver-penalty): chặn lật trạng thái chuyến đang bị phạt`

---

## Task 7 — Báo cáo cashflow tách nhóm `penalty`

**Files:**
- Modify: `src/finance/finance.service.ts` (`cashflowCategories()`, `:613`)
- Test: `src/finance/finance.service.cashflow-penalty.spec.ts`

- [x] **Step 1: Test** — `cashflowCategories()` có key `penalty`, và nó đứng **trước** `refund`
      lẫn `commission` trong mảng (thứ tự quyết định nhánh CASE nào thắng).
- [x] **Step 2: FAIL**
- [x] **Step 3: Implement** — chèn ngay trước `refund`:
      `{ key: 'penalty', cond: `l."referenceId" LIKE 'penalty:%'` }`
- [x] **Step 4: PASS** → **Step 5: Commit** `feat(driver-penalty): tách nhóm penalty ở driver-cashflow`

---

## Task 8 — Kiểm tĩnh + test toàn backend

- [x] `npx tsc --noEmit` → 0 lỗi
- [x] `npm test` → xanh
- [x] Commit nếu có sửa vặt.

---

## Task 9 — Admin: api client + RBAC + menu

**Files:** `src/lib/api.ts`, `src/lib/rbac.ts`, `src/lib/nav-items.tsx`

**Produces:**
```ts
export type PenaltyReasonCode = 'OFF_PLATFORM'|'NO_SHOW'|'FORCED_CANCEL'|'FAKE_TRIP'|'OTHER';
export type PenaltyStatus = 'ACTIVE'|'REVERSED';
export type PenaltySource = 'PENALTY_PAGE'|'CANCEL_REVIEW'|'LEAKAGE_REVIEW';
export type PenaltyPreview = { amount: number; willOweDeposit: number; blockedReason: string|null };
export type PenaltyQueueRow = {
  bookingId: string; bookingCode: string | null; cancelledAt: string | null;
  pickupAddress: string | null; dropoffAddress: string | null;
  driverEntityId: string; driverName: string | null; driverPhone: string | null;
  cancelledByRole: string | null; cancelReason: string | null;
  leakageVerdict: string | null; leakageConfidence: 'HIGH'|'LOW'|null;
  cancelAlertRule: string | null; cancelAlertShadow: boolean | null;
  collectibleAmount: number; penaltyStatus: PenaltyStatus | null;
};
export type PenaltyRow = { id, bookingId, bookingCode, driverEntityId, driverName, driverPhone,
  amount, fromMain, fromDeposit, reasonCode, note, source, status,
  createdByName, createdAt, reversedByName, reversedAt, reverseNote };

getPenaltyQueue(p): Promise<{ data: PenaltyQueueRow[]; meta: {…} }>
previewPenalty(bookingId: string): Promise<PenaltyPreview>
createPenalty(b: { bookingId; reasonCode; note?; source }): Promise<PenaltyRow>
listPenalties(p): Promise<{ data: PenaltyRow[]; meta; totals: { count: number; amount: number } }>
reversePenalty(id: string, note?: string): Promise<void>
```

- [x] **Step 1:** Viết types + 5 hàm trong `api.ts` (dùng `fetchWithAuth`, ném `Error` với
      `err.message` như `voidCompletedBooking:850` để dialog hiện được lý do chặn từ BE).
- [x] **Step 2:** `src/lib/rbac.ts` — thêm `'/driver-penalties': 'driver-penalties'`; **bump số
      chốt** trong `src/lib/rbac.test.ts` và `src/lib/function-catalog.test.ts`.
- [x] **Step 3:** `nav-items.tsx` — thêm `{ href: '/driver-penalties', label: 'Phạt vi phạm', icon: Gavel }`
      ngay **sau** `/leakage-review` (cùng cụm chống gian lận).
- [x] **Step 4:** `npx vitest run` + `npx tsc --noEmit` → sạch.
- [x] **Step 5: Commit** `feat(driver-penalty): api client + quyền + menu admin`

---

## Task 10 — Admin: nhãn + dialog phạt dùng chung

**Files:**
- Create: `src/app/(app)/driver-penalties/penalty-labels.ts` (+ `.test.ts`)
- Create: `src/app/(app)/driver-penalties/components/penalty-dialog.tsx` (+ `.test.tsx`)

**Produces:**
```ts
export const REASON_LABEL: Record<PenaltyReasonCode, string>;
export const BLOCKED_MESSAGE: Record<string, string>; // mã chặn từ BE → câu tiếng Việt
export function penaltyStatusBadge(s: PenaltyStatus | null): { label: string; className: string };

export function PenaltyDialog(props: {
  bookingId: string | null; open: boolean;
  source: PenaltySource;
  onOpenChange: (o: boolean) => void; onDone?: () => void;
}): JSX.Element;
```

Hành vi dialog (spec §7.2): mở → gọi `previewPenalty`; `blockedReason` ≠ null ⇒ hiện đúng câu
tiếng Việt + **disable nút**; `willOweDeposit > 0` ⇒ cảnh báo đỏ; lý do **bắt buộc**;
`reasonCode = OTHER` ⇒ ghi chú bắt buộc; số tiền là **chữ, không phải input**.

- [x] **Step 1: Test trước** (`penalty-dialog.test.tsx`, mock `@/lib/api`):
      preview trả `blockedReason: 'NO_COMMISSION'` → nút disable + hiện "Chuyến này chưa từng thu
      hoa hồng…"; `willOweDeposit = 50000` → hiện cảnh báo âm ví; chưa chọn lý do → nút disable;
      chọn `OTHER` mà bỏ trống ghi chú → nút disable; bấm xác nhận → gọi `createPenalty` đúng body.
- [x] **Step 2: FAIL** → **Step 3: Implement** → **Step 4: PASS**
- [x] **Step 5: Commit** `feat(driver-penalty): dialog phạt dùng chung + nhãn`

---

## Task 11 — Admin: trang `/driver-penalties`

**Files:** Create `src/app/(app)/driver-penalties/page.tsx`

Bám khuôn `/driver-cancel-review/page.tsx`: `PageHeader` + `FinanceFilter` (`PRESETS`, mặc định
`last30`, **key-coupled** không index-coupled) + `Tabs` + `Table` + phân trang.

- Tab **Cần xử lý**: cột theo spec §7.1; nút *Phạt* mở `PenaltyDialog` với `source='PENALTY_PAGE'`;
  `collectibleAmount === 0` ⇒ disable.
- Tab **Lịch sử phạt**: cột theo spec §7.1; nút *Huỷ phạt* (confirm) gọi `reversePenalty`;
  dòng tổng số vụ + tổng tiền.

- [x] **Step 1:** Viết trang. **Step 2:** `npx tsc --noEmit` + `npx vitest run`.
- [x] **Step 3: Commit** `feat(driver-penalty): trang /driver-penalties`

---

## Task 12 — Admin: nhúng nút phạt + nhãn cashflow

**Files:**
- Modify: `src/app/(app)/driver-cancel-review/components/driver-detail-dialog.tsx` (mục
  "Danh sách chuyến huỷ", `:311-330`)
- Modify: `src/app/(app)/leakage-review/components/trace-detail-dialog.tsx`
- Modify: `src/app/(app)/driver-cashflow/page.tsx` (`CATEGORIES`, `:23`)

- [x] **Step 1:** Thêm nút *Phạt* mỗi dòng chuyến huỷ → `PenaltyDialog` `source='CANCEL_REVIEW'`;
      xong thì refetch danh sách.
- [x] **Step 2:** Thêm nút *Phạt tài xế* ở trace detail → `source='LEAKAGE_REVIEW'`.
      ⚠️ Dialog lồng dialog: mở `PenaltyDialog` **thay vì** chồng lên (theo ghi chú
      `driver-detail-dialog.tsx:67` về 2 modal chồng nhau).
- [x] **Step 3:** `CATEGORIES` thêm `{ key: 'penalty', label: 'Phạt vi phạm' }`.
- [x] **Step 4:** `npx tsc --noEmit` + `npx vitest run` → sạch.
- [x] **Step 5: Commit** `feat(driver-penalty): nút phạt ở 2 màn soát + nhãn cashflow`

---

## Task 13 — Self-review + review độc lập

- [x] Đọc lại **toàn bộ diff** 2 repo: từng site đã đổi, altitude, edge case.
- [x] `npx tsc --noEmit` + `npm test` (BE); `npx tsc --noEmit` + `npx vitest run` (FE).
- [x] Dispatch sub-agent review độc lập (fresh-context, model mạnh, ghi report ra scratchpad).
- [ ] Sửa theo review; ghi lại các điểm cần chủ dự án quyết (nếu có) để hỏi sáng hôm sau.
- [ ] Push 2 nhánh. **KHÔNG** merge vào `dev`/`main` khi chưa test DEV + chưa có người duyệt.

---

## Kiểm tương thích ngược (CLAUDE.md §4) — chạy trước khi push

- [x] Không xoá/đổi tên field response nào đang có.
- [x] Không thêm giá trị `LedgerType`.
- [x] Không đổi shape/required của request cũ.
- [x] App tài xế không cần release: `referenceId = 'penalty:<uuid>'` không crash
      (`earnings_history.dart` whitelist type + regex UUID → `canOpen = false`).
