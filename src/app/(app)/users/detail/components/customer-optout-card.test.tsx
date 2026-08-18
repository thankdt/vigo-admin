import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import { CustomerOptoutCard } from './customer-optout-card';

const userEvent = userEventLib.setup({ pointerEventsCheck: 0 });

const getCrmOptoutStatus = vi.fn();
const setCrmOptout = vi.fn();
const removeCrmOptout = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getCrmOptoutStatus: (...a: any[]) => getCrmOptoutStatus(...a),
    setCrmOptout: (...a: any[]) => setCrmOptout(...a),
    removeCrmOptout: (...a: any[]) => removeCrmOptout(...a),
  };
});

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

const can = vi.fn();
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ can }) }));

const USER = 'u-1';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.style.pointerEvents = '';
  can.mockReturnValue(true);
  getCrmOptoutStatus.mockResolvedValue({ optedOut: false, reason: null, since: null });
  setCrmOptout.mockResolvedValue({ ok: true });
  removeCrmOptout.mockResolvedValue({ ok: true });
});

/**
 * 🚨 Khối này là ĐƯỜNG VÀO DUY NHẤT của danh sách chặn. Backend đã có bảng + nhánh bỏ qua
 * `OPTED_OUT`, nhưng không màn hình nào ghi vào bảng ⇒ bảng rỗng vĩnh viễn ⇒ chốt chặn chỉ
 * là trang trí, và khách nhắn "đừng gửi nữa" vẫn tiếp tục nhận tin.
 */
describe('CustomerOptoutCard — ghi được yêu cầu ngừng nhận của khách', () => {
  it('khách đang nhận bình thường -> có nút ngừng gửi', async () => {
    render(<CustomerOptoutCard userId={USER} />);
    expect(await screen.findByTestId('crm-optout-off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ngừng gửi tin chăm sóc/ })).toBeInTheDocument();
  });

  it('bấm ngừng gửi -> gọi API kèm lý do', async () => {
    render(<CustomerOptoutCard userId={USER} />);
    await screen.findByTestId('crm-optout-off');
    await userEvent.type(screen.getByRole('textbox'), 'khách nhắn Zalo');
    await userEvent.click(screen.getByRole('button', { name: /Ngừng gửi tin chăm sóc/ }));
    await waitFor(() => expect(setCrmOptout).toHaveBeenCalledWith(USER, 'khách nhắn Zalo'));
  });

  it('không nhập lý do vẫn ghi nhận được (lý do không bắt buộc)', async () => {
    render(<CustomerOptoutCard userId={USER} />);
    await screen.findByTestId('crm-optout-off');
    await userEvent.click(screen.getByRole('button', { name: /Ngừng gửi tin chăm sóc/ }));
    await waitFor(() => expect(setCrmOptout).toHaveBeenCalledWith(USER, undefined));
  });

  it('ghi xong đọc lại trạng thái, không tự đoán', async () => {
    render(<CustomerOptoutCard userId={USER} />);
    await screen.findByTestId('crm-optout-off');
    getCrmOptoutStatus.mockResolvedValue({
      optedOut: true, reason: 'khách nhắn Zalo', since: '2026-08-18T03:00:00.000Z',
    });
    await userEvent.click(screen.getByRole('button', { name: /Ngừng gửi tin chăm sóc/ }));
    expect(await screen.findByTestId('crm-optout-on')).toBeInTheDocument();
  });
});

describe('CustomerOptoutCard — đang bị chặn', () => {
  beforeEach(() => {
    getCrmOptoutStatus.mockResolvedValue({
      optedOut: true, reason: 'khách nhắn Zalo', since: '2026-08-18T03:00:00.000Z',
    });
  });

  it('nói rõ đang chặn, kèm lý do, và nói rõ noti chuyến KHÔNG bị ảnh hưởng', async () => {
    render(<CustomerOptoutCard userId={USER} />);
    const on = await screen.findByTestId('crm-optout-on');
    expect(on).toHaveTextContent(/NGỪNG nhận/);
    expect(screen.getByText(/khách nhắn Zalo/)).toBeInTheDocument();
    expect(screen.getByText(/chuyến đi KHÔNG bị ảnh hưởng/i)).toBeInTheDocument();
  });

  /**
   * 🚨 Câu chữ phải nói ĐÚNG phạm vi. Trên hệ thống có HAI thứ cùng tên "chiến dịch", và
   * cái kia (tự tặng voucher) KHÔNG đọc bảng chặn này. Hứa quá thì CSKH nói với khách "đã
   * tắt rồi", khách vẫn nhận tin, và lần sau họ không tin gì nữa.
   */
  it('nói rõ chỉ áp cho Chiến dịch chăm sóc, và cảnh báo tin voucher chưa theo', async () => {
    render(<CustomerOptoutCard userId={USER} />);
    await screen.findByTestId('crm-optout-on');
    expect(screen.getByText(/Chiến dịch chăm sóc/)).toBeInTheDocument();
    expect(screen.getByText(/tự tặng voucher/)).toBeInTheDocument();
  });

  it('không còn nút ngừng gửi (đã chặn rồi)', async () => {
    render(<CustomerOptoutCard userId={USER} />);
    await screen.findByTestId('crm-optout-on');
    expect(screen.queryByRole('button', { name: /Ngừng gửi tin chăm sóc/ })).toBeNull();
  });

  /**
   * Bất đối xứng CÓ CHỦ ĐÍCH: bật chặn cần `users` (CSKH tuyến đầu nhận yêu cầu của khách),
   * bỏ chặn cần `crm-campaigns`. Tôn trọng khách phải dễ, cho phép gửi lại phải khó.
   */
  it('người KHÔNG có quyền chiến dịch: không thấy nút cho phép gửi lại', async () => {
    can.mockReturnValue(false);
    render(<CustomerOptoutCard userId={USER} />);
    await screen.findByTestId('crm-optout-on');
    expect(screen.queryByRole('button', { name: /Cho phép gửi lại/ })).toBeNull();
    expect(screen.getByText(/Cần quyền/)).toBeInTheDocument();
  });

  it('người có quyền chiến dịch: bỏ chặn gọi đúng API', async () => {
    render(<CustomerOptoutCard userId={USER} />);
    await screen.findByTestId('crm-optout-on');
    await userEvent.click(screen.getByRole('button', { name: /Cho phép gửi lại/ }));
    await waitFor(() => expect(removeCrmOptout).toHaveBeenCalledWith(USER));
  });

  it('gate đọc đúng key crm-campaigns', async () => {
    render(<CustomerOptoutCard userId={USER} />);
    await screen.findByTestId('crm-optout-on');
    expect(can).toHaveBeenCalledWith('crm-campaigns');
  });
});

describe('CustomerOptoutCard — hỏng thì nói hỏng', () => {
  /** Im lặng ở đây nghĩa là người dùng tưởng đã chặn thành công trong khi chưa. */
  it('đọc trạng thái lỗi -> báo lỗi, KHÔNG hiện "đang nhận bình thường"', async () => {
    getCrmOptoutStatus.mockRejectedValue(new Error('403'));
    render(<CustomerOptoutCard userId={USER} />);
    expect(await screen.findByText(/Không đọc được trạng thái/)).toBeInTheDocument();
    expect(screen.queryByTestId('crm-optout-off')).toBeNull();
  });
});
