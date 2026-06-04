export type RejectReasonGroup = {
  label: string;
  options: { value: string; label: string }[];
};

// Grouped predefined rejection reasons shown to the admin. The `label` is what
// gets combined into the reason string sent to the driver, so it must read well
// on its own.
export const REJECT_REASONS: RejectReasonGroup[] = [
  {
    label: 'Bằng lái',
    options: [
      { value: 'license_blurry', label: 'Ảnh bằng lái không rõ, không đọc được' },
      { value: 'license_missing', label: 'Thiếu ảnh bằng lái (mặt trước/sau)' },
      { value: 'license_expired', label: 'Bằng lái đã hết hạn' },
      { value: 'license_wrong_class', label: 'Sai hạng bằng lái' },
    ],
  },
  {
    label: 'CCCD',
    options: [
      { value: 'cccd_blurry', label: 'Ảnh CCCD không rõ, không đọc được' },
      { value: 'cccd_missing', label: 'Thiếu ảnh CCCD (mặt trước/sau)' },
      { value: 'cccd_mismatch', label: 'Thông tin CCCD không khớp' },
    ],
  },
  {
    label: 'Phương tiện / Đăng ký xe',
    options: [
      { value: 'vehicle_reg_blurry', label: 'Ảnh đăng ký xe không rõ, không đọc được' },
      { value: 'vehicle_plate_mismatch', label: 'Biển số không khớp' },
      { value: 'vehicle_photo_invalid', label: 'Ảnh xe không rõ/không hợp lệ' },
      { value: 'badge_blurry', label: 'Ảnh phù hiệu không rõ, không đọc được' },
      { value: 'badge_missing', label: 'Thiếu ảnh phù hiệu' },
    ],
  },
  {
    label: 'Khác',
    options: [
      { value: 'profile_incomplete', label: 'Thông tin cá nhân chưa đầy đủ' },
      { value: 'transport_company_invalid', label: 'Đơn vị vận tải chưa hợp lệ' },
      { value: 'other', label: 'Lý do khác' },
    ],
  },
];

const REASON_LABEL_BY_VALUE = new Map(
  REJECT_REASONS.flatMap((group) => group.options).map((opt) => [opt.value, opt.label]),
);

// Combines the selected reason values (in the order defined in REJECT_REASONS)
// and an optional free-text note into the single string stored as
// `rejectionReason` and shown to the driver. Each reason is its own line so the
// driver app can split on newlines to render a list.
export function combineRejectReason(selectedValues: string[], note?: string): string {
  const orderedValues = REJECT_REASONS.flatMap((group) => group.options)
    .map((opt) => opt.value)
    .filter((value) => selectedValues.includes(value));

  const lines = orderedValues
    .map((value) => REASON_LABEL_BY_VALUE.get(value))
    .filter(Boolean)
    .map((label) => `- ${label}`);

  const trimmedNote = note?.trim();
  const parts = [lines.join('\n')].filter(Boolean);
  if (trimmedNote) parts.push(trimmedNote);

  return parts.join('\n\n');
}
