import { describe, it, expect } from 'vitest';
import { groupIdFor, CONFIG_GROUPS } from './system-config-groups';

describe('groupIdFor — loyalty redesign keys', () => {
  // §9 keys that must surface in the existing "Giới thiệu & Hạng thành viên" group.
  const loyaltyKeys = [
    'TIER_POINT_VND_PER_POINT',
    'REWARD_POINT_VND_PER_POINT',
    'REWARD_MULTIPLIER_MEMBER',
    'REWARD_MULTIPLIER_SILVER',
    'REWARD_MULTIPLIER_GOLD',
    'REWARD_MULTIPLIER_DIAMOND',
    'TIER_THRESHOLD_SILVER',
    'TIER_THRESHOLD_GOLD',
    'TIER_THRESHOLD_DIAMOND',
    'REWARD_POINT_EXPIRY_MONTHS',
    'REWARD_EXPIRY_NOTIFY_DAYS',
    'TIER_RECALC_STALE_HOURS',
    'TIER_DOWNGRADE_NOTIFY_DAYS',
  ];

  it.each(loyaltyKeys)('routes %s to the growth group', (key) => {
    expect(groupIdFor(key)).toBe('growth');
  });

  it('keeps the pre-existing growth keys in growth (no regression)', () => {
    expect(groupIdFor('LOYALTY_GOLD_PERCENT')).toBe('growth');
    expect(groupIdFor('REFERRAL_BONUS_AMOUNT')).toBe('growth');
    expect(groupIdFor('SIGNUP_LOYALTY_REWARD')).toBe('growth');
  });
});

describe('groupIdFor — other groups unchanged (precedence guard)', () => {
  it('does not let TIER_/REWARD_ leak into an earlier group', () => {
    // None of the loyalty keys contain _APP_, start with PRICING_/DISPATCH_/ROUTE_/
    // CHAIN_/DRIVER_, so the FIRST match must be growth, not an earlier group.
    expect(groupIdFor('REWARD_MULTIPLIER_GOLD')).not.toBe('app');
    expect(groupIdFor('TIER_THRESHOLD_GOLD')).not.toBe('dispatch');
    expect(groupIdFor('TIER_DOWNGRADE_NOTIFY_DAYS')).not.toBe('driver');
  });

  it('maps representative keys of each other group correctly', () => {
    expect(groupIdFor('PRICING_BASE_FARE')).toBe('pricing');
    expect(groupIdFor('VIGO_COMMISSION_RATE')).toBe('pricing');
    expect(groupIdFor('DISPATCH_RADIUS')).toBe('dispatch');
    expect(groupIdFor('ROUTE_MATCH_SHADOW')).toBe('dispatch');
    expect(groupIdFor('RIDE_ALLOW_OFF_ROUTE')).toBe('dispatch');
    expect(groupIdFor('DRIVER_MAX_ROUTES')).toBe('driver');
    expect(groupIdFor('MIN_APP_VERSION')).toBe('app');
    expect(groupIdFor('SOME_RANDOM_KEY')).toBe('misc'); // catch-all
    expect(groupIdFor('CANCEL_ENFORCEMENT_MODE')).toBe('cancel');
  });

  it('SIGNUP_LOYALTY_REWARD is an EXACT match, not a SIGNUP_ prefix', () => {
    // The growth rule matches `k === 'SIGNUP_LOYALTY_REWARD'`, not `startsWith('SIGNUP_')`
    // — so an unrelated SIGNUP_* key must fall through to the catch-all.
    expect(groupIdFor('SIGNUP_LOYALTY_REWARD')).toBe('growth');
    expect(groupIdFor('SIGNUP_OTHER_THING')).toBe('misc');
  });

  it('catch-all group stays last', () => {
    expect(CONFIG_GROUPS[CONFIG_GROUPS.length - 1].id).toBe('misc');
  });

  it('does not let CANCEL_ leak into an earlier group and stays before misc', () => {
    expect(groupIdFor('CANCEL_ENFORCEMENT_MODE')).toBe('cancel');
    expect(groupIdFor('CANCEL_RATE_THRESHOLD_PCT')).toBe('cancel');
    const cancelIdx = CONFIG_GROUPS.findIndex((g) => g.id === 'cancel');
    const miscIdx = CONFIG_GROUPS.findIndex((g) => g.id === 'misc');
    expect(cancelIdx).toBeGreaterThanOrEqual(0);
    expect(cancelIdx).toBeLessThan(miscIdx);
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
