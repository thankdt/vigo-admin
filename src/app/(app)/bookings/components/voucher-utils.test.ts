import { describe, it, expect } from 'vitest';
import { fmtVnd, isVoucherSelectable, voucherLabel } from './voucher-utils';
import type { Promotion } from '@/lib/types';

const NOW = Date.parse('2026-06-26T00:00:00.000Z');

// A fully eligible public voucher; tests override single fields. `usedCount` is
// the field the backend actually returns (not in the Promotion type), so it's
// attached via the loose overrides object.
function voucher(overrides: Partial<Promotion> & { usedCount?: number } = {}): Promotion {
  return {
    id: 1,
    code: 'GIAM50K',
    discountType: 'FIXED_AMOUNT',
    discountValue: 50000,
    minOrderValue: 0,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.000Z',
    usageLimit: 0,
    usageCount: 0,
    pointCost: 0,
    isActive: true,
    ...overrides,
  } as Promotion;
}

describe('isVoucherSelectable', () => {
  it('accepts an active, in-window, public, non-exhausted voucher', () => {
    expect(isVoucherSelectable(voucher(), NOW)).toBe(true);
  });

  it('rejects an inactive voucher', () => {
    expect(isVoucherSelectable(voucher({ isActive: false }), NOW)).toBe(false);
  });

  it('rejects a point-redeemable voucher (pointCost > 0)', () => {
    expect(isVoucherSelectable(voucher({ pointCost: 100 }), NOW)).toBe(false);
  });

  it('treats pointCost "0.00" (string/decimal) as public', () => {
    expect(isVoucherSelectable(voucher({ pointCost: '0.00' as any }), NOW)).toBe(true);
  });

  it('rejects a voucher that has not started yet', () => {
    expect(isVoucherSelectable(voucher({ startDate: '2026-07-01T00:00:00.000Z' }), NOW)).toBe(false);
  });

  it('rejects an expired voucher', () => {
    expect(isVoucherSelectable(voucher({ endDate: '2026-06-01T00:00:00.000Z' }), NOW)).toBe(false);
  });

  it('accepts on the window boundaries (start == now, end == now)', () => {
    const startNow = new Date(NOW).toISOString();
    expect(isVoucherSelectable(voucher({ startDate: startNow }), NOW)).toBe(true);
    expect(isVoucherSelectable(voucher({ endDate: startNow }), NOW)).toBe(true);
  });

  it('rejects a voucher with invalid dates', () => {
    expect(isVoucherSelectable(voucher({ startDate: 'not-a-date' }), NOW)).toBe(false);
  });

  describe('usage limit', () => {
    it('accepts when usageLimit is 0 (unlimited) regardless of count', () => {
      expect(isVoucherSelectable(voucher({ usageLimit: 0, usedCount: 999 }), NOW)).toBe(true);
    });

    it('reads `usedCount` (the field the backend returns) against the limit', () => {
      expect(isVoucherSelectable(voucher({ usageLimit: 100, usedCount: 99 }), NOW)).toBe(true);
      expect(isVoucherSelectable(voucher({ usageLimit: 100, usedCount: 100 }), NOW)).toBe(false);
    });

    it('falls back to `usageCount` when `usedCount` is absent', () => {
      expect(isVoucherSelectable(voucher({ usageLimit: 100, usageCount: 100 }), NOW)).toBe(false);
      expect(isVoucherSelectable(voucher({ usageLimit: 100, usageCount: 10 }), NOW)).toBe(true);
    });

    it('handles string decimal counters/limits ("100.00")', () => {
      expect(isVoucherSelectable(voucher({ usageLimit: '100.00' as any, usedCount: '100' as any }), NOW)).toBe(false);
    });
  });

  it('is safe to use as a wrapped filter predicate (index not leaked as `now`)', () => {
    const list = [voucher({ id: 1 }), voucher({ id: 2 }), voucher({ id: 3, isActive: false })];
    // The wrapper is what the dialog uses; passing the fn directly would feed
    // the index in as `now` and is intentionally NOT how it's called.
    expect(list.filter((v) => isVoucherSelectable(v, NOW)).map((v) => v.id)).toEqual([1, 2]);
  });
});

describe('voucherLabel', () => {
  it('formats a fixed-amount voucher', () => {
    expect(voucherLabel(voucher({ code: 'A', discountType: 'FIXED_AMOUNT', discountValue: 50000 })))
      .toBe('A — giảm 50.000đ');
  });

  it('formats a percentage voucher with a max-discount cap', () => {
    expect(voucherLabel(voucher({ code: 'P10', discountType: 'PERCENTAGE', discountValue: 10, maxDiscount: 50000 })))
      .toBe('P10 — giảm 10% (tối đa 50.000đ)');
  });

  it('omits the cap when maxDiscount is absent', () => {
    expect(voucherLabel(voucher({ code: 'P10', discountType: 'PERCENTAGE', discountValue: 10, maxDiscount: undefined })))
      .toBe('P10 — giảm 10%');
  });

  it('appends the minimum-order hint only when minOrderValue > 0', () => {
    expect(voucherLabel(voucher({ code: 'A', minOrderValue: 100000 }))).toBe('A — giảm 50.000đ, đơn từ 100.000đ');
    expect(voucherLabel(voucher({ code: 'A', minOrderValue: 0 }))).toBe('A — giảm 50.000đ');
  });

  it('coerces string decimal amounts before formatting', () => {
    expect(voucherLabel(voucher({ code: 'A', discountValue: '50000.00' as any, minOrderValue: '100000.00' as any })))
      .toBe('A — giảm 50.000đ, đơn từ 100.000đ');
  });
});

describe('fmtVnd', () => {
  it('groups thousands with vi-VN separators', () => {
    expect(fmtVnd(1234567)).toBe('1.234.567');
  });
  it('accepts string decimals', () => {
    expect(fmtVnd('50000.00')).toBe('50.000');
  });
  it('falls back to 0 for nullish/NaN input', () => {
    expect(fmtVnd(undefined as any)).toBe('0');
    expect(fmtVnd('abc')).toBe('0');
  });
});
