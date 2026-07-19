'use client';

import * as React from 'react';
import Link from 'next/link';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Loader2, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getDriverCancelDetail,
  getDriverApprovalHistory,
  banDriver,
  unbanDriver,
  suspendDriver,
  unsuspendDriver,
  type DriverApprovalEvent,
  type DriverApprovalAction,
} from '@/lib/api';
import type { DriverCancelStat, DriverCancelTrip } from '@/lib/types';
import type { DateRange } from '../../finance/components/finance-filter';
import { addressText, formatVnDateTime } from '../../leakage-review/leakage-labels';
import { driverStatus } from '../cancel-labels';
import { suspendMinutes } from './driver-action-dialog';

// Reuses the ban/unban/suspend translations from the P2 dialog's action set —
// keep DriverApprovalAction's approval-flow actions too since the same history
// endpoint also carries APPROVED/REJECTED/etc entries.
const ACTION_LABEL: Record<DriverApprovalAction, string> = {
  APPROVED: 'Duyệt hồ sơ',
  REJECTED: 'Từ chối hồ sơ',
  SUBMITTED: 'Nộp hồ sơ',
  MOVED_BACK_TO_PENDING: 'Trả về chờ duyệt',
  BANNED: 'Khoá vĩnh viễn',
  UNBANNED: 'Mở khoá',
  SUSPENDED: 'Tạm khoá',
  UNSUSPENDED: 'Gỡ tạm khoá',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm break-words">{children}</div>
    </div>
  );
}

type ActionKey = 'suspend' | 'ban' | 'unlock';

/** Chi tiết 1 tài xế trong bảng "Tỉ lệ huỷ": hồ sơ + danh sách chuyến khách huỷ +
 *  lịch sử khoá/mở khoá + nút hành động. Mở khi `stat != null` (mirror
 *  TraceDetailSheet). Nút khoá/tạm khoá/gỡ khoá GỌI THẲNG các hàm api (không
 *  nhúng <DriverActionDialog/>): DriverActionDialog tự mở Dialog của nó ngay khi
 *  `stat != null` — cùng điều kiện mở của Sheet này — nên nhúng thẳng sẽ bật 2
 *  modal Radix Dialog chồng nhau cùng lúc. Logic tính `suspendMinutes` vẫn tái
 *  dùng từ đó (pure, không kéo theo Dialog). */
export function DriverDetailSheet({
  stat,
  range,
  onOpenChange,
  onDone,
}: {
  stat: DriverCancelStat | null;
  range: DateRange;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { toast } = useToast();

  const [trips, setTrips] = React.useState<DriverCancelTrip[]>([]);
  const [tripsLoading, setTripsLoading] = React.useState(false);
  const [history, setHistory] = React.useState<DriverApprovalEvent[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const [reason, setReason] = React.useState('');
  const [days, setDays] = React.useState(1);
  const [saving, setSaving] = React.useState<ActionKey | null>(null);

  // Guards both the trips and the history fetch against a stale response
  // overwriting a newer one (same pattern as page.tsx's reqIdRef).
  const reqIdRef = React.useRef(0);

  const loadDetail = React.useCallback(
    async (driverEntityId: string) => {
      const reqId = ++reqIdRef.current;
      setTripsLoading(true);
      setHistoryLoading(true);
      try {
        const [tripsData, historyData] = await Promise.all([
          getDriverCancelDetail(driverEntityId, range.from, range.to),
          getDriverApprovalHistory(driverEntityId),
        ]);
        if (reqId !== reqIdRef.current) return;
        setTrips(tripsData);
        setHistory(historyData);
      } catch (err: any) {
        if (reqId !== reqIdRef.current) return;
        toast({ variant: 'destructive', title: 'Không tải được chi tiết tài xế', description: err.message });
      } finally {
        if (reqId === reqIdRef.current) {
          setTripsLoading(false);
          setHistoryLoading(false);
        }
      }
    },
    [range.from, range.to, toast],
  );

  React.useEffect(() => {
    // Mỗi lần đổi tài xế, xoá form thao tác cũ — tránh lý do/ số ngày của lần
    // trước lọt sang tài xế đang mở (mirror DriverActionDialog).
    setReason('');
    setDays(1);
    setSaving(null);
    if (stat) {
      loadDetail(stat.driverEntityId);
    } else {
      // Bump the guard too — an in-flight fetch from just before close must not
      // be allowed to commit state after the sheet has already cleared it.
      reqIdRef.current++;
      setTrips([]);
      setHistory([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stat?.driverEntityId, range.from, range.to]);

  if (!stat) return null;

  const status = driverStatus(stat);
  const suspendedActive = !!stat.suspendedUntil && new Date(stat.suspendedUntil).getTime() > Date.now();
  const canUnlock = stat.isBanned || suspendedActive;
  const reasonOk = reason.trim().length > 0;

  const run = async (key: ActionKey, fn: () => Promise<unknown>, successMsg: string) => {
    setSaving(key);
    try {
      await fn();
      toast({ title: 'Thành công', description: successMsg });
      onDone();
      // Lịch sử khoá/mở khoá đổi ngay — refetch phần trong sheet. Trạng thái
      // isBanned/suspendedUntil hiển thị ở mục 1 do `stat` (prop cha) quyết định;
      // cha cập nhật lại qua onDone (reload danh sách + chọn lại dòng mới).
      loadDetail(stat.driverEntityId);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Thao tác thất bại', description: err.message });
    } finally {
      setSaving(null);
    }
  };

  const handleSuspend = () =>
    run(
      'suspend',
      () => suspendDriver(stat.driverEntityId, { durationMinutes: suspendMinutes(days), reason }),
      `Đã tạm khoá ${days} ngày.`,
    );

  const handleBan = () => run('ban', () => banDriver(stat.driverEntityId, reason), 'Đã khoá vĩnh viễn.');

  const handleUnlock = () =>
    run(
      'unlock',
      async () => {
        if (stat.isBanned) await unbanDriver(stat.driverEntityId);
        if (suspendedActive) await unsuspendDriver(stat.driverEntityId);
      },
      'Đã gỡ khoá.',
    );

  return (
    <Sheet open={!!stat} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span>{stat.fullName || 'Không tên'} · {stat.phone || 'Không SĐT'}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
            {stat.depositForfeitFlagged && (
              <Badge variant="outline" className="gap-1" title="Đã đánh cờ giữ cọc">
                <Wallet className="h-3 w-3" />
                Cờ cọc
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            <Link
              href={`/users/detail?id=${stat.driverUserId}`}
              className="text-primary underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              Xem hồ sơ đầy đủ
            </Link>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Chuyến giao">{stat.assignedTrips}</Field>
            <Field label="Khách huỷ">{stat.customerCancels}</Field>
            <Field label="Tỉ lệ huỷ">{stat.ratePct}%</Field>
            <Field label="Số lần vi phạm">{stat.cancelRuleAStrikes}</Field>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Danh sách chuyến huỷ</p>
            <p className="text-xs text-muted-foreground">
              Danh sách mọi chuyến khách huỷ trong khoảng (gồm cả chuyến không tính vào tỉ lệ).
            </p>
            {tripsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : trips.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Không có chuyến nào bị huỷ trong khoảng ngày.</p>
            ) : (
              <ul className="space-y-2">
                {trips.map((t) => (
                  <li key={t.bookingId} className="rounded-md border p-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-medium">{formatVnDateTime(t.cancelledAt)}</span>
                      <span className="text-xs text-muted-foreground">
                        Huỷ sau {t.minutesToCancel != null ? `${t.minutesToCancel} phút` : '—'}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {addressText(t.pickupAddress)} → {addressText(t.dropoffAddress)}
                    </div>
                    <div className="text-xs text-muted-foreground">Lý do: {t.cancelReason || '—'}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Separator />

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Lịch sử khoá / mở khoá</p>
            {historyLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : history.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Chưa có lịch sử khoá / mở khoá.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="rounded-md border p-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
                      <span className="text-xs text-muted-foreground">{formatVnDateTime(h.createdAt)}</span>
                    </div>
                    <div className="text-muted-foreground">Lý do: {h.reason || '—'}</div>
                    <div className="text-xs text-muted-foreground">Admin: {h.byAdmin?.fullName || '—'}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <SheetFooter className="flex-col items-stretch gap-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Lý do (bắt buộc)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do khoá / tạm khoá..."
              disabled={!!saving}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Số ngày tạm khoá</label>
              <Input
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                disabled={!!saving}
                className="w-24"
              />
            </div>
            <Button variant="secondary" disabled={!reasonOk || !!saving} onClick={handleSuspend}>
              {saving === 'suspend' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Tạm khoá
            </Button>
            <Button variant="destructive" disabled={!reasonOk || !!saving} onClick={handleBan}>
              {saving === 'ban' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Khoá vĩnh viễn
            </Button>
            {canUnlock && (
              <Button variant="outline" disabled={!!saving} onClick={handleUnlock}>
                {saving === 'unlock' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Gỡ khoá
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
