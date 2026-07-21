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

describe('PriceBreakdownCard — chi tiết chuyến KHÔNG nêu giảm theo ghế', () => {
  // Chuyến đã tạo: giá là giá CHỐT + loại dịch vụ đã chốt → không nêu lý do đổi
  // hay số đã giảm theo ghế (đó là info lúc BÁO GIÁ, xem app khách).
  it('không hiện dòng giảm giá theo ghế dù seatDiscountAmount > 0', () => {
    render(
      <PriceBreakdownCard
        booking={{ ...baseBooking, priceBreakdown: { ...breakdown, seatDiscountAmount: 15000, seatDiscountPercent: 10 } }}
      />,
    );
    expect(screen.queryByText(/Giảm giá theo số ghế/)).not.toBeInTheDocument();
  });

  it('vẫn hiện 2 dòng giảm giá cũ (loyalty/promotion) khi có — regression', () => {
    render(
      <PriceBreakdownCard
        booking={{ ...baseBooking, priceBreakdown: { ...breakdown, loyaltyDiscount: 5000, promotionDiscount: 20000 } }}
      />,
    );
    expect(screen.getByText('Khách thân thiết')).toBeInTheDocument();
    expect(screen.getByText('Mã khuyến mãi')).toBeInTheDocument();
  });
});

describe('BookingDetail — KHÔNG hiện badge auto-switch ở chi tiết chuyến', () => {
  it('không hiện badge "Đã tự chuyển sang Bao xe" dù switchedToWholeCar = true', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking, switchedToWholeCar: true });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    // Chờ card "Khách hàng" render (fetch resolve) trước khi assert absence.
    await screen.findByText('Khách hàng');
    expect(screen.queryByText(/Đã tự chuyển sang Bao xe/)).not.toBeInTheDocument();
  });
});
