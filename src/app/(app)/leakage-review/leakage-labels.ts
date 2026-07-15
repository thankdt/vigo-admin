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
 *  (verdict determines confidence: PICKUP_DROPOFF_UNEXPLAINED⇒HIGH, others⇒LOW).
 *
 *  The `hover:` classes are REQUIRED, not decorative: Badge's default cva variant
 *  ships `hover:bg-primary/80`, and tailwind-merge keys by (modifier, group) — so
 *  an unmodified `bg-red-100` does NOT strip it. Without an explicit hover bg the
 *  badge flips to primary on hover and HIGH becomes indistinguishable from LOW,
 *  on rows that are cursor-pointer (i.e. hovered constantly). */
export function verdictBadgeClass(v: LeakageVerdict): string {
  switch (v) {
    case 'PICKUP_DROPOFF_UNEXPLAINED':
      return 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/50 dark:text-red-400 dark:hover:bg-red-900/50';
    case 'PICKUP_ONLY':
      return 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-900/50';
    case 'WENT_DARK':
      return 'bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800/60';
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

/** Unknown must NOT read as suspicious — this text backs a fraud accusation. */
function servingPhrase(serving: boolean | null | undefined): string {
  if (serving === true) return 'đang chở khách của hệ thống (⇒ giải thích được)';
  if (serving === false) return 'không chở khách nào của hệ thống (⇒ đáng ngờ)';
  return 'không rõ có đang chở khách hay không';
}

/** Distance, qualified by the staleness bound. The backend deliberately records
 *  only an upper bound on the sample's age (it cannot know the exact age), so we
 *  must not render the distance as if it were surveyed. */
function hitDistance(hit: LeakageEvidence['pickupHit'], what: string): string {
  if (!hit) return '';
  const stale = hit.maxSampleAgeSec ? ` (mẫu GPS có thể cũ tới ${hit.maxSampleAgeSec}s)` : '';
  return ` — cách ${what} ${hit.distanceM}m${stale}`;
}

/** Human-readable timeline of what the watch actually observed. */
export function describeEvidence(e: LeakageEvidence | null | undefined): string[] {
  if (!e) return [];
  const lines: string[] = [];

  if (e.nearPickupAt) {
    lines.push(
      `${formatVnDateTime(e.nearPickupAt)}: tới gần ĐIỂM ĐÓN${hitDistance(e.pickupHit, 'điểm đón')}, ${servingPhrase(e.nearPickupServing)}.`,
    );
  }
  if (e.nearDropoffAt) {
    lines.push(
      `${formatVnDateTime(e.nearDropoffAt)}: tới gần ĐIỂM ĐẾN${hitDistance(e.dropoffHit, 'điểm đến')}, ${servingPhrase(e.nearDropoffServing)}.`,
    );
  }
  if (e.wentDark) {
    lines.push('Mất tín hiệu định vị trong lúc canh (tài xế offline / tắt định vị).');
  }
  return lines;
}
