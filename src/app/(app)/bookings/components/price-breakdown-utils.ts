import type { PriceBreakdown } from '@/lib/types';

export type DiscountRow = { label: string; value: number };

/**
 * ĐỌC KỸ TRƯỚC KHI SỬA — hai loại "giảm giá" trong `PriceBreakdown` KHÔNG cùng
 * bản chất, và trộn chúng lại là nguồn của bug trừ hai lần.
 *
 * - `seatDiscountAmount` (CARPOOL nhiều ghế): backend ĐÃ TRỪ RỒI. `pricing.service.ts`
 *   tính `transportPrice = full × (1 − percent/100)` rồi mới đặt
 *   `seatDiscountAmount = full − transportPrice`. Nó là con số để IN RA cho thấy
 *   khách được bớt bao nhiêu, KHÔNG phải khoản còn phải trừ tiếp.
 *
 * - `loyaltyDiscount` / `promotionDiscount`: backend CHƯA trừ khỏi `booking.price`.
 *   Chúng được tính trên `currentPrice` rồi trừ ở bước sau
 *   (`priceAfterDiscount = currentPrice − discount`), nên UI phải tự trừ.
 *
 * Và `booking.price` = `currentPrice` = `transportPrice` + phụ phí — tức đã net
 * giảm ghế. Lấy `booking.price` trừ tiếp `seatDiscountAmount` là trừ hai lần:
 * chuyến 2 ghế 600k → hiện "Giá thực tế" 430k thay vì 490k, và cả cột không cộng
 * ra được số "Khách trả".
 */

/**
 * Giá vận chuyển GỘP — trước khi trừ giảm theo số ghế.
 *
 * Dùng làm dòng đầu của bảng giá để dòng "giảm theo số ghế" có cái mà trừ. Nếu
 * lấy thẳng `transportPrice` thì dòng giảm ghế bị trừ khống.
 *
 * Cộng lại đúng bằng `full` gốc, không lệch làm tròn: backend cố ý tính
 * `seatDiscountAmount = full − transportPrice` (hiệu số) thay vì nhân %.
 */
export function grossTransportPrice(breakdown: PriceBreakdown | null | undefined): number {
  if (!breakdown) return 0;
  return Number(breakdown.transportPrice ?? 0) + Number(breakdown.seatDiscountAmount ?? 0);
}

/**
 * Tổng các khoản CÒN PHẢI TRỪ khỏi `booking.price` — CHỈ loyalty + promotion.
 *
 * Cố tình KHÔNG cộng `seatDiscountAmount` (xem ghi chú đầu file). Đừng "sửa" hàm
 * này thành cộng tổng `buildDiscountRows` cho gọn — đó chính là bug cũ.
 */
export function subtractableDiscountTotal(breakdown: PriceBreakdown | null | undefined): number {
  if (!breakdown) return 0;
  return Number(breakdown.loyaltyDiscount ?? 0) + Number(breakdown.promotionDiscount ?? 0);
}

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
  const seatDiscount = Number(breakdown.seatDiscountAmount ?? 0);
  if (seatDiscount > 0) {
    const percent = Number(breakdown.seatDiscountPercent ?? 0);
    const label = percent > 0 ? `Giảm giá theo số ghế (đi chung, -${percent}%)` : 'Giảm giá theo số ghế (đi chung)';
    rows.push({ label, value: seatDiscount });
  }
  return rows;
}
