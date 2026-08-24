import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingDetail } from './booking-detail';
import { getBookingDetails, setBookingDuplicateFlag, setBookingTestFlag } from '@/lib/api';
import type { Booking } from '@/lib/types';

/**
 * Công tắc "chuyến trùng" ở dialog chi tiết.
 *
 * Cơ chế sao khuôn công tắc "chuyến test" nhưng HỆ QUẢ khác hẳn: cờ này KHÔNG đụng tiền,
 * KHÔNG loại chuyến khỏi báo cáo/hoá đơn/đối soát, KHÔNG đụng hàng đợi CSKH. Vì thế nó
 * CỐ Ý không hỏi xác nhận với chuyến đã hoàn thành — và test dưới khoá đúng điểm đó, vì
 * "cho giống công tắc kia" là thứ người sửa sau rất dễ thêm vào.
 */

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

const toggle = () => screen.findByRole('switch', { name: /chuyến trùng/i });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setBookingDuplicateFlag).mockResolvedValue({ id: 'b1', isDuplicateTrip: true });
  vi.mocked(setBookingTestFlag).mockResolvedValue({ id: 'b1', isTestTrip: true });
});

describe('BookingDetail — badge chuyến trùng', () => {
  it('hiện badge TRÙNG khi isDuplicateTrip = true', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking, isDuplicateTrip: true });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    expect(await screen.findByText(/TRÙNG/)).toBeInTheDocument();
  });

  it('KHÔNG hiện badge khi field thiếu (booking từ backend cũ)', async () => {
    // Điều thật sự khoá: `undefined` phải cùng nghĩa với `false`. Viết
    // `isDuplicateTrip !== false` thì MỌI chuyến cũ sẽ đeo badge TRÙNG.
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    await screen.findByText('Khách hàng');
    expect(screen.queryByText(/⧉ TRÙNG/)).not.toBeInTheDocument();
  });
});

describe('BookingDetail — công tắc chuyến trùng', () => {
  it('công tắc phản ánh đúng trạng thái, kể cả khi field thiếu', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);
    // `checked={undefined}` sẽ làm Radix chuyển sang uncontrolled — công tắc kẹt.
    expect(await toggle()).toHaveAttribute('data-state', 'unchecked');
  });

  it('gạt bật → gọi API với true', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    await userEvent.click(await toggle());

    await waitFor(() => expect(setBookingDuplicateFlag).toHaveBeenCalledWith('b1', true));
  });

  it('gạt tắt → gọi API với false', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking, isDuplicateTrip: true });
    vi.mocked(setBookingDuplicateFlag).mockResolvedValue({ id: 'b1', isDuplicateTrip: false });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    await userEvent.click(await toggle());

    await waitFor(() => expect(setBookingDuplicateFlag).toHaveBeenCalledWith('b1', false));
  });

  it('chuyến ĐÃ HOÀN THÀNH: gạt là gọi API luôn, KHÔNG hỏi xác nhận', async () => {
    // Khác hẳn công tắc chuyến test (chuyến COMPLETED phải xác nhận vì tiền đã chuyển).
    // Cờ này không đụng tiền — thêm bước hỏi là bắt CSKH bấm thừa mỗi lần.
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking, status: 'COMPLETED' });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    await userEvent.click(await toggle());

    await waitFor(() => expect(setBookingDuplicateFlag).toHaveBeenCalledWith('b1', true));
  });

  it('báo cho danh sách ngoài refetch sau khi gạt', async () => {
    // Dialog có state riêng: thiếu callback này thì badge ở hàng ngoài bảng đứng im
    // tới khi F5 — bug im lặng, không lỗi, không log.
    const onDuplicateFlagChanged = vi.fn();
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking });
    render(
      <BookingDetail bookingId="b1" onClose={() => {}} onDuplicateFlagChanged={onDuplicateFlagChanged} />,
    );

    await userEvent.click(await toggle());

    await waitFor(() => expect(onDuplicateFlagChanged).toHaveBeenCalled());
  });

  it('API lỗi → công tắc quay về ĐÚNG giá trị cũ (không lật ngược bằng !next)', async () => {
    // Field optional: revert bằng `!next` thì chuyến vốn `undefined` sẽ thành `true` —
    // UI bịa ra một chuyến trùng sau khi lưu THẤT BẠI.
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking });
    vi.mocked(setBookingDuplicateFlag).mockRejectedValue(new Error('403'));
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    const sw = await toggle();
    await userEvent.click(sw);

    await waitFor(() => expect(sw).toHaveAttribute('data-state', 'unchecked'));
  });

  it('hai công tắc khoá ĐỘC LẬP — gạt cờ trùng không làm chết cờ test', async () => {
    // Dùng chung một biến `saving` là lỗi dễ mắc: một request treo sẽ khoá cả hai.
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking });
    let release!: () => void;
    vi.mocked(setBookingDuplicateFlag).mockReturnValue(
      new Promise((resolve) => { release = () => resolve({ id: 'b1', isDuplicateTrip: true }); }),
    );
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    await userEvent.click(await toggle());

    const testSwitch = await screen.findByRole('switch', { name: /chuyến test/i });
    expect(testSwitch).not.toBeDisabled();
    release();
  });
});
