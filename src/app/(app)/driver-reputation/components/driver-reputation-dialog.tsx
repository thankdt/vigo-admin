'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DriverReputationSection } from '@/app/(app)/drivers/components/driver-reputation-section';

/**
 * Chi tiết điểm & đánh giá của một tài xế, mở ngay tại trang xếp hạng.
 *
 * ⚠️ Vì sao KHÔNG điều hướng sang /drivers: màn "Quản lý tài xế" mở chi tiết
 * bằng dialog nội bộ và KHÔNG đọc query param nào (không dùng useSearchParams),
 * nên `/drivers?driverId=…` chỉ mở ra trang danh sách trắng bộ lọc — bấm vào
 * một dòng lại rơi vào màn hình không liên quan. Cùng cái bẫy đã ghi trong
 * cskh-activity/page.tsx.
 *
 * Nên chỗ này DÙNG LẠI đúng khối `DriverReputationSection` của chi tiết tài xế
 * (cùng component, cùng luật hiển thị, cùng gate RBAC 'driver-reputation') thay
 * vì dựng một bản sao thứ hai sẽ trôi lệch luật "null ≠ 0 sao".
 */
export function DriverReputationDialog({
  driverId,
  driverName,
  driverPhone,
  onOpenChange,
}: {
  driverId: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!driverId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{driverName?.trim() || 'Chi tiết tài xế'}</DialogTitle>
          <DialogDescription>
            {driverPhone?.trim() || 'Điểm uy tín, phân bố sao và các đánh giá gần đây.'}
          </DialogDescription>
        </DialogHeader>
        {/* Chỉ render khi đã có id: DriverReputationSection fetch ngay lúc mount,
            dựng nó với id rỗng là bắn một request 404 mỗi lần đóng dialog. */}
        {driverId && <DriverReputationSection driverId={driverId} />}
      </DialogContent>
    </Dialog>
  );
}
