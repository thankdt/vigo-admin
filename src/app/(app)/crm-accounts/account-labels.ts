import type { CrmAccountStage } from '@/lib/api';

export const STAGE_LABEL: Record<CrmAccountStage, string> = {
  LEAD: 'Tiềm năng',
  NEGOTIATING: 'Đang đàm phán',
  SIGNED: 'Đã ký',
  ACTIVE: 'Đang hoạt động',
  CHURNED: 'Đã ngừng',
};

/**
 * Chuyển giai đoạn hợp lệ — MIRROR `ALLOWED_STAGE` của backend. Lệch bảng này là người dùng
 * bấm nút rồi ăn 400 mà không hiểu vì sao (bẫy §13.2).
 *
 * 🚨 CHURNED quay lại được — khách công ty ký lại là chuyện thường. CỐ Ý khác ticket CLOSED
 * (trạng thái cuối); đừng "thống nhất" hai bảng này với nhau.
 */
export const ACCOUNT_ALLOWED_STAGE: Record<CrmAccountStage, CrmAccountStage[]> = {
  LEAD: ['NEGOTIATING', 'CHURNED'],
  NEGOTIATING: ['SIGNED', 'CHURNED'],
  SIGNED: ['ACTIVE', 'CHURNED'],
  ACTIVE: ['CHURNED'],
  CHURNED: ['ACTIVE', 'NEGOTIATING'],
};

export const ACCOUNT_EVENT_LABEL: Record<string, string> = {
  CREATED: 'Tạo hồ sơ',
  STAGE_CHANGE: 'Đổi giai đoạn',
  NOTE: 'Ghi chú',
  MEMBER_ADDED: 'Thêm nhân viên',
  MEMBER_REMOVED: 'Gỡ nhân viên',
  TERMS_CHANGED: 'Đổi điều khoản',
};
