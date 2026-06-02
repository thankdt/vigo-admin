'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ImageThumbList } from '@/components/ui/image-thumb-list';
import { getImageUrl } from '@/lib/utils';
import type { Driver } from '@/lib/types';

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
                <AvatarImage src={driver.user?.avatarUrl || driver.user?.avatar} alt={driver.name || driver.user?.fullName} />
                <AvatarFallback>{(driver.name || driver.user?.fullName || 'D').charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-xl font-bold">{driver.name || driver.user?.fullName || 'Tài xế'}</h3>
                <p className="text-sm text-muted-foreground">{driver.phone || driver.user?.phone || 'Chưa có SĐT'}</p>
                <p className="text-sm font-medium mt-1">Trạng thái: {approvalBadge(driver.isApproved)}</p>
              </div>
            </div>

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
