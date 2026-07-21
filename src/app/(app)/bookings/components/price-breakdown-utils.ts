import type { PriceBreakdown } from '@/lib/types';

export type DiscountRow = { label: string; value: number };

/**
 * Danh sách dòng giảm giá hiển thị trong PriceBreakdownCard (chi tiết
 * booking). Lọc value > 0 (đồng nhất với hành vi cũ) — chuyến không có
 * giảm giá loại nào thì dòng đó không hiện.
 */
export function buildDiscountRows(breakdown: PriceBreakdown | null | undefined): DiscountRow[] {
  if (!breakdown) return [];
  const rows: DiscountRow[] = [];
  const loyalty = Number(breakdown.loyaltyDiscount ?? 0);
  if (loyalty > 0) rows.push({ label: 'Khách thân thiết', value: loyalty });
  const promotion = Number(breakdown.promotionDiscount ?? 0);
  if (promotion > 0) rows.push({ label: 'Mã khuyến mãi', value: promotion });
  // Giảm giá theo ghế / auto-switch KHÔNG hiện ở chi tiết chuyến: chuyến đã tạo thì
  // giá + loại dịch vụ đã là giá/loại CHỐT — không cần nêu lý do đổi hay số đã giảm
  // (đó là thông tin lúc BÁO GIÁ cho khách, xem app khách).
  return rows;
}
