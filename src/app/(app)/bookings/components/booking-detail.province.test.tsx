import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BookingDetail } from './booking-detail';
import { getBookingDetails, getProvinceOptions } from '@/lib/api';
import { resetProvinceOptionsCache } from '@/hooks/use-province-options';
import type { Booking } from '@/lib/types';

/**
 * Bỏ tuyến → tỉnh (10/2026): khung "Tuyến đường" của chi tiết chuyến nay là "Hành trình" với
 * cặp tỉnh đón → trả. Tên tuyến chỉ còn là dòng "Tuyến cũ" cho chuyến lịch sử.
 */

vi.mock('@/lib/api', () => ({
  getBookingDetails: vi.fn(),
  getProvinceOptions: vi.fn(),
  getCustomerCallReasons: vi.fn(async () => []),
  getBookingCustomerCallHistory: vi.fn(async () => []),
  recordBookingCustomerCall: vi.fn(),
  setBookingTestFlag: vi.fn(),
  setBookingDuplicateFlag: vi.fn(),
}));

const baseBooking = {
  id: 'b1', customerId: 'c1', pickupAddress: 'A', dropoffAddress: 'B',
  price: 100000, status: 'ACCEPTED', createdAt: new Date().toISOString(),
  customer: null,
} as unknown as Booking;

beforeEach(() => {
  vi.clearAllMocks();
  resetProvinceOptionsCache();
  vi.mocked(getProvinceOptions).mockResolvedValue([
    { code: '01', name: 'Nội đô Hà Nội' },
    { code: '31', name: 'Hải Phòng' },
  ]);
});

describe('BookingDetail — hành trình theo tỉnh', () => {
  it('hiện cặp tỉnh đón → trả có thứ tự', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({
      ...baseBooking, pickupProvinceCode: '31', dropoffProvinceCode: '01',
    } as Booking);
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    expect(await screen.findByText('Hải Phòng → Nội đô Hà Nội')).toBeInTheDocument();
    expect(screen.getByText('Hành trình')).toBeInTheDocument();
    expect(screen.queryByText('Chưa gắn tuyến')).not.toBeInTheDocument();
  });

  it('chuyến cũ chưa có mã tỉnh: nói rõ "Chưa có mã tỉnh", không crash', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking } as Booking);
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    expect(await screen.findByText('Chưa có mã tỉnh')).toBeInTheDocument();
    expect(screen.queryByTestId('province-pair')).not.toBeInTheDocument();
  });

  it('chuyến lịch sử còn tuyến: hiện kèm dòng "Tuyến cũ" nhưng cặp tỉnh vẫn là nhãn chính', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({
      ...baseBooking,
      pickupProvinceCode: '01', dropoffProvinceCode: '31',
      route: { id: 3, name: 'Hà Nội - Hải Phòng' },
    } as Booking);
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    const pair = await screen.findByTestId('province-pair');
    expect(within(pair).getByText('Nội đô Hà Nội → Hải Phòng')).toBeInTheDocument();
    expect(screen.getByText('Tuyến cũ: Hà Nội - Hải Phòng')).toBeInTheDocument();
  });

  it('chuyến cũ chỉ có tuyến (chưa backfill tỉnh): vẫn thấy tên tuyến cũ', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({
      ...baseBooking, route: { id: 3, name: 'Hà Nội - Bắc Giang' },
    } as Booking);
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    expect(await screen.findByText('Tuyến cũ: Hà Nội - Bắc Giang')).toBeInTheDocument();
    expect(screen.getByText('Chưa có mã tỉnh')).toBeInTheDocument();
  });

  it('hiển thị thời gian khách đặt và thời gian tài xế nhận (đầy đủ giờ:phút:giây ngày/tháng/năm giờ VN)', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({
      ...baseBooking,
      createdAt: '2026-10-26T07:15:30.000Z',
      acceptedAt: '2026-10-26T07:16:05.000Z',
      driver: { id: 'd1', fullName: 'Nguyễn Văn Tài', phone: '0901234567' },
    } as Booking);
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    expect((await screen.findAllByText(/14:15:30.*26\/10\/2026/)).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText(/14:16:05.*26\/10\/2026/)).length).toBeGreaterThanOrEqual(1);
  });
});
