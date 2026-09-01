'use client';

import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getReportSeries, type ReportSeries, type ReportSpec } from '@/lib/api';

/**
 * `series.points[i].bucket` là KHOÁ thô backend dùng để gộp nhóm (`vnBucket` ở
 * `vn-time.util.ts`), KHÔNG phải nhãn hiển thị:
 *   - giờ:  'YYYY-MM-DD HH:00' → chỉ lấy phần 'HH:00'
 *   - ngày: 'YYYY-MM-DD'       → 'DD/MM'
 *   - tháng:'YYYY-MM'          → 'MM/YYYY'
 * Cắt chuỗi thuần (không dựng `Date`) vì khoá đã là giờ VN sẵn — không có gì để quy đổi
 * múi giờ thêm, và tránh mọi rủi ro giờ máy chạy test/build lệch UTC.
 */
export function formatBucketLabel(bucket: string, granularity: ReportSeries['granularity']): string {
  if (granularity === 'hour') {
    const hh = bucket.split(' ')[1];
    return hh ?? bucket;
  }
  const parts = bucket.split('-');
  if (granularity === 'day' && parts.length === 3) {
    const [, mo, d] = parts;
    return `${d}/${mo}`;
  }
  if (granularity === 'month' && parts.length === 2) {
    const [y, mo] = parts;
    return `${mo}/${y}`;
  }
  return bucket;
}

/** Vẽ tối đa hai chỉ số đếm đầu tiên của preset — nhiều hơn thì biểu đồ hết đọc được. */
export function ReportChart({
  spec,
  measureLabels,
}: {
  spec: ReportSpec;
  /** Nhãn tiếng Việt cho từng khoá measure (từ `result.columns` của bảng cùng preset) —
   *  dùng cho tên đường vẽ + chú giải. Thiếu thì rơi về khoá thô (vd lúc bảng chưa tải). */
  measureLabels?: Record<string, string>;
}) {
  const [series, setSeries] = React.useState<ReportSeries | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    // Reset ngay khi spec đổi: đừng để biểu đồ của kỳ CŨ đứng yên giả làm kỳ mới
    // trong lúc đang chờ response.
    setSeries(null);
    setIsLoading(true);
    setError(null);
    getReportSeries(spec)
      .then((s) => { if (!cancelled) setSeries(s); })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Không tải được biểu đồ.');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [spec]);

  if (isLoading && !series && !error) {
    return (
      <div data-testid="report-chart-loading" className="flex justify-center rounded-md border p-4 py-16">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="report-chart-error"
        className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!series || series.points.length === 0) return null;

  const keys = spec.measures.filter((k) => !k.endsWith('Pct')).slice(0, 2);
  // `p.measures[k]` giữ nguyên `null` khi backend báo "không có dữ liệu" — KHÔNG
  // ép về 0, kẻo biểu đồ vẽ nhầm thành "0 chuyến". Recharts tự ngắt quãng đường
  // vẽ tại điểm giá trị null/undefined thay vì nối xuống đáy.
  const data = series.points.map((p) => ({
    bucket: p.bucket,
    ...Object.fromEntries(keys.map((k) => [k, p.measures[k]])),
  }));
  const granularity = series.granularity;
  const labelOf = (k: string) => measureLabels?.[k] ?? k;

  return (
    <div className="rounded-md border p-4">
      <p className="mb-3 text-sm font-medium">
        Diễn biến theo {granularity === 'month' ? 'tháng' : granularity === 'day' ? 'ngày' : 'giờ'} (giờ Việt Nam)
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => formatBucketLabel(v, granularity)}
          />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={(v: string) => formatBucketLabel(v, granularity)} />
          <Legend />
          {keys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              name={labelOf(k)}
              stroke={i === 0 ? '#0F8A6A' : '#D4761A'}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
