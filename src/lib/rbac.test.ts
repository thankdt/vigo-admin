import { describe, it, expect } from 'vitest';
import {
  MENU_FUNCTION_BY_HREF,
  SETTINGS_GROUP_FUNCTIONS,
  functionForHref,
  isMenuVisible,
  isRouteAllowed,
  firstAllowedRoute,
} from './rbac';
import { navItems } from './nav-items';
import { CONFIG_GROUPS } from '@/app/(app)/settings/components/system-config-groups';
import type { AdminMe } from './types';

const mkMe = (over: Partial<AdminMe> = {}): AdminMe => ({
  id: 'u', fullName: 'A', phone: '0900', isSuperAdmin: false, functions: [], ...over,
});

// Sync guard for the RBAC catalog. If someone adds a menu item or a config group but
// forgets to declare its function, these hard-coded counts / derived assertions fail
// instead of the permission silently slipping through the gate (spec §2.1).
describe('rbac catalog mirror', () => {
  it('has exactly 25 menu functions (navItems minus /settings)', () => {
    expect(Object.keys(MENU_FUNCTION_BY_HREF).length).toBe(25);
  });

  it('each menu function key = its href without the leading slash', () => {
    for (const [href, fn] of Object.entries(MENU_FUNCTION_BY_HREF)) {
      expect(fn).toBe(href.replace(/^\//, ''));
    }
  });

  it('/settings and /roles are NOT plain menu functions (gated separately)', () => {
    expect(functionForHref('/settings')).toBeUndefined();
    expect(functionForHref('/roles')).toBeUndefined();
  });

  it('functionForHref returns the mapped key for a known href', () => {
    expect(functionForHref('/finance')).toBe('finance');
  });

  it('SETTINGS_GROUP_FUNCTIONS mirrors CONFIG_GROUPS exactly (one settings.<id> per group)', () => {
    const expected = CONFIG_GROUPS.map((g) => `settings.${g.id}`).sort();
    expect([...SETTINGS_GROUP_FUNCTIONS].sort()).toEqual(expected);
    expect(SETTINGS_GROUP_FUNCTIONS.length).toBe(8);
  });

  it('every navItems href except /settings is declared in the catalog (no unmapped menu)', () => {
    for (const item of navItems) {
      if (item.href === '/settings') continue;
      expect(functionForHref(item.href), `missing function for ${item.href}`).toBeDefined();
    }
  });
});

describe('isMenuVisible()', () => {
  it('super sees every menu item + /roles', () => {
    const su = mkMe({ isSuperAdmin: true });
    for (const item of navItems) expect(isMenuVisible(item.href, su)).toBe(true);
    expect(isMenuVisible('/roles', su)).toBe(true);
  });

  it('normal admin sees only granted menu items; /roles hidden', () => {
    const me = mkMe({ functions: ['users'] });
    expect(isMenuVisible('/users', me)).toBe(true);
    expect(isMenuVisible('/finance', me)).toBe(false);
    expect(isMenuVisible('/roles', me)).toBe(false);
  });

  it('/settings shows with ANY settings.* function', () => {
    expect(isMenuVisible('/settings', mkMe({ functions: ['settings.pricing'] }))).toBe(true);
    expect(isMenuVisible('/settings', mkMe({ functions: ['users'] }))).toBe(false);
  });

  it('unknown href fails closed (hidden)', () => {
    expect(isMenuVisible('/brand-new-page', mkMe({ isSuperAdmin: false, functions: [] }))).toBe(false);
  });
});

describe('isRouteAllowed()', () => {
  const me = mkMe({ functions: ['users'] });

  it('allows a permitted route and its sub-paths', () => {
    expect(isRouteAllowed('/users', me)).toBe(true);
    expect(isRouteAllowed('/users/123', me)).toBe(true);
  });

  it('blocks a route the user lacks', () => {
    expect(isRouteAllowed('/finance', me)).toBe(false);
  });

  it('always allows /no-access (redirect target, no permission)', () => {
    expect(isRouteAllowed('/no-access', me)).toBe(true);
    expect(isRouteAllowed('/no-access', mkMe({ functions: [] }))).toBe(true);
  });

  it('restricts /roles to super only', () => {
    expect(isRouteAllowed('/roles', me)).toBe(false);
    expect(isRouteAllowed('/roles', mkMe({ isSuperAdmin: true }))).toBe(true);
  });

  it('gates /settings by any-of settings.*', () => {
    expect(isRouteAllowed('/settings', mkMe({ functions: ['settings.app'] }))).toBe(true);
    expect(isRouteAllowed('/settings', me)).toBe(false);
  });
});

describe('firstAllowedRoute()', () => {
  const hrefs = navItems.map((i) => i.href);

  it('returns the first menu href the user can access (never blindly /dashboard)', () => {
    const me = mkMe({ functions: ['finance'] });
    expect(firstAllowedRoute(me, hrefs)).toBe('/finance');
  });

  it('returns /no-access when the user has no permitted menu', () => {
    expect(firstAllowedRoute(mkMe({ functions: [] }), hrefs)).toBe('/no-access');
  });

  it('super lands on the first menu item', () => {
    expect(firstAllowedRoute(mkMe({ isSuperAdmin: true }), hrefs)).toBe('/dashboard');
  });
});
