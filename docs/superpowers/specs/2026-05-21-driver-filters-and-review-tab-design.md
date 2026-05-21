# Driver Management — Filters + "Cần kiểm tra" Tab Design

**Date:** 2026-05-21
**Scope:** `vigo-admin` (frontend) + `vigo-backend` (API/service)
**Surface:** `/drivers` admin page → `DriversTable` component

## Problem

The driver management page exposes a single fuzzy `search` input and three approval-status tabs. Two pain points:

1. **Search is narrow & misleading.** Placeholder says "Tìm theo tên, SĐT, biển số…" but the backend (`drivers.service.ts:findAllDrivers`) only joins `user.fullName` and `user.phone` — plate number queries silently return nothing.
2. **No visibility into bad data.** Several drivers have made it through approval with missing/malformed fields (no license number, empty CCCD images, `vehicleRegistration` JSONB stored without `plateNumber` or with a non-standard plate string, no transport company). Admins have no way to surface these for cleanup.

Goal: give admins (a) granular filters by name / phone / plate / service / transport company, and (b) a dedicated "Cần kiểm tra" view that lists every driver flagged with one or more data-quality issues, regardless of approval status.

## Validation rules — what counts as an "issue"

Issues are computed server-side per driver and returned as a string-code array (`issues: string[]`). Same rules drive the `needsReview=true` query filter.

| Code | Rule |
|---|---|
| `missing_name` | `user.fullName` is null/empty |
| `invalid_phone` | `user.phone` is null OR fails `/^0\d{9}$/` |
| `missing_license` | `driver.licenseNumber` is null/empty OR length < 6 |
| `missing_license_images` | `licenseImages` is null OR `jsonb_array_length = 0` |
| `missing_cccd_images` | `cccdImages` is null OR `jsonb_array_length = 0` |
| `missing_vehicle` | `vehicleRegistration` JSONB is null |
| `incomplete_vehicle` | `vehicleRegistration` exists but missing any of `plateNumber`, `brand`, `model`, `color` |
| `invalid_plate` | `vehicleRegistration.plateNumber` exists but fails `/^\d{2}[A-Z]{1,2}-?\d{3}\.?\d{2,3}$/i` |
| `unconfirmed_company` | `customTransportCompanyName` set AND `transportCompanyId` null |
| `no_transport_company` | `transportCompanyId` null AND `isIndependentDriver = false` AND `customTransportCompanyName` null (mutually exclusive with `unconfirmed_company`) |

A driver with `issues.length > 0` is considered "needs review".

VN phone format: 10 digits starting with `0` (e.g. `0901234567`).
VN plate format: 2 digits + 1-2 uppercase letters + optional dash + 3 digits + optional dot + 2-3 digits (e.g. `29A-12345`, `30F-123.45`).

## Backend changes — `vigo-backend`

### 1. DTO (`src/drivers/dto/admin-list-drivers.dto.ts`)

Extend `AdminListDriversDto`:

```ts
export class AdminListDriversDto extends PaginationDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['true', 'false', 'pending']) isApproved?: string;

  // New
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() plate?: string;
  @IsOptional() @IsIn(['RIDE', 'CARPOOL', 'DELIVERY']) serviceType?: string;
  @IsOptional() @IsUUID() transportCompanyId?: string;
  @IsOptional() @IsIn(['true', 'false']) needsReview?: string;
}
```

### 2. Service (`src/drivers/drivers.service.ts`)

**`findAllDrivers`** — extend the query builder:

- **Fix `search`**: union 3 columns instead of 2:
  ```sql
  (user.fullName ILIKE :s OR user.phone ILIKE :s OR driver.vehicleRegistration->>'plateNumber' ILIKE :s)
  ```
- **`name`**: `user.fullName ILIKE :name`
- **`phone`**: `user.phone ILIKE :phone`
- **`plate`**: `driver.vehicleRegistration->>'plateNumber' ILIKE :plate`
- **`serviceType`**: `driver.enabledServices @> :svc::jsonb` with `svc = JSON.stringify([serviceType])`
- **`transportCompanyId`**: `driver.transportCompanyId = :tcId`
- **`needsReview = 'true'`**: one big OR over the 10 rule predicates (see SQL sketch below)

After `getManyAndCount()`, map each driver through `computeDriverIssues(d)` and attach to the response payload as `issues: string[]`.

**`computeDriverIssues(d: Driver): string[]`** — new private method, mirrors the rule table exactly. Place near `findAllDrivers`. Regexes as `private static readonly` class constants.

**SQL sketch for `needsReview = 'true'`** (TypeORM `andWhere` with a single parenthesized OR):

```sql
(
  user.fullName IS NULL OR user.fullName = ''
  OR user.phone IS NULL OR user.phone !~ '^0[0-9]{9}$'
  OR driver.licenseNumber IS NULL OR LENGTH(driver.licenseNumber) < 6
  OR driver.licenseImages IS NULL OR jsonb_array_length(driver.licenseImages) = 0
  OR driver.cccdImages IS NULL OR jsonb_array_length(driver.cccdImages) = 0
  OR driver.vehicleRegistration IS NULL
  OR driver.vehicleRegistration->>'plateNumber' IS NULL
  OR driver.vehicleRegistration->>'brand' IS NULL
  OR driver.vehicleRegistration->>'model' IS NULL
  OR driver.vehicleRegistration->>'color' IS NULL
  OR driver.vehicleRegistration->>'plateNumber' !~* '^\d{2}[A-Z]{1,2}-?\d{3}\.?\d{2,3}$'
  OR (driver.customTransportCompanyName IS NOT NULL AND driver.transportCompanyId IS NULL)
  OR (driver.transportCompanyId IS NULL AND driver.isIndependentDriver = false AND driver.customTransportCompanyName IS NULL)
)
```

PostgreSQL `~*` is case-insensitive regex match.

### 3. Response shape

No new endpoint. Same `GET /drivers/admin/list` returns:

```ts
{
  data: Array<Driver & { issues: string[] }>,
  meta: { page, limit, total, totalPages }
}
```

Performance: `computeDriverIssues` runs in JS on up to `limit` (default 20, max ~100) rows per request — negligible. No new index needed for v1; the `needsReview` predicate is a sequential scan on the drivers table (small, admin-only, off the hot path).

## Frontend changes — `vigo-admin`

### 1. Type (`src/lib/types.ts`)

Add to `Driver`:
```ts
issues?: string[];
```

### 2. API client (`src/lib/api.ts`)

Extend `getDrivers` params with the new fields, all optional:

```ts
export async function getDrivers(params: {
  page?: number;
  limit?: number;
  search?: string;
  isApproved?: 'true' | 'false' | 'pending';
  name?: string;
  phone?: string;
  plate?: string;
  serviceType?: 'RIDE' | 'CARPOOL' | 'DELIVERY';
  transportCompanyId?: string;
  needsReview?: 'true' | 'false';
} = {}): Promise<GetApiResponse<Driver>>
```

Build `URLSearchParams` by conditionally appending each non-empty value.

### 3. UI — `src/app/(app)/drivers/components/drivers-table.tsx`

#### Tabs (4 total)

```
[Chờ duyệt] [Đã duyệt] [Từ chối] [⚠ Cần kiểm tra · 12]
```

- 4th tab `value="needsReview"`. When active, fetch with `needsReview: 'true'` and `isApproved` omitted.
- Tab label includes a count badge (red circle, white text, `text-xs`) showing total drivers needing review across all approval statuses.
- Count source: a side fetch `getDrivers({ needsReview: 'true', limit: 1, page: 1 })` on mount, re-run after every approve/reject/assign/edit-services action. Reads `meta.total` from the response. No new endpoint.
- The count is **global** — independent of the active filter values. When the user is in the "Cần kiểm tra" tab and applies filters, the table shows the filtered subset but the tab badge keeps showing the unfiltered total.

#### Filter bar (replaces single search)

Always visible, sits above the table card, grid layout:

```
Row 1: [👤 Tên...]      [📞 SDT...]       [🚗 Biển số...]
Row 2: [Dịch vụ ▾]      [Đơn vị vận tải ▾]    [✕ Xóa lọc]
```

- Three text inputs with lucide icon prefix (`User`, `Phone`, `Car`).
- Two `Select` dropdowns: service (3 options + "Tất cả") and transport company (loaded from `getTransportCompanyList` once on mount + "Tất cả").
- "Xóa lọc" button: only renders when ≥1 filter is non-empty. Clears all filter state.
- A single `useEffect` debounces all filter changes by 400ms and triggers one `fetchDrivers` call.
- Any filter change resets `currentPage` to 1.

State shape (replacing `searchTerm`):
```ts
const [filters, setFilters] = React.useState({
  name: '', phone: '', plate: '',
  serviceType: '' as '' | 'RIDE' | 'CARPOOL' | 'DELIVERY',
  transportCompanyId: '',
});
```

#### Issue badges on driver rows

In the "Tài xế" cell, below name + phone, render a small badges row:

```
👤 Nguyễn Văn A
   0901234567
   [⚠ Thiếu bằng lái] [⚠ Biển số sai]  +3
```

New component `DriverIssueBadges` (co-located in the same file or as a peer file `driver-issue-badges.tsx`):

```ts
const ISSUE_LABELS: Record<string, string> = {
  missing_name: 'Thiếu tên',
  invalid_phone: 'SDT sai định dạng',
  missing_license: 'Thiếu số bằng lái',
  missing_license_images: 'Thiếu ảnh bằng lái',
  missing_cccd_images: 'Thiếu ảnh CCCD',
  missing_vehicle: 'Chưa có thông tin xe',
  incomplete_vehicle: 'Thông tin xe thiếu trường',
  invalid_plate: 'Biển số sai định dạng',
  unconfirmed_company: 'Đơn vị vận tải chưa xác nhận',
  no_transport_company: 'Chưa gán đơn vị vận tải',
};
```

- Renders in **every tab**, not just "Cần kiểm tra"
- Max 2 badges visible; overflow as `+N` chip with tooltip listing the rest
- Style: `bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400`, `text-xs`, rounded

#### Tab "Cần kiểm tra" banner

When active, show a banner above the filter bar:

```
⚠ Đang hiển thị tài xế có thông tin chưa chuẩn. Tổng: {total} tài xế.
```

- Style: `bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30` rounded card

#### Empty state for "Cần kiểm tra"

When `data.length === 0` and the tab is `needsReview` and no other filters set:
```
✅ Tất cả tài xế đều có thông tin đầy đủ.
```

### 4. Aesthetic

- Filter inputs: `bg-background` with `border-input`, icon `text-muted-foreground` inside, focus ring `ring-2 ring-ring`.
- Tab count badge: `inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 bg-red-500 text-white text-xs rounded-full ml-1.5`.
- Hover row: existing table style.

## Out of scope (v1)

- Editing/uploading driver images or fixing data from the admin UI (still requires going through the driver app or a dedicated edit dialog — not part of this work).
- URL-state persistence for filters.
- Server-side full-text or trigram index on plate. Deferred until query becomes slow.
- Bulk operations (select N drivers and act on them).

## Acceptance criteria

1. `GET /drivers/admin/list?plate=29A` returns drivers whose `vehicleRegistration.plateNumber` matches `%29A%`.
2. `GET /drivers/admin/list?needsReview=true` returns only drivers with `issues.length > 0`.
3. Every driver in the response has a populated `issues: string[]` (may be empty array).
4. Admin page renders 4 tabs, the 4th showing a live count of drivers needing review.
5. Filter bar's three inputs and two selects all narrow the result set, AND'd together. Clearing one re-broadens the list.
6. Approving / rejecting / assigning a driver refreshes both the visible page and the tab count badge.
7. Issue badges appear on rows in all four tabs (where applicable). Two visible, overflow as `+N` with tooltip.
