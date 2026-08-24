import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingsTable } from './bookings-table';
import { getBookings } from '@/lib/api';
import type { Booking } from '@/lib/types';

/**
 * Cột + bộ lọc "Gọi trước HT" ở danh sách chuyến admin.
 *
 * Lai lịch: GĐ1 (CRM) gỡ CẢ HAI cột gọi khách sang /crm-queue; vận hành phản hồi là điều
 * phối vẫn cần thấy ngay trên bảng chính chuyến nào CHƯA được gọi xác nhận. Thêm lại ĐÚNG
 * pha "trước hoàn thành" — pha "sau" cố ý ở lại /crm-queue (hậu mãi, không phải điều hành).
 *
 * Cột "Ghi chú" (ô nhập `adminMemo`, lên prod cùng ngày) bị bỏ để nhường chỗ. Test dưới
 * khoá luôn việc nó KHÔNG quay lại — bỏ một cột thì rất dễ bị merge sau kéo về.
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

/**
 * Bảng có debounce 500ms trước khi gọi API — nới timeout cho máy CI chậm.
 *
 * Phải chờ đúng DÒNG DỮ LIỆU, không phải `getAllByRole('row')[1]`: lúc đang tải, dòng đó
 * là dòng spinner (một <td> colSpan). Nhận diện bằng SỐ Ô — dòng dữ liệu có nhiều <td>.
 */
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

const comboByText = (text: string) =>
  screen.getAllByRole('combobox').find((el) => el.textContent === text)!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBookings).mockResolvedValue(listOf() as any);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  (window.HTMLElement.prototype as any).hasPointerCapture = vi.fn();
  (window.HTMLElement.prototype as any).releasePointerCapture = vi.fn();
});

describe('BookingsTable — cột "Gọi trước HT"', () => {
  it('có cột "Gọi trước HT" và KHÔNG có cột "Gọi sau HT" (pha sau ở lại /crm-queue)', async () => {
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });
    const head = within(document.querySelector('thead')!);
    expect(head.getByText('Gọi trước HT')).toBeInTheDocument();
    expect(head.queryByText('Gọi sau HT')).not.toBeInTheDocument();
  });

  it('cột "Ghi chú" (ô nhập adminMemo) đã bị gỡ hẳn', async () => {
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });
    expect(within(document.querySelector('thead')!).queryByText('Ghi chú')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ghi chú nội bộ')).not.toBeInTheDocument();
  });

  it('chưa gọi → badge "Chưa gọi" (thiếu field cũng phải đọc là chưa gọi)', async () => {
    // Điều thật sự khoá: `undefined` từ backend cũ KHÔNG được rơi vào nhánh nào khác.
    const row = await renderWith();
    expect(within(row).getByText('Chưa gọi')).toBeInTheDocument();
  });

  it('đã gọi được → badge "Đã gọi" kèm mốc giờ VN (UTC+7), không phải giờ máy', async () => {
    // 03:00Z = 10:00 giờ VN. Test này đỏ nếu ai đó quay lại dùng
    // `format(new Date(...))` của date-fns (đọc theo múi giờ trình duyệt).
    const row = await renderWith({
      callBeforeStatus: 'CALLED',
      callBeforeAt: '2026-08-20T03:00:00.000Z',
    } as Partial<Booking>);
    expect(within(row).getByText('Đã gọi')).toBeInTheDocument();
    expect(within(row).getByText('20/08 10:00')).toBeInTheDocument();
  });

  it('mốc giờ rác từ API → bỏ trống, KHÔNG in "Invalid Date"', async () => {
    const row = await renderWith({
      callBeforeStatus: 'CALLED',
      callBeforeAt: 'khong-phai-ngay',
    } as Partial<Booking>);
    expect(within(row).getByText('Đã gọi')).toBeInTheDocument();
    expect(within(row).queryByText(/Invalid/i)).not.toBeInTheDocument();
  });
});

describe('BookingsTable — bộ lọc "Gọi trước HT"', () => {
  it('mặc định KHÔNG gửi param callBefore (tương thích với hành vi cũ)', async () => {
    render(<BookingsTable />);
    await waitFor(() => expect(getBookings).toHaveBeenCalled(), { timeout: 3000 });
    expect(vi.mocked(getBookings).mock.calls[0][0]).not.toHaveProperty('callBefore');
  });

  it('chọn "Chưa gọi" → gửi callBefore=uncalled và quay về trang 1', async () => {
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });

    await userEvent.click(comboByText('Gọi trước HT: tất cả'));
    await userEvent.click(await screen.findByRole('option', { name: 'Chưa gọi' }));

    await waitFor(
      () => {
        const last = vi.mocked(getBookings).mock.calls.at(-1)![0]!;
        expect(last.callBefore).toBe('uncalled');
        // Trang 1: đang ở trang 5 của tập lớn mà lọc hẹp lại thì trang 5 là bảng trắng
        // và nút phân trang khoá luôn — bế tắc im lặng.
        expect(last.page).toBe(1);
      },
      { timeout: 3000 },
    );
  });

  it('bộ lọc SỐNG SÓT qua reload (đổi tab) — không âm thầm tự tắt', async () => {
    // `reload`/effect nạp có mảng deps riêng; quên thêm state lọc vào đó thì mọi refetch
    // bắn request KHÔNG kèm bộ lọc, bảng nhảy về danh sách đầy đủ trong khi dropdown vẫn
    // hiện đang lọc. eslint exhaustive-deps không chặn được (next.config bật ignoreDuringBuilds).
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });

    await userEvent.click(comboByText('Gọi trước HT: tất cả'));
    await userEvent.click(await screen.findByRole('option', { name: 'Đã gọi được' }));
    await waitFor(
      () => expect(vi.mocked(getBookings).mock.calls.at(-1)![0]!.callBefore).toBe('called'),
      { timeout: 3000 },
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Hoàn thành' }));
    await waitFor(
      () => {
        const last = vi.mocked(getBookings).mock.calls.at(-1)![0]!;
        expect(last.status).toBe('COMPLETED');
        expect(last.callBefore).toBe('called');
      },
      { timeout: 3000 },
    );
  });
});
