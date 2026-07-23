import { describe, it, expect } from 'vitest';
import { buildConfigGroups } from './system-config-groups';
import type { AdminMe } from '@/lib/types';

const CONFIGS = [
  { key: 'PRICING_BASE_FARE', value: '10000', description: 'Giá cơ bản' },
  { key: 'DISPATCH_RADIUS', value: '5', description: 'Bán kính điều phối' },
];

const canFor = (me: AdminMe) => (groupId: string) =>
  me.isSuperAdmin || me.functions.includes('settings.' + groupId);

const mkMe = (over: Partial<AdminMe> = {}): AdminMe => ({
  id: 'u', fullName: 'A', phone: '0900', isSuperAdmin: false, functions: [], ...over,
});

// buildConfigGroups is the RBAC gate for the settings page: only groups the user has
// settings.<id> for (super = all) come through, and only when they have matching items.
describe('buildConfigGroups (settings RBAC gate)', () => {
  it('returns only the groups the user has settings.<group> for', () => {
    const groups = buildConfigGroups(CONFIGS, '', canFor(mkMe({ functions: ['settings.pricing'] })));
    expect(groups.map((g) => g.group.id)).toEqual(['pricing']);
    expect(groups.map((g) => g.group.label)).toContain('Giá & Hoa hồng');
  });

  it('super admin gets every group that has items', () => {
    const ids = buildConfigGroups(CONFIGS, '', canFor(mkMe({ isSuperAdmin: true }))).map((g) => g.group.id);
    expect(ids).toContain('pricing');
    expect(ids).toContain('dispatch');
  });

  it('returns nothing when the user has no settings.* permission', () => {
    expect(buildConfigGroups(CONFIGS, '', canFor(mkMe({ functions: ['users'] })))).toEqual([]);
  });

  it('CANCEL_* và LEAKAGE_* nằm CHUNG nhóm cancel (2 function chống gian lận sau-huỷ)', () => {
    const configs = [
      { key: 'CANCEL_ENFORCEMENT_MODE', value: 'SHADOW', description: '' },
      { key: 'LEAKAGE_DETECTION_ENABLED', value: 'true', description: '' },
    ];
    const groups = buildConfigGroups(configs, '', canFor(mkMe({ isSuperAdmin: true })));
    expect(groups).toHaveLength(1);
    expect(groups[0].group.id).toBe('cancel'); // giữ id cũ — RBAC settings.cancel đã cấp không được vỡ
    expect(groups[0].items.map((c) => c.key).sort()).toEqual([
      'CANCEL_ENFORCEMENT_MODE',
      'LEAKAGE_DETECTION_ENABLED',
    ]);
  });

  it('applies the search filter within permitted groups', () => {
    const groups = buildConfigGroups(CONFIGS, 'radius', canFor(mkMe({ isSuperAdmin: true })));
    expect(groups.map((g) => g.group.id)).toEqual(['dispatch']);
    expect(groups[0].items).toHaveLength(1);
  });
});
