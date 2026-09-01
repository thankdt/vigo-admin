'use client';

import * as React from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getReportSeries, type ReportSeries, type ReportSpec } from '@/lib/api';

/** Vẽ tối đa hai chỉ số đếm đầu tiên của preset — nhiều hơn thì biểu đồ hết đọc được. */
export function ReportChart({ spec }: { spec: ReportSpec }) {
  const [series, setSeries] = React.useState<ReportSeries | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getReportSeries(spec)
      .then((s) => { if (!cancelled) setSeries(s); })
      .catch(() => { if (!cancelled) setSeries(null); });
    return () => { cancelled = true; };
  }, [spec]);

  if (!series || series.points.length === 0) return null;

  const keys = spec.measures.filter((k) => !k.endsWith('Pct')).slice(0, 2);
  // `p.measures[k]` giữ nguyên `null` khi backend báo "không có dữ liệu" — KHÔNG
  // ép về 0, kẻo biểu đồ vẽ nhầm thành "0 chuyến". Recharts tự ngắt quãng đường
  // vẽ tại điểm giá trị null/undefined thay vì nối xuống đáy.
  const data = series.points.map((p) => ({
    bucket: p.bucket,
    ...Object.fromEntries(keys.map((k) => [k, p.measures[k]])),
  }));

  return (
    <div className="rounded-md border p-4">
      <p className="mb-3 text-sm font-medium">
        Diễn biến theo {series.granularity === 'month' ? 'tháng' : series.granularity === 'day' ? 'ngày' : 'giờ'} (giờ Việt Nam)
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          {keys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={i === 0 ? '#0F8A6A' : '#D4761A'} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
