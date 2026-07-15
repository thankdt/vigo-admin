# Admin Finance Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `/finance` admin page showing system-wide cash flow (stat cards), daily/monthly trend chart, and Top-10 tables for HTX/drivers/affiliates, backed by a single `GET /admin/finance/dashboard` endpoint.

**Architecture:** Mirror the existing HTX-portal dashboard pattern but system-wide. New NestJS module `finance/` does all aggregations realtime against existing tables (Transaction, Booking, ReferralEvent) — no new schema. Frontend is a new route under `(app)/finance/` with 4 focused sub-components driven by one fetch.

**Tech Stack:** NestJS + TypeORM (backend, `vigo-backend`); Next.js + Radix UI + Tailwind + recharts (frontend, `vigo-admin`).

**Spec:** [docs/superpowers/specs/2026-05-22-admin-finance-dashboard-design.md](../specs/2026-05-22-admin-finance-dashboard-design.md)

---

## File Structure

### Backend (`vigo-backend/`)

| File | Responsibility |
|---|---|
| `src/finance/finance.module.ts` | NestJS module wiring (TypeOrmModule.forFeature, imports MasterDataModule for system config rates) |
| `src/finance/dto/finance-dashboard.dto.ts` | `FinanceDashboardQueryDto` (from/to) + response types |
| `src/finance/finance.controller.ts` | `GET /admin/finance/dashboard` with ADMIN guard |
| `src/finance/finance.service.ts` | All aggregation queries (cashFlow, breakdown, trend, top tables) |
| `src/app.module.ts` | Add `FinanceModule` to imports |

### Frontend (`vigo-admin/`)

| File | Responsibility |
|---|---|
| `src/lib/api.ts` | Add `getFinanceDashboard(from, to)` + `FinanceDashboard` type |
| `src/app/(app)/finance/page.tsx` | Page shell: state, fetch, error/loading, lays out children |
| `src/app/(app)/finance/components/finance-filter.tsx` | Preset buttons + custom date range picker, emits `(from, to)` |
| `src/app/(app)/finance/components/finance-stat-cards.tsx` | 8 stat cards in 4×2 grid (pure presentation) |
| `src/app/(app)/finance/components/finance-trend-chart.tsx` | Recharts line chart (in vs out by bucket) |
| `src/app/(app)/finance/components/finance-top-tables.tsx` | 3 Top-10 tables with drill-down links |
| `src/app/(app)/layout.tsx` | Add `{ href: '/finance', label: 'Tài chính', icon: DollarSign }` to `navItems` |

---

## Task 1: Backend module skeleton + DTOs

**Files:**
- Create: `vigo-backend/src/finance/dto/finance-dashboard.dto.ts`
- Create: `vigo-backend/src/finance/finance.controller.ts`
- Create: `vigo-backend/src/finance/finance.service.ts`
- Create: `vigo-backend/src/finance/finance.module.ts`
- Modify: `vigo-backend/src/app.module.ts`

- [ ] **Step 1: Create the DTO file**

`vigo-backend/src/finance/dto/finance-dashboard.dto.ts`:

```ts
import { IsDateString } from 'class-validator';

export class FinanceDashboardQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

export type FinanceDashboardResponse = {
  range: { from: string; to: string };
  cashFlow: {
    totalIn: number;
    totalOut: number;
    net: number;
    operationalRevenue: number;
  };
  breakdown: {
    htxNetIncome: number;
    driverNetEarnings: number;
    affiliateCredited: number;
    customerRefund: number;
  };
  trend: Array<{ date: string; in: number; out: number }>;
  topHtx: Array<{
    id: string;
    name: string;
    bookingCount: number;
    grossRevenue: number;
    commissionAmount: number;
    netIncome: number;
  }>;
  topDrivers: Array<{
    id: string;
    fullName: string;
    phone: string;
    bookingCount: number;
    netEarnings: number;
  }>;
  topAffiliates: Array<{
    id: string;
    fullName: string;
    phone: string;
    tripCount: number;
    totalCredited: number;
  }>;
};
```

- [ ] **Step 2: Create the service skeleton**

`vigo-backend/src/finance/finance.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../booking/entities/booking.entity';
import { Transaction } from '../wallet/entities/transaction.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { ReferralEvent } from '../referral/entities/referral-event.entity';
import { FinanceDashboardQueryDto, FinanceDashboardResponse } from './dto/finance-dashboard.dto';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 365;

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Transaction) private readonly txRepo: Repository<Transaction>,
    @InjectRepository(Wallet) private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(ReferralEvent) private readonly referralEventRepo: Repository<ReferralEvent>,
  ) {}

  async getDashboard(query: FinanceDashboardQueryDto): Promise<FinanceDashboardResponse> {
    const { startUtc, endUtc, daySpan } = this.resolveRange(query.from, query.to);

    return {
      range: { from: query.from, to: query.to },
      cashFlow: { totalIn: 0, totalOut: 0, net: 0, operationalRevenue: 0 },
      breakdown: { htxNetIncome: 0, driverNetEarnings: 0, affiliateCredited: 0, customerRefund: 0 },
      trend: [],
      topHtx: [],
      topDrivers: [],
      topAffiliates: [],
    };
  }

  // VN-local YYYY-MM-DD → UTC instants covering [from 00:00:00 +07, to 23:59:59.999 +07].
  private resolveRange(from: string, to: string): { startUtc: Date; endUtc: Date; daySpan: number } {
    const startUtc = new Date(`${from}T00:00:00.000+07:00`);
    const endUtc = new Date(`${to}T23:59:59.999+07:00`);
    if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime())) {
      throw new BadRequestException('Khoảng thời gian không hợp lệ');
    }
    if (startUtc > endUtc) {
      throw new BadRequestException('Khoảng thời gian không hợp lệ');
    }
    const daySpan = Math.ceil((endUtc.getTime() - startUtc.getTime()) / (24 * 60 * 60 * 1000));
    if (daySpan > MAX_RANGE_DAYS) {
      throw new BadRequestException('Khoảng thời gian tối đa 365 ngày');
    }
    return { startUtc, endUtc, daySpan };
  }
}
```

- [ ] **Step 3: Create the controller**

`vigo-backend/src/finance/finance.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/user.entity';
import { FinanceService } from './finance.service';
import { FinanceDashboardQueryDto } from './dto/finance-dashboard.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('dashboard')
  getDashboard(@Query() query: FinanceDashboardQueryDto) {
    return this.financeService.getDashboard(query);
  }
}
```

> **Note:** The implementer must verify the actual import paths for `JwtAuthGuard`, `RolesGuard`, `Roles`, and `UserRole` by grepping for them in `vigo-backend/src` — paths may differ (e.g. `'../auth/guards/jwt-auth.guard'`). Match the pattern other admin controllers in this repo use.

- [ ] **Step 4: Create the module**

`vigo-backend/src/finance/finance.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../booking/entities/booking.entity';
import { Transaction } from '../wallet/entities/transaction.entity';
import { Wallet } from '../wallet/entities/wallet.entity';
import { ReferralEvent } from '../referral/entities/referral-event.entity';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, Transaction, Wallet, ReferralEvent])],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
```

> **Note:** The implementer should verify the exact entity paths (e.g. `referral-event.entity` vs `referral.event`) by listing `vigo-backend/src/referral/entities/`. Adjust imports accordingly.

- [ ] **Step 5: Wire into app.module.ts**

Read `vigo-backend/src/app.module.ts` to find the `imports: [...]` array. Add `FinanceModule` to it (matching the import style of nearby modules like `BookingModule`, `HtxModule`).

- [ ] **Step 6: Typecheck**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend
npx tsc --noEmit 2>&1 | grep -v scripts/test-cancel
```

Expected: no output (zero errors).

- [ ] **Step 7: Smoke test with curl**

If backend isn't running locally, skip this step. Otherwise, with a valid admin JWT:

```bash
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" \
  "http://localhost:3000/admin/finance/dashboard?from=2026-05-01&to=2026-05-22" | jq '.data | {range, cashFlow, breakdown}'
```

Expected: response wraps `{ range: {from, to}, cashFlow: {0,0,0,0}, breakdown: {0,0,0,0}, trend: [], topHtx: [], topDrivers: [], topAffiliates: [] }`.

- [ ] **Step 8: Commit**

⚠️ Repo has unrelated WIP changes. Stage only the 5 new/modified files for this task:

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend
git add src/finance/finance.module.ts \
        src/finance/finance.controller.ts \
        src/finance/finance.service.ts \
        src/finance/dto/finance-dashboard.dto.ts \
        src/app.module.ts
git commit -m "$(cat <<'EOF'
feat(finance): scaffold admin finance dashboard endpoint

Module + DTO + controller + service skeleton with range validation
(VN timezone, 365-day cap). All aggregations return zero/empty —
subsequent tasks fill them in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Cash flow + breakdown aggregations

**Files:**
- Modify: `vigo-backend/src/finance/finance.service.ts`

- [ ] **Step 1: Add helper to enumerate system wallet IDs**

Inside `FinanceService`, add a private method that returns the IDs of all `SYSTEM_*` wallets. This is the set used to define "money entering/leaving the system":

```ts
  private async getSystemWalletIds(): Promise<number[]> {
    const rows = await this.walletRepo
      .createQueryBuilder('w')
      .select('w.id', 'id')
      .where('w.type IN (:...types)', {
        types: ['SYSTEM_EXTERNAL', 'SYSTEM_REVENUE', 'SYSTEM_INTERMEDIATE'],
      })
      .getRawMany();
    return rows.map((r) => Number(r.id));
  }

  private async getRevenueWalletIds(): Promise<number[]> {
    const rows = await this.walletRepo
      .createQueryBuilder('w')
      .select('w.id', 'id')
      .where('w.type = :type', { type: 'SYSTEM_REVENUE' })
      .getRawMany();
    return rows.map((r) => Number(r.id));
  }
```

- [ ] **Step 2: Implement `aggregateCashFlow`**

Add this method on the service:

```ts
  private async aggregateCashFlow(startUtc: Date, endUtc: Date) {
    const systemIds = await this.getSystemWalletIds();
    const revenueIds = await this.getRevenueWalletIds();

    if (systemIds.length === 0) {
      return { totalIn: 0, totalOut: 0, net: 0, operationalRevenue: 0 };
    }

    const inflowRow = await this.txRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'sum')
      .where('t.walletId IN (:...ids)', { ids: systemIds })
      .andWhere('t.type IN (:...types)', { types: ['DEPOSIT', 'COMMISSION', 'FEE'] })
      .andWhere('t.status = :status', { status: 'SUCCESS' })
      .andWhere('t.createdAt BETWEEN :start AND :end', { start: startUtc, end: endUtc })
      .getRawOne<{ sum: string }>();

    const outflowRow = await this.txRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'sum')
      .where('t.walletId IN (:...ids)', { ids: systemIds })
      .andWhere('t.type IN (:...types)', { types: ['WITHDRAW', 'REFUND', 'PAYMENT'] })
      .andWhere('t.status = :status', { status: 'SUCCESS' })
      .andWhere('t.createdAt BETWEEN :start AND :end', { start: startUtc, end: endUtc })
      .getRawOne<{ sum: string }>();

    const revRow = revenueIds.length === 0 ? { sum: '0' } : await this.txRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'sum')
      .where('t.walletId IN (:...ids)', { ids: revenueIds })
      .andWhere('t.amount > 0')
      .andWhere('t.status = :status', { status: 'SUCCESS' })
      .andWhere('t.createdAt BETWEEN :start AND :end', { start: startUtc, end: endUtc })
      .getRawOne<{ sum: string }>();

    const totalIn = Math.round(Number(inflowRow?.sum ?? 0));
    const totalOut = Math.round(Number(outflowRow?.sum ?? 0));
    const operationalRevenue = Math.round(Number(revRow?.sum ?? 0));

    return { totalIn, totalOut, net: totalIn - totalOut, operationalRevenue };
  }
```

- [ ] **Step 3: Implement `aggregateBreakdown`**

```ts
  private async aggregateBreakdown(startUtc: Date, endUtc: Date) {
    // HTX + driver: COMPLETED bookings in range. Reuse the same per-booking math the
    // HTX dashboard uses so totals stay consistent (htx.service.ts: getDashboard).
    const standardRate = 0.2;  // BOOKING_COMMISSION_RATE default
    const vinowRate = 0.1;     // VINOW_COMMISSION_RATE default
    const vatRate = 0.08;      // PRICING_VAT_PERCENT default (8%)
    const pitRate = 0.015;     // DRIVER_PERSONAL_INCOME_TAX_RATE default

    const bookings = await this.bookingRepo
      .createQueryBuilder('b')
      .leftJoin('b.driver', 'd')
      .select(['b.id', 'b.price', 'b.priceBreakdown', 'b.isVinow', 'd.transportCompanyId'])
      .where('b.status = :status', { status: 'COMPLETED' })
      .andWhere('b.createdAt BETWEEN :start AND :end', { start: startUtc, end: endUtc })
      .getMany();

    let htxNetIncome = 0;
    let driverNetEarnings = 0;
    for (const b of bookings) {
      const gross = Number(b.price) || 0;
      const vat = Number((b.priceBreakdown as any)?.vatAmount) || 0;
      const rate = b.isVinow ? vinowRate : standardRate;
      const commission = gross * rate;
      const commissionVat = commission * vatRate;
      const grossEarnings = gross - commission - commissionVat;
      const pit = grossEarnings * pitRate;
      driverNetEarnings += grossEarnings - pit;
      // Only credit HTX share when the driver belongs to a transport company.
      if ((b as any).driver?.transportCompanyId) {
        htxNetIncome += gross - commission - vat;
      }
    }

    const affiliateRow = await this.referralEventRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount), 0)', 'sum')
      .where('e.type = :type', { type: 'TRIP' })
      .andWhere('e.createdAt BETWEEN :start AND :end', { start: startUtc, end: endUtc })
      .getRawOne<{ sum: string }>();
    const affiliateCredited = Math.round(Number(affiliateRow?.sum ?? 0));

    const refundRow = await this.txRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'sum')
      .where('t.type = :type', { type: 'REFUND' })
      .andWhere('t.status = :status', { status: 'SUCCESS' })
      .andWhere('t.createdAt BETWEEN :start AND :end', { start: startUtc, end: endUtc })
      .getRawOne<{ sum: string }>();
    const customerRefund = Math.round(Number(refundRow?.sum ?? 0));

    return {
      htxNetIncome: Math.round(htxNetIncome),
      driverNetEarnings: Math.round(driverNetEarnings),
      affiliateCredited,
      customerRefund,
    };
  }
```

> **Note:** This task uses hardcoded fallback rates matching the defaults documented in `booking.service.ts` (`getCommissionRate`, `getVatRate`, `getPitRate`). The implementer should follow up by reading those helpers and matching the pattern. If `MasterDataService` is easily injectable here, prefer reading actual configured rates. Stop and report this as DONE_WITH_CONCERNS if injection requires significant module rewiring — fallbacks are acceptable for v1.

- [ ] **Step 4: Plumb both into `getDashboard`**

Replace the stub `getDashboard` body so it calls the two aggregators:

```ts
  async getDashboard(query: FinanceDashboardQueryDto): Promise<FinanceDashboardResponse> {
    const { startUtc, endUtc, daySpan } = this.resolveRange(query.from, query.to);

    const [cashFlow, breakdown] = await Promise.all([
      this.aggregateCashFlow(startUtc, endUtc),
      this.aggregateBreakdown(startUtc, endUtc),
    ]);

    return {
      range: { from: query.from, to: query.to },
      cashFlow,
      breakdown,
      trend: [],
      topHtx: [],
      topDrivers: [],
      topAffiliates: [],
    };
  }
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend
npx tsc --noEmit 2>&1 | grep -v scripts/test-cancel
```

Expected: zero output.

- [ ] **Step 6: Commit**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend
git add src/finance/finance.service.ts
git commit -m "$(cat <<'EOF'
feat(finance): cash flow + breakdown aggregations

aggregateCashFlow: totalIn/totalOut/net via Transaction grouped by
SYSTEM_* wallets; operationalRevenue via SYSTEM_REVENUE only.
aggregateBreakdown: htxNetIncome/driverNetEarnings via COMPLETED
bookings, affiliateCredited via ReferralEvent, customerRefund via
REFUND transactions. Rates hardcoded to documented defaults for v1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Trend chart aggregation

**Files:**
- Modify: `vigo-backend/src/finance/finance.service.ts`

- [ ] **Step 1: Add the trend aggregator**

> ⚠️ **Historical plan — the `bucket` snippet below is WRONG. Do not copy it.**
> The single `t."createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh'` shifts −7h instead of
> +7h (a 14h error): `createdAt` is `timestamp WITHOUT time zone` holding UTC bytes,
> and for that type `AT TIME ZONE` *interprets* rather than renders. The shipped code
> correctly double-converts — see `vnBucketSql` in
> `vigo-backend/src/common/vn-time.util.ts`. Kept as-is for the record.

Add this method to the service:

```ts
  private async aggregateTrend(startUtc: Date, endUtc: Date, daySpan: number) {
    const systemIds = await this.getSystemWalletIds();
    if (systemIds.length === 0) return [];

    // ≤ 31 days inclusive → daily; > 31 days → monthly. Use PostgreSQL date_trunc
    // and convert to VN-local before truncating so daily buckets line up with the
    // user-picked range.
    const bucket = daySpan <= 31
      ? `to_char((t."createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD')`
      : `to_char(date_trunc('month', t."createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM')`;

    const rows = await this.txRepo
      .createQueryBuilder('t')
      .select(bucket, 'date')
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.type IN ('DEPOSIT', 'COMMISSION', 'FEE') THEN t.amount ELSE 0 END), 0)`,
        'in_sum',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.type IN ('WITHDRAW', 'REFUND', 'PAYMENT') THEN t.amount ELSE 0 END), 0)`,
        'out_sum',
      )
      .where('t.walletId IN (:...ids)', { ids: systemIds })
      .andWhere('t.status = :status', { status: 'SUCCESS' })
      .andWhere('t.createdAt BETWEEN :start AND :end', { start: startUtc, end: endUtc })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; in_sum: string; out_sum: string }>();

    return rows.map((r) => ({
      date: r.date,
      in: Math.round(Number(r.in_sum ?? 0)),
      out: Math.round(Number(r.out_sum ?? 0)),
    }));
  }
```

- [ ] **Step 2: Plumb into `getDashboard`**

Update the call to run trend in parallel with cash flow + breakdown:

```ts
  async getDashboard(query: FinanceDashboardQueryDto): Promise<FinanceDashboardResponse> {
    const { startUtc, endUtc, daySpan } = this.resolveRange(query.from, query.to);

    const [cashFlow, breakdown, trend] = await Promise.all([
      this.aggregateCashFlow(startUtc, endUtc),
      this.aggregateBreakdown(startUtc, endUtc),
      this.aggregateTrend(startUtc, endUtc, daySpan),
    ]);

    return {
      range: { from: query.from, to: query.to },
      cashFlow,
      breakdown,
      trend,
      topHtx: [],
      topDrivers: [],
      topAffiliates: [],
    };
  }
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend
npx tsc --noEmit 2>&1 | grep -v scripts/test-cancel
```

Expected: zero output.

- [ ] **Step 4: Commit**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend
git add src/finance/finance.service.ts
git commit -m "$(cat <<'EOF'
feat(finance): daily/monthly trend bucketing for finance dashboard

aggregateTrend groups Transactions by VN-local day (range ≤ 31d) or
month (> 31d), pivoting type into in/out columns. SQL date_trunc +
to_char keeps formatting server-side so frontend just renders.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Top-10 tables

**Files:**
- Modify: `vigo-backend/src/finance/finance.service.ts`

- [ ] **Step 1: Add `aggregateTopHtx`**

```ts
  private async aggregateTopHtx(startUtc: Date, endUtc: Date) {
    const standardRate = 0.2;
    const vinowRate = 0.1;

    const rows = await this.bookingRepo
      .createQueryBuilder('b')
      .innerJoin('b.driver', 'd')
      .innerJoin('d.transportCompany', 'tc')
      .select('tc.id', 'id')
      .addSelect('tc.name', 'name')
      .addSelect('COUNT(b.id)', 'bookingCount')
      .addSelect('COALESCE(SUM(b.price), 0)', 'grossRevenue')
      .addSelect(
        `COALESCE(SUM(b.price * CASE WHEN b."isVinow" THEN ${vinowRate} ELSE ${standardRate} END), 0)`,
        'commissionAmount',
      )
      .addSelect(
        `COALESCE(SUM(COALESCE((b."priceBreakdown"->>'vatAmount')::numeric, 0)), 0)`,
        'vatAmount',
      )
      .where('b.status = :status', { status: 'COMPLETED' })
      .andWhere('b.createdAt BETWEEN :start AND :end', { start: startUtc, end: endUtc })
      .groupBy('tc.id')
      .addGroupBy('tc.name')
      .orderBy('"grossRevenue" - "commissionAmount" - "vatAmount"', 'DESC')
      .limit(10)
      .getRawMany<{
        id: string;
        name: string;
        bookingCount: string;
        grossRevenue: string;
        commissionAmount: string;
        vatAmount: string;
      }>();

    return rows.map((r) => {
      const gross = Math.round(Number(r.grossRevenue));
      const commission = Math.round(Number(r.commissionAmount));
      const vat = Math.round(Number(r.vatAmount));
      return {
        id: r.id,
        name: r.name,
        bookingCount: Number(r.bookingCount),
        grossRevenue: gross,
        commissionAmount: commission,
        netIncome: gross - commission - vat,
      };
    });
  }
```

- [ ] **Step 2: Add `aggregateTopDrivers`**

```ts
  private async aggregateTopDrivers(startUtc: Date, endUtc: Date) {
    const standardRate = 0.2;
    const vinowRate = 0.1;
    const vatRate = 0.08;
    const pitRate = 0.015;

    // Compute per-booking net earnings inline so the GROUP BY sums it directly.
    // (1 - rate) * (1 - vatRate) * (1 - pitRate) factor; isVinow toggles rate.
    const standardFactor = (1 - standardRate) * (1 - vatRate * standardRate) * (1 - pitRate);
    const vinowFactor = (1 - vinowRate) * (1 - vatRate * vinowRate) * (1 - pitRate);

    // Wait — that's wrong, commission VAT applies on the commission, not on the gross.
    // Correct factor: net = gross − commission − commissionVat − pit*(gross − commission − commissionVat)
    //                     = (gross − commission − commissionVat) * (1 − pitRate)
    //                     = (gross * (1 − rate − rate*vatRate)) * (1 − pitRate)
    //                     = gross * (1 − rate*(1 + vatRate)) * (1 − pitRate)
    const factorStd = (1 - standardRate * (1 + vatRate)) * (1 - pitRate);
    const factorVin = (1 - vinowRate * (1 + vatRate)) * (1 - pitRate);

    const rows = await this.bookingRepo
      .createQueryBuilder('b')
      .innerJoin('b.driver', 'd')
      .innerJoin('d.user', 'u')
      .select('d.id', 'id')
      .addSelect('u.fullName', 'fullName')
      .addSelect('u.phone', 'phone')
      .addSelect('COUNT(b.id)', 'bookingCount')
      .addSelect(
        `COALESCE(SUM(b.price * CASE WHEN b."isVinow" THEN ${factorVin} ELSE ${factorStd} END), 0)`,
        'netEarnings',
      )
      .where('b.status = :status', { status: 'COMPLETED' })
      .andWhere('b.createdAt BETWEEN :start AND :end', { start: startUtc, end: endUtc })
      .groupBy('d.id')
      .addGroupBy('u.fullName')
      .addGroupBy('u.phone')
      .orderBy('"netEarnings"', 'DESC')
      .limit(10)
      .getRawMany<{
        id: string;
        fullName: string;
        phone: string;
        bookingCount: string;
        netEarnings: string;
      }>();

    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName ?? '',
      phone: r.phone ?? '',
      bookingCount: Number(r.bookingCount),
      netEarnings: Math.round(Number(r.netEarnings)),
    }));
  }
```

- [ ] **Step 3: Add `aggregateTopAffiliates`**

```ts
  private async aggregateTopAffiliates(startUtc: Date, endUtc: Date) {
    const rows = await this.referralEventRepo
      .createQueryBuilder('e')
      .innerJoin('e.referral', 'r')
      .innerJoin('r.referrer', 'u')
      .select('u.id', 'id')
      .addSelect('u.fullName', 'fullName')
      .addSelect('u.phone', 'phone')
      .addSelect('COUNT(e.id)', 'tripCount')
      .addSelect('COALESCE(SUM(e.amount), 0)', 'totalCredited')
      .where('e.type = :type', { type: 'TRIP' })
      .andWhere('e.createdAt BETWEEN :start AND :end', { start: startUtc, end: endUtc })
      .groupBy('u.id')
      .addGroupBy('u.fullName')
      .addGroupBy('u.phone')
      .orderBy('"totalCredited"', 'DESC')
      .limit(10)
      .getRawMany<{
        id: string;
        fullName: string;
        phone: string;
        tripCount: string;
        totalCredited: string;
      }>();

    return rows.map((r) => ({
      id: r.id,
      fullName: r.fullName ?? '',
      phone: r.phone ?? '',
      tripCount: Number(r.tripCount),
      totalCredited: Math.round(Number(r.totalCredited)),
    }));
  }
```

> **Note:** The implementer should verify the `ReferralEvent → referral → referrer` relation names by reading `vigo-backend/src/referral/entities/`. If the relations are named differently (e.g. `referralEvent.referrer` directly), adjust the joins. If `ReferralEvent` doesn't expose a join to the referrer user, fall back to a 2-step query: SUM by `referrerId` first, then look up users by ID.

- [ ] **Step 4: Plumb all three into `getDashboard`**

```ts
  async getDashboard(query: FinanceDashboardQueryDto): Promise<FinanceDashboardResponse> {
    const { startUtc, endUtc, daySpan } = this.resolveRange(query.from, query.to);

    const [cashFlow, breakdown, trend, topHtx, topDrivers, topAffiliates] = await Promise.all([
      this.aggregateCashFlow(startUtc, endUtc),
      this.aggregateBreakdown(startUtc, endUtc),
      this.aggregateTrend(startUtc, endUtc, daySpan),
      this.aggregateTopHtx(startUtc, endUtc),
      this.aggregateTopDrivers(startUtc, endUtc),
      this.aggregateTopAffiliates(startUtc, endUtc),
    ]);

    return {
      range: { from: query.from, to: query.to },
      cashFlow,
      breakdown,
      trend,
      topHtx,
      topDrivers,
      topAffiliates,
    };
  }
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend
npx tsc --noEmit 2>&1 | grep -v scripts/test-cancel
```

Expected: zero output.

- [ ] **Step 6: Commit**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend
git add src/finance/finance.service.ts
git commit -m "$(cat <<'EOF'
feat(finance): Top-10 HTX, drivers, affiliates aggregations

Each Top-N query GROUPs by entity and sums the relevant metric:
HTX netIncome (gross − commission − vat), driver netEarnings (closed
form factor), affiliate totalCredited (sum of TRIP events). Limit 10
each, ordered by primary metric DESC.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend API client + types

**Files:**
- Modify: `vigo-admin/src/lib/api.ts`

- [ ] **Step 1: Add types and fetcher**

Open `vigo-admin/src/lib/api.ts`. Find an existing exported function near the bottom (or near the HTX section) and add the following AFTER the last existing export. The exact location doesn't matter as long as it compiles:

```ts
export type FinanceDashboard = {
  range: { from: string; to: string };
  cashFlow: {
    totalIn: number;
    totalOut: number;
    net: number;
    operationalRevenue: number;
  };
  breakdown: {
    htxNetIncome: number;
    driverNetEarnings: number;
    affiliateCredited: number;
    customerRefund: number;
  };
  trend: Array<{ date: string; in: number; out: number }>;
  topHtx: Array<{
    id: string;
    name: string;
    bookingCount: number;
    grossRevenue: number;
    commissionAmount: number;
    netIncome: number;
  }>;
  topDrivers: Array<{
    id: string;
    fullName: string;
    phone: string;
    bookingCount: number;
    netEarnings: number;
  }>;
  topAffiliates: Array<{
    id: string;
    fullName: string;
    phone: string;
    tripCount: number;
    totalCredited: number;
  }>;
};

export async function getFinanceDashboard(from: string, to: string): Promise<FinanceDashboard> {
  const qs = new URLSearchParams({ from, to });
  const response = await fetchWithAuth(`/admin/finance/dashboard?${qs.toString()}`);
  const result = await response.json();
  return result.data;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
npm run typecheck
```

Expected: only pre-existing errors in `notifications-manager.tsx` and `calendar.tsx`. Zero new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
git add src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(api): add getFinanceDashboard + FinanceDashboard type

Frontend client for GET /admin/finance/dashboard. Range required as
YYYY-MM-DD; returns cards/trend/top tables data in one shot.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend page shell + filter component

**Files:**
- Create: `vigo-admin/src/app/(app)/finance/page.tsx`
- Create: `vigo-admin/src/app/(app)/finance/components/finance-filter.tsx`

- [ ] **Step 1: Create `finance-filter.tsx`**

`vigo-admin/src/app/(app)/finance/components/finance-filter.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type DateRange = { from: string; to: string };

const todayVn = (): string => {
  const now = new Date();
  // Shift to VN time zone for the YYYY-MM-DD computation.
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
};

const daysAgoVn = (n: number): string => {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  vn.setUTCDate(vn.getUTCDate() - n);
  return vn.toISOString().slice(0, 10);
};

const firstOfMonthVn = (offsetMonths = 0): string => {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  vn.setUTCDate(1);
  vn.setUTCMonth(vn.getUTCMonth() + offsetMonths);
  return vn.toISOString().slice(0, 10);
};

const lastOfMonthVn = (offsetMonths = 0): string => {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  vn.setUTCMonth(vn.getUTCMonth() + offsetMonths + 1);
  vn.setUTCDate(0);
  return vn.toISOString().slice(0, 10);
};

const firstOfYearVn = (): string => {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${vn.getUTCFullYear()}-01-01`;
};

export const PRESETS: Array<{ key: string; label: string; range: () => DateRange }> = [
  { key: 'today', label: 'Hôm nay', range: () => ({ from: todayVn(), to: todayVn() }) },
  { key: 'last7', label: '7 ngày qua', range: () => ({ from: daysAgoVn(6), to: todayVn() }) },
  { key: 'thisMonth', label: 'Tháng này', range: () => ({ from: firstOfMonthVn(0), to: todayVn() }) },
  { key: 'last30', label: '30 ngày qua', range: () => ({ from: daysAgoVn(29), to: todayVn() }) },
  { key: 'lastMonth', label: 'Tháng trước', range: () => ({ from: firstOfMonthVn(-1), to: lastOfMonthVn(-1) }) },
  { key: 'thisYear', label: 'Năm nay', range: () => ({ from: firstOfYearVn(), to: todayVn() }) },
];

export function FinanceFilter({
  value,
  onChange,
  isLoading,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  isLoading?: boolean;
}) {
  const [activePreset, setActivePreset] = React.useState<string | null>('today');

  const applyPreset = (key: string) => {
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setActivePreset(key);
    onChange(preset.range());
  };

  const handleCustom = (key: 'from' | 'to', v: string) => {
    setActivePreset(null);
    onChange({ ...value, [key]: v });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            variant={activePreset === p.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyPreset(p.key)}
            disabled={isLoading}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Từ</Label>
          <Input
            type="date"
            value={value.from}
            onChange={(e) => handleCustom('from', e.target.value)}
            className="w-44"
            disabled={isLoading}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Đến</Label>
          <Input
            type="date"
            value={value.to}
            onChange={(e) => handleCustom('to', e.target.value)}
            className="w-44"
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `page.tsx` (minimal shell)**

`vigo-admin/src/app/(app)/finance/page.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFinanceDashboard, type FinanceDashboard } from '@/lib/api';
import { FinanceFilter, PRESETS, type DateRange } from './components/finance-filter';

export default function FinancePage() {
  const { toast } = useToast();
  const [range, setRange] = React.useState<DateRange>(PRESETS[0].range());
  const [data, setData] = React.useState<FinanceDashboard | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const load = React.useCallback(async (r: DateRange) => {
    setIsLoading(true);
    try {
      const result = await getFinanceDashboard(r.from, r.to);
      setData(result);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được dashboard', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load(range);
  }, [range, load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tài chính</h1>
        <p className="text-sm text-muted-foreground">Dòng tiền hệ thống, hạng mục thu chi và các bảng xếp hạng.</p>
      </div>

      <FinanceFilter value={range} onChange={setRange} isLoading={isLoading} />

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : data ? (
        <div className="text-sm text-muted-foreground">
          Loaded range: {data.range.from} → {data.range.to}.
          (Stat cards / chart / top tables added in subsequent tasks.)
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
npm run typecheck
```

Expected: zero new errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
git add 'src/app/(app)/finance/page.tsx' 'src/app/(app)/finance/components/finance-filter.tsx'
git commit -m "$(cat <<'EOF'
feat(finance): page shell + filter component for finance dashboard

Route /finance with preset buttons (Hôm nay / 7 ngày / Tháng này /
30 ngày / Tháng trước / Năm nay) plus custom from→to date inputs.
Page does the fetch; children consume.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend stat cards

**Files:**
- Create: `vigo-admin/src/app/(app)/finance/components/finance-stat-cards.tsx`
- Modify: `vigo-admin/src/app/(app)/finance/page.tsx`

- [ ] **Step 1: Create the stat cards component**

`vigo-admin/src/app/(app)/finance/components/finance-stat-cards.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDownCircle, ArrowUpCircle, Banknote, Building2, Car, DollarSign, RefreshCcw, Share2 } from 'lucide-react';
import type { FinanceDashboard } from '@/lib/api';

const fmtVnd = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);

type CardConfig = {
  label: string;
  value: number;
  icon: React.ReactNode;
  hint?: string;
  highlight?: boolean;
  negative?: boolean;
};

export function FinanceStatCards({ data }: { data: FinanceDashboard }) {
  const cards: CardConfig[] = [
    { label: 'Tổng vào', value: data.cashFlow.totalIn, icon: <ArrowDownCircle className="h-5 w-5" />, hint: 'Dòng tiền chảy vào hệ thống' },
    { label: 'Tổng ra', value: data.cashFlow.totalOut, icon: <ArrowUpCircle className="h-5 w-5" />, hint: 'Dòng tiền chảy ra khỏi hệ thống' },
    { label: 'Net', value: data.cashFlow.net, icon: <Banknote className="h-5 w-5" />, hint: 'Vào − Ra', highlight: true, negative: data.cashFlow.net < 0 },
    { label: 'Doanh thu Vigo', value: data.cashFlow.operationalRevenue, icon: <DollarSign className="h-5 w-5" />, hint: 'Commission + phí vào ví doanh thu' },
    { label: 'Tiền HTX', value: data.breakdown.htxNetIncome, icon: <Building2 className="h-5 w-5" />, hint: 'Tổng phần các HTX' },
    { label: 'Tiền tài xế', value: data.breakdown.driverNetEarnings, icon: <Car className="h-5 w-5" />, hint: 'Tổng thực nhận của tài xế' },
    { label: 'Affiliate đã credit', value: data.breakdown.affiliateCredited, icon: <Share2 className="h-5 w-5" />, hint: 'Trip commission cho referrer' },
    { label: 'Refund khách', value: data.breakdown.customerRefund, icon: <RefreshCcw className="h-5 w-5" />, hint: 'Tổng REFUND thành công' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label} className={c.highlight ? 'border-primary' : undefined}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            <div className={c.highlight ? 'text-primary' : 'text-muted-foreground'}>{c.icon}</div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${c.highlight ? 'text-primary' : ''} ${c.negative ? 'text-destructive' : ''}`}>
              {fmtVnd(c.value)}
            </div>
            {c.hint && <p className="text-xs text-muted-foreground mt-1">{c.hint}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `page.tsx`**

Replace the placeholder `<div className="text-sm text-muted-foreground">Loaded range...</div>` block with:

```tsx
        <>
          <FinanceStatCards data={data} />
        </>
```

And add the import at the top:

```tsx
import { FinanceStatCards } from './components/finance-stat-cards';
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
npm run typecheck
```

Expected: zero new errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
git add 'src/app/(app)/finance/page.tsx' 'src/app/(app)/finance/components/finance-stat-cards.tsx'
git commit -m "$(cat <<'EOF'
feat(finance): 8 stat cards for cash flow + breakdown

4×2 grid: Tổng vào / Tổng ra / Net / Doanh thu Vigo, Tiền HTX /
Tài xế / Affiliate / Refund. Net highlighted, turns destructive if
negative.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend trend chart

**Files:**
- Create: `vigo-admin/src/app/(app)/finance/components/finance-trend-chart.tsx`
- Modify: `vigo-admin/src/app/(app)/finance/page.tsx`

- [ ] **Step 1: Create the trend chart component**

`vigo-admin/src/app/(app)/finance/components/finance-trend-chart.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { FinanceDashboard } from '@/lib/api';

const fmtVnd = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);

const fmtCompact = (v: number) =>
  new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

export function FinanceTrendChart({ data }: { data: FinanceDashboard }) {
  if (!data.trend.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dòng tiền theo thời gian</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
            Chưa có dữ liệu trong khoảng này
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dòng tiền theo thời gian</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" fontSize={12} />
            <YAxis tickFormatter={fmtCompact} fontSize={12} width={64} />
            <Tooltip formatter={(value: number) => fmtVnd(value)} />
            <Legend />
            <Line type="monotone" dataKey="in" name="Vào" stroke="#16a34a" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="out" name="Ra" stroke="#dc2626" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into `page.tsx`**

Update the fragment so the layout is:

```tsx
        <>
          <FinanceStatCards data={data} />
          <FinanceTrendChart data={data} />
        </>
```

And add import:

```tsx
import { FinanceTrendChart } from './components/finance-trend-chart';
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
npm run typecheck
```

Expected: zero new errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
git add 'src/app/(app)/finance/page.tsx' 'src/app/(app)/finance/components/finance-trend-chart.tsx'
git commit -m "$(cat <<'EOF'
feat(finance): trend line chart (in vs out) for finance dashboard

Recharts LineChart with 2 series (Vào green, Ra red). Falls back to
'Chưa có dữ liệu' when trend is empty. Y-axis uses compact format
(eg. 1.2tr), tooltip uses full VND.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend top tables

**Files:**
- Create: `vigo-admin/src/app/(app)/finance/components/finance-top-tables.tsx`
- Modify: `vigo-admin/src/app/(app)/finance/page.tsx`

- [ ] **Step 1: Create the top tables component**

`vigo-admin/src/app/(app)/finance/components/finance-top-tables.tsx`:

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { FinanceDashboard } from '@/lib/api';

const fmtVnd = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);

export function FinanceTopTables({ data }: { data: FinanceDashboard }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 HTX</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topHtx.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có dữ liệu trong khoảng này</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HTX</TableHead>
                  <TableHead className="text-right">Chuyến</TableHead>
                  <TableHead className="text-right">Net income</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topHtx.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/transport-companies/${r.id}`} className="text-primary hover:underline">{r.name}</Link>
                    </TableCell>
                    <TableCell className="text-right">{r.bookingCount}</TableCell>
                    <TableCell className="text-right font-medium">{fmtVnd(r.netIncome)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 tài xế</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topDrivers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có dữ liệu trong khoảng này</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tài xế</TableHead>
                  <TableHead className="text-right">Chuyến</TableHead>
                  <TableHead className="text-right">Net earnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topDrivers.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/drivers?driverId=${r.id}`} className="text-primary hover:underline">
                        {r.fullName || 'N/A'}
                      </Link>
                      <div className="text-xs text-muted-foreground">{r.phone}</div>
                    </TableCell>
                    <TableCell className="text-right">{r.bookingCount}</TableCell>
                    <TableCell className="text-right font-medium">{fmtVnd(r.netEarnings)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 affiliate</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topAffiliates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Chưa có dữ liệu trong khoảng này</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Người giới thiệu</TableHead>
                  <TableHead className="text-right">Chuyến</TableHead>
                  <TableHead className="text-right">Đã credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topAffiliates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/referrals?referrerId=${r.id}`} className="text-primary hover:underline">
                        {r.fullName || 'N/A'}
                      </Link>
                      <div className="text-xs text-muted-foreground">{r.phone}</div>
                    </TableCell>
                    <TableCell className="text-right">{r.tripCount}</TableCell>
                    <TableCell className="text-right font-medium">{fmtVnd(r.totalCredited)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `page.tsx`**

Final layout in the data branch:

```tsx
        <>
          <FinanceStatCards data={data} />
          <FinanceTrendChart data={data} />
          <FinanceTopTables data={data} />
        </>
```

Add import:

```tsx
import { FinanceTopTables } from './components/finance-top-tables';
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
npm run typecheck
```

Expected: zero new errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
git add 'src/app/(app)/finance/page.tsx' 'src/app/(app)/finance/components/finance-top-tables.tsx'
git commit -m "$(cat <<'EOF'
feat(finance): Top-10 tables for HTX, drivers, affiliates

Three card-tables in a responsive grid. Each row links to the
existing per-entity page (/transport-companies/:id, /drivers?driverId,
/referrals?referrerId). Empty-state placeholder when no rows.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Sidebar nav menu item

**Files:**
- Modify: `vigo-admin/src/app/(app)/layout.tsx`

- [ ] **Step 1: Add the nav item**

Read the current `navItems` array (around line 42 of `vigo-admin/src/app/(app)/layout.tsx`). Find the entry for Withdrawals:

```ts
  { href: '/withdrawals', label: 'Lệnh rút tiền', icon: Wallet },
```

Insert immediately AFTER it:

```ts
  { href: '/finance', label: 'Tài chính', icon: DollarSign },
```

And add `DollarSign` to the lucide-react imports at the top of the file. The existing import block looks like:

```ts
import {
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  Bot,
  Car,
  Book,
  Map,
  Ticket,
  Bell,
  Newspaper,
  Image as ImageIcon,
  Building2,
  Share2,
  Wallet,
  Megaphone,
} from 'lucide-react';
```

Add `DollarSign,` to the list (alphabetical position acceptable but not required; just keep the file consistent).

- [ ] **Step 2: Typecheck**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
npm run typecheck
```

Expected: zero new errors.

- [ ] **Step 3: Manual smoke test**

(Optional — implementer can defer to user. If running locally: `npm run dev`, log in, verify "Tài chính" appears in sidebar between "Lệnh rút tiền" and "Dữ liệu chung".)

- [ ] **Step 4: Commit**

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin
git add 'src/app/(app)/layout.tsx'
git commit -m "$(cat <<'EOF'
feat(nav): add Tài chính sidebar entry pointing to /finance

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final manual verification

Before declaring done:

- [ ] Backend `npx tsc --noEmit` (filtered for `scripts/test-cancel`) is clean
- [ ] Frontend `npm run typecheck` shows only the 6 pre-existing unrelated errors
- [ ] `npm run dev` (frontend) + backend running → navigate to `/finance`, default view loads (preset "Hôm nay")
- [ ] Switch preset to "30 ngày qua" → cards re-fetch, trend chart shows ≤ 30 daily points
- [ ] Switch to "Năm nay" → trend chart switches to monthly buckets
- [ ] Custom date range works (from/to inputs)
- [ ] Empty date range (e.g. future from/to) → all zeros, no console errors
- [ ] Invalid range (`from > to`) → toast surfaces backend's 400 message
- [ ] Top-10 row links navigate to the right entity page
- [ ] Sidebar "Tài chính" highlights when on `/finance`
