'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Send, Undo2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ImageThumbList } from '@/components/ui/image-thumb-list';
import { getImageUrl } from '@/lib/utils';
import type { Driver } from '@/lib/types';
import {
  getDriverApprovalHistory,
  type DriverApprovalAction,
  type DriverApprovalEvent,
} from '@/lib/api';

// Same parser as drivers-table — handles legacy strings, PG arrays, JSON, csv.
function safeImageArray(images: any): string[] {
  if (!images) return [];
  if (Array.isArray(images)) return images.filter(Boolean);
  if (typeof images === 'string') {
    const trimmed = images.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed.slice(1, -1).split(',').map((s) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
    if (trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { /* fall through */ }
    }
    if (trimmed.includes(',')) {
      return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return trimmed ? [trimmed] : [];
  }
  return [];
}

const SERVICE_LABEL: Record<string, string> = {
  RIDE: 'Chở khách (Taxi)',
  CARPOOL: 'Đi chung',
  DELIVERY: 'Giao hàng',
};

function approvalBadge(status: Driver['isApproved']) {
  if (status === 'true') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">Đã duyệt</Badge>;
  if (status === 'false') return <Badge variant="destructive">Từ chối</Badge>;
  return <Badge variant="secondary">Chờ duyệt</Badge>;
}

const APPROVAL_ACTION_META: Record<
  DriverApprovalAction,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  APPROVED: { label: 'Duyệt', icon: CheckCircle2, tone: 'text-emerald-600' },
  REJECTED: { label: 'Từ chối', icon: XCircle, tone: 'text-red-600' },
  SUBMITTED: { label: 'Nộp hồ sơ', icon: Send, tone: 'text-blue-600' },
  MOVED_BACK_TO_PENDING: {
    label: 'Đưa về chờ duyệt',
    icon: Undo2,
    tone: 'text-amber-600',
  },
};

function ApprovalTimeline({ driverId }: { driverId: string }) {
  // Driver approval history. Lazily fetched when the dialog mounts so we don't
  // pay the round-trip on every driver row hover. Soft-fail to empty list —
  // the dialog is still useful even if history doesn't load.
  const [events, setEvents] = React.useState<DriverApprovalEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDriverApprovalHistory(driverId)
      .then((data) => {
        if (!cancelled) setEvents(data ?? []);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? 'Không tải được lịch sử.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [driverId]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground italic">Đang tải lịch sử…</p>
    );
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Chưa có sự kiện duyệt / từ chối nào được ghi nhận.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 border-l-2 border-muted pl-4">
      {events.map((e) => {
        const meta = APPROVAL_ACTION_META[e.action] ?? {
          label: e.action,
          icon: AlertTriangle,
          tone: 'text-muted-foreground',
        };
        const Icon = meta.icon;
        const who =
          e.byAdmin?.fullName || e.byAdmin?.phone || (e.byAdminUserId ? 'admin' : 'tài xế');
        return (
          <li key={e.id} className="space-y-1 -ml-[22px] pl-[22px] relative">
            <span className={`absolute -left-[10px] top-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-background ring-2 ring-background ${meta.tone}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className={`text-sm font-semibold ${meta.tone}`}>{meta.label}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(e.createdAt), 'dd/MM/yyyy HH:mm')} · bởi {who}
              </span>
            </div>
            {e.reason && (
              <p className="text-sm text-foreground/90 italic">&ldquo;{e.reason}&rdquo;</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function DriverDetailDialog({ driver, onClose }: { driver: Driver | null; onClose: () => void }) {
  return (
    <Dialog open={!!driver} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Chi tiết tài xế</DialogTitle>
        </DialogHeader>
        {driver && (
          <div className="space-y-6">
            <div className="flex items-center space-x-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={getImageUrl(driver.user?.avatarUrl || driver.user?.avatar)} alt={driver.name || driver.user?.fullName} />
                <AvatarFallback>{(driver.name || driver.user?.fullName || 'D').charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-xl font-bold">{driver.name || driver.user?.fullName || 'Tài xế'}</h3>
                <p className="text-sm text-muted-foreground">{driver.phone || driver.user?.phone || 'Chưa có SĐT'}</p>
                <p className="text-sm font-medium mt-1">Trạng thái: {approvalBadge(driver.isApproved)}</p>
              </div>
            </div>

            {driver.rejectionReason && (
              <div className="rounded-md border border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <div className="font-semibold text-red-700 dark:text-red-400">
                    Lý do từ chối hiện tại
                  </div>
                  <p className="mt-0.5 text-red-900 dark:text-red-200">{driver.rejectionReason}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">ID</Label>
                <p className="font-medium text-sm break-all">{driver.id}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Số dư ví</Label>
                <p className="font-medium text-sm">{driver.walletBalance !== undefined ? `${driver.walletBalance} VNĐ` : 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Số bằng lái</Label>
                <p className="font-medium text-sm">{driver.licenseNumber || 'N/A'}</p>
              </div>
            </div>

            {driver.vehicleRegistration && (
              <div className="space-y-2 border-t pt-4">
                <h4 className="font-semibold">Đăng ký xe</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Biển số</Label>
                    <p className="font-medium text-sm">{driver.vehicleRegistration.plateNumber}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Hãng xe</Label>
                    <p className="font-medium text-sm">{driver.vehicleRegistration.brand}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Dòng xe</Label>
                    <p className="font-medium text-sm">{driver.vehicleRegistration.model}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Màu sắc</Label>
                    <p className="font-medium text-sm">{driver.vehicleRegistration.color}</p>
                  </div>
                </div>
                {safeImageArray(driver.vehicleRegistration.images).length > 0 && (
                  <div className="space-y-2 pt-3">
                    <Label className="text-xs text-muted-foreground">Ảnh xe</Label>
                    <ImageThumbList
                      urls={safeImageArray(driver.vehicleRegistration.images).map((img) => getImageUrl(img))}
                      altPrefix="Vehicle"
                    />
                  </div>
                )}
              </div>
            )}

            {safeImageArray(driver.cccdImages).length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <h4 className="font-semibold">Ảnh CCCD</h4>
                <ImageThumbList
                  urls={safeImageArray(driver.cccdImages).map((img) => getImageUrl(img))}
                  altPrefix="CCCD"
                />
              </div>
            )}

            {safeImageArray(driver.licenseImages).length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <h4 className="font-semibold">Ảnh bằng lái</h4>
                <ImageThumbList
                  urls={safeImageArray(driver.licenseImages).map((img) => getImageUrl(img))}
                  altPrefix="License"
                />
              </div>
            )}

            <div className="space-y-2 border-t pt-4">
              <h4 className="font-semibold">Dịch vụ được phép</h4>
              <div className="flex flex-wrap gap-2">
                {(driver.enabledServices ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Chưa bật dịch vụ nào.</p>
                ) : (
                  driver.enabledServices!.map((s) => (
                    <Badge key={s} variant="outline">{SERVICE_LABEL[s] ?? s}</Badge>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <h4 className="font-semibold">Lịch sử duyệt / từ chối</h4>
              <ApprovalTimeline driverId={driver.id} />
            </div>

            <div className="space-y-2 border-t pt-4">
              <h4 className="font-semibold">Đơn vị vận tải</h4>
              {driver.transportCompany ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tên đơn vị</Label>
                    <p className="font-medium text-sm">{driver.transportCompany.name}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Chủ đơn vị</Label>
                    <p className="font-medium text-sm">{driver.transportCompany.ownerName || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">SĐT chủ</Label>
                    <p className="font-medium text-sm">{driver.transportCompany.ownerPhone || 'N/A'}</p>
                  </div>
                </div>
              ) : driver.customTransportCompanyName ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm">{driver.customTransportCompanyName}</p>
                  <Badge variant="outline" className="text-amber-600 border-amber-300">Chưa xác nhận</Badge>
                </div>
              ) : driver.isIndependentDriver ? (
                <Badge variant="secondary">Tài xế độc lập</Badge>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa cung cấp</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
