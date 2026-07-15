# Leakage Review (admin UI) — Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
> v2 = revised after an adversarial review that found 1 blocker + 4 majors. Resolutions in §Review log.

**Goal:** Give admin a usable screen to review cancel-leakage traces (driver got the customer to cancel, then served the ride off-platform) and mark each REVIEWED / DISMISSED / CONFIRMED.

**Architecture:** `vigo-admin` (branch `feat/leakage-review`, cut from main): a `'use client'` list page modelled on `driver-cashflow`, reusing `FinanceFilter` for the VN date range. Badge/label/format logic lives in a sibling pure module that carries the unit tests; the detail sheet gets a render test with an injected callback. The backend half (branch `feat/cancel-leakage-detection`) is **already done** — see §Backend (done).

**Tech Stack:** Next.js 15 App Router + React 19 + shadcn/ui + vitest (static export).

## Global Constraints

- **Spec:** `vigo-backend/docs/superpowers/specs/2026-07-15-driver-cancel-leakage-detection-design.md` v4.1 §4.5.
- **Timezone:** all admin-facing dates **VN / UTC+7**. Reuse `FinanceFilter`/`PRESETS`/`DateRange` from `../finance/components/finance-filter` (`todayVn` etc. are module-private — reach them via `PRESETS[i].range()`). Format with `Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', … })` — **`hour: '2-digit'` is required**, `'numeric'` renders `9:00` not `09:00`.
- **Static export** → page MUST be `'use client'`; no server fetching.
- **API client:** add functions **inside** `src/lib/api.ts`, reusing the private `fetchWithAuth` + `unwrap` (a hoisted `async function`, callable before its definition). Do NOT write a new wrapper.
- **Types:** `src/lib/types.ts` uses **string-literal unions, never TS `enum`**.
- **UI copy Vietnamese.** Badges need paired `dark:` variants.
- **tsc gate — `feat/leakage-review` has a RED BASELINE of 6 pre-existing errors** (3× `notifications-manager.tsx:403-405` TS2339, 3× `components/ui/calendar.tsx:57-60` TS2353/TS7031). The gate is **"no NEW errors — still exactly these 6"**, NOT "clean". Do not fix them (out of scope).
- **Test gate:** `npx vitest run` green. **Never `npm run build`** (deploys to prod S3) — `npx next build` for a smoke check only, and note `next.config.ts` ignores build/type errors so a green build proves nothing.
- **Test convention:** pure logic → sibling module + unit test; colocate `*.test.ts(x)`. Never name a file `*.node.test.ts` (second runner). `@testing-library/react` + jsdom ARE available (4 render tests exist, e.g. `htx-recon-table.test.tsx`).
- **No pagination in v1** — ~5 customer-cancels/day, only a fraction become traces; endpoint caps at 500. **But surface the cap** (m12).

---

## Backend (done — for context, do not redo)

Branch `feat/cancel-leakage-detection`, committed:
- `GET /admin/leakage-traces` returns **enriched `TraceRow[]`** (batch-loaded driver/customer/booking, no N+1) — `leakage-trace-rows.util.ts` (+5 unit tests).
- **`eventAt`** (the customer's cancel = when the incident happened) is denormalized onto `leakage_trace`, indexed, and the list **filters/sorts by it**, not `createdAt` (which is window-close: cancel +3h for IMMEDIATE, days later for SCHEDULED_DEFERRED).
- **Evidence now carries coords**: `evidence.pickupHit` / `evidence.dropoffHit` = `{ts, lat, lng, distanceM, servingAtHit, maxSampleAgeSec}`, captured at the hit tick.
- `PATCH /admin/leakage-traces/:id` `{status}`. Both `@Roles(ADMIN)`-guarded.

---

## Task 1: Types + api client

**Files:** Modify `src/lib/types.ts`, `src/lib/api.ts`

**Interfaces — Produces (types.ts, string-literal unions; values mirror the backend enums exactly):**
```ts
export type LeakageVerdict = 'PICKUP_DROPOFF_UNEXPLAINED' | 'PICKUP_ONLY' | 'WENT_DARK';
export type LeakageTraceStatus = 'NEW' | 'REVIEWED' | 'DISMISSED' | 'CONFIRMED';
export type LeakageHit = { ts: string; lat: number; lng: number; distanceM: number; servingAtHit: boolean; maxSampleAgeSec?: number };
export type LeakageTraceRow = {
  id: string; watchId: string; bookingId: string; driverEntityId: string; customerId: string | null;
  eventAt: string | null;   // incident (cancel) time — filter/sort key
  createdAt: string;        // detection (window close) time
  verdict: LeakageVerdict; confidence: 'HIGH' | 'LOW'; status: LeakageTraceStatus;
  evidence?: { nearPickupAt?: string | null; nearPickupServing?: boolean | null;
    nearDropoffAt?: string | null; nearDropoffServing?: boolean | null; wentDark?: boolean;
    watchType?: 'IMMEDIATE' | 'SCHEDULED_DEFERRED'; pickupHit?: LeakageHit; dropoffHit?: LeakageHit } | null;
  driver: { userId: string; fullName?: string | null; phone?: string | null } | null;
  customer: { userId: string; fullName?: string | null; phone?: string | null } | null;
  booking: { id: string; pickupAddress?: any; dropoffAddress?: any; cancelledAt?: string | null;
    cancelReason?: string | null; scheduledTime?: string | null } | null;
};
```
**Produces (api.ts):**
```ts
export async function getLeakageTraces(params: { status?: LeakageTraceStatus; verdict?: LeakageVerdict;
  confidence?: 'HIGH'|'LOW'; driverUserId?: string; from?: string; to?: string } = {}): Promise<LeakageTraceRow[]> {
  const query = new URLSearchParams({
    ...(params.status && { status: params.status }), ...(params.verdict && { verdict: params.verdict }),
    ...(params.confidence && { confidence: params.confidence }),
    ...(params.driverUserId && { driverUserId: params.driverUserId }),
    ...(params.from && { from: params.from }), ...(params.to && { to: params.to }),
  });
  const qs = query.toString();
  const response = await fetchWithAuth(`/admin/leakage-traces${qs ? `?${qs}` : ''}`);
  return unwrap<LeakageTraceRow[]>(response);   // TransformInterceptor → {success,data}; unwrap returns data
}
export async function updateLeakageTraceStatus(id: string, status: LeakageTraceStatus): Promise<void> {
  await fetchWithAuth(`/admin/leakage-traces/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
```
(PATCH matches what the backend declares, even though most admin mutations here are POST. No dual-shape hedge — the envelope is deterministic.)

- [ ] **Step 1:** add the types. **Step 2:** add the two api functions. **Step 3:** verify tsc = 6 baseline errors. **Step 4:** commit `feat(leakage): admin types + api client`.

---

## Task 2: Pure label/format module + tests

**Files:** Create `src/app/(app)/leakage-review/leakage-labels.ts` + `leakage-labels.test.ts`

**Produces:** `VERDICT_LABEL`, `STATUS_LABEL`, `verdictBadgeClass(v)`, `statusBadgeVariant(s)`, `formatVnDateTime(iso)`, `addressText(addr)`, `describeEvidence(e): string[]`.

- [ ] **Step 1: failing test**
```ts
import { describe, it, expect } from 'vitest';
import { VERDICT_LABEL, STATUS_LABEL, verdictBadgeClass, formatVnDateTime, describeEvidence, addressText } from './leakage-labels';

describe('leakage-labels', () => {
  it('labels verdicts/statuses in Vietnamese', () => {
    expect(VERDICT_LABEL.PICKUP_DROPOFF_UNEXPLAINED).toBe('Đi đón→đến, không giải thích được');
    expect(VERDICT_LABEL.WENT_DARK).toBe('Mất định vị sau khi huỷ');
    expect(STATUS_LABEL.CONFIRMED).toBe('Đã xác nhận gian lận');
  });
  it('badge colour encodes severity and always ships a dark: variant', () => {
    expect(verdictBadgeClass('PICKUP_DROPOFF_UNEXPLAINED')).toContain('dark:');
    expect(verdictBadgeClass('PICKUP_ONLY')).toContain('dark:');
    expect(verdictBadgeClass('PICKUP_DROPOFF_UNEXPLAINED')).not.toBe(verdictBadgeClass('PICKUP_ONLY'));
  });
  it('formats VN time, tolerating null', () => {
    expect(formatVnDateTime(null)).toBe('—');
    expect(formatVnDateTime('2026-07-15T02:00:00Z')).toContain('09:00'); // 02:00Z = 09:00 VN
  });
  it('describeEvidence explains the serving tags in plain Vietnamese, incl. coords', () => {
    const lines = describeEvidence({ nearPickupAt: '2026-07-15T02:00:00Z', nearPickupServing: false,
      nearDropoffAt: '2026-07-15T02:40:00Z', nearDropoffServing: false, wentDark: false,
      pickupHit: { ts: '2026-07-15T02:00:00Z', lat: 21, lng: 105.8, distanceM: 120, servingAtHit: false } });
    const all = lines.join(' | ');
    expect(all).toContain('không chở khách nào của hệ thống');
    expect(all).toContain('120m');
  });
  it('addressText falls back through shapes and never throws', () => {
    expect(addressText({ address: 'Hà Nội' })).toBe('Hà Nội');
    expect(addressText(null)).toBe('—');
  });
});
```
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (`formatVnDateTime` MUST use `hour:'2-digit', minute:'2-digit'`). **Step 4:** run → PASS. **Step 5:** commit.

---

## Task 3: `FinanceFilter` — optional `initialPreset` (additive)

**Files:** Modify `src/app/(app)/finance/components/finance-filter.tsx`

`activePreset` is hardcoded `useState('today')` (`:62`) with no prop. A page defaulting to `PRESETS[1]` (7 ngày) would load a week while the **"Hôm nay" chip renders highlighted** — the filter bar would lie. (Pre-existing; `htx-reconciliation` already hits it.)

- [ ] **Step 1:** add optional prop, default preserves today's behaviour so the 4 existing callers are untouched:
```ts
export function FinanceFilter({ value, onChange, isLoading, initialPreset = 'today' }: {
  value: DateRange; onChange: (next: DateRange) => void; isLoading?: boolean; initialPreset?: string;
}) {
  const [activePreset, setActivePreset] = React.useState<string | null>(initialPreset);
```
- [ ] **Step 2:** verify tsc = 6 baseline; `npx vitest run` green. **Step 3:** commit `fix(finance-filter): optional initialPreset so callers not defaulting to today don't mislabel`.

---

## Task 4: Detail sheet (render-tested)

**Files:** Create `src/app/(app)/leakage-review/components/trace-detail-sheet.tsx` + `trace-detail-sheet.test.tsx`

**Produces:** `<TraceDetailSheet trace={row|null} onOpenChange={fn} onUpdateStatus={(id, status) => Promise<void>} />` — the mutating UI takes an **injected** `onUpdateStatus` so it's testable without fetch mocks (mirrors `inline-price-cell.test.tsx`'s `onSave={vi.fn()}`).

Content: verdict + confidence badge, **Thời điểm huỷ** (`eventAt`) primary / **Phát hiện lúc** (`createdAt`) secondary, driver (name·phone, links `/drivers/{driverEntityId}`), customer (name·phone), pickup→dropoff text, `cancelReason`, `watchType`, `describeEvidence()` timeline, and 3 action buttons (Đã xem / Bỏ qua / Xác nhận gian lận).

- [ ] **Step 1: failing render test** — render with a HIGH trace; assert the verdict label shows, `eventAt` renders (not `createdAt`), and clicking "Xác nhận gian lận" calls `onUpdateStatus('t1','CONFIRMED')` once.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS. **Step 5:** commit.

---

## Task 5: Review page

**Files:** Create `src/app/(app)/leakage-review/page.tsx`

Model on `driver-cashflow/page.tsx`.
- [ ] **Step 1: shell + fetch** — `'use client'`; `const [range, setRange] = React.useState<DateRange>(PRESETS[1].range())` + `<FinanceFilter initialPreset="last7" …/>`; `load()` in `useCallback` (deps: range.from, range.to, status, verdict, toast) → `useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load])`; errors → `useToast({variant:'destructive'})`.
- [ ] **Step 2: filters** — `<Card className="p-4 space-y-3">` with `FinanceFilter` + `Select` for **status** and **verdict** only. **No confidence Select** — `computeVerdict` maps verdict→confidence injectively (`PICKUP_DROPOFF_UNEXPLAINED⇔HIGH`, others⇔LOW), so it's a strict coarsening of verdict (m10). Keep the api param.
- [ ] **Step 3: table** — `<Table>` in `<Card>`, `COL_COUNT`. Columns: **Thời điểm huỷ** (`eventAt`) · **Kết luận** (verdict badge, colour encodes severity — one column, not two) · **Tài xế** (name·phone; click → sets `driverUserId` filter, satisfying the spec's driver filter) · **Khách** · **Chuyến** (đón → đến) · **Trạng thái**. Row click → sheet. `whitespace-nowrap` on tight `TableHead`s; header/footer `flex-col sm:flex-row`.
- [ ] **Step 4: states** — loading spinner row / empty row ("Không có nghi vấn nào khớp bộ lọc.") inside `TableBody`; **if `rows.length === 500`, render a warning row** that the list is capped (m12). Active `driverUserId` filter shows a clearable chip.
- [ ] **Step 5: wire the sheet** — `onUpdateStatus` calls `updateLeakageTraceStatus`, then optimistic local update + toast; on failure toast + `load()`.
- [ ] **Step 6: verify** — tsc = 6 baseline; `npx vitest run` green; `npx next build` exit 0 (smoke only). **Step 7:** commit.

---

## Task 6: Nav entry

**Files:** Modify `src/app/(app)/layout.tsx`
- [ ] **Step 1:** import `ShieldAlert` from lucide + add `{ href: '/leakage-review', label: 'Nghi vấn gian lận', icon: ShieldAlert }` to `navItems`.
- [ ] **Step 2:** verify tsc = 6 baseline; check route + sidebar highlight via `npm run dev` (port 9002). **Step 3:** commit.

---

## Review log (v1 → v2)

- **B1 (BLOCKER) — evidence had no coords, and coords are unrecoverable** (Redis GEO overwritten per ping; a trace shipped without them loses them forever). **Fixed in backend** before any UI work: `pickupHit`/`dropoffHit` with `{ts,lat,lng,distanceM,servingAtHit,maxSampleAgeSec}`. The v1 self-review ticked this box without earning it.
- **M2 — `tsc clean` was an unachievable gate**: baseline is 6 pre-existing errors. Gate restated as "no new errors".
- **M3 — filtering `createdAt` answered 'when did we stop watching'**, off by +3h (IMMEDIATE) to days (DEFERRED). **Fixed in backend**: indexed `eventAt`, list filters/sorts by it; UI shows both.
- **M4 — `FinanceFilter`'s `activePreset` is hardcoded 'today'** → Task 3 adds an additive `initialPreset` prop.
- **M5 — adding repos to the controller broke all 3 existing specs** at `beforeEach`. Fixed (mocks added) in the backend commit.
- **m6** — `In([])` is safe (TypeORM → `0=1`); the short-circuit is kept as a micro-opt on `traces.length === 0`, not framed as correctness.
- **m7** — pin `hour:'2-digit'` (else `9:00` ≠ `09:00`). **m8** — render tests do exist; the sheet gets one via injected `onUpdateStatus`. **m9** — drop the dead dual-shape hedge; plain `unwrap<T>`. **m10** — one verdict column, no confidence Select. **m11** — ids kept (backend); driver-name click = the spec's driver filter. **m12** — surface the 500 cap. **m13** — Task 5 split into 7 steps.
- **Still out of scope:** pagination, map rendering, driver vehicle/plate + HTX on the row (deep-link covers it), P2/P3 phases.
