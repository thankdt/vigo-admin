import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookingsTable } from './bookings-table';
import { getBookings } from '@/lib/api';
import type { Booking } from '@/lib/types';

/**
 * Badge "Khách lần đầu" — gắn đúng chuyến ĐẦU TIÊN khách đó từng đặt.
 *
 * Cờ do backend tính (`isFirstBooking`). Field là OPTIONAL: backend cũ chưa deploy thì
 * nó vắng mặt, và lúc đó KHÔNG được hiện badge — hiện nhầm còn tệ hơn không hiện, vì
 * CSKH sẽ chào "chào mừng lần đầu" với khách đã đi 50 chuyến.
 */

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
  id: 'b1', customerId: 'c1', pickupAddress: 'A', dropoffAddress: 'B',
  price: 100000, status: 'ACCEPTED', createdAt: '2026-08-20T03:00:00.000Z',
  customer: { fullName: 'Nguyễn Văn A', phone: '0900000001' },
} as unknown as Booking;

const listOf = (...data: Booking[]) => ({
  data, total: data.length, page: 1, limit: 20, totalPages: 1,
});

beforeEach(() => {
  vi.mocked(getBookings).mockReset();
});

const BADGE = /^chuyến đầu$/i;

describe('BookingsTable — badge "Khách lần đầu"', () => {
  it('isFirstBooking = true → hiện badge cạnh tên khách', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({ ...baseBooking, isFirstBooking: true } as Booking) as any,
    );
    render(<BookingsTable />);

    expect(await screen.findByText(BADGE)).toBeInTheDocument();
  });

  it('isFirstBooking = false → KHÔNG hiện badge', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({ ...baseBooking, isFirstBooking: false } as Booking) as any,
    );
    render(<BookingsTable />);

    await screen.findByText('Nguyễn Văn A');
    expect(screen.queryByText(BADGE)).not.toBeInTheDocument();
  });

  it('backend CŨ (field vắng mặt) → KHÔNG hiện badge', async () => {
    vi.mocked(getBookings).mockResolvedValue(listOf(baseBooking) as any);
    render(<BookingsTable />);

    await screen.findByText('Nguyễn Văn A');
    expect(screen.queryByText(BADGE)).not.toBeInTheDocument();
  });

  it('badge đứng cạnh SĐT (không cạnh tên) và không giãn hết ô', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({ ...baseBooking, isFirstBooking: true } as Booking) as any,
    );
    render(<BookingsTable />);

    const badge = await screen.findByText(BADGE);
    const phone = screen.getByText('0900000001');
    const name = screen.getByText('Nguyễn Văn A');
    // Cạnh SĐT: SĐT rộng cố định nên badge không bị tên dài đẩy chạy mỗi dòng.
    const row = badge.parentElement!;
    expect(row).toBe(phone.parentElement);
    expect(row).not.toBe(name.parentElement);
    // Hàng NGANG — `flex flex-col` không items-start sẽ kéo badge rộng bằng cả ô.
    expect(row.className).toContain('items-center');
  });
});
