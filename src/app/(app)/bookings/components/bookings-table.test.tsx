import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriceBreakdownCard, BookingDetail } from './booking-detail';
import { getBookingDetails } from '@/lib/api';
import type { Booking, PriceBreakdown } from '@/lib/types';

// Mock phải khai MỌI export mà component import, kể cả thứ không dùng trong
// test này — vitest ném "No X export is defined on the mock" ngay lúc nạp
// module, trước cả khi render. `getCustomerCallReasons` đến từ tính năng giám
// sát CSKH; thiếu nó làm đỏ cả 2 test badge vốn không liên quan gì.
vi.mock('@/lib/api', () => ({
  getBookingDetails: vi.fn(),
  getCustomerCallReasons: vi.fn(async () => []),
}));

const breakdown: PriceBreakdown = {
  transportPrice: 100000, sizeSurcharge: 0, weightSurcharge: 0,
  weekendSurcharge: 0, holidaySurcharge: 0, serviceFee: 0, vatAmount: 0,
  loyaltyDiscount: 0, promotionDiscount: 0,
};

const baseBooking: Booking = {
  id: 'b1', customerId: 'c1', pickupAddress: 'A', dropoffAddress: 'B',
  price: 100000, status: 'COMPLETED', createdAt: new Date().toISOString(),
  customer: null,
} as Booking;

describe('PriceBreakdownCard — giảm giá theo ghế (CARPOOL)', () => {
  it('không hiện dòng giảm giá theo ghế khi seatDiscountAmount = 0/thiếu', () => {
    render(<PriceBreakdownCard booking={{ ...baseBooking, priceBreakdown: breakdown }} />);
    expect(screen.queryByText(/Giảm giá theo số ghế/)).not.toBeInTheDocument();
  });

  it('hiện dòng giảm giá theo ghế kèm % khi có seatDiscountAmount > 0', () => {
    render(
      <PriceBreakdownCard
        booking={{ ...baseBooking, priceBreakdown: { ...breakdown, seatDiscountAmount: 15000, seatDiscountPercent: 10 } }}
      />,
    );
    expect(screen.getByText('Giảm giá theo số ghế (đi chung, -10%)')).toBeInTheDocument();
  });

  it('vẫn hiện 2 dòng giảm giá cũ khi có (regression)', () => {
    render(
      <PriceBreakdownCard
        booking={{ ...baseBooking, priceBreakdown: { ...breakdown, loyaltyDiscount: 5000, promotionDiscount: 20000 } }}
      />,
    );
    expect(screen.getByText('Khách thân thiết')).toBeInTheDocument();
    expect(screen.getByText('Mã khuyến mãi')).toBeInTheDocument();
  });
});

describe('PriceBreakdownCard — CỘT GIÁ PHẢI CỘNG RA ĐƯỢC (chuyến thật abd6f444)', () => {
  // Số lấy nguyên từ prod: CARPOOL 2 ghế, HN → Tuyên Quang, 123.3km.
  // Ghế đã được backend trừ sẵn vào transportPrice (600.000 → 540.000).
  const real: PriceBreakdown = {
    ...breakdown,
    transportPrice: 540000,
    vatAmount: 39200,
    promotionDiscount: 50000,
    priceBeforeDiscount: 583200,
    seatDiscountPercent: 10,
    seatDiscountAmount: 60000,
  };
  const realBooking = {
    ...baseBooking,
    price: 540000,
    finalPrice: 529200,
    priceBreakdown: real,
  } as Booking;

  // Vì sao phải RENDER thay vì gọi hàm thuần: price-breakdown-utils.test.ts đã
  // khoá `grossTransportPrice` / `subtractableDiscountTotal` rồi, nhưng hàm đúng
  // mà component KHÔNG GỌI thì suite vẫn xanh. Bug trừ-hai-lần nằm ở đúng chỗ
  // nối đó, nên phải assert con số hiện trên màn hình.
  //
  // Dùng regex thay vì so chuỗi đủ: Intl.NumberFormat('vi-VN') chèn NBSP (U+00A0)
  // trước ₫. testing-library có normalize khoảng trắng nên chuỗi thường vẫn khớp,
  // nhưng regex thì không phụ thuộc vào chi tiết đó.
  it('dòng đầu là giá GỘP trước giảm ghế (600.000), không phải transportPrice (540.000)', () => {
    render(<PriceBreakdownCard booking={realBooking} />);
    expect(screen.getByText(/^600\.000/)).toBeInTheDocument();
  });

  it('"Giá thực tế" = 490.000 — KHÔNG trừ giảm ghế lần hai (bug cũ ra 430.000)', () => {
    render(<PriceBreakdownCard booking={realBooking} />);
    expect(screen.getByText(/^490\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/^430\.000/)).not.toBeInTheDocument();
  });

  it('cả cột khớp: gộp − ghế − KM + VAT = khách trả', () => {
    render(<PriceBreakdownCard booking={realBooking} />);
    // 600.000 − 60.000 − 50.000 = 490.000; + 39.200 = 529.200
    // Dòng giảm giá render kèm '-', dòng VAT kèm '+' (xem bookings-table.tsx),
    // nên neo '^' phải tính cả dấu.
    for (const n of [
      /^600\.000/,      // Giá vận chuyển (gộp)
      /^-60\.000/,      // Giảm theo số ghế
      /^-50\.000/,      // Mã khuyến mãi
      /^490\.000/,      // Giá thực tế
      /^\+39\.200/,     // VAT
      /^529\.200/,      // Khách trả
    ]) {
      expect(screen.getByText(n)).toBeInTheDocument();
    }
  });
});

describe('BookingDetail — badge "Đã tự chuyển sang Bao xe" (switchedToWholeCar)', () => {
  it('hiện badge khi switchedToWholeCar = true', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking, switchedToWholeCar: true });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    expect(await screen.findByText(/Đã tự chuyển sang Bao xe/)).toBeInTheDocument();
  });

  it('không hiện badge khi switchedToWholeCar false/thiếu (regression)', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    // "Khách hàng" card chỉ render sau khi `booking` state có giá trị (fetch
    // đã resolve) — chờ nó trước khi assert absence, tránh false-negative do
    // assert lúc còn đang loading (booking === null → cả 2 badge cùng không
    // hiện, không chứng minh được gì).
    await screen.findByText('Khách hàng');
    expect(screen.queryByText(/Đã tự chuyển sang Bao xe/)).not.toBeInTheDocument();
  });
});
