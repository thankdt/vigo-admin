import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import CrmAccountsPage from './page';

const userEvent = userEventLib.setup({ pointerEventsCheck: 0 });

const getCrmAccounts = vi.fn();
const createCrmAccount = vi.fn();
const getCrmAccount = vi.fn();
const changeCrmAccountStage = vi.fn();
const updateCrmAccountTerms = vi.fn();
const addCrmAccountMember = vi.fn();
const getCrmAccountUsage = vi.fn();
const removeCrmAccountMember = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getCrmAccounts: (...a: any[]) => getCrmAccounts(...a),
    createCrmAccount: (...a: any[]) => createCrmAccount(...a),
    getCrmAccount: (...a: any[]) => getCrmAccount(...a),
    changeCrmAccountStage: (...a: any[]) => changeCrmAccountStage(...a),
    updateCrmAccountTerms: (...a: any[]) => updateCrmAccountTerms(...a),
    addCrmAccountMember: (...a: any[]) => addCrmAccountMember(...a),
    getCrmAccountUsage: (...a: any[]) => getCrmAccountUsage(...a),
    removeCrmAccountMember: (...a: any[]) => removeCrmAccountMember(...a),
  };
});

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

const mkAcc = (over: any = {}) => ({
  id: 'a1', name: 'Cty A', taxCode: '0101', stage: 'LEAD', ownerAdminId: null,
  contactName: null, contactPhone: null, contactEmail: null,
  discountPercent: null, paymentTermDays: null, contractNote: null,
  createdAt: '2026-08-18T02:00:00Z', updatedAt: '2026-08-18T02:00:00Z', ...over,
});

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!window.PointerEvent) (window as any).PointerEvent = MouseEvent;
});

beforeEach(() => {
  vi.clearAllMocks();
  document.body.style.pointerEvents = '';
  getCrmAccounts.mockResolvedValue([mkAcc()]);
  getCrmAccount.mockResolvedValue({
    account: mkAcc(),
    members: [
      { id: 'm1', userId: 'u1', note: null, fullName: 'Nhân viên A', phone: '09*****78', removedAt: null },
    ],
    events: [{ id: 'e1', type: 'CREATED', fromStage: null, toStage: 'LEAD', note: null, createdAt: '2026-08-18T02:00:00Z' }],
  });
  getCrmAccountUsage.mockResolvedValue({ trips: 12, revenue: 3600000, from: 'x', to: 'y' });
  removeCrmAccountMember.mockResolvedValue({});
});

describe('/crm-accounts', () => {
  it('hiện công ty kèm giai đoạn và MST', async () => {
    render(<CrmAccountsPage />);
    const rows = await screen.findAllByTestId('crm-account-row');
    expect(rows[0]).toHaveTextContent('Cty A');
    expect(rows[0]).toHaveTextContent('Tiềm năng');
    expect(rows[0]).toHaveTextContent('0101');
  });

  it('thiếu tên thì không thêm được', async () => {
    render(<CrmAccountsPage />);
    await screen.findAllByTestId('crm-account-row');
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled();
  });

  /**
   * 🚨 Nút giai đoạn suy từ stage của CHÍNH hồ sơ (mirror bảng BE), không từ bộ lọc — bẫy
   * §13.2. LEAD chỉ đi được sang NEGOTIATING/CHURNED.
   */
  it('LEAD không có nút nhảy thẳng sang "Đang hoạt động"', async () => {
    render(<CrmAccountsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Chi tiết' }));
    await screen.findByTestId('crm-account-detail');
    expect(screen.getByRole('button', { name: 'Đang đàm phán' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đang hoạt động' })).toBeNull();
  });

  /** CHURNED quay lại được — CỐ Ý khác ticket CLOSED. */
  it('CHURNED vẫn có đường quay lại Đang hoạt động', async () => {
    getCrmAccount.mockResolvedValue({
      account: mkAcc({ stage: 'CHURNED' }),
      members: [],
      events: [],
    });
    render(<CrmAccountsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Chi tiết' }));
    expect(await screen.findByRole('button', { name: 'Đang hoạt động' })).toBeInTheDocument();
  });

  it('hiện nhân viên đặt xe và lịch sử', async () => {
    render(<CrmAccountsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Chi tiết' }));
    expect(await screen.findByTestId('crm-account-member')).toHaveTextContent('Nhân viên A');
    expect(screen.getByTestId('crm-account-event')).toHaveTextContent('Tạo hồ sơ');
  });

  it('gán nhân viên gọi đúng API', async () => {
    render(<CrmAccountsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Chi tiết' }));
    await userEvent.type(await screen.findByLabelText('ID nhân viên'), 'u-9');
    await userEvent.click(screen.getByRole('button', { name: 'Gán nhân viên' }));
    await waitFor(() => expect(addCrmAccountMember).toHaveBeenCalledWith('a1', 'u-9'));
  });

  it('xem chuyến 30 ngày hiện số chuyến và doanh thu', async () => {
    render(<CrmAccountsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Chi tiết' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Xem chuyến 30 ngày' }));
    expect(await screen.findByTestId('crm-account-usage')).toHaveTextContent('3.600.000đ');
  });

  it('lỗi tải hiện chữ lỗi riêng, không nhầm với rỗng', async () => {
    getCrmAccounts.mockRejectedValueOnce(new Error('toang'));
    render(<CrmAccountsPage />);
    expect(await screen.findByText(/Không tải được danh sách công ty/)).toBeInTheDocument();
  });
});

describe('/crm-accounts — hỏng thì NÓI hỏng, đừng quay mãi', () => {
  /**
   * 🚨 Bản đầu là `if (loading || !account)`: API hỏng thì `loading=false` nhưng `account`
   * vẫn null ⇒ khối chi tiết đứng ở "Đang tải…" MÃI MÃI, toast thì tự tắt. Admin quay 30
   * giây rồi đi báo "hệ thống treo". Ca 403 (bị rút quyền) cũng ra đúng cái spinner đó.
   */
  it('lỗi tải hồ sơ -> hiện chữ lỗi, KHÔNG kẹt ở "Đang tải…"', async () => {
    getCrmAccount.mockRejectedValue(new Error('toang'));
    render(<CrmAccountsPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Chi tiết' }))[0]);
    expect(await screen.findByTestId('crm-account-detail-failed')).toBeInTheDocument();
    expect(screen.queryByText('Đang tải…')).toBeNull();
  });

  it('403 cũng nói được là vấn đề quyền', async () => {
    getCrmAccount.mockRejectedValue({ errorCode: 'AUTH_003' });
    render(<CrmAccountsPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Chi tiết' }))[0]);
    expect(await screen.findByTestId('crm-account-detail-failed')).toHaveTextContent(/quyền/);
  });
});

describe('/crm-accounts — gỡ nhân viên gán nhầm', () => {
  /**
   * 🚨 Không có nút này thì gán nhầm UUID là KẸT VĨNH VIỄN: user bị UNIQUE khoá vào công ty
   * sai, gán sang công ty đúng thì API trả "đã thuộc công ty khác", mà đường gỡ chỉ có ở
   * API. Lối thoát duy nhất là gọi API tay hoặc sửa DB.
   */
  it('mỗi nhân viên có nút Gỡ, bấm thì gọi đúng API', async () => {
    render(<CrmAccountsPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Chi tiết' }))[0]);
    await screen.findByTestId('crm-account-member');
    await userEvent.click(screen.getByRole('button', { name: /Gỡ Nhân viên A/ }));
    await waitFor(() => expect(removeCrmAccountMember).toHaveBeenCalledWith('a1', 'm1'));
  });

  /** Người đã gỡ vẫn HIỆN (xoá mềm) — để báo cáo kỳ cũ giải thích được, nhưng không gỡ lại. */
  it('người đã gỡ hiện gạch ngang và KHÔNG còn nút Gỡ', async () => {
    getCrmAccount.mockResolvedValue({
      account: mkAcc(),
      members: [
        { id: 'm1', userId: 'u1', note: null, fullName: 'Nhân viên A', phone: '09*****78', removedAt: '2026-08-18T02:00:00Z' },
      ],
      events: [],
    });
    render(<CrmAccountsPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Chi tiết' }))[0]);
    expect(await screen.findByTestId('crm-account-member')).toHaveTextContent('đã gỡ');
    expect(screen.queryByRole('button', { name: /^Gỡ / })).toBeNull();
  });
});

describe('/crm-accounts — điều khoản giá không được trông như ô rỗng', () => {
  /** Placeholder trông y hệt ô rỗng ⇒ người dùng tưởng "chưa set" và gõ đè điều khoản đã đàm phán. */
  it('in chiết khấu hiện hành thành CHỮ, không chỉ để ở placeholder', async () => {
    getCrmAccount.mockResolvedValue({
      account: mkAcc({ discountPercent: '15.00' }),
      members: [],
      events: [],
    });
    render(<CrmAccountsPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Chi tiết' }))[0]);
    expect(await screen.findByTestId('crm-account-discount-now')).toHaveTextContent('15.00%');
  });

  it('chưa đặt chiết khấu thì nói "chưa đặt", không để trống', async () => {
    render(<CrmAccountsPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Chi tiết' }))[0]);
    expect(await screen.findByTestId('crm-account-discount-now')).toHaveTextContent('chưa đặt');
  });
});

describe('/crm-accounts — số tiền phải nói rõ là tiền gì', () => {
  /**
   * Backend đổi sang `SUM(finalPrice)` (tiền khách trả, gồm VAT) thay vì `SUM(price)`
   * (subtotal trước khuyến mại/VAT). Con số này đi thẳng vào đối soát công nợ nên nhãn phải
   * nói rõ, nếu không kế toán vẫn phải đoán nó là số nào.
   */
  it('nhãn nói rõ "tiền khách trả (gồm VAT)"', async () => {
    render(<CrmAccountsPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Chi tiết' }))[0]);
    await userEvent.click(await screen.findByRole('button', { name: /Xem chuyến 30 ngày/ }));
    expect(await screen.findByTestId('crm-account-usage')).toHaveTextContent(
      /tiền khách trả \(gồm VAT\)/,
    );
  });
});
