import type { LeakageEvidence, LeakageTraceStatus, LeakageVerdict } from '@/lib/types';

export const VERDICT_LABEL: Record<LeakageVerdict, string> = {
  PICKUP_DROPOFF_UNEXPLAINED: 'Đi đón→đến, không giải thích được',
  PICKUP_ONLY: 'Chỉ ghé gần điểm đón',
  WENT_DARK: 'Mất định vị sau khi huỷ',
};

export const STATUS_LABEL: Record<LeakageTraceStatus, string> = {
  NEW: 'Mới',
  REVIEWED: 'Đã xem',
  DISMISSED: 'Bỏ qua',
  CONFIRMED: 'Đã xác nhận gian lận',
};

/** Colour encodes severity, so verdict and confidence don't need separate columns
 *  (the backend maps verdict→confidence injectively). */
export function verdictBadgeClass(v: LeakageVerdict): string {
  switch (v) {
    case 'PICKUP_DROPOFF_UNEXPLAINED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400';
    case 'PICKUP_ONLY':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400';
    case 'WENT_DARK':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300';
  }
}

export function statusBadgeVariant(s: LeakageTraceStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (s) {
    case 'CONFIRMED':
      return 'destructive';
    case 'DISMISSED':
      return 'outline';
    case 'REVIEWED':
      return 'secondary';
    default:
      return 'default';
  }
}

const VN_DATETIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit', // '2-digit' (not 'numeric') so 09:00 never renders as 9:00
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Always renders in VN time regardless of the admin's browser timezone. */
export function formatVnDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return VN_DATETIME.format(d);
}

/** Booking addresses are untyped JSONB with inconsistent shapes. */
export function addressText(addr: any): string {
  if (!addr) return '—';
  if (typeof addr === 'string') return addr;
  if (typeof addr !== 'object') return '—';
  return addr.address || addr.name || addr.formattedAddress || addr.description || '—';
}

function servingPhrase(serving: boolean | null | undefined): string {
  return serving
    ? 'đang chở khách của hệ thống (⇒ giải thích được)'
    : 'không chở khách nào của hệ thống (⇒ đáng ngờ)';
}

/** Human-readable timeline of what the watch actually observed. */
export function describeEvidence(e: LeakageEvidence | null | undefined): string[] {
  if (!e) return [];
  const lines: string[] = [];

  if (e.nearPickupAt) {
    const d = e.pickupHit ? ` — cách điểm đón ${e.pickupHit.distanceM}m` : '';
    lines.push(`${formatVnDateTime(e.nearPickupAt)}: tới gần ĐIỂM ĐÓN${d}, ${servingPhrase(e.nearPickupServing)}.`);
  }
  if (e.nearDropoffAt) {
    const d = e.dropoffHit ? ` — cách điểm đến ${e.dropoffHit.distanceM}m` : '';
    lines.push(`${formatVnDateTime(e.nearDropoffAt)}: tới gần ĐIỂM ĐẾN${d}, ${servingPhrase(e.nearDropoffServing)}.`);
  }
  if (e.wentDark) {
    lines.push('Mất tín hiệu định vị trong lúc canh (tài xế offline / tắt định vị).');
  }
  return lines;
}
