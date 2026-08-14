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
