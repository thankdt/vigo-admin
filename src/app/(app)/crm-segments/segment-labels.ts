import type { CrmChurnRisk, CrmSegmentCode } from '@/lib/api';

/** Nhãn phân khúc — nguồn DUY NHẤT, dùng chung cho màn phân khúc lẫn hồ sơ 360. */
export const SEGMENT_LABEL: Record<CrmSegmentCode, string> = {
  MOI_CHUA_QUAY_LAI: 'Khách mới chưa quay lại',
  DANG_HOAT_DONG: 'Đang hoạt động',
  VIP: 'VIP',
  NGUY_CO_ROI_BO: 'Nguy cơ rời bỏ',
  DA_ROI_BO: 'Đã rời bỏ',
  MOT_LAN_ROI_THOI: 'Một lần rồi thôi',
  CHUA_DI_CHUYEN: 'Chưa đi chuyến nào',
};

/**
 * Việc cần làm cho từng phân khúc (§14.3). Hiện ngay cạnh nhãn: một phân khúc không kèm
 * hành động thì chỉ là cái nhãn đẹp.
 */
export const SEGMENT_ACTION: Record<CrmSegmentCode, string> = {
  MOI_CHUA_QUAY_LAI: 'Kéo về chuyến thứ hai — nhóm lớn nhất',
  DANG_HOAT_DONG: 'Giữ nguyên, đừng làm phiền',
  VIP: 'Ưu tiên xử lý ticket, chăm riêng',
  NGUY_CO_ROI_BO: 'Win-back: từng đi đều, đang chững lại',
  DA_ROI_BO: 'Chiến dịch kéo lại, kỳ vọng thấp',
  MOT_LAN_ROI_THOI: 'Cần onboarding, KHÁC hẳn nhóm rời bỏ',
  CHUA_DI_CHUYEN: 'Chưa có dữ liệu để phân khúc',
};

export const CHURN_LABEL: Record<CrmChurnRisk, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
};

/** Trường lọc được — MIRROR `SEGMENT_FIELDS` của backend (lệch là ăn 400 khi lưu). */
export const SEGMENT_FIELD_LABEL: Record<string, string> = {
  segment: 'Phân khúc',
  churnRisk: 'Nguy cơ rời bỏ',
  tripsCompleted: 'Số chuyến hoàn thành',
  tripsCancelled: 'Số chuyến huỷ',
  gmv: 'Tổng chi tiêu (đ)',
  avgStarsGiven: 'Sao trung bình khách chấm',
  rScore: 'Điểm R (độ mới)',
  fScore: 'Điểm F (tần suất)',
  mScore: 'Điểm M (giá trị)',
  lastTripAt: 'Chuyến gần nhất',
  firstTripAt: 'Chuyến đầu tiên',
};

export const SEGMENT_OP_LABEL: Record<string, string> = {
  eq: 'bằng',
  ne: 'khác',
  gt: 'lớn hơn',
  gte: 'từ',
  lt: 'nhỏ hơn',
  lte: 'tới',
};
