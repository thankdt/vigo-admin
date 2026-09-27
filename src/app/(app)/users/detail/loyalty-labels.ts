// Nhãn tiếng Việt cho khối "Vcoin & hạng" trên hồ sơ khách (spec 2026-09-21 §3.5).
// Tách riêng khỏi component để test thuần (map trạng thái -> nhãn) không cần render.

/** Hạng khách hàng (`loyaltyTier`/`tier`). Key lạ (chưa map) hiện nguyên văn — không throw. */
export const TIER_LABEL: Record<string, string> = {
  MEMBER: 'Thành viên',
  SILVER: 'Bạc',
  GOLD: 'Vàng',
  DIAMOND: 'Kim cương',
};

/** `history.items[].type` — loại giao dịch điểm/Vcoin. */
export const LOYALTY_HISTORY_TYPE_LABEL: Record<string, string> = {
  EARN: 'Cộng',
  REDEEM: 'Đổi voucher',
  ADJUST: 'Điều chỉnh',
  EXPIRE: 'Hết hạn',
};

/** `history.items[].pointKind` — Vcoin (tiêu được) vs điểm hạng (chỉ để xét hạng). */
export const POINT_KIND_LABEL: Record<string, string> = {
  REWARD: 'Vcoin',
  TIER: 'Điểm hạng',
};

/** `vouchers[].state` — trạng thái một voucher khách đã đổi. */
export const VOUCHER_STATE_LABEL: Record<string, string> = {
  GIFT: 'Voucher tặng',
  FREE: 'Chưa dùng',
  HELD: 'Đang giữ cho chuyến',
  USED: 'Đã dùng',
  BURNED: 'Đã huỷ (chuyến bị huỷ sau hoàn thành)',
  EXPIRED: 'Hết hạn',
};

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

/** Màu badge cho trạng thái voucher — dùng chung giữa card và test. */
export const VOUCHER_STATE_VARIANT: Record<string, BadgeVariant> = {
  GIFT: 'outline',
  FREE: 'secondary',
  HELD: 'default',
  USED: 'default',
  BURNED: 'destructive',
  EXPIRED: 'destructive',
};

export function tierLabel(tier: string | null | undefined): string {
  if (!tier) return '—';
  return TIER_LABEL[tier] ?? tier;
}

export function loyaltyHistoryTypeLabel(type: string | null | undefined): string {
  if (!type) return '—';
  return LOYALTY_HISTORY_TYPE_LABEL[type] ?? type;
}

export function pointKindLabel(kind: string | null | undefined): string {
  if (!kind) return '—';
  return POINT_KIND_LABEL[kind] ?? kind;
}

export function voucherStateLabel(state: string | null | undefined): string {
  if (!state) return '—';
  return VOUCHER_STATE_LABEL[state] ?? state;
}

export function voucherStateVariant(state: string | null | undefined): BadgeVariant {
  if (!state) return 'outline';
  return VOUCHER_STATE_VARIANT[state] ?? 'outline';
}

// Nhãn trạng thái CHUYẾN cho cột "chuyến đang gắn" của bảng voucher — CHÉP LẠI có chủ đích
// từ `BOOKING_STATUS_LABEL` trong `../page.tsx` (module đó là page 'use client' default-export,
// import ngược từ đây sẽ tạo vòng lặp component <-> page). Đổi một bên thì soát bên kia.
export const BOOKING_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Mới tạo',
  SEARCHING: 'Đang tìm',
  PROCESSING: 'Đang xử lý',
  SCHEDULED: 'Chờ đến giờ',
  ACCEPTED: 'Đã nhận',
  ARRIVED: 'Đã đến',
  PICKED_UP: 'Đã đón',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã huỷ',
  DELIVERY_FAILED: 'Giao thất bại',
};

export function bookingStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return BOOKING_STATUS_LABEL[status] ?? status;
}
