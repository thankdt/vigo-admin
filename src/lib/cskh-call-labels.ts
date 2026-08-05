import type { DriverCallEventType } from '@/lib/api';
import type { CustomerCallStatus } from '@/lib/types';

/**
 * NGUỒN DUY NHẤT cho nhãn tiếng Việt của các mốc CSKH.
 *
 * Trước 2026-08-05 bộ nhãn này bị chép tay ở 2 nơi (CALL_TYPE_META trong
 * drivers/components/driver-detail-dialog.tsx và CS_TYPE_OPTIONS trong
 * drivers/components/drivers-filter-bar.tsx) — trang giám sát CSKH sẽ là bản thứ 3.
 * Gom về đây để đổi chữ một lần là mọi màn đổi theo.
 *
 * Giá trị enum PHẢI khớp backend: DriverCallEventType (driver-customer-call-event.entity)
 * và BookingCustomerCallStatus (booking-customer-call-event.entity).
 */

export const DRIVER_CALL_TYPE_LABEL: Record<DriverCallEventType, string> = {
  CALLED: 'Gọi được',
  UNREACHED: 'Không nghe máy',
  CALLBACK: 'Hẹn gọi lại',
  HANDLED: 'Đã xử lý',
  REMINDER: 'Nhắc nhở',
  NOTE: 'Ghi chú',
};

/** Thứ tự hiển thị trong dropdown/chú giải — liên hệ trước, ghi chú sau. */
export const DRIVER_CALL_TYPE_ORDER: DriverCallEventType[] = [
  'CALLED',
  'UNREACHED',
  'CALLBACK',
  'HANDLED',
  'REMINDER',
  'NOTE',
];

export const BOOKING_CALL_STATUS_LABEL: Record<CustomerCallStatus, string> = {
  CLAIMED: 'Nhận gọi',
  CALLED: 'Gọi được',
  UNREACHED: 'Không nghe máy',
};

export const BOOKING_CALL_STATUS_ORDER: CustomerCallStatus[] = [
  'CLAIMED',
  'CALLED',
  'UNREACHED',
];

/** Nguồn của một mốc: gọi khách theo chuyến, hay làm việc với tài xế. */
export type CskhActivityKind = 'BOOKING' | 'DRIVER';

export const KIND_LABEL: Record<CskhActivityKind, string> = {
  BOOKING: 'Khách (chuyến)',
  DRIVER: 'Tài xế',
};

/**
 * MIRROR của backend (cskh-activity.service.ts BOOKING_CONTACT_OUTCOMES /
 * DRIVER_CONTACT_OUTCOMES): mốc nào được tính là CUỘC GỌI THẬT.
 *
 * CLAIMED = mới nhận việc, chưa gọi. HANDLED/REMINDER/NOTE = ghi chú công việc.
 * Cả 4 loại này KHÔNG tính vào xếp hạng — nếu tính thì bấm "nhận gọi" hàng loạt là
 * thổi được số. Backend mới là chốt; hàm này chỉ để UI tô màu/gắn nhãn cho khớp.
 */
const BOOKING_CONTACT: CustomerCallStatus[] = ['CALLED', 'UNREACHED'];
const DRIVER_CONTACT: DriverCallEventType[] = ['CALLED', 'UNREACHED', 'CALLBACK'];

export function isContactOutcome(kind: CskhActivityKind, outcome: string): boolean {
  return kind === 'BOOKING'
    ? (BOOKING_CONTACT as string[]).includes(outcome)
    : (DRIVER_CONTACT as string[]).includes(outcome);
}

/** Nhãn cho một mốc bất kỳ của trang giám sát (2 nguồn dùng chung mã CALLED/UNREACHED). */
export function outcomeLabel(kind: CskhActivityKind, outcome: string): string {
  const map: Record<string, string> =
    kind === 'BOOKING' ? BOOKING_CALL_STATUS_LABEL : DRIVER_CALL_TYPE_LABEL;
  return map[outcome] ?? outcome;
}

/** Màu badge theo ý nghĩa: liên lạc được = xanh, không được = đỏ, còn lại = trung tính. */
export function outcomeBadgeClass(outcome: string): string {
  switch (outcome) {
    case 'CALLED':
      return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100';
    case 'UNREACHED':
      return 'bg-red-100 text-red-800 hover:bg-red-100';
    case 'CALLBACK':
      return 'bg-amber-100 text-amber-800 hover:bg-amber-100';
    case 'CLAIMED':
      return 'bg-blue-100 text-blue-800 hover:bg-blue-100';
    default:
      return 'bg-muted text-muted-foreground hover:bg-muted';
  }
}

// Ngày–giờ giờ VN: dùng `formatVnDateTime` sẵn có ở
// app/(app)/leakage-review/leakage-labels.ts (6 màn khác đang import trực tiếp từ đó).
// KHÔNG chép thêm một bản nữa ở đây — đúng cái duplication file này sinh ra để dẹp.
