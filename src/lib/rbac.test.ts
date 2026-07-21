import { describe, it, expect } from 'vitest';
import { MENU_FUNCTION_BY_HREF, SETTINGS_GROUP_FUNCTIONS, functionForHref } from './rbac';
import { CONFIG_GROUPS } from '@/app/(app)/settings/components/system-config-groups';

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
});
