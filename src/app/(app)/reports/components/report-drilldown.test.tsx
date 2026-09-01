import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReportRow, ReportRowsResult, ReportSpec } from '@/lib/api';

const getReportRows = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getReportRows: (...a: any[]) => getReportRows(...a),
  };
});

import { ReportDrilldown } from './report-drilldown';

function makeSpec(overrides: Partial<ReportSpec> = {}): ReportSpec {
  return {
    cube: 'booking',
    dims: ['route', 'cancelPhase'],
    measures: ['created', 'cancelled'],
    filters: { serviceType: ['RIDE'] },
    from: '2026-08-01',
    to: '2026-08-31',
    ...overrides,
  };
}

function makeRow(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    createdAt: '2026-08-15T03:00:00.000Z',
    status: 'COMPLETED',
    serviceType: 'RIDE',
    requestedVehicleType: 'CAR_4',
    requestedSeats: 1,
    price: 120000,
    driverId: 'driver-1',
    cancelledByRole: null,
    cancelReason: null,
    scheduledTime: null,
    scheduledFromTime: null,
    ...overrides,
  };
}

function makeRowsResult(overrides: Partial<ReportRowsResult> = {}): ReportRowsResult {
  return { page: 1, pageSize: 100, rows: [makeRow()], ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  getReportRows.mockResolvedValue(makeRowsResult());
});

describe('ReportDrilldown', () => {
  it('gửi bộ lọc = bộ lọc hiện có CỘNG giá trị từng chiều của ô vừa bấm, dạng mảng', async () => {
    const spec = makeSpec();
    render(<ReportDrilldown spec={spec} dims={{ route: 'HN-HP', cancelPhase: 'before_match' }} onClose={vi.fn()} />);
    await waitFor(() => expect(getReportRows).toHaveBeenCalled());
    const [sentSpec, page, pageSize] = getReportRows.mock.calls[0];
    expect(sentSpec.filters).toEqual({
      serviceType: ['RIDE'],
      route: ['HN-HP'],
      cancelPhase: ['before_match'],
    });
    expect(page).toBe(1);
    expect(pageSize).toBe(100);
    // Không đổi cube/dims/measures/from/to/includeTest của spec gốc.
    expect(sentSpec.cube).toBe(spec.cube);
    expect(sentSpec.from).toBe(spec.from);
    expect(sentSpec.to).toBe(spec.to);
  });

  it('ô bấm cùng chiều với bộ lọc hiện có thì giá trị của Ô THẮNG (ghi đè bộ lọc cũ)', async () => {
    const spec = makeSpec({ filters: { route: ['OLD-ROUTE'] } });
    render(<ReportDrilldown spec={spec} dims={{ route: 'HN-HP' }} onClose={vi.fn()} />);
    await waitFor(() => expect(getReportRows).toHaveBeenCalled());
    const sentSpec = getReportRows.mock.calls[0][0];
    expect(sentSpec.filters.route).toEqual(['HN-HP']);
  });

  it('đang tải hiện spinner, xong thì hiện bảng với đúng dữ liệu dòng, trạng thái/người huỷ dịch TIẾNG VIỆT', async () => {
    getReportRows.mockResolvedValue(makeRowsResult({ rows: [makeRow({ status: 'CANCELLED', cancelledByRole: 'CUSTOMER', cancelReason: 'Đổi ý' })] }));
    render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} onClose={vi.fn()} />);
    // Dùng lại statusLabelMap/CANCELLED_BY_ROLE_LABEL của bookings/ — KHÔNG in enum thô.
    expect(await screen.findByText('Đã hủy')).toBeInTheDocument();
    expect(screen.getByText('Khách hàng')).toBeInTheDocument();
    expect(screen.queryByText('CANCELLED')).toBeNull();
    expect(screen.queryByText('CUSTOMER')).toBeNull();
    expect(screen.getByText('Đổi ý')).toBeInTheDocument();
    expect(screen.getByText('120.000')).toBeInTheDocument();
  });

  it('trạng thái không nằm trong bảng nhãn thì hiện thẳng mã gốc thay vì trắng/lỗi', async () => {
    getReportRows.mockResolvedValue(makeRowsResult({ rows: [makeRow({ status: 'MOT_TRANG_THAI_LA' })] }));
    render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} onClose={vi.fn()} />);
    expect(await screen.findByText('MOT_TRANG_THAI_LA')).toBeInTheDocument();
  });

  it('giá trị null (giá, người huỷ, lý do huỷ) hiện dấu gạch ngang', async () => {
    render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} onClose={vi.fn()} />);
    await screen.findByText('Hoàn thành');
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2); // người huỷ + lý do huỷ (giá đã có ở test trên)
  });

  it('mã chuyến KHÔNG phải link (trang /bookings không đọc query param nào để mở đúng 1 chuyến)', async () => {
    render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} onClose={vi.fn()} />);
    await screen.findByText('Hoàn thành');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('11111111')).toHaveAttribute('title', makeRow().id);
  });

  it('hiện tổng theo bảng cạnh tiêu đề để đối chiếu với số dòng drill-down', async () => {
    render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} expectedTotal={120} onClose={vi.fn()} />);
    expect(await screen.findByText(/Tổng theo bảng: 120 chuyến/)).toBeInTheDocument();
  });

  it('không truyền expectedTotal thì không hiện dòng đối chiếu (không bịa số)', async () => {
    render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} onClose={vi.fn()} />);
    await screen.findByText('Hoàn thành');
    expect(screen.queryByText(/Tổng theo bảng/)).toBeNull();
  });

  it('hiện kỳ (from → to) của ĐÚNG spec truyền vào — ảnh chụp lúc bấm, không phải kỳ nào khác', async () => {
    render(
      <ReportDrilldown
        spec={makeSpec({ from: '2026-08-01', to: '2026-08-31' })}
        dims={{ route: 'HN-HP' }}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText('Kỳ: 01/08/2026 – 31/08/2026')).toBeInTheDocument();
  });

  it('không có chuyến nào thì báo rõ, không hiện bảng trống im lặng', async () => {
    getReportRows.mockResolvedValue(makeRowsResult({ rows: [] }));
    render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} onClose={vi.fn()} />);
    expect(await screen.findByText('Không có chuyến nào.')).toBeInTheDocument();
  });

  it('bấm nút đóng (có aria-label "Đóng" cho a11y) gọi onClose', async () => {
    const onClose = vi.fn();
    render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} onClose={onClose} />);
    await waitFor(() => expect(getReportRows).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('bấm "Trang sau" gọi lại API với trang 2', async () => {
    getReportRows.mockResolvedValue(makeRowsResult({ rows: Array.from({ length: 100 }, (_, i) => makeRow({ id: `id-${i}` })) }));
    render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} onClose={vi.fn()} />);
    await waitFor(() => expect(getReportRows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(getReportRows).toHaveBeenCalledTimes(2));
    expect(getReportRows.mock.calls[1][1]).toBe(2);
  });

  it('trang cuối (dòng < pageSize) thì disable nút "Trang sau"', async () => {
    getReportRows.mockResolvedValue(makeRowsResult({ rows: [makeRow()] }));
    render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} onClose={vi.fn()} />);
    await screen.findByText('Hoàn thành');
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('đổi sang ô khác (component mới, đúng như cách page.tsx remount bằng key theo dims) thì bắt đầu lại ở trang 1', async () => {
    // page.tsx gắn `key={JSON.stringify(drillDims)}` vào ReportDrilldown — bấm ô khác
    // là một PHIÊN MỚI của component (state page không kế thừa từ ô trước). Mô phỏng
    // bằng cách unmount rồi mount lại, đúng với cách React xử lý khi key đổi.
    getReportRows.mockResolvedValue(makeRowsResult({ rows: Array.from({ length: 100 }, (_, i) => makeRow({ id: `id-${i}` })) }));
    const { unmount } = render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} onClose={vi.fn()} />);
    await waitFor(() => expect(getReportRows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(getReportRows).toHaveBeenCalledTimes(2));
    expect(getReportRows.mock.calls[1][1]).toBe(2);

    unmount();
    render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-VT' }} onClose={vi.fn()} />);
    await waitFor(() => expect(getReportRows).toHaveBeenCalledTimes(3));
    expect(getReportRows.mock.calls[2][1]).toBe(1);
  });

  it('đổi ô nhanh: kết quả cũ trả về sau không đè lên kết quả của ô mới (chống race-condition)', async () => {
    let resolveFirst: (v: ReportRowsResult) => void;
    const firstPromise = new Promise<ReportRowsResult>((resolve) => { resolveFirst = resolve; });
    getReportRows.mockReturnValueOnce(firstPromise);

    const { rerender } = render(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-HP' }} onClose={vi.fn()} />);
    await waitFor(() => expect(getReportRows).toHaveBeenCalledTimes(1));

    getReportRows.mockResolvedValueOnce(makeRowsResult({ rows: [makeRow({ status: 'MATCHED' })] }));
    rerender(<ReportDrilldown spec={makeSpec()} dims={{ route: 'HN-VT' }} onClose={vi.fn()} />);
    await waitFor(() => expect(getReportRows).toHaveBeenCalledTimes(2));
    await screen.findByText('MATCHED');

    resolveFirst!(makeRowsResult({ rows: [makeRow({ status: 'STALE' })] }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('STALE')).toBeNull();
    expect(screen.getByText('MATCHED')).toBeInTheDocument();
  });
});
