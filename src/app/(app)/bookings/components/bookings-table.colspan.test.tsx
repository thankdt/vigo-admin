import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingsTable } from './bookings-table';
import { getBookings } from '@/lib/api';

/**
 * `colSpan` của các dòng đặc biệt (đang tải / lỗi / "Không tìm thấy chuyến nào") được
 * TÍNH TAY bằng một công thức, trong khi số cột thật do JSX quyết định. Hai thứ này trôi
 * dạt khỏi nhau mỗi lần thêm/bớt cột, và lệch thì KHÔNG ném lỗi — chỉ làm dòng thông báo
 * co ngắn hơn bảng, trông như lỗi CSS.
 *
 * Lịch sử của đúng con số này: 9 → 7 (GĐ1 gỡ 2 cột gọi khách sang /crm-queue) → 8 (thêm
 * cột "Ghi chú") → 8 (bỏ "Ghi chú", thêm lại "Gọi trước HT"). Lần cuối số KHÔNG đổi dù
 * thành phần đổi — đúng loại thay đổi mà đọc diff sẽ tin là "không cần đếm lại".
 *
 * Vì thế test so colSpan với SỐ <th> ĐẾM ĐƯỢC, không so với một hằng số chép tay.
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBookings).mockResolvedValue({
    data: [], total: 0, page: 1, limit: 20, totalPages: 1,
  } as any);
  // jsdom không có Pointer Events / scrollIntoView; Radix Select gọi chúng khi mở.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  (window.HTMLElement.prototype as any).hasPointerCapture = vi.fn();
  (window.HTMLElement.prototype as any).releasePointerCapture = vi.fn();
});

/** Dòng "Không tìm thấy chuyến nào." chỉ hiện sau debounce 500ms + request rỗng. */
async function emptyRowCell() {
  return await waitFor(
    () => screen.getByText('Không tìm thấy chuyến nào.').closest('td')!,
    { timeout: 3000 },
  );
}

/**
 * Radix SelectTrigger là <button role="combobox"> KHÔNG có accessible name (nhãn nằm ở
 * placeholder, mà placeholder biến mất ngay khi có giá trị chọn). Nên tìm theo TEXT đang
 * hiện, đừng tìm theo `name` — `getByRole('combobox', { name })` không khớp gì cả.
 */
const comboByText = (text: string) =>
  screen.getAllByRole('combobox').find((el) => el.textContent === text)!;

const headerCount = () =>
  within(document.querySelector('thead')!).getAllByRole('columnheader').length;

const expectColSpanMatchesHeaders = async () => {
  const cell = await emptyRowCell();
  expect(Number(cell.getAttribute('colspan'))).toBe(headerCount());
};

describe('BookingsTable — colSpan khớp số cột THẬT', () => {
  it('tab Tất cả (bố cục nền)', async () => {
    render(<BookingsTable />);
    await expectColSpanMatchesHeaders();
  });

  it('tab Hoàn thành (+1 cột Ngày hoàn thành)', async () => {
    render(<BookingsTable />);
    await emptyRowCell();
    await userEvent.click(screen.getByRole('tab', { name: 'Hoàn thành' }));
    await expectColSpanMatchesHeaders();
  });

  it('tab Đã hủy (+3 cột huỷ)', async () => {
    render(<BookingsTable />);
    await emptyRowCell();
    await userEvent.click(screen.getByRole('tab', { name: 'Đã hủy' }));
    await expectColSpanMatchesHeaders();
  });

  it('loại chuyến Đặt lịch (+1 cột Giờ hẹn đón)', async () => {
    render(<BookingsTable />);
    await emptyRowCell();
    await userEvent.click(comboByText('Tất cả loại'));
    await userEvent.click(await screen.findByRole('option', { name: 'Đặt lịch' }));
    await expectColSpanMatchesHeaders();
  });

  it('tab Huỷ sau khi nhận (+3 cột huỷ như tab Đã hủy)', async () => {
    // Tab huỷ THỨ HAI: 3 cột kia bị gate theo tên tab, nên đây là chỗ lệch colSpan
    // dễ xảy ra nhất khi thêm tab.
    render(<BookingsTable />);
    await emptyRowCell();
    await userEvent.click(screen.getByRole('tab', { name: 'Huỷ sau khi nhận' }));
    await expectColSpanMatchesHeaders();
  });

  it('Đặt lịch + tab Đã hủy (hai phần cộng dồn — ca dễ sót nhất)', async () => {
    render(<BookingsTable />);
    await emptyRowCell();
    await userEvent.click(comboByText('Tất cả loại'));
    await userEvent.click(await screen.findByRole('option', { name: 'Đặt lịch' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Đã hủy' }));
    await expectColSpanMatchesHeaders();
  });
});
