import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PenaltyDialog } from './penalty-dialog';

const previewPenalty = vi.fn();
const createPenalty = vi.fn();

// Giữ NGUYÊN `parseApiError` thật: nó chính là thứ biến envelope JSON của
// `fetchWithAuth` thành câu người đọc được, nên mock nó đi là mất luôn ý nghĩa của
// hai ca test bên dưới.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    previewPenalty: (...a: any[]) => previewPenalty(...a),
    createPenalty: (...a: any[]) => createPenalty(...a),
  };
});

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const OK_PREVIEW = {
  amount: 20000,
  willOweDeposit: 0,
  blockedReason: null,
  blockedMessage: null,
};

function renderDialog(props: Partial<React.ComponentProps<typeof PenaltyDialog>> = {}) {
  return render(
    <PenaltyDialog bookingId="b1" open source="PENALTY_PAGE" onOpenChange={() => {}} {...props} />,
  );
}

const confirmButton = () => screen.getByRole('button', { name: /xác nhận phạt/i });

/**
 * Chỉ test phần HIỂN THỊ ở đây. Luật bật/tắt nút và hình dạng body nằm ở
 * `penalty-form.ts` và được test cạn kiệt trong `penalty-form.test.ts` — cố ý tách
 * ra vì Radix Select không lái được ổn định trong jsdom (treo ở pointer-capture),
 * nếu nhốt luật trong component thì phần quan trọng nhất lại không test được.
 */
describe('PenaltyDialog', () => {
  beforeEach(() => {
    previewPenalty.mockReset().mockResolvedValue(OK_PREVIEW);
    createPenalty.mockReset().mockResolvedValue({ id: 'p1' });
    toast.mockReset();
  });

  it('hiện số tiền backend tính, KHÔNG phải ô nhập', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('20.000đ')).toBeInTheDocument());
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    // Chỉ có duy nhất ô ghi chú là nhập được — số tiền không sửa được.
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
  });

  it('chưa chọn lý do thì nút phạt bị khoá', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('20.000đ')).toBeInTheDocument());
    expect(confirmButton()).toBeDisabled();
  });

  it('bị chặn thì hiện đúng câu của backend, khoá nút và KHÔNG hiện ô lý do', async () => {
    previewPenalty.mockResolvedValue({
      amount: 0,
      willOweDeposit: 0,
      blockedReason: 'NO_COMMISSION',
      blockedMessage: 'Chuyến này chưa từng thu hoa hồng, không có gì để phạt.',
    });
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText(/chưa từng thu hoa hồng/i)).toBeInTheDocument(),
    );
    expect(confirmButton()).toBeDisabled();
    expect(screen.queryByLabelText(/lý do vi phạm/i)).not.toBeInTheDocument();
  });

  it('cảnh báo đỏ khi ví ký quỹ sẽ âm', async () => {
    previewPenalty.mockResolvedValue({ ...OK_PREVIEW, willOweDeposit: 15000 });
    renderDialog();
    await waitFor(() => expect(screen.getByText(/15\.000đ/)).toBeInTheDocument());
    expect(screen.getByText(/nạp bù mới nhận được chuyến/i)).toBeInTheDocument();
  });

  it('không cảnh báo âm ví khi ví đủ tiền', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText('20.000đ')).toBeInTheDocument());
    expect(screen.queryByText(/nạp bù mới nhận được chuyến/i)).not.toBeInTheDocument();
  });

  /**
   * `fetchWithAuth` ném `Error(JSON.stringify(envelope))` chứ KHÔNG phải câu tiếng
   * Việt trần (api.ts:137). Test cũ mock một Error với câu sạch → xanh, trong khi
   * production hiện nguyên khối JSON cho admin. Mock ĐÚNG hình dạng thật ở đây.
   */
  it('preview lỗi 403: hiện CÂU của backend, không phải JSON thô', async () => {
    previewPenalty.mockRejectedValue(
      new Error(
        JSON.stringify({
          success: false,
          error: { code: 'Forbidden', message: 'Chuyến này không thuộc phạm vi bạn được soát.' },
          path: '/admin/driver-penalties/preview',
        }),
      ),
    );
    renderDialog();
    await waitFor(() =>
      expect(
        screen.getByText('Chuyến này không thuộc phạm vi bạn được soát.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/"success"/)).not.toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it('envelope kiểu cũ ({ message }) cũng bóc được', async () => {
    previewPenalty.mockRejectedValue(
      new Error(JSON.stringify({ message: 'Chuyến này đã bị phạt rồi.', statusCode: 400 })),
    );
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText('Chuyến này đã bị phạt rồi.')).toBeInTheDocument(),
    );
  });

  it('không gọi preview khi dialog đóng', () => {
    renderDialog({ open: false });
    expect(previewPenalty).not.toHaveBeenCalled();
  });

  it('mở dialog thì preview đúng chuyến đang chọn', async () => {
    renderDialog({ bookingId: 'booking-xyz' });
    await waitFor(() => expect(previewPenalty).toHaveBeenCalledWith('booking-xyz'));
  });
});
