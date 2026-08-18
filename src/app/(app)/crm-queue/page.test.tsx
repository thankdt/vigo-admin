import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CrmQueuePage from './page';
import type { Booking } from '@/lib/types';

/**
 * `page.tsx` từng không có một dòng test nào, và đó là gốc của lỗi CHẶN đã lọt:
 * pha cuộc gọi được suy theo TAB thay vì theo DÒNG, khiến việc gọi-trước đã nhận
 * hiện lại nút "Nhận gọi" thay vì 2 nút ghi kết quả — vòng lặp không lối ra.
 *
 * Test ở đây bám vào HÀNH VI người dùng thấy (nút nào hiện ra, gọi API nào), không
 * bám vào state nội bộ.
 */

const getBookings = vi.fn();
const recordBookingCustomerCall = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getBookings: (...a: any[]) => getBookings(...a),
    recordBookingCustomerCall: (...a: any[]) => recordBookingCustomerCall(...a),
    getCustomerCallReasons: vi.fn(async () => ['Khách đổi ý', 'Khách không nghe máy']),
  };
});

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    me: { id: 'admin-1', fullName: 'Admin Một', phone: '0900', isSuperAdmin: false, functions: ['crm-queue'] },
    loading: false,
    can: () => true,
    refresh: vi.fn(),
  }),
}));

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

// BookingDetail kéo cả module chi tiết chuyến — không thuộc phạm vi test này.
// Mock lộ ra một nút bắn `onCallRecorded` để test được ĐƯỜNG GHI TỪ DIALOG — đường này
// trước đây không có ca nào chạm, và nó chính là chỗ quên nạp lại số trên nhãn tab.
vi.mock('../bookings/components/booking-detail', () => ({
  BookingDetail: ({ onCallRecorded }: { onCallRecorded?: () => void }) => (
    <div data-testid="booking-detail">
      <button onClick={() => onCallRecorded?.()}>giả lập ghi từ dialog</button>
    </div>
  ),
}));

const mkBooking = (over: Partial<Booking> = {}): Booking =>
  ({
    id: 'bk-1',
    customerId: 'c1',
    customer: { id: 'c1', fullName: 'Khách A', phone: '0911111111' },
    route: { id: 1, name: 'Hà Nội — Hải Phòng' },
    pickupAddress: 'A',
    dropoffAddress: 'B',
    price: 100000,
    status: 'SEARCHING',
    createdAt: '2026-08-14T00:00:00Z',
    completedAt: null,
    scheduledTime: null,
    ...over,
  }) as unknown as Booking;

/**
 * 🚨 `totalPages` tính GIỐNG BACKEND (`Math.ceil(total / limit)`), KHÔNG ép cứng 1.
 *
 * Bản trước ép `totalPages: 1` kể cả khi `data` rỗng, nên bộ test không bao giờ chạm được
 * đường `totalPages = 0` — đúng đường mà backend thực sự trả khi tab HẾT VIỆC, và là chỗ
 * bảng giữ nguyên dòng cũ kèm nút bấm còn sống.
 */
const page = (data: Booking[], over: Record<string, unknown> = {}) => ({
  data,
  total: data.length,
  page: 1,
  limit: 20,
  totalPages: Math.ceil(data.length / 20),
  ...over,
});

beforeEach(() => {
  getBookings.mockReset().mockResolvedValue(page([]));
  recordBookingCustomerCall.mockReset().mockResolvedValue(undefined);
  toast.mockReset();
});

const goToTab = async (name: RegExp) =>
  userEvent.click(await screen.findByRole('tab', { name }));

describe('CrmQueuePage — tab mặc định "Cần gọi trước"', () => {
  it('gửi đúng bộ tham số của tab, kèm loại trừ chuyến đã xong', async () => {
    render(<CrmQueuePage />);
    await waitFor(() => expect(getBookings).toHaveBeenCalled());
    expect(getBookings.mock.calls[0][0]).toMatchObject({
      callBefore: 'uncalled',
      excludeStatus: 'COMPLETED,CANCELLED',
      limit: 20,
    });
  });

  it('việc chưa ai nhận thì hiện "Nhận gọi", ghi CLAIMED', async () => {
    getBookings.mockResolvedValue(page([mkBooking()]));
    render(<CrmQueuePage />);

    await userEvent.click(await screen.findByRole('button', { name: /nhận gọi/i }));
    await waitFor(() =>
      expect(recordBookingCustomerCall).toHaveBeenCalledWith('bk-1', { status: 'CLAIMED' }),
    );
  });
});

/**
 * ĐÂY LÀ CA CHẶN. Backend lọc tab này bằng `claimedBy`, mà SQL của nó OR CẢ HAI pha:
 * nhánh gọi-trước yêu cầu `completedAt IS NULL`, nên dòng gọi-trước trong tab này LUÔN
 * có `callAfterStatus = null`. Suy pha theo tab (`tab === 'before'` → false ở đây) sẽ
 * đọc nhầm sang callAfter* và kết luận "chưa ai nhận".
 */
describe('CrmQueuePage — tab "Việc của tôi" chứa lẫn CẢ HAI pha', () => {
  const claimedBefore = mkBooking({
    id: 'bk-before',
    completedAt: null,
    callBeforeStatus: 'CLAIMED',
    callBeforeById: 'admin-1',
    callBeforeBy: { id: 'admin-1', fullName: 'Admin Một' },
  } as Partial<Booking>);

  it('việc gọi-TRƯỚC đã nhận hiện 2 nút kết quả, KHÔNG hiện lại "Nhận gọi"', async () => {
    getBookings.mockResolvedValue(page([claimedBefore]));
    render(<CrmQueuePage />);
    await goToTab(/việc của tôi/i);

    await waitFor(() => expect(screen.getByRole('button', { name: /đã gọi được/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /không liên lạc được/i })).toBeInTheDocument();
    // Nếu ca này đỏ nghĩa là pha lại đang suy theo tab -> vòng lặp bấm "Nhận gọi" quay lại.
    expect(screen.queryByRole('button', { name: /^nhận gọi$/i })).not.toBeInTheDocument();
  });

  it('cột "Người giữ việc" hiện tên người giữ pha TRƯỚC, không phải gạch ngang', async () => {
    getBookings.mockResolvedValue(page([claimedBefore]));
    render(<CrmQueuePage />);
    await goToTab(/việc của tôi/i);

    await waitFor(() => expect(screen.getByText('Admin Một')).toBeInTheDocument());
  });

  it('gửi claimedBy = id admin đang đăng nhập', async () => {
    render(<CrmQueuePage />);
    await goToTab(/việc của tôi/i);
    await waitFor(() =>
      expect(getBookings.mock.calls.at(-1)![0]).toMatchObject({ claimedBy: 'admin-1' }),
    );
  });
});

describe('CrmQueuePage — trạng thái rỗng', () => {
  // "Hết việc" và "không tải được" trông y hệt nhau trên bảng rỗng, mà hành động của
  // CSKH thì khác hẳn: một bên nghỉ tay, một bên phải báo lỗi.
  it('phân biệt "hết việc" với "không tải được"', async () => {
    render(<CrmQueuePage />);
    await waitFor(() => expect(screen.getByText(/không còn việc nào/i)).toBeInTheDocument());
  });

  it('tải lỗi thì báo đúng là lỗi, không báo "hết việc"', async () => {
    getBookings.mockRejectedValue(new Error('mạng hỏng'));
    render(<CrmQueuePage />);
    await waitFor(() => expect(screen.getByText(/không tải được danh sách/i)).toBeInTheDocument());
    expect(screen.queryByText(/không còn việc nào/i)).not.toBeInTheDocument();
  });

  // Xử lý nốt dòng cuối của trang cuối làm totalPages co lại; không kẹp `page` thì bảng
  // báo "hết việc" (sai) mà khối phân trang cũng biến mất -> không có đường quay lại.
  it('trang vượt quá tổng số trang thì tự kẹp về trang cuối hợp lệ', async () => {
    getBookings.mockResolvedValue(page([mkBooking()], { totalPages: 3, total: 41 }));
    render(<CrmQueuePage />);
    await waitFor(() => expect(screen.getByText(/Trang 1\/3/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /^sau$/i }));
    await waitFor(() => expect(getBookings.mock.calls.at(-1)![0]).toMatchObject({ page: 2 }));

    // Việc bị xử lý hết -> chỉ còn 1 trang.
    getBookings.mockResolvedValue(page([mkBooking()], { totalPages: 1, total: 1 }));
    await userEvent.click(screen.getByRole('button', { name: /^sau$/i }));
    await waitFor(() => expect(getBookings.mock.calls.at(-1)![0]).toMatchObject({ page: 1 }));
  });

  /**
   * 🚨 CA CHỊU LỰC. Backend trả `totalPages = 0` khi tab HẾT VIỆC (`Math.ceil(0/20)`), và
   * `api.ts` chỉ chặn `undefined` bằng `??` nên số 0 đi thẳng vào trang.
   *
   * Bản cũ so `page > res.totalPages` → ở trang 1 thì `1 > 0` đúng → `setPage(Math.max(1,0))`
   * = setPage(1) = ĐÚNG giá trị đang có → React bail-out → effect không chạy lại → `return`
   * xảy ra TRƯỚC `setRows` → bảng GIỮ NGUYÊN dòng vừa xử lý, kèm nút ghi kết quả CÒN SỐNG.
   * Bấm lại là gọi khách lần hai và đẻ thêm một dòng sự kiện (recordCustomerCall không
   * idempotent). Đây là trạng thái kết thúc BÌNH THƯỜNG hằng ngày, không phải ca hiếm.
   */
  it('xử lý nốt việc CUỐI: bảng phải RỖNG, không giữ lại dòng vừa xử lý', async () => {
    getBookings.mockResolvedValue(page([mkBooking({ id: 'bk-1' })]));
    render(<CrmQueuePage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^nhận gọi$/i })).toBeInTheDocument(),
    );

    // Xử lý xong -> tab hết việc -> backend trả totalPages = 0 (KHÔNG phải 1).
    getBookings.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    await userEvent.click(screen.getByRole('button', { name: /^nhận gọi$/i }));

    await waitFor(() => expect(screen.queryByText('Khách A')).not.toBeInTheDocument());
    // Nút hành động phải chết theo dòng — còn sống nghĩa là bấm được lần hai.
    expect(screen.queryByRole('button', { name: /^nhận gọi$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/không còn việc nào/i)).toBeInTheDocument();
  });

  /** Cùng cơ chế: 20 dòng của tab CŨ không được nằm dưới header tab MỚI. */
  it('đổi sang tab RỖNG: không mang theo dòng của tab cũ', async () => {
    getBookings.mockResolvedValue(page([mkBooking({ id: 'bk-1' })]));
    render(<CrmQueuePage />);
    await screen.findByText('Khách A');

    getBookings.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    await goToTab(/quá hạn/i);

    await waitFor(() => expect(screen.queryByText('Khách A')).not.toBeInTheDocument());
  });
});

describe('CrmQueuePage — ranh giới quyền', () => {
  // Quyền crm-queue cố ý KHÔNG cho đổi trạng thái / điều tài / tạo chuyến. Nút nào lọt
  // vào đây là mở đúng thứ việc tách quyền này sinh ra để không cấp.
  it('không có nút tạo chuyến / đổi trạng thái / điều tài', async () => {
    getBookings.mockResolvedValue(page([mkBooking()]));
    render(<CrmQueuePage />);
    await screen.findByText('Khách A');

    const table = screen.getByRole('table');
    for (const cam of [/tạo chuyến/i, /đổi trạng thái/i, /điều tài/i, /gán tài xế/i, /huỷ chuyến/i]) {
      expect(within(table).queryByRole('button', { name: cam })).not.toBeInTheDocument();
    }
  });
});

/**
 * Số việc trên nhãn tab. Sai số ở đây tệ hơn KHÔNG có số: CSKH tin "tab đó trống" rồi bỏ
 * qua việc thật. Ba thứ phải đúng — đếm cho đủ 5 tab, cập nhật sau khi xử lý xong một
 * việc, và một tab lỗi không được xoá số của 4 tab kia.
 */
describe('CrmQueuePage — số việc trên tab', () => {
  it('đếm đủ 5 tab, mỗi tab một truy vấn nhẹ (limit 1)', async () => {
    getBookings.mockResolvedValue(page([], { total: 7 }));
    render(<CrmQueuePage />);

    await waitFor(() => expect(screen.getAllByText('7').length).toBeGreaterThan(0));
    const countCalls = getBookings.mock.calls.filter((c: any[]) => c[0]?.limit === 1);
    expect(countCalls).toHaveLength(5);
  });

  it('xử lý xong một việc thì đếm lại — không để số cũ nằm lì', async () => {
    getBookings.mockResolvedValue(page([mkBooking()], { total: 1 }));
    render(<CrmQueuePage />);

    await waitFor(() => expect(getBookings.mock.calls.filter((c: any[]) => c[0]?.limit === 1)).toHaveLength(5));
    await userEvent.click(await screen.findByRole('button', { name: /nhận gọi/i }));

    await waitFor(() =>
      expect(getBookings.mock.calls.filter((c: any[]) => c[0]?.limit === 1).length).toBeGreaterThan(5),
    );
  });

  it('một tab đếm lỗi thì các tab còn lại vẫn có số', async () => {
    let n = 0;
    getBookings.mockImplementation(async (p: any) => {
      if (p?.limit === 1 && ++n === 2) throw new Error('tab này lỗi');
      return page([], { total: 4 });
    });
    render(<CrmQueuePage />);

    await waitFor(() => expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(4));
  });
});

describe('CrmQueuePage — ghi kết quả từ dialog chi tiết', () => {
  /**
   * Ghi từ dialog cũng làm việc rời tab, nên số trên nhãn tab phải nạp lại. Chỉ gọi
   * `load` thì badge đứng số cũ tới khi F5 — mà màn đã bỏ dòng "N việc" khi chỉ một
   * trang, nên không còn chỗ nào để người dùng đối chiếu và phát hiện.
   */
  it('nạp lại CẢ danh sách LẪN số trên nhãn tab', async () => {
    getBookings.mockResolvedValue(page([mkBooking()], { total: 1 }));
    render(<CrmQueuePage />);

    await userEvent.click(await screen.findByRole('button', { name: /xem chi tiết chuyến/i }));
    const countsBefore = getBookings.mock.calls.filter((c: any[]) => c[0]?.limit === 1).length;
    const listBefore = getBookings.mock.calls.filter((c: any[]) => c[0]?.limit === 20).length;

    await userEvent.click(await screen.findByRole('button', { name: /giả lập ghi từ dialog/i }));

    await waitFor(() =>
      expect(getBookings.mock.calls.filter((c: any[]) => c[0]?.limit === 1).length).toBeGreaterThan(countsBefore),
    );
    expect(getBookings.mock.calls.filter((c: any[]) => c[0]?.limit === 20).length).toBeGreaterThan(listBefore);
  });
});

/**
 * 🚨 Backend chốt "nhận việc" bằng update CÓ ĐIỀU KIỆN và trả 409 (RES_004) cho người
 * thua. Nếu FE hiện nó như lỗi hệ thống thì người thua không hiểu chuyện gì, và tệ hơn:
 * bảng vẫn hiện dòng "chưa ai nhận" đã cũ nên họ bấm lại và lại thua.
 */
describe('CrmQueuePage — thua cuộc giành việc', () => {
  it('409 báo "người khác đã nhận" và NẠP LẠI bảng, không báo lỗi hệ thống', async () => {
    getBookings.mockResolvedValue(page([mkBooking({ id: 'bk-1' })]));
    render(<CrmQueuePage />);
    const nut = await screen.findByRole('button', { name: /^nhận gọi$/i });

    recordBookingCustomerCall.mockRejectedValueOnce({
      errorCode: 'RES_004',
      message: 'Việc này vừa được Admin Hai nhận.',
    });
    const truoc = getBookings.mock.calls.length;
    await userEvent.click(nut);

    await waitFor(() => expect(toast).toHaveBeenCalled());
    const arg = toast.mock.calls.at(-1)![0];
    expect(`${arg.title} ${arg.description ?? ''}`).toMatch(/Admin Hai|người khác/i);
    // Nạp lại: người thua phải thấy trạng thái mới, không đứng trên dòng cũ.
    await waitFor(() => expect(getBookings.mock.calls.length).toBeGreaterThan(truoc));
  });

  /** Lỗi thường KHÔNG được mượn câu "người khác đã nhận" — hai chuyện khác hẳn nhau. */
  it('lỗi KHÁC 409 không báo nhầm thành tranh chấp', async () => {
    getBookings.mockResolvedValue(page([mkBooking({ id: 'bk-1' })]));
    render(<CrmQueuePage />);
    const nut = await screen.findByRole('button', { name: /^nhận gọi$/i });

    recordBookingCustomerCall.mockRejectedValueOnce(new Error('mạng hỏng'));
    await userEvent.click(nut);

    await waitFor(() => expect(recordBookingCustomerCall).toHaveBeenCalled());
    const titles = toast.mock.calls.map((c: any[]) => String(c[0]?.title ?? ''));
    expect(titles.some((t: string) => /người khác nhận/i.test(t))).toBe(false);
  });
});
