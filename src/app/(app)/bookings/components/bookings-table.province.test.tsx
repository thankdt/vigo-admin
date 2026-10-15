import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingsTable } from './bookings-table';
import { getBookings, getProvinceOptions, getRoutes } from '@/lib/api';
import { resetProvinceOptionsCache } from '@/hooks/use-province-options';
import type { Booking } from '@/lib/types';

/**
 * Bỏ tuyến → tỉnh (10/2026): danh sách chuyến lọc theo TỈNH (điểm đón HOẶC trả, tham số
 * `provinceCode` của BE) và hiện cặp tỉnh đón → trả thay tên tuyến. Bộ lọc tuyến cũ chỉ còn cho
 * dữ liệu lịch sử và tự ẩn khi không có tuyến nào.
 */

vi.mock('@/lib/api', () => ({
  getBookings: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 })),
  getRoutes: vi.fn(async () => []),
  getProvinceOptions: vi.fn(async () => []),
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

const PROVINCES = [
  { code: '01', name: 'Nội đô Hà Nội' },
  { code: '31', name: 'Hải Phòng' },
];

const firstDataRow = async () =>
  await waitFor(
    () => {
      const row = screen.getAllByRole('row')[1];
      expect(row.querySelectorAll('td').length).toBeGreaterThan(1);
      return row;
    },
    { timeout: 3000 },
  );

/** Theo TEXT đang hiện (cùng lý do với các test bộ lọc khác: trigger không có accessible name ổn định). */
const comboByText = (text: string) =>
  screen.getAllByRole('combobox').find((el) => el.textContent === text)!;

beforeEach(() => {
  vi.clearAllMocks();
  resetProvinceOptionsCache();
  vi.mocked(getBookings).mockResolvedValue(listOf() as any);
  vi.mocked(getProvinceOptions).mockResolvedValue(PROVINCES as any);
  vi.mocked(getRoutes).mockResolvedValue([] as any);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  (window.HTMLElement.prototype as any).hasPointerCapture = vi.fn();
  (window.HTMLElement.prototype as any).releasePointerCapture = vi.fn();
});

describe('BookingsTable — cặp tỉnh trong bảng', () => {
  it('hiện "Nội đô Hà Nội → Hải Phòng" theo mã tỉnh gis của chuyến', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({ ...baseBooking, pickupProvinceCode: '01', dropoffProvinceCode: '31' } as Booking) as any,
    );
    render(<BookingsTable />);
    const row = await firstDataRow();
    await waitFor(() => expect(within(row).getByTestId('province-pair')).toHaveTextContent('Nội đô Hà Nội → Hải Phòng'));
  });

  it('chuyến cũ chưa có mã tỉnh: không hiện dòng cặp tỉnh, bảng vẫn render', async () => {
    vi.mocked(getBookings).mockResolvedValue(listOf(baseBooking) as any);
    render(<BookingsTable />);
    const row = await firstDataRow();
    expect(within(row).queryByTestId('province-pair')).not.toBeInTheDocument();
  });

  it('danh sách tỉnh tải lỗi: "01" vẫn có nhãn, mã khác rơi về "Mã tỉnh <mã>" — không vỡ trang', async () => {
    vi.mocked(getProvinceOptions).mockRejectedValue(new Error('boom'));
    vi.mocked(getBookings).mockResolvedValue(
      listOf({ ...baseBooking, pickupProvinceCode: '01', dropoffProvinceCode: '31' } as Booking) as any,
    );
    render(<BookingsTable />);
    const row = await firstDataRow();
    expect(within(row).getByTestId('province-pair')).toHaveTextContent('Nội đô Hà Nội → Mã tỉnh 31');
  });
});

describe('BookingsTable — bộ lọc tỉnh', () => {
  it('mặc định KHÔNG gửi provinceCode lẫn routeId (an toàn khi BE chưa deploy)', async () => {
    render(<BookingsTable />);
    await waitFor(() => expect(getBookings).toHaveBeenCalled(), { timeout: 3000 });
    const first = vi.mocked(getBookings).mock.calls[0][0]!;
    expect(first).not.toHaveProperty('provinceCode');
    expect(first).not.toHaveProperty('routeId');
  });

  it('chọn "Nội đô Hà Nội" → gửi provinceCode=01 và về trang 1', async () => {
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });

    await userEvent.click(comboByText('Tất cả tỉnh'));
    await userEvent.click(await screen.findByText('Nội đô Hà Nội'));

    await waitFor(
      () => {
        const last = vi.mocked(getBookings).mock.calls.at(-1)![0]!;
        expect(last.provinceCode).toBe('01');
        expect(last.page).toBe(1);
      },
      { timeout: 3000 },
    );
  });

  it('"Thiếu mã tỉnh" gửi sentinel provinceCode=none', async () => {
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });

    await userEvent.click(comboByText('Tất cả tỉnh'));
    await userEvent.click(await screen.findByText('Thiếu mã tỉnh'));

    await waitFor(
      () => expect(vi.mocked(getBookings).mock.calls.at(-1)![0]!.provinceCode).toBe('none'),
      { timeout: 3000 },
    );
  });
});

describe('BookingsTable — bộ lọc tuyến cũ (lịch sử)', () => {
  it('không còn tuyến nào → bộ lọc tuyến cũ ẩn hẳn', async () => {
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });
    expect(screen.getAllByRole('combobox').some((el) => /tuyến cũ/i.test(el.textContent ?? ''))).toBe(false);
  });

  it('còn dữ liệu tuyến → hiện bộ lọc nhãn "tuyến cũ", chọn thì gửi routeId SỐ', async () => {
    vi.mocked(getRoutes).mockResolvedValue([{ id: 7, name: 'Hà Nội - Hải Dương', districts: [] }] as any);
    render(<BookingsTable />);
    await waitFor(() => screen.getByText('Không tìm thấy chuyến nào.'), { timeout: 3000 });

    await userEvent.click(await waitFor(() => { const el = comboByText('Tất cả tuyến cũ'); expect(el).toBeDefined(); return el; }));
    await userEvent.click(await screen.findByText('Hà Nội - Hải Dương'));

    await waitFor(
      () => expect(vi.mocked(getBookings).mock.calls.at(-1)![0]!.routeId).toBe(7),
      { timeout: 3000 },
    );
  });
});
