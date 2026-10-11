import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingDetail } from './booking-detail';
import { getBookingDetails, recordBookingCustomerCall } from '@/lib/api';
import type { Booking } from '@/lib/types';

/**
 * Khối "Gọi check khách" — chuyển nút sau khi "Nhận gọi".
 *
 * Bug 2026-10-10: nhận gọi thành công nhưng FE chỉ vá `customerCallStatus`, còn nút lại
 * suy theo cột theo PHA (`callBeforeStatus`/`callAfterStatus`) → badge đổi "Đã nhận gọi"
 * mà nút vẫn là "Nhận gọi". Admin gõ ghi chú rồi bấm lại → backend chặn (việc đã có
 * người giữ — chính mình) → "Không lưu được", ghi chú mất.
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordBookingCustomerCall).mockResolvedValue(undefined as never);
});

describe('BookingDetail — nhận gọi check khách', () => {
  it('gọi-TRƯỚC: nhận xong thì hiện 2 nút kết quả, không còn "Nhận gọi"', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({ ...baseBooking });
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    await userEvent.click(await screen.findByRole('button', { name: /nhận gọi/i }));

    expect(await screen.findByRole('button', { name: /đã gọi được/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nhận gọi/i })).not.toBeInTheDocument();
  });

  it('gọi-SAU (đã gọi trước xong): nhận xong cũng chuyển sang 2 nút kết quả', async () => {
    vi.mocked(getBookingDetails).mockResolvedValue({
      ...baseBooking,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      customerCallStatus: 'CALLED',
      callBeforeStatus: 'CALLED',
      callAfterStatus: null,
    } as Booking);
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    await userEvent.click(await screen.findByRole('button', { name: /nhận gọi/i }));

    expect(await screen.findByRole('button', { name: /đã gọi được/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nhận gọi/i })).not.toBeInTheDocument();
  });

  it('nhận bị từ chối (đã có người giữ) → tải lại chi tiết, giữ ghi chú đang gõ', async () => {
    vi.mocked(getBookingDetails)
      .mockResolvedValueOnce({ ...baseBooking })
      .mockResolvedValueOnce({ ...baseBooking, customerCallStatus: 'CLAIMED', callBeforeStatus: 'CLAIMED' } as Booking);
    vi.mocked(recordBookingCustomerCall).mockRejectedValue(new Error('Việc này vừa được Admin A nhận.'));
    render(<BookingDetail bookingId="b1" onClose={() => {}} />);

    const note = await screen.findByPlaceholderText(/ghi chú cuộc gọi/i);
    await userEvent.type(note, 'khách xác nhận');
    await userEvent.click(screen.getByRole('button', { name: /nhận gọi/i }));

    expect(await screen.findByRole('button', { name: /đã gọi được/i })).toBeInTheDocument();
    expect(getBookingDetails).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByPlaceholderText(/ghi chú cuộc gọi/i)).toHaveValue('khách xác nhận'));
  });
});
