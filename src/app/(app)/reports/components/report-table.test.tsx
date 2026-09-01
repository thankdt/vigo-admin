import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportTable } from './report-table';
import type { ReportResult } from '@/lib/api';

function makeResult(overrides: Partial<ReportResult> = {}): ReportResult {
  return {
    columns: [
      { key: 'route', label: 'Tuyến', type: 'dim' },
      { key: 'created', label: 'Tạo mới', type: 'measure' },
      { key: 'cancelRatePct', label: 'Tỷ lệ huỷ', type: 'measure', unit: 'pct' },
    ],
    rows: [
      { dims: { route: 'HN-HP' }, measures: { created: 120, cancelRatePct: 12.345 } },
      { dims: { route: 'HN-VT' }, measures: { created: 40, cancelRatePct: null } },
    ],
    totals: { created: 5000, cancelRatePct: 8.2 },
    meta: { rowCount: 2, truncated: false, warnings: [] },
    ...overrides,
  };
}

describe('ReportTable', () => {
  it('hiện cột chiều (dim) trước, cột đo (measure) sau, đúng nhãn từ API', () => {
    render(<ReportTable result={makeResult()} onRowClick={vi.fn()} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Tuyến', 'Tạo mới', 'Tỷ lệ huỷ']);
  });

  it('giá trị null hiện dấu gạch ngang, KHÔNG hiện 0', () => {
    render(<ReportTable result={makeResult()} onRowClick={vi.fn()} />);
    const rows = screen.getAllByRole('row');
    // Dòng thứ hai (index 2: header là dòng 0) ứng với HN-VT có cancelRatePct null.
    expect(rows[2]).toHaveTextContent('—');
    expect(rows[2]).not.toHaveTextContent(/(?<!\d)0(?!\d)%/);
  });

  it('đơn vị pct định dạng một chữ số thập phân kèm %', () => {
    render(<ReportTable result={makeResult()} onRowClick={vi.fn()} />);
    expect(screen.getByText('12.3%')).toBeInTheDocument();
  });

  it('dòng "Tổng" lấy từ result.totals, KHÔNG tự cộng lại từ các dòng đang hiện (totals độc lập limit)', () => {
    // Cố tình cho totals lệch hẳn tổng-các-dòng-hiển-thị (120+40=160) để phát hiện nếu
    // component tự cộng thay vì đọc field totals của backend.
    render(<ReportTable result={makeResult()} onRowClick={vi.fn()} />);
    const footer = screen.getByText('Tổng').closest('tr')!;
    expect(footer).toHaveTextContent('5.000'); // totals.created = 5000, vi-VN locale
    expect(footer).not.toHaveTextContent('160');
  });

  it('bấm một dòng gọi onRowClick với CẢ dims LẪN measures của đúng dòng đó (không chỉ dims)', () => {
    const onRowClick = vi.fn();
    render(<ReportTable result={makeResult()} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText('HN-VT').closest('tr')!);
    expect(onRowClick).toHaveBeenCalledWith({
      dims: { route: 'HN-VT' },
      measures: { created: 40, cancelRatePct: null },
    });
  });

  it('không có dòng nào thì báo rõ, không hiện bảng trống im lặng, và ẩn dòng Tổng', () => {
    render(<ReportTable result={makeResult({ rows: [] })} onRowClick={vi.fn()} />);
    expect(screen.getByText('Không có dữ liệu trong khoảng đã chọn.')).toBeInTheDocument();
    expect(screen.queryByText('Tổng')).toBeNull();
  });

  it('nói rõ bằng tiếng Việt rằng bấm dòng xem TOÀN BỘ chuyến, không lọc theo cột số đang bấm', () => {
    render(<ReportTable result={makeResult()} onRowClick={vi.fn()} />);
    expect(
      screen.getByText(/Bấm một dòng để xem TOÀN BỘ chuyến của dòng đó/),
    ).toBeInTheDocument();
    const row = screen.getByText('HN-VT').closest('tr')!;
    expect(row).toHaveAttribute('title', expect.stringContaining('TOÀN BỘ'));
  });

  it('bấm ô "Tỷ lệ huỷ" của một dòng vẫn gọi onRowClick với TOÀN dòng đó (không có bấm-theo-ô)', () => {
    const onRowClick = vi.fn();
    render(<ReportTable result={makeResult()} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText('12.3%'));
    expect(onRowClick).toHaveBeenCalledWith({
      dims: { route: 'HN-HP' },
      measures: { created: 120, cancelRatePct: 12.345 },
    });
  });
});
