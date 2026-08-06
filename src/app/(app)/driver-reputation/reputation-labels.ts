/**
 * Nhãn hiển thị riêng cho trang /driver-reputation — thuần format, KHÔNG render
 * (test không cần DOM).
 *
 * LUẬT BẤT DI BẤT DỊCH (giống khối "Điểm & đánh giá" ở chi tiết tài xế):
 *  - `displayStars === null` ⇒ "Chưa có đánh giá". TUYỆT ĐỐI không "0 sao"/"0.0".
 *  - KHÔNG `?? 0` trên field nullable — 0 và "chưa có" là hai chuyện khác nhau.
 *  - Điểm/sao ở đây CHỈ để hiện và để xếp đúng bảng xếp hạng (thứ tự do backend
 *    quyết bằng sao Bayes). Không dùng để chặn/ẩn/xếp lại bất cứ thứ gì khác.
 *
 * Quy tắc sao dùng LẠI `formatDisplayStars` trong src/lib/driver-reputation-format.ts
 * — KHÔNG viết định nghĩa "có sao hay không" thứ hai ở đây. Hai định nghĩa lệch
 * nhau từng đẻ ra đúng lỗi: chữ "Chưa có đánh giá" nằm cạnh 5 ngôi sao rỗng.
 */

import { formatDisplayStars, hasDisplayStars, NO_RATING_LABEL } from '@/lib/driver-reputation-format';

export { NO_RATING_LABEL, formatDisplayStars, hasDisplayStars };

/** Không có tên/SĐT thì hiện gạch ngang, không hiện "null" hay ô trống khó hiểu. */
export const EMPTY_TEXT = '—';

/** Tên tài xế cho ô danh sách. */
export function driverNameText(fullName: string | null | undefined): string {
  const name = (fullName ?? '').trim();
  return name || 'Không tên';
}

/** SĐT cho ô danh sách. */
export function driverPhoneText(phone: string | null | undefined): string {
  const p = (phone ?? '').trim();
  return p || EMPTY_TEXT;
}

/**
 * Số lượt đánh giá. Ở ĐÂY 0 là số THẬT (đếm được, không phải "chưa biết") nên
 * hiện "0" là đúng — khác hẳn `displayStars`. Chỉ giá trị vô nghĩa
 * (null/undefined/NaN/âm) mới thành "—".
 */
export function ratingCountText(count: number | null | undefined): string {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return EMPTY_TEXT;
  return String(Math.floor(count));
}

/** Mốc thời gian theo GIỜ VN (+7), độc lập TZ trình duyệt (CLAUDE.md). */
const VN_DATETIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit', // '2-digit' để 09:00 không thành 9:00
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** ISO → "HH:mm dd/MM/yyyy" giờ VN. Thiếu/hỏng ⇒ "—" (không hiện Invalid Date). */
export function formatVnDateTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY_TEXT;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EMPTY_TEXT;
  return VN_DATETIME.format(d);
}

/** Lần đánh giá gần nhất — chưa từng có thì nói thẳng, không để trống. */
export function lastRatingText(iso: string | null | undefined): string {
  return iso ? formatVnDateTime(iso) : NO_RATING_LABEL;
}

/**
 * Số sao của MỘT đánh giá đơn lẻ (1..5, do khách bấm) → "3★".
 *
 * KHÁC `formatDisplayStars`: đây là phiếu chấm cụ thể, không phải trung bình
 * công khai, nên không có khái niệm "chưa có" — nhưng vẫn phải chặn giá trị
 * hỏng để không vẽ ra "NaN★" hay 12 ngôi sao.
 */
export function ratingStarsText(stars: number | null | undefined): string {
  if (typeof stars !== 'number' || !Number.isFinite(stars)) return EMPTY_TEXT;
  const clamped = Math.min(5, Math.max(1, Math.round(stars)));
  return `${clamped}★`;
}

/** Số sao đặc để tô màu — luôn nằm trong 0..5, dùng cho phần trang trí. */
export function ratingStarsValue(stars: number | null | undefined): number {
  if (typeof stars !== 'number' || !Number.isFinite(stars)) return 0;
  return Math.min(5, Math.max(0, Math.round(stars)));
}

/** Đánh giá "thấp" (≤3 sao) — chỉ để tô màu cảnh báo, KHÔNG để chặn gì cả. */
export function isLowRating(stars: number | null | undefined): boolean {
  return typeof stars === 'number' && Number.isFinite(stars) && stars <= 3;
}

/**
 * Loại dịch vụ của chuyến → tiếng Việt (khớp SERVICE_TYPE_LABELS ở
 * master-data/route-pricing-manager). Mã lạ hiện NGUYÊN MÃ; rỗng ⇒ null (nơi
 * gọi bỏ hẳn nhãn thay vì hiện badge trống).
 */
const SERVICE_TYPE_LABEL: Record<string, string> = {
  CARPOOL: 'Ghép xe',
  RIDE: 'Bao xe',
  DELIVERY: 'Giao hàng',
};

export function serviceTypeText(serviceType: string | null | undefined): string | null {
  const key = (serviceType ?? '').trim();
  if (!key) return null;
  return SERVICE_TYPE_LABEL[key] ?? key;
}

/**
 * Lý do một đánh giá KHÔNG được tính vào điểm. Mã backend hiện có: `SELF_AGENT`
 * (khách tự đặt hộ mình / đại lý tự đánh giá).
 *
 * Mã lạ (backend thêm mã mới, admin deploy sau) hiện NGUYÊN MÃ chứ không nuốt
 * thành "Không rõ": mã thô còn tra được, "Không rõ" thì mất hẳn thông tin.
 */
const EXCLUDE_REASON_LABEL: Record<string, string> = {
  SELF_AGENT: 'Khách tự đặt hộ (đại lý tự đánh giá)',
};

export function excludeReasonText(reason: string | null | undefined): string | null {
  const key = (reason ?? '').trim();
  if (!key) return null;
  return EXCLUDE_REASON_LABEL[key] ?? key;
}

/**
 * Nhãn "không tính vào điểm" cho một đánh giá.
 * `null` ⇒ đánh giá bình thường, KHÔNG gắn nhãn gì.
 *
 * `isCounted` phải kiểm bằng `=== false`: field thiếu (undefined, backend cũ)
 * KHÔNG được hiểu là "bị loại" — dán nhãn loại trừ lên một đánh giá hợp lệ là
 * nói dối theo chiều ngược lại.
 */
export function notCountedLabel(rating: {
  isCounted?: boolean | null;
  excludeReason?: string | null;
}): string | null {
  if (rating.isCounted !== false) return null;
  const reason = excludeReasonText(rating.excludeReason);
  return reason ? `Không tính vào điểm · ${reason}` : 'Không tính vào điểm';
}

/**
 * Sao Bayes — KHOÁ SẮP XẾP của bảng xếp hạng.
 *
 * Phải hiện ra: nếu không, admin nhìn một bảng được sắp theo tiêu chí vô hình.
 * Càng khó hiểu hơn vì tài có 1–4 đánh giá vẫn hiện "Chưa có đánh giá" ở cột
 * Sao (ngưỡng công khai là 5), nên trông như thứ tự ngẫu nhiên.
 *
 * `null`/rác → dấu gạch, KHÔNG phải "0" — 0 ở đây nghĩa là điểm 0, khác hẳn
 * "chưa tính được".
 */
export function bayesText(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return Number(v).toFixed(2);
}
