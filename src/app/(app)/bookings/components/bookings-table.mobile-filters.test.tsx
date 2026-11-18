import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getBookings, updateBookingStatus } from '@/lib/api';
import { BookingsTable } from './bookings-table';

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

beforeEach(() => {
  vi.clearAllMocks();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  (window.HTMLElement.prototype as any).hasPointerCapture = vi.fn();
  (window.HTMLElement.prototype as any).releasePointerCapture = vi.fn();
});

describe('BookingsTable — bộ lọc thu gọn trên mobile', () => {
  it('mặc định thu gọn trên mobile (aria-expanded=false), bấm nút Bộ lọc thì mở và đếm đúng số bộ lọc nâng cao đang bật', async () => {
    const user = userEvent.setup();
    render(<BookingsTable />);

    const filterBtn = screen.getByRole('button', { name: /^Bộ lọc/i });
    expect(filterBtn).toHaveAttribute('aria-expanded', 'false');
    expect(filterBtn.textContent?.trim()).toBe('Bộ lọc');

    // Bấm nút mở bộ lọc nâng cao
    await user.click(filterBtn);
    expect(filterBtn).toHaveAttribute('aria-expanded', 'true');

    // Gõ ID chuyến + chọn Từ ngày -> badge đếm = 2 (ô tìm SĐT/tên chính nằm ngoài nên không tính vào bộ lọc ẩn)
    fireEvent.change(screen.getByPlaceholderText('Tìm tên/SĐT khách hoặc tài xế'), {
      target: { value: '0909' },
    });
    expect(filterBtn.textContent?.trim()).toBe('Bộ lọc');

    fireEvent.change(screen.getByPlaceholderText('Tìm ID chuyến (8 ký tự đầu OK)'), {
      target: { value: 'abcd1234' },
    });
    expect(filterBtn).toHaveTextContent('1');

    fireEvent.change(screen.getByLabelText('Từ ngày'), {
      target: { value: '2026-11-01' },
    });
    expect(filterBtn).toHaveTextContent('2');
  });

  it('trên điện thoại hẹp (< 640px) ghim cột thao tác sticky right-0 và trải phẳng mục Cập nhật trạng thái trong menu dọc không làm mở nhầm dialog chi tiết', async () => {
    const origWidth = window.innerWidth;
    const origMM = window.matchMedia;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 375 });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    vi.mocked(getBookings).mockResolvedValueOnce({
      data: [
        {
          id: 'b1111111-2222-3333-4444-555555555555',
          status: 'ACCEPTED',
          price: 350000,
          createdAt: '2026-11-16T03:00:00.000Z',
          pickupAddress: 'Nội Bài',
          dropoffAddress: 'Thái Nguyên',
          customer: { id: 'c1', fullName: 'Khách A', phone: '0912345678' },
        } as any,
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    try {
      const user = userEvent.setup();
      render(<BookingsTable />);

      const moreBtn = await screen.findByRole('button', { name: /Mở menu/i });
      expect(moreBtn.closest('td')?.className).toContain('sticky');
      expect(moreBtn.closest('td')?.className).toContain('right-0');

      await user.click(moreBtn);
      // Các trạng thái hiện ngay trong menu dọc thay vì nằm khuất trong submenu ngang
      expect(await screen.findByRole('menuitem', { name: 'Hoàn thành' })).toBeInTheDocument();
      // Không kích hoạt nhầm onClick của dòng để mở Chi tiết chuyến đi
      expect(screen.queryByText('Chi tiết chuyến đi')).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: origWidth });
      window.matchMedia = origMM;
    }
  });

  it('vuốt chạm qua nút "..." trên mobile không tự mở menu; mục Đã hủy tách đỏ và mở dialog cảnh báo huỷ rõ ràng', async () => {
    const origWidth = window.innerWidth;
    const origMM = window.matchMedia;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 375 });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    vi.mocked(getBookings).mockResolvedValueOnce({
      data: [
        {
          id: 'b1111111-2222-3333-4444-555555555555',
          status: 'SEARCHING',
          price: 350000,
          createdAt: '2026-11-16T03:00:00.000Z',
          pickupAddress: 'Nội Bài',
          dropoffAddress: 'Thái Nguyên',
          customer: { id: 'c1', fullName: 'Vũ Vân Anh', phone: '0392634576' },
        } as any,
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    try {
      const user = userEvent.setup();
      render(<BookingsTable />);

      const moreBtn = await screen.findByRole('button', { name: /Mở menu/i });

      // Bắt đầu vuốt (touch pointerDown + di chuyển) trên nút "..." -> KHÔNG mở menu
      fireEvent.pointerDown(moreBtn, { pointerType: 'touch', button: 0, clientX: 350, clientY: 200 });
      fireEvent.pointerMove(moreBtn, { pointerType: 'touch', clientX: 350, clientY: 225 });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      fireEvent.pointerCancel(moreBtn, { pointerType: 'touch' });

      // Tap thật vào "..." -> mở menu; mục Đã hủy được tách separator và tô màu text-destructive
      fireEvent.pointerDown(moreBtn, { pointerType: 'touch', button: 0, clientX: 350, clientY: 200 });
      fireEvent.pointerUp(moreBtn, { pointerType: 'touch', button: 0, clientX: 350, clientY: 200 });
      fireEvent.click(moreBtn);

      const menu = await screen.findByRole('menu');
      const cancelItem = within(menu).getByRole('menuitem', { name: 'Đã hủy' });
      expect(cancelItem.className).toContain('text-destructive');
      expect(cancelItem.previousElementSibling).toHaveAttribute('role', 'separator');

      // Vuốt nhả trên Đã hủy (không click) -> KHÔNG kích hoạt dialog huỷ
      fireEvent.pointerUp(cancelItem, { pointerType: 'touch', button: 0 });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

      // Tap thật vào Đã hủy -> mở AlertDialog cảnh báo đỏ với thông tin khách + nút Quay lại / Xác nhận huỷ chuyến
      await user.click(cancelItem);
      const alertDlg = await screen.findByRole('alertdialog');
      expect(within(alertDlg).getByText('Vũ Vân Anh')).toBeInTheDocument();
      expect(within(alertDlg).getByRole('button', { name: 'Xác nhận huỷ chuyến' }).className).toContain('bg-destructive');

      await user.click(within(alertDlg).getByRole('button', { name: 'Quay lại' }));
      expect(updateBookingStatus).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: origWidth });
      window.matchMedia = origMM;
    }
  });
});
