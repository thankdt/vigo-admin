'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { voidCompletedBooking } from '@/lib/api';

export function VoidBookingDialog({
  bookingId,
  open,
  onOpenChange,
  onDone,
}: {
  bookingId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) { setReason(''); setPassword(''); }
  }, [open]);

  const submit = async () => {
    if (!bookingId || !password) return;
    setSubmitting(true);
    try {
      const r = await voidCompletedBooking(bookingId, password, reason.trim() || undefined);
      toast({
        title: 'Đã huỷ chuyến',
        description: `Đã hoàn hoa hồng tài xế${r.affiliateClawedBack ? ` + thu hồi ${r.affiliateClawedBack} affiliate` : ''}.`,
      });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Huỷ chuyến thất bại', description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Huỷ chuyến đã hoàn thành
          </DialogTitle>
          <DialogDescription>
            Đảo ngược chuyến: hoàn hoa hồng tài xế, thu hồi hoa hồng affiliate, đặt trạng thái HUỶ.
            Hành động nhạy cảm — cần mật khẩu cấp 2.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="void-reason">Lý do</Label>
            <Input
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: chuyến test, dọn dữ liệu"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="void-pw">Mật khẩu cấp 2</Label>
            <Input
              id="void-pw"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Đóng
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!password || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Xác nhận huỷ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
