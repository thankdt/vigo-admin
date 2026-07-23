import { describe, it, expect } from 'vitest';
import { buildConfigGroups, groupIdFor } from './system-config-groups';
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

  it('regroup 2026-07-23: key rời misc về đúng nhóm mới', () => {
    const configs = [
      { key: 'KOL_TRIP_PERCENT', value: '5', description: '' },
      { key: 'BOOKING_AGENT_MIN_FARE', value: '50000', description: '' },
      { key: 'CARPOOL_SEAT_DISCOUNT_2', value: '10', description: '' },
      { key: 'SCHEDULED_REFIRE_LEAD_MS', value: '600000', description: '' },
      { key: 'SCHEDULE_MIN_LEAD_MINUTES', value: '30', description: '' },
      { key: 'VINOW_CODE_TTL_MINUTES', value: '15', description: '' },
      { key: 'HOTLINE', value: '1900', description: '' },
      { key: 'HOTLINE_DRIVER', value: '1901', description: '' },
      { key: 'ZALO_TOKEN_EXPIRES_AT', value: 'x', description: '' }, // giữ misc (chỉ super sửa)
    ];
    const byId = Object.fromEntries(
      buildConfigGroups(configs, '', canFor(mkMe({ isSuperAdmin: true }))).map((e) => [
        e.group.id,
        e.items.map((c) => c.key).sort(),
      ]),
    );
    expect(byId['kol']).toEqual(['KOL_TRIP_PERCENT']);
    expect(byId['agent']).toEqual(['BOOKING_AGENT_MIN_FARE']);
    expect(byId['pricing']).toEqual(['CARPOOL_SEAT_DISCOUNT_2']);
    expect(byId['dispatch']).toEqual([
      'SCHEDULED_REFIRE_LEAD_MS',
      'SCHEDULE_MIN_LEAD_MINUTES',
      'VINOW_CODE_TTL_MINUTES',
    ]);
    expect(byId['app']).toEqual(['HOTLINE', 'HOTLINE_DRIVER']);
    expect(byId['misc']).toEqual(['ZALO_TOKEN_EXPIRES_AT']);
  });

  it('applies the search filter within permitted groups', () => {
    const groups = buildConfigGroups(CONFIGS, 'radius', canFor(mkMe({ isSuperAdmin: true })));
    expect(groups.map((g) => g.group.id)).toEqual(['dispatch']);
    expect(groups[0].items).toHaveLength(1);
  });
});

describe('groupIdFor — CARPOOL seat discount keys', () => {
  const seatDiscountKeys = [
    'CARPOOL_SEAT_DISCOUNT_2',
    'CARPOOL_SEAT_DISCOUNT_3',
    'CARPOOL_SEAT_DISCOUNT_4',
    'CARPOOL_SEAT_DISCOUNT_5',
  ];

  it.each(seatDiscountKeys)('routes %s to the pricing group', (key) => {
    expect(groupIdFor(key)).toBe('pricing');
  });

  it('does not fall through to misc (catch-all)', () => {
    expect(groupIdFor('CARPOOL_SEAT_DISCOUNT_2')).not.toBe('misc');
  });
});
