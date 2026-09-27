import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReportPresetBar, REPORT_PRESETS } from './report-preset-bar';

describe('REPORT_PRESETS — ba báo cáo đã chốt với ban điều hành', () => {
  it('có đúng ba preset, đúng key và nhãn tiếng Việt', () => {
    expect(REPORT_PRESETS.map((p) => p.key)).toEqual(['huy-theo-tuyen', 'nhan-hoan-thanh', 'ly-do-huy']);
    expect(REPORT_PRESETS.map((p) => p.label)).toEqual([
      'Huỷ chuyến theo tuyến',
      'Tỷ lệ nhận & hoàn thành',
      'Lý do huỷ',
    ]);
  });

  it('preset "huy-theo-tuyen" đúng cube/dims/measures/limit đã chốt', () => {
    const p = REPORT_PRESETS.find((x) => x.key === 'huy-theo-tuyen');
    expect(p?.spec).toEqual({
      cube: 'booking',
      dims: ['route', 'cancelPhase'],
      measures: ['created', 'cancelled', 'cancelRatePct', 'matched', 'completed'],
      filters: {},
      limit: 300,
    });
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
  it('hiện đủ ba nút preset và gợi ý của preset đang chọn', () => {
    render(<ReportPresetBar activeKey="huy-theo-tuyen" onSelect={vi.fn()} isLoading={false} />);
    expect(screen.getByRole('button', { name: 'Huỷ chuyến theo tuyến' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tỷ lệ nhận & hoàn thành' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lý do huỷ' })).toBeInTheDocument();
    expect(screen.getByText('Tuyến nào bị huỷ nhiều nhất, huỷ trước hay sau khi có tài')).toBeInTheDocument();
  });

  it('bấm một preset khác gọi onSelect với đúng key của nó', () => {
    const onSelect = vi.fn();
    render(<ReportPresetBar activeKey="huy-theo-tuyen" onSelect={onSelect} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lý do huỷ' }));
    expect(onSelect).toHaveBeenCalledWith('ly-do-huy');
  });

  it('đang tải thì vô hiệu hoá cả ba nút, không cho đổi preset giữa chừng', () => {
    render(<ReportPresetBar activeKey="huy-theo-tuyen" onSelect={vi.fn()} isLoading={true} />);
    expect(screen.getByRole('button', { name: 'Huỷ chuyến theo tuyến' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tỷ lệ nhận & hoàn thành' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lý do huỷ' })).toBeDisabled();
  });
});
