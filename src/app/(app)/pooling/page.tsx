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
import { REJECT_HINT, REJECT_LABEL, shortId, vnToday } from './pooling-labels';

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
  return (
    <Card className="p-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Chuyến đã quét" value={String(data.scanned)} />
        <Stat label="Nhóm gom được" value={String(data.groups.length)} />
        <Stat label="Chuyến nằm trong nhóm" value={String(pooled)} />
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

function GroupCard({ group: g }: { group: PoolSuggestions['groups'][number] }) {
  const rejects = Object.entries(g.rejected).filter(([, n]) => n > 0);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RouteIcon className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">
          {g.bookingIds.length} chuyến · {g.totalSeats} khách
        </span>
        <Badge variant="outline">chủ: {shortId(g.anchorBookingId)}</Badge>
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

      {g.stops ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead className="w-24">Việc</TableHead>
              <TableHead>Chuyến</TableHead>
              <TableHead className="text-right">Lệch tuyến</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {g.stops.map((s, i) => (
              <TableRow key={`${s.bookingId}-${s.kind}-${i}`}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <Badge variant={s.kind === 'DON' ? 'default' : 'secondary'}>
                    {s.kind === 'DON' ? 'Đón' : 'Trả'}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {shortId(s.bookingId)}
                  {s.bookingId === g.anchorBookingId && (
                    <span className="ml-2 text-muted-foreground">(chủ)</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {s.crossMeters > 0 ? `${(s.crossMeters / 1000).toFixed(1)} km` : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        // Thứ tự điểm dừng CỐ Ý không hiện khi API sắp thứ tự lỗi. Bịa một thứ
        // tự trông y hệt thứ tự thật, mà đây lại là thứ admin dựa vào để đánh
        // giá thuật toán.
        <p className="text-sm text-amber-700">
          Chưa sắp được thứ tự điểm dừng (API bản đồ không phản hồi). Nhóm vẫn ghép
          được, chỉ là chưa biết đi theo thứ tự nào.
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
