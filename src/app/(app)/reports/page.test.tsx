import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportsPage from './page';
import type { ReportResult } from '@/lib/api';

const getReportQuery = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getReportQuery: (...a: any[]) => getReportQuery(...a),
  };
});

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

function makeResult(overrides: Partial<ReportResult> = {}): ReportResult {
  return {
    columns: [
      { key: 'route', label: 'Tuyến', type: 'dim' },
      { key: 'created', label: 'Tạo mới', type: 'measure' },
    ],
    rows: [{ dims: { route: 'HN-HP' }, measures: { created: 10 } }],
    totals: { created: 10 },
    meta: { rowCount: 1, truncated: false, warnings: [] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getReportQuery.mockResolvedValue(makeResult());
});

describe('/reports', () => {
  it('mở trang tải ngay preset đầu tiên với khoảng ngày VN hôm nay', async () => {
    render(<ReportsPage />);
    await waitFor(() => expect(getReportQuery).toHaveBeenCalled());
    const spec = getReportQuery.mock.calls[0][0];
    expect(spec.cube).toBe('booking');
    expect(spec.dims).toEqual(['route', 'cancelPhase']);
    const expectedToday = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    expect(spec.from).toBe(expectedToday);
    expect(spec.to).toBe(expectedToday);
  });

  it('đổi preset thì gọi lại API với dims/measures của preset mới', async () => {
    render(<ReportsPage />);
    await waitFor(() => expect(getReportQuery).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Lý do huỷ' }));

    await waitFor(() => expect(getReportQuery).toHaveBeenCalledTimes(2));
    const spec = getReportQuery.mock.calls[1][0];
    expect(spec.dims).toEqual(['cancelReasonGroup', 'cancelledByRole']);
  });

  it('backend trả cảnh báo thì hiện banner hổ phách với đúng nội dung', async () => {
    getReportQuery.mockResolvedValue(
      makeResult({ meta: { rowCount: 1, truncated: false, warnings: ['Dữ liệu trước 06/06 chưa đầy đủ.'] } }),
    );
    render(<ReportsPage />);
    expect(await screen.findByText('Dữ liệu trước 06/06 chưa đầy đủ.')).toBeInTheDocument();
  });

  it('kết quả bị cắt bớt thì báo rõ số dòng đang hiện, không im lặng', async () => {
    getReportQuery.mockResolvedValue(makeResult({ meta: { rowCount: 300, truncated: true, warnings: [] } }));
    render(<ReportsPage />);
    expect(await screen.findByText(/Chỉ hiển thị 300 dòng đầu/)).toBeInTheDocument();
  });

  it('API lỗi thì báo toast, không crash trắng trang', async () => {
    getReportQuery.mockRejectedValueOnce(new Error('toang'));
    render(<ReportsPage />);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Không tải được báo cáo' }),
    ));
  });
});
