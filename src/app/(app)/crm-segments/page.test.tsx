import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import CrmSegmentsPage from './page';

const userEvent = userEventLib.setup({ pointerEventsCheck: 0 });

const getCrmSegments = vi.fn();
const previewCrmSegment = vi.fn();
const createCrmSegment = vi.fn();
const deleteCrmSegment = vi.fn();
const recomputeCrmMetrics = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getCrmSegments: (...a: any[]) => getCrmSegments(...a),
    previewCrmSegment: (...a: any[]) => previewCrmSegment(...a),
    createCrmSegment: (...a: any[]) => createCrmSegment(...a),
    deleteCrmSegment: (...a: any[]) => deleteCrmSegment(...a),
    recomputeCrmMetrics: (...a: any[]) => recomputeCrmMetrics(...a),
  };
});

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!window.PointerEvent) (window as any).PointerEvent = MouseEvent;
});

beforeEach(() => {
  vi.clearAllMocks();
  document.body.style.pointerEvents = '';
  getCrmSegments.mockResolvedValue([
    { id: 's1', name: 'VIP', description: null, ruleJson: { all: [] }, isBuiltin: true, createdAt: '2026-08-18T02:00:00Z' },
    { id: 's2', name: 'Tệp thử', description: 'mô tả', ruleJson: { all: [] }, isBuiltin: false, createdAt: '2026-08-18T02:00:00Z' },
  ]);
  previewCrmSegment.mockResolvedValue({
    total: 42,
    sample: [{ userId: 'u1', fullName: 'Khách A', segment: 'NGUY_CO_ROI_BO', lastTripAt: '2026-08-14T02:00:00Z' }],
  });
  createCrmSegment.mockResolvedValue({});
  deleteCrmSegment.mockResolvedValue(undefined);
  recomputeCrmMetrics.mockResolvedValue({ processed: 100 });
});

describe('/crm-segments — danh sách', () => {
  it('hiện phân khúc, đánh dấu loại dựng sẵn', async () => {
    render(<CrmSegmentsPage />);
    const rows = await screen.findAllByTestId('crm-segment-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Dựng sẵn');
  });

  /** Dựng sẵn KHÔNG cho xoá: chiến dịch GĐ5 tham chiếu tới chúng. */
  it('phân khúc dựng sẵn KHÔNG có nút xoá; tự tạo thì có', async () => {
    render(<CrmSegmentsPage />);
    await screen.findAllByTestId('crm-segment-row');
    expect(screen.queryByRole('button', { name: /Xoá phân khúc VIP/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Xoá phân khúc Tệp thử/ })).toBeInTheDocument();
  });

  it('lỗi tải hiện chữ lỗi, không nhầm với rỗng', async () => {
    getCrmSegments.mockRejectedValueOnce(new Error('toang'));
    render(<CrmSegmentsPage />);
    expect(await screen.findByText(/Không tải được danh sách phân khúc/)).toBeInTheDocument();
  });

  it('nút tính lại chỉ số gọi đúng API', async () => {
    render(<CrmSegmentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Tính lại chỉ số ngay/ }));
    await waitFor(() => expect(recomputeCrmMetrics).toHaveBeenCalled());
  });
});

describe('/crm-segments — dựng rule', () => {
  /**
   * 🚨 Ràng buộc CHỊU LỰC của màn này: phải XEM TRƯỚC rồi mới lưu được. Phân khúc lưu ra
   * sẽ thành đầu vào của chiến dịch gửi tin ra ngoài cho khách thật (GĐ5) — bắt nhìn số
   * khách thật một lần là rẻ hơn nhiều so với gửi nhầm cả tệp.
   */
  it('chưa xem trước thì KHÔNG lưu được', async () => {
    render(<CrmSegmentsPage />);
    await userEvent.type(await screen.findByLabelText('Tên phân khúc'), 'Tệp mới');
    expect(screen.getByRole('button', { name: 'Lưu phân khúc' })).toBeDisabled();
    expect(screen.getByText(/Phải xem trước rồi mới lưu được/)).toBeInTheDocument();
  });

  it('xem trước hiện SỐ KHÁCH và mẫu tên thật', async () => {
    render(<CrmSegmentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Xem trước' }));
    const box = await screen.findByTestId('seg-preview');
    expect(box).toHaveTextContent('42');
    expect(await screen.findByTestId('seg-sample')).toHaveTextContent('Khách A');
  });

  it('xem trước xong mới lưu được, và gửi đúng rule', async () => {
    render(<CrmSegmentsPage />);
    await userEvent.type(await screen.findByLabelText('Tên phân khúc'), 'Tệp mới');
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
    await screen.findByTestId('seg-preview');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu phân khúc' }));
    await waitFor(() =>
      expect(createCrmSegment).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Tệp mới',
          ruleJson: { all: [{ field: 'segment', op: 'eq', value: 'NGUY_CO_ROI_BO' }] },
        }),
      ),
    );
  });

  /**
   * Đổi rule sau khi xem trước thì con số cũ KHÔNG còn đúng — phải xoá đi, đừng để người
   * dùng lưu theo con số của một rule khác.
   */
  it('đổi rule sau khi xem trước thì mất kết quả cũ và khoá lại nút lưu', async () => {
    render(<CrmSegmentsPage />);
    await userEvent.type(await screen.findByLabelText('Tên phân khúc'), 'Tệp mới');
    await userEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
    await screen.findByTestId('seg-preview');

    await userEvent.click(screen.getByRole('button', { name: 'Thêm điều kiện' }));
    await waitFor(() => expect(screen.queryByTestId('seg-preview')).toBeNull());
    expect(screen.getByRole('button', { name: 'Lưu phân khúc' })).toBeDisabled();
  });

  it('rule không hợp lệ -> báo lỗi, không lưu', async () => {
    previewCrmSegment.mockRejectedValueOnce(new Error('Trường không hợp lệ'));
    render(<CrmSegmentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Xem trước' }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(screen.queryByTestId('seg-preview')).toBeNull();
  });

  // 0 khách khớp là kết quả HỢP LỆ, không phải lỗi — nhưng phải nói rõ vì sao có thể rỗng.
  it('0 khách khớp thì nói rõ, gợi ý chạy tính lại chỉ số', async () => {
    previewCrmSegment.mockResolvedValue({ total: 0, sample: [] });
    render(<CrmSegmentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Xem trước' }));
    expect(await screen.findByText(/Không khách nào khớp/)).toBeInTheDocument();
  });

  it('thêm/bớt điều kiện đổi số dòng rule', async () => {
    render(<CrmSegmentsPage />);
    await screen.findAllByTestId('seg-cond');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm điều kiện' }));
    expect(await screen.findAllByTestId('seg-cond')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: /Bỏ điều kiện 2/ }));
    await waitFor(() => expect(screen.getAllByTestId('seg-cond')).toHaveLength(1));
  });
});
