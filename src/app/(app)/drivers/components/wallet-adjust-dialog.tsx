'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { adminAdjustDriverWallet } from '@/lib/api';
import type { Driver } from '@/lib/types';

type Props = {
  driver: Driver | null;
  onClose: () => void;
  // Called after a successful adjustment so the parent can refresh its data.
  onAdjusted?: () => void;
};

const formatVnd = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const parseAmount = (raw: string): number => {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits === '' ? NaN : Number(digits);
};

export function WalletAdjustDialog({ driver, onClose, onAdjusted }: Props) {
  const { toast } = useToast();
  const [operation, setOperation] = React.useState<'credit' | 'debit'>('credit');
  const [wallet, setWallet] = React.useState<'DRIVER_DEPOSIT' | 'DRIVER_MAIN'>('DRIVER_DEPOSIT');
  const [amountRaw, setAmountRaw] = React.useState('');
  const [note, setNote] = React.useState('');
  const [secondaryPassword, setSecondaryPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Reset form whenever a new driver is opened.
  React.useEffect(() => {
    if (driver) {
      setOperation('credit');
      setWallet('DRIVER_DEPOSIT');
      setAmountRaw('');
      setNote('');
      setSecondaryPassword('');
    }
  }, [driver?.id]);

  const driverName = driver?.name || driver?.user?.fullName || 'Tài xế';
  const depositBalance = driver?.wallets?.deposit ?? 0;
  const mainBalance = driver?.wallets?.main ?? 0;
  const amount = parseAmount(amountRaw);
  const amountValid = Number.isFinite(amount) && amount > 0;
  const passwordValid = secondaryPassword.length > 0;
  const canSubmit = amountValid && passwordValid && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driver) return;
    if (!amountValid) {
      toast({ variant: 'destructive', title: 'Số tiền không hợp lệ', description: 'Nhập số dương lớn hơn 0.' });
      return;
    }
    if (!passwordValid) {
      toast({ variant: 'destructive', title: 'Thiếu mật khẩu cấp 2' });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await adminAdjustDriverWallet(driver.id, {
        wallet,
        operation,
        amount,
        note: note.trim() || undefined,
        secondaryPassword,
      });
      toast({
        title: operation === 'credit' ? 'Đã nạp tiền' : 'Đã trừ tiền',
        description: `${driverName} · ${wallet === 'DRIVER_DEPOSIT' ? 'Ví chính' : 'Ví khuyến mại'} · Số dư mới ${formatVnd(result.newBalance)}`,
      });
      onAdjusted?.();
      onClose();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể thực hiện', description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!driver} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nạp / trừ tiền tài xế</DialogTitle>
          <DialogDescription>
            {driverName} · {driver?.phone || driver?.user?.phone || ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Ví chính (cọc)</div>
              <div className="font-semibold">{formatVnd(depositBalance)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Ví khuyến mại</div>
              <div className="font-semibold">{formatVnd(mainBalance)}</div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Loại thao tác</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={operation === 'credit' ? 'default' : 'outline'}
                className={operation === 'credit' ? 'bg-green-600 hover:bg-green-700' : ''}
                onClick={() => setOperation('credit')}
              >
                Nạp tiền
              </Button>
              <Button
                type="button"
                variant={operation === 'debit' ? 'destructive' : 'outline'}
                onClick={() => setOperation('debit')}
              >
                Trừ tiền
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Ví</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={wallet === 'DRIVER_DEPOSIT' ? 'default' : 'outline'}
                onClick={() => setWallet('DRIVER_DEPOSIT')}
              >
                Ví chính (cọc)
              </Button>
              <Button
                type="button"
                variant={wallet === 'DRIVER_MAIN' ? 'default' : 'outline'}
                onClick={() => setWallet('DRIVER_MAIN')}
              >
                Ví khuyến mại
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="adjust-amount">Số tiền</Label>
            <Input
              id="adjust-amount"
              inputMode="numeric"
              placeholder="VD: 100000"
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
            />
            {amountValid && (
              <p className="text-xs text-muted-foreground">{formatVnd(amount)}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="adjust-note">Ghi chú (không bắt buộc)</Label>
            <Textarea
              id="adjust-note"
              placeholder="VD: Hoàn cọc do hệ thống trừ nhầm chuyến #ABCD"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="adjust-secondary-password">Mật khẩu cấp 2</Label>
            <Input
              id="adjust-secondary-password"
              type="password"
              autoComplete="new-password"
              placeholder="Bắt buộc — tạm thời chung cho cả team, sẽ đổi sang OTP"
              value={secondaryPassword}
              onChange={(e) => setSecondaryPassword(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className={operation === 'credit' ? 'bg-green-600 hover:bg-green-700' : ''}
              variant={operation === 'debit' ? 'destructive' : 'default'}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {operation === 'credit' ? 'Xác nhận nạp' : 'Xác nhận trừ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
