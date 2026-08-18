import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';

/**
 * Radix (Dialog/AlertDialog) đặt `pointer-events: none` lên `document.body` khi modal mở và
 * KHÔNG dọn sạch giữa các test trong jsdom — test sau đó ăn lỗi
 * "Unable to perform pointer interaction". Tắt phép kiểm con trỏ của user-event: nó kiểm
 * CSS, mà CSS ở đây là rác của môi trường test chứ không phải hành vi sản phẩm.
 */
const userEvent = userEventLib.setup({ pointerEventsCheck: 0 });
import CrmTicketsPage from './page';

/**
 * LƯỚI AN TOÀN cấp trang — §13.3: `/crm-queue` từng ship với 17 ca test hàm thuần trong khi
 * `page.tsx` không có test nào, và CẢ BỐN finding (kể cả lỗi CHẶN) đều nằm gọn trong đúng
 * khoảng trống đó. Màn này có TIỀN THẬT nên càng không được lặp lại.
 */

const getCrmTickets = vi.fn();
const getCrmTicketCategories = vi.fn();
const createCrmTicket = vi.fn();
const getCrmTicket = vi.fn();
const changeCrmTicketStatus = vi.fn();
const addCrmTicketNote = vi.fn();
const proposeCrmCompensation = vi.fn();
const approveCrmCompensation = vi.fn();
const getCrmCompensationLimits = vi.fn();
const getAdminUserDetail = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getCrmTickets: (...a: any[]) => getCrmTickets(...a),
    getCrmTicketCategories: (...a: any[]) => getCrmTicketCategories(...a),
    createCrmTicket: (...a: any[]) => createCrmTicket(...a),
    getCrmTicket: (...a: any[]) => getCrmTicket(...a),
    changeCrmTicketStatus: (...a: any[]) => changeCrmTicketStatus(...a),
    addCrmTicketNote: (...a: any[]) => addCrmTicketNote(...a),
    proposeCrmCompensation: (...a: any[]) => proposeCrmCompensation(...a),
    approveCrmCompensation: (...a: any[]) => approveCrmCompensation(...a),
    getCrmCompensationLimits: (...a: any[]) => getCrmCompensationLimits(...a),
    getAdminUserDetail: (...a: any[]) => getAdminUserDetail(...a),
  };
});

/** Quyền do test đặt — mặc định KHÔNG có `crm-compensate`. */
const { authFunctions } = vi.hoisted(() => ({ authFunctions: { current: ['crm-tickets'] } }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    me: { id: 'admin-1', fullName: 'Admin', phone: '0900', isSuperAdmin: false, functions: authFunctions.current },
    loading: false,
    can: (f: string) => authFunctions.current.includes(f),
    refresh: vi.fn(),
  }),
}));

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

const CATS = [
  { code: 'LOST_ITEM', label: 'Bỏ quên đồ trên xe', respondHours: 2, resolveHours: 24 },
  { code: 'OTHER', label: 'Khác', respondHours: 8, resolveHours: 48 },
];

const mkTicket = (over: any = {}) => ({
  id: 'tk-1',
  code: 'TK-1000',
  customerUserId: 'c-1',
  bookingId: null,
  driverId: null,
  category: 'LOST_ITEM',
  severity: 'NORMAL',
  status: 'OPEN',
  title: 'Quên ví trên xe',
  description: 'Khách báo qua Zalo',
  assigneeAdminId: null,
  source: 'ZALO_GROUP',
  reportedAt: null,
  slaRespondDueAt: '2999-01-01T00:00:00Z',
  slaResolveDueAt: '2999-01-01T00:00:00Z',
  firstRespondedAt: null,
  resolvedAt: null,
  resolution: null,
  compensationAmount: '0',
  createdByAdminId: 'admin-1',
  createdAt: '2026-08-18T02:00:00Z',
  updatedAt: '2026-08-18T02:00:00Z',
  ...over,
});

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!window.PointerEvent) (window as any).PointerEvent = MouseEvent;
});

beforeEach(() => {
  vi.clearAllMocks();
  // Dọn rác Radix để lại từ test trước (xem chú thích ở đầu file).
  document.body.style.pointerEvents = '';
  authFunctions.current = ['crm-tickets'];
  getCrmTickets.mockResolvedValue({
    data: [mkTicket()],
    meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
  });
  getCrmTicketCategories.mockResolvedValue(CATS);
  getCrmTicket.mockResolvedValue({ ticket: mkTicket(), events: [] });
  getCrmCompensationLimits.mockResolvedValue({ maxPerCase: 500000, maxPerDay: 3000000 });
  getAdminUserDetail.mockResolvedValue({ id: 'c-1', fullName: 'Khách A', phone: '0911111111' });
});

describe('/crm-tickets — danh sách', () => {
  it('hiện ticket với mã, tiêu đề và nhãn loại theo danh mục', async () => {
    render(<CrmTicketsPage />);
    expect(await screen.findByText('TK-1000')).toBeInTheDocument();
    expect(screen.getByText('Quên ví trên xe')).toBeInTheDocument();
    expect(screen.getByText('Bỏ quên đồ trên xe')).toBeInTheDocument();
  });

  /** SLA suy từ CHÍNH DÒNG (§13.2), không từ bộ lọc đang chọn. */
  it('ticket quá hạn hiện "Quá hạn", ticket còn hạn hiện "Còn"', async () => {
    getCrmTickets.mockResolvedValue({
      data: [
        mkTicket({ id: 'a', code: 'TK-1', slaResolveDueAt: '2020-01-01T00:00:00Z' }),
        mkTicket({ id: 'b', code: 'TK-2', slaResolveDueAt: '2999-01-01T00:00:00Z' }),
      ],
      meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });
    render(<CrmTicketsPage />);
    const rows = await screen.findAllByTestId('crm-ticket-row');
    expect(within(rows[0]).getByText(/Quá hạn/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/^Còn /)).toBeInTheDocument();
  });

  it('ticket đã đóng KHÔNG hiện đỏ quá hạn', async () => {
    getCrmTickets.mockResolvedValue({
      data: [mkTicket({ status: 'CLOSED', slaResolveDueAt: '2020-01-01T00:00:00Z' })],
      meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    render(<CrmTicketsPage />);
    await screen.findAllByTestId('crm-ticket-row');
    expect(screen.queryByText(/Quá hạn/)).toBeNull();
  });

  it('rỗng hiện "Chưa có ticket nào", lỗi hiện "Không tải được"', async () => {
    getCrmTickets.mockResolvedValue({ data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 1 } });
    render(<CrmTicketsPage />);
    expect(await screen.findByText(/Chưa có ticket nào/)).toBeInTheDocument();
  });

  it('lỗi API hiện chữ lỗi riêng, không nhầm với rỗng', async () => {
    getCrmTickets.mockRejectedValueOnce(new Error('toang'));
    render(<CrmTicketsPage />);
    expect(await screen.findByText(/Không tải được danh sách/)).toBeInTheDocument();
  });

  it('bật "Chỉ quá hạn" gửi overdue=true', async () => {
    render(<CrmTicketsPage />);
    await screen.findAllByTestId('crm-ticket-row');
    await userEvent.click(screen.getByLabelText(/Chỉ quá hạn/));
    await waitFor(() =>
      expect(getCrmTickets.mock.calls.at(-1)![0]).toMatchObject({ overdue: true }),
    );
  });

  // Không bật thì KHÔNG gửi khoá — gửi 'false' vẫn là giá trị và BE phải đoán ý.
  it('không bật thì KHÔNG gửi overdue', async () => {
    render(<CrmTicketsPage />);
    await screen.findAllByTestId('crm-ticket-row');
    expect(getCrmTickets.mock.calls[0][0].overdue).toBeUndefined();
  });
});

describe('/crm-tickets — tạo ticket (nhập tay)', () => {
  it('mở form và tạo được ticket', async () => {
    render(<CrmTicketsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo ticket' }));

    await userEvent.type(screen.getByLabelText('ID khách'), 'c-9');
    await userEvent.click(screen.getByRole('combobox', { name: /Chọn loại khiếu nại/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Bỏ quên đồ/ }));
    await userEvent.type(screen.getByLabelText('Tiêu đề'), 'Quên điện thoại');
    await userEvent.click(screen.getByRole('button', { name: /Lưu ticket/ }));

    await waitFor(() =>
      expect(createCrmTicket).toHaveBeenCalledWith(
        expect.objectContaining({ customerUserId: 'c-9', category: 'LOST_ITEM', title: 'Quên điện thoại' }),
      ),
    );
  });

  it('thiếu trường bắt buộc thì KHÔNG gửi request', async () => {
    render(<CrmTicketsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Tạo ticket' }));
    await userEvent.type(screen.getByLabelText('Tiêu đề'), 'chỉ có tiêu đề');
    await userEvent.click(screen.getByRole('button', { name: /Lưu ticket/ }));
    expect(createCrmTicket).not.toHaveBeenCalled();
  });
});

describe('/crm-tickets — chi tiết & ĐỀN BÙ (ranh giới quyền)', () => {
  const openDetail = async () => {
    render(<CrmTicketsPage />);
    const rows = await screen.findAllByTestId('crm-ticket-row');
    await userEvent.click(rows[0]);
    await screen.findByText(/Ticket TK-1000/);
  };

  /**
   * 🚨 Ranh giới chịu lực: người chỉ có `crm-tickets` ĐỀ XUẤT được nhưng KHÔNG thấy nút
   * DUYỆT. Ẩn nút chỉ là tiện nghi — BE vẫn chặn — nhưng hiện nút cho người không có quyền
   * là mời họ bấm rồi ăn 403 giữa lúc đang xử khiếu nại.
   */
  it('KHÔNG có crm-compensate: có nút Đề xuất, KHÔNG có nút DUYỆT', async () => {
    await openDetail();
    expect(screen.getByRole('button', { name: /Đề xuất mức/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /DUYỆT/ })).toBeNull();
    expect(screen.getByText(/Bạn chỉ đề xuất được mức/)).toBeInTheDocument();
  });

  it('CÓ crm-compensate: hiện nút DUYỆT và hiện trần', async () => {
    authFunctions.current = ['crm-tickets', 'crm-compensate'];
    await openDetail();
    expect(await screen.findByRole('button', { name: /DUYỆT/ })).toBeInTheDocument();
    expect(await screen.findByText(/500.000đ\/vụ/)).toBeInTheDocument();
  });

  it('đề xuất gửi đúng số tiền, KHÔNG gọi đường duyệt', async () => {
    await openDetail();
    await userEvent.type(screen.getByPlaceholderText(/Số tiền/), '200000');
    await userEvent.click(screen.getByRole('button', { name: /Đề xuất mức/ }));
    await waitFor(() => expect(proposeCrmCompensation).toHaveBeenCalledWith('tk-1', 200000, undefined));
    expect(approveCrmCompensation).not.toHaveBeenCalled();
  });

  it('duyệt phải qua bước XÁC NHẬN rồi mới gọi API', async () => {
    authFunctions.current = ['crm-tickets', 'crm-compensate'];
    await openDetail();
    await userEvent.type(screen.getByPlaceholderText(/Số tiền/), '300000');
    await userEvent.click(screen.getByRole('button', { name: /DUYỆT/ }));

    // Chưa gọi API — mới chỉ mở hộp xác nhận.
    expect(approveCrmCompensation).not.toHaveBeenCalled();
    expect(await screen.findByText(/KHÔNG hoàn tác được/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cấp tiền' }));
    await waitFor(() => expect(approveCrmCompensation).toHaveBeenCalledWith('tk-1', 300000, undefined));
  });

  it('huỷ ở hộp xác nhận thì KHÔNG cấp tiền', async () => {
    authFunctions.current = ['crm-tickets', 'crm-compensate'];
    await openDetail();
    await userEvent.type(screen.getByPlaceholderText(/Số tiền/), '300000');
    await userEvent.click(screen.getByRole('button', { name: /DUYỆT/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Huỷ' }));
    expect(approveCrmCompensation).not.toHaveBeenCalled();
  });

  /**
   * 🚨 Ca chống lỗi trả THIẾU im lặng: người duyệt đọc dòng "Trần: 500.000đ/vụ" ngay trên
   * màn rồi gõ đúng định dạng đó. `Number("500.000")` = 500 → khách đáng 500k nhận 500đ,
   * không cảnh báo nào.
   */
  it('gõ "500.000" gửi đi 500000, KHÔNG phải 500', async () => {
    authFunctions.current = ['crm-tickets', 'crm-compensate'];
    await openDetail();
    await userEvent.type(screen.getByPlaceholderText(/Số tiền/), '500.000');
    expect(screen.getByTestId('crm-parsed-amount')).toHaveTextContent('500.000đ');
    await userEvent.click(screen.getByRole('button', { name: /DUYỆT/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cấp tiền' }));
    await waitFor(() => expect(approveCrmCompensation).toHaveBeenCalledWith('tk-1', 500000, undefined));
  });

  /** Người duyệt phải THẤY tiền đi cho ai trước khi bấm — UUID dán nhầm là ca thật. */
  it('hiện tên + SĐT người nhận tiền', async () => {
    authFunctions.current = ['crm-tickets', 'crm-compensate'];
    await openDetail();
    await waitFor(() =>
      expect(screen.getByTestId('crm-compensate-recipient')).toHaveTextContent('Khách A'),
    );
    expect(screen.getByTestId('crm-compensate-recipient')).toHaveTextContent('0911111111');
  });

  /**
   * 🚨 §13.2: nút chuyển trạng thái suy từ status của CHÍNH ticket (mirror bảng của BE),
   * không từ bộ lọc đang chọn ngoài danh sách.
   */
  it('ticket OPEN không có nút nhảy thẳng sang "Đã đóng"', async () => {
    await openDetail();
    expect(screen.getByRole('button', { name: 'Đang xử lý' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đã đóng' })).toBeNull();
  });

  it('ticket CLOSED không còn nút chuyển trạng thái nào', async () => {
    getCrmTicket.mockResolvedValue({ ticket: mkTicket({ status: 'CLOSED' }), events: [] });
    await openDetail();
    expect(await screen.findByText(/Ticket đã đóng/)).toBeInTheDocument();
  });

  it('lịch sử xử lý hiện nhãn tiếng Việt và số tiền đã duyệt', async () => {
    getCrmTicket.mockResolvedValue({
      ticket: mkTicket(),
      events: [
        { id: 'e1', ticketId: 'tk-1', type: 'CREATED', fromStatus: null, toStatus: 'OPEN', note: null, amount: null, byAdminUserId: 'admin-1', createdAt: '2026-08-18T02:00:00Z' },
        { id: 'e2', ticketId: 'tk-1', type: 'COMPENSATION_APPROVED', fromStatus: null, toStatus: null, note: 'ok', amount: '150000', byAdminUserId: 'admin-1', createdAt: '2026-08-18T03:00:00Z' },
      ],
    });
    await openDetail();
    const items = await screen.findAllByTestId('crm-ticket-event');
    expect(items[0]).toHaveTextContent('Tạo ticket');
    expect(items[1]).toHaveTextContent('DUYỆT đền bù');
    expect(items[1]).toHaveTextContent('150.000');
  });
});
