import { describe, it, expect } from 'vitest';
import {
  buildDiscountRows,
  grossTransportPrice,
  subtractableDiscountTotal,
} from './price-breakdown-utils';
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

  it('thêm dòng giảm giá theo ghế khi seatDiscountAmount > 0, không có percent', () => {
    const rows = buildDiscountRows({ ...base, seatDiscountAmount: 15000 });
    expect(rows).toEqual([{ label: 'Giảm giá theo số ghế (đi chung)', value: 15000 }]);
  });

  it('thêm % vào label khi có seatDiscountPercent > 0', () => {
    const rows = buildDiscountRows({ ...base, seatDiscountAmount: 15000, seatDiscountPercent: 10 });
    expect(rows).toEqual([{ label: 'Giảm giá theo số ghế (đi chung, -10%)', value: 15000 }]);
  });

  it('không thêm dòng khi seatDiscountAmount = 0 hoặc thiếu', () => {
    expect(buildDiscountRows({ ...base, seatDiscountAmount: 0 })).toEqual([]);
    expect(buildDiscountRows(base)).toEqual([]);
  });
});

describe('subtractableDiscountTotal — KHÔNG được gộp giảm giá ghế', () => {
  it('chỉ cộng loyalty + promotion', () => {
    expect(
      subtractableDiscountTotal({ ...base, loyaltyDiscount: 5000, promotionDiscount: 20000 }),
    ).toBe(25000);
  });

  it('BỎ QUA seatDiscountAmount — backend đã trừ sẵn vào transportPrice', () => {
    // Đây là hồi quy của bug trừ hai lần. Nếu ai đó đổi hàm này thành
    // "cộng tổng buildDiscountRows cho gọn" thì ca này đỏ.
    expect(
      subtractableDiscountTotal({ ...base, promotionDiscount: 50000, seatDiscountAmount: 60000 }),
    ).toBe(50000);
  });

  it('breakdown null/undefined → 0', () => {
    expect(subtractableDiscountTotal(null)).toBe(0);
    expect(subtractableDiscountTotal(undefined)).toBe(0);
  });
});

describe('grossTransportPrice', () => {
  it('cộng lại phần đã giảm theo ghế để ra giá gộp', () => {
    expect(grossTransportPrice({ ...base, transportPrice: 540000, seatDiscountAmount: 60000 }))
      .toBe(600000);
  });

  it('chuyến không phải CARPOOL: bằng đúng transportPrice như cũ', () => {
    expect(grossTransportPrice({ ...base, transportPrice: 100000 })).toBe(100000);
    expect(grossTransportPrice({ ...base, transportPrice: 100000, seatDiscountAmount: 0 }))
      .toBe(100000);
  });

  it('breakdown null/undefined → 0', () => {
    expect(grossTransportPrice(null)).toBe(0);
    expect(grossTransportPrice(undefined)).toBe(0);
  });
});

describe('cả cột phải cộng ra được "Khách trả" — chuyến thật abd6f444', () => {
  // Số lấy từ prod: CARPOOL 2 ghế, HN → Tuyên Quang, 123.3km.
  // price = 540.000 (= transportPrice, không phụ phí), finalPrice = 529.200.
  const real: PriceBreakdown = {
    transportPrice: 540000,
    sizeSurcharge: 0,
    weightSurcharge: 0,
    weekendSurcharge: 0,
    holidaySurcharge: 0,
    serviceFee: 0,
    vatAmount: 39200,
    loyaltyDiscount: 0,
    promotionDiscount: 50000,
    priceBeforeDiscount: 583200,
    seatDiscountPercent: 10,
    seatDiscountAmount: 60000,
  };
  const bookingPrice = 540000;
  const finalPrice = 529200;

  it('gộp − các dòng giảm giá hiển thị = giá thực tế', () => {
    // Dòng đầu bảng là GỘP, nên trừ TOÀN BỘ dòng giảm giá đang hiện (kể cả ghế)
    // phải ra đúng giá thực tế. Đây là điều mắt người đọc trên màn hình.
    const rowsTotal = buildDiscountRows(real).reduce((s, d) => s + d.value, 0);
    expect(grossTransportPrice(real) - rowsTotal).toBe(490000);
  });

  it('giá thực tế tính từ booking.price khớp với cột hiển thị', () => {
    // Còn đây là đường code thật của UI: booking.price − (loyalty + promotion).
    expect(bookingPrice - subtractableDiscountTotal(real)).toBe(490000);
  });

  it('giá thực tế + VAT = khách trả (bug cũ ra 469.200 ≠ 529.200)', () => {
    const priceAfterDiscount = bookingPrice - subtractableDiscountTotal(real);
    expect(priceAfterDiscount + real.vatAmount).toBe(finalPrice);
  });
});

describe('CÓ PHỤ PHÍ — phân biệt được công thức đúng với "gộp − mọi dòng"', () => {
  // Fixture `real` ở trên để mọi phụ phí = 0 nên booking.price TRÙNG transportPrice,
  // hai công thức khác nhau lại cho cùng kết quả → không phân biệt được. Ca này
  // tách chúng ra: booking.price = transportPrice + phụ phí ≠ transportPrice.
  const withSurcharge: PriceBreakdown = {
    ...base,
    transportPrice: 540000,
    serviceFee: 20000,
    weekendSurcharge: 30000,
    vatAmount: 0,
    promotionDiscount: 50000,
    seatDiscountPercent: 10,
    seatDiscountAmount: 60000,
  };
  const bookingPrice = 540000 + 20000 + 30000; // = currentPrice backend lưu

  it('giá thực tế = booking.price − (loyalty + promotion), KHÔNG trừ ghế', () => {
    expect(bookingPrice - subtractableDiscountTotal(withSurcharge)).toBe(540000);
  });

  it('công thức SAI "gộp − mọi dòng giảm giá" cho kết quả khác — nên ca này bắt được', () => {
    const rowsTotal = buildDiscountRows(withSurcharge).reduce((s, d) => s + d.value, 0);
    const congThucSai = grossTransportPrice(withSurcharge) - rowsTotal; // bỏ quên phụ phí
    expect(congThucSai).toBe(490000);
    expect(congThucSai).not.toBe(bookingPrice - subtractableDiscountTotal(withSurcharge));
  });
});

describe('đủ cả ba khoản giảm cùng lúc (khách thân thiết đặt CARPOOL có mã KM)', () => {
  const all3: PriceBreakdown = {
    ...base,
    transportPrice: 540000,
    loyaltyDiscount: 15000,
    promotionDiscount: 50000,
    seatDiscountPercent: 10,
    seatDiscountAmount: 60000,
  };

  it('hiện đủ 3 dòng giảm giá', () => {
    expect(buildDiscountRows(all3).map((r) => r.value)).toEqual([15000, 50000, 60000]);
  });

  it('chỉ loyalty + promotion được trừ khỏi booking.price', () => {
    expect(subtractableDiscountTotal(all3)).toBe(65000);
    expect(540000 - subtractableDiscountTotal(all3)).toBe(475000);
  });
});
