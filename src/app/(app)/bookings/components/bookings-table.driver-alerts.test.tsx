import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookingsTable } from './bookings-table';
import { getBookings } from '@/lib/api';
import type { Booking } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  getBookings: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 })),
  getRoutes: vi.fn(async () => []),
  updateBookingStatus: vi.fn(),
  getAvailableDrivers: vi.fn(async () => []),
  reassignBooking: vi.fn(),
  claimProcessingBooking: vi.fn(),
  getBookingDetails: vi.fn(),
  getCustomerCallReasons: vi.fn(async () => []),
  getBookingCustomerCallHistory: vi.fn(async () => []),
  recordBookingCustomerCall: vi.fn(),
  setBookingTestFlag: vi.fn(),
  setBookingDuplicateFlag: vi.fn(),
  voidCompletedBooking: vi.fn(),
  createAdminBooking: vi.fn(),
  createAgentBooking: vi.fn(),
  lookupCustomerByPhone: vi.fn(),
  estimateTripPrice: vi.fn(),
  getVouchers: vi.fn(async () => []),
  searchAddress: vi.fn(async () => []),
  getPlaceDetail: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const baseBooking = {
  id: 'b1',
  customerId: 'c1',
  pickupAddress: 'A',
  dropoffAddress: 'B',
  price: 100000,
  status: 'ACCEPTED',
  createdAt: '2026-08-20T03:00:00.000Z',
  customer: { fullName: 'Nguyễn Văn A', phone: '0900000001' },
  driver: {
    id: 'd1',
    user: { fullName: 'Tài xế Nguyễn B', phone: '0912345678' },
  },
} as unknown as Booking;

const listOf = (...data: Booking[]) => ({
  data,
  total: data.length,
  page: 1,
  limit: 20,
  totalPages: 1,
});

beforeEach(() => {
  vi.mocked(getBookings).mockReset();
});

describe('BookingsTable — badge cảnh báo và số sao của tài xế', () => {
  it('hiện badge "Tài mới" khi isNew = true kèm tooltip số chuyến hoàn thành', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({
        ...baseBooking,
        driver: {
          ...baseBooking.driver!,
          isNew: true,
          completedTrips: 1,
        },
      } as Booking) as any,
    );
    render(<BookingsTable />);

    const badge = await screen.findByText(/^tài mới$/i);
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('title')).toContain('1 chuyến');
  });

  it('hiện badge "Hay huỷ" khi isHighCancel = true', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({
        ...baseBooking,
        driver: {
          ...baseBooking.driver!,
          isHighCancel: true,
        },
      } as Booking) as any,
    );
    render(<BookingsTable />);

    expect(await screen.findByText(/^hay huỷ$/i)).toBeInTheDocument();
  });

  it('hiện badge "Hay trễ giờ" khi isFrequentlyLate = true', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({
        ...baseBooking,
        driver: {
          ...baseBooking.driver!,
          isFrequentlyLate: true,
        },
      } as Booking) as any,
    );
    render(<BookingsTable />);

    expect(await screen.findByText(/^hay trễ giờ$/i)).toBeInTheDocument();
  });

  it('hiện badge "Có vi phạm" khi hasViolation = true', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({
        ...baseBooking,
        driver: {
          ...baseBooking.driver!,
          hasViolation: true,
        },
      } as Booking) as any,
    );
    render(<BookingsTable />);

    expect(await screen.findByText(/^có vi phạm$/i)).toBeInTheDocument();
  });

  it('hiện sao đánh giá displayStars cạnh SĐT tài xế (màu đỏ khi < 4.0)', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf(
        {
          ...baseBooking,
          id: 'b1',
          driver: {
            ...baseBooking.driver!,
            id: 'd1',
            displayStars: 3.5,
          },
        } as Booking,
        {
          ...baseBooking,
          id: 'b2',
          driver: {
            ...baseBooking.driver!,
            id: 'd2',
            displayStars: 4.8,
          },
        } as Booking,
      ) as any,
    );
    render(<BookingsTable />);

    const lowStar = await screen.findByText('3.5');
    const goodStar = await screen.findByText('4.8');

    expect(lowStar).toBeInTheDocument();
    expect(goodStar).toBeInTheDocument();
    expect(lowStar.className).toContain('text-red-600');
    expect(goodStar.className).toContain('text-amber-600');
  });

  it('backend cũ (các cờ vắng mặt) → KHÔNG hiện bất kỳ badge hay sao nào', async () => {
    vi.mocked(getBookings).mockResolvedValue(listOf(baseBooking) as any);
    render(<BookingsTable />);

    await screen.findByText('Tài xế Nguyễn B');
    expect(screen.queryByText(/^tài mới$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^hay huỷ$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^hay trễ giờ$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^có vi phạm$/i)).not.toBeInTheDocument();
  });

  it('badge và số sao đứng cạnh SĐT tài xế trong hàng ngang', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({
        ...baseBooking,
        driver: {
          ...baseBooking.driver!,
          isNew: true,
          displayStars: 4.9,
        },
      } as Booking) as any,
    );
    render(<BookingsTable />);

    const badge = await screen.findByText(/^tài mới$/i);
    const star = screen.getByText('4.9');
    const phone = screen.getByText('0912345678');

    // Cùng container hàng ngang với SĐT tài xế
    expect(badge.closest('.flex.items-center')).toBe(phone.closest('.flex.items-center'));
    expect(star.closest('.flex.items-center')).toBe(phone.closest('.flex.items-center'));
  });
});
