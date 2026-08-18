import { describe, it, expect } from 'vitest';
import { buildFunctionCatalog, allFunctionKeys, slugifyRoleKey } from './function-catalog';
import { MENU_FUNCTION_BY_HREF, SETTINGS_GROUP_FUNCTIONS } from './rbac';

describe('buildFunctionCatalog', () => {
  it('produces three groups: menu + settings + đặc biệt (không menu)', () => {
    const cat = buildFunctionCatalog();
    // 2026-08-18 (CRM GĐ3): nhóm thứ ba cho function không gắn href — thiếu nó thì
    // crm-compensate không hiện ở /roles và không cấp được cho ai (spec §7.1).
    expect(cat.map((g) => g.group)).toEqual([
      'Chức năng (menu)',
      'Cài đặt hệ thống',
      'Chức năng đặc biệt (không thuộc menu)',
    ]);
  });

  it('menu group covers all menu functions with labels', () => {
    const menu = buildFunctionCatalog()[0];
    expect(menu.items).toHaveLength(Object.keys(MENU_FUNCTION_BY_HREF).length);
    expect(menu.items.every((i) => i.label.length > 0)).toBe(true);
    expect(menu.items.map((i) => i.key)).toContain('finance');
  });

  it('settings group lists all 10 settings.* with human labels', () => {
    const settings = buildFunctionCatalog()[1];
    expect(settings.items.map((i) => i.key).sort()).toEqual([...SETTINGS_GROUP_FUNCTIONS].sort());
    const pricing = settings.items.find((i) => i.key === 'settings.pricing');
    expect(pricing?.label).toBe('Giá & Hoa hồng');
  });

  it('allFunctionKeys = 31 menu + 10 settings + 1 đặc biệt = 42 unique keys', () => {
    const keys = allFunctionKeys();
    // 2026-08-12: +crm-queue · 2026-08-18: +crm-tickets (menu) +crm-compensate (đặc biệt)
    expect(keys).toHaveLength(42);
    expect(new Set(keys).size).toBe(42);
  });

  /**
   * 🚨 Ca chịu lực của hạ tầng "function không-menu" (spec §7.1).
   *
   * `crm-compensate` KHÔNG có href nên hai nhóm đầu (dựng từ navItems / CONFIG_GROUPS)
   * không thể chứa nó. Thiếu nhóm thứ ba thì nó biến mất khỏi `/roles` ⇒ **không cấp được
   * cho ai**, và người implement sẽ bị dồn vào chỗ phải gộp nó vào `crm-tickets` — đúng
   * thứ spec §6.4 cấm (quyền xem khiếu nại ≠ quyền cấp tiền thật).
   */
  it('nhóm "Chức năng đặc biệt" tồn tại và chứa crm-compensate', () => {
    const groups = buildFunctionCatalog();
    const special = groups.find((g) => g.group.includes('đặc biệt'));
    expect(special).toBeDefined();
    expect(special!.items.map((i) => i.key)).toContain('crm-compensate');
  });

  // Nhãn là thứ người tick ĐỌC để quyết định — phải nói thẳng nó cấp quyền gì.
  it('nhãn crm-compensate cảnh báo rõ là cấp tiền thật', () => {
    const item = buildFunctionCatalog()
      .flatMap((g) => g.items)
      .find((i) => i.key === 'crm-compensate');
    expect(item!.label).toMatch(/TIỀN THẬT/i);
  });

  it('crm-compensate KHÔNG nằm trong nhóm menu (nó không có trang riêng)', () => {
    const menu = buildFunctionCatalog().find((g) => g.group.includes('menu'));
    expect(menu!.items.map((i) => i.key)).not.toContain('crm-compensate');
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
