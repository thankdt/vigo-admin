// Ô số nào của dashboard bấm được, và chuỗi thời gian của nó lấy từ đâu.
// `finance` → /admin/finance/series (cần quyền `finance`); `overview` → /admin/overview/series
// (quyền `dashboard`). `metric` phải khớp whitelist của backend ở endpoint tương ứng.

export type DashboardMetricKey =
  | 'gmv' | 'vigoRevenue' | 'driverTopUp'
  | 'trips' | 'rideTrips' | 'carpoolTrips' | 'completedTrips' | 'cancelledTrips'
  | 'newCustomers' | 'bookingCustomers' | 'newDrivers' | 'activeDrivers' | 'passengersServed';

export type DashboardMetricDef = {
  source: 'finance' | 'overview';
  metric: string;
  title: string;
  unit: 'vnd' | 'count';
  // Ghi chú dưới biểu đồ khi cột không cộng lại bằng số trên ô.
  note?: string;
};

const DISTINCT_NOTE = 'Mỗi cột đếm riêng: một người xuất hiện ở nhiều cột nên tổng các cột có thể lớn hơn số trên ô.';

export const DASHBOARD_METRICS: Record<DashboardMetricKey, DashboardMetricDef> = {
  gmv: { source: 'finance', metric: 'totalTripIncludingTax', title: 'GMV', unit: 'vnd' },
  vigoRevenue: { source: 'finance', metric: 'vigoRevenue', title: 'Doanh thu VIGO', unit: 'vnd' },
  driverTopUp: { source: 'finance', metric: 'driverPayosTopUp', title: 'Tài xế nạp', unit: 'vnd' },
  trips: { source: 'overview', metric: 'trips', title: 'Tổng chuyến', unit: 'count' },
  rideTrips: { source: 'overview', metric: 'rideTrips', title: 'Chuyến bao xe', unit: 'count' },
  carpoolTrips: { source: 'overview', metric: 'carpoolTrips', title: 'Chuyến đi chung', unit: 'count' },
  completedTrips: { source: 'overview', metric: 'completedTrips', title: 'Chuyến hoàn thành', unit: 'count' },
  cancelledTrips: { source: 'overview', metric: 'cancelledTrips', title: 'Chuyến huỷ', unit: 'count' },
  newCustomers: { source: 'overview', metric: 'newCustomers', title: 'Người dùng mới', unit: 'count' },
  bookingCustomers: { source: 'overview', metric: 'bookingCustomers', title: 'Người đặt chuyến', unit: 'count', note: DISTINCT_NOTE },
  newDrivers: { source: 'overview', metric: 'newDrivers', title: 'Tài xế mới', unit: 'count' },
  activeDrivers: { source: 'overview', metric: 'activeDrivers', title: 'Tài xế hoàn thành chuyến', unit: 'count', note: DISTINCT_NOTE },
  passengersServed: { source: 'overview', metric: 'passengersServed', title: 'Khách đã phục vụ (ước tính)', unit: 'count' },
};

export const canViewMetric = (key: DashboardMetricKey, canFinance: boolean) =>
  DASHBOARD_METRICS[key].source !== 'finance' || canFinance;

export const defaultMetric = (canFinance: boolean): DashboardMetricKey => (canFinance ? 'gmv' : 'trips');

// Metric đang chọn nhưng user không (còn) quyền xem → rơi về mặc định theo quyền.
export const resolveMetric = (key: DashboardMetricKey, canFinance: boolean): DashboardMetricKey =>
  canViewMetric(key, canFinance) ? key : defaultMetric(canFinance);

const fmtNum = (v: number) => new Intl.NumberFormat('vi-VN').format(v);

// Field mới có thể thiếu (backend cũ) hoặc null (bộ đếm lỗi) → "—", không giả làm số 0.
export const fmtCount = (v: number | null | undefined) => (v == null ? '—' : fmtNum(v));

// Tỉ lệ huỷ trên số chuyến ĐÃ KẾT THÚC (hoàn thành + huỷ) trong kỳ; null khi chưa đủ dữ liệu.
export function cancelRatePct(completed: number | null | undefined, cancelled: number | null | undefined): number | null {
  if (completed == null || cancelled == null) return null;
  const ended = completed + cancelled;
  return ended > 0 ? Math.round((cancelled / ended) * 1000) / 10 : null;
}
