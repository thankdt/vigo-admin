import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneCell } from './phone-cell';

const revealCrmCustomerPhone = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    revealCrmCustomerPhone: (...a: any[]) => revealCrmCustomerPhone(...a),
  };
});

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

beforeEach(() => {
  vi.clearAllMocks();
  revealCrmCustomerPhone.mockResolvedValue({ phone: '0912345678' });
});

describe('PhoneCell', () => {
  /**
   * Khẳng định chuỗi ĐẦY ĐỦ VẮNG MẶT, không chỉ khẳng định chuỗi che có mặt — nếu component
   * lỡ render cả hai thì cách kiểm sau vẫn xanh trong khi số vẫn lộ.
   */
  it('mặc định hiện chuỗi đã che, KHÔNG có số đầy đủ trong DOM', () => {
    render(<PhoneCell userId="u-1" phone="0912****78" surface="users-list" />);
    expect(screen.getByText('0912****78')).toBeInTheDocument();
    expect(screen.queryByText('0912345678')).toBeNull();
  });

  it('bấm "Hiện số" gọi đúng endpoint với đúng id + surface, rồi hiện số đầy đủ', async () => {
    render(<PhoneCell userId="u-1" phone="0912****78" surface="users-list" />);
    await userEvent.click(screen.getByRole('button', { name: /Hiện số/ }));
    await waitFor(() => expect(screen.getByText('0912345678')).toBeInTheDocument());
    expect(revealCrmCustomerPhone).toHaveBeenCalledWith('u-1', 'users-list');
  });

  it('mở xong thì nút biến mất (không gọi lại, không ghi vết thừa)', async () => {
    render(<PhoneCell userId="u-1" phone="0912****78" surface="users-detail" />);
    await userEvent.click(screen.getByRole('button', { name: /Hiện số/ }));
    await waitFor(() => expect(screen.getByText('0912345678')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Hiện số/ })).toBeNull();
  });

  /**
   * Số KHÔNG bị che (tài xế / chủ HTX / admin — backend cố ý không che vì /roles, gán chủ
   * HTX và tuyển đại lý cần số thật) thì KHÔNG mọc nút, để không có cái nút chẳng làm gì.
   */
  it('số không bị che thì KHÔNG có nút "Hiện số"', () => {
    render(<PhoneCell userId="u-2" phone="0987654321" surface="users-list" />);
    expect(screen.getByText('0987654321')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hiện số/ })).toBeNull();
  });

  it('phone null thì hiện — và không có nút', () => {
    render(<PhoneCell userId="u-3" phone={null} surface="users-list" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hiện số/ })).toBeNull();
  });

  // Lỗi API: KHÔNG hiện số, KHÔNG nuốt lỗi — thà admin biết là chưa mở được còn hơn tưởng
  // chuỗi đang hiện là số thật.
  it('API lỗi thì báo lỗi, KHÔNG hiện số, không vỡ', async () => {
    revealCrmCustomerPhone.mockRejectedValueOnce(new Error('toang'));
    render(<PhoneCell userId="u-1" phone="0912****78" surface="users-list" />);
    await userEvent.click(screen.getByRole('button', { name: /Hiện số/ }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(screen.queryByText('0912345678')).toBeNull();
    expect(screen.getByText('0912****78')).toBeInTheDocument();
  });

  // Bảng dùng lại dòng khi phân trang/lọc — đổi userId phải che lại, nếu không số của
  // người trước còn nằm trên dòng của người sau.
  it('đổi sang khách khác thì che lại', async () => {
    const { rerender } = render(
      <PhoneCell userId="u-1" phone="0912****78" surface="users-list" />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Hiện số/ }));
    await waitFor(() => expect(screen.getByText('0912345678')).toBeInTheDocument());

    rerender(<PhoneCell userId="u-9" phone="0977****54" surface="users-list" />);
    expect(screen.getByText('0977****54')).toBeInTheDocument();
    expect(screen.queryByText('0912345678')).toBeNull();
  });
});
