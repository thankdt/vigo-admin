import type { AdminRole, FunctionOverride } from './types';

// Tài khoản super admin seed — UI KHÔNG cho hạ cờ super của số này (spec §2.3).
export const SEED_SUPER_PHONE = '9111111174';

export type OverrideMap = Record<string, 'GRANT' | 'REVOKE'>;

// Quyền hiệu lực = ( ∪ function của các role đã chọn ) ∪ GRANT \ REVOKE. REVOKE thắng
// (áp sau cùng) — thắng cả role lẫn GRANT (spec §2.2).
export function computeEffectiveFunctions(
  roles: Pick<AdminRole, 'id' | 'functions'>[],
  selectedRoleIds: string[],
  overrides: OverrideMap,
): string[] {
  const set = new Set<string>();
  const selected = new Set(selectedRoleIds);
  for (const r of roles) {
    if (selected.has(r.id)) for (const fn of r.functions) set.add(fn);
  }
  for (const [fn, eff] of Object.entries(overrides)) if (eff === 'GRANT') set.add(fn);
  for (const [fn, eff] of Object.entries(overrides)) if (eff === 'REVOKE') set.delete(fn);
  return [...set].sort();
}

// Chuyển list override <-> map (map dễ toggle trong UI).
export function overridesToMap(overrides: FunctionOverride[]): OverrideMap {
  const m: OverrideMap = {};
  for (const o of overrides) m[o.functionKey] = o.effect;
  return m;
}
export function mapToOverrides(map: OverrideMap): FunctionOverride[] {
  return Object.entries(map).map(([functionKey, effect]) => ({ functionKey, effect }));
}

// Có được phép HẠ cờ super của user này không. Cấm khi: là tài khoản seed, HOẶC là
// super cuối cùng (luôn giữ ≥1 super trong hệ thống) — spec §2.3.
export function isSuperToggleLocked(
  user: { phone: string; isSuperAdmin: boolean },
  totalSuperCount: number,
): boolean {
  if (user.phone === SEED_SUPER_PHONE) return true;
  if (user.isSuperAdmin && totalSuperCount <= 1) return true;
  return false;
}
