'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { banDriver, unbanDriver, suspendDriver, unsuspendDriver } from '@/lib/api';
import type { DriverCancelStat } from '@/lib/types';
import { driverStatus } from '../cancel-labels';

/** Pure: số ngày người admin nhập → phút, đơn vị `durationMinutes` mà
 *  `suspendDriver` nhận. Tách riêng để test không cần mount dialog. */
export function suspendMinutes(days: number): number {
  return days * 1440;
}

type ActionKey = 'suspend' | 'ban' | 'unlock';

/** Ban/tạm khoá/gỡ khoá một tài xế. `stat` điều khiển open (mirror
 *  trace-detail-sheet: mở khi khác null, đóng khi cha set về null). Dùng
 *  thẳng các hàm API có sẵn trong '@/lib/api' — không tự tạo lại fetch. */
export function DriverActionDialog({
  stat,
  onOpenChange,
  onDone,
}: {
  stat: DriverCancelStat | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = React.useState('');
  const [days, setDays] = React.useState(1);
  const [saving, setSaving] = React.useState<ActionKey | null>(null);

  // Mỗi lần mở dialog cho một tài xế khác, xoá form cũ — tránh lý do/ số ngày
  // của lần thao tác trước lọt sang tài xế đang mở.
  React.useEffect(() => {
    setReason('');
    setDays(1);
    setSaving(null);
  }, [stat?.driverEntityId]);

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
      onOpenChange(false);
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
      () => (stat.isBanned ? unbanDriver(stat.driverEntityId) : unsuspendDriver(stat.driverEntityId)),
      'Đã gỡ khoá.',
    );

  return (
    <Dialog open={!!stat} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{stat.fullName || 'Không tên'} · {stat.phone || 'Không SĐT'}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        {stat.depositForfeitFlagged && (
          <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/50 dark:text-amber-400">
            Tài này đã bị đánh cờ giữ cọc — xử cọc thủ công.
          </p>
        )}

        <div className="space-y-3 py-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
