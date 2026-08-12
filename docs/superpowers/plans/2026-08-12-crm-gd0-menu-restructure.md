# CRM GĐ0 — Tái cấu trúc menu nhóm "Khách hàng (CRM)" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gom 3 mục sẵn có (`/users`, `/cskh-activity`, `/acquisition`) vào một nhóm menu mới "Khách hàng (CRM)", cho `/users` mặc định chỉ hiện khách, và mở đường từ `/transport-companies` sang hồ sơ tài khoản chủ HTX.

**Architecture:** Thuần frontend `vigo-admin`, **không đụng backend, không thêm function RBAC nào**. Cả 3 mục đã có function riêng (`users`, `cskh-activity`, `acquisition`) và giữ nguyên `href` — nhóm menu chỉ là trình bày, quyền vẫn khoá theo `href`. Rủi ro duy nhất là thứ tự nhóm làm đổi trang đích sau đăng nhập, được khoá lại bằng test.

**Tech Stack:** Next.js 15 (App Router, static export), React 19, TypeScript, vitest + @testing-library/react.

## Global Constraints

- Spec nguồn: `docs/superpowers/specs/2026-08-12-crm-vigo-design.md` (§3.1, §3.3, §3.5, GĐ0 trong §9).
- **Không thêm function RBAC mới ở GĐ0.** Số đếm cứng trong `src/lib/rbac.test.ts:23` **giữ nguyên 29**. Nếu bạn thấy mình cần sửa số này thì bạn đang làm sai phạm vi.
- **Không đổi `href` của bất kỳ mục nào.** Đổi href = cắt quyền của người đang dùng.
- Vị trí nhóm mới: **sau "Xử lý vi phạm", trước "Người dùng & Đối tác"** (spec §3.3).
- Nhóm CRM ở GĐ0 gồm đúng 3 mục theo thứ tự: `/users` → `/cskh-activity` → `/acquisition`. (`/crm-queue` thuộc GĐ1, chưa có ở đây.)
- Lệnh kiểm bắt buộc trước mỗi commit: `npx tsc --noEmit` và `npx vitest run`.
- Nhánh: `git checkout -b feat/crm-gd0-menu main` (cắt từ `main`, không phải `dev`).
- Message commit kết thúc bằng: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

## File Structure

| File | Trách nhiệm | Hành động |
|---|---|---|
| `src/lib/nav-items.tsx` | Danh mục menu theo nhóm | **Sửa** — thêm nhóm "Khách hàng (CRM)", gỡ 3 mục khỏi nhóm cũ |
| `src/lib/rbac.test.ts` | Khoá quy tắc RBAC + đổi nhóm | **Sửa** — thêm khối test cho nhóm mới |
| `src/app/(app)/users/components/user-table.tsx` | Bảng danh bạ người dùng | **Sửa** — mặc định `roleFilter = 'USER'` |
| `src/app/(app)/users/components/user-table.test.tsx` | Test bảng danh bạ | **Tạo mới** |
| `src/app/(app)/transport-companies/components/transport-companies-table.tsx` | Bảng đơn vị vận tải | **Sửa** — thêm mục menu "Xem hồ sơ tài khoản chủ" |

`src/lib/rbac.ts` **không đổi** — 3 mục đã có trong `MENU_FUNCTION_BY_HREF`.

---

### Task 1: Nhóm menu "Khách hàng (CRM)"

**Files:**
- Modify: `src/lib/nav-items.tsx`
- Test: `src/lib/rbac.test.ts`

**Interfaces:**
- Consumes: `navGroups`, `navItems`, `MENU_FUNCTION_BY_HREF`, `isMenuVisible`, `isRouteAllowed`, `firstAllowedRoute` (đã có).
- Produces: `navGroups` có thêm phần tử `{ label: 'Khách hàng (CRM)', items: [...] }`. Các task sau và GĐ1 dựa vào nhãn nhóm **đúng chuỗi** `'Khách hàng (CRM)'`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/lib/rbac.test.ts`, ngay sau khối `describe('đổi nhóm menu KHÔNG được đụng tới quyền', ...)` (kết thúc ở dòng 88):

```ts
  /**
   * 2026-08-12 (CRM GĐ0): gom /users + /cskh-activity + /acquisition vào nhóm mới
   * "Khách hàng (CRM)". Cùng loại rủi ro với lần tách "Xử lý vi phạm": nhóm chỉ là
   * trình bày, nhưng thứ tự nhóm quyết định TRANG ĐÍCH sau đăng nhập
   * (app/page.tsx -> firstAllowedRoute(navItems)). Khoá lại bằng test.
   */
  describe('nhóm Khách hàng (CRM)', () => {
    const CRM_HREFS = ['/users', '/cskh-activity', '/acquisition'];

    it('nhóm tồn tại và gồm đúng 3 mục, ĐÚNG THỨ TỰ', () => {
      const crm = navGroups.find((g) => g.label === 'Khách hàng (CRM)');
      expect(crm).toBeDefined();
      expect(crm!.items.map((i) => i.href)).toEqual(CRM_HREFS);
    });

    it('3 mục KHÔNG còn nằm ở nhóm cũ (không bị nhân đôi trong menu)', () => {
      for (const href of CRM_HREFS) {
        expect(navItems.filter((i) => i.href === href)).toHaveLength(1);
      }
    });

    it('giữ nguyên function key — không ai bị cắt quyền vì đổi nhóm', () => {
      for (const href of CRM_HREFS) {
        expect(MENU_FUNCTION_BY_HREF[href]).toBe(href.replace(/^\//, ''));
      }
      const cskh = mkMe({ functions: ['cskh-activity'] });
      expect(isMenuVisible('/cskh-activity', cskh)).toBe(true);
      expect(isRouteAllowed('/cskh-activity', cskh)).toBe(true);
    });

    it('nhóm CRM đứng sau "Xử lý vi phạm" và trước "Người dùng & Đối tác"', () => {
      const labels = navGroups.map((g) => g.label);
      expect(labels.indexOf('Khách hàng (CRM)')).toBe(labels.indexOf('Xử lý vi phạm') + 1);
      expect(labels.indexOf('Khách hàng (CRM)')).toBeLessThan(labels.indexOf('Người dùng & Đối tác'));
    });

    // Ảnh hưởng ĐÃ LƯỜNG của việc đổi nhóm: người có cả users lẫn cskh-activity
    // trước đây tiếp đất ở /cskh-activity (nhóm Vận hành đứng trước), nay là /users.
    // Ghi lại thành test để lần sau ai đổi thứ tự sẽ thấy hệ quả, không phải đoán.
    it('trang đích sau đăng nhập: /users đứng trước /cskh-activity', () => {
      const me = mkMe({ functions: ['users', 'cskh-activity'] });
      expect(firstAllowedRoute(me, navItems.map((i) => i.href))).toBe('/users');
    });

    it('người không có quyền nào trong nhóm thì nhóm biến mất, không hiện tiêu đề rỗng', () => {
      const chiCoBookings = mkMe({ functions: ['bookings'] });
      const crm = navGroups.find((g) => g.label === 'Khách hàng (CRM)')!;
      expect(crm.items.filter((i) => isMenuVisible(i.href, chiCoBookings))).toHaveLength(0);
    });
  });
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `npx vitest run src/lib/rbac.test.ts`
Expected: FAIL — `expect(crm).toBeDefined()` nhận `undefined` (chưa có nhóm).

- [ ] **Step 3: Sửa `nav-items.tsx`**

Trong `src/lib/nav-items.tsx`:

(a) Gỡ `{ href: '/acquisition', label: 'Nguồn khách', icon: PieChart },` khỏi nhóm `'Tổng quan'` (dòng 48).

(b) Gỡ `{ href: '/cskh-activity', label: 'Hoạt động CSKH', icon: Headset },` khỏi nhóm `'Vận hành'` (dòng 62).

(c) Gỡ `{ href: '/users', label: 'Người dùng', icon: Users },` khỏi nhóm `'Người dùng & Đối tác'` (dòng 81).

(d) Chèn nhóm mới **giữa** nhóm `'Xử lý vi phạm'` (kết thúc dòng 77) và nhóm `'Người dùng & Đối tác'` (bắt đầu dòng 78):

```tsx
  {
    // 2026-08-12 (CRM GĐ0): gom các màn XOAY QUANH KHÁCH về một chỗ. Trước đây
    // /acquisition ở "Tổng quan", /cskh-activity ở "Vận hành", /users ở "Người dùng
    // & Đối tác" — CSKH phải nhảy 3 nhóm để làm một việc. Nhóm chỉ là TRÌNH BÀY,
    // href và function giữ nguyên nên KHÔNG ai bị cắt quyền.
    // Affiliate/KOL CỐ Ý không nằm ở đây: đối tượng của chúng là NGƯỜI GIỚI THIỆU
    // (ví, hoa hồng, công nợ), không phải khách đi xe — xem spec §3.4.
    label: 'Khách hàng (CRM)',
    items: [
      { href: '/users', label: 'Khách hàng', icon: Users },
      { href: '/cskh-activity', label: 'Hoạt động CSKH', icon: Headset },
      { href: '/acquisition', label: 'Nguồn khách', icon: PieChart },
    ],
  },
```

Lưu ý: nhãn `/users` đổi từ `'Người dùng'` thành `'Khách hàng'` cho khớp nội dung mới (mặc định chỉ hiện khách — Task 2). `href` **không đổi**.

- [ ] **Step 4: Chạy test để xác nhận XANH**

Run: `npx vitest run src/lib/rbac.test.ts`
Expected: PASS toàn bộ, kể cả test cũ `'has exactly 29 menu functions'` (không thêm function nào).

- [ ] **Step 5: Kiểm tĩnh + toàn bộ test**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: sạch cả ba.

> `tsconfig.json` **không** bật `noUnusedLocals`, nên `tsc` sẽ **không** báo import thừa — đừng trông vào nó. `npm run lint` (next lint, `no-unused-vars`) mới bắt được. Ba icon `Users` / `Headset` / `PieChart` vẫn phải còn dùng sau khi chuyển nhóm; nếu lint báo thừa thì bạn đã gỡ nhầm mục.
>
> Chạy **toàn bộ** `vitest run` chứ không riêng `rbac.test.ts`: `function-catalog.test.ts` cũng đọc `navItems` nên đổi menu là chạm vào nó.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nav-items.tsx src/lib/rbac.test.ts
git commit -m "feat(crm): gom /users, /cskh-activity, /acquisition vào nhóm Khách hàng (CRM)

Nhóm chỉ là trình bày — href + function giữ nguyên nên không ai bị cắt quyền.
Khoá bằng test: thứ tự nhóm, không nhân đôi mục, function key không đổi, và
ảnh hưởng đã lường tới trang đích sau đăng nhập (/users đứng trước /cskh-activity).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `/users` mặc định chỉ hiện khách

**Files:**
- Modify: `src/app/(app)/users/components/user-table.tsx:61`
- Test: `src/app/(app)/users/components/user-table.test.tsx` (tạo mới)

**Interfaces:**
- Consumes: `getUsers(params: { page?, limit?, search?, role?, includeDrivers?, deleted? })` từ `@/lib/api` (api.ts:251).
- Produces: không có export mới.

**Vì sao đổi mặc định chứ không bỏ hẳn dropdown:** bỏ hẳn thì tài khoản `TRANSPORT_COMPANY_OWNER` **chưa gán vào công ty nào** sẽ biến mất khỏi mọi danh sách. Dialog *Gán chủ HTX* không phải công cụ tra cứu — `assignTransportCompanyOwner` bắt buộc có `password` và sẽ **đặt lại mật khẩu** tài khoản đang tồn tại. Xem spec §3.5.

- [ ] **Step 1: Viết test thất bại**

Tạo `src/app/(app)/users/components/user-table.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { UsersTable } from './user-table';
import { getUsers } from '@/lib/api';

// UsersTable gọi useRouter() (user-table.tsx:195). Không mock thì render ném
// "invariant expected app router to be mounted" — KHÔNG phải lỗi thiếu mock api.
// Repo chưa có test nào mock next/navigation nên không có tiền lệ để copy.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// Mock phải khai MỌI export mà component import — vitest ném lỗi ngay lúc nạp
// module nếu thiếu, trước cả khi render.
vi.mock('@/lib/api', () => ({
  getUsers: vi.fn(async () => ({ data: [], meta: { total: 0, limit: 20 } })),
  lockUser: vi.fn(),
  unlockUser: vi.fn(),
  deleteAdminUser: vi.fn(),
  restoreUser: vi.fn(),
  adminGetUserReferralStats: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('UsersTable — danh bạ khách (CRM GĐ0)', () => {
  beforeEach(() => vi.clearAllMocks());

  // /users nằm trong nhóm CRM nên mặc định phải là DANH BẠ KHÁCH, không lẫn chủ HTX.
  it('lần tải đầu tiên lọc role=USER, không phải tất cả', async () => {
    render(<UsersTable />);
    await waitFor(() => expect(getUsers).toHaveBeenCalled());
    expect(vi.mocked(getUsers).mock.calls[0][0]).toMatchObject({ role: 'USER' });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó ĐỎ**

Run: `npx vitest run "src/app/(app)/users/components/user-table.test.tsx"`
Expected: FAIL — call đầu tiên là `{ limit: 20, page: 1, search: '' }`, thiếu `role: 'USER'`.

> ⚠️ **Đường dẫn PHẢI trong nháy kép.** Dạng escape `src/app/\(app\)/...` bị vitest chuẩn hoá thành `src/app/(app/)/...` → `No test files found, exiting with code 1`. Exit code 1 trông y hệt "test đỏ" nên rất dễ tưởng đã RED đúng, rồi bước Step 4 không bao giờ xanh.
>
> Nếu đỏ vì thông báo khác `role`, đọc kỹ thông báo: thiếu mock `next/navigation` cho ra `invariant expected app router to be mounted`; thiếu export api cho ra `No X export is defined on the mock`. Đừng đổi assertion.

- [ ] **Step 3: Sửa mặc định**

`src/app/(app)/users/components/user-table.tsx:61`, đổi:

```tsx
  const [roleFilter, setRoleFilter] = React.useState<'ALL' | 'USER' | 'TRANSPORT_COMPANY_OWNER'>('ALL');
```

thành:

```tsx
  // Mặc định KHÁCH: trang này nằm trong nhóm "Khách hàng (CRM)" nên phải là danh bạ
  // khách, không lẫn chủ HTX. Vẫn GIỮ lựa chọn 'ALL'/'TRANSPORT_COMPANY_OWNER' làm
  // đường tra cứu: chủ HTX chưa gán công ty nào thì không có chỗ nào khác tìm ra họ
  // (dialog "Gán chủ HTX" là công cụ GHI — nó reset mật khẩu, không phải để tra).
  const [roleFilter, setRoleFilter] = React.useState<'ALL' | 'USER' | 'TRANSPORT_COMPANY_OWNER'>('USER');
```

- [ ] **Step 4: Chạy test để xác nhận XANH**

Run: `npx vitest run "src/app/(app)/users/components/user-table.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Kiểm tĩnh + toàn bộ test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: không lỗi type, toàn bộ test xanh.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/users/components/user-table.tsx src/app/\(app\)/users/components/user-table.test.tsx
git commit -m "feat(crm): /users mặc định lọc role=USER (danh bạ khách)

Giữ lựa chọn 'Tất cả'/'Chủ HTX' làm đường tra cứu — bỏ hẳn thì chủ HTX chưa
gán công ty sẽ biến mất khỏi mọi danh sách, mà dialog 'Gán chủ HTX' là công cụ
GHI (reset mật khẩu), không dùng để tra cứu được.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Đường sang hồ sơ tài khoản chủ HTX

**Files:**
- Modify: `src/app/(app)/transport-companies/components/transport-companies-table.tsx`

**Interfaces:**
- Consumes: `useAuth()` từ `@/lib/auth-context` (trả `{ me, loading, can, refresh }`; `can(fn: string): boolean`), `company.ownerUserId` (đã có trên `TransportCompany`).
- Produces: không có export mới.

**Không có unit test cho task này — có lý do.** Đây là một `DropdownMenuItem` có điều kiện trong một component lớn chưa hề có test, và mount nó đòi mock cả chục hàm api. Chi phí dựng bộ mock lớn hơn giá trị test thu được, mà rủi ro thì thấp (link chỉ-đọc). Bù lại bằng **checklist kiểm tay trên DEV ở Step 4 — bắt buộc làm, không được bỏ**.

- [ ] **Step 1: Thêm import**

Ở đầu `transport-companies-table.tsx`, thêm vào cụm import (đặt cạnh các import `@/lib/*` sẵn có):

```tsx
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
```

- [ ] **Step 2: Lấy `can` trong component**

Trong thân component chứa bảng, ngay cạnh các hook state sẵn có, thêm:

```tsx
  // /users/detail gate bằng function `users` (isRouteAllowed -> topSegment '/users').
  // Không có quyền mà vẫn hiện link thì bấm vào chỉ bị guard đá về /no-access — ẩn hẳn.
  const { can } = useAuth();
```

- [ ] **Step 3: Thêm mục menu**

Trong `<DropdownMenuContent align="end">`, chèn **ngay sau** mục `'Đặt lại tài khoản chủ' / 'Gán chủ HTX'` và **trước** `<DropdownMenuSeparator />`:

```tsx
                        {company.ownerUserId && can('users') && (
                          <DropdownMenuItem asChild>
                            <Link href={`/users/detail?id=${company.ownerUserId}`}>
                              <UserRound className="mr-2 h-4 w-4" />
                              Xem hồ sơ tài khoản chủ
                            </Link>
                          </DropdownMenuItem>
                        )}
```

Thêm `UserRound` vào import `lucide-react` sẵn có ở đầu file.

- [ ] **Step 4: Kiểm tĩnh + kiểm tay**

Run: `npx tsc --noEmit && npx vitest run`
Expected: không lỗi, test cũ vẫn xanh.

Run: `npm run dev` rồi kiểm bằng tay (KHÔNG bỏ bước này):
1. Vào `/transport-companies`, mở menu ba chấm của một công ty **đã gán chủ** → thấy "Xem hồ sơ tài khoản chủ", bấm vào mở đúng `/users/detail?id=…` của người đó.
2. Công ty **chưa gán chủ** (`ownerUserId` rỗng) → mục đó **không hiện**.
3. Đăng nhập bằng tài khoản có `transport-companies` nhưng **không có** `users` → mục đó **không hiện**.
4. Menu trái: nhóm "Khách hàng (CRM)" nằm đúng sau "Xử lý vi phạm", gồm Khách hàng / Hoạt động CSKH / Nguồn khách.
5. `/users` mở ra mặc định lọc "Khách"; đổi sang "Chủ HTX" vẫn ra danh sách chủ HTX.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/transport-companies/components/transport-companies-table.tsx
git commit -m "feat(crm): mở hồ sơ tài khoản chủ HTX từ trang Đơn vị vận tải

Chủ HTX rời khỏi mặc định của danh bạ khách nên cần đường vào từ đúng nhà của
họ. Ẩn khi chưa gán chủ hoặc khi người dùng không có function 'users' —
/users/detail gate theo segment cấp 1 nên hiện link mà không có quyền thì chỉ
bị guard đá về /no-access.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Hoàn tất GĐ0

- [ ] **Step 1: Chạy đủ bộ kiểm**

```bash
npx tsc --noEmit && npx vitest run && npx next build
```
Expected: cả 3 sạch. (`npx next build` để smoke-check, **KHÔNG** dùng `npm run build` — lệnh đó tự deploy lên S3 production.)

- [ ] **Step 2: Push nhánh + merge vào `dev` để test DEV**

```bash
git push -u origin feat/crm-gd0-menu
git checkout dev && git merge feat/crm-gd0-menu && git push
```

- [ ] **Step 3: Test runtime trên môi trường DEV** (cổng bắt buộc theo CLAUDE.md — chạy lại đúng checklist 5 mục ở Task 3 Step 4 trên DEV, không phải local).

- [ ] **Step 4: PR `feat/crm-gd0-menu` → `main`** (KHÔNG PR `dev → main`).

- [ ] **Step 5: Sau khi merge, resync** `git checkout dev && git merge main`, rồi xoá nhánh feature.

---

## Sai khác so với spec — cần biết

1. Nhãn menu của `/users` đổi từ **"Người dùng"** thành **"Khách hàng"**. Spec §3.1 ghi "Khách hàng"; đây là ghi chú để người review không tưởng là nhầm. **Kèm hệ quả:** `function-catalog.ts:12-13` lấy `label` từ `navItems`, nên ô tick quyền `users` ở trang `/roles` cũng đổi tên thành "Khách hàng". Không sai, nhưng báo trước để người quản trị không tưởng có function mới.
2. Spec §3.5 viết "mặc định `role = USER`". Plan giữ nguyên cả 3 lựa chọn trong dropdown, chỉ đổi giá trị khởi tạo — đúng tinh thần spec và giữ đường tra cứu chủ HTX chưa gán công ty.
