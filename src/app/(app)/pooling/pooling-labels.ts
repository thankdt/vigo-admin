import type { PoolRejectReason } from '@/lib/api';

/**
 * Nhãn tiếng Việt cho lý do KHÔNG ghép được.
 *
 * Với màn quan sát, phần này quan trọng ngang danh sách ghép được: thấy "hôm nay
 * không có gợi ý nào" mà không biết do ngưỡng chặt hay do thật sự không có nhu
 * cầu thì admin không rút ra được gì.
 */
export const REJECT_LABEL: Record<PoolRejectReason, string> = {
  CUNG_KHACH: 'Cùng một khách',
  DAT_LAI: 'Khách đặt lại',
  LECH_GIO: 'Lệch giờ',
  QUA_GHE: 'Quá số ghế',
  DON_LECH_HANH_LANG: 'Điểm đón lệch tuyến',
  TRA_LECH_HANH_LANG: 'Điểm trả lệch tuyến',
  NGUOC_CHIEU: 'Ngược chiều',
};

/** Giải thích thêm khi admin rê chuột — vì sao luật đó tồn tại. */
export const REJECT_HINT: Record<PoolRejectReason, string> = {
  CUNG_KHACH: 'Một khách không tự ghép với chính mình. Phần lớn là do khách đặt lại sau khi bị huỷ.',
  DAT_LAI: 'Trùng điểm đón/trả và sát giờ — cùng một chuyến đặt lại, không phải hai khách.',
  LECH_GIO: 'Giờ đón cách nhau quá khung cho phép.',
  QUA_GHE: 'Cộng vào thì vượt sức chứa xe.',
  DON_LECH_HANH_LANG: 'Điểm đón nằm quá xa lộ trình của chuyến chủ.',
  TRA_LECH_HANH_LANG: 'Điểm trả nằm quá xa lộ trình của chuyến chủ.',
  NGUOC_CHIEU: 'Điểm trả nằm TRƯỚC điểm đón dọc tuyến — chạy ngược, tài xế phải quay đầu.',
};

/** Ngày VN hôm nay dạng YYYY-MM-DD, không phụ thuộc múi giờ máy admin. */
export function vnToday(): string {
  const vn = new Date(Date.now() + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${vn.getUTCFullYear()}-${p(vn.getUTCMonth() + 1)}-${p(vn.getUTCDate())}`;
}

/** Rút gọn id chuyến cho bảng hẹp. */
export const shortId = (id: string) => id.slice(0, 8);
