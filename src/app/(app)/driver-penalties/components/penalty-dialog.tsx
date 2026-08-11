'use client';

import * as React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  createPenalty,
  previewPenalty,
  type PenaltyPreview,
  type PenaltyReasonCode,
  type PenaltySource,
} from '@/lib/api';
import { REASON_LABEL, REASON_ORDER, formatVnd } from '../penalty-labels';
import { buildPenaltyBody, canSubmitPenalty, isNoteRequired } from '../penalty-form';

/**
 * Dialog phạt tài xế — DÙNG CHUNG cho cả 3 màn (trang phạt, soát tỉ lệ huỷ, soát rò rỉ).
 *
 * Số tiền do BACKEND tính từ ledger lịch sử và hiện dưới dạng CHỮ, không phải ô nhập:
 * admin không sửa được nên không thể gõ nhầm và không có gì để tranh cãi.
 *
 * Mọi câu chặn ("chuyến này đã bị phạt rồi"…) lấy nguyên từ backend — FE không dịch
 * lại, nếu không hai đường (preview và create) sẽ trôi khác nhau lúc nào không hay.
 */
export function PenaltyDialog({
  bookingId,
  open,
  source,
  onOpenChange,
  onDone,
}: {
  bookingId: string | null;
  open: boolean;
  source: PenaltySource;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [preview, setPreview] = React.useState<PenaltyPreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [reasonCode, setReasonCode] = React.useState<PenaltyReasonCode | ''>('');
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    if (!open || !bookingId) {
      setPreview(null);
      setReasonCode('');
      setNote('');
      return;
    }
    let alive = true;
    setLoading(true);
    previewPenalty(bookingId)
      .then((p) => {
        if (alive) setPreview(p);
      })
      .catch((e: any) => {
        if (!alive) return;
        // Lỗi mạng/403 cũng phải hiện ra chỗ người dùng đang nhìn, không nuốt.
        setPreview({
          amount: 0,
          willOweDeposit: 0,
          blockedReason: 'LEDGER_ANOMALY',
          blockedMessage: e?.message || 'Không đọc được thông tin chuyến.',
        });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, bookingId]);

  const blocked = !!preview?.blockedReason;
  const noteRequired = isNoteRequired(reasonCode);
  const canSubmit = canSubmitPenalty({
    bookingId,
    preview,
    reasonCode,
    note,
    loading,
    submitting,
  });

  const submit = async () => {
    if (!canSubmit || !bookingId || !reasonCode) return;
    setSubmitting(true);
    try {
      await createPenalty(buildPenaltyBody(bookingId, reasonCode, note, source));
      toast({
        title: 'Đã phạt tài xế',
        description: `Đã thu lại ${formatVnd(preview?.amount)} hoa hồng của chuyến.`,
      });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Phạt thất bại', description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Phạt tài xế vi phạm
          </DialogTitle>
          <DialogDescription>
            Thu lại hoa hồng của chuyến đã huỷ. Số tiền do hệ thống tính theo hoa hồng thực tế
            đã trừ của chuyến, không sửa được.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loading && (
            <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tính số tiền…
            </p>
          )}

          {!loading && preview && blocked && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {preview.blockedMessage}
            </p>
          )}

          {!loading && preview && !blocked && (
            <>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Số tiền sẽ thu</p>
                <p className="text-2xl font-semibold tabular-nums">{formatVnd(preview.amount)}</p>
              </div>

              {preview.willOweDeposit > 0 && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  Sau khi phạt, ví ký quỹ của tài xế âm {formatVnd(preview.willOweDeposit)} — tài
                  xế phải nạp bù mới nhận được chuyến.
                </p>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="penalty-reason">Lý do vi phạm</Label>
                <Select
                  value={reasonCode || undefined}
                  onValueChange={(v) => setReasonCode(v as PenaltyReasonCode)}
                >
                  <SelectTrigger id="penalty-reason">
                    <SelectValue placeholder="Chọn lý do" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_ORDER.map((r) => (
                      <SelectItem key={r} value={r}>
                        {REASON_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="penalty-note">
                  Ghi chú{noteRequired ? ' (bắt buộc với lý do "Khác")' : ' (tuỳ chọn)'}
                </Label>
                <Input
                  id="penalty-note"
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="VD: khách xác nhận tài xế gọi ra ngoài app"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Đóng
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Xác nhận phạt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
