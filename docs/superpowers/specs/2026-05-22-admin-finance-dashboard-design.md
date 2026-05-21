# Admin Finance Dashboard — Design Spec

**Date:** 2026-05-22
**Status:** Approved (pending implementation plan)
**Scope:** New `/finance` page in the admin app with system-wide cash flow visibility (in/out, by category, trend over time) plus Top-N rankings of transport companies, drivers, and affiliates.

## Goal

Give admins a single screen to answer: how much money moved through Vigo's wallets in a chosen period, how it broke down (operational revenue, HTX share, driver earnings, affiliate payouts, refunds), how it trended over time, and which entities contributed most.

V1 is focused on **dòng tiền** (cash flow). Per-entity drill-downs already exist (`/transport-companies/:id`, `/drivers`, `/referrals`); this dashboard links to them but does not replace them.

## Out of scope

- Affiliate signup bonus (one-off at registration, not booking-linked) — defer
- Editable manual adjustments (write operations on the ledger) — view-only
- Multi-currency — VND only
- Export to CSV/Excel — defer
- Per-entity drill-down pages (already exist; we just link)

## Backend changes

### New module: `vigo-backend/src/finance/`

```
finance/
├── finance.module.ts
├── finance.controller.ts
├── finance.service.ts
└── dto/
    └── finance-dashboard.dto.ts
```

Wire into `app.module.ts` imports.

### Endpoint

```
GET /admin/finance/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Guarded by `JwtAuthGuard` + `@Roles(UserRole.ADMIN)`. Both date params required.

**Validation:**
- `from > to` → 400 "Khoảng thời gian không hợp lệ"
- `(to - from) > 365 days` → 400 "Khoảng thời gian tối đa 365 ngày"
- Range interpreted in VN timezone (+07:00). Service converts `from` → `from 00:00:00 +07:00` and `to` → `to 23:59:59.999 +07:00`, then to UTC instants, before querying TIMESTAMP columns.

### Response shape

```ts
type FinanceDashboardResponse = {
  range: { from: string; to: string };
  cashFlow: {
    totalIn: number;                  // sum of money entering SYSTEM_* wallets
    totalOut: number;                 // sum of money leaving SYSTEM_* wallets
    net: number;                      // totalIn - totalOut
    operationalRevenue: number;       // commission + fees landing in SYSTEM_REVENUE
  };
  breakdown: {
    htxNetIncome: number;             // sum across all transport companies
    driverNetEarnings: number;        // sum of buildDriverEarnings().netEarnings
    affiliateCredited: number;        // sum of ReferralEvent.amount (TRIP type)
    customerRefund: number;           // sum of REFUND transactions
  };
  trend: Array<{
    date: string;                     // YYYY-MM-DD if range ≤ 31d, else YYYY-MM
    in: number;
    out: number;
  }>;
  topHtx: Array<{
    id: string;
    name: string;
    bookingCount: number;             // COMPLETED in range
    grossRevenue: number;             // sum booking.price
    commissionAmount: number;
    netIncome: number;
  }>;
  topDrivers: Array<{
    id: string;                       // driverId
    fullName: string;
    phone: string;
    bookingCount: number;
    netEarnings: number;
  }>;
  topAffiliates: Array<{
    id: string;                       // referrerId (userId)
    fullName: string;
    phone: string;
    tripCount: number;
    totalCredited: number;
  }>;
};
```

Top arrays: limit 10, sorted DESC by the primary metric (`netIncome` / `netEarnings` / `totalCredited`).

### Aggregation sources

| Field | Query |
|---|---|
| `cashFlow.totalIn` | `SUM(Transaction.amount)` where wallet is `SYSTEM_*` AND `type IN (DEPOSIT, COMMISSION, FEE)` AND `status = SUCCESS` AND `createdAt` in range |
| `cashFlow.totalOut` | Same wallet predicate, `type IN (WITHDRAW, REFUND, PAYMENT)` outgoing |
| `cashFlow.net` | `totalIn - totalOut` (computed in service) |
| `cashFlow.operationalRevenue` | `SUM(amount)` where wallet is `SYSTEM_REVENUE` AND positive amount in range |
| `breakdown.htxNetIncome` | For each transport company with ≥ 1 COMPLETED booking in range, compute the same `netIncome` formula the HTX dashboard returns per company (gross − commission − vatAmount). SUM across all companies. Implementer should locate the existing helper in `src/htx/*.service.ts` and call it per company (or factor a shared helper if it's currently inline). |
| `breakdown.driverNetEarnings` | For each COMPLETED booking in range: `buildDriverEarnings(booking.price, rate, vatRate, pitRate).netEarnings`. SUM. Rates resolved per booking (Vi-now vs standard) |
| `breakdown.affiliateCredited` | `SUM(ReferralEvent.amount)` where `type = TRIP` AND `createdAt` in range |
| `breakdown.customerRefund` | `SUM(Transaction.amount)` where `type = REFUND` AND `status = SUCCESS` AND `createdAt` in range |
| `trend[]` | `Transaction` grouped by `DATE(createdAt)` (or `DATE_TRUNC('month', createdAt)` if range > 31d), pivoted to `in`/`out` columns |
| `topHtx` | JOIN `booking → driver → transportCompany`, GROUP BY `tc.id`, `WHERE booking.status = COMPLETED AND completedAt in range`, ORDER BY commission DESC LIMIT 10 |
| `topDrivers` | JOIN `booking → driver → driver.user`, GROUP BY `driver.id`, COMPLETED in range, ORDER BY `netEarnings` DESC LIMIT 10 |
| `topAffiliates` | JOIN `ReferralEvent → user (referrer)`, GROUP BY `referrerId`, `type = TRIP` in range, ORDER BY `SUM(amount)` DESC LIMIT 10 |

All aggregations realtime — no pre-computed snapshots in v1.

### Performance budget

Single endpoint may run 8–10 queries. Range up to 365 days is supported but expected typical range is ≤ 31 days. If p95 exceeds 2s in practice, the follow-up is daily snapshot tables, not v1 scope.

## Frontend changes

### New route: `/finance`

Files:

```
src/app/(app)/finance/
├── page.tsx
└── components/
    ├── finance-filter.tsx
    ├── finance-stat-cards.tsx
    ├── finance-trend-chart.tsx
    └── finance-top-tables.tsx
```

Plus:
- `src/lib/api.ts` — add `getFinanceDashboard(from, to)` + response types
- Sidebar nav config — add "Tài chính" menu item with `Wallet` icon

### Layout

```
┌─ /finance ────────────────────────────────────────────────┐
│ [Filter bar]                                              │
│ Hôm nay | 7 ngày | Tháng này | 30 ngày | Tháng trước |   │
│ Năm nay |  [Custom from] → [to]                           │
├───────────────────────────────────────────────────────────┤
│ [Stat cards — 4 cols x 2 rows]                            │
│ │Tổng vào│ │Tổng ra│ │Net │ │DT Vigo │                    │
│ │Tiền HTX│ │Tài xế │ │Aff │ │Refund │                     │
├───────────────────────────────────────────────────────────┤
│ [Trend chart — line, full width]                          │
│ Tổng vào vs Tổng ra theo ngày/tháng                       │
├───────────────────────────────────────────────────────────┤
│ [Top tables — 3 cols on lg, stacked on sm]                │
│ │ Top 10 HTX │ │ Top 10 Drivers │ │ Top 10 Affiliates │   │
└───────────────────────────────────────────────────────────┘
```

### Component responsibilities

- **`page.tsx`** — owns state (`from`, `to`, response, loading, error), single `useEffect` reload on filter change, passes data down to children.
- **`finance-filter.tsx`** — preset buttons + date range picker. Emits `onChange({from, to})`. No state of its own beyond local typing UX.
- **`finance-stat-cards.tsx`** — pure presentation, 8 cards in CSS grid. Reuses currency formatter. Handles `null`/`0` gracefully.
- **`finance-trend-chart.tsx`** — recharts line chart (project already uses recharts). 2 series: `in`, `out`. X-axis: date.
- **`finance-top-tables.tsx`** — 3 sub-tables in a responsive grid. Each row links to the existing per-entity page (`/transport-companies/:id`, `/drivers?driverId=...`, `/referrals?referrerId=...`).

### Loading/empty states

- Initial load: skeleton cards (use existing `Skeleton` component or muted card with `Loader2`).
- Filter change while data loaded: spinner overlay; keep previous data visible to avoid flash.
- API error: destructive toast, retain previous data, don't blank the page.
- Empty top tables: row "Chưa có dữ liệu trong khoảng này".

## Edge cases

| Case | Behavior |
|---|---|
| `from > to` | Backend 400, frontend toasts the message |
| Range > 365 days | Backend 400 |
| 0 data in range | All numbers display `0₫`, top tables show empty placeholder |
| Trend bucketing | ≤ 31 days inclusive → daily (`YYYY-MM-DD`), > 31 days → monthly (`YYYY-MM`). Backend decides; frontend renders the `date` field as-is |
| Legacy bookings with `priceBreakdown = null` | Counted in HTX/driver totals using `booking.price` as gross |
| Affiliate signup bonus | Excluded from v1 (only `ReferralEvent.type = TRIP`) |
| Cancelled bookings | Excluded from HTX/driver totals (only `status = COMPLETED`). Their commission refunds, if any, appear in `customerRefund` |
| Currency | VND only |
| Timezone | Range interpreted in VN time (+07:00); backend converts to UTC for storage queries |
| Permission | `ADMIN` only via existing role guard |

## Testing

**Manual verification:**

1. **Happy path:** open `/finance`, default to "Hôm nay". Verify cards populate, trend chart renders 1 point or empty, top tables list ≤ 10 entries.
2. **Range switches:** change preset to "Tháng này" → cards re-fetch and update. Verify net = totalIn − totalOut.
3. **Custom range:** pick custom from/to → re-fetch with the chosen dates.
4. **Empty range:** pick a future date or pre-launch date → all zeros, top tables show empty placeholder, no console errors.
5. **Invalid range:** flip from/to so from > to → toast surfaces backend's 400 message.
6. **Top tables links:** click a row in each table → navigates to the existing per-entity page with proper filter.
7. **Numeric sanity:** spot-check one COMPLETED booking — its driver's `netEarnings` should equal `buildDriverEarnings(price)` math, and the booking should be in the driver's `bookingCount`.
8. **Permission:** non-admin user gets 403 from the endpoint.

**No automated tests in v1** — aggregations are derived from existing trusted helpers (`buildDriverEarnings`, HTX `netIncome`), and the rest is presentation. If a future commit adds non-trivial logic to the service (e.g., snapshot tables, custom revenue recognition rules), write tests then.

## Files touched

| File | Change | Repo |
|---|---|---|
| `src/finance/finance.module.ts` | New | backend |
| `src/finance/finance.controller.ts` | New | backend |
| `src/finance/finance.service.ts` | New | backend |
| `src/finance/dto/finance-dashboard.dto.ts` | New | backend |
| `src/app.module.ts` | Add `FinanceModule` import | backend |
| `src/lib/api.ts` | Add `getFinanceDashboard` + types | frontend |
| `src/app/(app)/finance/page.tsx` | New | frontend |
| `src/app/(app)/finance/components/finance-filter.tsx` | New | frontend |
| `src/app/(app)/finance/components/finance-stat-cards.tsx` | New | frontend |
| `src/app/(app)/finance/components/finance-trend-chart.tsx` | New | frontend |
| `src/app/(app)/finance/components/finance-top-tables.tsx` | New | frontend |
| `src/app/(app)/layout.tsx` (the `navItems` array around line 42) | Add `{ href: '/finance', label: 'Tài chính', icon: DollarSign }` between `/withdrawals` and `/master-data`. Import `DollarSign` from lucide-react (avoid reusing `Wallet` — already used by Withdrawals) | frontend |

No DB migrations. No new dependencies (recharts already in use for charts elsewhere — verify at implementation).
