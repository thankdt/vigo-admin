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
