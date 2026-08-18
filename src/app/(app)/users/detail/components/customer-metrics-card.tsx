'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { getCrmCustomerMetrics, type CrmCustomerMetrics } from '@/lib/api';
import { formatVnDateTime } from '../../../leakage-review/leakage-labels';
import {
  CHURN_LABEL,
  SEGMENT_ACTION,
  SEGMENT_LABEL,
} from '../../../crm-segments/segment-labels';

/**
 * Hàng chỉ số + badge phân khúc trên hồ sơ 360 (§6.3 gán cho GĐ4).
 *
 * 🚨 Số ở đây là ẢNH CHỤP của cron 03:00 giờ VN, KHÔNG phải realtime — nên luôn in kèm mốc
 * `computedAt`. Không có mốc đó thì admin thấy "0 chuyến" cho một khách vừa đi hôm qua và
 * kết luận hệ thống sai, trong khi sự thật là cron chưa chạy lại.
 *
 * `null` (cron chưa chạy tới khách này) phải phân biệt với "khách chưa đi chuyến nào" —
 * hai câu chữ khác nhau, nếu không admin không biết nên chờ hay nên báo.
 */
export function CustomerMetricsCard({ userId }: { userId: string }) {
  const [data, setData] = React.useState<CrmCustomerMetrics | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await getCrmCustomerMetrics(userId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toastApiError(e, 'Không tải được chỉ số khách');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Chỉ số &amp; phân khúc</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {loading ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : failed ? (
          <p className="text-destructive">Không tải được chỉ số khách.</p>
        ) : !data ? (
          <p className="text-muted-foreground">
            Chưa có chỉ số cho khách này — cron tính chỉ số chạy 03:00 hằng ngày (giờ VN).
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{SEGMENT_LABEL[data.segment] ?? data.segment}</Badge>
              {/* Nguy cơ rời bỏ chỉ có nghĩa với khách F≥2 — BE đã áp định nghĩa hẹp đó,
                  FE chỉ hiển thị lại, KHÔNG tự suy (§13.2). */}
              {data.churnRisk !== 'LOW' ? (
                <Badge variant="destructive">
                  Nguy cơ rời bỏ: {CHURN_LABEL[data.churnRisk]}
                </Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {SEGMENT_ACTION[data.segment] ?? ''}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              <Metric label="Chuyến hoàn thành" value={String(data.tripsCompleted)} />
              <Metric label="Chuyến huỷ" value={String(data.tripsCancelled)} />
              <Metric
                label="Tổng chi tiêu"
                value={`${Number(data.gmv).toLocaleString('vi-VN')}đ`}
              />
              <Metric
                label="Sao TB khách chấm"
                value={data.avgStarsGiven ? Number(data.avgStarsGiven).toFixed(2) : '—'}
              />
              <Metric label="Chuyến đầu" value={formatVnDateTime(data.firstTripAt)} />
              <Metric label="Chuyến gần nhất" value={formatVnDateTime(data.lastTripAt)} />
              <Metric label="Điểm R/F/M" value={`${data.rScore}/${data.fScore}/${data.mScore}`} />
            </dl>

            <p className="text-xs text-muted-foreground" data-testid="crm-metrics-computed-at">
              Số liệu tính lúc {formatVnDateTime(data.computedAt)} — không phải thời gian thực.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
