'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImageThumbList } from '@/components/ui/image-thumb-list';
import { RejectReasonPicker } from '@/components/reject-reason-picker';
import { combineRejectReason } from '@/lib/reject-reasons';
import { useToast } from '@/hooks/use-toast';
import {
  htxApproveDriver,
  htxGetDriverDetail,
  htxRejectDriver,
  type HtxDriverDetail,
  type HtxDriverRow,
} from '@/lib/api';
import { getImageUrl } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';

const SERVICE_OPTIONS = [
  { value: 'RIDE', label: 'Chở khách (Taxi)' },
  { value: 'CARPOOL', label: 'Đi chung' },
  { value: 'DELIVERY', label: 'Giao hàng' },
] as const;

const SERVICE_LABEL: Record<string, string> = {
  RIDE: 'Chở khách (Taxi)',
  CARPOOL: 'Đi chung',
  DELIVERY: 'Giao hàng',
};

function safeImageArray(images: unknown): string[] {
  if (!images) return [];
  if (Array.isArray(images)) {
    return images
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof images === 'string') {
    const trimmed = images.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed
        .slice(1, -1)
        .split(',')
        .map((s) => s.replace(/^"|"$/g, '').trim())
        .filter(Boolean);
    }
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed)
          ? parsed.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean)
          : [];
      } catch {
        /* rơi xuống tách dấu phẩy */
      }
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}

export type HtxApprovalBadgeState = 'approved' | 'rejected' | 'pending' | 'unsubmitted';

export function resolveHtxDriverApprovalState(driver: {
  isApproved?: unknown;
  isSubmittedForApproval?: boolean;
  rejectionReason?: string | null;
}): HtxApprovalBadgeState {
  if (driver.isApproved === true || driver.isApproved === 'true') return 'approved';
  if (typeof driver.rejectionReason === 'string' && driver.rejectionReason.trim().length > 0) {
    return 'rejected';
  }
  if (driver.isSubmittedForApproval === false) return 'unsubmitted';
  return 'pending';
}

export function HtxApprovalBadge({
  driver,
}: {
  driver: { isApproved?: unknown; isSubmittedForApproval?: boolean; rejectionReason?: string | null };
}) {
  const state = resolveHtxDriverApprovalState(driver);
  switch (state) {
    case 'approved':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">
          Đã duyệt
        </Badge>
      );
    case 'rejected':
      return <Badge variant="destructive">Từ chối</Badge>;
    case 'unsubmitted':
      return <Badge variant="outline">Chưa nộp hồ sơ</Badge>;
    default:
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
          Chờ duyệt
        </Badge>
      );
  }
}

interface HtxDriverDetailDialogProps {
  driver: HtxDriverRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function HtxDriverDetailDialog({
  driver,
  open,
  onOpenChange,
  onSuccess,
}: HtxDriverDetailDialogProps) {
  const { toast } = useToast();
  const [detail, setDetail] = React.useState<HtxDriverDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadTick, setReloadTick] = React.useState(0);

  const [action, setAction] = React.useState<'approve' | 'reject' | null>(null);
  const [services, setServices] = React.useState<string[]>(['RIDE', 'CARPOOL', 'DELIVERY']);
  const [reasonValues, setReasonValues] = React.useState<string[]>([]);
  const [reasonNote, setReasonNote] = React.useState('');
  const [internalNote, setInternalNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const resetActionState = React.useCallback((enabledServices?: string[] | null) => {
    setAction(null);
    setServices(
      Array.isArray(enabledServices) && enabledServices.length > 0
        ? enabledServices
        : ['RIDE', 'CARPOOL', 'DELIVERY'],
    );
    setReasonValues([]);
    setReasonNote('');
    setInternalNote('');
  }, []);

  const driverId = driver?.id ?? null;

  React.useEffect(() => {
    if (!open || !driverId) {
      setDetail(null);
      setError(null);
      setAction(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    resetActionState(null);

    htxGetDriverDetail(driverId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        resetActionState(res.enabledServices);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Không tải được hồ sơ tài xế');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, driverId, reloadTick, resetActionState]);

  if (!driver) return null;

  const displayName = (detail?.fullName || driver.fullName || '').trim() || 'Tài xế';
  const displayPhone = (detail?.phone || driver.phone || '').trim() || 'Chưa có SĐT';
  const displayAvatar = detail?.avatar ?? driver.avatar;
  const vr = detail ? detail.vehicleRegistration : driver.vehicleRegistration;
  const regImages = safeImageArray((detail?.vehicleRegistration as any)?.registrationImages);
  const inspImages = safeImageArray((detail?.vehicleRegistration as any)?.inspectionImages);
  const insImages = safeImageArray((detail?.vehicleRegistration as any)?.insuranceImages);
  const vehImages = safeImageArray((detail?.vehicleRegistration as any)?.images);
  const cccdImages = safeImageArray(detail?.cccdImages);
  const licenseImages = safeImageArray(detail?.licenseImages);
  const htxConfirmImages = safeImageArray(detail?.htxConfirmationImage);

  const approvalState = resolveHtxDriverApprovalState(detail ?? driver);

  const handleSubmitAction = async () => {
    if (!action) return;

    if (action === 'approve' && services.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Yêu cầu dịch vụ',
        description: 'Vui lòng chọn ít nhất một dịch vụ được phép.',
      });
      return;
    }
    if (action === 'reject' && reasonValues.length === 0 && !reasonNote.trim()) {
      toast({
        variant: 'destructive',
        title: 'Yêu cầu lý do',
        description: 'Vui lòng chọn hoặc nhập ít nhất một lý do từ chối.',
      });
      return;
    }

    setSubmitting(true);
    try {
      if (action === 'approve') {
        const res = await htxApproveDriver(driver.id, services, internalNote);
        const warnings = Array.isArray(res.warnings) ? res.warnings.filter(Boolean) : [];
        toast({
          title: 'Đã duyệt tài xế',
          description:
            warnings.length > 0
              ? `${displayName} đã được duyệt. Lưu ý: ${warnings.join(' ')}`
              : `${displayName} đã được duyệt và có thể bắt đầu nhận chuyến.`,
        });
      } else {
        const reason = combineRejectReason(reasonValues, reasonNote);
        await htxRejectDriver(driver.id, reason, internalNote);
        toast({
          title: 'Đã từ chối hồ sơ tài xế',
          description: `${displayName} đã được chuyển sang trạng thái Từ chối để chỉnh sửa lại hồ sơ.`,
        });
      }
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: `Không thể ${action === 'approve' ? 'duyệt' : 'từ chối'} tài xế`,
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
      <DialogContent
        className="w-[95vw] max-w-2xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>Hồ sơ tài xế</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Header cơ bản */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-14 w-14 shrink-0">
                {displayAvatar ? <AvatarImage src={getImageUrl(displayAvatar)} alt={displayName} /> : null}
                <AvatarFallback>{displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h3 className="text-lg font-bold truncate">{displayName}</h3>
                <p className="text-sm text-muted-foreground">{displayPhone}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <HtxApprovalBadge driver={detail ?? driver} />
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span>Đang tải hồ sơ & hình ảnh…</span>
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 p-4 space-y-3">
              <div className="text-sm text-red-700 dark:text-red-400 font-medium">{error}</div>
              <Button variant="outline" size="sm" onClick={() => setReloadTick((n) => n + 1)}>
                Thử tải lại
              </Button>
            </div>
          ) : detail ? (
            <>
              {approvalState === 'unsubmitted' && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <span>Tài xế chưa nhấn nộp hồ sơ trên app. Bạn vẫn có thể kiểm tra trước thông tin đã tải lên.</span>
                </div>
              )}

              {approvalState !== 'approved' && detail.rejectionReason?.trim() && (
                <div className="rounded-md border border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm">
                    <div className="font-semibold text-red-700 dark:text-red-400">Lý do từ chối hiện tại</div>
                    <p className="mt-0.5 whitespace-pre-line text-red-900 dark:text-red-200">
                      {detail.rejectionReason}
                    </p>
                  </div>
                </div>
              )}

              {/* Thông tin xe & giấy tờ xe */}
              <div className="space-y-3 border-t pt-4">
                <h4 className="font-semibold text-sm">Phương tiện & Đăng ký xe</h4>
                {vr ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-0.5">
                      <Label className="text-xs text-muted-foreground">Biển số</Label>
                      <p className="text-sm font-medium">{vr.plateNumber || '—'}</p>
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-xs text-muted-foreground">Hãng / Dòng xe</Label>
                      <p className="text-sm font-medium">
                        {[vr.brand, vr.model].filter(Boolean).join(' ') || '—'}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-xs text-muted-foreground">Màu sắc</Label>
                      <p className="text-sm font-medium">{(vr as any).color || '—'}</p>
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-xs text-muted-foreground">Số ghế (kể cả ghế lái)</Label>
                      <p className="text-sm font-medium">{vr.seats ? `${vr.seats} chỗ` : '—'}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Chưa có thông tin đăng ký xe.</p>
                )}

                {regImages.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs text-muted-foreground">Ảnh đăng ký xe (Cà vẹt)</Label>
                    <ImageThumbList urls={regImages.map((img) => getImageUrl(img))} altPrefix="Đăng ký xe" />
                  </div>
                )}
                {inspImages.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs text-muted-foreground">Ảnh đăng kiểm xe</Label>
                    <ImageThumbList urls={inspImages.map((img) => getImageUrl(img))} altPrefix="Đăng kiểm" />
                  </div>
                )}
                {insImages.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs text-muted-foreground">Ảnh bảo hiểm xe</Label>
                    <ImageThumbList urls={insImages.map((img) => getImageUrl(img))} altPrefix="Bảo hiểm" />
                  </div>
                )}
                {vehImages.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs text-muted-foreground">Ảnh xe</Label>
                    <ImageThumbList urls={vehImages.map((img) => getImageUrl(img))} altPrefix="Ảnh xe" />
                  </div>
                )}
              </div>

              {/* Ảnh CCCD */}
              <div className="space-y-2 border-t pt-4">
                <h4 className="font-semibold text-sm">Ảnh CCCD</h4>
                {cccdImages.length > 0 ? (
                  <ImageThumbList urls={cccdImages.map((img) => getImageUrl(img))} altPrefix="CCCD" />
                ) : (
                  <p className="text-sm text-muted-foreground italic">Chưa có ảnh CCCD.</p>
                )}
              </div>

              {/* Ảnh Bằng lái */}
              <div className="space-y-2 border-t pt-4">
                <h4 className="font-semibold text-sm">Ảnh bằng lái</h4>
                {licenseImages.length > 0 ? (
                  <ImageThumbList urls={licenseImages.map((img) => getImageUrl(img))} altPrefix="Bằng lái" />
                ) : (
                  <p className="text-sm text-muted-foreground italic">Chưa có ảnh bằng lái.</p>
                )}
              </div>

              {/* Giấy xác nhận HTX (nếu tài đã tải lên) */}
              {htxConfirmImages.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="font-semibold text-sm">Ảnh xác nhận HTX</h4>
                  <ImageThumbList
                    urls={htxConfirmImages.map((img) => getImageUrl(img))}
                    altPrefix="Xác nhận HTX"
                  />
                </div>
              )}

              {/* Dịch vụ */}
              <div className="space-y-2 border-t pt-4">
                <h4 className="font-semibold text-sm">Dịch vụ được phép</h4>
                <div className="flex flex-wrap gap-2">
                  {(detail.enabledServices ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Chưa bật dịch vụ nào.</p>
                  ) : (
                    detail.enabledServices!.map((s) => (
                      <Badge key={s} variant="outline">
                        {SERVICE_LABEL[s] ?? s}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              {/* Hành động duyệt / từ chối */}
              <div className="border-t pt-4">
                {action === null && (
                  <div className="flex flex-wrap justify-end gap-2">
                    {approvalState !== 'rejected' && (
                      <Button
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setAction('reject')}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Từ chối
                      </Button>
                    )}
                    {approvalState !== 'approved' && (
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => setAction('approve')}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Duyệt tài xế
                      </Button>
                    )}
                  </div>
                )}

                {action === 'approve' && (
                  <div className="space-y-3">
                    <Label>Loại dịch vụ được phép</Label>
                    <div className="flex flex-col gap-2">
                      {SERVICE_OPTIONS.map((service) => (
                        <div key={service.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`htx-approve-${service.value}`}
                            checked={services.includes(service.value)}
                            disabled={submitting}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setServices((prev) =>
                                  prev.includes(service.value) ? prev : [...prev, service.value],
                                );
                              } else {
                                setServices((prev) => prev.filter((s) => s !== service.value));
                              }
                            }}
                          />
                          <Label
                            htmlFor={`htx-approve-${service.value}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {service.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="htx-approve-note"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Ghi chú nội bộ (tuỳ chọn — không hiện cho tài xế)
                      </label>
                      <Textarea
                        id="htx-approve-note"
                        value={internalNote}
                        onChange={(e) => setInternalNote(e.target.value)}
                        placeholder="Ghi chú kiểm duyệt HTX…"
                        rows={2}
                        disabled={submitting}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        variant="ghost"
                        disabled={submitting}
                        onClick={() => resetActionState(detail.enabledServices)}
                      >
                        Huỷ
                      </Button>
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={submitting || services.length === 0}
                        onClick={handleSubmitAction}
                      >
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Xác nhận duyệt
                      </Button>
                    </div>
                  </div>
                )}

                {action === 'reject' && (
                  <div className="space-y-3">
                    <RejectReasonPicker
                      selectedValues={reasonValues}
                      onSelectedValuesChange={setReasonValues}
                      note={reasonNote}
                      onNoteChange={setReasonNote}
                      disabled={submitting}
                    />
                    <div className="space-y-1.5">
                      <label
                        htmlFor="htx-reject-note"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Ghi chú nội bộ (tuỳ chọn — không hiện cho tài xế)
                      </label>
                      <Textarea
                        id="htx-reject-note"
                        value={internalNote}
                        onChange={(e) => setInternalNote(e.target.value)}
                        placeholder="Ghi chú nội bộ…"
                        rows={2}
                        disabled={submitting}
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        variant="ghost"
                        disabled={submitting}
                        onClick={() => resetActionState(detail.enabledServices)}
                      >
                        Huỷ
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={submitting || (reasonValues.length === 0 && !reasonNote.trim())}
                        onClick={handleSubmitAction}
                      >
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Xác nhận từ chối
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
