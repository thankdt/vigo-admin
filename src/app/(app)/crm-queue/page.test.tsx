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
vi.mock('../bookings/components/booking-detail', () => ({
  BookingDetail: () => <div data-testid="booking-detail" />,
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

const page = (data: Booking[], over: Record<string, unknown> = {}) => ({
  data,
  total: data.length,
  page: 1,
  limit: 20,
  totalPages: 1,
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
