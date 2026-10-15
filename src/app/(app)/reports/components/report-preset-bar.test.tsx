import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportPresetBar, REPORT_PRESETS } from './report-preset-bar';

describe('REPORT_PRESETS — các báo cáo đã chốt với ban điều hành', () => {
  it('có đúng bốn preset, đúng key và nhãn tiếng Việt; preset mặc định là theo cặp tỉnh', () => {
    expect(REPORT_PRESETS.map((p) => p.key)).toEqual([
      'huy-theo-tinh',
      'nhan-hoan-thanh',
      'ly-do-huy',
      'huy-theo-tuyen-cu',
    ]);
    expect(REPORT_PRESETS.map((p) => p.label)).toEqual([
      'Huỷ chuyến theo cặp tỉnh',
      'Tỷ lệ nhận & hoàn thành',
      'Lý do huỷ',
      'Huỷ chuyến theo tuyến (cũ)',
    ]);
  });

  it('preset "huy-theo-tinh" dùng cặp tỉnh đón → trả (provinceFrom, provinceTo), không dùng route', () => {
    const p = REPORT_PRESETS.find((x) => x.key === 'huy-theo-tinh');
    expect(p?.spec).toEqual({
      cube: 'booking',
      dims: ['provinceFrom', 'provinceTo', 'cancelPhase'],
      measures: ['created', 'cancelled', 'cancelRatePct', 'matched', 'completed'],
      filters: {},
      limit: 300,
    });
    expect(p?.legacy).toBeUndefined();
  });

  it('chiều "route" chỉ còn ở preset đánh dấu legacy, các preset khác không dùng', () => {
    const withRoute = REPORT_PRESETS.filter((p) => p.spec.dims.includes('route'));
    expect(withRoute.map((p) => p.key)).toEqual(['huy-theo-tuyen-cu']);
    expect(withRoute[0].legacy).toBe(true);
    expect(withRoute[0].spec.dims).toEqual(['route', 'cancelPhase']);
  });

  it('preset "nhan-hoan-thanh" đúng cube/dims/measures/limit đã chốt', () => {
    const p = REPORT_PRESETS.find((x) => x.key === 'nhan-hoan-thanh');
    expect(p?.spec).toEqual({
      cube: 'booking',
      dims: ['serviceType', 'bookingKind'],
      measures: ['created', 'matched', 'matchRatePct', 'completed', 'completeRatePct', 'completedPerMatchedPct'],
      filters: {},
      limit: 200,
    });
  });

  it('preset "ly-do-huy" đúng cube/dims/measures/limit đã chốt', () => {
    const p = REPORT_PRESETS.find((x) => x.key === 'ly-do-huy');
    expect(p?.spec).toEqual({
      cube: 'booking',
      dims: ['cancelReasonGroup', 'cancelledByRole'],
      measures: ['created', 'cancelled', 'cancelRatePct'],
      filters: {},
      limit: 200,
    });
  });
});

describe('ReportPresetBar', () => {
  it('hiện đủ bốn nút preset và gợi ý của preset đang chọn', () => {
    render(<ReportPresetBar activeKey="huy-theo-tinh" onSelect={vi.fn()} isLoading={false} />);
    expect(screen.getByRole('button', { name: 'Huỷ chuyến theo cặp tỉnh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tỷ lệ nhận & hoàn thành' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lý do huỷ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Huỷ chuyến theo tuyến (cũ)' })).toBeInTheDocument();
    expect(screen.getByText('Cặp tỉnh đón → trả nào bị huỷ nhiều nhất, huỷ trước hay sau khi có tài')).toBeInTheDocument();
  });

  it('chọn preset tuyến cũ thì gợi ý nói rõ chỉ có số lịch sử', () => {
    render(<ReportPresetBar activeKey="huy-theo-tuyen-cu" onSelect={vi.fn()} isLoading={false} />);
    expect(screen.getByText(/TRƯỚC khi bỏ tuyến/)).toBeInTheDocument();
  });

  it('bấm một preset khác gọi onSelect với đúng key của nó', () => {
    const onSelect = vi.fn();
    render(<ReportPresetBar activeKey="huy-theo-tinh" onSelect={onSelect} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lý do huỷ' }));
    expect(onSelect).toHaveBeenCalledWith('ly-do-huy');
  });

  it('đang tải thì vô hiệu hoá cả bốn nút, không cho đổi preset giữa chừng', () => {
    render(<ReportPresetBar activeKey="huy-theo-tinh" onSelect={vi.fn()} isLoading={true} />);
    expect(screen.getByRole('button', { name: 'Huỷ chuyến theo cặp tỉnh' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Huỷ chuyến theo tuyến (cũ)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tỷ lệ nhận & hoàn thành' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lý do huỷ' })).toBeDisabled();
  });
});
