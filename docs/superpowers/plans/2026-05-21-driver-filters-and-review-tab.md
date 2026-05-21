# Driver Filters + "Cần kiểm tra" Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single fuzzy driver search with granular filters (name/phone/plate/service/transport-company) and add a 4th tab "Cần kiểm tra" that surfaces drivers flagged with missing or malformed data.

**Architecture:** Backend extracts driver data-quality rules into a pure helper module (`driver-issues.ts`), wires them into the existing `findAllDrivers` query as both filter (`needsReview=true`) and computed response field (`issues: string[]`). Frontend splits `drivers-table.tsx` by extracting two co-located sub-components (`drivers-filter-bar.tsx`, `driver-issue-badges.tsx`) to keep the table file from growing further.

**Tech Stack:** NestJS + TypeORM + Postgres (backend), Next.js 14 + Tailwind + shadcn/ui (frontend). Jest for backend tests, Vitest + Testing Library for frontend tests.

**Spec:** [docs/superpowers/specs/2026-05-21-driver-filters-and-review-tab-design.md](../specs/2026-05-21-driver-filters-and-review-tab-design.md)

---

## File map

**Backend (`vigo-backend/`)**

- Create: `src/drivers/driver-issues.ts` — issue codes, VN regexes, `computeDriverIssues(d)` pure function
- Create: `src/drivers/driver-issues.spec.ts` — unit tests for each rule
- Modify: `src/drivers/dto/admin-list-drivers.dto.ts` — new filter fields
- Modify: `src/drivers/drivers.service.ts` — extend `findAllDrivers` query + map `issues` onto response

**Frontend (`vigo-admin/`)**

- Modify: `src/lib/types.ts` — add `issues?: string[]` to `Driver`
- Modify: `src/lib/api.ts` — extend `getDrivers` params
- Create: `src/app/(app)/drivers/components/driver-issue-badges.tsx` — badge row component + label map
- Create: `src/app/(app)/drivers/components/driver-issue-badges.test.tsx` — Vitest unit test
- Create: `src/app/(app)/drivers/components/drivers-filter-bar.tsx` — 3 inputs + 2 selects + clear button
- Modify: `src/app/(app)/drivers/components/drivers-table.tsx` — replace single search with `<DriversFilterBar>`, add 4th tab, integrate `<DriverIssueBadges>`, add tab count refresh

---

## Task 1: Backend — driver-issues helper module (TDD)

**Files:**
- Create: `vigo-backend/src/drivers/driver-issues.ts`
- Create: `vigo-backend/src/drivers/driver-issues.spec.ts`

### - [ ] Step 1: Write failing tests

Create `vigo-backend/src/drivers/driver-issues.spec.ts`:

```ts
import { computeDriverIssues, DRIVER_ISSUE_CODES } from './driver-issues';
import { Driver } from './entities/driver.entity';

// Helper to build a fully-valid driver fixture; tests override one field at a time.
function validDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'd1',
    userId: 'u1',
    user: { id: 'u1', fullName: 'Nguyen Van A', phone: '0901234567' } as any,
    licenseNumber: 'B2-12345678',
    licenseImages: ['front.jpg', 'back.jpg'],
    cccdImages: ['c1.jpg', 'c2.jpg'],
    vehicleRegistration: {
      plateNumber: '29A-12345',
      brand: 'Honda',
      model: 'Wave',
      color: 'Red',
    },
    transportCompanyId: 'tc1',
    transportCompany: null as any,
    customTransportCompanyName: null,
    customTransportCompanyPhone: null,
    isIndependentDriver: false,
    isApproved: true,
    isActive: true,
    isSubmittedForApproval: true,
    enabledServices: [] as any,
    enabledDropoffDistricts: [],
    fixedRouteId: null as any,
    fixedRoute: null as any,
    currentLocation: null,
    status: 'OFFLINE',
    availableSeats: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Driver;
}

describe('computeDriverIssues', () => {
  it('returns empty array for a fully valid driver', () => {
    expect(computeDriverIssues(validDriver())).toEqual([]);
  });

  it('flags missing_name when fullName is empty', () => {
    const d = validDriver({ user: { id: 'u1', fullName: '', phone: '0901234567' } as any });
    expect(computeDriverIssues(d)).toContain('missing_name');
  });

  it('flags missing_name when user is null', () => {
    const d = validDriver({ user: null as any });
    expect(computeDriverIssues(d)).toContain('missing_name');
  });

  it('flags invalid_phone when phone fails VN format', () => {
    expect(computeDriverIssues(validDriver({ user: { id: 'u1', fullName: 'A', phone: '123' } as any }))).toContain('invalid_phone');
    expect(computeDriverIssues(validDriver({ user: { id: 'u1', fullName: 'A', phone: '1901234567' } as any }))).toContain('invalid_phone');
    expect(computeDriverIssues(validDriver({ user: null as any }))).toContain('invalid_phone');
  });

  it('flags missing_license when licenseNumber is null or too short', () => {
    expect(computeDriverIssues(validDriver({ licenseNumber: null as any }))).toContain('missing_license');
    expect(computeDriverIssues(validDriver({ licenseNumber: '' }))).toContain('missing_license');
    expect(computeDriverIssues(validDriver({ licenseNumber: 'abc' }))).toContain('missing_license');
  });

  it('flags missing_license_images when array is empty or null', () => {
    expect(computeDriverIssues(validDriver({ licenseImages: null as any }))).toContain('missing_license_images');
    expect(computeDriverIssues(validDriver({ licenseImages: [] }))).toContain('missing_license_images');
  });

  it('flags missing_cccd_images when array is empty or null', () => {
    expect(computeDriverIssues(validDriver({ cccdImages: null as any }))).toContain('missing_cccd_images');
    expect(computeDriverIssues(validDriver({ cccdImages: [] }))).toContain('missing_cccd_images');
  });

  it('flags missing_vehicle when vehicleRegistration is null', () => {
    const result = computeDriverIssues(validDriver({ vehicleRegistration: null }));
    expect(result).toContain('missing_vehicle');
    expect(result).not.toContain('incomplete_vehicle');
    expect(result).not.toContain('invalid_plate');
  });

  it('flags incomplete_vehicle when any required key is missing', () => {
    expect(computeDriverIssues(validDriver({ vehicleRegistration: { plateNumber: '29A-12345', brand: 'Honda', model: 'Wave' } }))).toContain('incomplete_vehicle');
    expect(computeDriverIssues(validDriver({ vehicleRegistration: { plateNumber: '29A-12345', brand: 'Honda', model: 'Wave', color: '' } }))).toContain('incomplete_vehicle');
  });

  it('flags invalid_plate when plateNumber fails VN format', () => {
    expect(computeDriverIssues(validDriver({ vehicleRegistration: { plateNumber: 'ABC123', brand: 'Honda', model: 'Wave', color: 'Red' } }))).toContain('invalid_plate');
    expect(computeDriverIssues(validDriver({ vehicleRegistration: { plateNumber: '29A', brand: 'Honda', model: 'Wave', color: 'Red' } }))).toContain('invalid_plate');
  });

  it('accepts VN plate variations: 29A-12345 and 30F-123.45', () => {
    expect(computeDriverIssues(validDriver({ vehicleRegistration: { plateNumber: '29A-12345', brand: 'Honda', model: 'Wave', color: 'Red' } }))).not.toContain('invalid_plate');
    expect(computeDriverIssues(validDriver({ vehicleRegistration: { plateNumber: '30F-123.45', brand: 'Honda', model: 'Wave', color: 'Red' } }))).not.toContain('invalid_plate');
    expect(computeDriverIssues(validDriver({ vehicleRegistration: { plateNumber: '51AB-12345', brand: 'Honda', model: 'Wave', color: 'Red' } }))).not.toContain('invalid_plate');
  });

  it('flags unconfirmed_company when customTransportCompanyName set but transportCompanyId null', () => {
    const d = validDriver({ transportCompanyId: null as any, customTransportCompanyName: 'HTX X', isIndependentDriver: false });
    const result = computeDriverIssues(d);
    expect(result).toContain('unconfirmed_company');
    expect(result).not.toContain('no_transport_company');
  });

  it('flags no_transport_company when no company info and not independent', () => {
    const d = validDriver({ transportCompanyId: null as any, customTransportCompanyName: null, isIndependentDriver: false });
    expect(computeDriverIssues(d)).toContain('no_transport_company');
  });

  it('does NOT flag transport-related issues when isIndependentDriver = true', () => {
    const d = validDriver({ transportCompanyId: null as any, customTransportCompanyName: null, isIndependentDriver: true });
    const result = computeDriverIssues(d);
    expect(result).not.toContain('no_transport_company');
    expect(result).not.toContain('unconfirmed_company');
  });

  it('exports all 10 issue codes via DRIVER_ISSUE_CODES', () => {
    expect(DRIVER_ISSUE_CODES).toEqual([
      'missing_name',
      'invalid_phone',
      'missing_license',
      'missing_license_images',
      'missing_cccd_images',
      'missing_vehicle',
      'incomplete_vehicle',
      'invalid_plate',
      'unconfirmed_company',
      'no_transport_company',
    ]);
  });
});
```

### - [ ] Step 2: Run tests to verify they fail

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend && npx jest src/drivers/driver-issues.spec.ts
```

Expected: FAIL — `Cannot find module './driver-issues'`.

### - [ ] Step 3: Implement `driver-issues.ts`

Create `vigo-backend/src/drivers/driver-issues.ts`:

```ts
import { Driver } from './entities/driver.entity';

export const DRIVER_ISSUE_CODES = [
  'missing_name',
  'invalid_phone',
  'missing_license',
  'missing_license_images',
  'missing_cccd_images',
  'missing_vehicle',
  'incomplete_vehicle',
  'invalid_plate',
  'unconfirmed_company',
  'no_transport_company',
] as const;

export type DriverIssueCode = (typeof DRIVER_ISSUE_CODES)[number];

export const VN_PHONE_REGEX = /^0\d{9}$/;
export const VN_PLATE_REGEX = /^\d{2}[A-Z]{1,2}-?\d{3}\.?\d{2,3}$/i;

const REQUIRED_VEHICLE_KEYS = ['plateNumber', 'brand', 'model', 'color'] as const;

export function computeDriverIssues(d: Driver): DriverIssueCode[] {
  const issues: DriverIssueCode[] = [];

  const fullName = d.user?.fullName;
  if (!fullName) issues.push('missing_name');

  const phone = d.user?.phone;
  if (!phone || !VN_PHONE_REGEX.test(phone)) issues.push('invalid_phone');

  if (!d.licenseNumber || d.licenseNumber.length < 6) issues.push('missing_license');

  if (!Array.isArray(d.licenseImages) || d.licenseImages.length === 0) {
    issues.push('missing_license_images');
  }

  if (!Array.isArray(d.cccdImages) || d.cccdImages.length === 0) {
    issues.push('missing_cccd_images');
  }

  const vr = d.vehicleRegistration;
  if (!vr || typeof vr !== 'object') {
    issues.push('missing_vehicle');
  } else {
    const missingKey = REQUIRED_VEHICLE_KEYS.some((k) => !vr[k]);
    if (missingKey) issues.push('incomplete_vehicle');
    if (vr.plateNumber && !VN_PLATE_REGEX.test(vr.plateNumber)) {
      issues.push('invalid_plate');
    }
  }

  if (!d.isIndependentDriver) {
    if (d.customTransportCompanyName && !d.transportCompanyId) {
      issues.push('unconfirmed_company');
    } else if (!d.transportCompanyId && !d.customTransportCompanyName) {
      issues.push('no_transport_company');
    }
  }

  return issues;
}
```

### - [ ] Step 4: Run tests to verify they pass

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend && npx jest src/drivers/driver-issues.spec.ts
```

Expected: PASS — all tests green.

### - [ ] Step 5: Commit

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend && git add src/drivers/driver-issues.ts src/drivers/driver-issues.spec.ts && git commit -m "feat(drivers): add driver-issues helper for data quality checks"
```

---

## Task 2: Backend — extend `AdminListDriversDto`

**Files:**
- Modify: `vigo-backend/src/drivers/dto/admin-list-drivers.dto.ts`

### - [ ] Step 1: Replace DTO contents

Replace the entire file contents with:

```ts
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dtos/pagination.dto';

export class AdminListDriversDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['true', 'false', 'pending'], { message: 'isApproved must be true, false, or pending' })
  isApproved?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  plate?: string;

  @IsOptional()
  @IsIn(['RIDE', 'CARPOOL', 'DELIVERY'], { message: 'serviceType must be RIDE, CARPOOL, or DELIVERY' })
  serviceType?: string;

  @IsOptional()
  @IsUUID()
  transportCompanyId?: string;

  @IsOptional()
  @IsIn(['true', 'false'], { message: 'needsReview must be true or false' })
  needsReview?: string;
}
```

### - [ ] Step 2: Verify the project still compiles

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend && npx tsc --noEmit
```

Expected: PASS — no type errors.

### - [ ] Step 3: Commit

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend && git add src/drivers/dto/admin-list-drivers.dto.ts && git commit -m "feat(drivers): extend admin list DTO with filter params"
```

---

## Task 3: Backend — extend `findAllDrivers` query

**Files:**
- Modify: `vigo-backend/src/drivers/drivers.service.ts:560-605`

### - [ ] Step 1: Add import for the helper

At the top of `drivers.service.ts`, add an import alongside existing imports:

```ts
import { computeDriverIssues } from './driver-issues';
```

### - [ ] Step 2: Replace `findAllDrivers` implementation

Replace the existing `findAllDrivers` method (currently at lines ~561-605) with:

```ts
async findAllDrivers(params: {
  page?: number;
  limit?: number;
  isApproved?: string;
  search?: string;
  name?: string;
  phone?: string;
  plate?: string;
  serviceType?: string;
  transportCompanyId?: string;
  needsReview?: string;
}) {
  const {
    page = 1,
    limit = 20,
    isApproved,
    search,
    name,
    phone,
    plate,
    serviceType,
    transportCompanyId,
    needsReview,
  } = params;

  const query = this.driversRepository
    .createQueryBuilder('driver')
    .leftJoinAndSelect('driver.user', 'user')
    .leftJoinAndSelect('driver.fixedRoute', 'route')
    .leftJoinAndSelect('driver.transportCompany', 'transportCompany')
    .orderBy('driver.createdAt', 'DESC');

  if (search) {
    query.andWhere(
      `(
        user.fullName ILIKE :search
        OR user.phone ILIKE :search
        OR driver.vehicleRegistration->>'plateNumber' ILIKE :search
      )`,
      { search: `%${search}%` },
    );
  }

  if (name) {
    query.andWhere('user.fullName ILIKE :name', { name: `%${name}%` });
  }

  if (phone) {
    query.andWhere('user.phone ILIKE :phone', { phone: `%${phone}%` });
  }

  if (plate) {
    query.andWhere(
      `driver.vehicleRegistration->>'plateNumber' ILIKE :plate`,
      { plate: `%${plate}%` },
    );
  }

  if (serviceType) {
    query.andWhere(`driver.enabledServices @> :svc::jsonb`, {
      svc: JSON.stringify([serviceType]),
    });
  }

  if (transportCompanyId) {
    query.andWhere('driver.transportCompanyId = :tcId', { tcId: transportCompanyId });
  }

  if (isApproved === 'pending') {
    query.andWhere('driver.isSubmittedForApproval = :submitted', { submitted: true });
    query.andWhere('driver.isApproved = :approved', { approved: false });
  } else if (isApproved === 'true') {
    query.andWhere('driver.isApproved = :approved', { approved: true });
  } else if (isApproved === 'false') {
    query.andWhere('driver.isApproved = :approved', { approved: false });
  }

  if (needsReview === 'true') {
    query.andWhere(
      `(
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
        OR driver.vehicleRegistration->>'plateNumber' !~* '^[0-9]{2}[A-Z]{1,2}-?[0-9]{3}\\.?[0-9]{2,3}$'
        OR (driver.customTransportCompanyName IS NOT NULL AND driver.transportCompanyId IS NULL AND driver.isIndependentDriver = false)
        OR (driver.transportCompanyId IS NULL AND driver.isIndependentDriver = false AND driver.customTransportCompanyName IS NULL)
      )`,
    );
  }

  query.skip((page - 1) * limit).take(limit);

  const [data, total] = await query.getManyAndCount();

  const dataWithIssues = data.map((d) => ({
    ...d,
    issues: computeDriverIssues(d),
  }));

  return {
    data: dataWithIssues,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

### - [ ] Step 3: Verify TypeScript compiles and existing tests still pass

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend && npx tsc --noEmit && npx jest src/drivers
```

Expected: PASS — type check clean, existing driver tests still pass.

### - [ ] Step 4: Manual smoke test against the dev backend (if running)

If the backend is running, hit the endpoint with curl using an admin token. Skip if not running.

```bash
# Replace $TOKEN with an admin JWT
curl -s 'http://localhost:3000/drivers/admin/list?needsReview=true&limit=2' -H "Authorization: Bearer $TOKEN" | jq '.data[0].issues, .meta.total'
```

Expected: an array of issue codes and a numeric total. Skip if you don't have a running backend — Task 9 covers full e2e verification.

### - [ ] Step 5: Commit

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend && git add src/drivers/drivers.service.ts && git commit -m "feat(drivers): granular filters + needsReview + issues on admin list"
```

---

## Task 4: Frontend — add `issues` to `Driver` type

**Files:**
- Modify: `vigo-admin/src/lib/types.ts:81-122`

### - [ ] Step 1: Add the field

Find the `Driver` type and add this field just before the closing brace (i.e. after `isIndependentDriver?: boolean;`):

```ts
  issues?: string[];
```

The updated tail of the type should read:

```ts
  transportCompanyId?: string;
  transportCompany?: TransportCompany;
  customTransportCompanyName?: string;
  isIndependentDriver?: boolean;
  issues?: string[];
}
```

### - [ ] Step 2: Type check

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && npx tsc --noEmit
```

Expected: PASS.

### - [ ] Step 3: Commit

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && git add src/lib/types.ts && git commit -m "feat(types): add issues field to Driver"
```

---

## Task 5: Frontend — extend `getDrivers` API client

**Files:**
- Modify: `vigo-admin/src/lib/api.ts:203-213`

### - [ ] Step 1: Replace the function

Replace the existing `getDrivers` function with:

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
} = {}): Promise<GetApiResponse<Driver>> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
  });
  if (params.search) query.set('search', params.search);
  if (params.isApproved) query.set('isApproved', params.isApproved);
  if (params.name) query.set('name', params.name);
  if (params.phone) query.set('phone', params.phone);
  if (params.plate) query.set('plate', params.plate);
  if (params.serviceType) query.set('serviceType', params.serviceType);
  if (params.transportCompanyId) query.set('transportCompanyId', params.transportCompanyId);
  if (params.needsReview) query.set('needsReview', params.needsReview);

  const response = await fetchWithAuth(`/drivers/admin/list?${query.toString()}`);
  return response.json();
}
```

### - [ ] Step 2: Type check

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && npx tsc --noEmit
```

Expected: PASS. (Existing callers only pass `search`/`isApproved`/`page`/`limit`, all still valid.)

### - [ ] Step 3: Commit

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && git add src/lib/api.ts && git commit -m "feat(api): extend getDrivers with granular filter params"
```

---

## Task 6: Frontend — `DriverIssueBadges` component (TDD)

**Files:**
- Create: `vigo-admin/src/app/(app)/drivers/components/driver-issue-badges.tsx`
- Create: `vigo-admin/src/app/(app)/drivers/components/driver-issue-badges.test.tsx`

### - [ ] Step 1: Write failing test

Create `vigo-admin/src/app/(app)/drivers/components/driver-issue-badges.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriverIssueBadges } from './driver-issue-badges';

describe('DriverIssueBadges', () => {
  it('renders nothing when issues is empty or undefined', () => {
    const { container: c1 } = render(<DriverIssueBadges issues={[]} />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(<DriverIssueBadges issues={undefined} />);
    expect(c2.firstChild).toBeNull();
  });

  it('renders all badges when there are 2 or fewer', () => {
    render(<DriverIssueBadges issues={['missing_license', 'invalid_plate']} />);
    expect(screen.getByText('Thiếu số bằng lái')).toBeInTheDocument();
    expect(screen.getByText('Biển số sai định dạng')).toBeInTheDocument();
  });

  it('shows first 2 badges and a +N overflow chip when more than 2', () => {
    render(
      <DriverIssueBadges
        issues={['missing_license', 'invalid_plate', 'missing_cccd_images', 'missing_name']}
      />,
    );
    expect(screen.getByText('Thiếu số bằng lái')).toBeInTheDocument();
    expect(screen.getByText('Biển số sai định dạng')).toBeInTheDocument();
    expect(screen.queryByText('Thiếu ảnh CCCD')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('falls back to the raw code when label is unknown', () => {
    render(<DriverIssueBadges issues={['weird_unknown_code']} />);
    expect(screen.getByText('weird_unknown_code')).toBeInTheDocument();
  });
});
```

### - [ ] Step 2: Run test to verify it fails

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && npx vitest run src/app/\(app\)/drivers/components/driver-issue-badges.test.tsx
```

Expected: FAIL — module not found.

### - [ ] Step 3: Implement the component

Create `vigo-admin/src/app/(app)/drivers/components/driver-issue-badges.tsx`:

```tsx
import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const ISSUE_LABELS: Record<string, string> = {
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

const MAX_VISIBLE = 2;

function labelFor(code: string): string {
  return ISSUE_LABELS[code] ?? code;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
      <AlertTriangle className="h-3 w-3" />
      {children}
    </span>
  );
}

export function DriverIssueBadges({ issues }: { issues?: string[] }) {
  if (!issues || issues.length === 0) return null;

  const visible = issues.slice(0, MAX_VISIBLE);
  const overflow = issues.slice(MAX_VISIBLE);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {visible.map((code) => (
        <Chip key={code}>{labelFor(code)}</Chip>
      ))}
      {overflow.length > 0 && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-default items-center rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
                +{overflow.length}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <ul className="space-y-0.5">
                {overflow.map((code) => (
                  <li key={code}>{labelFor(code)}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
```

### - [ ] Step 4: Run test to verify it passes

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && npx vitest run src/app/\(app\)/drivers/components/driver-issue-badges.test.tsx
```

Expected: PASS.

### - [ ] Step 5: Commit

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && git add 'src/app/(app)/drivers/components/driver-issue-badges.tsx' 'src/app/(app)/drivers/components/driver-issue-badges.test.tsx' && git commit -m "feat(drivers): DriverIssueBadges component with label map"
```

---

## Task 7: Frontend — `DriversFilterBar` component

**Files:**
- Create: `vigo-admin/src/app/(app)/drivers/components/drivers-filter-bar.tsx`

### - [ ] Step 1: Create the component

Create `vigo-admin/src/app/(app)/drivers/components/drivers-filter-bar.tsx`:

```tsx
'use client';

import * as React from 'react';
import { User, Phone, Car, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TransportCompany } from '@/lib/types';

export type DriverFilters = {
  name: string;
  phone: string;
  plate: string;
  serviceType: '' | 'RIDE' | 'CARPOOL' | 'DELIVERY';
  transportCompanyId: string;
};

export const EMPTY_FILTERS: DriverFilters = {
  name: '',
  phone: '',
  plate: '',
  serviceType: '',
  transportCompanyId: '',
};

function hasAnyFilter(f: DriverFilters): boolean {
  return Boolean(f.name || f.phone || f.plate || f.serviceType || f.transportCompanyId);
}

const SERVICE_OPTIONS = [
  { value: 'RIDE', label: 'Chở khách (Taxi)' },
  { value: 'CARPOOL', label: 'Đi chung' },
  { value: 'DELIVERY', label: 'Giao hàng' },
];

function IconInput({
  icon: Icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9" {...props} />
    </div>
  );
}

export function DriversFilterBar({
  value,
  onChange,
  transportCompanies,
}: {
  value: DriverFilters;
  onChange: (next: DriverFilters) => void;
  transportCompanies: TransportCompany[];
}) {
  const setField = <K extends keyof DriverFilters>(key: K, v: DriverFilters[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <div className="space-y-3 pb-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <IconInput
          icon={User}
          placeholder="Tên tài xế..."
          value={value.name}
          onChange={(e) => setField('name', e.target.value)}
        />
        <IconInput
          icon={Phone}
          placeholder="Số điện thoại..."
          value={value.phone}
          onChange={(e) => setField('phone', e.target.value)}
        />
        <IconInput
          icon={Car}
          placeholder="Biển số xe..."
          value={value.plate}
          onChange={(e) => setField('plate', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-3">
        <Select
          value={value.serviceType || 'ALL'}
          onValueChange={(v) => setField('serviceType', v === 'ALL' ? '' : (v as DriverFilters['serviceType']))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Dịch vụ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả dịch vụ</SelectItem>
            {SERVICE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={value.transportCompanyId || 'ALL'}
          onValueChange={(v) => setField('transportCompanyId', v === 'ALL' ? '' : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Đơn vị vận tải" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả đơn vị</SelectItem>
            {transportCompanies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex justify-start sm:justify-end">
          {hasAnyFilter(value) && (
            <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
              <X className="mr-1 h-4 w-4" />
              Xóa lọc
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### - [ ] Step 2: Type check

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && npx tsc --noEmit
```

Expected: PASS.

### - [ ] Step 3: Commit

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && git add 'src/app/(app)/drivers/components/drivers-filter-bar.tsx' && git commit -m "feat(drivers): DriversFilterBar with 3 inputs + 2 selects"
```

---

## Task 8: Frontend — refactor `DriversTable`

**Files:**
- Modify: `vigo-admin/src/app/(app)/drivers/components/drivers-table.tsx`

This is the largest refactor task. It (a) replaces the single `searchTerm` state with the new `filters` object, (b) adds the 4th tab, (c) integrates `DriverIssueBadges` into the row, (d) loads transport companies on mount, and (e) refreshes the tab count after every action.

### - [ ] Step 1: Add new imports

At the top of `drivers-table.tsx`, add to the existing import section (alongside `getDrivers`, etc.):

Replace this line:
```ts
import { getDrivers, approveDriver, rejectDriver, assignTransportCompany, getTransportCompanyList, updateDriverServices, API_BASE_URL } from '@/lib/api';
```

with:
```ts
import { getDrivers, approveDriver, rejectDriver, assignTransportCompany, getTransportCompanyList, updateDriverServices } from '@/lib/api';
import { DriverIssueBadges } from './driver-issue-badges';
import { DriversFilterBar, EMPTY_FILTERS, type DriverFilters } from './drivers-filter-bar';
import { AlertTriangle } from 'lucide-react';
```

(`API_BASE_URL` is dropped from the import — it is not referenced anywhere else in the file. Verified with `grep -n API_BASE_URL` before writing this plan.)

### - [ ] Step 2: Update the `ApprovalStatus` type to include the new tab

Find:
```ts
type ApprovalStatus = 'pending' | 'true' | 'false';
```

Replace with:
```ts
type TableTab = 'pending' | 'true' | 'false' | 'needsReview';
```

Then replace every occurrence of `ApprovalStatus` in the file with `TableTab`. (There should be two: the `useState<ApprovalStatus>` and the cast in `handleTabChange`.)

### - [ ] Step 3: Replace `searchTerm` state with `filters` + add company state + tab count state

Find:
```ts
const [searchTerm, setSearchTerm] = React.useState('');
const [activeTab, setActiveTab] = React.useState<ApprovalStatus>('pending');
```

Replace with:
```ts
const [filters, setFilters] = React.useState<DriverFilters>(EMPTY_FILTERS);
const [activeTab, setActiveTab] = React.useState<TableTab>('pending');
const [needsReviewCount, setNeedsReviewCount] = React.useState<number>(0);
const [allTransportCompanies, setAllTransportCompanies] = React.useState<TransportCompany[]>([]);
```

### - [ ] Step 4: Replace the `fetchDrivers` callback

Find the existing `fetchDrivers` (`React.useCallback(...)`) and replace with:

```ts
const fetchDrivers = React.useCallback(async (tab: TableTab, f: DriverFilters, page: number, limit: number) => {
  setIsLoading(true);
  setError(null);
  try {
    const apiParams: Parameters<typeof getDrivers>[0] = {
      page,
      limit,
      name: f.name || undefined,
      phone: f.phone || undefined,
      plate: f.plate || undefined,
      serviceType: f.serviceType || undefined,
      transportCompanyId: f.transportCompanyId || undefined,
    };
    if (tab === 'needsReview') {
      apiParams.needsReview = 'true';
    } else {
      apiParams.isApproved = tab;
    }

    const response = await getDrivers(apiParams);
    setDrivers(response.data);
    const meta = (response as any).meta;
    const total = meta?.total ?? 0;
    const apiLimit = meta?.limit ?? limit;
    setTotalItems(total);
    setTotalPages(Math.max(1, Math.ceil(total / apiLimit)));
  } catch (err: any) {
    setError(err.message);
    toast({
      variant: 'destructive',
      title: 'Không thể tải danh sách tài xế',
      description: err.message,
    });
  } finally {
    setIsLoading(false);
  }
}, [toast]);
```

### - [ ] Step 5: Add a `refreshNeedsReviewCount` callback

Just below `fetchDrivers`, add:

```ts
const refreshNeedsReviewCount = React.useCallback(async () => {
  try {
    const response = await getDrivers({ needsReview: 'true', limit: 1, page: 1 });
    const total = (response as any).meta?.total ?? 0;
    setNeedsReviewCount(total);
  } catch {
    // Non-fatal; leave previous count
  }
}, []);
```

### - [ ] Step 6: Replace the existing `useEffect` for `fetchDrivers` and add one for companies + count

Find the existing `React.useEffect` block that calls `fetchDrivers` with the debounce timer, and replace with:

```ts
React.useEffect(() => {
  const timer = setTimeout(() => {
    fetchDrivers(activeTab, filters, currentPage, pageSize);
  }, 400);
  return () => clearTimeout(timer);
}, [fetchDrivers, activeTab, filters, currentPage, pageSize]);

React.useEffect(() => {
  refreshNeedsReviewCount();
  getTransportCompanyList()
    .then(setAllTransportCompanies)
    .catch(() => { /* dropdown stays empty if it fails */ });
}, [refreshNeedsReviewCount]);
```

### - [ ] Step 7: Update `handleTabChange`

Find:
```ts
const handleTabChange = (value: string) => {
  setActiveTab(value as ApprovalStatus);
  setCurrentPage(1);
}
```

Replace with:
```ts
const handleTabChange = (value: string) => {
  setActiveTab(value as TableTab);
  setCurrentPage(1);
};

const handleFiltersChange = (next: DriverFilters) => {
  setFilters(next);
  setCurrentPage(1);
};
```

### - [ ] Step 8: Update action handlers to refresh count

In `handleConfirmAction`, find the line:
```ts
fetchDrivers(activeTab, searchTerm, currentPage, pageSize);
```

Replace with:
```ts
fetchDrivers(activeTab, filters, currentPage, pageSize);
refreshNeedsReviewCount();
```

In `handleAssign`, find the same line and replace identically.

In the "Sửa" services flow inside the detail dialog (search for `fetchDrivers(activeTab, searchTerm, currentPage, pageSize)` in the `onClick` of the "Lưu" button) and replace identically.

After this step, there should be **zero** remaining references to `searchTerm` in the file. Verify with:

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && grep -n searchTerm 'src/app/(app)/drivers/components/drivers-table.tsx'
```

Expected: no output.

### - [ ] Step 9: Replace the header row (TabsList + old Input) with new layout

Find the block:

```tsx
<Tabs value={activeTab} onValueChange={handleTabChange}>
  <div className="flex items-center pb-4">
    <TabsList>
      <TabsTrigger value="pending">Chờ duyệt</TabsTrigger>
      <TabsTrigger value="true">Đã duyệt</TabsTrigger>
      <TabsTrigger value="false">Từ chối</TabsTrigger>
    </TabsList>
    <div className='ml-auto'>
      <Input
        placeholder="Tìm theo tên, SĐT, biển số..."
        value={searchTerm}
        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
        className="max-w-sm"
      />
    </div>
  </div>
```

Replace with:

```tsx
<Tabs value={activeTab} onValueChange={handleTabChange}>
  <div className="pb-4">
    <TabsList>
      <TabsTrigger value="pending">Chờ duyệt</TabsTrigger>
      <TabsTrigger value="true">Đã duyệt</TabsTrigger>
      <TabsTrigger value="false">Từ chối</TabsTrigger>
      <TabsTrigger value="needsReview" className="gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        Cần kiểm tra
        {needsReviewCount > 0 && (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
            {needsReviewCount}
          </span>
        )}
      </TabsTrigger>
    </TabsList>
  </div>

  <DriversFilterBar
    value={filters}
    onChange={handleFiltersChange}
    transportCompanies={allTransportCompanies}
  />

  {activeTab === 'needsReview' && (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4" />
      Đang hiển thị tài xế có thông tin chưa chuẩn. Tổng: {totalItems} tài xế.
    </div>
  )}
```

### - [ ] Step 10: Add issue badges to the "Tài xế" cell

Find the `<TableCell className="font-medium">` block that renders the avatar + name + phone (currently lines ~330-341). Replace its inner content:

```tsx
<TableCell className="font-medium">
  <div className="flex items-center gap-3">
    <Avatar>
      <AvatarImage src={driver.user?.avatarUrl || driver.user?.avatar} alt={driverName} data-ai-hint="person portrait" />
      <AvatarFallback>{driverName.charAt(0)}</AvatarFallback>
    </Avatar>
    <div className="grid">
      <span className="font-semibold">{driverName}</span>
      <span className="text-sm text-muted-foreground">{driverPhone}</span>
      <DriverIssueBadges issues={driver.issues} />
    </div>
  </div>
</TableCell>
```

### - [ ] Step 11: Update empty-state message for `needsReview` tab

Find:
```tsx
<TableCell colSpan={6} className="h-24 text-center">
  Không tìm thấy tài xế nào.
</TableCell>
```

Replace with:
```tsx
<TableCell colSpan={6} className="h-24 text-center">
  {activeTab === 'needsReview'
    ? '✅ Tất cả tài xế đều có thông tin đầy đủ.'
    : 'Không tìm thấy tài xế nào.'}
</TableCell>
```

### - [ ] Step 12: Type check and lint

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && npx tsc --noEmit
```

Expected: PASS.

### - [ ] Step 13: Commit

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && git add 'src/app/(app)/drivers/components/drivers-table.tsx' && git commit -m "feat(drivers): integrate filter bar, issue badges, and Cần kiểm tra tab"
```

---

## Task 9: Manual verification

**Files:** none (runtime check).

### - [ ] Step 1: Start backend and frontend

In two terminals:

```bash
cd /Users/thanhitinn/Development/Projects/vigo-backend && npm run start:dev
```

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && npm run dev
```

### - [ ] Step 2: Verify in browser

Open `http://localhost:3000/drivers` (or whichever port admin runs on; check the dev script output) and confirm:

1. Four tabs visible. "Cần kiểm tra" has a red count badge (or no badge if `needsReviewCount === 0`).
2. Filter bar shows 3 icon inputs and 2 dropdowns. Typing into "Biển số xe..." narrows the list (give it 400ms).
3. Approving or rejecting a driver refreshes the visible page AND updates the tab count badge.
4. Switch to "Cần kiểm tra" tab. Banner appears. Each row in the table has 0-2 red issue badges + optional `+N` overflow.
5. Hover the `+N` chip — tooltip lists the remaining issues by Vietnamese label.
6. Click "Xóa lọc" — all 5 filter controls clear and the table re-fetches.

### - [ ] Step 3: Sanity-check the responses

In browser devtools Network tab, inspect a `/drivers/admin/list?...` response and confirm:
- Each driver object has an `issues` array (may be empty).
- Filtering by `plate=29A` returns only drivers whose plate matches.
- Tab "Cần kiểm tra" sends `needsReview=true` and `isApproved` is absent.

### - [ ] Step 4: Commit any cleanup (if needed) — otherwise done

If verification turned up small adjustments (typos, spacing), commit them now:

```bash
cd /Users/thanhitinn/Development/Projects/vigo-admin && git status && git add -p && git commit -m "polish(drivers): verification fixes"
```

Otherwise nothing to commit.

---

## Acceptance recap

- Backend: `GET /drivers/admin/list` accepts `name`, `phone`, `plate`, `serviceType`, `transportCompanyId`, `needsReview` (all optional). Response always includes `data[i].issues: string[]`.
- Frontend: 4 tabs, filter bar always visible, red badges on drivers with data issues, live count refresh after admin actions.
- Tests: `driver-issues.spec.ts` covers all 10 issue codes. `driver-issue-badges.test.tsx` covers render-empty / render-all / overflow / unknown-code paths.
