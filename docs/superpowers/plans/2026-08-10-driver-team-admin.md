# Đội tài chuyên nghiệp — Implementation Plan (vigo-admin)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-08-10-driver-team-design.md`
**Phụ thuộc CỨNG:** `2026-08-10-driver-team-backend.md` phải deploy xong **prod** trước. 7 endpoint `admin/driver-team/*` chưa tồn tại thì mọi task từ Task 4 trở đi không verify được.

**Goal:** Màn `/driver-team` — accordion **tuyến → tài xế**, hiện mọi tuyến kể cả tuyến 0 tài, mở ra thấy ai chạy nhiều nhất trên tuyến đó, đổi trạng thái pipeline / ghi chú / hẹn gọi lại ngay tại chỗ, hành động hàng loạt, và export Excel.

**Architecture:** Một route mới trong `(app)/`. Dữ liệu vào qua các hàm mới trong `src/lib/api.ts` (client tập trung sẵn có — **không** viết fetch wrapper mới). Logic thuần (nhãn trạng thái, dựng query, dựng ma trận export, đồng bộ trạng thái giữa các nhóm) tách sang module riêng có test; component chỉ lo render.

**Tech Stack:** Next.js 15 App Router (static export) · React 19 · TypeScript · shadcn/ui (`accordion`, `table`, `badge`, `select`, `sheet`, `checkbox`) · vitest.

## Global Constraints

- **Timezone VN (UTC+7) bắt buộc.** Mọi ngày người dùng thấy/lọc phải là giờ VN, độc lập timezone trình duyệt. Dùng lại `PRESETS` / `FinanceFilter` từ `src/app/(app)/finance/components/finance-filter.tsx`. **KHÔNG** dùng `toLocaleDateString()` hay `getFullYear/getMonth/getDate` cục bộ cho ngày nghiệp vụ.
- Tính ngày VN độc-lập-trình-duyệt: `new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)`.
- **Dùng lại `src/lib/api.ts`** — thêm hàm vào đó, không tạo client mới.
- **Export là `.xlsx`** qua `downloadXlsx` của `src/lib/csv.ts` (tên file là `csv` nhưng nội dung là helper xlsx — repo đã cố tình bỏ CSV dấu phẩy vì Excel tiếng Việt tách cột theo `;`).
- **`next.config.ts` bật `ignoreBuildErrors` + `ignoreDuringBuilds`** → build **KHÔNG** chặn lỗi type/lint. Cổng kiểm thật là `npm run typecheck`.
- **`npm run build` deploy thẳng lên S3 prod.** Trong toàn bộ plan này chỉ dùng `npx next build` để smoke check.
- Lệnh kiểm: `npm run typecheck` + `npx vitest run`.

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/lib/types.ts` (sửa) | Kiểu domain: `DriverTeamStage`, `TeamRouteRow`, `TeamDriverRow`, `TeamSummary`, `DriverTeamEvent`, `DriverTeamDetail` |
| `src/lib/api.ts` (sửa) | 7 hàm gọi endpoint mới |
| `src/lib/driver-team-labels.ts` | Nhãn tiếng Việt + class badge cho stage; format tỉ trọng; suy badge cảnh báo |
| `src/lib/driver-team-labels.test.ts` | Test nhãn |
| `src/lib/driver-team-export.ts` | Dựng header + ma trận dòng cho xlsx, áp cap 1000 |
| `src/lib/driver-team-export.test.ts` | Test export |
| `src/lib/driver-team-sync.ts` | `patchDriverAcrossGroups` — lan trạng thái sang mọi nhóm đang mở |
| `src/lib/driver-team-sync.test.ts` | Test đồng bộ |
| `src/lib/driver-team-bulk.ts` | Hành động hàng loạt tuần tự + tìm nhóm khớp từ khoá |
| `src/lib/driver-team-bulk.test.ts` | Test hàng loạt |
| `src/lib/nav-items.tsx` (sửa) | Mục menu |
| `src/lib/rbac.ts` (sửa) | `MENU_FUNCTION_BY_HREF` |
| `src/lib/rbac.test.ts` (sửa) | 27 → 28 |
| `src/app/(app)/driver-team/page.tsx` | Shell trang |
| `src/app/(app)/driver-team/components/driver-team-screen.tsx` | State chủ: bộ lọc, thẻ số, danh sách tuyến |
| `src/app/(app)/driver-team/components/route-accordion.tsx` | Cấp 1 + cấp 2 (tải lazy) |
| `src/app/(app)/driver-team/components/driver-row-actions.tsx` | Dropdown stage, ghi chú inline, chọn dòng |
| `src/app/(app)/driver-team/components/driver-team-drawer.tsx` | Drawer chi tiết |

---

## Task 1: Kiểu dữ liệu + hàm API

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/api.ts`
- Create: `src/lib/api-driver-team.test.ts`

**Interfaces:**
- Consumes: 7 endpoint từ plan backend.
- Produces: `getTeamSummary`, `getTeamRoutes`, `getTeamRouteDrivers`, `getTeamOwners`, `getTeamDriverDetail`, `patchTeamMember`, `addTeamEvent`; các kiểu trong bảng File Structure.

- [ ] **Step 1: Thêm kiểu vào `src/lib/types.ts`**

```ts
/** Bậc pipeline tuyển đội tài. null (không có row) = "Tiềm năng" — xem spec §4.1. */
export type DriverTeamStage = 'CONTACTED' | 'INVITED' | 'JOINED' | 'DECLINED' | 'DROPPED';

export type DriverTeamEventType = 'STAGE_CHANGE' | 'CALL' | 'NOTE' | 'ASSIGN' | 'FOLLOW_UP';

export type TeamMemberState = {
  stage: DriverTeamStage;
  assignedRouteIds: number[];
  ownerAdminUserId: string | null;
  ownerAdminName: string | null;
  nextFollowUpAt: string | null;
  note: string | null;
  stageChangedAt: string | null;
};

/** Một dòng cấp 1. routeId null = hàng gộp "Không gắn tuyến". */
export type TeamRouteRow = {
  routeId: number | null;
  routeName: string;
  driverCount: number;
  /** Đếm theo completedAt. KHÁC mốc với totalBookings — đừng chia cho nhau. */
  completedTrips: number;
  /** Đếm theo createdAt. */
  totalBookings: number;
  lastCompletedAt: string | null;
  contactedCount: number;
  joinedCount: number;
};

/** Một dòng cấp 2 — cặp (tài × tuyến). */
export type TeamDriverRow = {
  driverId: string;
  fullName: string | null;
  phone: string | null;
  transportCompanyName: string | null;
  tripsOnRoute: number;
  tripsAllRoutes: number;
  /** 0..1, BE tính sẵn. */
  shareOfRoute: number;
  lastCompletedAt: string | null;
  firstCompletedAt: string | null;
  isApproved: boolean;
  isBanned: boolean;
  suspendedUntil: string | null;
  /** null = chưa chạm tới = Tiềm năng. */
  team: TeamMemberState | null;
};

export type TeamSummary = {
  driversWithCompletedTrips: number;
  contactedDrivers: number;
  joinedDrivers: number;
  followUpDueToday: number;
};

export type DriverTeamEvent = {
  id: string;
  driverId: string;
  type: DriverTeamEventType;
  fromStage: DriverTeamStage | null;
  toStage: DriverTeamStage | null;
  note: string | null;
  byAdminUserId: string | null;
  createdAt: string;
};

export type DriverTeamDetail = {
  team: TeamMemberState | null;
  events: DriverTeamEvent[];
  routesRun: { routeId: number | null; name: string | null; trips: number }[];
  /** Tuyến tài ĐĂNG KÝ — đối chiếu với routesRun để thấy chỗ lệch. */
  registeredRouteIds: number[];
};

export type TeamOwner = { id: string; fullName: string | null; phone: string | null };
```

- [ ] **Step 2: Viết test thất bại cho hàm API**

`src/lib/api-driver-team.test.ts` (theo mẫu `api-driver-reputation-list.test.ts` sẵn có):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('localStorage', {
    getItem: () => 'fake-token',
    setItem: () => {},
    removeItem: () => {},
  });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [], unassigned: null, meta: {} }),
  });
});

afterEach(() => vi.unstubAllGlobals());

const urlOf = () => String(fetchMock.mock.calls[0][0]);

describe('getTeamRouteDrivers', () => {
  it("routeId 'none' đi vào path, KHÔNG bị ép thành số", async () => {
    const { getTeamRouteDrivers } = await import('./api');
    await getTeamRouteDrivers('none', { from: '2026-08-01', to: '2026-08-31' });
    expect(urlOf()).toContain('/admin/driver-team/routes/none/drivers');
  });

  it('bỏ qua field rỗng, không gửi param rác', async () => {
    const { getTeamRouteDrivers } = await import('./api');
    await getTeamRouteDrivers(12, { from: '2026-08-01', to: '2026-08-31', q: '', stage: undefined });
    const url = urlOf();
    expect(url).not.toContain('q=');
    expect(url).not.toContain('stage=');
  });

  it('gửi from/to đúng dạng VN YYYY-MM-DD', async () => {
    const { getTeamRouteDrivers } = await import('./api');
    await getTeamRouteDrivers(12, { from: '2026-08-01', to: '2026-08-31' });
    expect(urlOf()).toContain('from=2026-08-01');
    expect(urlOf()).toContain('to=2026-08-31');
  });
});

describe('patchTeamMember', () => {
  it('chỉ gửi field được truyền — không tự thêm null làm xoá dữ liệu người khác', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { patchTeamMember } = await import('./api');
    await patchTeamMember('d1', { stage: 'JOINED' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ stage: 'JOINED' });
  });

  it('note chuỗi rỗng VẪN được gửi (nghĩa là xoá ghi chú)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { patchTeamMember } = await import('./api');
    await patchTeamMember('d1', { note: '' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ note: '' });
  });
});
```

- [ ] **Step 3: Chạy để xác nhận FAIL**

Run: `npx vitest run src/lib/api-driver-team.test.ts`
Expected: FAIL — `getTeamRouteDrivers is not a function`.

- [ ] **Step 4: Thêm hàm vào `src/lib/api.ts`**

Đặt cuối file, cạnh nhóm hàm `driver-reputation`:

```ts
// ---- Đội tài chuyên nghiệp (/driver-team) ----
// Quyền RIÊNG 'driver-team' ở backend. KHÔNG dùng adminListAssignableUsers() cho
// dropdown người phụ trách: GET /admin/users gắn SuperOnlyGuard nên tài khoản chỉ
// có function driver-team sẽ nhận 403.

export async function getTeamSummary(range: { from: string; to: string }): Promise<TeamSummary> {
  const q = new URLSearchParams({ from: range.from, to: range.to });
  const res = await fetchWithAuth(`/admin/driver-team/summary?${q}`);
  return res.json();
}

export async function getTeamRoutes(params: {
  from: string; to: string; sort?: string; order?: string;
  // unassigned có thể null nếu backend cũ chưa trả — FE phải chịu được, đừng
  // giả định luôn có object.
}): Promise<{ data: TeamRouteRow[]; unassigned: TeamRouteRow | null }> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.sort) q.set('sort', params.sort);
  if (params.order) q.set('order', params.order);
  const res = await fetchWithAuth(`/admin/driver-team/routes?${q}`);
  return res.json();
}

export async function getTeamRouteDrivers(
  routeId: number | 'none',
  params: {
    from: string; to: string;
    stage?: string; ownerAdminUserId?: string; minTrips?: number; q?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  },
): Promise<{ data: TeamDriverRow[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.stage) q.set('stage', params.stage);
  if (params.ownerAdminUserId) q.set('ownerAdminUserId', params.ownerAdminUserId);
  if (params.minTrips) q.set('minTrips', String(params.minTrips));
  if (params.q) q.set('q', params.q);
  if (params.sort) q.set('sort', params.sort);
  if (params.order) q.set('order', params.order);
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  // routeId giữ NGUYÊN 'none' — nhóm booking không gắn tuyến.
  const res = await fetchWithAuth(`/admin/driver-team/routes/${routeId}/drivers?${q}`);
  return res.json();
}

export async function getTeamOwners(): Promise<TeamOwner[]> {
  const res = await fetchWithAuth('/admin/driver-team/owners');
  return res.json();
}

export async function getTeamDriverDetail(
  driverId: string,
  range: { from: string; to: string },
): Promise<DriverTeamDetail> {
  const q = new URLSearchParams({ from: range.from, to: range.to });
  const res = await fetchWithAuth(`/admin/driver-team/${driverId}?${q}`);
  return res.json();
}

/**
 * Chỉ gửi field muốn đổi — field vắng mặt KHÔNG bị backend ghi đè null.
 * note: '' nghĩa là XOÁ ghi chú (đồng nhất với updateDriverCsStatus).
 */
export async function patchTeamMember(
  driverId: string,
  body: {
    stage?: DriverTeamStage;
    assignedRouteIds?: number[];
    ownerAdminUserId?: string | null;
    nextFollowUpAt?: string | null;
    note?: string;
  },
): Promise<TeamMemberState> {
  const res = await fetchWithAuth(`/admin/driver-team/${driverId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function addTeamEvent(
  driverId: string,
  body: { type: 'CALL' | 'NOTE'; note?: string },
): Promise<DriverTeamEvent> {
  const res = await fetchWithAuth(`/admin/driver-team/${driverId}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}
```

Thêm các kiểu mới vào dòng `import type { ... } from '@/lib/types'` ở đầu `api.ts`.

- [ ] **Step 5: Chạy test — PASS**

Run: `npx vitest run src/lib/api-driver-team.test.ts && npm run typecheck`
Expected: PASS, typecheck sạch.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/api.ts src/lib/api-driver-team.test.ts
git commit -m "feat(driver-team): kiểu domain + 7 hàm API cho màn đội tài

Dùng lại client tập trung api.ts. routeId 'none' giữ nguyên chuỗi trong path —
ép sang số sẽ thành NaN và khớp nhầm 0 tuyến thay vì nhóm không-gắn-tuyến.
Dropdown người phụ trách gọi endpoint riêng /admin/driver-team/owners chứ KHÔNG
gọi /admin/users (route đó SuperOnly).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Nhãn + định dạng (`driver-team-labels.ts`)

**Files:**
- Create: `src/lib/driver-team-labels.ts`
- Create: `src/lib/driver-team-labels.test.ts`

**Interfaces:**
- Consumes: `DriverTeamStage`, `TeamDriverRow`, `TeamRouteRow` (Task 1).
- Produces:
  - `stageLabel(stage: DriverTeamStage | null | undefined): string`
  - `stageBadgeClass(stage: DriverTeamStage | null | undefined): string`
  - `STAGE_ORDER: DriverTeamStage[]`
  - `formatShare(share: number | null | undefined): string`
  - `driverWarning(row: TeamDriverRow): string | null`
  - `routeNeedsDrivers(row: TeamRouteRow): boolean`
  - `isFollowUpOverdue(iso: string | null | undefined, nowMs?: number): boolean`

- [ ] **Step 1: Viết test thất bại**

`src/lib/driver-team-labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  driverWarning, formatShare, isFollowUpOverdue, routeNeedsDrivers, stageLabel,
} from './driver-team-labels';

describe('stageLabel', () => {
  it('không có row = Tiềm năng, KHÔNG phải chuỗi rỗng', () => {
    expect(stageLabel(null)).toBe('Tiềm năng');
    expect(stageLabel(undefined)).toBe('Tiềm năng');
  });
  it('phân biệt họ-từ-chối với mình-loại', () => {
    expect(stageLabel('DECLINED')).toBe('Từ chối');
    expect(stageLabel('DROPPED')).toBe('Loại');
  });
  it('các bậc còn lại', () => {
    expect(stageLabel('CONTACTED')).toBe('Đã liên hệ');
    expect(stageLabel('INVITED')).toBe('Đã mời');
    expect(stageLabel('JOINED')).toBe('Trong team');
  });
});

describe('formatShare', () => {
  it('0..1 thành phần trăm 1 chữ số thập phân', () => {
    expect(formatShare(0.287)).toBe('28,7%');
  });
  it('0 và null đều ra "—", không ra "NaN%"', () => {
    expect(formatShare(0)).toBe('—');
    expect(formatShare(null)).toBe('—');
    expect(formatShare(undefined)).toBe('—');
  });
});

describe('driverWarning', () => {
  const base = {
    driverId: 'd', fullName: 'A', phone: '09', transportCompanyName: null,
    tripsOnRoute: 1, tripsAllRoutes: 1, shareOfRoute: 1,
    lastCompletedAt: null, firstCompletedAt: null,
    isApproved: true, isBanned: false, suspendedUntil: null, team: null,
  } as any;

  it('bị khoá cứng → cảnh báo ban (ưu tiên cao nhất)', () => {
    expect(driverWarning({ ...base, isBanned: true })).toBe('Đang bị khoá');
  });
  it('khoá tạm CÒN hạn mới cảnh báo', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(driverWarning({ ...base, suspendedUntil: future })).toBe('Đang tạm khoá');
  });
  it('khoá tạm ĐÃ hết hạn thì KHÔNG cảnh báo', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(driverWarning({ ...base, suspendedUntil: past })).toBeNull();
  });
  it('chưa duyệt hồ sơ → cảnh báo', () => {
    expect(driverWarning({ ...base, isApproved: false })).toBe('Chưa duyệt hồ sơ');
  });
  it('bình thường → null', () => {
    expect(driverWarning(base)).toBeNull();
  });
});

describe('routeNeedsDrivers', () => {
  const r = (o: any) => ({ routeId: 1, routeName: 'x', driverCount: 0, completedTrips: 0, totalBookings: 0, lastCompletedAt: null, contactedCount: 0, joinedCount: 0, ...o });

  it('có khách đặt mà 0 tài chạy xong → cần tuyển', () => {
    expect(routeNeedsDrivers(r({ totalBookings: 12, driverCount: 0 }))).toBe(true);
  });
  it('không ai đặt → KHÔNG phải vấn đề tuyển tài', () => {
    expect(routeNeedsDrivers(r({ totalBookings: 0, driverCount: 0 }))).toBe(false);
  });
  it('đã có tài chạy → không gắn cờ', () => {
    expect(routeNeedsDrivers(r({ totalBookings: 12, driverCount: 3 }))).toBe(false);
  });
});

describe('isFollowUpOverdue — mốc theo ngày VN', () => {
  // 2026-08-10T20:00Z === 03:00 ngày 11/8 giờ VN.
  const nowMs = Date.parse('2026-08-10T20:00:00.000Z');

  it('hẹn hôm nay (giờ VN) là ĐẾN HẠN', () => {
    expect(isFollowUpOverdue('2026-08-11T02:00:00.000Z', nowMs)).toBe(true);
  });
  it('hẹn ngày mai giờ VN thì chưa tới hạn', () => {
    expect(isFollowUpOverdue('2026-08-12T02:00:00.000Z', nowMs)).toBe(false);
  });
  it('không hẹn → không quá hạn', () => {
    expect(isFollowUpOverdue(null, nowMs)).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npx vitest run src/lib/driver-team-labels.test.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Viết module**

`src/lib/driver-team-labels.ts`:

```ts
import type { DriverTeamStage, TeamDriverRow, TeamRouteRow } from './types';

export const STAGE_ORDER: DriverTeamStage[] = [
  'CONTACTED', 'INVITED', 'JOINED', 'DECLINED', 'DROPPED',
];

const STAGE_LABEL: Record<DriverTeamStage, string> = {
  CONTACTED: 'Đã liên hệ',
  INVITED: 'Đã mời',
  JOINED: 'Trong team',
  // Tách đôi có chủ đích: "Từ chối" là họ chối mình (còn gọi lại được),
  // "Loại" là mình đóng hẳn. Hai việc tiếp theo khác nhau.
  DECLINED: 'Từ chối',
  DROPPED: 'Loại',
};

/** null/undefined = chưa có row trong driver_team_member = Tiềm năng (spec §4.1). */
export function stageLabel(stage: DriverTeamStage | null | undefined): string {
  return stage ? STAGE_LABEL[stage] : 'Tiềm năng';
}

const STAGE_CLASS: Record<DriverTeamStage, string> = {
  CONTACTED: 'bg-sky-100 text-sky-800',
  INVITED: 'bg-amber-100 text-amber-800',
  JOINED: 'bg-emerald-100 text-emerald-800',
  DECLINED: 'bg-orange-100 text-orange-800',
  DROPPED: 'bg-muted text-muted-foreground',
};

export function stageBadgeClass(stage: DriverTeamStage | null | undefined): string {
  return stage ? STAGE_CLASS[stage] : 'bg-slate-100 text-slate-700';
}

/** 0..1 → '28,7%'. 0 và null đều ra '—' để không hiện "0,0%" gây hiểu là đã đo được. */
export function formatShare(share: number | null | undefined): string {
  if (share == null || !Number.isFinite(share) || share <= 0) return '—';
  return `${(share * 100).toFixed(1).replace('.', ',')}%`;
}

/** Cảnh báo mạnh nhất trước — ban > tạm khoá > chưa duyệt. */
export function driverWarning(row: TeamDriverRow): string | null {
  if (row.isBanned) return 'Đang bị khoá';
  if (row.suspendedUntil && new Date(row.suspendedUntil).getTime() > Date.now()) {
    return 'Đang tạm khoá';
  }
  if (!row.isApproved) return 'Chưa duyệt hồ sơ';
  return null;
}

/**
 * Tuyến CÓ khách đặt nhưng KHÔNG tài nào chạy xong = cần tuyển gấp.
 * Cố ý KHÔNG dùng tỉ lệ completedTrips/totalBookings: hai số đó đếm theo hai mốc
 * thời gian khác nhau (spec §5.1) nên tỉ lệ giữa chúng vô nghĩa.
 */
export function routeNeedsDrivers(row: TeamRouteRow): boolean {
  return row.totalBookings > 0 && row.driverCount === 0;
}

/** Ngày VN của một mốc, độc lập timezone trình duyệt. */
function vnDate(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Đến hạn = ngày hẹn (giờ VN) <= hôm nay (giờ VN). */
export function isFollowUpOverdue(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!iso) return false;
  return vnDate(new Date(iso).getTime()) <= vnDate(nowMs);
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx vitest run src/lib/driver-team-labels.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/driver-team-labels.ts src/lib/driver-team-labels.test.ts
git commit -m "feat(driver-team): nhãn trạng thái + cờ cảnh báo, có test

stage null = 'Tiềm năng' (không có row = chưa chạm tới). Cờ 'Có khách, thiếu
tài' chỉ dựa vào totalBookings>0 && driverCount=0 — KHÔNG dùng tỉ lệ giữa
completedTrips và totalBookings vì hai số đếm theo hai mốc thời gian khác nhau.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Đồng bộ trạng thái giữa các nhóm (`driver-team-sync.ts`)

Đây là lỗi dễ tái phát nhất của thiết kế accordion: `stage` gắn theo **tài**, nhưng một tài chạy nhiều tuyến sẽ hiện ở nhiều nhóm. Đổi ở nhóm A mà quên nhóm B → hai nhóm hiện hai trạng thái khác nhau của cùng một người.

**Files:**
- Create: `src/lib/driver-team-sync.ts`
- Create: `src/lib/driver-team-sync.test.ts`

**Interfaces:**
- Consumes: `TeamDriverRow`, `TeamMemberState` (Task 1).
- Produces:
  - `patchDriverAcrossGroups(groups: Record<string, TeamDriverRow[]>, driverId: string, team: TeamMemberState | null): Record<string, TeamDriverRow[]>`
  - `countUniqueByStage(groups: Record<string, TeamDriverRow[]>, stage: DriverTeamStage): number`

- [ ] **Step 1: Viết test thất bại**

`src/lib/driver-team-sync.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { countUniqueByStage, patchDriverAcrossGroups } from './driver-team-sync';
import type { TeamDriverRow, TeamMemberState } from './types';

const row = (driverId: string, stage: any = null): TeamDriverRow => ({
  driverId, fullName: 'A', phone: '09', transportCompanyName: null,
  tripsOnRoute: 1, tripsAllRoutes: 1, shareOfRoute: 1,
  lastCompletedAt: null, firstCompletedAt: null,
  isApproved: true, isBanned: false, suspendedUntil: null,
  team: stage ? ({ stage, assignedRouteIds: [], ownerAdminUserId: null, ownerAdminName: null, nextFollowUpAt: null, note: null, stageChangedAt: null } as TeamMemberState) : null,
});

const joined: TeamMemberState = {
  stage: 'JOINED', assignedRouteIds: [7], ownerAdminUserId: null, ownerAdminName: null,
  nextFollowUpAt: null, note: null, stageChangedAt: null,
};

describe('patchDriverAcrossGroups', () => {
  it('cập nhật tài ở MỌI nhóm đang mở, không chỉ nhóm vừa bấm', () => {
    const groups = { '7': [row('d1'), row('d2')], '12': [row('d1')] };

    const out = patchDriverAcrossGroups(groups, 'd1', joined);

    expect(out['7'][0].team?.stage).toBe('JOINED');
    expect(out['12'][0].team?.stage).toBe('JOINED');
  });

  it('không đụng tài khác', () => {
    const groups = { '7': [row('d1'), row('d2', 'CONTACTED')] };
    const out = patchDriverAcrossGroups(groups, 'd1', joined);
    expect(out['7'][1].team?.stage).toBe('CONTACTED');
  });

  it('giữ nguyên số liệu chuyến của từng nhóm — chỉ phần team thay đổi', () => {
    const groups = {
      '7': [{ ...row('d1'), tripsOnRoute: 40 }],
      '12': [{ ...row('d1'), tripsOnRoute: 3 }],
    };
    const out = patchDriverAcrossGroups(groups, 'd1', joined);
    expect(out['7'][0].tripsOnRoute).toBe(40);
    expect(out['12'][0].tripsOnRoute).toBe(3);
  });

  it('trả object MỚI (không mutate) để React thấy thay đổi', () => {
    const groups = { '7': [row('d1')] };
    const out = patchDriverAcrossGroups(groups, 'd1', joined);
    expect(out).not.toBe(groups);
    expect(groups['7'][0].team).toBeNull();
  });
});

describe('countUniqueByStage', () => {
  it('tài xuất hiện ở 3 nhóm chỉ đếm 1 lần', () => {
    const groups = {
      '7': [row('d1', 'JOINED')],
      '12': [row('d1', 'JOINED')],
      '15': [row('d1', 'JOINED'), row('d2', 'JOINED')],
    };
    expect(countUniqueByStage(groups, 'JOINED')).toBe(2);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npx vitest run src/lib/driver-team-sync.test.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Viết module**

`src/lib/driver-team-sync.ts`:

```ts
import type { DriverTeamStage, TeamDriverRow, TeamMemberState } from './types';

/** Nhóm cấp 2 đã tải, khoá là routeId dạng chuỗi ('none' cho nhóm không gắn tuyến). */
export type DriverGroups = Record<string, TeamDriverRow[]>;

/**
 * Trạng thái pipeline gắn theo TÀI XẾ, nhưng một tài chạy nhiều tuyến sẽ hiện ở
 * nhiều nhóm accordion. Sau khi PATCH phải lan sang MỌI nhóm đang mở — nếu chỉ
 * cập nhật nhóm vừa bấm thì hai nhóm sẽ hiện hai trạng thái khác nhau của cùng
 * một người. Số liệu chuyến là của từng cặp (tài × tuyến) nên giữ nguyên.
 */
export function patchDriverAcrossGroups(
  groups: DriverGroups,
  driverId: string,
  team: TeamMemberState | null,
): DriverGroups {
  const out: DriverGroups = {};
  for (const [key, rows] of Object.entries(groups)) {
    out[key] = rows.map((r) => (r.driverId === driverId ? { ...r, team } : r));
  }
  return out;
}

/** Đếm TÀI XẾ duy nhất — không đếm dòng, vì một tài nằm ở nhiều nhóm. */
export function countUniqueByStage(groups: DriverGroups, stage: DriverTeamStage): number {
  const ids = new Set<string>();
  for (const rows of Object.values(groups)) {
    for (const r of rows) if (r.team?.stage === stage) ids.add(r.driverId);
  }
  return ids.size;
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx vitest run src/lib/driver-team-sync.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/driver-team-sync.ts src/lib/driver-team-sync.test.ts
git commit -m "feat(driver-team): lan trạng thái sang mọi nhóm accordion đang mở

stage gắn theo TÀI nhưng tài chạy nhiều tuyến hiện ở nhiều nhóm. Không lan thì
hai nhóm hiện hai trạng thái khác nhau của cùng một người. countUniqueByStage
đếm tài duy nhất để thẻ số không nhân ba khi tài chạy ba tuyến.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Dựng dữ liệu export (`driver-team-export.ts`)

**Files:**
- Create: `src/lib/driver-team-export.ts`
- Create: `src/lib/driver-team-export.test.ts`

**Interfaces:**
- Consumes: `TeamDriverRow` (Task 1), `stageLabel`, `formatShare` (Task 2).
- Produces:
  - `EXPORT_HEADER: string[]`
  - `buildExportRows(items: { routeName: string; driver: TeamDriverRow }[], cap?: number): { rows: (string | number)[][]; truncated: number }`

- [ ] **Step 1: Viết test thất bại**

`src/lib/driver-team-export.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildExportRows, EXPORT_HEADER } from './driver-team-export';
import type { TeamDriverRow } from './types';

const drv = (id: string): TeamDriverRow => ({
  driverId: id, fullName: 'Nguyễn A', phone: '0900000001', transportCompanyName: 'HTX X',
  tripsOnRoute: 5, tripsAllRoutes: 9, shareOfRoute: 0.5,
  lastCompletedAt: '2026-08-09T15:12:00.000Z', firstCompletedAt: null,
  isApproved: true, isBanned: false, suspendedUntil: null, team: null,
});

describe('buildExportRows', () => {
  it('xuất PHẲNG có cột tuyến', () => {
    const { rows } = buildExportRows([{ routeName: 'HN – HP', driver: drv('d1') }]);
    expect(EXPORT_HEADER[0]).toBe('Tuyến');
    expect(rows[0][0]).toBe('HN – HP');
  });

  it('số chuyến giữ dạng SỐ để Excel sort/sum được', () => {
    const { rows } = buildExportRows([{ routeName: 'R', driver: drv('d1') }]);
    const idx = EXPORT_HEADER.indexOf('Chuyến trên tuyến');
    expect(typeof rows[0][idx]).toBe('number');
  });

  it('SĐT giữ dạng CHUỖI — số sẽ mất số 0 đầu', () => {
    const { rows } = buildExportRows([{ routeName: 'R', driver: drv('d1') }]);
    const idx = EXPORT_HEADER.indexOf('SĐT');
    expect(rows[0][idx]).toBe('0900000001');
  });

  it('chưa chạm tới hiện "Tiềm năng", không để trống', () => {
    const { rows } = buildExportRows([{ routeName: 'R', driver: drv('d1') }]);
    const idx = EXPORT_HEADER.indexOf('Trạng thái');
    expect(rows[0][idx]).toBe('Tiềm năng');
  });

  it('vượt cap thì CẮT và báo số dòng bị cắt', () => {
    const items = Array.from({ length: 1200 }, (_, i) => ({ routeName: 'R', driver: drv(`d${i}`) }));
    const { rows, truncated } = buildExportRows(items, 1000);
    expect(rows).toHaveLength(1000);
    expect(truncated).toBe(200);
  });

  it('trong cap thì truncated = 0', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ routeName: 'R', driver: drv(`d${i}`) }));
    expect(buildExportRows(items, 1000).truncated).toBe(0);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npx vitest run src/lib/driver-team-export.test.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Viết module**

`src/lib/driver-team-export.ts`:

```ts
import { formatShare, stageLabel } from './driver-team-labels';
import type { TeamDriverRow } from './types';

export const EXPORT_HEADER = [
  'Tuyến', 'Tài xế', 'SĐT', 'Đơn vị vận tải',
  'Chuyến trên tuyến', 'Tỉ trọng tuyến', 'Tổng chuyến mọi tuyến',
  'Chuyến gần nhất', 'Trạng thái', 'Người phụ trách', 'Hẹn gọi lại', 'Ghi chú',
] as const;

/** Ngày VN của một mốc ISO — độc lập timezone trình duyệt. */
function vnDay(iso: string | null): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Ma trận dòng cho xlsx. Xuất PHẲNG (mỗi dòng là một cặp tài × tuyến) vì file này
 * để mang đi gọi điện, phẳng dễ dùng hơn cấu trúc lồng.
 * Số giữ dạng number để Excel sort/sum; SĐT giữ dạng string, ép sang number sẽ
 * mất số 0 đầu.
 */
export function buildExportRows(
  items: { routeName: string; driver: TeamDriverRow }[],
  cap = 1000,
): { rows: (string | number)[][]; truncated: number } {
  const kept = items.slice(0, cap);
  const rows = kept.map(({ routeName, driver: d }) => [
    routeName,
    d.fullName ?? '',
    d.phone ?? '',
    d.transportCompanyName ?? '',
    d.tripsOnRoute,
    formatShare(d.shareOfRoute),
    d.tripsAllRoutes,
    vnDay(d.lastCompletedAt),
    stageLabel(d.team?.stage ?? null),
    d.team?.ownerAdminName ?? '',
    vnDay(d.team?.nextFollowUpAt ?? null),
    d.team?.note ?? '',
  ]);
  return { rows, truncated: Math.max(0, items.length - kept.length) };
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx vitest run src/lib/driver-team-export.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/driver-team-export.ts src/lib/driver-team-export.test.ts
git commit -m "feat(driver-team): dựng dữ liệu export xlsx + cap 1000 dòng

Xuất phẳng có cột tuyến. Số giữ dạng number cho Excel sort/sum được; SĐT giữ
dạng string vì ép sang số sẽ mất số 0 đầu. Vượt cap thì trả kèm số dòng bị cắt
để UI báo rõ thay vì cắt im lặng.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Menu + phân quyền

**Files:**
- Modify: `src/lib/nav-items.tsx`
- Modify: `src/lib/rbac.ts`
- Modify: `src/lib/rbac.test.ts`

**Interfaces:**
- Consumes: không.
- Produces: route `/driver-team` hiện trong menu và qua được guard cho user có function `driver-team`.

- [ ] **Step 1: Viết test thất bại**

Sửa `src/lib/rbac.test.ts` dòng 22-23:

```ts
  it('has exactly 28 menu functions (navItems minus /settings)', () => {
    expect(Object.keys(MENU_FUNCTION_BY_HREF).length).toBe(28); // 2026-08-10: +driver-team
```

Thêm test mới:

```ts
  it('/driver-team là function RIÊNG, không dùng chung với drivers', () => {
    expect(MENU_FUNCTION_BY_HREF['/driver-team']).toBe('driver-team');
    expect(MENU_FUNCTION_BY_HREF['/driver-team']).not.toBe('drivers');
  });

  it('có function drivers KHÔNG mở được /driver-team', () => {
    const opsUser = { isSuperAdmin: false, functions: ['drivers'] } as any;
    expect(isRouteAllowed('/driver-team', opsUser)).toBe(false);
  });
```

(Đảm bảo `isRouteAllowed` nằm trong danh sách import ở đầu file test.)

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npx vitest run src/lib/rbac.test.ts`
Expected: FAIL — `expected 27 to be 28` và `MENU_FUNCTION_BY_HREF['/driver-team']` là `undefined`.

- [ ] **Step 3: Thêm mục menu**

Trong `src/lib/nav-items.tsx`: thêm `Handshake` vào khối import từ `lucide-react`, rồi thêm vào nhóm **Vận hành**, ngay sau mục `/driver-reputation`:

```tsx
      // Cùng cụm "chất lượng tài xế". Quyền RIÊNG driver-team — ops/CSKH không thấy.
      { href: '/driver-team', label: 'Đội tài chuyên nghiệp', icon: Handshake },
```

- [ ] **Step 4: Khai báo function**

Trong `src/lib/rbac.ts`, thêm vào `MENU_FUNCTION_BY_HREF` ngay sau dòng `/driver-reputation`:

```ts
  // Backend: @RequireFunction('driver-team'). KHÁC function 'drivers' — ghi chú
  // tuyển team là dữ liệu nhạy cảm, người xem được danh sách tài xế KHÔNG được đọc.
  '/driver-team': 'driver-team',
```

- [ ] **Step 5: Chạy test — PASS**

Run: `npx vitest run src/lib/rbac.test.ts && npm run typecheck`
Expected: PASS toàn bộ, gồm cả test song ánh navItems ↔ MENU_FUNCTION_BY_HREF.

`function-catalog.ts` **không phải sửa** — nó dựng danh mục tự động từ `navItems`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav-items.tsx src/lib/rbac.ts src/lib/rbac.test.ts
git commit -m "feat(driver-team): mục menu + function quyền riêng driver-team

Test đếm menu 27 -> 28 (con số cố ý khoá cứng để quên khai báo là fail). Thêm
test khẳng định tài khoản có function 'drivers' KHÔNG mở được /driver-team —
đây chính là ranh giới riêng tư mà cả tính năng dựa vào.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Trang + bộ lọc + 4 thẻ số

**Files:**
- Create: `src/app/(app)/driver-team/page.tsx`
- Create: `src/app/(app)/driver-team/components/driver-team-screen.tsx`

**Interfaces:**
- Consumes: `getTeamSummary`, `getTeamRoutes`, `getTeamOwners` (Task 1); `FinanceFilter`, `PRESETS`, `DateRange`.
- Produces: `DriverTeamScreen` — giữ state `range`, `routes`, `summary`, `owners`, `filters`; truyền xuống `RouteAccordion` (Task 7).

- [ ] **Step 1: Viết page shell**

`src/app/(app)/driver-team/page.tsx`:

```tsx
'use client';

import { PageHeader } from '@/components/page-header';
import { DriverTeamScreen } from './components/driver-team-screen';

export default function DriverTeamPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Đội tài chuyên nghiệp"
        description="Tuyến nào đang có tài chạy hoàn thành, trong tuyến đó ai nổi trội, và đã chăm tới đâu. Ghi chú ở màn này RIÊNG TƯ — bộ phận vận hành và CSKH không đọc được."
      />
      <DriverTeamScreen />
    </div>
  );
}
```

- [ ] **Step 2: Viết `driver-team-screen.tsx`**

```tsx
'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getTeamOwners, getTeamRoutes, getTeamSummary } from '@/lib/api';
import type { TeamOwner, TeamRouteRow, TeamSummary } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FinanceFilter, PRESETS, type DateRange } from '../../finance/components/finance-filter';
import { STAGE_ORDER, stageLabel } from '@/lib/driver-team-labels';
import { RouteAccordion } from './route-accordion';

// Preset mặc định gắn theo KEY chứ không theo index — chèn preset vào giữa mảng
// sẽ không âm thầm đổi khoảng ngày mặc định.
const DEFAULT_PRESET = PRESETS.find((p) => p.key === 'last30') ?? PRESETS[0];
const ALL = '__all__';

export type TeamFilters = {
  stage: string;
  ownerAdminUserId: string;
  q: string;
  minTrips: string;
};

function StatCard({ title, value, hint }: { title: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent> : null}
    </Card>
  );
}

export function DriverTeamScreen() {
  const { toast } = useToast();
  const [range, setRange] = React.useState<DateRange>(DEFAULT_PRESET.range());
  const [filters, setFilters] = React.useState<TeamFilters>({
    stage: ALL, ownerAdminUserId: ALL, q: '', minTrips: '',
  });
  const [routes, setRoutes] = React.useState<TeamRouteRow[]>([]);
  const [unassigned, setUnassigned] = React.useState<TeamRouteRow | null>(null);
  const [summary, setSummary] = React.useState<TeamSummary | null>(null);
  const [owners, setOwners] = React.useState<TeamOwner[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [detailDriverId, setDetailDriverId] = React.useState<string | null>(null);
  // `groups` (tài xế đã tải theo từng nhóm tuyến) SỐNG Ở ĐÂY, không ở trong
  // RouteAccordion — cả accordion, drawer (Task 8) và hành động hàng loạt (Task 9)
  // đều phải ghi vào cùng một chỗ, nếu không sẽ có hai bản trạng thái lệch nhau.
  const [groups, setGroups] = React.useState<DriverGroups>({});

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getTeamRoutes(range), getTeamSummary(range)])
      .then(([r, s]) => {
        if (cancelled) return;
        setRoutes(r.data);
        setUnassigned(r.unassigned);
        setSummary(s);
      })
      .catch((e) =>
        toast({ variant: 'destructive', title: 'Không tải được dữ liệu', description: String(e?.message ?? e) }),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [range, toast]);

  React.useEffect(() => {
    getTeamOwners()
      .then(setOwners)
      // Dropdown người phụ trách hỏng KHÔNG được làm sập cả màn.
      .catch(() => setOwners([]));
  }, []);

  return (
    <div className="space-y-6">
      <FinanceFilter value={range} onChange={setRange} isLoading={loading} initialPreset="last30" />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Tài chạy thành công" value={summary?.driversWithCompletedTrips ?? '—'} hint="Trong khoảng ngày đang chọn" />
        <StatCard title="Đã liên hệ" value={summary?.contactedDrivers ?? '—'} hint="Mọi tài đã được chạm tới" />
        <StatCard title="Trong team" value={summary?.joinedDrivers ?? '—'} />
        <StatCard title="Cần gọi lại hôm nay" value={summary?.followUpDueToday ?? '—'} hint="Không phụ thuộc khoảng ngày đang xem" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input
          className="w-64"
          placeholder="Tìm tên tài xế / SĐT"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <Select value={filters.stage} onValueChange={(v) => setFilters((f) => ({ ...f, stage: v }))}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
            {STAGE_ORDER.map((s) => (
              <SelectItem key={s} value={s}>{stageLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.ownerAdminUserId}
          onValueChange={(v) => setFilters((f) => ({ ...f, ownerAdminUserId: v }))}
        >
          <SelectTrigger className="w-56"><SelectValue placeholder="Người phụ trách" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi người phụ trách</SelectItem>
            {owners.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.fullName ?? o.phone ?? o.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-40"
          type="number"
          min={0}
          placeholder="Chuyến tối thiểu"
          value={filters.minTrips}
          onChange={(e) => setFilters((f) => ({ ...f, minTrips: e.target.value }))}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <RouteAccordion
          routes={routes}
          unassigned={unassigned}
          range={range}
          filters={filters}
          owners={owners}
          allValue={ALL}
          groups={groups}
          setGroups={setGroups}
          onSelectDriver={setDetailDriverId}
        />
      )}
    </div>
  );
}
```

Thêm `import { type DriverGroups } from '@/lib/driver-team-sync';` vào đầu file.

- [ ] **Step 3: Smoke check**

Run: `npm run typecheck && npx next build`
Expected: typecheck sạch. `npx next build` chạy xong không lỗi. (Sẽ còn báo thiếu `./route-accordion` — tạo ở Task 7; nếu muốn build xanh ngay thì làm Task 7 trước khi build.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/driver-team"
git commit -m "feat(driver-team): trang + bộ lọc + 4 thẻ số

Dùng lại FinanceFilter/PRESETS của finance để khoảng ngày chuẩn VN, preset mặc
định gắn theo KEY không theo index. Dropdown người phụ trách hỏng thì nuốt lỗi
và để rỗng — không làm sập cả màn.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Accordion tuyến → tài (cấp 1 + cấp 2 tải lazy)

**Files:**
- Create: `src/app/(app)/driver-team/components/route-accordion.tsx`

**Interfaces:**
- Consumes: `getTeamRouteDrivers`, `patchTeamMember` (Task 1); `stageLabel`, `stageBadgeClass`, `formatShare`, `routeNeedsDrivers`, `driverWarning`, `isFollowUpOverdue` (Task 2); `patchDriverAcrossGroups`, `DriverGroups` (Task 3); `TeamFilters` (Task 6).
- Produces: `RouteAccordion` — giữ state `groups: DriverGroups`, gọi `onSelectDriver` để Task 8 mở drawer.

- [ ] **Step 1: Viết component**

`src/app/(app)/driver-team/components/route-accordion.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getTeamRouteDrivers, patchTeamMember } from '@/lib/api';
import type { DriverTeamStage, TeamDriverRow, TeamOwner, TeamRouteRow } from '@/lib/types';
import {
  driverWarning, formatShare, isFollowUpOverdue, routeNeedsDrivers, stageBadgeClass, stageLabel, STAGE_ORDER,
} from '@/lib/driver-team-labels';
import { patchDriverAcrossGroups, type DriverGroups } from '@/lib/driver-team-sync';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DateRange } from '../../finance/components/finance-filter';
import type { TeamFilters } from './driver-team-screen';

const PAGE = 10;

const vnDay = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10) : '—';

export function RouteAccordion({
  routes, unassigned, range, filters, owners, allValue, groups, setGroups, onSelectDriver,
}: {
  routes: TeamRouteRow[];
  unassigned: TeamRouteRow | null;
  range: DateRange;
  filters: TeamFilters;
  owners: TeamOwner[];
  allValue: string;
  // groups sống ở DriverTeamScreen — drawer và hành động hàng loạt cũng ghi vào
  // đúng state này, nên KHÔNG được giữ bản sao cục bộ ở đây.
  groups: DriverGroups;
  setGroups: React.Dispatch<React.SetStateAction<DriverGroups>>;
  onSelectDriver?: (driverId: string) => void;
}) {
  const { toast } = useToast();
  const [loadingKeys, setLoadingKeys] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<string[]>([]);

  const rows = React.useMemo(
    () => (unassigned ? [...routes, unassigned] : routes),
    [routes, unassigned],
  );

  const keyOf = (r: TeamRouteRow) => (r.routeId === null ? 'none' : String(r.routeId));

  const load = React.useCallback(
    async (key: string) => {
      setLoadingKeys((s) => new Set(s).add(key));
      try {
        const res = await getTeamRouteDrivers(key === 'none' ? 'none' : Number(key), {
          from: range.from,
          to: range.to,
          stage: filters.stage === allValue ? undefined : filters.stage,
          ownerAdminUserId: filters.ownerAdminUserId === allValue ? undefined : filters.ownerAdminUserId,
          q: filters.q || undefined,
          minTrips: filters.minTrips ? Number(filters.minTrips) : undefined,
          limit: PAGE,
        });
        setGroups((g) => ({ ...g, [key]: res.data }));
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Không tải được danh sách tài xế', description: String(e?.message ?? e) });
      } finally {
        setLoadingKeys((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    },
    [range, filters, allValue, toast],
  );

  // Đổi bộ lọc/khoảng ngày → dữ liệu đã tải hết hạn. Xoá sạch rồi nạp lại các
  // nhóm ĐANG MỞ, nếu không nhóm mở sẽ hiện số liệu của bộ lọc cũ.
  React.useEffect(() => {
    setGroups({});
    open.forEach((k) => void load(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, filters.stage, filters.ownerAdminUserId, filters.q, filters.minTrips]);

  const onToggle = (keys: string[]) => {
    setOpen(keys);
    keys.filter((k) => !groups[k] && !loadingKeys.has(k)).forEach((k) => void load(k));
  };

  const changeStage = async (driverId: string, stage: DriverTeamStage) => {
    try {
      const team = await patchTeamMember(driverId, { stage });
      // Lan sang MỌI nhóm đang mở — tài chạy nhiều tuyến nằm ở nhiều nhóm.
      setGroups((g) => patchDriverAcrossGroups(g, driverId, team));
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Không đổi được trạng thái', description: String(e?.message ?? e) });
    }
  };

  return (
    <Accordion type="multiple" value={open} onValueChange={onToggle} className="rounded-md border">
      {rows.map((r) => {
        const key = keyOf(r);
        const rowsOfGroup = groups[key];
        return (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex w-full items-center gap-4 pr-4 text-sm">
                <span className="flex-1 text-left font-medium">{r.routeName}</span>
                {routeNeedsDrivers(r) ? (
                  <Badge className="bg-red-100 text-red-800">Có khách, thiếu tài</Badge>
                ) : null}
                <span className="w-28 text-right">{r.driverCount} tài</span>
                <span className="w-32 text-right">{r.completedTrips} hoàn thành</span>
                <span className="w-32 text-right text-muted-foreground">{r.totalBookings} khách đặt</span>
                <span className="w-40 text-right text-muted-foreground">
                  {r.contactedCount} liên hệ · {r.joinedCount} trong team
                </span>
                <span className="w-28 text-right text-muted-foreground">{vnDay(r.lastCompletedAt)}</span>
              </div>
            </AccordionTrigger>

            <AccordionContent className="px-4 pb-4">
              {loadingKeys.has(key) ? (
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : !rowsOfGroup?.length ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Không có tài xế nào chạy thành công trên tuyến này trong khoảng ngày đang chọn.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tài xế</TableHead>
                      <TableHead className="text-right">Chuyến trên tuyến</TableHead>
                      <TableHead className="text-right">Tỉ trọng</TableHead>
                      <TableHead className="text-right">Chuyến gần nhất</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Người phụ trách</TableHead>
                      <TableHead>Hẹn gọi lại</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsOfGroup.map((d: TeamDriverRow) => {
                      const warn = driverWarning(d);
                      return (
                        <TableRow key={d.driverId}>
                          <TableCell>
                            <div className="font-medium">{d.fullName ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">
                              <a href={`tel:${d.phone ?? ''}`} className="hover:underline">{d.phone ?? '—'}</a>
                              {d.transportCompanyName ? ` · ${d.transportCompanyName}` : ''}
                            </div>
                            {warn ? <Badge className="mt-1 bg-red-100 text-red-800">{warn}</Badge> : null}
                          </TableCell>
                          <TableCell className="text-right">{d.tripsOnRoute}</TableCell>
                          <TableCell className="text-right">{formatShare(d.shareOfRoute)}</TableCell>
                          <TableCell className="text-right">{vnDay(d.lastCompletedAt)}</TableCell>
                          <TableCell>
                            <Select
                              value={d.team?.stage ?? ''}
                              onValueChange={(v) => void changeStage(d.driverId, v as DriverTeamStage)}
                            >
                              <SelectTrigger className="h-8 w-36">
                                <SelectValue placeholder={stageLabel(null)}>
                                  <span className={`rounded px-2 py-0.5 text-xs ${stageBadgeClass(d.team?.stage ?? null)}`}>
                                    {stageLabel(d.team?.stage ?? null)}
                                  </span>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {STAGE_ORDER.map((s) => (
                                  <SelectItem key={s} value={s}>{stageLabel(s)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm">{d.team?.ownerAdminName ?? '—'}</TableCell>
                          <TableCell className="text-sm">
                            <span className={isFollowUpOverdue(d.team?.nextFollowUpAt) ? 'font-medium text-red-600' : ''}>
                              {vnDay(d.team?.nextFollowUpAt ?? null)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => onSelectDriver?.(d.driverId)}>
                              Chi tiết
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              <p className="pt-3 text-xs text-muted-foreground">
                Trạng thái áp cho TÀI XẾ, không theo từng tuyến — đổi ở đây sẽ đổi trên mọi tuyến người đó chạy.
              </p>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
```

- [ ] **Step 2: Kiểm**

Run: `npm run typecheck && npx next build`
Expected: sạch.

- [ ] **Step 3: Kiểm bằng mắt trên dev server**

Run: `npm run dev` → mở `http://localhost:9002/driver-team`
Kiểm đủ 4 điều:
1. Danh sách hiện **mọi tuyến**, gồm tuyến có `0 tài` (đây là điểm dễ hỏng nhất — nếu tuyến rỗng biến mất thì backend đang `GROUP BY` từ booking thay vì join từ `defined_routes`).
2. Hàng **"Không gắn tuyến"** nằm cuối.
3. Mở một tuyến → danh sách tài tải lazy, sort theo số chuyến giảm dần.
4. Nếu tìm được một tài chạy **2 tuyến**: mở cả hai nhóm, đổi trạng thái ở nhóm A → badge ở nhóm B **đổi theo ngay**, không cần tải lại.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/driver-team/components"
git commit -m "feat(driver-team): accordion tuyến -> tài, tải lazy khi mở nhóm

Hiện MỌI tuyến kể cả 0 tài, cộng hàng 'Không gắn tuyến' cuối danh sách. Cột tỉ
trọng cho biết tuyến đang sống nhờ một người hay nhiều người. Đổi trạng thái lan
sang mọi nhóm đang mở vì stage gắn theo tài, không theo tuyến. Hai cột 'hoàn
thành' và 'khách đặt' để RIÊNG, không viết thành phân số — chúng đếm theo hai
mốc thời gian khác nhau.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Drawer chi tiết + export Excel

**Files:**
- Create: `src/app/(app)/driver-team/components/driver-team-drawer.tsx`
- Modify: `src/app/(app)/driver-team/components/driver-team-screen.tsx`
- Modify: `src/app/(app)/driver-team/components/route-accordion.tsx`

**Interfaces:**
- Consumes: `getTeamDriverDetail`, `patchTeamMember`, `addTeamEvent` (Task 1); `getDriverReputation`, `getDriverCallHistory` (đã có sẵn trong `api.ts`); `buildExportRows`, `EXPORT_HEADER` (Task 4); `downloadXlsx` (`src/lib/csv.ts`).
- Produces: `DriverTeamDrawer`.

- [ ] **Step 1: Viết drawer**

`src/app/(app)/driver-team/components/driver-team-drawer.tsx` — dùng `Sheet` của shadcn. Nội dung theo spec §6.2, chia 5 khối:

```tsx
'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  addTeamEvent, getDriverCallHistory, getDriverReputation, getTeamDriverDetail, patchTeamMember,
} from '@/lib/api';
import type {
  DriverCallEvent, DriverReputation, DriverTeamDetail, DriverTeamStage, TeamOwner,
} from '@/lib/types';
import { stageLabel, STAGE_ORDER } from '@/lib/driver-team-labels';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DateRange } from '../../finance/components/finance-filter';

const vnDay = (iso: string | null | undefined) =>
  iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10) : '—';

export function DriverTeamDrawer({
  driverId, range, owners, onClose, onSaved,
}: {
  driverId: string | null;
  range: DateRange;
  owners: TeamOwner[];
  onClose: () => void;
  onSaved: (driverId: string, team: DriverTeamDetail['team']) => void;
}) {
  const { toast } = useToast();
  const [detail, setDetail] = React.useState<DriverTeamDetail | null>(null);
  const [reputation, setReputation] = React.useState<DriverReputation | null>(null);
  const [csCalls, setCsCalls] = React.useState<DriverCallEvent[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [callNote, setCallNote] = React.useState('');

  React.useEffect(() => {
    if (!driverId) return;
    setLoading(true);
    setDetail(null);
    setReputation(null);
    setCsCalls([]);
    getTeamDriverDetail(driverId, range)
      .then(setDetail)
      .catch((e) => toast({ variant: 'destructive', title: 'Không tải được chi tiết', description: String(e?.message ?? e) }))
      .finally(() => setLoading(false));
    // Hai nguồn phụ: hỏng thì bỏ qua, KHÔNG chặn drawer.
    getDriverReputation(driverId).then(setReputation).catch(() => setReputation(null));
    getDriverCallHistory(driverId).then(setCsCalls).catch(() => setCsCalls([]));
  }, [driverId, range, toast]);

  const save = async (body: Parameters<typeof patchTeamMember>[1]) => {
    if (!driverId) return;
    try {
      const team = await patchTeamMember(driverId, body);
      setDetail((d) => (d ? { ...d, team } : d));
      onSaved(driverId, team);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Không lưu được', description: String(e?.message ?? e) });
    }
  };

  const logCall = async () => {
    if (!driverId) return;
    try {
      await addTeamEvent(driverId, { type: 'CALL', note: callNote || undefined });
      setCallNote('');
      const fresh = await getTeamDriverDetail(driverId, range);
      setDetail(fresh);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Không ghi được cuộc gọi', description: String(e?.message ?? e) });
    }
  };

  const registered = new Set(detail?.registeredRouteIds ?? []);
  const run = new Set((detail?.routesRun ?? []).map((r) => r.routeId).filter((x): x is number => x != null));

  return (
    <Sheet open={!!driverId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>Chi tiết tài xế</SheetTitle></SheetHeader>

        {loading || !detail ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-6 py-4">
            {/* 1. Pipeline */}
            <section className="space-y-3">
              <h3 className="text-sm font-medium">Pipeline tuyển team</h3>
              <Select
                value={detail.team?.stage ?? ''}
                onValueChange={(v) => void save({ stage: v as DriverTeamStage })}
              >
                <SelectTrigger><SelectValue placeholder={stageLabel(null)} /></SelectTrigger>
                <SelectContent>
                  {STAGE_ORDER.map((s) => <SelectItem key={s} value={s}>{stageLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select
                value={detail.team?.ownerAdminUserId ?? ''}
                onValueChange={(v) => void save({ ownerAdminUserId: v || null })}
              >
                <SelectTrigger><SelectValue placeholder="Chưa gán người phụ trách" /></SelectTrigger>
                <SelectContent>
                  {owners.map((o) => <SelectItem key={o.id} value={o.id}>{o.fullName ?? o.phone ?? o.id}</SelectItem>)}
                </SelectContent>
              </Select>

              <div>
                <label className="text-xs text-muted-foreground">Hẹn gọi lại (ngày VN)</label>
                <Input
                  type="date"
                  defaultValue={detail.team?.nextFollowUpAt ? vnDay(detail.team.nextFollowUpAt) : ''}
                  onChange={(e) =>
                    void save({
                      // Ngày VN người dùng chọn → 09:00 giờ VN = 02:00Z, tránh lệch ngày
                      // khi backend so sánh theo mốc VN.
                      nextFollowUpAt: e.target.value ? `${e.target.value}T02:00:00.000Z` : null,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Ghi chú riêng (ops/CSKH không đọc được)</label>
                <Textarea
                  defaultValue={detail.team?.note ?? ''}
                  onBlur={(e) => void save({ note: e.target.value })}
                  rows={3}
                />
              </div>
            </section>

            {/* 2. Tuyến: thực chạy vs đăng ký */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Tuyến thực chạy so với tuyến đăng ký</h3>
              {detail.routesRun.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có chuyến hoàn thành trong kỳ.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {detail.routesRun.map((r) => (
                    <li key={String(r.routeId)} className="flex items-center gap-2">
                      <span className="flex-1">{r.name ?? 'Không gắn tuyến'}</span>
                      <span className="text-muted-foreground">{r.trips} chuyến</span>
                      {r.routeId != null && !registered.has(r.routeId) ? (
                        <Badge className="bg-amber-100 text-amber-800">Chạy nhưng chưa đăng ký</Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {detail.registeredRouteIds.filter((id) => !run.has(id)).length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Đăng ký {detail.registeredRouteIds.filter((id) => !run.has(id)).length} tuyến nhưng không chạy chuyến nào trong kỳ.
                </p>
              ) : null}
            </section>

            {/* 3. Điểm & đánh giá */}
            <section className="space-y-1">
              <h3 className="text-sm font-medium">Điểm &amp; đánh giá</h3>
              {reputation === null ? (
                <p className="text-sm text-muted-foreground">Chưa tải được điểm.</p>
              ) : (
                <p className="text-sm">
                  {reputation.displayStars != null
                    ? `${reputation.displayStars.toFixed(1)} sao · ${reputation.ratingCount} đánh giá`
                    : 'Chưa đủ đánh giá để công khai'}
                </p>
              )}
            </section>

            {/* 4. Ghi nhận cuộc gọi + log riêng */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Nhật ký chăm sóc (riêng tư)</h3>
              <div className="flex gap-2">
                <Input value={callNote} onChange={(e) => setCallNote(e.target.value)} placeholder="Nội dung cuộc gọi" />
                <Button onClick={() => void logCall()}>Ghi nhận gọi</Button>
              </div>
              <ul className="space-y-1 text-sm">
                {detail.events.map((e) => (
                  <li key={e.id} className="text-muted-foreground">
                    {vnDay(e.createdAt)} · {e.type}
                    {e.toStage ? ` → ${stageLabel(e.toStage)}` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </li>
                ))}
              </ul>
            </section>

            {/* 5. Log CSKH — CHỈ ĐỌC */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Lịch sử CSKH đã gọi (chỉ đọc)</h3>
              {csCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground">CSKH chưa liên hệ tài này.</p>
              ) : (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {csCalls.map((c) => (
                    <li key={c.id}>{vnDay(c.createdAt)} · {c.type}{c.note ? ` · ${c.note}` : ''}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Nối drawer vào screen**

`groups` đã sống ở `DriverTeamScreen` (Task 6), nên drawer chỉ cần ghi vào đúng state đó. Thêm vào `driver-team-screen.tsx`:

```tsx
const handleSaved = React.useCallback(
  (driverId: string, team: DriverTeamDetail['team']) => {
    // Cùng một hàm với accordion — lưu ở drawer cũng phải lan sang mọi nhóm
    // đang mở, nếu không bảng phía sau drawer sẽ hiện trạng thái cũ.
    setGroups((g) => patchDriverAcrossGroups(g, driverId, team));
  },
  [],
);
```

```tsx
<DriverTeamDrawer
  driverId={detailDriverId}
  range={range}
  owners={owners}
  onClose={() => setDetailDriverId(null)}
  onSaved={handleSaved}
/>
```

Import thêm: `patchDriverAcrossGroups` từ `@/lib/driver-team-sync`, `DriverTeamDetail` và `TeamDriverRow` từ `@/lib/types`, `buildExportRows` + `EXPORT_HEADER` từ `@/lib/driver-team-export`, `downloadXlsx` từ `@/lib/csv`, `getTeamRouteDrivers` từ `@/lib/api`, và `DriverTeamDrawer` từ `./driver-team-drawer`.

- [ ] **Step 3: Thêm export**

Trong `driver-team-screen.tsx`, thêm nút **"Xuất Excel"** cạnh bộ lọc:

```tsx
const [exporting, setExporting] = React.useState(false);

const handleExport = async () => {
  setExporting(true);
  try {
    const targets = unassigned ? [...routes, unassigned] : routes;
    const items: { routeName: string; driver: TeamDriverRow }[] = [];
    for (const r of targets) {
      const key = r.routeId === null ? ('none' as const) : r.routeId;
      let page = 1;
      // Lặp trang tới khi hết hoặc chạm cap — cap áp ở buildExportRows.
      for (;;) {
        const res = await getTeamRouteDrivers(key, { from: range.from, to: range.to, page, limit: 200 });
        items.push(...res.data.map((d) => ({ routeName: r.routeName, driver: d })));
        if (page >= res.meta.totalPages || res.data.length === 0 || items.length >= 1000) break;
        page += 1;
      }
      if (items.length >= 1000) break;
    }
    const { rows, truncated } = buildExportRows(items);
    const stamp = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    await downloadXlsx(`doi-tai-chuyen-nghiep_${stamp}.xlsx`, [...EXPORT_HEADER], rows, 'Đội tài');
    if (truncated > 0) {
      toast({
        title: 'File đã bị cắt bớt',
        description: `Chỉ xuất 1000 dòng đầu, bỏ qua ${truncated} dòng. Thu hẹp khoảng ngày hoặc lọc theo tuyến rồi xuất lại.`,
      });
    }
  } catch (e: any) {
    toast({ variant: 'destructive', title: 'Xuất file thất bại', description: String(e?.message ?? e) });
  } finally {
    setExporting(false);
  }
};
```

- [ ] **Step 4: Kiểm**

Run: `npm run typecheck && npx vitest run && npx next build`
Expected: toàn bộ sạch.

- [ ] **Step 5: Kiểm bằng mắt**

Run: `npm run dev` → `/driver-team`
1. Mở drawer một tài: thấy pipeline, đối chiếu tuyến chạy vs đăng ký, điểm sao, log riêng, log CSKH chỉ-đọc.
2. Đổi trạng thái trong drawer → badge ngoài bảng đổi theo **ở mọi nhóm đang mở**.
3. Ghi nhận một cuộc gọi → xuất hiện trong nhật ký, **trạng thái KHÔNG tự đổi**.
4. Bấm "Xuất Excel" → file mở được bằng Excel, các cột tách đúng, cột SĐT còn số 0 đầu.
5. Đăng nhập bằng tài khoản chỉ có function `drivers` (không có `driver-team`) → **không thấy mục menu**, gõ thẳng `/driver-team` bị đá về `/no-access`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/driver-team"
git commit -m "feat(driver-team): drawer chi tiết + export Excel

Drawer đối chiếu tuyến THỰC CHẠY với tuyến ĐĂNG KÝ (chỗ lệch là thông tin đáng
giá nhất), nhúng điểm sao tải lazy, và hiện log CSKH ở chế độ CHỈ ĐỌC để hai bên
không gọi chồng nhau. Ghi nhận cuộc gọi cố ý không tự đổi trạng thái.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Chọn nhiều dòng + hành động hàng loạt + tìm kiếm tự bung

Hai phần của spec §6.4 chưa được phủ ở Task 1–8.

**Files:**
- Create: `src/lib/driver-team-bulk.ts`
- Create: `src/lib/driver-team-bulk.test.ts`
- Modify: `src/app/(app)/driver-team/components/route-accordion.tsx`
- Modify: `src/app/(app)/driver-team/components/driver-team-screen.tsx`

**Interfaces:**
- Consumes: `patchTeamMember` (Task 1), `patchDriverAcrossGroups` (Task 3).
- Produces:
  - `applyBulk(driverIds: string[], body: BulkBody, patch: PatchFn, max?: number): Promise<BulkResult>`
  - `BulkResult = { ok: string[]; failed: { driverId: string; message: string }[]; skipped: string[] }`
  - `matchingRouteKeys(groups: DriverGroups, q: string): string[]`

- [ ] **Step 1: Viết test thất bại**

`src/lib/driver-team-bulk.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { applyBulk } from './driver-team-bulk';

describe('applyBulk', () => {
  it('gọi tuần tự từng tài, trả danh sách thành công', async () => {
    const patch = vi.fn().mockResolvedValue({ stage: 'JOINED' });
    const out = await applyBulk(['d1', 'd2'], { stage: 'JOINED' }, patch as any);
    expect(patch).toHaveBeenCalledTimes(2);
    expect(out.ok).toEqual(['d1', 'd2']);
    expect(out.failed).toEqual([]);
  });

  it('một dòng lỗi KHÔNG chặn các dòng còn lại, và nêu ĐÍCH DANH dòng lỗi', async () => {
    const patch = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('403 Forbidden'))
      .mockResolvedValueOnce({});

    const out = await applyBulk(['d1', 'd2', 'd3'], { stage: 'JOINED' }, patch as any);

    expect(out.ok).toEqual(['d1', 'd3']);
    expect(out.failed).toEqual([{ driverId: 'd2', message: '403 Forbidden' }]);
  });

  it('vượt trần 50 thì CẮT và báo phần bị bỏ, không âm thầm chạy hết', async () => {
    const patch = vi.fn().mockResolvedValue({});
    const ids = Array.from({ length: 70 }, (_, i) => `d${i}`);

    const out = await applyBulk(ids, { stage: 'JOINED' }, patch as any, 50);

    expect(patch).toHaveBeenCalledTimes(50);
    expect(out.skipped).toHaveLength(20);
  });

  it('danh sách rỗng → không gọi API lần nào', async () => {
    const patch = vi.fn();
    const out = await applyBulk([], { stage: 'JOINED' }, patch as any);
    expect(patch).not.toHaveBeenCalled();
    expect(out.ok).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npx vitest run src/lib/driver-team-bulk.test.ts`
Expected: FAIL — không tìm thấy module.

- [ ] **Step 3: Viết module**

`src/lib/driver-team-bulk.ts`:

```ts
import type { DriverTeamStage, TeamMemberState } from './types';
import type { DriverGroups } from './driver-team-sync';

export type BulkBody = { stage?: DriverTeamStage; ownerAdminUserId?: string | null };
export type PatchFn = (driverId: string, body: BulkBody) => Promise<TeamMemberState>;

export type BulkResult = {
  ok: string[];
  failed: { driverId: string; message: string }[];
  /** Bị bỏ vì vượt trần — PHẢI báo cho người dùng, không nuốt. */
  skipped: string[];
};

/**
 * Chạy TUẦN TỰ, không song song: mỗi lượt là một PATCH sinh event, chạy song song
 * sẽ dội request và làm thứ tự event trong nhật ký thành ngẫu nhiên.
 * Trần 50 dòng/lần — thao tác này dùng vài chục lần một ngày, không đáng làm
 * endpoint bulk riêng ở backend chỉ để tiết kiệm vài request.
 */
export async function applyBulk(
  driverIds: string[],
  body: BulkBody,
  patch: PatchFn,
  max = 50,
): Promise<BulkResult> {
  const targets = driverIds.slice(0, max);
  const skipped = driverIds.slice(max);
  const ok: string[] = [];
  const failed: { driverId: string; message: string }[] = [];

  for (const id of targets) {
    try {
      await patch(id, body);
      ok.push(id);
    } catch (e: any) {
      failed.push({ driverId: id, message: String(e?.message ?? e) });
    }
  }

  return { ok, failed, skipped };
}

/** Khoá của các nhóm có ít nhất một tài khớp từ khoá — để tự bung accordion. */
export function matchingRouteKeys(groups: DriverGroups, q: string): string[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return Object.entries(groups)
    .filter(([, rows]) =>
      rows.some(
        (r) =>
          (r.fullName ?? '').toLowerCase().includes(needle) ||
          (r.phone ?? '').includes(needle),
      ),
    )
    .map(([key]) => key);
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx vitest run src/lib/driver-team-bulk.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Thêm checkbox chọn dòng vào accordion**

Trong `route-accordion.tsx`: thêm prop `selected: Set<string>` + `onToggleSelect: (driverId: string) => void`, và một cột `<TableCell>` đầu tiên chứa `<Checkbox checked={selected.has(d.driverId)} onCheckedChange={() => onToggleSelect(d.driverId)} />` (thêm `<TableHead />` tương ứng). Import `Checkbox` từ `@/components/ui/checkbox`.

**Chọn theo `driverId`, KHÔNG theo cặp (tài × tuyến).** Trạng thái gắn theo tài, nên tick một người ở nhóm A tức là tick chính người đó ở mọi nhóm — dùng `Set<string>` của `driverId` khiến điều đó đúng tự nhiên và tránh cảnh cùng một người bị PATCH hai lần trong một lượt hàng loạt.

- [ ] **Step 6: Thanh hành động hàng loạt trong screen**

Thêm vào `driver-team-screen.tsx` (hiện khi `selected.size > 0`):

```tsx
const [selected, setSelected] = React.useState<Set<string>>(new Set());

const toggleSelect = React.useCallback((driverId: string) => {
  setSelected((s) => {
    const n = new Set(s);
    n.has(driverId) ? n.delete(driverId) : n.add(driverId);
    return n;
  });
}, []);

const runBulk = async (body: BulkBody) => {
  const res = await applyBulk([...selected], body, patchTeamMember);
  // Lan kết quả vào bảng: đọc lại state của từng tài đã đổi thành công.
  setGroups((g) => {
    let next = g;
    for (const id of res.ok) {
      const row = Object.values(next).flat().find((r) => r.driverId === id);
      if (row?.team) next = patchDriverAcrossGroups(next, id, { ...row.team, ...body } as any);
    }
    return next;
  });

  if (res.failed.length) {
    toast({
      variant: 'destructive',
      title: `${res.failed.length} dòng lỗi`,
      description: res.failed.map((f) => `${f.driverId}: ${f.message}`).join('; '),
    });
  }
  if (res.skipped.length) {
    toast({
      title: 'Chỉ xử lý 50 dòng mỗi lượt',
      description: `Còn ${res.skipped.length} dòng chưa xử lý — chọn lại rồi chạy tiếp.`,
    });
  }
  if (res.ok.length && !res.failed.length && !res.skipped.length) {
    toast({ title: `Đã cập nhật ${res.ok.length} tài xế` });
  }
  setSelected(new Set());
};
```

Thanh hiện: `Đã chọn {selected.size}` + `Select` đổi trạng thái + `Select` gán người phụ trách + nút *Bỏ chọn*.

> **Lưu ý:** `runBulk` cập nhật lạc quan từ `body`. Nếu muốn chắc chắn khớp backend thì tải lại các nhóm đang mở sau khi xong — đánh đổi giữa một lần tải thêm và rủi ro lệch hiển thị. Với thao tác chỉ đổi `stage`/`owner` thì cập nhật lạc quan là đủ.

- [ ] **Step 7: Tìm kiếm tự bung nhóm khớp**

Trong `route-accordion.tsx`, thêm effect: khi `filters.q` khác rỗng và dữ liệu nhóm đã tải xong, gọi `matchingRouteKeys(groups, filters.q)` và `setOpen((o) => Array.from(new Set([...o, ...keys])))`.

**Giới hạn đã biết, phải ghi rõ trên UI:** chỉ bung được nhóm **đã tải**. Nhóm chưa mở lần nào thì client không có dữ liệu để so khớp. Vì vậy khi `filters.q` khác rỗng, hiện dòng chú thích dưới thanh lọc:

```tsx
{filters.q ? (
  <p className="text-xs text-muted-foreground">
    Tìm kiếm chỉ soi trong các tuyến đã mở. Mở thêm tuyến để tìm rộng hơn.
  </p>
) : null}
```

Nói thẳng giới hạn còn hơn để người dùng tin là đã tìm hết rồi kết luận "tài này không chạy tuyến nào".

- [ ] **Step 8: Kiểm**

Run: `npm run typecheck && npx vitest run && npx next build`
Expected: sạch.

Kiểm bằng mắt trên `npm run dev`:
1. Tick 3 tài ở 2 nhóm khác nhau → đổi trạng thái hàng loạt → cả 3 đổi, badge đồng bộ ở mọi nhóm.
2. Tick cùng một tài xuất hiện ở 2 nhóm → chỉ tính **1** dòng (`Đã chọn 1`).
3. Gõ tên vào ô tìm → các nhóm đã tải có kết quả tự bung, kèm dòng chú thích giới hạn.

- [ ] **Step 9: Commit**

```bash
git add src/lib/driver-team-bulk.ts src/lib/driver-team-bulk.test.ts "src/app/(app)/driver-team/components"
git commit -m "feat(driver-team): chọn nhiều dòng, hành động hàng loạt, tìm kiếm tự bung

Chạy tuần tự tối đa 50 dòng/lượt, một dòng lỗi không chặn phần còn lại và báo
ĐÍCH DANH dòng lỗi thay vì 'có lỗi xảy ra'. Chọn theo driverId chứ không theo
cặp (tài x tuyến) nên cùng một người ở hai nhóm không bị PATCH hai lần.

Tìm kiếm chỉ soi được nhóm ĐÃ tải — ghi rõ giới hạn này trên UI thay vì để
người dùng tưởng đã tìm hết.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Sau khi xong 9 task

1. `npm run typecheck && npx vitest run` — cổng kiểm thật (build **không** chặn lỗi type).
2. Merge `feat/driver-team` → `dev`, deploy DEV, **test runtime trên DEV** (cổng bắt buộc). Kiểm lại đúng 3 thứ dễ vỡ nhất: tuyến 0 tài **có hiện**; tài chạy nhiều tuyến đổi trạng thái **đồng bộ mọi nhóm**; tài khoản không có function `driver-team` **không vào được**.
3. PR `feat/driver-team` → `main`. Merge = deploy prod (`npm run build`).
4. Resync `main` → `dev`.
