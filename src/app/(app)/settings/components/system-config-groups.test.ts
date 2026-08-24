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
    ]);
    expect(byId['app']).toEqual(['HOTLINE', 'HOTLINE_DRIVER']);
    expect(byId['misc']).toEqual(['ZALO_TOKEN_EXPIRES_AT']);
  });

  // Map style remote config: 2 key mới phải rơi nhóm 'app' (quyền settings.app) —
  // chúng chứa '_APP_' nên KHÔNG được rơi catch-all 'misc' (chỉ super sửa được).
  it('CUSTOMER_APP_MAP_STYLE_URL / DRIVER_APP_MAP_STYLE_URL rơi nhóm app, không rơi misc', () => {
    const configs = [
      { key: 'CUSTOMER_APP_MAP_STYLE_URL', value: 'https://maps.vietmap.vn/s.json', description: '' },
      { key: 'DRIVER_APP_MAP_STYLE_URL', value: 'https://maps.vietmap.vn/s.json', description: '' },
    ];
    const groups = buildConfigGroups(configs, '', canFor(mkMe({ isSuperAdmin: true })));
    expect(groups).toHaveLength(1);
    expect(groups[0].group.id).toBe('app');
    expect(groups[0].items.map((c) => c.key).sort()).toEqual([
      'CUSTOMER_APP_MAP_STYLE_URL',
      'DRIVER_APP_MAP_STYLE_URL',
    ]);
    // và user chỉ có settings.app vẫn thấy chúng
    const asAppEditor = buildConfigGroups(configs, '', canFor(mkMe({ functions: ['settings.app'] })));
    expect(asAppEditor.map((g) => g.group.id)).toEqual(['app']);
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

// 18/08: gom cả họ "khách chọn tài xế" về MỘT nhóm — chủ dự án: "gom hết config liên
// quan phần này vào 1 group riêng, đỡ phải tìm". Mirror BE `PICK_DRIVER_KEYS`.
describe('nhóm Khách chọn tài xế', () => {
  it('công tắc + TTL mã + sheet gợi ý về nhóm pick-driver', () => {
    expect(groupIdFor('DIRECT_ASSIGN_ENABLED')).toBe('pick-driver');
    expect(groupIdFor('VINOW_CODE_ENABLED')).toBe('pick-driver');
    expect(groupIdFor('VINOW_CODE_TTL_MINUTES')).toBe('pick-driver');
    expect(groupIdFor('DISPATCH_CUSTOMER_FALLBACK_ENABLED')).toBe('pick-driver');
  });

  it('hạn mức chống quấy rối cùng nhóm, không lẫn ở Điều phối / Tài xế', () => {
    expect(groupIdFor('DIRECT_ASSIGN_PAIR_MAX')).toBe('pick-driver');
    expect(groupIdFor('DIRECT_ASSIGN_PAIR_WINDOW_SEC')).toBe('pick-driver');
    expect(groupIdFor('DRIVER_LOOKUP_MAX')).toBe('pick-driver');
    expect(groupIdFor('DRIVER_LOOKUP_WINDOW_SEC')).toBe('pick-driver');
  });

  it('key khác vẫn ở nhóm cũ — không kéo nhầm cả DISPATCH_* / DRIVER_*', () => {
    expect(groupIdFor('DISPATCH_MAX_ATTEMPTS')).toBe('dispatch');
    expect(groupIdFor('DRIVER_MIN_DEPOSIT')).toBe('driver');
  });
});

// Cờ kênh đánh thức (bắn "Có cuốc mới" cho tài đang OFFLINE) được seed lần đầu ở BE
// migration 1794800000000. Trước đó không có row nên key vô hình trong màn này —
// admin không tắt được kênh. Nhóm phải KHỚP mirror BE `settingsGroupForKey`: lệch là
// người sửa được nhóm ở UI lại bị BE chặn ghi (AUTH_003), không rõ vì sao.
describe('groupIdFor — cờ kênh đánh thức WAKE_*', () => {
  it('WAKE_PUSH_ENABLED / WAKE_UNACTIVATED_ENABLED vào nhóm dispatch, không rơi misc', () => {
    expect(groupIdFor('WAKE_PUSH_ENABLED')).toBe('dispatch');
    expect(groupIdFor('WAKE_UNACTIVATED_ENABLED')).toBe('dispatch');
  });

  it('người có quyền settings.dispatch nhìn thấy và sửa được', () => {
    const configs = [{ key: 'WAKE_PUSH_ENABLED', value: 'true', description: 'Kênh đánh thức' }];
    const groups = buildConfigGroups(configs, '', canFor(mkMe({ functions: ['settings.dispatch'] })));
    expect(groups.map((g) => g.group.id)).toEqual(['dispatch']);
    expect(groups[0].items.map((c) => c.key)).toEqual(['WAKE_PUSH_ENABLED']);
  });
});
