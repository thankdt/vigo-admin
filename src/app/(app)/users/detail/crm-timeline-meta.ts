import type { CrmTimelineItem, CrmTimelineKind } from '@/lib/api';
import { BOOKING_CALL_STATUS_LABEL } from '@/lib/cskh-call-labels';
import type { CustomerCallStatus } from '@/lib/types';

/**
 * Logic THUẦN của timeline hồ sơ 360: kind → nhãn hiển thị.
 *
 * File này cố ý KHÔNG import React và KHÔNG import component nào — test được mà không phải
 * mount cả trang. (Nhưng test hàm thuần KHÔNG thay được test cấp trang: bài học §13.3 nói
 * `/crm-queue` ship với 17 ca hàm thuần mà cả 4 finding vẫn lọt qua vì `page.tsx` không có
 * test nào.)
 */

/** Thứ tự dùng cho bộ lọc/chú giải — khớp thứ tự backend khai trong CRM_TIMELINE_KINDS. */
export const TIMELINE_KIND_ORDER: CrmTimelineKind[] = [
  'CALL',
  'TRIP_CREATED',
  'TRIP_COMPLETED',
  'RATING',
  'NOTE',
  'NOTIFICATION',
];

export const TIMELINE_KIND_LABEL: Record<CrmTimelineKind, string> = {
  CALL: 'Cuộc gọi CSKH',
  TRIP_CREATED: 'Đặt chuyến',
  TRIP_COMPLETED: 'Hoàn thành chuyến',
  RATING: 'Đánh giá tài xế',
  NOTE: 'Ghi chú CSKH',
  NOTIFICATION: 'Thông báo',
};

/**
 * Nhãn của MỘT DÒNG, suy từ `item.kind` của CHÍNH DÒNG ĐÓ.
 *
 * 🚨 KHÔNG bao giờ suy từ bộ lọc/chip đang chọn trên màn — đó đúng là bẫy §13.2 đã gây lỗi
 * CHẶN ở GĐ1 dưới hình dạng "suy pha cuộc gọi theo TAB". Khi backend đã có quy tắc suy
 * trạng thái, FE soi gương đúng quy tắc đó.
 *
 * Với `CALL`, nhãn lấy từ `BOOKING_CALL_STATUS_LABEL` — NGUỒN DUY NHẤT. `src/lib/cskh-call-labels.ts`
 * ra đời chính vì bộ nhãn này từng bị chép tay ở 2 nơi; backend cố ý trả mã thô để FE map.
 */
export function metaForItem(item: CrmTimelineItem): { label: string; tone: string } {
  if (item.kind === 'CALL') {
    const status = String(item.meta?.status ?? '') as CustomerCallStatus;
    return {
      label: BOOKING_CALL_STATUS_LABEL[status] ?? TIMELINE_KIND_LABEL.CALL,
      tone: status === 'CALLED' ? 'success' : status === 'UNREACHED' ? 'danger' : 'muted',
    };
  }

  if (item.kind === 'RATING') {
    const stars = Number(item.meta?.stars ?? 0);
    return {
      label: stars > 0 ? `${TIMELINE_KIND_LABEL.RATING} — ${stars}★` : TIMELINE_KIND_LABEL.RATING,
      tone: stars > 0 && stars <= 2 ? 'danger' : 'muted',
    };
  }

  return { label: TIMELINE_KIND_LABEL[item.kind] ?? 'Hoạt động', tone: 'muted' };
}
