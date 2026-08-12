/**
 * Nhãn tiếng Việt cho các enum backend hiện thẳng lên badge/bảng của admin.
 *
 * Trước đây vài chỗ render `{e.type}` nên admin thấy `CLAWBACK`, `STAGE_CHANGE`,
 * `DRAFT`. Đây là lỗi im lặng: không ai phát hiện cho tới khi admin hỏi.
 *
 * QUY TẮC: nhánh mặc định KHÔNG BAO GIỜ trả enum thô. Backend thêm enum mới mà
 * admin chưa cập nhật là chuyện chắc xảy ra — khi đó admin cần đọc được "chưa
 * hỗ trợ", còn dev vẫn cần thấy mã để lần ra. `unknownEnumLabel` lo cả hai.
 */

export function unknownEnumLabel(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  return raw ? `Không rõ (${raw})` : 'Không rõ';
}

function labelOf(
  table: Record<string, string>,
  value: string | null | undefined,
): string {
  const raw = (value ?? '').trim();
  return table[raw] ?? unknownEnumLabel(raw);
}

/** referral-event.entity.ts:11 — ReferralEventType */
const REFERRAL_EVENT: Record<string, string> = {
  SIGNUP: 'Thưởng đăng ký',
  TRIP: 'Hoa hồng chuyến',
  CLAWBACK: 'Thu hồi',
};

export function REFERRAL_EVENT_LABEL(value: string | null | undefined): string {
  return labelOf(REFERRAL_EVENT, value);
}

/** driver-team.enums.ts:17 — DriverTeamEventType */
const DRIVER_TEAM_EVENT: Record<string, string> = {
  STAGE_CHANGE: 'Đổi giai đoạn',
  CALL: 'Gọi điện',
  NOTE: 'Ghi chú',
  ASSIGN: 'Giao phụ trách',
  FOLLOW_UP: 'Hẹn theo dõi',
};

export function DRIVER_TEAM_EVENT_LABEL(
  value: string | null | undefined,
): string {
  return labelOf(DRIVER_TEAM_EVENT, value);
}

/** Trạng thái lịch gửi thông báo */
const NOTIFICATION_STATUS: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã huỷ',
  FAILED: 'Lỗi lịch',
};

export function NOTIFICATION_STATUS_LABEL(
  value: string | null | undefined,
): string {
  return labelOf(NOTIFICATION_STATUS, value);
}
