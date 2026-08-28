'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Loader2, Route as RouteIcon, Search, TrendingDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getPoolingSuggestions, type PoolSuggestions } from '@/lib/api';
import {
  formatVnd,
  REJECT_HINT,
  REJECT_LABEL,
  shortAddress,
  shortId,
  vnTime,
  vnToday,
} from './pooling-labels';

/**
 * Gợi ý gom chuyến — màn QUAN SÁT.
 *
 * Không có nút hành động nào và đó là chủ ý: mục tiêu của bản này là để người
 * vận hành xác nhận thuật toán nghĩ đúng TRƯỚC khi cho nó chạm vào chuyến thật.
 * Thêm nút "gom ngay" ở đây là bỏ qua chính bước kiểm chứng mà màn này sinh ra.
 */
export default function PoolingPage() {
  const { toast } = useToast();
  const [date, setDate] = React.useState(vnToday());
  const [corridorKm, setCorridorKm] = React.useState('5');
  const [windowHours, setWindowHours] = React.useState('2');
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<PoolSuggestions | null>(null);

  const run = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPoolingSuggestions({
        date,
        corridorKm: Number(corridorKm) || undefined,
        windowHours: Number(windowHours) || undefined,
      });
      setData(res);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Không lấy được gợi ý',
        description: e?.message ?? 'Lỗi không rõ',
      });
    } finally {
      setLoading(false);
    }
  }, [date, corridorKm, windowHours, toast]);

  // Cố ý KHÔNG tự chạy khi mở trang: mỗi lượt quét gọi API bản đồ cho từng nhóm
  // tìm được, nên để admin bấm thì tải nằm trong tay người dùng.
  return (
    <div className="space-y-4">
      <PageHeader
        title="Gợi ý gom chuyến"
        description="Xem những chuyến lẻ có thể gom chung một xe. Chỉ quan sát — không tạo chuyến, không gán tài xế."
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="pool-date">Ngày (giờ VN)</Label>
            <Input
              id="pool-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[170px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pool-corridor">Lệch tuyến tối đa (km)</Label>
            <Input
              id="pool-corridor"
              type="number"
              min={1}
              max={20}
              value={corridorKm}
              onChange={(e) => setCorridorKm(e.target.value)}
              className="w-[170px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pool-window">Lệch giờ tối đa (giờ)</Label>
            <Input
              id="pool-window"
              type="number"
              min={1}
              max={12}
              value={windowHours}
              onChange={(e) => setWindowHours(e.target.value)}
              className="w-[170px]"
            />
          </div>
          <Button onClick={run} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Quét
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Nới hai ngưỡng trên sẽ ra nhiều gợi ý hơn, nhưng tài xế phải vòng xa hơn.
          Con số ở đây chỉ dùng để xem thử — chưa áp vào hệ thống thật.
        </p>
      </Card>

      {data && <Summary data={data} />}
      {data?.groups.map((g) => (
        <GroupCard key={g.anchorBookingId} group={g} />
      ))}

      {data && data.groups.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Không có nhóm nào gom được với ngưỡng hiện tại. Đã quét {data.scanned} chuyến
          đi chung trong ngày.
        </Card>
      )}
    </div>
  );
}

function Summary({ data }: { data: PoolSuggestions }) {
  const pooled = data.groups.reduce((n, g) => n + g.bookingIds.length, 0);
  // Cộng hết (chốt 28/08). Vẫn đếm số chuyến chưa có giá để ghi chú — hiện
  // tổng mà không nói còn thiếu thì admin đọc nó như doanh thu đầy đủ.
  const tongTien = data.groups.reduce((s, g) => s + (Number(g.totalPrice) || 0), 0);
  const thieuGia = data.groups.reduce((s, g) => s + g.missingPriceCount, 0);
  return (
    <Card className="p-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Chuyến đã quét" value={String(data.scanned)} />
        <Stat label="Nhóm gom được" value={String(data.groups.length)} />
        <Stat label="Chuyến nằm trong nhóm" value={String(pooled)} />
        <Stat
          label="Tổng tiền các nhóm"
          value={`${formatVnd(tongTien)}${thieuGia > 0 ? ' *' : ''}`}
          hint={
            thieuGia > 0
              ? `Chưa gồm ${thieuGia} chuyến không có giá`
              : 'Cộng giá từng khách trong mọi nhóm gợi ý'
          }
        />
        <Stat
          label="Tiết kiệm"
          value={`${data.totalSavedKm} km`}
          hint="Tổng quãng chạy lẻ trừ đi tổng quãng khi gom"
          icon={<TrendingDown className="h-4 w-4 text-emerald-600" />}
        />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div title={hint}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  );
}

/**
 * Tên khách của một chuyến trong nhóm, để dải "thứ tự chạy" đọc được thành
 * câu người — "Đón Nguyễn A → Đón Trần B" — thay vì một dãy id băm.
 *
 * Khách chưa có tên (dữ liệu cũ) thì rơi về id rút gọn chứ không để trống: một
 * ô trống giữa dải mũi tên trông như thiếu điểm dừng.
 */
function tenKhach(
  g: PoolSuggestions['groups'][number],
  bookingId: string,
): string {
  const p = g.passengers.find((x) => x.bookingId === bookingId);
  return p?.customerName?.trim() || shortId(bookingId);
}

function GroupCard({ group: g }: { group: PoolSuggestions['groups'][number] }) {
  const rejects = Object.entries(g.rejected).filter(([, n]) => n > 0);
  const anchorRoute = g.passengers.find((p) => p.isAnchor)?.routeName ?? null;
  const soKhacTuyen = g.passengers.filter(
    (p) => !p.isAnchor && p.routeName && p.routeName !== anchorRoute,
  ).length;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RouteIcon className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">
          {g.bookingIds.length} chuyến · {g.totalSeats} khách
        </span>
        {anchorRoute && <Badge variant="outline">{anchorRoute}</Badge>}
        {soKhacTuyen > 0 && (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            +{soKhacTuyen} khác tuyến
          </Badge>
        )}
        <Badge variant="secondary">
          {formatVnd(g.totalPrice)}
          {g.missingPriceCount > 0 && ' *'}
        </Badge>
        {g.savedKm != null && (
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            tiết kiệm {g.savedKm} km
          </Badge>
        )}
        {g.pooledDistanceKm != null && (
          <span className="text-xs text-muted-foreground">
            gom {g.pooledDistanceKm} km
            {g.separateDistanceKm != null && ` · chạy lẻ ${g.separateDistanceKm} km`}
            {g.pooledDurationMin != null && ` · ~${g.pooledDurationMin} phút`}
          </span>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Khách</TableHead>
            <TableHead>Tuyến</TableHead>
            <TableHead>Điện thoại</TableHead>
            <TableHead className="whitespace-nowrap">Giờ đón</TableHead>
            <TableHead>Đón</TableHead>
            <TableHead>Trả</TableHead>
            <TableHead className="text-right">Khách</TableHead>
            <TableHead className="text-right">Tiền</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {g.passengers.map((p) => (
            <TableRow key={p.bookingId}>
              <TableCell>
                <div className="font-medium">{p.customerName ?? '—'}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {shortId(p.bookingId)}
                  {p.isAnchor && <span className="ml-1.5">(chuyến chủ)</span>}
                </div>
              </TableCell>
              <TableCell className="text-xs">
                {p.routeName ?? '—'}
                {/* Khác tuyến chuyến chủ = ĐÚNG ca ghép theo hành lang, thứ mà
                    cách so routeId hiện tại không nhìn thấy. Đánh dấu để admin
                    nhận ra ngay giá trị mới nằm ở đâu. */}
                {!p.isAnchor && p.routeName && p.routeName !== anchorRoute && (
                  <Badge
                    variant="outline"
                    className="ml-1.5 border-amber-300 bg-amber-50 font-normal text-amber-800"
                    title="Khác tuyến chuyến chủ — chỉ ghép theo hành lang mới thấy được"
                  >
                    khác tuyến
                  </Badge>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap font-mono text-xs">
                {p.customerPhone ?? '—'}
              </TableCell>
              <TableCell className="whitespace-nowrap font-medium">
                {vnTime(p.pickupAt)}
              </TableCell>
              <TableCell className="text-xs" title={p.pickupAddress ?? undefined}>
                {shortAddress(p.pickupAddress)}
                {p.pickupCrossMeters > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    (lệch {(p.pickupCrossMeters / 1000).toFixed(1)}km)
                  </span>
                )}
              </TableCell>
              <TableCell className="text-xs" title={p.dropoffAddress ?? undefined}>
                {shortAddress(p.dropoffAddress)}
                {p.dropoffCrossMeters > 0 && (
                  <span className="ml-1 text-muted-foreground">
                    (lệch {(p.dropoffCrossMeters / 1000).toFixed(1)}km)
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">{p.seats}</TableCell>
              <TableCell className="text-right font-medium">
                {formatVnd(p.price)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/40">
            <TableCell colSpan={6} className="font-semibold">
              Tổng nhóm
            </TableCell>
            <TableCell className="text-right font-semibold">{g.totalSeats}</TableCell>
            <TableCell
              className="text-right font-semibold"
              title={
                g.missingPriceCount > 0
                  ? `Chưa gồm ${g.missingPriceCount} chuyến không có giá`
                  : undefined
              }
            >
              {formatVnd(g.totalPrice)}
              {g.missingPriceCount > 0 && ' *'}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      {g.stops ? (
        <div className="mt-3 border-t pt-3">
          <div className="mb-1.5 text-xs text-muted-foreground">Thứ tự chạy:</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {g.stops.map((s, i) => (
              <React.Fragment key={`${s.bookingId}-${s.kind}-${i}`}>
                {i > 0 && <span className="text-muted-foreground">→</span>}
                <Badge
                  variant={s.kind === 'DON' ? 'default' : 'secondary'}
                  className="font-normal"
                  title={s.bookingId}
                >
                  {s.kind === 'DON' ? 'Đón' : 'Trả'} {tenKhach(g, s.bookingId)}
                </Badge>
              </React.Fragment>
            ))}
          </div>
        </div>
      ) : (
        // Thứ tự điểm dừng CỐ Ý không hiện khi API sắp thứ tự lỗi. Bịa một thứ
        // tự trông y hệt thứ tự thật, mà đây lại là thứ admin dựa vào để đánh
        // giá thuật toán.
        <p className="mt-3 border-t pt-3 text-sm text-amber-700">
          Chưa sắp được thứ tự điểm dừng (API bản đồ không phản hồi).
        </p>
      )}

      {rejects.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <div className="mb-1.5 text-xs text-muted-foreground">
            Chuyến khác đã bị loại khỏi nhóm này:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {rejects.map(([reason, n]) => (
              <Badge
                key={reason}
                variant="outline"
                className="font-normal"
                title={REJECT_HINT[reason as keyof typeof REJECT_HINT]}
              >
                {REJECT_LABEL[reason as keyof typeof REJECT_LABEL]}: {n}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
