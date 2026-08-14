import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PenaltyDialog } from './penalty-dialog';
import { buildApiError } from '@/lib/api-error';

const previewPenalty = vi.fn();
const createPenalty = vi.fn();

// Spread module THẬT rồi chỉ chặn đúng 2 endpoint. Liệt kê tay từng export thì mỗi
// lần dialog thêm một import lại đỏ một test chẳng liên quan gì.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    previewPenalty: (...a: any[]) => previewPenalty(...a),
    createPenalty: (...a: any[]) => createPenalty(...a),
  };
});

// Khai CẢ `toast` lẻ, không chỉ `useToast`: `toastApiError` (đường lỗi lúc GHI) import
// thẳng `toast` từ module này. Thiếu nó thì lúc nào đó thêm test cho nhánh phạt-thất-bại
// sẽ ăn "No toast export is defined on the mock" — lỗi trỏ sai hoàn toàn nguyên nhân.
//
// PHẢI qua `vi.hoisted`: `vi.mock` bị nâng lên trên mọi import, mà `toast` ở đây là
// giá trị ĐỌC NGAY khi factory chạy (khác `useToast` — closure, đọc muộn). Khai bằng
// `const` thường sẽ ném "Cannot access 'toast' before initialization".
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

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
   * `fetchWithAuth` ném `ApiError` dựng bằng `buildApiError` (api.ts), KHÔNG phải
   * `Error(JSON.stringify(envelope))` như trước 2026-08-12. Dựng lỗi bằng chính
   * `buildApiError` để test đi qua đúng đường production: mock một `Error` câu sạch
   * sẽ xanh giả trong khi admin vẫn nhìn thấy nguyên cục JSON.
   */
  it('preview lỗi 403: hiện CÂU của backend, không phải JSON thô', async () => {
    previewPenalty.mockRejectedValue(
      buildApiError({
        body: {
          success: false,
          error: { code: 'Forbidden', message: 'Chuyến này không thuộc phạm vi bạn được soát.' },
        },
        httpStatus: 403,
        path: 'GET /admin/driver-penalties/preview',
      }),
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
      buildApiError({
        body: { message: 'Chuyến này đã bị phạt rồi.', statusCode: 400 },
        httpStatus: 400,
        path: 'GET /admin/driver-penalties/preview',
      }),
    );
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText('Chuyến này đã bị phạt rồi.')).toBeInTheDocument(),
    );
  });

  /**
   * Ca `e` KHÔNG phải Error — thư viện/bug ném chuỗi trần. Không có nhánh dự phòng thì
   * ô lỗi in ra "undefined" và admin không biết chuyện gì xảy ra. Khoá lại vì đây đúng
   * là chỗ dễ mất khi ai đó rút gọn thành `setError(e.message)`.
   */
  it('lỗi không phải Error vẫn ra câu dự phòng, không phải "undefined"', async () => {
    previewPenalty.mockRejectedValue('bể rồi');
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText('Không đọc được thông tin chuyến.')).toBeInTheDocument(),
    );
    expect(confirmButton()).toBeDisabled();
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
