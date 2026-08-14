/**
 * Định nghĩa 4 tab của hàng đợi CSKH bằng ĐÚNG tham số API — logic thuần, tách khỏi
 * page.tsx để test được mà không phải mount cả trang.
 *
 * Quy tắc quan trọng nhất ở đây là `excludeStatus` của tab "before". Backend suy pha
 * cuộc gọi từ `booking.completedAt` (booking.service.ts), client không chọn được pha.
 * Nếu để chuyến đã COMPLETED nằm trong tab "cần gọi trước", CSKH bấm xử lý sẽ ghi vào
 * callAfter* còn callBeforeStatus vẫn NULL -> dòng đó KHÔNG BAO GIỜ rời hàng đợi.
 * Số chuyến bị sót gọi trước là một CHỈ SỐ (xem /cskh-activity), không phải việc tồn.
 */
import type { getBookings } from '@/lib/api';

export type QueueTab = 'before' | 'after' | 'mine' | 'overdue';

export const QUEUE_TAB_ORDER: QueueTab[] = ['before', 'after', 'mine', 'overdue'];

export const QUEUE_TAB_LABEL: Record<QueueTab, string> = {
  before: 'Cần gọi trước',
  after: 'Cần gọi sau',
  mine: 'Việc của tôi',
  overdue: 'Quá hạn',
};

/**
 * Kiểu buộc theo đúng tham số của getBookings. KHÔNG dùng Record<string, unknown>:
 * spread một index-signature vào getBookings sẽ tắt hết kiểm kiểu ở call-site, gõ sai
 * `sortby` hay `callbefore` sẽ im lặng trôi qua và tab trả sai dữ liệu.
 *
 * `NonNullable` là BẮT BUỘC, không phải cho đẹp: `getBookings(params = {})` có tham số
 * TUỲ CHỌN nên `Parameters<typeof getBookings>[0]` mang theo cả `undefined`, khiến mọi
 * call-site phải kiểm null trên một giá trị hàm này không bao giờ trả về.
 */
export type QueueParams = Partial<NonNullable<Parameters<typeof getBookings>[0]>>;

/**
 * Pha của MỘT DÒNG, suy đúng như backend suy: `recordCustomerCall` chọn pha theo
 * `booking.completedAt` có hay không, client không chọn được pha.
 *
 * 🚨 KHÔNG suy pha theo TAB. Tab "Việc của tôi" lọc bằng `claimedBy`, mà SQL của nó OR
 * CẢ HAI pha, nên một tab chứa lẫn cả hai loại dòng. Suy theo tab thì mọi việc gọi-TRƯỚC
 * trong tab đó bị đọc nhầm sang cột `callAfter*` (luôn NULL vì nhánh before yêu cầu
 * `completedAt IS NULL`) -> dòng hiện lại nút "Nhận gọi" thay vì 2 nút ghi kết quả ->
 * bấm lại ghi thêm một event CLAIMED -> lặp vô hạn, và không có đường đóng việc gọi-trước.
 */
export function rowIsBeforePhase(booking: { completedAt?: string | null }): boolean {
  return !booking.completedAt;
}

/**
 * Mốc bắt đầu ĐẾM CHỜ của một dòng. Việc gọi-trước tính từ lúc khách đặt; việc gọi-sau
 * tính từ lúc chuyến hoàn thành — dùng chung `createdAt` cho cả hai thì cột "Đã chờ" ở
 * việc gọi-sau sẽ hiện tuổi của CHUYẾN, không phải tuổi của VIỆC.
 *
 * Theo DÒNG chứ không theo tab, cùng lý do với `rowIsBeforePhase`.
 */
export function waitedSince(booking: {
  createdAt?: string | null;
  completedAt?: string | null;
}): string | null {
  return rowIsBeforePhase(booking) ? (booking.createdAt ?? null) : (booking.completedAt ?? null);
}

/**
 * "Đã chờ bao lâu" cho người đọc. KHÔNG dùng ngày-tháng ở đây nên không có bẫy múi
 * giờ: đây là HIỆU hai mốc thời gian tuyệt đối, không phải ranh giới ngày VN.
 */
export function formatWaited(sinceIso: string | null | undefined, nowMs: number): string {
  if (!sinceIso) return '—';
  const t = new Date(sinceIso).getTime();
  if (Number.isNaN(t)) return '—';
  const mins = Math.floor((nowMs - t) / 60_000);
  if (mins < 0) return '—'; // mốc ở tương lai (lệch đồng hồ) — thà không hiện còn hơn hiện số âm
  if (mins < 60) return `${mins} phút`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rem = mins % 60;
    return rem ? `${hours} giờ ${rem} phút` : `${hours} giờ`;
  }
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days} ngày ${remH} giờ` : `${days} ngày`;
}

export function paramsForTab(tab: QueueTab, adminId: string): QueueParams {
  switch (tab) {
    case 'before':
      return {
        callBefore: 'uncalled',
        excludeStatus: 'COMPLETED,CANCELLED',
        // Chờ lâu nhất lên đầu. CỐ Ý dùng createdAt chứ không phải scheduledTime:
        // chuyến thường có scheduledTime NULL nên sắp theo cột đó sẽ đẩy chuyến
        // đi-ngay (gấp nhất) xuống cuối.
        sortBy: 'createdAt',
        order: 'ASC',
      };
    case 'after':
      return { callAfter: 'uncalled', status: 'COMPLETED', sortBy: 'completedAt', order: 'ASC' };
    case 'mine':
      return { claimedBy: adminId, sortBy: 'createdAt', order: 'ASC' };
    case 'overdue':
      // Ngưỡng giờ CỐ Ý không nằm ở FE — backend đọc từ system_config
      // (CSKH_CALL_AFTER_OVERDUE_HOURS) để ops đổi được mà không cần deploy admin.
      return {
        callAfter: 'uncalled',
        status: 'COMPLETED',
        overdue: true,
        sortBy: 'completedAt',
        order: 'ASC',
      };
  }
}
