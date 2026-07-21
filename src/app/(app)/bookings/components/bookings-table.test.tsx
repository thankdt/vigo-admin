import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriceBreakdownCard, BookingDetail } from './bookings-table';
import { getBookingDetails } from '@/lib/api';
import type { Booking, PriceBreakdown } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  getBookingDetails: vi.fn(),
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
