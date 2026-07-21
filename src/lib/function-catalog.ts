import { navItems } from './nav-items';
import { functionForHref, SETTINGS_GROUP_FUNCTIONS } from './rbac';
import { CONFIG_GROUPS } from '@/app/(app)/settings/components/system-config-groups';

// Danh mục function cho UI tick (role editor). Dựng từ FE mirror (nav-items +
// CONFIG_GROUPS) — đúng nguồn chân lý spec §2.1 (catalog nằm trong CODE cả BE lẫn FE).
// Không phụ thuộc runtime GET /admin/functions nên /roles dùng được ngay cả khi BE
// đang code song song; test trên DEV sẽ đối chiếu số/khoá với BE.
export type FunctionGroup = { group: string; items: { key: string; label: string }[] };

export function buildFunctionCatalog(): FunctionGroup[] {
  const menu = navItems
    .map((i) => ({ key: functionForHref(i.href), label: i.label }))
    .filter((x): x is { key: string; label: string } => !!x.key);

  const settingsLabel = new Map(CONFIG_GROUPS.map((g) => [`settings.${g.id}`, g.label] as const));
  const settings = SETTINGS_GROUP_FUNCTIONS.map((key) => ({ key, label: settingsLabel.get(key) ?? key }));

  return [
    { group: 'Chức năng (menu)', items: menu },
    { group: 'Cài đặt hệ thống', items: settings },
  ];
}

// Tập TẤT CẢ function key hợp lệ (menu + settings) — để validate/hiển thị.
export function allFunctionKeys(): string[] {
  return buildFunctionCatalog().flatMap((g) => g.items.map((i) => i.key));
}

// Slug hoá tên role -> key (create). Bỏ dấu tiếng Việt, còn a-z0-9 và gạch ngang.
export function slugifyRoleKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining diacritics (dấu tiếng Việt)
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
