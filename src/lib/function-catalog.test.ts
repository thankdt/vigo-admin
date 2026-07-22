import { describe, it, expect } from 'vitest';
import { buildFunctionCatalog, allFunctionKeys, slugifyRoleKey } from './function-catalog';
import { MENU_FUNCTION_BY_HREF, SETTINGS_GROUP_FUNCTIONS } from './rbac';

describe('buildFunctionCatalog', () => {
  it('produces two groups: menu functions + settings groups', () => {
    const cat = buildFunctionCatalog();
    expect(cat.map((g) => g.group)).toEqual(['Chức năng (menu)', 'Cài đặt hệ thống']);
  });

  it('menu group covers all 25 menu functions with labels', () => {
    const menu = buildFunctionCatalog()[0];
    expect(menu.items).toHaveLength(Object.keys(MENU_FUNCTION_BY_HREF).length);
    expect(menu.items.every((i) => i.label.length > 0)).toBe(true);
    expect(menu.items.map((i) => i.key)).toContain('finance');
  });

  it('settings group lists all 8 settings.* with human labels', () => {
    const settings = buildFunctionCatalog()[1];
    expect(settings.items.map((i) => i.key).sort()).toEqual([...SETTINGS_GROUP_FUNCTIONS].sort());
    const pricing = settings.items.find((i) => i.key === 'settings.pricing');
    expect(pricing?.label).toBe('Giá & Hoa hồng');
  });

  it('allFunctionKeys = 25 menu + 8 settings = 33 unique keys', () => {
    const keys = allFunctionKeys();
    expect(keys).toHaveLength(33);
    expect(new Set(keys).size).toBe(33);
  });
});

describe('slugifyRoleKey', () => {
  it('strips Vietnamese diacritics and lowercases', () => {
    expect(slugifyRoleKey('Vận hành')).toBe('van-hanh');
    expect(slugifyRoleKey('Tài chính & Hoá đơn')).toBe('tai-chinh-hoa-don');
  });

  it('handles đ/Đ and trims separators', () => {
    expect(slugifyRoleKey('  Đội điều phối  ')).toBe('doi-dieu-phoi');
  });
});
