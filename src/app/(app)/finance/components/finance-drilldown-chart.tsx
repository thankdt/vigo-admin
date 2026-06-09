'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { getFinanceSeries, type FinanceSeries } from '@/lib/api';
import type { DateRange } from './finance-filter';

const GRAN_LABEL: Record<string, string> = { hour: 'theo giờ', day: 'theo ngày', month: 'theo tháng' };
const fmtFull = (v: number) => `${new Intl.NumberFormat('vi-VN').format(v)} đ`;
const fmtCompact = (v: number) => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(v);

export function FinanceDrilldownChart({
  metric,
  label,
  range,
  onClose,
}: {
  metric: string;
  label: string;
  range: DateRange;
  onClose: () => void;
}) {
  const [series, setSeries] = React.useState<FinanceSeries | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    getFinanceSeries(metric, range.from, range.to)
      .then((s) => { if (alive) setSeries(s); })
      .catch(() => { if (alive) setSeries(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [metric, range.from, range.to]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">
          {label}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {series ? GRAN_LABEL[series.granularity] : ''}
          </span>
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Đóng biểu đồ">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[300px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !series || series.points.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            Không có dữ liệu trong kỳ.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={series.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={fmtCompact} />
              <Tooltip formatter={(v: number) => [fmtFull(v), label]} />
              <Bar dataKey="value" fill="#2563eb" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
