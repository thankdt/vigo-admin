# Cancel-Rate Review — P2 Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Trang admin (`vigo-admin`) hiển thị tỉ lệ huỷ theo tài xế + trạng thái khoá, cho admin theo dõi (Rule C vàng, Rule B đỏ) và ban/unban/suspend thủ công. Tiêu thụ backend P1 đã deploy.

**Architecture:** Một trang bảng (mirror `leakage-review/page.tsx`) đọc `GET /admin/driver-cancel-stats`, tô màu theo ngưỡng, lọc theo khoảng ngày VN (dùng `FinanceFilter`), và gọi các endpoint ban/unban/suspend **đã có sẵn** trong `src/lib/api.ts`.

**Tech Stack:** Next.js 15 (App Router, React 19, TS), shadcn/ui, vitest.

## Global Constraints

- **Backend contract (P1 đã ship):** `GET /admin/driver-cancel-stats?from=YYYY-MM-DD&to=YYYY-MM-DD` → mảng
  `{ driverEntityId: string; driverUserId: string; fullName: string; phone: string; assignedTrips: number;
  customerCancels: number; ratePct: number; cancelRuleAStrikes: number; suspendedUntil: string|null;
  isBanned: boolean; depositForfeitFlagged: boolean; lastAlertReason: string|null; lastAlertAt: string|null }`.
  Admin-guarded. `from/to` là **VN-local date** (backend parse `+07:00`). Sort sẵn theo `ratePct` DESC.
- **Ngưỡng màu (từ spec §11):** ratePct **> 50 đỏ**, **30–50 vàng**, **< 30 thường**. (Ngưỡng thật do backend config, panel chỉ tô theo giá trị trả về — dùng 50/30 làm mốc màu.)
- **Ban/suspend endpoints ĐÃ CÓ** trong `src/lib/api.ts`: `banDriver(id,reason,note?)` (:376), `unbanDriver(id,note?)` (:386), `suspendDriver(id, {durationMinutes|until, reason})` (:397), `unsuspendDriver(id,note?)` (:413). **KHÔNG tạo lại.** `id` = Driver.id = `driverEntityId`.
- **VN timezone:** mọi mốc thời gian (suspendedUntil, lastAlertAt) hiển thị VN (UTC+7) qua `formatVnDateTime` từ `leakage-review/leakage-labels.ts` (Intl `Asia/Ho_Chi_Minh`).
- **Static gate mỗi task:** `npx tsc --noEmit` + `npx vitest run` sạch.
- **Additive:** trang mới + client function mới + type mới; không đổi trang/endpoint hiện có.

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/lib/types.ts` | thêm type `DriverCancelStat` (modify) |
| `src/lib/api.ts` | thêm `getDriverCancelStats(from?,to?)` (modify) |
| `src/app/(app)/driver-cancel-review/cancel-labels.ts` | màu ngưỡng + helper (create) |
| `src/app/(app)/driver-cancel-review/page.tsx` | bảng + filter + action (create) |
| `src/app/(app)/driver-cancel-review/components/driver-action-dialog.tsx` | dialog ban/suspend (create) |
| `src/app/(app)/layout.tsx` | thêm mục nav (modify) |

---

## Task 1: Type + API client

**Files:**
- Modify: `src/lib/types.ts` (thêm `DriverCancelStat`)
- Modify: `src/lib/api.ts` (thêm `getDriverCancelStats`)

**Interfaces:**
- Produces: `type DriverCancelStat` (đúng 13 field ở Global Constraints); `async function getDriverCancelStats(from?: string, to?: string): Promise<DriverCancelStat[]>`.

- [ ] **Step 1: Thêm type** vào `src/lib/types.ts`:

```ts
export type DriverCancelStat = {
  driverEntityId: string;
  driverUserId: string;
  fullName: string;
  phone: string;
  assignedTrips: number;
  customerCancels: number;
  ratePct: number;
  cancelRuleAStrikes: number;
  suspendedUntil: string | null;
  isBanned: boolean;
  depositForfeitFlagged: boolean;
  lastAlertReason: string | null;
  lastAlertAt: string | null;
};
```

- [ ] **Step 2: Thêm client** vào `src/lib/api.ts` — mirror `getLeakageTraces`'s `unwrap`/base-URL pattern (đọc `getLeakageTraces` trong file để copy đúng cách gọi + `unwrap`):

```ts
export async function getDriverCancelStats(from?: string, to?: string): Promise<DriverCancelStat[]> {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  const res = await fetchWithAuth(`/admin/driver-cancel-stats${qs ? `?${qs}` : ''}`); // fetchWithAuth: helper thật getLeakageTraces dùng (api.ts:50)
  return unwrap<DriverCancelStat[]>(res); // unwrap: tên thật, api.ts:1237
}
```
(**Xác nhận review**: helper thật là `fetchWithAuth` (api.ts:50), `unwrap` (api.ts:1237) — dùng đúng như trên.)

- [ ] **Step 3: tsc + vitest**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sạch.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/api.ts
git commit -m "feat(cancel-review): type DriverCancelStat + getDriverCancelStats client

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Labels — màu ngưỡng + helper

**Files:**
- Create: `src/app/(app)/driver-cancel-review/cancel-labels.ts`
- Create: `src/app/(app)/driver-cancel-review/cancel-labels.test.ts`

**Interfaces:**
- Produces: `rateBadgeClass(pct: number): string` (đỏ >50, vàng 30–50, xám <30, kèm `hover:` để không bị cva override — mirror `verdictBadgeClass` trong `leakage-labels.ts`); `driverStatus(s: Pick<DriverCancelStat,'isBanned'|'suspendedUntil'>): { label: string; variant: 'destructive'|'secondary'|'default' }`.

- [ ] **Step 1: Test** `cancel-labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rateBadgeClass, driverStatus } from './cancel-labels';

describe('rateBadgeClass', () => {
  it('>50 đỏ, 30-50 vàng, <30 xám', () => {
    expect(rateBadgeClass(60)).toContain('red');
    expect(rateBadgeClass(40)).toContain('amber');
    expect(rateBadgeClass(10)).toContain('slate');
  });
  it('biên: 50 chưa đỏ (chỉ >50), 30 là vàng', () => {
    expect(rateBadgeClass(50)).toContain('amber'); // 50 thuộc 30–50
    expect(rateBadgeClass(30)).toContain('amber');
    expect(rateBadgeClass(29)).toContain('slate');
  });
});

describe('driverStatus', () => {
  it('banned → destructive', () => {
    expect(driverStatus({ isBanned: true, suspendedUntil: null }).variant).toBe('destructive');
  });
  it('suspended tương lai → secondary', () => {
    expect(driverStatus({ isBanned: false, suspendedUntil: new Date(Date.now()+3600_000).toISOString() }).variant).toBe('secondary');
  });
  it('suspend đã hết hạn → default (active)', () => {
    expect(driverStatus({ isBanned: false, suspendedUntil: new Date(Date.now()-3600_000).toISOString() }).variant).toBe('default');
  });
  it('không khoá → default', () => {
    expect(driverStatus({ isBanned: false, suspendedUntil: null }).variant).toBe('default');
  });
});
```

- [ ] **Step 2: Run → FAIL** (`Cannot find module './cancel-labels'`).

- [ ] **Step 3: Viết** `cancel-labels.ts`:

```ts
import type { DriverCancelStat } from '@/lib/types';

/** Màu theo ngưỡng huỷ. `hover:` bắt buộc — Badge cva default ship hover:bg-primary,
 *  tailwind-merge không strip nếu thiếu (mirror verdictBadgeClass ở leakage-labels). */
export function rateBadgeClass(pct: number): string {
  if (pct > 50) return 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/50 dark:text-red-400 dark:hover:bg-red-900/50';
  if (pct >= 30) return 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-900/50';
  return 'bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800/60';
}

export function driverStatus(s: Pick<DriverCancelStat, 'isBanned' | 'suspendedUntil'>): {
  label: string; variant: 'destructive' | 'secondary' | 'default';
} {
  if (s.isBanned) return { label: 'Đã khoá vĩnh viễn', variant: 'destructive' };
  if (s.suspendedUntil && new Date(s.suspendedUntil).getTime() > Date.now())
    return { label: 'Tạm khoá', variant: 'secondary' };
  return { label: 'Hoạt động', variant: 'default' };
}
```

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/driver-cancel-review/cancel-labels.ts" "src/app/(app)/driver-cancel-review/cancel-labels.test.ts"
git commit -m "feat(cancel-review): màu ngưỡng huỷ + driverStatus helper + test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Dialog ban/suspend

**Files:**
- Create: `src/app/(app)/driver-cancel-review/components/driver-action-dialog.tsx`

**Interfaces:**
- Consumes: `banDriver`/`unbanDriver`/`suspendDriver`/`unsuspendDriver` từ `@/lib/api`.
- Produces: `<DriverActionDialog stat={DriverCancelStat|null} onOpenChange onDone />` — dialog với các nút: **Tạm khoá** (nhập số ngày + lý do → `suspendDriver(id, {durationMinutes: days*1440, reason})`), **Khoá vĩnh viễn** (lý do → `banDriver`), **Gỡ khoá** (`unbanDriver` nếu isBanned; `unsuspendDriver` nếu đang suspend). `reason` bắt buộc (backend `VAL_003` nếu trống).

- [ ] **Step 1: Viết dialog** — dùng shadcn `Dialog`, `Input`, `Textarea`, `Button`. Mỗi action: gọi API trong try, toast thành công/lỗi (`useToast`), gọi `onDone()` để parent reload, đóng dialog. Nút "Gỡ khoá" chỉ hiện khi `stat.isBanned || suspend còn hiệu lực`. Ban hiện cảnh báo nếu `depositForfeitFlagged` ("Tài này đã bị đánh cờ giữ cọc — xử cọc thủ công."). Inject các API function qua import trực tiếp (không cần DI). Không cần test riêng nếu logic mỏng — nhưng nếu tách được hàm thuần (vd `suspendMinutes(days)=days*1440`) thì test.

- [ ] **Step 2: tsc + vitest sạch. Commit.**

```bash
git add "src/app/(app)/driver-cancel-review/components/driver-action-dialog.tsx"
git commit -m "feat(cancel-review): dialog ban/suspend/gỡ khoá tài xế

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Trang bảng thống kê

**Files:**
- Create: `src/app/(app)/driver-cancel-review/page.tsx`

**Interfaces:**
- Consumes: `getDriverCancelStats` (T1), `rateBadgeClass`/`driverStatus` (T2), `DriverActionDialog` (T3), `FinanceFilter`/`PRESETS`/`DateRange` từ `../finance/components/finance-filter`, `formatVnDateTime` từ `../leakage-review/leakage-labels`.

- [ ] **Step 1: Viết trang** — mirror `leakage-review/page.tsx` structure:
  - `PageHeader` title "Tỉ lệ huỷ tài xế", mô tả ngắn (theo dõi tài huỷ nhiều — nghi câu kéo khách ra ngoài; đỏ >50% tự khoá, vàng 30–50% theo dõi).
  - `FinanceFilter` cho khoảng ngày VN, default `last7` hoặc `last30` (khớp cửa sổ backend 30 ngày — dùng preset gần nhất).
  - `load()` với `reqIdRef` sequence-guard (copy pattern từ leakage-review) gọi `getDriverCancelStats(range.from, range.to)`.
  - `Table`: cột Tài xế (tên + phone, link `/users/detail?id=${driverUserId}` — precedent leakage-review) · Chuyến giao · Khách huỷ · **Tỉ lệ** (`Badge` `rateBadgeClass`) · Strike (`cancelRuleAStrikes`) · Trạng thái (`Badge` `driverStatus`) · Cảnh báo gần nhất (`lastAlertReason` + `formatVnDateTime(lastAlertAt)`). Sort backend sẵn (ratePct DESC) — giữ nguyên thứ tự trả về.
  - Row click → mở `DriverActionDialog` với `stat` đó; `onDone` → `load()`.
  - ⚠️ **Link `/users/detail?id=${driverUserId}` trong cột Tài xế (và mọi nút trong row) PHẢI `onClick={(e)=>e.stopPropagation()}`** — nếu không bấm link vừa điều hướng vừa mở dialog (double-action, xem leakage `page.tsx:181`).
  - Loading spinner + empty state ("Không có tài xế nào trong khoảng ngày").
  - Cột `depositForfeitFlagged=true` → icon/badge nhỏ "cờ cọc".

- [ ] **Step 2: tsc + vitest sạch. Commit.**

```bash
git add "src/app/(app)/driver-cancel-review/page.tsx"
git commit -m "feat(cancel-review): trang bảng thống kê tỉ lệ huỷ + action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Đăng ký nav

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1:** Thêm mục nav vào mảng phẳng `navItems` (`layout.tsx:51-73`, cấu trúc `{href,label,icon}` — KHÔNG có nhóm/guard): `{ href: '/driver-cancel-review', label: 'Tỉ lệ huỷ tài xế', icon: TrendingDown }`. **PHẢI thêm `TrendingDown` (hoặc `UserX`) vào block import lucide ở `:40`** — nếu không `tsc` báo undefined.
- [ ] **Step 2: tsc + vitest sạch; `npm run build` nếu nhanh để chắc route hợp lệ. Commit.**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat(cancel-review): thêm mục nav Tỉ lệ huỷ tài xế

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npx tsc --noEmit` sạch.
- [ ] `npx vitest run` — xanh (so baseline `main` nếu có đỏ sẵn: `invoice-utils.node.test.ts`/`csv.node.test.ts`/`multi-select-combobox.test.tsx` là pre-existing).
- [ ] `npm run build` — route `/driver-cancel-review` build OK (static export).
- [ ] Manual (khi có backend dev bật): mở trang → thấy bảng rate; đổi khoảng ngày → reload; bấm 1 tài → dialog; test suspend 1 ngày trên tài QA → thấy trạng thái đổi.
- [ ] PR `feat/cancel-review-admin → main` (vigo-admin) → review người → merge → build/deploy (S3 static export).

## Backward-compat

- Thuần thêm: 1 type, 1 client function, 1 trang, 1 mục nav. Không đụng trang/endpoint hiện có. Ban/suspend dùng endpoint sẵn có (đã dùng ở trang driver detail).
- Phụ thuộc backend P1 đã deploy (`/admin/driver-cancel-stats`). Nếu backend chưa có endpoint → trang hiện lỗi tải (toast), không vỡ app.

## Ghi chú product

- Panel chỉ **hiển thị + hành động thủ công**. Auto-khoá là backend (mode SHADOW/AUTO). Ở SHADOW, backend chỉ ghi alert (hiện ở cột "Cảnh báo gần nhất") — admin xem rồi tự quyết ban; ở AUTO backend tự khoá, panel để gỡ oan.
- **P3 (app tài xế)** tách plan riêng: banner suspend + dialog lý do ban trong `vigo-driver`.
