'use client';

import * as React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldAlert, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getDriverCancelStats } from '@/lib/api';
import type { DriverCancelStat } from '@/lib/types';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';
import { formatVnDateTime } from '../leakage-review/leakage-labels';
import { rateBadgeClass, driverStatus } from './cancel-labels';
import { DriverActionDialog } from './components/driver-action-dialog';

const COL_COUNT = 7;

/** Key-coupled, not index-coupled: reordering PRESETS must not desync the range
 *  from the highlighted chip (the exact bug `initialPreset` exists to prevent).
 *  Matches the backend's 30-day rolling window. */
const DEFAULT_PRESET = 'last30';
const defaultRange = () =>
  (PRESETS.find((p) => p.key === DEFAULT_PRESET) ?? PRESETS.find((p) => p.key === 'last7') ?? PRESETS[0]).range();

export default function DriverCancelReviewPage() {
  const [range, setRange] = React.useState<DateRange>(defaultRange());
  const [rows, setRows] = React.useState<DriverCancelStat[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<DriverCancelStat | null>(null);
  const { toast } = useToast();

  // The debounce cancels the pending timer, not an in-flight request. Without a
  // sequence guard, a slow earlier fetch can resolve last and overwrite the list
  // with data that contradicts the current filters.
  const reqIdRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await getDriverCancelStats(range.from, range.to);
      if (reqId !== reqIdRef.current) return; // superseded — drop the stale result
      setRows(data);
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return;
      toast({ variant: 'destructive', title: 'Không tải được danh sách tài xế', description: err.message });
    } finally {
      // Only the newest request may clear the spinner.
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [range.from, range.to, toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tỉ lệ huỷ tài xế"
        description="Tài xế bị khách huỷ nhiều (nghi câu kéo khách ra ngoài). Đỏ >50% (tự khoá nếu bật AUTO), vàng 30–50% (theo dõi). Bấm 1 dòng để khoá/gỡ."
      />

      <Card className="space-y-3 p-4">
        <FinanceFilter value={range} onChange={setRange} isLoading={loading} initialPreset={DEFAULT_PRESET} />
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Tài xế</TableHead>
              <TableHead className="whitespace-nowrap">Chuyến giao</TableHead>
              <TableHead className="whitespace-nowrap">Khách huỷ</TableHead>
              <TableHead className="whitespace-nowrap">Tỉ lệ</TableHead>
              <TableHead className="whitespace-nowrap">Strike</TableHead>
              <TableHead className="whitespace-nowrap">Trạng thái</TableHead>
              <TableHead className="whitespace-nowrap">Cảnh báo gần nhất</TableHead>
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
                  Không có tài xế nào trong khoảng ngày.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s) => {
                const status = driverStatus(s);
                return (
                  <TableRow key={s.driverEntityId} className="cursor-pointer" onClick={() => setSelected(s)}>
                    <TableCell className="whitespace-nowrap">
                      {/* /users/detail?id=<User.id> is the real detail route — precedent
                          in leakage-review/components/trace-detail-sheet.tsx. */}
                      <Link
                        href={`/users/detail?id=${s.driverUserId}`}
                        className="text-primary underline underline-offset-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {s.fullName || 'Không tên'}
                      </Link>
                      <div className="text-xs text-muted-foreground">{s.phone}</div>
                    </TableCell>
                    <TableCell>{s.assignedTrips}</TableCell>
                    <TableCell>{s.customerCancels}</TableCell>
                    <TableCell>
                      <Badge className={rateBadgeClass(s.ratePct)}>{s.ratePct}%</Badge>
                    </TableCell>
                    <TableCell>{s.cancelRuleAStrikes}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {s.depositForfeitFlagged && (
                          <Badge variant="outline" className="gap-1" title="Đã đánh cờ giữ cọc">
                            <Wallet className="h-3 w-3" />
                            Cờ cọc
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[16rem] text-sm">
                      <span className="break-words">{s.lastAlertReason || '—'}</span>
                      <div className="text-xs text-muted-foreground">{formatVnDateTime(s.lastAlertAt)}</div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <DriverActionDialog
        stat={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onDone={load}
      />
    </div>
  );
}
