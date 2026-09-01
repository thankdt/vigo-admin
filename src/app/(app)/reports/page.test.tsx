import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReportsPage from './page';
import type { ReportResult } from '@/lib/api';

const getReportQuery = vi.fn();
// Task 9: /reports giờ cũng gọi series (biểu đồ) và rows (drill-down). Mock cả hai
// để test trang không đụng mạng thật và tự chọn dữ liệu mặc định an toàn.
const getReportSeries = vi.fn();
const getReportRows = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getReportQuery: (...a: any[]) => getReportQuery(...a),
    getReportSeries: (...a: any[]) => getReportSeries(...a),
    getReportRows: (...a: any[]) => getReportRows(...a),
  };
});

// recharts cần layout thật (ResizeObserver) để vẽ — jsdom không có, và biểu đồ
// không phải điều page.test.tsx cần khẳng định (đã có report-chart.test.tsx riêng).
// Stub cho nhẹ và tránh nhiễu DOM khi test tìm text/role.
vi.mock('recharts', () => ({
  ResponsiveContainer: () => null,
  LineChart: () => null,
  Line: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

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
  getReportSeries.mockResolvedValue({ granularity: 'day', points: [], warnings: [] });
  getReportRows.mockResolvedValue({ page: 1, pageSize: 100, rows: [] });
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

  it('bấm một dòng thì hiện drill-down với đúng bộ lọc của dòng đó (spec gốc CỘNG dims của dòng)', async () => {
    getReportQuery.mockResolvedValue(
      makeResult({ rows: [{ dims: { route: 'HN-HP' }, measures: { created: 10 } }] }),
    );
    render(<ReportsPage />);
    await screen.findByText('HN-HP');

    fireEvent.click(screen.getByText('HN-HP').closest('tr')!);

    await waitFor(() => expect(getReportRows).toHaveBeenCalled());
    const [sentSpec] = getReportRows.mock.calls[0];
    expect(sentSpec.filters.route).toEqual(['HN-HP']);
    expect(sentSpec.cube).toBe('booking');
    expect(sentSpec.dims).toEqual(['route', 'cancelPhase']); // spec của preset đang chọn, không tự dựng lại
  });

  it('bấm sang dòng khác trong khi drill-down đang mở ở trang 2 thì phiên mới bắt đầu lại ở trang 1', async () => {
    getReportQuery.mockResolvedValue(
      makeResult({
        rows: [
          { dims: { route: 'HN-HP' }, measures: { created: 10 } },
          { dims: { route: 'HN-VT' }, measures: { created: 5 } },
        ],
      }),
    );
    getReportRows.mockResolvedValue({
      page: 1,
      pageSize: 100,
      rows: Array.from({ length: 100 }, (_, i) => ({
        id: `id-${i}`,
        createdAt: '2026-08-15T03:00:00.000Z',
        status: 'COMPLETED',
        serviceType: 'RIDE',
        requestedVehicleType: null,
        requestedSeats: null,
        price: null,
        driverId: null,
        cancelledByRole: null,
        cancelReason: null,
        scheduledTime: null,
        scheduledFromTime: null,
      })),
    });
    render(<ReportsPage />);
    await screen.findByText('HN-HP');

    fireEvent.click(screen.getByText('HN-HP').closest('tr')!);
    await waitFor(() => expect(getReportRows).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(getReportRows).toHaveBeenCalledTimes(2));
    expect(getReportRows.mock.calls[1][1]).toBe(2); // đang ở trang 2 của HN-HP

    fireEvent.click(screen.getByText('HN-VT').closest('tr')!);
    await waitFor(() => expect(getReportRows).toHaveBeenCalledTimes(3));
    const [sentSpec, sentPage] = getReportRows.mock.calls[2];
    expect(sentSpec.filters.route).toEqual(['HN-VT']);
    expect(sentPage).toBe(1); // KHÔNG kế thừa trang 2 của ô trước
  });

  it('đổi preset khi drill-down đang mở thì drill-down đóng lại', async () => {
    getReportQuery.mockResolvedValue(
      makeResult({ rows: [{ dims: { route: 'HN-HP' }, measures: { created: 10 } }] }),
    );
    render(<ReportsPage />);
    await screen.findByText('HN-HP');
    fireEvent.click(screen.getByText('HN-HP').closest('tr')!);
    await waitFor(() => expect(getReportRows).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Chuyến trong ô/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lý do huỷ' }));

    await waitFor(() => expect(screen.queryByText(/Chuyến trong ô/)).toBeNull());
  });
});
