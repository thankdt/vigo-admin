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
import { toastApiError } from '@/hooks/use-api-error-toast';
import { adminAdjustVcoin } from '@/lib/api';

const AMOUNT_MIN = 1;
const AMOUNT_MAX = 1_000_000;
const REASON_MAX = 200;

type Props = {
  /** userId khách đang mở dialog. `null` = đóng. */
  userId: string | null;
  userName: string;
  /** Số dư Vcoin hiện tại — chỉ để hiển thị tham khảo, KHÔNG tự chặn trừ (BE là nguồn chặn). */
  currentRewardPoints: number;
  onClose: () => void;
  /** Gọi sau khi cộng/trừ THÀNH CÔNG (kể cả khi BE báo trùng thao tác) để trang cha refetch. */
  onAdjusted: () => void;
};

const parseAmount = (raw: string): number => {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits === '' ? NaN : Number(digits);
};

/**
 * Dialog "Cộng/Trừ Vcoin" — quyền RIÊNG `loyalty-adjust` (kiểm ở nơi gọi component này).
 *
 * `idempotencyKey` sinh MỘT LẦN khi dialog mở (mỗi lần mở userId mới -> key mới), giữ
 * nguyên xuyên suốt các lần bấm lại/retry trong CÙNG một lần mở — bấm đúp không cộng hai
 * lần vì BE khoá theo key này (spec 2026-09-21 §3.5).
 */
export function VcoinAdjustDialog({ userId, userName, currentRewardPoints, onClose, onAdjusted }: Props) {
  const { toast } = useToast();
  const [operation, setOperation] = React.useState<'credit' | 'debit'>('credit');
  const [amountRaw, setAmountRaw] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [idempotencyKey, setIdempotencyKey] = React.useState('');

  React.useEffect(() => {
    if (userId) {
      setOperation('credit');
      setAmountRaw('');
      setReason('');
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [userId]);

  const amount = parseAmount(amountRaw);
  const amountValid = Number.isFinite(amount) && amount >= AMOUNT_MIN && amount <= AMOUNT_MAX;
  const reasonTrimmed = reason.trim();
  const reasonValid = reasonTrimmed.length > 0 && reasonTrimmed.length <= REASON_MAX;
  const canSubmit = amountValid && reasonValid && !isSubmitting && !!idempotencyKey;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!amountValid) {
      toast({
        variant: 'destructive',
        title: 'Số lượng không hợp lệ',
        description: `Nhập số nguyên từ ${AMOUNT_MIN} đến ${AMOUNT_MAX.toLocaleString('vi-VN')}.`,
      });
      return;
    }
    if (!reasonValid) {
      toast({ variant: 'destructive', title: 'Thiếu lý do', description: `Nhập lý do, tối đa ${REASON_MAX} ký tự.` });
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await adminAdjustVcoin(userId, {
        operation,
        amount,
        reason: reasonTrimmed,
        idempotencyKey,
      });
      if (result.duplicate) {
        toast({ title: 'Thao tác đã được ghi nhận trước đó' });
      } else {
        toast({
          title: operation === 'credit' ? 'Đã cộng Vcoin' : 'Đã trừ Vcoin',
          description: `${userName} · Số dư Vcoin mới ${result.rewardPoints.toLocaleString('vi-VN')}`,
        });
      }
      onAdjusted();
      onClose();
    } catch (err) {
      toastApiError(err, 'Không thực hiện được');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!userId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cộng / trừ Vcoin</DialogTitle>
          <DialogDescription>
            {userName} · Số dư hiện tại {currentRewardPoints.toLocaleString('vi-VN')} Vcoin
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Loại thao tác</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={operation === 'credit' ? 'default' : 'outline'}
                className={operation === 'credit' ? 'bg-green-600 hover:bg-green-700' : ''}
                onClick={() => setOperation('credit')}
              >
                Cộng Vcoin
              </Button>
              <Button
                type="button"
                variant={operation === 'debit' ? 'destructive' : 'outline'}
                onClick={() => setOperation('debit')}
              >
                Trừ Vcoin
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="vcoin-adjust-amount">Số lượng Vcoin</Label>
            <Input
              id="vcoin-adjust-amount"
              inputMode="numeric"
              placeholder={`VD: 100 (tối đa ${AMOUNT_MAX.toLocaleString('vi-VN')})`}
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="vcoin-adjust-reason">Lý do (bắt buộc)</Label>
            <Textarea
              id="vcoin-adjust-reason"
              placeholder="VD: Bù Vcoin do lỗi hệ thống không cộng khi hoàn thành chuyến #ABCD"
              value={reason}
              maxLength={REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{reasonTrimmed.length}/{REASON_MAX} ký tự</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className={operation === 'credit' ? 'bg-green-600 hover:bg-green-700' : ''}
              variant={operation === 'debit' ? 'destructive' : 'default'}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {operation === 'credit' ? 'Xác nhận cộng' : 'Xác nhận trừ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
