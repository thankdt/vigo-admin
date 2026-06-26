import type { Promotion } from '@/lib/types';

/** Format a VND amount with vi-VN grouping. Decimal columns may arrive as
 *  strings ("20000.00"), so coerce to number first. */
export const fmtVnd = (n: number | string) => new Intl.NumberFormat('vi-VN').format(Number(n) || 0);

/**
 * Vouchers an admin can apply to a walk-in trip:
 *   - active + within the start/end window + not exhausted, and
 *   - PUBLIC (pointCost = 0). Point-redeemed vouchers require the customer to
 *     own a redemption row, which an auto-created walk-in customer never has —
 *     applying one would silently yield 0đ, so they are hidden.
 *
 * `now` is injectable so the date window is deterministic under test. NOTE: do
 * NOT pass this straight to Array.prototype.filter — filter would feed the
 * element index in as `now`. Wrap it: `vouchers.filter((v) => isVoucherSelectable(v))`.
 *
 * The backend returns the usage counter as `usedCount`; the older admin
 * Promotion type calls it `usageCount`. Read both so a voucher with a usage
 * limit isn't wrongly filtered out when only `usedCount` is present.
 */
export function isVoucherSelectable(v: Promotion, now: number = Date.now()): boolean {
  const used = Number((v as { usedCount?: number }).usedCount ?? v.usageCount ?? 0);
  const limit = Number(v.usageLimit ?? 0);
  const start = new Date(v.startDate).getTime();
  const end = new Date(v.endDate).getTime();
  return (
    v.isActive === true &&
    !Number(v.pointCost ?? 0) &&
    Number.isFinite(start) && start <= now &&
    Number.isFinite(end) && end >= now &&
    (limit <= 0 || used < limit)
  );
}

/** Dropdown label: `CODE — giảm …, đơn từ …đ`. */
export function voucherLabel(v: Promotion): string {
  const off =
    v.discountType === 'PERCENTAGE'
      ? `giảm ${Number(v.discountValue)}%${v.maxDiscount ? ` (tối đa ${fmtVnd(v.maxDiscount)}đ)` : ''}`
      : `giảm ${fmtVnd(v.discountValue)}đ`;
  const min = Number(v.minOrderValue) > 0 ? `, đơn từ ${fmtVnd(v.minOrderValue)}đ` : '';
  return `${v.code} — ${off}${min}`;
}
