import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { BookingsTable } from './bookings-table';
import { getBookings } from '@/lib/api';
import type { Booking } from '@/lib/types';

// Mock phải khai MỌI export mà CẢ CÂY module của bookings-table import (bảng +
// BookingDetail + VoidBookingDialog + CreateBookingDialog + AddressAutocomplete),
// không chỉ thứ test này dùng — vitest ném "No X export is defined on the mock"
// ngay lúc nạp module, trước cả khi render.
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

const baseBooking: Booking = {
  id: 'b1', customerId: 'c1', pickupAddress: 'A', dropoffAddress: 'B',
  price: 100000, status: 'PENDING', createdAt: '2026-08-20T03:00:00.000Z',
  customer: null,
} as unknown as Booking;

const listOf = (...rows: Booking[]) => ({
  data: rows, total: rows.length, page: 1, limit: 20, totalPages: 1,
});

// Danh sách có debounce 500ms trước khi gọi API — chờ mặc định 1000ms là sát mép
// trên máy CI chậm, nên nới hẳn ra (giống user-table.test.tsx).
const findRow = async (testId: string) =>
  await waitFor(() => screen.getByText(testId).closest('tr')!, { timeout: 3000 });

beforeEach(() => vi.clearAllMocks());

describe('BookingsTable — cột "Ghi chú" (ghi chú NỘI BỘ, adminNote)', () => {
  it('hiện adminNote của chuyến trong cột Ghi chú', async () => {
    vi.mocked(getBookings).mockResolvedValue(
      listOf({ ...baseBooking, adminNote: '[Admin: khách xin đổi giờ đón]' } as Booking),
    );
    render(<BookingsTable />);

    const row = await findRow('Điểm đón:');
    // Ô thứ 7 (index 6) = Ghi chú: Khách hàng, Tài xế, Tuyến đường, Giá, Ngày tạo,
    // Trạng thái, Ghi chú, Thao tác. Assert theo VỊ TRÍ chứ không phải getByText để
    // khoá luôn chỗ đứng của cột — đổi thứ tự là test đỏ.
    const cells = within(row).getAllByRole('cell');
    expect(cells[6]).toHaveTextContent('[Admin: khách xin đổi giờ đón]');
  });

  it('chuyến KHÔNG có ghi chú nội bộ → ô hiện "—", không phải ô trắng', async () => {
    // Chuyến cũ từ backend chưa có cột adminNote về `undefined`, không phải null —
    // cả hai phải ra cùng một dấu gạch.
    vi.mocked(getBookings).mockResolvedValue(listOf({ ...baseBooking } as Booking));
    render(<BookingsTable />);

    const row = await findRow('Điểm đón:');
    const cells = within(row).getAllByRole('cell');
    expect(cells[6]).toHaveTextContent('—');
  });

  it('KHÔNG hiện ghi chú của KHÁCH (note) — cột này là ghi chú nội bộ', async () => {
    // Hai cột note tách nhau có chủ đích: `note` đi ra app tài xế, `adminNote` thì không.
    // Trộn hai cái vào một ô là đúng kiểu lỗi mà việc tách cột ở backend muốn chặn.
    vi.mocked(getBookings).mockResolvedValue(
      listOf({ ...baseBooking, note: 'Khách VIP, có trẻ nhỏ' } as Booking),
    );
    render(<BookingsTable />);

    const row = await findRow('Điểm đón:');
    const cells = within(row).getAllByRole('cell');
    expect(cells[6]).toHaveTextContent('—');
    expect(within(row).queryByText(/Khách VIP/)).not.toBeInTheDocument();
  });

  it('colSpan của dòng rỗng KHỚP số cột header (khoá lỗi đếm tay)', async () => {
    // Lỗi này không có gì bắt được ngoài việc đếm: commit gỡ 2 cột gọi khách phải
    // ĐẾM TAY 9 → 7. Lệch colSpan không ném lỗi, chỉ làm dòng "Không có chuyến"
    // co lại lệch bảng — im lặng tuyệt đối.
    vi.mocked(getBookings).mockResolvedValue(listOf());
    render(<BookingsTable />);

    const emptyCell = await waitFor(
      () => screen.getByText(/Không tìm thấy|Không có/i).closest('td')!,
      { timeout: 3000 },
    );
    const headerCount = document.querySelectorAll('thead th').length;
    expect(Number(emptyCell.getAttribute('colspan'))).toBe(headerCount);
    // Tab mặc định (ALL, loại chuyến "tất cả"): 7 cột cũ + Ghi chú.
    expect(headerCount).toBe(8);
  });
});
