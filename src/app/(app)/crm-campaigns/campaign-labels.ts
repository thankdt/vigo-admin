import type { CrmCampaignStatus } from '@/lib/api';

export const CAMPAIGN_STATUS_LABEL: Record<CrmCampaignStatus, string> = {
  DRAFT: 'Nháp',
  SENDING: 'Đang gửi',
  SENT: 'Đã gửi',
  CANCELLED: 'Đã huỷ',
};

/**
 * Lý do BỎ QUA người nhận — hiện ra thành chữ, không để mã trần.
 *
 * Đây là thứ chứng minh hai chốt chặn §6.6 CÓ CHẠY. Nếu màn hình chỉ hiện "đã gửi 12/50"
 * mà không nói 38 người kia đi đâu, người vận hành sẽ tưởng hệ thống lỗi và đi gửi lại tay
 * — đúng thứ chốt chặn sinh ra để ngăn.
 */
export const SKIP_REASON_LABEL: Record<string, string> = {
  OPTED_OUT: 'Khách đã yêu cầu ngừng nhận',
  RATE_LIMITED: 'Đã nhận đủ số tin cho phép trong tuần',
  NO_PHONE: 'Không có số điện thoại',
  DELETED_USER: 'Tài khoản đã xoá',
  // PUSH mà khách không có thiết bị nào của app khách — gửi cũng không tới đâu.
  NO_DEVICE: 'Khách chưa cài app / không có thiết bị nhận',
};

export const DELIVERY_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ gửi',
  SENT: 'Đã gửi',
  FAILED: 'Lỗi',
  SKIPPED: 'Bỏ qua',
};
