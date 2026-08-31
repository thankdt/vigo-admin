// Kiểu dùng chung + querystring builder cho công cụ báo cáo động (`/admin/reports/*`).
// Khớp hợp đồng THẬT ở backend (vigo-backend/src/reporting): controller
// `ReportingAdminController`, DTO `ReportQueryDto`/`ReportRowsDto`, service
// `ReportingService`. Xem ghi chú lệch-so-với-brief ở cuối file.

export type ReportSpec = {
  cube: string;
  dims: string[];
  measures: string[];
  filters: Record<string, string[]>;
  from: string;
  to: string;
  includeTest?: boolean;
  limit?: number;
  /**
   * Chỉ `/series` dùng. Backend chỉ nhận 'hour' | 'day' | 'month' (KHÔNG có 'week').
   * Không gửi thì backend tự chọn độ chi tiết theo độ dài khoảng đã lọc
   * (`pickGranularity`) — xem ReportingService.runSeries.
   */
  gran?: 'hour' | 'day' | 'month';
};

export type ReportMeta = {
  cubes: Array<{
    key: string;
    label: string;
    dimensions: Array<{ key: string; label: string; filterable: boolean }>;
    measures: Array<{ key: string; label: string; kind: string; unit: string | null }>;
  }>;
  dataStart: string;
};

export type ReportResult = {
  columns: Array<{ key: string; label: string; type: 'dim' | 'measure'; unit?: string }>;
  rows: Array<{ dims: Record<string, string>; measures: Record<string, number | null> }>;
  /** Tổng THẬT của toàn kỳ — backend tính riêng, KHÔNG phụ thuộc `limit`. Đừng tự cộng lại ở FE. */
  totals: Record<string, number | null>;
  meta: { rowCount: number; truncated: boolean; warnings: string[] };
};

export type ReportSeries = {
  granularity: 'hour' | 'day' | 'month';
  points: Array<{ bucket: string; measures: Record<string, number | null> }>;
  warnings: string[];
};

/**
 * Một dòng drill-down của cube `booking` — khớp `bookingCube.rowSelect` ở
 * report-registry.ts. `scheduledTime`/`scheduledFromTime` không có trong brief gốc
 * (Task 7) nhưng backend THẬT trả về — thêm vào đây để Task 8-9 không thiếu field.
 */
export type ReportRow = {
  id: string;
  createdAt: string;
  status: string;
  serviceType: string;
  requestedVehicleType: string | null;
  requestedSeats: number | null;
  price: number | null;
  driverId: string | null;
  cancelledByRole: string | null;
  cancelReason: string | null;
  scheduledTime: string | null;
  scheduledFromTime: string | null;
};

export type ReportRowsResult = {
  page: number;
  pageSize: number;
  rows: ReportRow[];
};

export function buildReportParams(spec: ReportSpec): URLSearchParams {
  const p = new URLSearchParams({
    cube: spec.cube,
    dims: spec.dims.join(','),
    measures: spec.measures.join(','),
    from: spec.from,
    to: spec.to,
  });
  const active = Object.fromEntries(
    Object.entries(spec.filters).filter(([, v]) => Array.isArray(v) && v.length > 0),
  );
  if (Object.keys(active).length > 0) p.set('filters', JSON.stringify(active));
  if (spec.includeTest) p.set('includeTest', 'true');
  if (spec.limit != null) p.set('limit', String(spec.limit));
  if (spec.gran != null) p.set('gran', spec.gran);
  return p;
}
