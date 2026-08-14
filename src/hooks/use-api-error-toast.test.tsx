import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Toaster } from '@/components/ui/toaster';
import { toastApiError } from './use-api-error-toast';
import { buildApiError } from '@/lib/api-error';

/**
 * `toastApiError` là khuôn toast lỗi DÙNG CHUNG của toàn admin (~20 màn gọi vào nó),
 * nhưng trước giờ không có test nào — trong khi `api-error.test.ts` chỉ phủ tới lớp
 * DỮ LIỆU (`describeApiError` trả gì). Khoảng trống đúng ở lớp HIỂN THỊ, và đó cũng
 * là chỗ vừa vỡ trên production: trang Phạt vi phạm import một hàm không còn tồn tại
 * nên mọi toast lỗi ném TypeError, không cổng nào bắt được.
 *
 * Dựng toast bằng `<Toaster />` thật + `toast()` thật thay vì mock `useToast`: mock đi
 * thì chỉ khẳng định "có gọi hàm", đúng loại test đã để lọt sự cố kia.
 */

/**
 * `toast()` giữ state ở tầng MODULE (use-toast.ts) — cleanup của testing-library không
 * đụng tới, nên toast của ca trước vẫn còn khi ca sau render. Hệ quả cụ thể: `findBy*`
 * có thể vớ đúng nút "Sao chép" của toast CŨ ở nhịp đầu, rồi React thay node và cú bấm
 * rơi vào phần tử đã lìa khỏi DOM — không lỗi, chỉ là không có gì xảy ra.
 *
 * Vì vậy mỗi ca dùng MÃ LỖI RIÊNG và chờ đúng mã đó hiện ra rồi mới bấm. Đừng thay bằng
 * cách chờ tiêu đề: hai ca dưới đây cùng tiêu đề "Phạt thất bại".
 */
function renderToaster() {
  return render(<Toaster />);
}

const apiErr = (code = 'BOK_019') =>
  buildApiError({
    body: { error: { code, message: 'Chuyến này đã bị phạt rồi.' } },
    httpStatus: 409,
    path: 'POST /admin/driver-penalties',
  });

describe('toastApiError — ApiError', () => {
  it('hiện tiêu đề của call-site + câu tiếng Việt của backend', async () => {
    renderToaster();
    toastApiError(apiErr(), 'Phạt thất bại');

    await waitFor(() => expect(screen.getByText('Phạt thất bại')).toBeInTheDocument());
    expect(screen.getByText('Chuyến này đã bị phạt rồi.')).toBeInTheDocument();
  });

  // Lý do tồn tại của cả hook: admin chụp màn hình gửi dev thì phải có MÃ, không phải
  // mỗi câu chữ. Trước đây họ chỉ chụp được một cục JSON.
  it('hiện khối mã lỗi kèm HTTP status', async () => {
    renderToaster();
    toastApiError(apiErr(), 'Phạt thất bại');

    await waitFor(() =>
      expect(screen.getByText(/Mã lỗi: BOK_019 \(HTTP 409\)/)).toBeInTheDocument(),
    );
  });

  it('có nút Sao chép, và chép ĐÚNG nội dung toClipboard() chứ không phải câu trên toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    renderToaster();
    const err = apiErr('CLIP_1');
    toastApiError(err, 'Phạt thất bại');
    await screen.findByText(/Mã lỗi: CLIP_1/);

    // `fireEvent` chứ KHÔNG `userEvent`: Radix Toast tự xử lý chuỗi pointer để bắt cử
    // chỉ vuốt, nên chuỗi pointerdown/up của userEvent bị nuốt và onClick không chạy —
    // test xanh giả kiểu "không thấy lỗi" chứ không phải "đã bấm được".
    fireEvent.click(screen.getByRole('button', { name: /sao chép/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(err.toClipboard());
    // Nội dung chép phải đủ để dev truy vết, không phải mỗi câu hiển thị.
    expect(writeText.mock.calls[0][0]).toContain('CLIP_1 | HTTP 409');
    expect(writeText.mock.calls[0][0]).toContain('POST /admin/driver-penalties');
  });

  /**
   * `ToastAction` của Radix render ra `ToastClose` — bấm là toast gốc đóng, mà
   * TOAST_LIMIT = 1 nên toast báo lỗi-sao-chép còn đẩy nốt cái cũ ra. Vì vậy khi chép
   * hỏng thì KHÔNG được bảo "chụp màn hình phần mã lỗi": khối đó đã biến mất. Phải in
   * lại nguyên nội dung. Đây chính là điều docblock của `copyFailedToast` cam kết.
   */
  it('chép hỏng thì in lại nguyên nội dung để admin chụp màn hình', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });

    renderToaster();
    toastApiError(apiErr('CLIP_2'), 'Phạt thất bại');
    await screen.findByText(/Mã lỗi: CLIP_2/);
    fireEvent.click(screen.getByRole('button', { name: /sao chép/i }));

    await waitFor(() =>
      expect(screen.getByText(/chụp màn hình khung dưới/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/CLIP_2 \| HTTP 409/)).toBeInTheDocument();
  });
});

describe('toastApiError — lỗi KHÔNG phải ApiError', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() },
      configurable: true,
    });
  });

  // Không có code/httpStatus để hiện. Hiện khối trace ở đây sẽ in ra
  // "Mã lỗi: undefined (HTTP undefined)" — tệ hơn hẳn việc không hiện gì.
  it('Error thường: có câu, KHÔNG có khối mã lỗi và KHÔNG có nút Sao chép', async () => {
    renderToaster();
    toastApiError(new Error('Mạng chập chờn.'), 'Không tải được dữ liệu');

    await waitFor(() => expect(screen.getByText('Mạng chập chờn.')).toBeInTheDocument());
    expect(screen.queryByText(/Mã lỗi:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sao chép/i })).not.toBeInTheDocument();
  });

  it('giá trị ném ra không phải Error: vẫn có câu đọc được, không để toast trắng', async () => {
    renderToaster();
    toastApiError('bể rồi', 'Không tải được dữ liệu');

    await waitFor(() =>
      expect(screen.getByText('Không tải được dữ liệu')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
