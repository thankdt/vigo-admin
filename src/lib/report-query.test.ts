import { describe, it, expect } from 'vitest';
import { buildReportParams, type ReportSpec } from './report-query';

const spec: ReportSpec = {
  cube: 'booking',
  dims: ['route', 'cancelPhase'],
  measures: ['created', 'cancelled', 'cancelRatePct'],
  filters: {},
  from: '2026-06-06',
  to: '2026-08-31',
};

describe('buildReportParams', () => {
  it('nối khoá bằng dấu phẩy', () => {
    const p = buildReportParams(spec);
    expect(p.get('dims')).toBe('route,cancelPhase');
    expect(p.get('measures')).toBe('created,cancelled,cancelRatePct');
  });

  it('bỏ hẳn tham số filters khi không có bộ lọc nào', () => {
    expect(buildReportParams(spec).has('filters')).toBe(false);
  });

  it('mã hoá bộ lọc thành JSON', () => {
    const p = buildReportParams({ ...spec, filters: { serviceType: ['Đi ghép'] } });
    expect(JSON.parse(p.get('filters')!)).toEqual({ serviceType: ['Đi ghép'] });
  });

  it('bỏ qua bộ lọc có mảng rỗng', () => {
    const p = buildReportParams({ ...spec, filters: { serviceType: [] } });
    expect(p.has('filters')).toBe(false);
  });

  it('chỉ gửi limit khi được đặt', () => {
    expect(buildReportParams(spec).has('limit')).toBe(false);
    expect(buildReportParams({ ...spec, limit: 50 }).get('limit')).toBe('50');
  });

  it('chỉ gửi gran khi được đặt — không gửi thì backend tự chọn độ chi tiết', () => {
    expect(buildReportParams(spec).has('gran')).toBe(false);
    expect(buildReportParams({ ...spec, gran: 'day' }).get('gran')).toBe('day');
  });

  it('chỉ gửi includeTest khi bật', () => {
    expect(buildReportParams(spec).has('includeTest')).toBe(false);
    expect(buildReportParams({ ...spec, includeTest: true }).get('includeTest')).toBe('true');
  });
});
