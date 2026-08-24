import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingsTable } from './bookings-table';
import { getBookings } from '@/lib/api';
import type { Booking } from '@/lib/types';

/**
 * Badge + bộ lọc "chuyến trùng" ở danh sách chuyến admin.
 *
 * Cờ này là NHÃN VẬN HÀNH: chuyến trùng VẪN tính doanh thu, VẪN nằm trong hàng đợi CSKH.
 * Nó chỉ nói "khách đặt lặp, khỏi gọi lại". Đừng đọc nó theo nghĩa của chuyến TEST.
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
  customer: null,
} as unknown as Booking;

const listOf = (...rows: Booking[]) => ({
  data: rows, total: rows.length, page: 1, limit: 20, totalPages: 1,
});

/** Chờ đúng DÒNG DỮ LIỆU: lúc đang tải, hàng đầu là dòng spinner (một <td> colSpan). */
const renderWith = async (patch?: Partial<Booking>) => {
  vi.mocked(getBookings).mockResolvedValue(
    listOf({ ...baseBooking, ...patch } as Booking) as any,
  );
  render(<BookingsTable />);
  return await waitFor(
    () => {
      const row = screen.getAllByRole('row')[1];
      expect(row.querySelectorAll('td').length).toBeGreaterThan(1);
      return row;
    },
    { timeout: 3000 },
  );
};

/** Radix SelectTrigger không có accessible name — tìm theo TEXT đang hiện. */
const comboByText = (text: string) =>
  screen.getAllByRole('combobox').find((el) => el.textContent === text)!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBookings).mockResolvedValue(listOf() as any);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  (window.HTMLElement.prototype as any).hasPointerCapture = vi.fn();
  (window.HTMLElement.prototype as any).releasePointerCapture = vi.fn();
});

describe('BookingsTable — badge chuyến trùng', () => {
  it('hiện badge TRÙNG ở cột Trạng thái khi isDuplicateTrip = true', async () => {
    const row = await renderWith({ isDuplicateTrip: true } as Partial<Booking>);
    expect(within(row).getByText(/TRÙNG/)).toBeInTheDocument();
  });

  it('KHÔNG hiện badge khi field thiếu (backend chưa deploy cột)', async () => {
    // `undefined` phải cùng nghĩa `false`, nếu không MỌI chuyến cũ đeo badge TRÙNG.
    const row = await renderWith();
    expect(within(row).queryByText(/TRÙNG/)).not.toBeInTheDocument();
  });

  it('hai cờ độc lập: một chuyến vừa TEST vừa TRÙNG hiện cả hai badge', async () => {
    const row = await renderWith({ isTestTrip: true, isDuplicateTrip: true } as Partial<Booking>);
    expect(within(row).getByText(/TEST/)).toBeInTheDocument();
    expect(within(row).getByText(/TRÙNG/)).toBeInTheDocument();
  });
});

describe('BookingsTable — bộ lọc chuyến trùng', () => {
  it('mặc định KHÔNG gửi param duplicateFilter (an toàn khi BE chưa deploy)', async () => {
    render(<BookingsTable />);
    await waitFor(() => expect(getBookings).toHaveBeenCalled(), { timeout: 3000 });
    expect(vi.mocked(getBookings).mock.calls[0][0]).not.toHaveProperty('duplicateFilter');
  });

  it('chọn "Ẩn chuyến trùng" → gửi duplicateFilter=exclude và về trang 1', async () => {
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });

    await userEvent.click(comboByText('Chuyến trùng: tất cả'));
    await userEvent.click(await screen.findByRole('option', { name: 'Ẩn chuyến trùng' }));

    await waitFor(
      () => {
        const last = vi.mocked(getBookings).mock.calls.at(-1)![0]!;
        expect(last.duplicateFilter).toBe('exclude');
        expect(last.page).toBe(1);
      },
      { timeout: 3000 },
    );
  });

  it('chọn "Chỉ chuyến trùng" → gửi duplicateFilter=only', async () => {
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });

    await userEvent.click(comboByText('Chuyến trùng: tất cả'));
    await userEvent.click(await screen.findByRole('option', { name: 'Chỉ chuyến trùng' }));

    await waitFor(
      () => expect(vi.mocked(getBookings).mock.calls.at(-1)![0]!.duplicateFilter).toBe('only'),
      { timeout: 3000 },
    );
  });

  it('bộ lọc SỐNG SÓT qua reload (đổi tab) — không âm thầm tự tắt', async () => {
    // `reload`/effect nạp có mảng deps riêng; quên thêm state lọc vào đó thì mọi refetch
    // bắn request KHÔNG kèm bộ lọc, bảng nhảy về danh sách đầy đủ trong khi dropdown vẫn
    // hiện đang lọc. eslint exhaustive-deps không chặn (next.config bật ignoreDuringBuilds).
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });

    await userEvent.click(comboByText('Chuyến trùng: tất cả'));
    await userEvent.click(await screen.findByRole('option', { name: 'Chỉ chuyến trùng' }));
    await waitFor(
      () => expect(vi.mocked(getBookings).mock.calls.at(-1)![0]!.duplicateFilter).toBe('only'),
      { timeout: 3000 },
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Đã hủy' }));
    await waitFor(
      () => {
        const last = vi.mocked(getBookings).mock.calls.at(-1)![0]!;
        expect(last.status).toBe('CANCELLED');
        expect(last.duplicateFilter).toBe('only');
      },
      { timeout: 3000 },
    );
  });

  it('lọc chuyến trùng KHÔNG động tới bộ lọc chuyến test (hai cờ riêng biệt)', async () => {
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });

    await userEvent.click(comboByText('Chuyến test: tất cả'));
    await userEvent.click(await screen.findByRole('option', { name: 'Chỉ chuyến thật' }));
    await userEvent.click(comboByText('Chuyến trùng: tất cả'));
    await userEvent.click(await screen.findByRole('option', { name: 'Chỉ chuyến trùng' }));

    await waitFor(
      () => {
        const last = vi.mocked(getBookings).mock.calls.at(-1)![0]!;
        expect(last.testFilter).toBe('exclude');
        expect(last.duplicateFilter).toBe('only');
      },
      { timeout: 3000 },
    );
  });
});
