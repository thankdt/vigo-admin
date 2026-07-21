import { describe, it, expect } from 'vitest';
import { buildDiscountRows } from './price-breakdown-utils';
import type { PriceBreakdown } from '@/lib/types';

const base: PriceBreakdown = {
  transportPrice: 100000,
  sizeSurcharge: 0,
  weightSurcharge: 0,
  weekendSurcharge: 0,
  holidaySurcharge: 0,
  serviceFee: 0,
  vatAmount: 0,
  loyaltyDiscount: 0,
  promotionDiscount: 0,
};

describe('buildDiscountRows', () => {
  it('trả về [] khi breakdown null/undefined', () => {
    expect(buildDiscountRows(null)).toEqual([]);
    expect(buildDiscountRows(undefined)).toEqual([]);
  });

  it('bỏ qua các dòng = 0 (không regress hành vi cũ)', () => {
    expect(buildDiscountRows(base)).toEqual([]);
  });

  it('giữ nguyên 2 dòng cũ khi > 0', () => {
    const rows = buildDiscountRows({ ...base, loyaltyDiscount: 5000, promotionDiscount: 20000 });
    expect(rows).toEqual([
      { label: 'Khách thân thiết', value: 5000 },
      { label: 'Mã khuyến mãi', value: 20000 },
    ]);
  });

  it('KHÔNG hiện dòng giảm theo ghế ở chi tiết chuyến (dù seatDiscountAmount > 0)', () => {
    // Chuyến đã tạo: giá là giá CHỐT → không nêu giảm theo ghế (info lúc báo giá).
    expect(buildDiscountRows({ ...base, seatDiscountAmount: 15000, seatDiscountPercent: 10 })).toEqual([]);
    // loyalty/promotion vẫn hiện như cũ.
    expect(buildDiscountRows({ ...base, loyaltyDiscount: 5000, seatDiscountAmount: 15000 })).toEqual([
      { label: 'Khách thân thiết', value: 5000 },
    ]);
  });
});
