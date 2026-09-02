import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingsTable } from './bookings-table';
import { getBookings } from '@/lib/api';

/**
 * Tab "Huỷ sau khi nhận" — chuyến đã có tài xế rồi mới bị huỷ.
 *
 * Là TAB ẢO (giống NEEDS_ADMIN/ADMIN_HANDLING): không có BookingStatus nào tên như vậy,
 * nó map sang `status=CANCELLED` + `cancelledState=afterAccept`. Hai thứ dễ vỡ, test này
 * khoá cả hai:
 *  1. đúng cặp param gửi lên (gửi thiếu `status` là ra TOÀN BỘ chuyến, không ai thấy sai ngay);
 *  2. 3 cột huỷ vẫn hiện — chúng bị gate bằng chuỗi CỨNG `activeTab === 'CANCELLED'` ở
 *     nhiều chỗ, nên tab mới rất dễ ra bảng nghèo hơn tab "Đã hủy" mà không báo lỗi gì.
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

const cancelledRow = {
  id: 'bk-1',
  customerId: 'c1',
  pickupAddress: 'A',
  dropoffAddress: 'B',
  price: 100000,
  status: 'CANCELLED',
  createdAt: '2026-09-01T02:00:00.000Z',
  cancelledAt: '2026-09-01T03:00:00.000Z',
  cancelledByRole: 'DRIVER',
  cancelReason: 'Tài xế báo bận',
  customer: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBookings).mockResolvedValue({
    data: [], total: 0, page: 1, limit: 20, totalPages: 1,
  } as any);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  (window.HTMLElement.prototype as any).hasPointerCapture = vi.fn();
  (window.HTMLElement.prototype as any).releasePointerCapture = vi.fn();
});

/** Lần gọi getBookings GẦN NHẤT — bảng fetch lại sau mỗi lần đổi tab (debounce 500ms). */
const lastCall = () =>
  vi.mocked(getBookings).mock.calls.at(-1)?.[0] as Record<string, unknown>;

describe('BookingsTable — tab "Huỷ sau khi nhận"', () => {
  it('gửi status=CANCELLED KÈM cancelledState=afterAccept', async () => {
    render(<BookingsTable />);
    await waitFor(() => expect(getBookings).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('tab', { name: 'Huỷ sau khi nhận' }));

    await waitFor(() => {
      expect(lastCall()).toMatchObject({ status: 'CANCELLED', cancelledState: 'afterAccept' });
    }, { timeout: 3000 });
  });

  it('tab "Đã hủy" cũ KHÔNG gửi cancelledState (hành vi cũ không đổi)', async () => {
    render(<BookingsTable />);
    await waitFor(() => expect(getBookings).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('tab', { name: 'Đã hủy' }));

    await waitFor(() => {
      expect(lastCall()).toMatchObject({ status: 'CANCELLED' });
    }, { timeout: 3000 });
    expect(lastCall().cancelledState).toBeUndefined();
  });

  it('vẫn hiện 3 cột huỷ như tab "Đã hủy" (gate cứng theo tên tab là chỗ dễ sót)', async () => {
    vi.mocked(getBookings).mockResolvedValue({
      data: [cancelledRow], total: 1, page: 1, limit: 20, totalPages: 1,
    } as any);
    render(<BookingsTable />);
    await waitFor(() => expect(getBookings).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('tab', { name: 'Huỷ sau khi nhận' }));

    const thead = () => document.querySelector('thead')!;
    await waitFor(() => {
      expect(within(thead()).getByText('Thời gian huỷ')).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(within(thead()).getByText('Người huỷ')).toBeInTheDocument();
    expect(within(thead()).getByText('Lý do huỷ')).toBeInTheDocument();
    // Và dữ liệu của 3 cột đó phải THẬT SỰ được render ra hàng, không chỉ có tiêu đề.
    expect(await screen.findByText('Tài xế báo bận')).toBeInTheDocument();
  });
});
