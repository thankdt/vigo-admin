import type {
  PenaltyReasonCode,
  PenaltySource,
  PenaltyStatus,
} from '@/lib/api';

export const REASON_LABEL: Record<PenaltyReasonCode, string> = {
  OFF_PLATFORM: 'Chở khách ngoài app',
  NO_SHOW: 'Bùng khách, không đến đón',
  FORCED_CANCEL: 'Ép khách huỷ chuyến',
  FAKE_TRIP: 'Chuyến khống / gian lận',
  OTHER: 'Khác',
};

/** Thứ tự hiện trong dropdown — "Khác" luôn cuối. */
export const REASON_ORDER: PenaltyReasonCode[] = [
  'OFF_PLATFORM',
  'NO_SHOW',
  'FORCED_CANCEL',
  'FAKE_TRIP',
  'OTHER',
];

export const SOURCE_LABEL: Record<PenaltySource, string> = {
  PENALTY_PAGE: 'Trang phạt',
  CANCEL_REVIEW: 'Soát tỉ lệ huỷ',
  LEAKAGE_REVIEW: 'Soát rò rỉ',
};

/** Ai huỷ chuyến — giá trị từ `booking.cancelledByRole`. */
export const CANCELLED_BY_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  CUSTOMER: 'Khách',
  DRIVER: 'Tài xế',
  SYSTEM: 'Hệ thống',
};

export function cancelledByLabel(role: string | null): string {
  if (!role) return 'Không rõ';
  return CANCELLED_BY_LABEL[role] ?? role;
}

/** `hover:` bắt buộc — Badge cva ship sẵn hover:bg-primary, tailwind-merge không strip. */
export function penaltyStatusBadge(status: PenaltyStatus | null): {
  label: string;
  className: string;
} {
  if (status === 'ACTIVE') {
    return {
      label: 'Đã phạt',
      className:
        'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/50 dark:text-red-400 dark:hover:bg-red-900/50',
    };
  }
  if (status === 'REVERSED') {
    return {
      label: 'Đã huỷ phạt',
      className:
        'bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800/60',
    };
  }
  return {
    label: 'Chưa phạt',
    className:
      'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-900/50',
  };
}

/**
 * Nhãn cảnh báo tỉ lệ huỷ. Alert `shadow` là bản "đáng lẽ khoá" mà hệ thống CHƯA
 * thi hành — phải ghi rõ, nếu không admin đọc nhầm thành bằng chứng vi phạm đã
 * được xác nhận rồi phạt oan.
 */
export function cancelAlertLabel(
  rule: string | null,
  shadow: boolean | null,
): string | null {
  if (!rule) return null;
  return shadow ? `Cảnh báo huỷ ${rule} (thử)` : `Cảnh báo huỷ ${rule}`;
}

export function formatVnd(n: number | null | undefined): string {
  return `${Number(n ?? 0).toLocaleString('vi-VN')}đ`;
}
