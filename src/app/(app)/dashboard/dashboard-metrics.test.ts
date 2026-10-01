import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_METRICS, canViewMetric, cancelRatePct, defaultMetric, fmtCount, resolveMetric,
  type DashboardMetricKey,
} from './dashboard-metrics';

// Phải khớp whitelist backend: OVERVIEW_SERIES_METRICS (overview.service.ts) và
// FINANCE_SERIES_METRICS (finance-dashboard.dto.ts). Metric lạ → backend trả 400.
const OVERVIEW_WHITELIST = [
  'trips', 'rideTrips', 'carpoolTrips', 'completedTrips', 'cancelledTrips',
  'newCustomers', 'bookingCustomers', 'newDrivers', 'activeDrivers', 'passengersServed',
];
const FINANCE_WHITELIST = ['totalTripIncludingTax', 'vigoRevenue', 'driverPayosTopUp'];

describe('DASHBOARD_METRICS', () => {
  it('mọi metric đều nằm trong whitelist của đúng endpoint', () => {
    for (const def of Object.values(DASHBOARD_METRICS)) {
      const list = def.source === 'finance' ? FINANCE_WHITELIST : OVERVIEW_WHITELIST;
      expect(list).toContain(def.metric);
    }
  });

  it('ô tiền đi finance series (đơn vị đồng), ô đếm đi overview series', () => {
    expect(DASHBOARD_METRICS.gmv).toMatchObject({ source: 'finance', metric: 'totalTripIncludingTax', unit: 'vnd' });
    expect(DASHBOARD_METRICS.driverTopUp).toMatchObject({ source: 'finance', metric: 'driverPayosTopUp', unit: 'vnd' });
    expect(DASHBOARD_METRICS.trips).toMatchObject({ source: 'overview', unit: 'count' });
  });

  it('metric đếm người khác nhau có ghi chú tổng cột ≠ số trên ô', () => {
    expect(DASHBOARD_METRICS.bookingCustomers.note).toBeTruthy();
    expect(DASHBOARD_METRICS.activeDrivers.note).toBeTruthy();
    expect(DASHBOARD_METRICS.trips.note).toBeUndefined();
  });
});

describe('quyền xem metric', () => {
  it('không có quyền finance → không xem được ô tiền, mặc định là Tổng chuyến', () => {
    expect(canViewMetric('gmv', false)).toBe(false);
    expect(canViewMetric('trips', false)).toBe(true);
    expect(defaultMetric(false)).toBe('trips');
    expect(resolveMetric('gmv', false)).toBe('trips');
  });

  it('có quyền finance → mặc định GMV, giữ nguyên metric đang chọn', () => {
    expect(defaultMetric(true)).toBe('gmv');
    const keys = Object.keys(DASHBOARD_METRICS) as DashboardMetricKey[];
    for (const k of keys) expect(resolveMetric(k, true)).toBe(k);
  });
});

describe('fmtCount / cancelRatePct', () => {
  it('thiếu field (backend cũ) hoặc null (bộ đếm lỗi) → "—", không phải 0', () => {
    expect(fmtCount(undefined)).toBe('—');
    expect(fmtCount(null)).toBe('—');
    expect(fmtCount(0)).toBe('0');
    expect(fmtCount(1234)).toBe(new Intl.NumberFormat('vi-VN').format(1234));
  });

  it('tỉ lệ huỷ = huỷ / (hoàn thành + huỷ), 1 chữ số thập phân', () => {
    expect(cancelRatePct(3, 1)).toBe(25);
    expect(cancelRatePct(2, 1)).toBe(33.3);
    expect(cancelRatePct(0, 0)).toBeNull();
    expect(cancelRatePct(undefined, 4)).toBeNull();
    expect(cancelRatePct(5, null)).toBeNull();
  });
});
