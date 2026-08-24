import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingsTable } from './bookings-table';
import { AdminMemoCell } from './admin-memo-cell';
import { getBookings, getBookingDetails, updateBookingAdminMemo } from '@/lib/api';
import type { Booking } from '@/lib/types';

// Mock phải khai MỌI export mà CẢ CÂY module của bookings-table import (bảng +
// BookingDetail + VoidBookingDialog + CreateBookingDialog + AddressAutocomplete +
// AdminMemoCell), không chỉ thứ test này dùng — vitest ném "No X export is defined on
// the mock" ngay lúc nạp module, trước cả khi render.
vi.mock('@/lib/api', () => ({
  getBookings: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 })),
  getRoutes: vi.fn(async () => []),
  updateBookingStatus: vi.fn(),
  updateBookingAdminMemo: vi.fn(),
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

const renderWith = async (booking?: Partial<Booking>) => {
  vi.mocked(getBookings).mockResolvedValue(
    booking ? listOf({ ...baseBooking, ...booking } as Booking) : listOf(),
  );
  render(<BookingsTable />);
  // Danh sách có debounce 500ms trước khi gọi API — chờ mặc định 1000ms là sát mép trên
  // máy CI chậm, nên nới hẳn ra (giống user-table.test.tsx).
  return await waitFor(() => screen.getByLabelText('Ghi chú nội bộ') as HTMLInputElement, {
    timeout: 3000,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateBookingAdminMemo).mockResolvedValue({ id: 'b1', adminMemo: null });
});

describe('BookingsTable — cột "Ghi chú" là Ô NHẬP memo nội bộ (adminMemo)', () => {
  it('ô nhập prefill đúng adminMemo, và nằm ở cột thứ 7', async () => {
    const input = await renderWith({ adminMemo: 'khách hẹn gọi lại sau 18h' } as Partial<Booking>);
    expect(input.value).toBe('khách hẹn gọi lại sau 18h');

    // Assert theo VỊ TRÍ để khoá luôn chỗ đứng của cột: Khách hàng, Tài xế, Tuyến đường,
    // Giá, Ngày tạo, Trạng thái, Ghi chú, Thao tác.
    const row = input.closest('tr')!;
    expect(within(row).getAllByRole('cell')[6]).toContainElement(input);
  });

  it('chưa có memo → ô rỗng (không phải chuỗi "null"/"undefined")', async () => {
    const input = await renderWith({});
    expect(input.value).toBe('');
  });

  it('KHÔNG lấy ghi chú của KHÁCH (note) hay log máy ghi (adminNote) làm giá trị ô', async () => {
    // Ba cột này tách nhau có chủ đích: `note` đi ra app tài xế, `adminNote` là log
    // append-only. Lấy nhầm nguồn ở đây nghĩa là admin sửa ô này sẽ ghi đè lên chúng.
    const input = await renderWith({
      note: 'Khách VIP, có trẻ nhỏ',
      adminNote: '[Admin: gạt cờ chuyến test]',
    } as Partial<Booking>);
    expect(input.value).toBe('');
  });

  it('sửa rồi blur → gọi API đúng 1 lần với giá trị mới', async () => {
    const user = userEvent.setup();
    vi.mocked(updateBookingAdminMemo).mockResolvedValue({ id: 'b1', adminMemo: 'gọi trước 10 phút' });
    const input = await renderWith({});

    await user.click(input);
    await user.type(input, 'gọi trước 10 phút');
    await user.tab();

    await waitFor(() => expect(updateBookingAdminMemo).toHaveBeenCalledTimes(1));
    expect(updateBookingAdminMemo).toHaveBeenCalledWith('b1', 'gọi trước 10 phút');
    await waitFor(() => expect(input.value).toBe('gọi trước 10 phút'));
  });

  it('trim khoảng trắng trước khi gửi', async () => {
    const user = userEvent.setup();
    vi.mocked(updateBookingAdminMemo).mockResolvedValue({ id: 'b1', adminMemo: 'abc' });
    const input = await renderWith({});

    await user.click(input);
    await user.type(input, '   abc   ');
    await user.tab();

    await waitFor(() => expect(updateBookingAdminMemo).toHaveBeenCalledWith('b1', 'abc'));
  });

  it('Enter cũng lưu, và lưu ĐÚNG MỘT LẦN (không cộng dồn với blur)', async () => {
    const user = userEvent.setup();
    vi.mocked(updateBookingAdminMemo).mockResolvedValue({ id: 'b1', adminMemo: 'xong' });
    const input = await renderWith({});

    await user.click(input);
    await user.type(input, 'xong{Enter}');
    await user.tab();

    await waitFor(() => expect(updateBookingAdminMemo).toHaveBeenCalledTimes(1));
  });

  it('blur mà KHÔNG đổi gì → không gọi API', async () => {
    // Bảng này reload sau mỗi thao tác khác, admin bấm qua lại rất nhiều. Gọi API mỗi
    // lần blur là hàng trăm request rỗng, và mỗi cái là một cơ hội ghi đè.
    const user = userEvent.setup();
    const input = await renderWith({ adminMemo: 'giữ nguyên' } as Partial<Booking>);

    await user.click(input);
    await user.tab();

    expect(updateBookingAdminMemo).not.toHaveBeenCalled();
    expect(input.value).toBe('giữ nguyên');
  });

  it('Esc huỷ: trả về giá trị đã lưu và KHÔNG gọi API', async () => {
    const user = userEvent.setup();
    const input = await renderWith({ adminMemo: 'bản gốc' } as Partial<Booking>);

    await user.click(input);
    await user.clear(input);
    await user.type(input, 'gõ sai rồi{Escape}');

    expect(updateBookingAdminMemo).not.toHaveBeenCalled();
    await waitFor(() => expect(input.value).toBe('bản gốc'));
  });

  it('API lỗi → ô trả về giá trị ĐÃ LƯU, không giữ chữ chưa lưu', async () => {
    // Giữ nguyên chữ vừa gõ khi lưu thất bại là cách êm nhất để admin tưởng đã lưu xong
    // rồi bỏ đi, trong khi server vẫn giữ bản cũ.
    const user = userEvent.setup();
    vi.mocked(updateBookingAdminMemo).mockRejectedValue(new Error('mạng lỗi'));
    const input = await renderWith({ adminMemo: 'bản trên server' } as Partial<Booking>);

    await user.click(input);
    await user.clear(input);
    await user.type(input, 'chữ mới');
    await user.tab();

    await waitFor(() => expect(updateBookingAdminMemo).toHaveBeenCalled());
    await waitFor(() => expect(input.value).toBe('bản trên server'));
  });

  it('response về SAU khi admin đã gõ tiếp → KHÔNG xoá chữ đang gõ', async () => {
    // Kịch bản thật: Enter để lưu (ô mất focus, request bay đi), rồi bấm lại vào ô gõ
    // tiếp ngay. Nếu đường thành công `setDraft` vô điều kiện thì response về sẽ xoá
    // chữ mới. `reqRef` KHÔNG đỡ được ca này — không có request nào mới hơn để so.
    const user = userEvent.setup();
    let resolveSave!: (v: { id: string; adminMemo: string | null }) => void;
    vi.mocked(updateBookingAdminMemo).mockReturnValue(
      new Promise((r) => {
        resolveSave = r;
      }),
    );
    const input = await renderWith({});

    await user.click(input);
    await user.type(input, 'lần 1{Enter}');
    expect(updateBookingAdminMemo).toHaveBeenCalledWith('b1', 'lần 1');

    await user.click(input);
    await user.type(input, ' thêm chữ');

    await act(async () => {
      resolveSave({ id: 'b1', adminMemo: 'lần 1' });
    });

    expect(input.value).toBe('lần 1 thêm chữ');
  });

  it('chỉ focus rồi blur (KHÔNG gõ gì) → không gửi, và ô đồng bộ lại giá trị mới nhất', async () => {
    // Kịch bản mất dữ liệu thật: admin bấm vào ô, không gõ gì; trong lúc đó admin KHÁC lưu
    // giá trị mới và bảng reload. Effect đồng bộ cố ý bỏ qua khi ô đang focus, nên draft
    // còn giữ chữ CŨ — blur mà lưu vô điều kiện là đẩy bản cũ đè bản mới của người ta.
    //
    // Test thẳng vào component: "bảng reload ra giá trị mới" chính là prop `value` đổi, nên
    // `rerender` mô tả đúng kịch bản mà không phải dựng cả bảng để giả một lần fetch.
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const { rerender } = render(
      <AdminMemoCell bookingId="b1" value="bản cũ" onSaved={onSaved} />,
    );
    const input = screen.getByLabelText('Ghi chú nội bộ') as HTMLInputElement;

    await user.click(input);
    expect(input.value).toBe('bản cũ');

    rerender(<AdminMemoCell bookingId="b1" value="bản mới" onSaved={onSaved} />);
    // Vẫn hiện chữ cũ trong lúc focus — CỐ Ý, để không xoá chữ admin đang gõ giữa câu.
    expect(input.value).toBe('bản cũ');

    await user.tab();

    expect(updateBookingAdminMemo).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    // Blur là lúc bù lại phần effect đã bỏ qua.
    expect(input.value).toBe('bản mới');
  });

  it('sửa rồi đổi ý về giá trị cũ khi request trước còn bay → gửi lần 2, ô không nhảy về chữ đã xoá', async () => {
    // saved='A' → sửa 'B' (request#1 bay) → sửa lại 'A'. Nếu so với `saved` thì lần 2 bị coi
    // là "không đổi" → không gửi gì, và response 'B' về sau làm ô nhảy đúng về chữ vừa xoá.
    const user = userEvent.setup();
    let resolve1!: (v: { id: string; adminMemo: string | null }) => void;
    vi.mocked(updateBookingAdminMemo)
      .mockReturnValueOnce(new Promise((r) => { resolve1 = r; }))
      .mockResolvedValueOnce({ id: 'b1', adminMemo: 'A' });
    const input = await renderWith({ adminMemo: 'A' } as Partial<Booking>);

    await user.click(input);
    await user.clear(input);
    await user.type(input, 'B');
    await user.tab();
    expect(updateBookingAdminMemo).toHaveBeenNthCalledWith(1, 'b1', 'B');

    await user.click(input);
    await user.clear(input);
    await user.type(input, 'A');
    await user.tab();

    await waitFor(() => expect(updateBookingAdminMemo).toHaveBeenCalledTimes(2));
    expect(updateBookingAdminMemo).toHaveBeenNthCalledWith(2, 'b1', 'A');

    // Response cũ về muộn KHÔNG được ghi đè kết quả mới.
    await act(async () => {
      resolve1({ id: 'b1', adminMemo: 'B' });
    });
    expect(input.value).toBe('A');
  });

  it('xoá sạch memo → gửi chuỗi rỗng (đường xoá của contract)', async () => {
    // Backend cố ý KHÔNG nhận `null`/thiếu field (gửi `{}` là 400) — chuỗi rỗng mới là cách
    // xoá. Gửi sai kiểu ở đây thì admin bấm xoá xong memo vẫn còn nguyên.
    const user = userEvent.setup();
    vi.mocked(updateBookingAdminMemo).mockResolvedValue({ id: 'b1', adminMemo: null });
    const input = await renderWith({ adminMemo: 'cần xoá' } as Partial<Booking>);

    await user.click(input);
    await user.clear(input);
    await user.tab();

    await waitFor(() => expect(updateBookingAdminMemo).toHaveBeenCalledWith('b1', ''));
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('Enter trong lúc IME đang soạn (gõ tiếng Việt) KHÔNG lưu', async () => {
    // Telex/VNI dùng Enter để chốt chữ đang soạn. Không kiểm `isComposing` thì phím Enter
    // đó bị hiểu là "lưu" và cướp mất chữ admin đang gõ dở.
    const user = userEvent.setup();
    const input = await renderWith({});

    await user.click(input);
    await user.type(input, 'chuyen');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(updateBookingAdminMemo).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });

  it('bấm vào ô nhập KHÔNG mở dialog chi tiết chuyến', async () => {
    // Cả <TableRow> có onClick mở chi tiết. Thiếu stopPropagation thì vừa bấm vào ô là
    // dialog bung ra, che bảng và mất chỗ đang gõ.
    const user = userEvent.setup();
    const input = await renderWith({});

    await user.click(input);

    expect(getBookingDetails).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });

  it('colSpan của dòng rỗng KHỚP số cột header (khoá lỗi đếm tay)', async () => {
    // Lỗi này không có gì bắt được ngoài việc đếm: commit gỡ 2 cột gọi khách phải ĐẾM
    // TAY 9 → 7. Lệch colSpan không ném lỗi, chỉ làm dòng "Không có chuyến" co lệch bảng.
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
