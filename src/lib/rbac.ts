// RBAC catalog mirror (frontend). MUST stay in sync with backend rbac.constants.ts.
// Function key của mỗi mục menu = href bỏ dấu '/' đầu (spec §2.1). `/settings` KHÔNG
// nằm ở đây: nó nở thành 8 function con `settings.*` và được gate riêng (any-of).
// Test đồng bộ (rbac.test.ts) khoá số 25 + 8 để thêm menu/nhóm mà quên khai báo -> fail.

export const MENU_FUNCTION_BY_HREF: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/users': 'users',
  '/drivers': 'drivers',
  '/transport-companies': 'transport-companies',
  '/bookings': 'bookings',
  '/referrals': 'referrals',
  '/kol': 'kol',
  '/agent': 'agent',
  '/agent-orders': 'agent-orders',
  '/withdrawals': 'withdrawals',
  '/finance': 'finance',
  '/acquisition': 'acquisition',
  '/driver-cashflow': 'driver-cashflow',
  '/htx-reconciliation': 'htx-reconciliation',
  '/invoices': 'invoices',
  '/master-data': 'master-data',
  '/promotions': 'promotions',
  '/reports': 'reports',
  '/notifications': 'notifications',
  '/news': 'news',
  '/banners': 'banners',
  '/app-popups': 'app-popups',
  '/feedback': 'feedback',
  '/leakage-review': 'leakage-review',
  '/driver-cancel-review': 'driver-cancel-review',
};

// 8 nhóm cấu hình = đúng CONFIG_GROUPS.id trên `main` (system-config-groups.ts).
export const SETTINGS_GROUP_FUNCTIONS = [
  'settings.app',
  'settings.pricing',
  'settings.dispatch',
  'settings.driver',
  'settings.growth',
  'settings.cancel',
  'settings.phone-reveal',
  'settings.misc',
] as const;

// Function key cho một href menu (undefined nếu không phải mục có gate, vd /settings, /roles).
export function functionForHref(href: string): string | undefined {
  return MENU_FUNCTION_BY_HREF[href];
}

import type { AdminMe } from './types';

// can nội bộ (không import makeCan để rbac.ts thuần data, tránh vòng phụ thuộc api).
const canFn = (me: AdminMe | null) => (fn: string) =>
  !!me && (me.isSuperAdmin || me.functions.includes(fn));

// Mục menu có hiện cho user này không.
// /settings: hiện nếu có ≥1 settings.* · /roles: chỉ super · mục thường: theo function.
// Href KHÔNG có trong map (mục mới quên khai báo) -> fail-CLOSED (ẩn) để không rò
// route chưa gate; test đồng bộ sẽ bắt việc quên khai báo.
export function isMenuVisible(href: string, me: AdminMe | null): boolean {
  const can = canFn(me);
  if (href === '/settings') return SETTINGS_GROUP_FUNCTIONS.some(can);
  if (href === '/roles') return !!me?.isSuperAdmin;
  const fn = functionForHref(href);
  return fn ? can(fn) : false;
}

// Segment cấp 1 của path: '/users/123' -> '/users'.
export function topSegment(pathname: string): string {
  return '/' + (pathname.split('/')[1] || '');
}

// Route guard (client-side UX; backend mới là chốt an ninh). me null -> false: caller
// PHẢI tự chặn gọi khi đang loading/chưa có me để tránh redirect nhầm lúc chưa biết quyền.
// /no-access luôn cho vào (đích redirect, không đòi quyền) -> tránh vòng lặp.
export function isRouteAllowed(pathname: string, me: AdminMe | null): boolean {
  if (!me) return false;
  if (me.isSuperAdmin) return true; // super bỏ qua mọi kiểm tra (kể cả route ngoài catalog)
  const top = topSegment(pathname);
  if (top === '/no-access') return true;
  if (top === '/roles') return false; // super-only, super đã return ở trên
  const can = canFn(me);
  if (top === '/settings') return SETTINGS_GROUP_FUNCTIONS.some(can);
  const fn = functionForHref(top);
  // Fail-CLOSED: route ngoài catalog (chỉ /no-access, /roles, /settings xử lý ở trên)
  // -> chặn về /no-access. Nhất quán với isMenuVisible; nếu sau này có trang tiện ích
  // cần miễn quyền, thêm allowlist tường minh ở đầu hàm.
  return fn ? can(fn) : false;
}

// Route đích sau đăng nhập = mục ĐẦU TIÊN user có quyền (theo thứ tự menu), hoặc
// /no-access nếu rỗng. KHÔNG bao giờ trả /dashboard mù quáng (dashboard cũng là 1
// function -> user không có nó sẽ bị guard đá lại -> vòng lặp).
export function firstAllowedRoute(me: AdminMe | null, orderedHrefs: string[]): string {
  if (!me) return '/no-access';
  if (me.isSuperAdmin) return orderedHrefs[0] ?? '/no-access';
  const first = orderedHrefs.find((h) => isMenuVisible(h, me));
  return first ?? '/no-access';
}
