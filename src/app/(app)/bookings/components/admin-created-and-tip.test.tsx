import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminCreatedBadge, isBookingAdminCreated } from './booking-shared';
import { PriceBreakdownCard } from './booking-detail';
import type { Booking } from '@/lib/types';

describe('isBookingAdminCreated & AdminCreatedBadge (#14)', () => {
  it('trả true khi isAdminCreated = true', () => {
    expect(isBookingAdminCreated({ isAdminCreated: true, agentUserId: null, note: '' })).toBe(true);
  });

  it('fallback nhận diện chuyến lịch sử bắt đầu bằng [Admin] khi không có đại lý', () => {
    expect(isBookingAdminCreated({ note: '[Admin] Tạo bởi admin' })).toBe(true);
    expect(isBookingAdminCreated({ note: '  [Admin] Đón sân bay' })).toBe(true);
  });

  it('trả false cho đơn khách tự đặt, đơn có isAdminCreated=false tường minh hoặc đơn Đại lý đặt hộ', () => {
    expect(isBookingAdminCreated({ note: 'Đón cổng chính' })).toBe(false);
    expect(isBookingAdminCreated({ isAdminCreated: false, note: '[Admin] Khách tự gõ' })).toBe(false);
    expect(isBookingAdminCreated({ agentPhone: '0911111111', note: '[Đặt hộ] Khách quen' })).toBe(false);
    expect(isBookingAdminCreated({ agentUserId: 'ag-1', note: '[Admin] Ghi chú' })).toBe(false);
  });

  it('render đúng tag (Admin đặt)', () => {
    render(<AdminCreatedBadge />);
    expect(screen.getByText('(Admin đặt)')).toBeInTheDocument();
  });
});

describe('PriceBreakdownCard — hiển thị Tiền típ tài xế (#17)', () => {
  const baseBooking: Booking = {
    id: 'bk-tip-1',
    customerId: 'cust-1',
    customer: { id: 'cust-1', fullName: 'Nguyễn Văn A', phone: '0912345678' },
    status: 'SEARCHING',
    price: 200000,
    finalPrice: 216000,
    paymentMethod: 'CASH',
    createdAt: '2026-11-25T05:00:00Z',
    pickupAddress: { address: 'Hà Nội', lat: 21.02, lng: 105.85 },
    dropoffAddress: { address: 'Phú Thọ', lat: 21.32, lng: 105.4 },
    priceBreakdown: {
      transportPrice: 200000,
      sizeSurcharge: 0,
      weightSurcharge: 0,
      weekendSurcharge: 0,
      holidaySurcharge: 0,
      serviceFee: 0,
      vatAmount: 16000,
      loyaltyDiscount: 0,
      promotionDiscount: 0,
    },
  };

  it('hiện dòng Tiền típ thêm (tài xế thu) và Tổng tài xế thu khi tipAmount > 0', () => {
    render(<PriceBreakdownCard booking={{ ...baseBooking, tipAmount: 50000 }} />);
    expect(screen.getByText('Tiền típ thêm (tài xế thu)')).toBeInTheDocument();
    expect(screen.getByText('Tổng tài xế thu')).toBeInTheDocument();
    expect(screen.getByText(/\+50\.000/)).toBeInTheDocument();
    expect(screen.getByText(/266\.000/)).toBeInTheDocument();
  });

  it('ẩn khối tiền típ khi tipAmount = 0 hoặc không có', () => {
    render(<PriceBreakdownCard booking={{ ...baseBooking, tipAmount: 0 }} />);
    expect(screen.queryByText('Tiền típ thêm (tài xế thu)')).not.toBeInTheDocument();
  });

  it('với thanh toán WALLET không cộng finalPrice vào nhãn Tổng tài xế thu', () => {
    render(
      <PriceBreakdownCard
        booking={{ ...baseBooking, paymentMethod: 'WALLET', tipAmount: 50000 }}
      />,
    );
    expect(screen.queryByText('Tổng tài xế thu')).not.toBeInTheDocument();
    expect(screen.getByText('Tài xế thu tiền mặt (tiền típ)')).toBeInTheDocument();
  });
});
