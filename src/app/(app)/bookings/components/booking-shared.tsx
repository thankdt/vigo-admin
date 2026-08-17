'use client';

/**
 * Ký hiệu dùng chung của CẢ `BookingsTable` LẪN `BookingDetail`.
 *
 * Tồn tại để CẮT VÒNG IMPORT: nếu để chúng ở `bookings-table.tsx` rồi cho
 * `booking-detail.tsx` import ngược, thì `/crm-queue` (chỉ cần BookingDetail) vẫn kéo
 * nguyên module bảng chuyến — kèm điều tài, tạo chuyến — vào bundle, đúng thứ việc
 * tách file này sinh ra để tránh.
 */
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
// [DISABLED 2026-07-09] adminAcceptBooking bỏ khỏi import — "admin ôm chuyến về operator" đã tắt (vỡ dòng tiền).
import type {} from '@/lib/types';
import type { Booking} from '@/lib/types';


// Nhãn trạng thái chuyến — getStatusBadge bên dưới lẫn BookingsTable (tab, dialog
// đổi trạng thái) cùng đọc, nên nằm ở file dùng chung.
export const statusLabelMap: Record<string, string> = {
  ALL: 'Tất cả',
  SEARCHING: 'Đang tìm',
  // Raw PROCESSING fallback label — used when a row sneaks past the tab
  // filter (e.g. legacy data or a search hit). New tabs below are preferred.
  PROCESSING: 'Đang xử lý',
  NEEDS_ADMIN: 'Cần xử lý',
  ADMIN_HANDLING: 'Admin đang xử lý',
  // Renamed from "Đặt lịch" → "Chờ đến giờ" so it no longer collides with the outer
  // trip-type tab "Đặt lịch". This is the transient pre-dispatch status (a booked-ahead
  // trip waiting for its pickup time); the outer tab covers scheduled trips of ANY status.
  SCHEDULED: 'Chờ đến giờ',
  ACCEPTED: 'Đã nhận',
  PICKED_UP: 'Đã đón',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

export const CANCELLED_BY_ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Khách hàng',
  DRIVER: 'Tài xế',
  ADMIN: 'Admin',
  SYSTEM: 'Hệ thống',
};

export function getStatusBadge(booking: Pick<Booking, 'status' | 'adminClaimedAt'>) {
  const { status, adminClaimedAt } = booking;
  // PROCESSING splits into two visual badges based on whether an admin
  // claimed the booking — orange = "Cần xử lý" (still on the auto-cancel
  // clock), purple = "Admin đang xử lý" (claimed, no timeout).
  if (status === 'PROCESSING') {
    if (adminClaimedAt) {
      return (
        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
          {statusLabelMap.ADMIN_HANDLING}
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
        {statusLabelMap.NEEDS_ADMIN}
      </Badge>
    );
  }
  const label = statusLabelMap[status] ?? status;
  switch (status) {
    case 'COMPLETED':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">{label}</Badge>;
    case 'ACCEPTED':
    case 'PICKED_UP':
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400">{label}</Badge>;
    case 'SEARCHING':
      return <Badge variant="secondary">{label}</Badge>;
    case 'CANCELLED':
      return <Badge variant="destructive">{label}</Badge>;
    default:
      return <Badge>{label}</Badge>;
  }
};

/**
 * Nhãn "chuyến test" — dùng CHUNG cho hàng danh sách (`BookingsTable`) và header dialog
 * chi tiết (`BookingDetail`), để hai nơi không trôi dạt về màu/chữ.
 *
 * Tím đặc: cố ý KHÔNG trùng bảng màu trạng thái (xanh/đỏ/hổ phách) vì đây không phải một
 * trạng thái chuyến, mà là "đừng tin số của chuyến này" — nó đã bị loại khỏi dashboard,
 * tài chính, hoá đơn và đối soát HTX.
 */
export function TestTripBadge() {
  return (
    <Badge className="bg-purple-600 text-white hover:bg-purple-600 text-[10px] px-1.5 py-0">
      🧪 TEST
    </Badge>
  );
}
