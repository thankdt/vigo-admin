'use client';

import * as React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Info, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api-error';
import { formatVND, formatVnDateTime } from '@/lib/format-vn';
import {
  adminListReferrerTrips,
  type AdminReferrerSummary,
  type AdminReferrerTripRow,
  type AdminReferrerTripsResponse,
  type ReferrerTripSource,
} from '@/lib/api';

const PAGE_SIZE = 20;

const SOURCE_LABEL: Record<ReferrerTripSource, string> = {
  TRIP: 'Chuyến',
  AGENT: 'Đặt hộ',
  KOL_OVERRIDE: 'Thủ lĩnh KOL',
};

const SOURCE_CLASS: Record<ReferrerTripSource, string> = {
  TRIP: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  AGENT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  KOL_OVERRIDE: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300',
};

/** Đối tượng đứng bên kia khoản hoa hồng — khác nghĩa theo từng nguồn. */
const COUNTERPARTY_HINT: Record<ReferrerTripSource, string> = {
  TRIP: 'Người được mời',
  AGENT: 'Khách của chuyến',
  KOL_OVERRIDE: 'KOL tuyến dưới',
};

/**
 * Tab "Chuyến có hoa hồng" trong drill-down của một người giới thiệu.
 *
 * Tự quản fetch/phân trang/bộ lọc. Mỗi dòng là một (nguồn tiền, đơn hàng) ĐÃ NET thu hồi —
 * dòng net 0 vẫn hiện, vì ẩn đi thì tổng trên màn vượt ví và người soát không thấy chuyến
 * nào đã bị thu hồi.
 *
 * `onOpenBooking` do trang cha giữ: `BookingDetail` tự render Dialog riêng nên phải mount ở
 * cấp cha (anh em của DialogContent), không lồng vào trong bảng này.
 */
export function ReferrerTripsTab({
  referrer,
  onOpenBooking,
}: {
  referrer: AdminReferrerSummary;
  onOpenBooking: (bookingId: string) => void;
}) {
  const [res, setRes] = React.useState<AdminReferrerTripsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<{ status: number; message: string } | null>(null);

  const [page, setPage] = React.useState(1);
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [source, setSource] = React.useState<ReferrerTripSource | 'ALL'>('ALL');

  // Đổi người giới thiệu → mọi bộ lọc/trang về mặc định, không mang trạng thái của người cũ sang.
  React.useEffect(() => {
    setPage(1);
    setFrom('');
    setTo('');
    setSource('ALL');
  }, [referrer.id]);

  // Chỉ gửi khoảng ngày khi ĐỦ CẢ HAI đầu — BE trả 400 cho nửa khoảng (cố ý, xem DTO).
  const rangeReady = (!!from && !!to) || (!from && !to);

  // Chống race: người dùng đổi trang/bộ lọc nhanh thì response về sau không được ghi đè
  // response mới hơn. Không có cờ này thì bảng nhấp nháy về dữ liệu cũ.
  const reqIdRef = React.useRef(0);

  const load = React.useCallback(async () => {
    if (!rangeReady) return;
    const myReq = ++reqIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const r = await adminListReferrerTrips(referrer.id, {
        page,
        limit: PAGE_SIZE,
        from: from || undefined,
        to: to || undefined,
        source: source === 'ALL' ? undefined : source,
      });
      if (myReq !== reqIdRef.current) return;
      setRes(r);
    } catch (err: any) {
      if (myReq !== reqIdRef.current) return;
      // Lỗi hiện INLINE, không toast: tab bên cạnh ("Người được mời") vẫn dùng được bình thường.
      setError({
        status: err instanceof ApiError ? err.httpStatus : 0,
        message: err?.message ?? 'Không tải được danh sách chuyến',
      });
      setRes(null);
    } finally {
      if (myReq === reqIdRef.current) setIsLoading(false);
    }
  }, [referrer.id, page, from, to, source, rangeReady]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [from, to, source, referrer.id]);

  const rows = res?.data ?? [];
  const totals = res?.meta.totals;
  const totalPages = res?.meta.totalPages ?? 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Ngày ghi có hoa hồng (giờ VN)</label>
          <div className="flex gap-2">
            <Input type="date" className="sm:w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" className="sm:w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <Select value={source} onValueChange={(v) => setSource(v as ReferrerTripSource | 'ALL')}>
          <SelectTrigger className="sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả nguồn</SelectItem>
            <SelectItem value="TRIP">Chuyến giới thiệu</SelectItem>
            <SelectItem value="AGENT">Đặt hộ</SelectItem>
            <SelectItem value="KOL_OVERRIDE">Thủ lĩnh KOL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!rangeReady && (
        <p className="text-sm text-amber-600">Chọn đủ cả ngày bắt đầu và ngày kết thúc để lọc.</p>
      )}

      {error ? (
        <div className="rounded border border-dashed p-6 text-center text-sm">
          {error.status === 404 ? (
            <>
              <p className="font-medium">Máy chủ chưa hỗ trợ danh sách chuyến</p>
              <p className="text-muted-foreground mt-1">
                Tính năng cần bản backend mới. Tab &quot;Người được mời&quot; vẫn dùng bình thường.
              </p>
            </>
          ) : error.status === 403 ? (
            <p className="text-muted-foreground">Bạn không có quyền xem sổ hoa hồng theo chuyến.</p>
          ) : (
            <>
              <p className="text-muted-foreground">{error.message}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Thử lại</Button>
            </>
          )}
        </div>
      ) : isLoading && !res ? (
        <div className="space-y-2 py-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <>
          <div className="relative overflow-x-auto">
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nguồn</TableHead>
                  <TableHead>Chuyến</TableHead>
                  <TableHead>Đối tượng</TableHead>
                  <TableHead>Ngày ghi có</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                      Chưa có chuyến nào phát sinh hoa hồng cho người này.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => <TripRow key={r.key} row={r} onOpenBooking={onOpenBooking} />)
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-sm text-muted-foreground">
                Trang {page}/{totalPages} · {res?.meta.total ?? 0} dòng hoa hồng
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {totals && <ReconcileFooter totals={totals} referrer={referrer} filtered={!!from && !!to} />}
        </>
      )}
    </div>
  );
}

function TripRow({
  row,
  onOpenBooking,
}: {
  row: AdminReferrerTripRow;
  onOpenBooking: (bookingId: string) => void;
}) {
  // Chỉ dòng có chuyến THẬT mới mở được. Đơn bao xe / dòng chưa gắn chuyến không có gì để mở.
  const canOpen = !!row.bookingId;
  const b = row.booking;

  return (
    <TableRow
      className={canOpen ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default'}
      onClick={canOpen ? () => onOpenBooking(row.bookingId!) : undefined}
    >
      <TableCell>
        <Badge className={SOURCE_CLASS[row.source]}>{SOURCE_LABEL[row.source]}</Badge>
      </TableCell>
      <TableCell>
        {row.orderKind === 'BOOKING' ? (
          <span className="font-mono text-xs">{row.orderId?.slice(0, 8)}…</span>
        ) : row.orderKind === 'MULTI_STOP' ? (
          <Badge variant="secondary">Đơn bao xe</Badge>
        ) : (
          <Badge variant="outline">Không gắn chuyến</Badge>
        )}
        {b && (
          <div className="text-xs text-muted-foreground mt-0.5 max-w-[280px] truncate">
            {b.isTestTrip && <span className="text-amber-600 font-medium">Chuyến test · </span>}
            {formatVND(b.price)}
            {b.pickupAddress ? ` · ${b.pickupAddress}` : ''}
            {b.dropoffAddress ? ` → ${b.dropoffAddress}` : ''}
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="text-sm">{row.counterparty?.fullName ?? '—'}</div>
        <div className="text-xs text-muted-foreground">
          {row.counterparty?.phone ?? COUNTERPARTY_HINT[row.source]}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatVnDateTime(row.creditedAt)}
        {row.clawedBackAt && (
          <div className="text-destructive">Thu hồi {formatVnDateTime(row.clawedBackAt)}</div>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className={`tabular-nums font-medium ${row.amount < 0 ? 'text-destructive' : ''}`}>
          {formatVND(row.amount)}
        </div>
        {row.clawedBack && (
          <div className="text-xs text-muted-foreground">
            gốc {formatVND(row.grossAmount)} · đã thu hồi
          </div>
        )}
        {row.walletType === 'DRIVER_MAIN' && (
          <Badge variant="outline" className="mt-0.5 text-[10px]">Ví tài xế</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * Khối đối soát — in ra thành ĐẲNG THỨC để người đọc tự kiểm, không bắt tin một con số gộp.
 *
 * Chỉ in đẳng thức khi KHÔNG lọc ngày: lọc rồi thì tổng của khoảng đương nhiên không bằng lũy
 * kế cả đời, in ra sẽ trông như số sai.
 */
function ReconcileFooter({
  totals,
  referrer,
  filtered,
}: {
  totals: AdminReferrerTripsResponse['meta']['totals'];
  referrer: AdminReferrerSummary;
  filtered: boolean;
}) {
  return (
    <div className="rounded bg-muted/50 p-3 text-xs space-y-1">
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-medium">
        <span>Chuyến {formatVND(totals.trip)}</span>
        <span>+ Đặt hộ {formatVND(totals.agent)}</span>
        <span>+ Thủ lĩnh KOL {formatVND(totals.kolOverride)}</span>
        <span>= {formatVND(totals.affiliate)}</span>
      </div>
      {totals.agentDriverWallet !== 0 && (
        <div className="text-muted-foreground">
          Đặt hộ trả vào ví tài xế: {formatVND(totals.agentDriverWallet)} — KHÔNG nằm trong lũy kế affiliate.
        </div>
      )}
      <div className="flex items-start gap-1.5 text-muted-foreground pt-1">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          {filtered
            ? 'Tổng ở trên là của khoảng ngày đang lọc, không phải lũy kế cả đời.'
            : referrer.lifetimeTotal != null
              ? `Bảng này CHỈ gồm chuyến có hoa hồng — chưa gồm thưởng đăng ký và khoản điều chỉnh, nên nhỏ hơn lũy kế ${formatVND(referrer.lifetimeTotal)}.`
              : 'Bảng này CHỈ gồm chuyến có hoa hồng — chưa gồm thưởng đăng ký và khoản điều chỉnh.'}
        </span>
      </div>
    </div>
  );
}
