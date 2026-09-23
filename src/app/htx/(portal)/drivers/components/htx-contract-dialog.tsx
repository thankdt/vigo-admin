'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, CheckCircle2, XCircle, ExternalLink, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { htxSignContract, htxRejectContract, type HtxDriverRow } from '@/lib/api';
import { getImageUrl } from '@/lib/utils';

interface HtxContractDialogProps {
  driver: HtxDriverRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function HtxContractDialog({
  driver,
  open,
  onOpenChange,
  onSuccess,
}: HtxContractDialogProps) {
  const { toast } = useToast();
  const [signerName, setSignerName] = React.useState('');
  const [isConfirmed, setIsConfirmed] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [rejectMode, setRejectMode] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setSignerName('');
      setIsConfirmed(false);
      setRejectMode(false);
      setRejectReason('');
    }
  }, [open]);

  if (!driver) return null;

  const status = driver.htxApprovalStatus || 'NONE';
  const isPending = status === 'PENDING_HTX';
  const isApproved = status === 'HTX_APPROVED';
  const isRejected = status === 'HTX_REJECTED';

  const handleSign = async () => {
    if (!isConfirmed) {
      toast({
        variant: 'destructive',
        title: 'Chưa xác nhận',
        description: 'Vui lòng tích chọn xác nhận kiểm tra hồ sơ và đồng ý ký kết.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await htxSignContract(driver.id, {
        signerName: signerName.trim() || undefined,
        method: 'ICA_DIGITAL_SIGNATURE',
      });
      toast({
        title: 'Ký điện tử (ICA) thành công',
        description: `Đã ký duyệt hợp đồng cho tài xế ${driver.fullName ?? driver.phone}. Hồ sơ đang chờ Vigo duyệt cuối cùng.`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Ký điện tử thất bại',
        description: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast({
        variant: 'destructive',
        title: 'Thiếu lý do từ chối',
        description: 'Vui lòng nhập lý do từ chối hợp đồng.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await htxRejectContract(driver.id, rejectReason.trim());
      toast({
        title: 'Đã từ chối hợp đồng',
        description: `Đã từ chối hợp đồng của tài xế ${driver.fullName ?? driver.phone}.`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Từ chối thất bại',
        description: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const pdfUrl = driver.contractPdfUrl
    ? (driver.contractPdfUrl.startsWith('http')
        ? driver.contractPdfUrl
        : getImageUrl(driver.contractPdfUrl))
    : null;

  const sigUrl = driver.contractSignatureUrl
    ? (driver.contractSignatureUrl.startsWith('http')
        ? driver.contractSignatureUrl
        : getImageUrl(driver.contractSignatureUrl))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <FileText className="h-5 w-5 text-primary" />
            Hợp Đồng HTX & Ký Điện Tử ICA
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Header Thông tin tài xế & xe */}
          <div className="rounded-lg border p-4 bg-muted/40 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">{driver.fullName ?? 'Tài xế'}</h3>
                <p className="text-sm text-muted-foreground">SĐT: {driver.phone ?? '—'}</p>
              </div>
              <div>
                {isPending && (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
                    Chờ HTX ký ICA
                  </Badge>
                )}
                {isApproved && (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> HTX đã ký ICA
                  </Badge>
                )}
                {isRejected && (
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400 flex items-center gap-1">
                    <XCircle className="h-3 w-3" /> Đã từ chối
                  </Badge>
                )}
                {!isPending && !isApproved && !isRejected && (
                  <Badge variant="secondary">Chưa nộp hợp đồng</Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-2 border-t">
              <div>
                Biển số xe: <span className="font-medium text-foreground">{driver.vehicleRegistration?.plateNumber ?? 'Chưa đăng ký'}</span>
              </div>
              <div>
                Hãng / Mẫu: <span className="font-medium text-foreground">{driver.vehicleRegistration?.brand ?? ''} {driver.vehicleRegistration?.model ?? ''}</span>
              </div>
              <div>
                Số ghế: <span className="font-medium text-foreground">{driver.vehicleRegistration?.seats ?? '—'} chỗ</span>
              </div>
              <div>
                Ngày gửi: <span className="font-medium text-foreground">{driver.contractSignedAt ? new Date(driver.contractSignedAt).toLocaleDateString('vi-VN') : '—'}</span>
              </div>
            </div>
          </div>

          {/* Chữ ký của tài xế */}
          {sigUrl && (
            <div className="rounded-lg border p-3 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                Chữ ký tay của Lái xe:
              </span>
              <div className="h-20 bg-white dark:bg-zinc-900 rounded border flex items-center justify-center p-1">
                <img
                  src={sigUrl}
                  alt="Chữ ký tài xế"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>
          )}

          {/* File PDF Hợp đồng */}
          {pdfUrl && (
            <div className="rounded-lg border p-4 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-blue-600" />
                <div>
                  <div className="text-sm font-semibold">Văn bản Hợp đồng Hợp tác Kinh doanh</div>
                  <div className="text-xs text-muted-foreground">Định dạng PDF chuẩn hoá đã tích hợp chữ ký điện tử</div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => window.open(pdfUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
                Xem PDF
              </Button>
            </div>
          )}

          {/* Khu vực ký điện tử ICA (chỉ hiển thị khi đang chờ HTX ký) */}
          {isPending && !rejectMode && (
            <div className="rounded-lg border p-4 bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 font-semibold text-sm">
                <ShieldCheck className="h-5 w-5" />
                Ký Số Điện Tử (ICA) Đại Diện HTX
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signer-name" className="text-xs">
                  Họ tên người đại diện HTX ký duyệt:
                </Label>
                <Input
                  id="signer-name"
                  placeholder="Nhập họ tên Chủ nhiệm / Người đại diện HTX"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="bg-white dark:bg-zinc-900"
                />
              </div>

              <div className="flex items-start space-x-2 pt-2">
                <Checkbox
                  id="confirm-ica"
                  checked={isConfirmed}
                  onCheckedChange={(c) => setIsConfirmed(c === true)}
                />
                <Label htmlFor="confirm-ica" className="text-xs leading-normal cursor-pointer font-normal">
                  Tôi đại diện Hợp tác xã xác nhận đã kiểm tra đầy đủ hồ sơ, phương tiện của lái xe và đồng ý thực hiện ký điện tử (ICA) phê duyệt hợp đồng hợp tác vận tải này.
                </Label>
              </div>
            </div>
          )}

          {/* Form từ chối */}
          {isPending && rejectMode && (
            <div className="rounded-lg border p-4 bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900 space-y-2">
              <Label htmlFor="reject-reason" className="text-xs font-semibold text-rose-800 dark:text-rose-400">
                Lý do từ chối hợp đồng:
              </Label>
              <Input
                id="reject-reason"
                placeholder="Nhập lý do từ chối (ví dụ: Xe không đạt tiêu chuẩn, thiếu phù hiệu...)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="bg-white dark:bg-zinc-900"
              />
            </div>
          )}

          {/* Trạng thái đã duyệt */}
          {isApproved && driver.htxApprovedAt && (
            <div className="rounded-lg border p-3 bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900 text-xs text-green-800 dark:text-green-300">
              ✓ Đã ký số điện tử ICA vào lúc: {new Date(driver.htxApprovedAt).toLocaleString('vi-VN')}
              {driver.htxSignatureInfo?.signerName && (
                <span> bởi <strong>{driver.htxSignatureInfo.signerName}</strong></span>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {isPending && !rejectMode && (
            <div className="flex w-full justify-between items-center">
              <Button
                variant="ghost"
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                onClick={() => setRejectMode(true)}
                disabled={isSubmitting}
              >
                Từ chối
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  Đóng
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  onClick={handleSign}
                  disabled={isSubmitting || !isConfirmed}
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Ký điện tử (ICA)
                </Button>
              </div>
            </div>
          )}

          {isPending && rejectMode && (
            <div className="flex w-full justify-between items-center">
              <Button variant="ghost" onClick={() => setRejectMode(false)} disabled={isSubmitting}>
                Quay lại
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={isSubmitting || !rejectReason.trim()}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Xác nhận từ chối
              </Button>
            </div>
          )}

          {!isPending && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

