import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserDetailPage from './page';

/**
 * LƯỚI AN TOÀN cấp trang cho `/users/detail` — viết TRƯỚC khi GĐ2 đổ 3 khối CRM vào đây.
 *
 * Trang 484 dòng này chưa từng có một dòng test nào. Bài học §13.3 của spec nói thẳng:
 * `/crm-queue` ship với 17 ca test hàm thuần trong khi `page.tsx` 358 dòng không có test,
 * và CẢ BỐN finding — kể cả lỗi CHẶN — đều nằm gọn trong đúng khoảng trống đó.
 *
 * Test bám vào thứ NGƯỜI DÙNG THẤY (chữ trên màn, request bắn đi), không bám state nội bộ.
 */

/**
 * ⚠️ Chưa test nào trong repo mock `next/navigation`. Không mock thì `useSearchParams()`
 * ngoài App Router trả null và `params.get('id')` ném TypeError NGAY LÚC RENDER — trông y
 * hệt "trang hỏng", rất dễ đi sửa nhầm chỗ.
 */
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('id=u-1'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const getAdminUserDetail = vi.fn();
const getBookings = vi.fn();
const adminGetUserReferralStats = vi.fn();
const getCrmCustomerSource = vi.fn();
const logCrmProfileView = vi.fn();
const getCrmTagCatalog = vi.fn();
const getCrmCustomerTags = vi.fn();
const addCrmCustomerTag = vi.fn();
const removeCrmCustomerTag = vi.fn();
const getCrmCustomerNotes = vi.fn();
const addCrmCustomerNote = vi.fn();
const removeCrmCustomerNote = vi.fn();
const getCrmCustomerTimeline = vi.fn();
const getCrmTickets = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getAdminUserDetail: (...a: any[]) => getAdminUserDetail(...a),
    getBookings: (...a: any[]) => getBookings(...a),
    adminGetUserReferralStats: (...a: any[]) => adminGetUserReferralStats(...a),
    getCrmCustomerSource: (...a: any[]) => getCrmCustomerSource(...a),
    logCrmProfileView: (...a: any[]) => logCrmProfileView(...a),
    getCrmTagCatalog: (...a: any[]) => getCrmTagCatalog(...a),
    getCrmCustomerTags: (...a: any[]) => getCrmCustomerTags(...a),
    addCrmCustomerTag: (...a: any[]) => addCrmCustomerTag(...a),
    removeCrmCustomerTag: (...a: any[]) => removeCrmCustomerTag(...a),
    getCrmCustomerNotes: (...a: any[]) => getCrmCustomerNotes(...a),
    addCrmCustomerNote: (...a: any[]) => addCrmCustomerNote(...a),
    removeCrmCustomerNote: (...a: any[]) => removeCrmCustomerNote(...a),
    getCrmCustomerTimeline: (...a: any[]) => getCrmCustomerTimeline(...a),
    getCrmTickets: (...a: any[]) => getCrmTickets(...a),
  };
});

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    me: { id: 'admin-1', fullName: 'Admin Một', phone: '0900', isSuperAdmin: false, functions: ['users'] },
    loading: false,
    can: () => true,
    refresh: vi.fn(),
  }),
}));

/**
 * `fetchUser` phụ thuộc `toast`; toast THẬT tạo hàm mới mỗi render → useCallback đổi liên
 * tục → VÒNG LẶP FETCH và test TREO (chứ không đỏ rõ ràng). Mock giữ tham chiếu ổn định —
 * bài học đã ghi ở `htx/(portal)/trips/page.test.tsx`.
 */
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

const mkUser = (over: Record<string, unknown> = {}) => ({
  id: 'u-1',
  fullName: 'Khách A',
  phone: '0911111111',
  email: null,
  role: 'USER',
  isActive: true,
  deletedAt: null,
  avatar: null,
  wallets: [],
  loyaltyTier: 'BRONZE',
  loyaltyPoints: 0,
  bookingCount: 0,
  bookingCountByStatus: {},
  totalWithdrawn: 0,
  // 02:00Z = 09:00 giờ VN — mốc dùng để chứng minh hiển thị theo VN, không theo máy.
  createdAt: '2026-08-14T02:00:00Z',
  ...over,
});

/**
 * Radix Select cần vài API con trỏ mà jsdom không có. Khuôn đã dùng ở
 * `bookings/components/create-booking-dialog.test.tsx` — để scope trong file này, KHÔNG
 * sửa `vitest.setup.ts` global (tránh ảnh hưởng test khác).
 */
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!window.PointerEvent) {
    (window as any).PointerEvent = MouseEvent;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  getAdminUserDetail.mockResolvedValue(mkUser());
  getBookings.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 1 });
  adminGetUserReferralStats.mockResolvedValue(null);
  getCrmCustomerSource.mockResolvedValue(null);
  logCrmProfileView.mockResolvedValue(undefined);
  getCrmTagCatalog.mockResolvedValue(['Khách VIP', 'Hay huỷ chuyến']);
  getCrmCustomerTags.mockResolvedValue([]);
  getCrmCustomerNotes.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0 } });
  addCrmCustomerTag.mockResolvedValue({});
  removeCrmCustomerTag.mockResolvedValue(undefined);
  addCrmCustomerNote.mockResolvedValue({});
  removeCrmCustomerNote.mockResolvedValue(undefined);
  getCrmCustomerTimeline.mockResolvedValue({ data: [], nextCursor: null });
  getCrmTickets.mockResolvedValue({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });
});

describe('/users/detail — lưới an toàn', () => {
  it('render được hồ sơ khách', async () => {
    render(<UserDetailPage />);
    expect(await screen.findByText('Khách A')).toBeInTheDocument();
  });

  // Khoá giờ VN: 02:00Z = 09:00 VN. `format()` của date-fns cho ra giờ TRÌNH DUYỆT.
  it('"Ngày tham gia" hiển thị theo giờ VN, không theo giờ trình duyệt', async () => {
    render(<UserDetailPage />);
    expect(await screen.findByText(/09:00/)).toBeInTheDocument();
  });

  it('"Đã xoá lúc" cũng theo giờ VN', async () => {
    getAdminUserDetail.mockResolvedValue(
      mkUser({ deletedAt: '2026-08-14T03:00:00Z', isActive: false }),
    );
    render(<UserDetailPage />);
    // 03:00Z = 10:00 VN
    expect(await screen.findByText(/10:00/)).toBeInTheDocument();
  });

  it('cột "Thời gian đặt" của bảng chuyến cũng theo giờ VN', async () => {
    getBookings.mockResolvedValue({
      data: [
        {
          id: 'b-1',
          status: 'COMPLETED',
          price: 100000,
          createdAt: '2026-08-14T04:00:00Z',
          pickupAddress: 'A',
          dropoffAddress: 'B',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
    render(<UserDetailPage />);
    // 04:00Z = 11:00 VN
    expect(await screen.findByText(/11:00/)).toBeInTheDocument();
  });

  it('lỗi tải hồ sơ thì hiện thông báo, KHÔNG trắng trang', async () => {
    getAdminUserDetail.mockRejectedValueOnce(new Error('sập'));
    render(<UserDetailPage />);
    expect(await screen.findByText(/sập|Không tải được/)).toBeInTheDocument();
  });

  // Endpoint affiliate hỏng KHÔNG được chặn hồ sơ chính — tài xế/admin thường không có
  // hồ sơ giới thiệu nên đường này lỗi là chuyện bình thường.
  it('endpoint affiliate hỏng vẫn render được hồ sơ', async () => {
    adminGetUserReferralStats.mockRejectedValueOnce(new Error('toang'));
    render(<UserDetailPage />);
    expect(await screen.findByText('Khách A')).toBeInTheDocument();
  });
});

describe('/users/detail — khối Nguồn khách (GĐ2)', () => {
  it('role=USER: hiện khối Nguồn khách', async () => {
    render(<UserDetailPage />);
    expect(await screen.findByText('Nguồn khách')).toBeInTheDocument();
  });

  /**
   * 🚨 CA QUAN TRỌNG NHẤT của khối này. `/users/detail` KHÔNG chỉ mở cho khách:
   * `/leakage-review` và `/driver-cancel-review` deep-link thẳng vào đây bằng userId của
   * TÀI XẾ, còn GĐ0 thêm đường từ `/transport-companies` bằng userId của CHỦ HTX.
   * Quên gate = 3 khối CRM vô nghĩa + 3 request thừa mỗi lần mở.
   */
  it('role=DRIVER: KHÔNG có khối CRM nào VÀ không gọi endpoint CRM nào', async () => {
    getAdminUserDetail.mockResolvedValue(mkUser({ role: 'DRIVER' }));
    render(<UserDetailPage />);
    await screen.findByText('Khách A');
    expect(screen.queryByText('Nguồn khách')).toBeNull();
    expect(getCrmCustomerSource).not.toHaveBeenCalled();
  });

  it('role=TRANSPORT_COMPANY_OWNER: cũng KHÔNG có khối CRM', async () => {
    getAdminUserDetail.mockResolvedValue(mkUser({ role: 'TRANSPORT_COMPANY_OWNER' }));
    render(<UserDetailPage />);
    await screen.findByText('Khách A');
    expect(screen.queryByText('Nguồn khách')).toBeNull();
    expect(getCrmCustomerSource).not.toHaveBeenCalled();
  });

  // Rỗng ≠ chưa tải: ẩn khối khi rỗng thì admin không phân biệt được hai trạng thái đó.
  it('không ai giới thiệu -> hiện trạng thái rỗng, KHÔNG ẩn khối', async () => {
    getCrmCustomerSource.mockResolvedValue(null);
    render(<UserDetailPage />);
    expect(await screen.findByText(/Không qua giới thiệu/)).toBeInTheDocument();
  });

  it('có người giới thiệu -> hiện tên, nhãn KOL, mã, và mốc giờ VN', async () => {
    getCrmCustomerSource.mockResolvedValue({
      referrer: { id: 'r-9', fullName: 'Chị Lan', phone: '0912****78', kind: 'KOL' },
      codeUsed: 'LAN123',
      // Cố ý KHÁC mốc `createdAt` của hồ sơ (02:00Z = 09:00 VN), nếu không thì khẳng định
      // giờ ở dưới sẽ khớp nhầm ô "Ngày tham gia" và ca này mất tác dụng.
      referredAt: '2026-08-14T05:00:00Z',
    });
    render(<UserDetailPage />);
    const link = await screen.findByRole('link', { name: /Chị Lan/ });
    // Trỏ /users/detail (CÙNG function `users`) chứ KHÔNG phải /referrals hay /kol:
    // role cskh không có hai function đó và sẽ bị guard đá về /no-access.
    expect(link).toHaveAttribute('href', '/users/detail?id=r-9');
    expect(screen.getByText(/KOL/)).toBeInTheDocument();
    expect(screen.getByText(/LAN123/)).toBeInTheDocument();
    // 05:00Z = 12:00 VN
    expect(screen.getByText(/12:00/)).toBeInTheDocument();
  });

  it('affiliate thường -> nhãn Affiliate, FE KHÔNG tự suy kind', async () => {
    getCrmCustomerSource.mockResolvedValue({
      referrer: { id: 'r-8', fullName: 'Anh Nam', phone: null, kind: 'AFFILIATE' },
      codeUsed: 'NAM9',
      referredAt: '2026-08-14T02:00:00Z',
    });
    render(<UserDetailPage />);
    expect(await screen.findByText(/Affiliate/)).toBeInTheDocument();
    expect(screen.queryByText(/KOL/)).toBeNull();
  });

  it('lỗi tải Nguồn khách -> hiện chữ lỗi trên khối, không vỡ trang', async () => {
    getCrmCustomerSource.mockRejectedValueOnce(new Error('toang'));
    render(<UserDetailPage />);
    expect(await screen.findByText(/Không tải được/)).toBeInTheDocument();
    expect(screen.getByText('Khách A')).toBeInTheDocument();
  });

  // Vết đọc chỉ ghi cho hồ sơ KHÁCH, và ghi đúng bề mặt.
  it('ghi vết xem hồ sơ với surface users-detail, chỉ khi role=USER', async () => {
    render(<UserDetailPage />);
    await screen.findByText('Khách A');
    expect(logCrmProfileView).toHaveBeenCalledWith('u-1', 'users-detail');
  });

  it('hồ sơ tài xế KHÔNG ghi vết đọc', async () => {
    getAdminUserDetail.mockResolvedValue(mkUser({ role: 'DRIVER' }));
    render(<UserDetailPage />);
    await screen.findByText('Khách A');
    expect(logCrmProfileView).not.toHaveBeenCalled();
  });
});

describe('/users/detail — khối Nhãn & ghi chú (GĐ2)', () => {
  const mkTag = (over = {}) => ({
    id: 't1',
    tag: 'Khách VIP',
    createdAt: '2026-08-14T02:00:00Z',
    byAdminUserId: 'admin-1',
    byAdminName: 'Admin Một',
    ...over,
  });

  it('hiện nhãn đã gắn dạng chip và gỡ được', async () => {
    getCrmCustomerTags.mockResolvedValue([mkTag()]);
    render(<UserDetailPage />);
    await screen.findByText('Khách VIP');
    await userEvent.click(screen.getByRole('button', { name: /Gỡ nhãn Khách VIP/ }));
    await waitFor(() => expect(removeCrmCustomerTag).toHaveBeenCalledWith('u-1', 't1'));
  });

  // Nhãn đã gắn phải biến khỏi dropdown — chọn lại chỉ để nhận 409.
  it('nhãn đã gắn không còn trong danh mục chọn', async () => {
    getCrmCustomerTags.mockResolvedValue([mkTag()]);
    render(<UserDetailPage />);
    await screen.findByText('Khách VIP');
    await userEvent.click(screen.getByRole('combobox', { name: /Chọn nhãn/ }));
    expect(screen.queryByRole('option', { name: 'Khách VIP' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Hay huỷ chuyến' })).toBeInTheDocument();
  });

  it('ghi chú rỗng / chỉ khoảng trắng thì KHÔNG gửi request', async () => {
    render(<UserDetailPage />);
    const box = await screen.findByPlaceholderText(/Ghi chú về khách/);
    await userEvent.type(box, '   ');
    await userEvent.click(screen.getByRole('button', { name: /Ghi nhận/ }));
    expect(addCrmCustomerNote).not.toHaveBeenCalled();
  });

  it('ghi chú hợp lệ: gửi bản đã trim rồi nạp lại danh sách', async () => {
    render(<UserDetailPage />);
    const box = await screen.findByPlaceholderText(/Ghi chú về khách/);
    await userEvent.type(box, '  khách khó tính  ');
    await userEvent.click(screen.getByRole('button', { name: /Ghi nhận/ }));
    await waitFor(() =>
      expect(addCrmCustomerNote).toHaveBeenCalledWith('u-1', 'khách khó tính'),
    );
    // Nạp lại = getCrmCustomerNotes được gọi lần thứ hai.
    await waitFor(() => expect(getCrmCustomerNotes.mock.calls.length).toBeGreaterThan(1));
  });

  it('ghi chú hiển thị mới→cũ, kèm người ghi và mốc giờ VN', async () => {
    getCrmCustomerNotes.mockResolvedValue({
      data: [
        { id: 'n2', note: 'Mới hơn', createdAt: '2026-08-14T05:00:00Z', byAdminUserId: 'admin-1', byAdminName: 'Admin Một' },
        { id: 'n1', note: 'Cũ hơn', createdAt: '2026-08-13T05:00:00Z', byAdminUserId: 'admin-2', byAdminName: 'Admin Hai' },
      ],
      meta: { page: 1, limit: 20, total: 2 },
    });
    render(<UserDetailPage />);
    const items = await screen.findAllByTestId('crm-note');
    expect(items[0]).toHaveTextContent('Mới hơn');
    expect(items[0]).toHaveTextContent('12:00'); // 05:00Z = 12:00 VN
    expect(items[1]).toHaveTextContent('Cũ hơn');
  });

  /**
   * Nút xoá CHỈ hiện với ghi chú của CHÍNH MÌNH. BE vẫn là chốt cuối, nhưng hiện nút cho
   * ghi chú của người khác là mời admin bấm rồi ăn 403 — và ghi chú là thứ CSKH dùng để
   * đối chất, xoá được của nhau thì mất giá trị đó.
   */
  it('chỉ ghi chú của mình mới có nút Xoá', async () => {
    getCrmCustomerNotes.mockResolvedValue({
      data: [
        { id: 'n2', note: 'Của tôi', createdAt: '2026-08-14T05:00:00Z', byAdminUserId: 'admin-1', byAdminName: 'Admin Một' },
        { id: 'n1', note: 'Của người khác', createdAt: '2026-08-13T05:00:00Z', byAdminUserId: 'admin-2', byAdminName: 'Admin Hai' },
      ],
      meta: { page: 1, limit: 20, total: 2 },
    });
    render(<UserDetailPage />);
    const items = await screen.findAllByTestId('crm-note');
    expect(within(items[0]).getByRole('button', { name: /Xoá ghi chú/ })).toBeInTheDocument();
    expect(within(items[1]).queryByRole('button', { name: /Xoá ghi chú/ })).toBeNull();
  });

  it('lỗi tải khối -> hiện chữ lỗi, không vỡ trang', async () => {
    getCrmCustomerTags.mockRejectedValueOnce(new Error('toang'));
    render(<UserDetailPage />);
    expect(await screen.findByText(/Không tải được nhãn/)).toBeInTheDocument();
    expect(screen.getByText('Khách A')).toBeInTheDocument();
  });

  it('role=DRIVER: không có khối Nhãn & ghi chú, không gọi API nào của nó', async () => {
    getAdminUserDetail.mockResolvedValue(mkUser({ role: 'DRIVER' }));
    render(<UserDetailPage />);
    await screen.findByText('Khách A');
    expect(screen.queryByText(/Nhãn/)).toBeNull();
    expect(getCrmTagCatalog).not.toHaveBeenCalled();
    expect(getCrmCustomerNotes).not.toHaveBeenCalled();
  });
});

describe('/users/detail — khối Timeline (GĐ2)', () => {
  const mkItem = (over: Record<string, unknown> = {}) => ({
    id: 'i1',
    kind: 'NOTE',
    occurredAt: '2026-08-14T05:00:00Z',
    title: null,
    detail: null,
    meta: null,
    byAdminUserId: null,
    byAdminName: null,
    ...over,
  });

  /**
   * 🚨 Ca chốt của §13.2 ở hình dạng mới: MỖI DÒNG render theo `kind` của CHÍNH NÓ, không
   * theo công tắc/bộ lọc đang chọn. GĐ1 đã dính đúng bẫy này (suy pha theo TAB) và nó là
   * lỗi CHẶN.
   */
  it('trộn nhiều loại: mỗi DÒNG lấy nhãn theo kind của chính nó', async () => {
    getCrmCustomerTimeline.mockResolvedValue({
      data: [
        mkItem({ id: 'a', kind: 'CALL', meta: { status: 'CALLED' }, occurredAt: '2026-08-14T06:00:00Z' }),
        mkItem({ id: 'b', kind: 'TRIP_COMPLETED', occurredAt: '2026-08-14T05:00:00Z' }),
        mkItem({ id: 'c', kind: 'RATING', meta: { stars: 5 }, occurredAt: '2026-08-14T04:00:00Z' }),
        mkItem({ id: 'd', kind: 'NOTE', occurredAt: '2026-08-14T03:00:00Z' }),
      ],
      nextCursor: null,
    });
    render(<UserDetailPage />);
    const rows = await screen.findAllByTestId('crm-timeline-item');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Gọi được');
    expect(rows[1]).toHaveTextContent('Hoàn thành chuyến');
    expect(rows[2]).toHaveTextContent('5');
    expect(rows[3]).toHaveTextContent('Ghi chú CSKH');
    expect(rows[0]).toHaveTextContent('13:00'); // 06:00Z = 13:00 VN
  });

  it('bấm "Xem thêm" gửi cursor trang trước và NỐI vào danh sách', async () => {
    getCrmCustomerTimeline
      .mockResolvedValueOnce({ data: [mkItem({ id: 'a' })], nextCursor: 'CUR1' })
      .mockResolvedValueOnce({ data: [mkItem({ id: 'b' })], nextCursor: null });
    render(<UserDetailPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Xem thêm/ }));
    await waitFor(() =>
      expect(screen.getAllByTestId('crm-timeline-item')).toHaveLength(2),
    );
    expect(getCrmCustomerTimeline).toHaveBeenLastCalledWith(
      'u-1',
      expect.objectContaining({ cursor: 'CUR1' }),
    );
  });

  it('nextCursor null thì ẩn nút "Xem thêm"', async () => {
    getCrmCustomerTimeline.mockResolvedValue({ data: [mkItem()], nextCursor: null });
    render(<UserDetailPage />);
    await screen.findAllByTestId('crm-timeline-item');
    expect(screen.queryByRole('button', { name: /Xem thêm/ })).toBeNull();
  });

  // Rỗng ≠ lỗi: hai chữ khác nhau, nếu không admin không biết nên chờ hay nên báo.
  it('rỗng hiện "Chưa có hoạt động nào", lỗi hiện "Không tải được"', async () => {
    render(<UserDetailPage />);
    expect(await screen.findByText(/Chưa có hoạt động nào/)).toBeInTheDocument();
  });

  it('lỗi API hiện chữ lỗi riêng, không nhầm với rỗng', async () => {
    getCrmCustomerTimeline.mockRejectedValueOnce(new Error('toang'));
    render(<UserDetailPage />);
    expect(await screen.findByText(/Không tải được lịch sử/)).toBeInTheDocument();
  });

  it('mặc định KHÔNG gửi NOTIFICATION trong sources', async () => {
    render(<UserDetailPage />);
    await waitFor(() => expect(getCrmCustomerTimeline).toHaveBeenCalled());
    const arg = getCrmCustomerTimeline.mock.calls[0][1];
    expect(String(arg.sources)).not.toContain('NOTIFICATION');
  });

  it('bật công tắc thì gửi sources có NOTIFICATION và nạp lại TỪ ĐẦU', async () => {
    getCrmCustomerTimeline.mockResolvedValue({ data: [mkItem()], nextCursor: 'CUR1' });
    render(<UserDetailPage />);
    await screen.findAllByTestId('crm-timeline-item');

    await userEvent.click(screen.getByLabelText(/Hiện cả thông báo tự động/));
    await waitFor(() => {
      const last = getCrmCustomerTimeline.mock.calls.at(-1)![1];
      expect(String(last.sources)).toContain('NOTIFICATION');
      // Nạp lại từ đầu: KHÔNG được kèm cursor cũ, nếu không là trộn hai tập khác nhau.
      expect(last.cursor).toBeUndefined();
    });
  });

  it('role=DRIVER: không có timeline, không gọi API timeline', async () => {
    getAdminUserDetail.mockResolvedValue(mkUser({ role: 'DRIVER' }));
    render(<UserDetailPage />);
    await screen.findByText('Khách A');
    expect(screen.queryByText(/Lịch sử tương tác/)).toBeNull();
    expect(getCrmCustomerTimeline).not.toHaveBeenCalled();
  });
});

describe('/users/detail — khối Ticket (GĐ3)', () => {
  it('khách chưa khiếu nại -> hiện trạng thái rỗng, lọc đúng khách', async () => {
    render(<UserDetailPage />);
    expect(await screen.findByText(/Khách chưa có khiếu nại nào/)).toBeInTheDocument();
    expect(getCrmTickets).toHaveBeenCalledWith(expect.objectContaining({ customerUserId: 'u-1' }));
  });

  it('có ticket -> hiện mã, tiêu đề, trạng thái', async () => {
    getCrmTickets.mockResolvedValue({
      data: [
        {
          id: 'tk-1', code: 'TK-1000', customerUserId: 'u-1', bookingId: null, driverId: null,
          category: 'LOST_ITEM', severity: 'NORMAL', status: 'OPEN', title: 'Quên ví',
          description: null, assigneeAdminId: null, source: 'ZALO_GROUP', reportedAt: null,
          slaRespondDueAt: '2999-01-01T00:00:00Z', slaResolveDueAt: '2999-01-01T00:00:00Z',
          firstRespondedAt: null, resolvedAt: null, resolution: null,
          compensationAmount: '150000', createdByAdminId: 'a', createdAt: '2026-08-18T02:00:00Z',
          updatedAt: '2026-08-18T02:00:00Z',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    render(<UserDetailPage />);
    const items = await screen.findAllByTestId('crm-customer-ticket');
    expect(items[0]).toHaveTextContent('TK-1000');
    expect(items[0]).toHaveTextContent('Quên ví');
    expect(items[0]).toHaveTextContent('150.000');
  });

  it('role=DRIVER: không có khối Ticket, không gọi API', async () => {
    getAdminUserDetail.mockResolvedValue(mkUser({ role: 'DRIVER' }));
    render(<UserDetailPage />);
    await screen.findByText('Khách A');
    expect(screen.queryByText(/Ticket khiếu nại/)).toBeNull();
    expect(getCrmTickets).not.toHaveBeenCalled();
  });
});

/**
 * Trang này KHÔNG ghim TZ ở vitest.config, mà máy dev đang ở `Asia/Ho_Chi_Minh` → mọi ca
 * giờ ở trên đều có thể XANH GIẢ. Ghim một múi giờ không-VN không-UTC để chứng minh hiển
 * thị độc lập múi giờ trình duyệt.
 */
describe('/users/detail — độc lập múi giờ trình duyệt', () => {
  const OLD = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = OLD;
  });

  it('vẫn ra 09:00 VN khi trình duyệt ở New York', async () => {
    render(<UserDetailPage />);
    expect(await screen.findByText(/09:00/)).toBeInTheDocument();
  });
});
