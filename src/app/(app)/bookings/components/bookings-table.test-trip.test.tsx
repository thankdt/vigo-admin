import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// GĐ1 (CRM) đã tách BookingDetail + PriceBreakdownCard ra file riêng để /crm-queue dùng lại
// mà không kéo nguyên module bookings-table (~1900 dòng) vào bundle. Import cũ
// './bookings-table' chỉ còn re-export gián tiếp, nên trỏ thẳng vào file mới.
import { BookingDetail } from './booking-detail';
import { getBookingDetails, setBookingTestFlag } from '@/lib/api';
import type { Booking } from '@/lib/types';

// Mock phải khai MỌI export mà bookings-table import — vitest ném ngay lúc nạp
// module khi test chạm tới một export chưa khai.
vi.mock('@/lib/api', () => ({
  getBookingDetails: vi.fn(),
  getCustomerCallReasons: vi.fn(async () => []),
  getBookingCustomerCallHistory: vi.fn(async () => []),
  recordBookingCustomerCall: vi.fn(),
  setBookingTestFlag: vi.fn(),
  setBookingDuplicateFlag: vi.fn(),
}));

const baseBooking: Booking = {
  id: 'b1', customerId: 'c1', pickupAddress: 'A', dropoffAddress: 'B',
  price: 100000, status: 'ACCEPTED', createdAt: new Date().toISOString(),
  customer: null,
} as Booking;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setBookingTestFlag).mockResolvedValue({ id: 'b1', isTestTrip: true });
});

describe('BookingDetail — badge chuyến test', () => {
  it('hiện badge TEST khi isTestTrip = true', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking, isTestTrip: true });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    expect(await screen.findByText(/TEST/)).toBeInTheDocument();
  });

  it('KHÔNG hiện badge khi field thiếu (booking từ backend cũ)', async () => {
    // Điều thật sự được khoá: `undefined` phải cùng nghĩa với `false`. Nếu ai đó
    // viết `isTestTrip !== false` thì MỌI chuyến cũ sẽ đeo badge TEST.
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    await screen.findByText('Khách hàng');
    expect(screen.queryByText(/🧪 TEST/)).not.toBeInTheDocument();
  });
});

describe('BookingDetail — công tắc chuyến test', () => {
  it('công tắc phản ánh đúng trạng thái, kể cả khi field thiếu', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    const toggle = await screen.findByRole('switch', { name: /chuyến test/i });
    // `checked={undefined}` sẽ làm Radix chuyển sang uncontrolled — công tắc kẹt.
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
  });

  it('chuyến CHƯA hoàn thành: gạt là gọi API luôn, không hỏi gì', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking, status: 'ACCEPTED' });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    await userEvent.click(await screen.findByRole('switch', { name: /chuyến test/i }));

    await waitFor(() => expect(setBookingTestFlag).toHaveBeenCalledWith('b1', true));
  });

  it('báo cho danh sách ngoài refetch sau khi gạt', async () => {
    // Dialog có state riêng: thiếu callback này thì badge ở hàng ngoài bảng đứng
    // im tới khi F5 — bug im lặng, không lỗi, không log.
    const onTestFlagChanged = vi.fn();
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking, status: 'ACCEPTED' });
    render(<BookingDetail bookingId="b1" onClose={() => {}} onTestFlagChanged={onTestFlagChanged} />);

    await userEvent.click(await screen.findByRole('switch', { name: /chuyến test/i }));

    await waitFor(() => expect(onTestFlagChanged).toHaveBeenCalled());
  });

  it('chuyến ĐÃ HOÀN THÀNH: hỏi xác nhận và nói rõ tiền KHÔNG được hoàn', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking, status: 'COMPLETED' });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    await userEvent.click(await screen.findByRole('switch', { name: /chuyến test/i }));

    // Chưa gọi API — đang chờ người xác nhận.
    expect(setBookingTestFlag).not.toHaveBeenCalled();
    expect(await screen.findByText(/KHÔNG được hoàn/)).toBeInTheDocument();
    expect(screen.getByText(/hoá đơn VAT/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(setBookingTestFlag).toHaveBeenCalledWith('b1', true));
  });

  it('chuyến ĐÃ HOÀN THÀNH: bấm Huỷ thì KHÔNG đổi gì', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking, status: 'COMPLETED' });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    await userEvent.click(await screen.findByRole('switch', { name: /chuyến test/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Huỷ' }));

    expect(setBookingTestFlag).not.toHaveBeenCalled();
    // Công tắc phải về đúng chỗ cũ, không "bật lạc quan" rồi kẹt ở đó.
    expect(screen.getByRole('switch', { name: /chuyến test/i })).toHaveAttribute('data-state', 'unchecked');
  });

  it('API lỗi: revert về GIÁ TRỊ CŨ, không phải phủ định của giá trị mới', async () => {
    // Với booking thiếu field, revert kiểu `!next` sẽ cho `true` — tức là hiện ra
    // một chuyến test mà server chưa hề ghi nhận.
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking, status: 'ACCEPTED' });
    vi.mocked(setBookingTestFlag).mockRejectedValue(new Error('sập mạng'));
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    const toggle = await screen.findByRole('switch', { name: /chuyến test/i });
    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('data-state', 'unchecked'));
  });
});
