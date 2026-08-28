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

/**
 * Tiền VND kiểu Việt: 430.000đ.
 *
 * Nhận cả CHUỖI: cột tiền bên backend khai `@Column('decimal')` và TypeORM trả
 * chuỗi, nên một API nào đó rò chuỗi ra là chuyện có thật — đã xảy ra 28/08,
 * ô "Tổng nhóm" hiện `NaN` trên màn admin.
 *
 * Không ra số hữu hạn ⇒ gạch ngang. Thà hiện "chưa biết" còn hơn hiện `NaN`
 * hay `0đ`: cả hai đều là nói dối admin về doanh thu, mà `NaN` ít ra còn nhìn
 * ra là hỏng, `0đ` thì không.
 */
export function formatVnd(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('vi-VN')}đ`;
}

/** Địa chỉ dài thì cắt bớt, giữ đủ để nhận ra nơi đó. */
export function shortAddress(a: string | null | undefined, max = 42): string {
  const t = (a ?? '').trim();
  if (!t) return '—';
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * Giờ VN dạng `HH:mm` từ mốc ISO. Cộng thẳng 7 giờ rồi đọc bằng `getUTC*`,
 * KHÔNG dùng `toLocaleTimeString` với timeZone: máy admin có thể ở múi khác,
 * và giờ hiển thị ở đây phải là giờ của TÀI XẾ.
 */
export function vnTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const vn = new Date(t + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(vn.getUTCHours())}:${p(vn.getUTCMinutes())}`;
}

/**
 * Nhãn độ trễ đón. Trả cả chuỗi lẫn mức độ để màn hình tô màu.
 *
 * Ngưỡng theo đúng thứ đã chốt cho bộ ghép: mỗi khách vẫn phải được đón trong
 * khung giờ họ chọn, còn vòng thêm thì tối đa 25 phút một khách. Nên >25' là
 * ĐỎ (vượt ngân sách đã thống nhất), 10–25' là VÀNG, dưới 10' coi như bình thường.
 */
export function delayLabel(min: number | null | undefined): {
  text: string;
  level: 'ok' | 'warn' | 'bad' | 'unknown';
} {
  if (min == null) return { text: '—', level: 'unknown' };
  if (min <= -1) return { text: `sớm ${Math.abs(min)}′`, level: 'ok' };
  if (min === 0) return { text: 'đúng giờ', level: 'ok' };
  if (min <= 10) return { text: `trễ ${min}′`, level: 'ok' };
  if (min <= 25) return { text: `trễ ${min}′`, level: 'warn' };
  return { text: `trễ ${min}′`, level: 'bad' };
}
