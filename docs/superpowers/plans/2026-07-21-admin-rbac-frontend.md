# Admin RBAC — Frontend Implementation Plan (`vigo-admin`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the admin UI by the caller's function permissions (hide menu items + block routes), replace the mock `/roles` page with a real role/assignment manager, and clean up the identity UI — all driven by a new `GET /admin/me`.

**Architecture:** A client `AuthContext` fetches `GET /admin/me` once after login/refresh and exposes `can(fn)`. The sidebar filters `navItems` by `can`; a route guard in the `(app)` layout redirects unauthorized routes to a permission-less "no access" page. Settings tabs are trimmed to the system-config groups, each gated by `can('settings.<group>')`. The sidebar footer shows the real name+phone+logout; the top-right `UserNav` is removed.

**Tech Stack:** Next.js 15 (App Router, static export), React 19, TypeScript, vitest + @testing-library/react (jsdom).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-21-admin-rbac-design.md`.
- **Depends on backend plan shipped to prod first** — `GET /admin/me` + gated endpoints must exist. Contract: `GET /admin/me` → `{ id, fullName, phone, isSuperAdmin: boolean, functions: string[] }` (functions `[]` when super).
- **Static export** (`output:'export'`) → the route guard is **client-side UX only**; real enforcement is the backend. No server middleware.
- **Real gate = `npm run typecheck`** (build ignores type/lint errors) + `npx vitest run`. Do NOT run `npm run build` (auto-deploys to prod).
- **Function catalog (must match backend `rbac.constants.ts`):** 25 menu keys (each = a `navItems` href minus leading `/`) + 8 `settings.*` groups. `/settings` menu shows if the user has ANY `settings.*`.
- **Timezone rule** unaffected (no dates here).
- **VN Vietnamese UI copy.**

---

## File Structure

**New files:**
- `src/lib/auth-context.tsx` — `AuthProvider` + `useAuth()` + `can(fn)`; fetches `/admin/me`.
- `src/lib/rbac.ts` — `MENU_FUNCTION_BY_HREF` map + `SETTINGS_GROUP_FUNCTIONS` (mirror of backend catalog) + `functionForHref`.
- `src/app/(app)/no-access/page.tsx` — permission-less "Bạn chưa được cấp quyền" page (redirect target).
- `src/app/(app)/roles/components/role-editor.tsx` — real role create/edit dialog (function checkboxes by group).
- `src/app/(app)/roles/components/user-assignment.tsx` — assign roles + GRANT/REVOKE overrides + super toggle per user.
- Tests: `src/lib/auth-context.test.tsx`, `src/lib/rbac.test.ts`, `src/app/(app)/roles/components/role-editor.test.tsx`, layout/menu test `src/app/(app)/layout-guard.test.tsx`.

**Modified files:**
- `src/lib/api.ts` — add `getAdminMe()`, `adminListRoles/createRole/updateRole/deleteRole`, `adminGetFunctions`, `adminSetUserRoles/Overrides/Super`; fix `logout()` (both tokens + `POST /auth/logout`).
- `src/lib/types.ts` — replace `Role`/`Permission` mock types with real ones; add `AdminMe`, `AdminRole`, `FunctionOverride`.
- `src/app/(app)/layout.tsx` — `functionKey` per `navItems`, filter by `can`, route guard, add "Phân quyền" (super), footer name/phone/logout.
- `src/components/header.tsx` — remove `<UserNav/>`.
- Delete: `src/components/user-nav.tsx`.
- `src/app/(app)/settings/page.tsx` — remove profile/api/notifications tabs; `defaultValue="system"`.
- `src/app/(app)/settings/components/system-config-manager.tsx` — hide groups the user can't access (defense-in-depth with backend redaction).
- `src/app/(app)/roles/page.tsx` + `roles-list.tsx` — wire to API (drop `mockRoles`).
- `src/lib/data.ts` — remove `mockRoles`/`allPermissions` (or leave unused; delete references).

---

## Task 1: `api.ts` — `/admin/me`, RBAC CRUD, proper `logout()`

**Files:** Modify `src/lib/api.ts`. Test: `src/lib/api-rbac.test.ts`.

**Interfaces:**
- Produces: `getAdminMe(): Promise<AdminMe>`; `adminListRoles()`, `adminCreateRole(body)`, `adminUpdateRole(id,body)`, `adminDeleteRole(id)`; `adminGetFunctions()`; `adminSetUserRoles(userId,roleIds)`, `adminSetUserOverrides(userId,overrides)`, `adminSetUserSuper(userId,value)`; `logout()`.

- [ ] **Step 1: Test `logout()` clears both tokens + calls backend** (mock `fetch`):

```ts
it('logout clears both tokens and calls POST /auth/logout', async () => {
  localStorage.setItem('access_token','a'); localStorage.setItem('refresh_token','r');
  await logout();
  expect(localStorage.getItem('access_token')).toBeNull();
  expect(localStorage.getItem('refresh_token')).toBeNull();
});
```

- [ ] **Step 2: Implement** (reuse `fetchWithAuth`):

```ts
export async function getAdminMe(): Promise<AdminMe> {
  const res = await fetchWithAuth('/admin/me'); return unwrap(res);
}
export async function logout(): Promise<void> {
  try { await fetchWithAuth('/auth/logout', { method: 'POST' }); } catch { /* best-effort */ }
  localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token');
}
export const adminListRoles = () => fetchWithAuth('/admin/roles').then(unwrap);
export const adminCreateRole = (b: {key:string;name:string;description?:string;functions:string[]}) =>
  fetchWithAuth('/admin/roles', { method:'POST', body: JSON.stringify(b) }).then(unwrap);
export const adminUpdateRole = (id: string, b: Partial<{name:string;description:string;functions:string[]}>) =>
  fetchWithAuth(`/admin/roles/${id}`, { method:'PATCH', body: JSON.stringify(b) }).then(unwrap);
export const adminDeleteRole = (id: string) => fetchWithAuth(`/admin/roles/${id}`, { method:'DELETE' }).then(unwrap);
export const adminGetFunctions = () => fetchWithAuth('/admin/functions').then(unwrap);
export const adminSetUserRoles = (userId: string, roleIds: string[]) =>
  fetchWithAuth(`/admin/users/${userId}/roles`, { method:'POST', body: JSON.stringify({ roleIds }) }).then(unwrap);
export const adminSetUserOverrides = (userId: string, overrides: FunctionOverride[]) =>
  fetchWithAuth(`/admin/users/${userId}/overrides`, { method:'PUT', body: JSON.stringify({ overrides }) }).then(unwrap);
export const adminSetUserSuper = (userId: string, value: boolean) =>
  fetchWithAuth(`/admin/users/${userId}/super`, { method:'PATCH', body: JSON.stringify({ value }) }).then(unwrap);
```

> `unwrap` = the existing helper that returns `data` from the `{data}` envelope (mirror how other api.ts fns unwrap; if none, inline `(await res.json()).data`).

- [ ] **Step 3: Run** `npx vitest run src/lib/api-rbac` + `npm run typecheck`. **Commit** `feat(rbac): api client — /admin/me, role CRUD, proper logout`.

---

## Task 2: Types + catalog mirror

**Files:** Modify `src/lib/types.ts`; create `src/lib/rbac.ts`. Test: `src/lib/rbac.test.ts`.

- [ ] **Step 1: Replace mock types** in `types.ts` (lines 69-75 `Role`, 308-321 `Permission`/`allPermissions`):

```ts
export type AdminMe = { id: string; fullName: string | null; phone: string; isSuperAdmin: boolean; functions: string[] };
export type AdminRole = { id: string; key: string; name: string; description: string; isSystem: boolean; functions: string[] };
export type FunctionOverride = { functionKey: string; effect: 'GRANT' | 'REVOKE' };
```
Delete the old `Role`, `Permission`, `allPermissions` (grep usages: only `roles-list.tsx` + `data.ts`, both rewritten in Task 6/7).

- [ ] **Step 2: Catalog mirror `src/lib/rbac.ts`** — the menu href→function map + settings groups. Menu function key = href without leading `/`:

```ts
export const MENU_FUNCTION_BY_HREF: Record<string,string> = {
  '/dashboard':'dashboard','/users':'users','/drivers':'drivers','/transport-companies':'transport-companies',
  '/bookings':'bookings','/referrals':'referrals','/kol':'kol','/agent':'agent','/agent-orders':'agent-orders',
  '/withdrawals':'withdrawals','/finance':'finance','/acquisition':'acquisition','/driver-cashflow':'driver-cashflow',
  '/htx-reconciliation':'htx-reconciliation','/invoices':'invoices','/master-data':'master-data',
  '/promotions':'promotions','/reports':'reports','/notifications':'notifications','/news':'news',
  '/banners':'banners','/app-popups':'app-popups','/feedback':'feedback',
  '/leakage-review':'leakage-review','/driver-cancel-review':'driver-cancel-review',
};
export const SETTINGS_GROUP_FUNCTIONS = [
  'settings.app','settings.pricing','settings.dispatch','settings.driver',
  'settings.growth','settings.cancel','settings.phone-reveal','settings.misc',
] as const;
export function functionForHref(href: string): string | undefined { return MENU_FUNCTION_BY_HREF[href]; }
```

- [ ] **Step 3: Test** — every `navItems` href (except `/settings`) is in `MENU_FUNCTION_BY_HREF`; `/settings` handled separately; count is 25.

```ts
it('MENU_FUNCTION_BY_HREF covers all navItems except /settings', () => {
  expect(Object.keys(MENU_FUNCTION_BY_HREF).length).toBe(25);
});
```

- [ ] **Step 4: Run** `npx vitest run src/lib/rbac` + `npm run typecheck`. **Commit** `feat(rbac): real types + catalog mirror`.

---

## Task 3: `AuthContext` + `can()` + `/admin/me` fetch

**Files:** Create `src/lib/auth-context.tsx`. Test: `src/lib/auth-context.test.tsx`.

**Interfaces:**
- Produces: `<AuthProvider>`, `useAuth(): { me: AdminMe | null; loading: boolean; can(fn: string): boolean; refresh(): Promise<void> }`.

- [ ] **Step 1: Test `can()` semantics** — super → true for anything; normal → true only for listed; unknown → false:

```ts
it('super can everything', () => { const c = makeCan({isSuperAdmin:true,functions:[]}); expect(c('finance')).toBe(true); });
it('normal can only listed', () => { const c = makeCan({isSuperAdmin:false,functions:['users']});
  expect(c('users')).toBe(true); expect(c('finance')).toBe(false); });
```

- [ ] **Step 2: Implement provider** — fetch on mount (token present), expose `can`. Pure `makeCan(me)` extracted for the test:

```tsx
'use client';
export function makeCan(me: AdminMe | null) {
  return (fn: string) => !!me && (me.isSuperAdmin || me.functions.includes(fn));
}
const Ctx = createContext<...>(null!);
export function AuthProvider({ children }: {children: React.ReactNode}) {
  const [me,setMe] = useState<AdminMe|null>(null); const [loading,setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (typeof window==='undefined' || !localStorage.getItem('access_token')) { setLoading(false); return; }
    try { setMe(await getAdminMe()); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx.Provider value={{me,loading,can:makeCan(me),refresh}}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
```

- [ ] **Step 3: Run** `npx vitest run src/lib/auth-context` + `npm run typecheck`. **Commit** `feat(rbac): AuthContext + can()`.

---

## Task 4: Menu filter + route guard + no-access page

**Files:** Modify `src/app/(app)/layout.tsx`; create `src/app/(app)/no-access/page.tsx`. Test: `src/app/(app)/layout-guard.test.tsx`.

- [ ] **Step 1: Wrap `(app)` in `AuthProvider`** (in `layout.tsx`, wrap `<SidebarProvider>` subtree). Extend the existing auth gate (L122-141): keep token check; additionally wait for `useAuth().loading` before rendering menu.

- [ ] **Step 2: Add `functionKey` to `navItems`** and filter. Add `{ href:'/roles', label:'Phân quyền', icon: ShieldCheck }` shown only when `me.isSuperAdmin`.

```tsx
const visibleNav = navItems.filter(i =>
  i.href === '/settings' ? SETTINGS_GROUP_FUNCTIONS.some(can) : can(functionForHref(i.href)!)
);
// + roles item if me?.isSuperAdmin
```

- [ ] **Step 3: Route guard** — if current `pathname`'s function is not permitted → `router.replace('/no-access')`. Landing after login = first permitted nav href (or `/no-access` if none). NEVER hard-redirect to `/dashboard` (dashboard is itself a function → loop).

```tsx
useEffect(() => {
  if (loading || !me) return;
  const fn = functionForHref(pathnameTop); // top-level segment
  const settingsOk = pathname.startsWith('/settings') && SETTINGS_GROUP_FUNCTIONS.some(can);
  const rolesOk = pathname.startsWith('/roles') && me.isSuperAdmin;
  const allowed = pathname.startsWith('/no-access') || rolesOk || settingsOk || (fn ? can(fn) : true);
  if (!allowed) router.replace('/no-access');
}, [pathname, me, loading]);
```

- [ ] **Step 4: `no-access` page** — plain page, no permission needed, message + logout button (uses `logout()` from Task 1).
- [ ] **Step 5: Test** (mock `useAuth`) — user with `['users']`: `/users` renders, `/finance` redirects to `/no-access`; super sees all + `/roles`.
- [ ] **Step 6: Run** `npx vitest run src/app/(app)/layout-guard` + `npm run typecheck`. **Commit** `feat(rbac): menu filter + route guard + no-access page`.

---

## Task 5: Sidebar footer (dynamic identity + logout) + remove UserNav

**Files:** Modify `src/app/(app)/layout.tsx` (footer L173-184), `src/components/header.tsx`; delete `src/components/user-nav.tsx`.

- [ ] **Step 1: Test** — footer renders `me.fullName` + `me.phone` (not "Quản trị viên"/"admin@vigo.com"); logout button present.
- [ ] **Step 2: Replace footer** (remove `<Avatar>`; add logout button):

```tsx
<SidebarFooter className="p-4">
  <div className="flex flex-col gap-2 ...">
    <div className="flex flex-col">
      <span className="text-sm font-medium">{me?.fullName ?? 'Quản trị viên'}</span>
      <span className="text-xs text-muted-foreground">{me?.phone ?? ''}</span>
    </div>
    <Button variant="ghost" size="sm" onClick={async()=>{ await logout(); router.push('/'); }}>
      <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
    </Button>
  </div>
</SidebarFooter>
```

- [ ] **Step 3: Remove `<UserNav/>` from `header.tsx`; delete `user-nav.tsx`.** Grep confirms no other importer.
- [ ] **Step 4: Run** `npx vitest run` (footer test) + `npm run typecheck`. **Commit** `feat(rbac): dynamic footer identity + logout; remove UserNav`.

---

## Task 6: Settings — trim tabs + gate groups

**Files:** Modify `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/components/system-config-manager.tsx`. Test: `settings.test.tsx`.

- [ ] **Step 1: Trim tabs** — remove `profile`/`api`/`notifications` TabsTriggers+Contents (page.tsx L22-24, 28-128 mock). If only `system` remains, drop `TabsList` and render `<SystemConfigManager/>` directly; else set `defaultValue="system"` and fix `grid-cols`.
- [ ] **Step 2: Gate groups** in `system-config-manager.tsx` — after grouping by `groupIdFor`, render only groups where `can('settings.'+groupId)` (import `useAuth`). Backend already redacts secrets + blocks writes; this is UX.
- [ ] **Step 3: Test** (mock `useAuth`) — user with only `settings.pricing` sees the pricing group, not `dispatch`; super sees all.
- [ ] **Step 4: Run** `npx vitest run src/app/(app)/settings` + `npm run typecheck`. **Commit** `feat(rbac): settings trim tabs + gate groups`.

---

## Task 7: `/roles` — real role manager (replace mock)

**Files:** Modify `src/app/(app)/roles/page.tsx`, `roles-list.tsx`; create `role-editor.tsx`. Remove `mockRoles`/`allPermissions` usage. Test: `role-editor.test.tsx`, `roles-list.test.tsx`.

- [ ] **Step 1: Test role list loads from API** (mock `adminListRoles`) — renders role names + function counts; "Thêm vai trò" enabled (super).
- [ ] **Step 2: `roles-list.tsx`** — `useEffect` → `adminListRoles()`; state from API not `mockRoles`. Enable the create button.
- [ ] **Step 3: `role-editor.tsx`** — dialog: name, description, function checkboxes grouped (menu functions + settings.* groups from `adminGetFunctions()`); save → `adminCreateRole`/`adminUpdateRole`; delete guarded for `isSystem`.
- [ ] **Step 4: Test** editor toggles functions and submits the right payload (mock create).
- [ ] **Step 5: Run** `npx vitest run src/app/(app)/roles` + `npm run typecheck`. **Commit** `feat(rbac): real /roles role manager`.

---

## Task 8: User assignment — roles + overrides + super toggle

**Files:** Create `src/app/(app)/roles/components/user-assignment.tsx`; wire into `/roles` page as a second tab/section. Test: `user-assignment.test.tsx`.

- [ ] **Step 1: Test** — pick an admin user → shows their roles (checkboxes) + per-function override toggle (default / +GRANT / −REVOKE) + a computed "effective" preview; super toggle disabled for the last super.
- [ ] **Step 2: Implement** — reuse `getUsers({role:'ADMIN'})` for the user list, `adminSetUserRoles`, `adminSetUserOverrides`, `adminSetUserSuper`. Show effective = union(selected roles' functions) ± overrides (compute client-side for preview; server is source of truth).
- [ ] **Step 3: Test** effective preview reflects REVOKE-wins; save calls the three setters with correct payloads.
- [ ] **Step 4: Run** `npx vitest run src/app/(app)/roles` + `npm run typecheck`. **Commit** `feat(rbac): user role/override/super assignment UI`.

---

## Task 9: Login wiring + final sweep

**Files:** Modify `src/app/page.tsx` (login) to `refresh()` auth after login; grep for dangling `mockRoles`/`Permission`/`user-nav` imports.

- [ ] **Step 1: After `login()` success**, call `useAuth().refresh()` before `router.push('/dashboard')` → but redirect to **first permitted route** (not blindly `/dashboard`). If `/dashboard` not permitted, push first permitted or `/no-access`.
- [ ] **Step 2: Grep** `mockRoles|allPermissions|user-nav|Permission\b` → remove all dangling references; `src/lib/data.ts` drop `mockRoles`.
- [ ] **Step 3: Run full gate** `npm run typecheck` + `npx vitest run`. **Commit** `feat(rbac): login wiring + remove mock remnants`.

---

## Rollout

1. Backend (its plan) must be **on prod** first (`/admin/me` + gated endpoints live).
2. `feat/admin-rbac` (frontend) → merge `dev` → **test on DEV** (login → menu filtered by role, `/roles` manages, settings gated, no-access redirect, logout).
3. PR `feat/admin-rbac → main` → deploy (`npm run build` auto-deploys).
4. Resync `main → dev`.

## Self-review checklist (author)
- [ ] `navItems` filter covers all 25 menu functions + settings any-of + roles super-only.
- [ ] Route guard never targets `/dashboard` (loop) — targets `/no-access`.
- [ ] Footer name/phone from `me`; logout clears both tokens + `POST /auth/logout`; `UserNav` deleted.
- [ ] Settings shows only permitted groups; profile/api/notifications tabs gone.
- [ ] No `mockRoles`/`Permission` remnants; `npm run typecheck` clean.
