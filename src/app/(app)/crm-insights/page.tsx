'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toastApiError } from '@/hooks/use-api-error-toast';
import {
  getCrmCallReasons,
  getCrmCsat,
  getCrmRetention,
  getCrmTripFrequency,
  type CrmRetentionRow,
} from '@/lib/api';

/**
 * Ngày VN, ĐỘC LẬP múi giờ trình duyệt — công thức bắt buộc của CLAUDE.md.
 *
 * KHÔNG dùng `toLocaleDateString()` hay `getFullYear/getMonth/getDate` cho ngày nghiệp vụ:
 * chúng phản ánh TZ của máy admin, nên một người mở màn này từ máy đặt giờ Mỹ sẽ thấy
 * khoảng ngày lệch một ngày so với đồng nghiệp ngồi cạnh.
 */
const todayVn = (): string => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const daysAgoVn = (n: number): string =>
  new Date(Date.now() + 7 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);

/**
 * Insights CRM (GĐ7).
 *
 * 🚨 Màn này trả lời câu hỏi mà §14.4 gọi là "quan trọng hơn cả bốn câu hỏi": **85% khách
 * hoàn thành đúng MỘT chuyến**. Cohort giữ chân đo trực tiếp việc chuyển khách đi-một-lần
 * thành đi-lần-hai — bài toán số 1, và rẻ hơn nhiều so với bộ máy phân khúc + chiến dịch.
 */
export default function CrmInsightsPage() {
  const [from, setFrom] = React.useState(daysAgoVn(180));
  const [to, setTo] = React.useState(todayVn());
  const [retention, setRetention] = React.useState<CrmRetentionRow[]>([]);
  const [reasons, setReasons] = React.useState<Array<{ reason: string; outcome: string; n: number }>>([]);
  const [csat, setCsat] = React.useState<{ total: number; average: number | null } | null>(null);
  const [freq, setFreq] = React.useState<Array<{ bucket: string; customers: number }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const [r, c, s, f] = await Promise.all([
          getCrmRetention(from, to),
          getCrmCallReasons(from, to),
          getCrmCsat(from, to),
          getCrmTripFrequency(),
        ]);
        if (cancelled) return;
        setRetention(r);
        setReasons(c);
        setCsat(s);
        setFreq(f);
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toastApiError(e, 'Không tải được số liệu');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Insights khách hàng</h1>
        <p className="text-sm text-muted-foreground">
          Giữ chân theo tháng, lý do CSKH ghi nhận, và mức độ khách quay lại.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6 text-sm">
          <div className="space-y-1">
            <Label htmlFor="ins-from">Từ ngày</Label>
            <Input id="ins-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ins-to">Đến ngày</Label>
            <Input id="ins-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button onClick={() => setReloadKey((k) => k + 1)}>Xem</Button>
          <span className="text-xs text-muted-foreground">Khoảng ngày theo giờ Việt Nam.</span>
        </CardContent>
      </Card>

      {failed ? <p className="text-sm text-destructive">Không tải được số liệu.</p> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Khách quay lại (toàn thời gian)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {loading ? (
            <p className="text-muted-foreground">Đang tải…</p>
          ) : freq.length === 0 ? (
            <p className="text-muted-foreground">Chưa có chuyến hoàn thành nào.</p>
          ) : (
            <ul className="flex flex-wrap gap-6" data-testid="crm-freq">
              {freq.map((f) => (
                <li key={f.bucket}>
                  <div className="text-xs text-muted-foreground">{f.bucket} chuyến</div>
                  <div className="text-lg font-semibold">{f.customers.toLocaleString('vi-VN')}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Giữ chân theo tháng khách đi chuyến đầu</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {loading ? (
            <p className="text-muted-foreground">Đang tải…</p>
          ) : retention.length === 0 ? (
            <p className="text-muted-foreground">Không có khách nào đi chuyến đầu trong kỳ này.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tháng</TableHead>
                  <TableHead>Khách mới</TableHead>
                  <TableHead>Quay lại (≥2)</TableHead>
                  <TableHead>Tỉ lệ quay lại</TableHead>
                  <TableHead>Đi ≥3 lần</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {retention.map((r) => (
                  <TableRow key={r.cohortMonth} data-testid="crm-retention-row">
                    <TableCell>{r.cohortMonth}</TableCell>
                    <TableCell>{r.customers}</TableCell>
                    <TableCell>{r.returned}</TableCell>
                    <TableCell>
                      {r.customers > 0 ? `${Math.round((r.returned / r.customers) * 100)}%` : '—'}
                    </TableCell>
                    <TableCell>{r.returned3Plus}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lý do CSKH ghi nhận khi gọi</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {loading ? (
            <p className="text-muted-foreground">Đang tải…</p>
          ) : reasons.length === 0 ? (
            <p className="text-muted-foreground">Chưa có cuộc gọi nào được ghi nhận trong kỳ.</p>
          ) : (
            <ul className="space-y-1 text-xs" data-testid="crm-reasons">
              {reasons.map((r, i) => (
                <li key={i}>
                  {r.reason} · {r.outcome}: <b>{r.n}</b>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Đánh giá của khách (CSAT)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {loading ? (
            <p className="text-muted-foreground">Đang tải…</p>
          ) : !csat || csat.total === 0 ? (
            /*
              🚨 Rỗng ở đây là SỰ THẬT, không phải lỗi: tính năng đánh giá chuyến gần như
              không ai dùng (§14.4 — bảng driver_trip_rating trên DEV có đúng 1 dòng). Nói
              thẳng điều đó, và nói luôn việc cần làm — nếu chỉ hiện bảng trống thì người
              đọc sẽ kết luận "báo cáo hỏng".
            */
            <p className="text-muted-foreground" data-testid="crm-csat-empty">
              Chưa có đánh giá nào trong kỳ. Đây thường là do khách không đánh giá, không
              phải lỗi số liệu — muốn có dữ liệu thì phải nhắc khách chấm sao sau chuyến,
              hoặc hỏi ngay trong cuộc gọi sau của hàng đợi CSKH.
            </p>
          ) : (
            <p data-testid="crm-csat">
              Trung bình <b>{csat.average?.toFixed(2)}</b> sao trên {csat.total} lượt đánh giá.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
