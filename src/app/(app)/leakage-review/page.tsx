'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ShieldAlert, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getLeakageTraces, updateLeakageTraceStatus } from '@/lib/api';
import type { LeakageTraceRow, LeakageTraceStatus, LeakageVerdict } from '@/lib/types';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';
import { STATUS_LABEL, VERDICT_LABEL, addressText, formatVnDateTime, statusBadgeVariant, verdictBadgeClass } from './leakage-labels';
import { TraceDetailSheet } from './components/trace-detail-sheet';

const COL_COUNT = 6;
/** Backend caps the list; surface it rather than silently truncating. */
const LIST_CAP = 500;
const ALL = 'ALL';

/** Key-coupled, not index-coupled: reordering PRESETS must not desync the range
 *  from the highlighted chip (the exact bug `initialPreset` exists to prevent). */
const DEFAULT_PRESET = 'last7';
const defaultRange = () => (PRESETS.find((p) => p.key === DEFAULT_PRESET) ?? PRESETS[0]).range();

export default function LeakageReviewPage() {
  // Traces are rare — "Hôm nay" is usually empty, so default to 7 days.
  const [range, setRange] = React.useState<DateRange>(defaultRange());
  const [status, setStatus] = React.useState<LeakageTraceStatus | typeof ALL>(ALL);
  const [verdict, setVerdict] = React.useState<LeakageVerdict | typeof ALL>(ALL);
  const [driverUserId, setDriverUserId] = React.useState<string | null>(null);
  const [driverLabel, setDriverLabel] = React.useState<string>('');
  const [rows, setRows] = React.useState<LeakageTraceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<LeakageTraceRow | null>(null);
  const { toast } = useToast();

  // The debounce cancels the pending timer, not an in-flight request. Without a
  // sequence guard, a slow earlier fetch can resolve last and overwrite the list
  // with data that contradicts the current filters.
  const reqIdRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await getLeakageTraces({
        from: range.from,
        to: range.to,
        ...(status !== ALL && { status }),
        ...(verdict !== ALL && { verdict }),
        ...(driverUserId && { driverUserId }),
      });
      if (reqId !== reqIdRef.current) return; // superseded — drop the stale result
      setRows(data);
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return;
      toast({ variant: 'destructive', title: 'Không tải được danh sách nghi vấn', description: err.message });
    } finally {
      // Only the newest request may clear the spinner.
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [range.from, range.to, status, verdict, driverUserId, toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const handleUpdateStatus = async (id: string, next: LeakageTraceStatus) => {
    try {
      await updateLeakageTraceStatus(id, next);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
      setSelected((prev) => (prev && prev.id === id ? { ...prev, status: next } : prev));
      toast({ title: 'Đã cập nhật', description: `Trạng thái: ${STATUS_LABEL[next]}.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không cập nhật được', description: err.message });
      load(); // resync — our optimistic view may be wrong
    }
  };

  const filterByDriver = (row: LeakageTraceRow) => {
    if (!row.driver) return;
    setDriverUserId(row.driver.userId);
    setDriverLabel(row.driver.fullName || row.driver.phone || row.driver.userId);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nghi vấn gian lận"
        description="Chuyến bị khách huỷ sau khi tài xế đã nhận, nhưng tài xế vẫn đi qua điểm đón→đến. Kết luận chỉ hiện SAU KHI cửa sổ canh đóng (~3 giờ sau khi huỷ; chuyến hẹn giờ có thể vài ngày) — huỷ xong mở trang ngay sẽ chưa thấy gì. Đây chỉ là tín hiệu để người xem xét, hệ thống không tự phạt."
      />

      <Card className="space-y-3 p-4">
        <FinanceFilter value={range} onChange={setRange} isLoading={loading} initialPreset={DEFAULT_PRESET} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="sm:w-56"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
              {(Object.keys(STATUS_LABEL) as LeakageTraceStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={verdict} onValueChange={(v) => setVerdict(v as any)}>
            <SelectTrigger className="sm:w-72"><SelectValue placeholder="Kết luận" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả kết luận</SelectItem>
              {(Object.keys(VERDICT_LABEL) as LeakageVerdict[]).map((v) => (
                <SelectItem key={v} value={v}>{VERDICT_LABEL[v]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {driverUserId && (
            <Badge variant="secondary" className="w-fit gap-1">
              Tài xế: {driverLabel}
              <button
                type="button"
                aria-label="Bỏ lọc theo tài xế"
                onClick={() => { setDriverUserId(null); setDriverLabel(''); }}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Thời điểm huỷ</TableHead>
              <TableHead>Kết luận</TableHead>
              <TableHead className="whitespace-nowrap">Tài xế</TableHead>
              <TableHead className="whitespace-nowrap">Khách</TableHead>
              <TableHead>Chuyến</TableHead>
              <TableHead className="whitespace-nowrap">Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT} className="h-28 text-center text-muted-foreground">
                  <ShieldAlert className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  Không có nghi vấn nào khớp bộ lọc.
                  <div className="mt-1 text-xs">
                    Trống là bình thường. Kết luận chỉ sinh ra sau khi cửa sổ canh đóng
                    (~3 giờ sau khi khách huỷ), và tính năng phải được bật trong Cấu hình hệ thống.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                    <TableCell className="whitespace-nowrap">{formatVnDateTime(r.eventAt)}</TableCell>
                    <TableCell>
                      <Badge className={verdictBadgeClass(r.verdict)}>{VERDICT_LABEL[r.verdict] ?? r.verdict}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {/* Only a real driver gets the filter Button: otherwise the cell
                          becomes a dead zone — stopPropagation would swallow the row
                          click (no sheet) while filterByDriver returns early (no filter). */}
                      {r.driver ? (
                        <>
                          <Button
                            variant="link"
                            className="h-auto p-0 text-left"
                            title="Lọc theo tài xế này"
                            onClick={(e) => { e.stopPropagation(); filterByDriver(r); }}
                          >
                            {r.driver.fullName || r.driver.phone || '—'}
                          </Button>
                          <div className="text-xs text-muted-foreground">{r.driver.phone}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.customer?.fullName || '—'}
                      <div className="text-xs text-muted-foreground">{r.customer?.phone}</div>
                    </TableCell>
                    <TableCell className="max-w-[22rem] text-sm">
                      <span className="break-words">
                        {addressText(r.booking?.pickupAddress)} → {addressText(r.booking?.dropoffAddress)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={statusBadgeVariant(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length >= LIST_CAP && (
                  <TableRow>
                    <TableCell colSpan={COL_COUNT} className="text-center text-xs text-muted-foreground">
                      Chỉ hiển thị {LIST_CAP} mục gần nhất — thu hẹp khoảng ngày để xem đầy đủ.
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </Card>

      <TraceDetailSheet
        trace={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onUpdateStatus={handleUpdateStatus}
      />
    </div>
  );
}
