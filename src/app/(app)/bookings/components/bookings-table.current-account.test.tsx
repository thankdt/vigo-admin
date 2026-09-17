import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookingsTable } from './bookings-table';
import { getBookings } from '@/lib/api';
import type { Booking } from '@/lib/types';

/**
 * Dòng phụ "TK: tên · SĐT" — tài khoản đã đổi SĐT sau khi đặt, bảng vẫn hiện bản chụp
 * `senderInfo`, nên phải lộ ra tài khoản hiện tại để admin hiểu vì sao chuyến khớp ô tìm.
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

const TK_LINE = /^TK: /;

describe('BookingsTable — dòng "TK:" khi SĐT tài khoản khác bản chụp', () => {
  it('SĐT bản chụp khác SĐT tài khoản → hiện tài khoản hiện tại', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({
        ...baseBooking,
        senderInfo: { name: 'Ngọc(híp)', phone: '0375588908' },
        customer: { id: 'c1', fullName: 'Vân anh', phone: '0867283359' },
      } as Booking) as any,
    );
    render(<BookingsTable />);

    expect(await screen.findByText('Ngọc(híp)')).toBeInTheDocument();
    expect(screen.getByText('TK: Vân anh · 0867283359')).toBeInTheDocument();
  });

  it('cùng số (khác định dạng +84) → KHÔNG hiện', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({
        ...baseBooking,
        senderInfo: { name: 'Nguyễn Văn A', phone: '+84900000001' },
      } as Booking) as any,
    );
    render(<BookingsTable />);

    expect(await screen.findByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.queryByText(TK_LINE)).not.toBeInTheDocument();
  });
});
