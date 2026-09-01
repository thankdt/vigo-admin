import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReportSeries, ReportSpec } from '@/lib/api';

const getReportSeries = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getReportSeries: (...a: any[]) => getReportSeries(...a),
  };
});

// recharts đo kích thước qua ResizeObserver — jsdom không layout thật nên
// ResponsiveContainer luôn thấy width/height 0 và không vẽ children. Thay bằng
// stub lộ thẳng `data` truyền vào LineChart để test được logic build dữ liệu
// (giữ null, lọc measure) mà không phụ thuộc canvas/SVG thật.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ data, children }: any) => (
    <div data-testid="line-chart" data-points={JSON.stringify(data)}>{children}</div>
  ),
  Line: ({ dataKey }: any) => <div data-testid={`line-${dataKey}`} />,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

import { ReportChart } from './report-chart';

function makeSpec(overrides: Partial<ReportSpec> = {}): ReportSpec {
  return {
    cube: 'booking',
    dims: ['route'],
    measures: ['created', 'cancelRatePct', 'matched', 'completed'],
    filters: {},
    from: '2026-08-01',
    to: '2026-08-31',
    ...overrides,
  };
}

function makeSeries(overrides: Partial<ReportSeries> = {}): ReportSeries {
  return {
    granularity: 'day',
    points: [
      { bucket: '2026-08-01', measures: { created: 10, matched: 8, completed: 5 } },
      { bucket: '2026-08-02', measures: { created: null, matched: 3, completed: 2 } },
    ],
    warnings: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReportChart', () => {
  it('gọi getReportSeries với đúng spec', async () => {
    getReportSeries.mockResolvedValue(makeSeries());
    const spec = makeSpec();
    render(<ReportChart spec={spec} />);
    await waitFor(() => expect(getReportSeries).toHaveBeenCalledWith(spec));
  });

  it('chỉ vẽ tối đa hai chỉ số ĐẾM đầu tiên, bỏ các chỉ số *Pct', async () => {
    getReportSeries.mockResolvedValue(makeSeries());
    render(<ReportChart spec={makeSpec()} />);
    await screen.findByTestId('line-chart');
    expect(screen.getByTestId('line-created')).toBeInTheDocument();
    expect(screen.getByTestId('line-matched')).toBeInTheDocument();
    expect(screen.queryByTestId('line-completed')).toBeNull();
    expect(screen.queryByTestId('line-cancelRatePct')).toBeNull();
  });

  it('giữ nguyên giá trị null trong dữ liệu vẽ, KHÔNG ép thành 0', async () => {
    getReportSeries.mockResolvedValue(makeSeries());
    render(<ReportChart spec={makeSpec()} />);
    const chart = await screen.findByTestId('line-chart');
    const points = JSON.parse(chart.getAttribute('data-points')!);
    expect(points[1].created).toBeNull();
  });

  it.each([
    ['hour', 'giờ'],
    ['day', 'ngày'],
    ['month', 'tháng'],
  ] as const)('độ chi tiết %s hiện nhãn "%s"', async (granularity, label) => {
    getReportSeries.mockResolvedValue(makeSeries({ granularity }));
    render(<ReportChart spec={makeSpec()} />);
    expect(await screen.findByText(new RegExp(`Diễn biến theo ${label}`))).toBeInTheDocument();
  });

  it('không có điểm dữ liệu nào thì không render gì', async () => {
    getReportSeries.mockResolvedValue(makeSeries({ points: [] }));
    const { container } = render(<ReportChart spec={makeSpec()} />);
    await waitFor(() => expect(getReportSeries).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('API lỗi thì không render gì, không crash', async () => {
    getReportSeries.mockRejectedValue(new Error('toang'));
    const { container } = render(<ReportChart spec={makeSpec()} />);
    await waitFor(() => expect(getReportSeries).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('đổi spec nhanh: kết quả cũ trả về sau không đè lên kết quả của spec mới (chống race-condition)', async () => {
    let resolveFirst: (v: ReportSeries) => void;
    const firstPromise = new Promise<ReportSeries>((resolve) => { resolveFirst = resolve; });
    getReportSeries.mockReturnValueOnce(firstPromise);

    const specA = makeSpec({ dims: ['route'] });
    const { rerender } = render(<ReportChart spec={specA} />);
    await waitFor(() => expect(getReportSeries).toHaveBeenCalledTimes(1));

    getReportSeries.mockResolvedValueOnce(makeSeries({ granularity: 'month' }));
    const specB = makeSpec({ dims: ['cancelPhase'] });
    rerender(<ReportChart spec={specB} />);
    await waitFor(() => expect(getReportSeries).toHaveBeenCalledTimes(2));

    // Request đầu (đã bị huỷ do đổi spec) chỉ resolve SAU khi request thứ hai xong.
    await screen.findByText(/Diễn biến theo tháng/);
    resolveFirst!(makeSeries({ granularity: 'hour' }));

    // Chờ một nhịp để nếu component lỡ set-state từ request cũ thì lộ ra.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/Diễn biến theo giờ/)).toBeNull();
    expect(screen.getByText(/Diễn biến theo tháng/)).toBeInTheDocument();
  });
});
