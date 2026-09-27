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
// stub lộ thẳng `data`/`name`/`tickFormatter` truyền vào để test được logic build
// dữ liệu (giữ null, lọc measure, nhãn tiếng Việt, định dạng trục) mà không phụ
// thuộc canvas/SVG thật.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ data, children }: any) => (
    <div data-testid="line-chart" data-points={JSON.stringify(data)}>{children}</div>
  ),
  Line: ({ dataKey, name }: any) => <div data-testid={`line-${dataKey}`} data-name={name} />,
  Legend: () => <div data-testid="legend" />,
  CartesianGrid: () => null,
  XAxis: ({ tickFormatter }: any) => (
    <div data-testid="xaxis" data-sample={tickFormatter ? tickFormatter('2026-08-01 14:00') : ''} />
  ),
  YAxis: () => null,
  Tooltip: ({ labelFormatter }: any) => (
    <div data-testid="tooltip" data-sample={labelFormatter ? labelFormatter('2026-08-01 14:00') : ''} />
  ),
}));

import { ReportChart, formatBucketLabel } from './report-chart';

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

describe('formatBucketLabel', () => {
  it('giờ: cắt "YYYY-MM-DD HH:00" thành "HH:00"', () => {
    expect(formatBucketLabel('2026-08-31 14:00', 'hour')).toBe('14:00');
  });

  it('ngày: đổi "YYYY-MM-DD" thành "DD/MM"', () => {
    expect(formatBucketLabel('2026-08-31', 'day')).toBe('31/08');
  });

  it('tháng: đổi "YYYY-MM" thành "MM/YYYY"', () => {
    expect(formatBucketLabel('2026-08', 'month')).toBe('08/2026');
  });

  it('khoá lạ (không đúng định dạng mong đợi) thì trả nguyên chuỗi, không throw', () => {
    expect(formatBucketLabel('linh-tinh', 'day')).toBe('linh-tinh');
  });
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

  it('đường vẽ lấy tên tiếng Việt từ measureLabels, KHÔNG in khoá thô khi có nhãn', async () => {
    getReportSeries.mockResolvedValue(makeSeries());
    render(<ReportChart spec={makeSpec()} measureLabels={{ created: 'Chuyến tạo', matched: 'Đã khớp tài' }} />);
    expect(await screen.findByTestId('line-created')).toHaveAttribute('data-name', 'Chuyến tạo');
    expect(screen.getByTestId('line-matched')).toHaveAttribute('data-name', 'Đã khớp tài');
  });

  it('thiếu measureLabels thì rơi về khoá thô (không hiện rỗng)', async () => {
    getReportSeries.mockResolvedValue(makeSeries());
    render(<ReportChart spec={makeSpec()} />);
    expect(await screen.findByTestId('line-created')).toHaveAttribute('data-name', 'created');
  });

  it('có chú giải (Legend)', async () => {
    getReportSeries.mockResolvedValue(makeSeries());
    render(<ReportChart spec={makeSpec()} />);
    expect(await screen.findByTestId('legend')).toBeInTheDocument();
  });

  it('trục X và tooltip dùng nhãn gọn (định dạng theo độ chi tiết), không phải khoá bucket thô', async () => {
    getReportSeries.mockResolvedValue(makeSeries({ granularity: 'hour' }));
    render(<ReportChart spec={makeSpec()} />);
    expect(await screen.findByTestId('xaxis')).toHaveAttribute('data-sample', '14:00');
    expect(screen.getByTestId('tooltip')).toHaveAttribute('data-sample', '14:00');
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

  it('đang tải hiện spinner (chưa có dữ liệu, chưa có lỗi)', () => {
    getReportSeries.mockReturnValue(new Promise(() => {})); // không bao giờ resolve trong test này
    render(<ReportChart spec={makeSpec()} />);
    expect(screen.getByTestId('report-chart-loading')).toBeInTheDocument();
  });

  it('không có điểm dữ liệu nào thì không render gì (không phải lỗi, không phải đang tải)', async () => {
    getReportSeries.mockResolvedValue(makeSeries({ points: [] }));
    const { container } = render(<ReportChart spec={makeSpec()} />);
    await waitFor(() => expect(getReportSeries).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('report-chart-loading')).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it('API lỗi thì báo rõ bằng tiếng Việt, KHÔNG nuốt lỗi im lặng, không crash', async () => {
    getReportSeries.mockRejectedValue(new Error('toang'));
    render(<ReportChart spec={makeSpec()} />);
    expect(await screen.findByTestId('report-chart-error')).toHaveTextContent('toang');
  });

  it('lỗi không kèm message (vd lỗi mạng thô) vẫn hiện câu tiếng Việt mặc định, không để trống', async () => {
    getReportSeries.mockRejectedValue({});
    render(<ReportChart spec={makeSpec()} />);
    expect(await screen.findByTestId('report-chart-error')).toHaveTextContent('Không tải được biểu đồ.');
  });

  it('đổi spec: reset ngay, không đứng yên hiện biểu đồ của spec CŨ trong lúc chờ spec MỚI', async () => {
    getReportSeries.mockResolvedValueOnce(makeSeries({ granularity: 'day' }));
    const specA = makeSpec({ dims: ['route'] });
    const { rerender } = render(<ReportChart spec={specA} />);
    await screen.findByText(/Diễn biến theo ngày/);

    getReportSeries.mockReturnValueOnce(new Promise(() => {})); // spec mới chưa trả lời
    const specB = makeSpec({ dims: ['cancelPhase'] });
    rerender(<ReportChart spec={specB} />);

    expect(screen.queryByText(/Diễn biến theo ngày/)).toBeNull();
    expect(screen.getByTestId('report-chart-loading')).toBeInTheDocument();
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
