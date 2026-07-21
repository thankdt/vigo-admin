import { describe, it, expect } from 'vitest';
import {
  computeEffectiveFunctions,
  overridesToMap,
  mapToOverrides,
  isSuperToggleLocked,
  SEED_SUPER_PHONE,
} from './rbac-effective';
import type { AdminRole } from './types';

const roles: Pick<AdminRole, 'id' | 'functions'>[] = [
  { id: 'r1', functions: ['bookings', 'finance'] },
  { id: 'r2', functions: ['users', 'finance'] },
];

describe('computeEffectiveFunctions', () => {
  it('unions the functions of the selected roles (dedup)', () => {
    expect(computeEffectiveFunctions(roles, ['r1', 'r2'], {})).toEqual(['bookings', 'finance', 'users']);
  });

  it('GRANT adds a function not in any role', () => {
    expect(computeEffectiveFunctions(roles, ['r1'], { invoices: 'GRANT' })).toEqual(['bookings', 'finance', 'invoices']);
  });

  it('REVOKE wins over role membership AND over GRANT', () => {
    expect(computeEffectiveFunctions(roles, ['r1'], { finance: 'REVOKE' })).toEqual(['bookings']);
    // same key granted + revoked (shouldn't happen via tri-state UI, but REVOKE must win)
    expect(computeEffectiveFunctions(roles, [], { x: 'GRANT', ...{ x: 'REVOKE' } as any })).toEqual([]);
  });

  it('unselected roles contribute nothing', () => {
    expect(computeEffectiveFunctions(roles, ['r2'], {})).toEqual(['finance', 'users']);
  });
});

describe('overrides map <-> list', () => {
  it('round-trips', () => {
    const list = [{ functionKey: 'finance', effect: 'REVOKE' as const }, { functionKey: 'kol', effect: 'GRANT' as const }];
    expect(mapToOverrides(overridesToMap(list))).toEqual(expect.arrayContaining(list));
    expect(overridesToMap(list)).toEqual({ finance: 'REVOKE', kol: 'GRANT' });
  });
});

describe('isSuperToggleLocked', () => {
  it('locks the seed super account regardless of count', () => {
    expect(isSuperToggleLocked({ phone: SEED_SUPER_PHONE, isSuperAdmin: true }, 5)).toBe(true);
  });

  it('locks the last remaining super (keep >=1)', () => {
    expect(isSuperToggleLocked({ phone: '0900', isSuperAdmin: true }, 1)).toBe(true);
  });

  it('allows demoting a super when others remain', () => {
    expect(isSuperToggleLocked({ phone: '0900', isSuperAdmin: true }, 2)).toBe(false);
  });

  it('does not lock a non-super (promotion allowed)', () => {
    expect(isSuperToggleLocked({ phone: '0900', isSuperAdmin: false }, 1)).toBe(false);
  });
});
