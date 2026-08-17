import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getAdminUserDetail: (...a: any[]) => getAdminUserDetail(...a),
    getBookings: (...a: any[]) => getBookings(...a),
    adminGetUserReferralStats: (...a: any[]) => adminGetUserReferralStats(...a),
    getCrmCustomerSource: (...a: any[]) => getCrmCustomerSource(...a),
    logCrmProfileView: (...a: any[]) => logCrmProfileView(...a),
  };
});

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

beforeEach(() => {
  vi.clearAllMocks();
  getAdminUserDetail.mockResolvedValue(mkUser());
  getBookings.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 1 });
  adminGetUserReferralStats.mockResolvedValue(null);
  getCrmCustomerSource.mockResolvedValue(null);
  logCrmProfileView.mockResolvedValue(undefined);
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
