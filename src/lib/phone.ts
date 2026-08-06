// SĐT Việt Nam — helper thuần dùng chung (form tạo chuyến, nhân bản chuyến…).
// Chỉ chuẩn hoá + kiểm tra tại chỗ để báo lỗi sớm; BACKEND mới là chốt chặn thật
// (số sai định dạng backend âm thầm bỏ, trùng SĐT khách backend lưu null).

/**
 * Chuẩn hoá thô: bỏ khoảng trắng/./-/(), +84|84 → 0. Rỗng → ''.
 *
 * PHẢI khớp `normalizeVnPhone` của backend (`src/common/utils/phone.util.ts`):
 * '84…' chỉ quy đổi khi dài đúng 11 (84 + 9 số). Không có điều kiện độ dài thì
 * một số nội địa gõ thiếu số 0 đầu (vd '846123456' của '0846123456') bị cắt oan
 * thành số khác — hai tầng lệch nhau là nguồn lỗi âm thầm về sau.
 */
export function normalizeVnPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = String(raw).replace(/[\s.\-()]/g, '');
  if (s.startsWith('+84')) return `0${s.slice(3)}`;
  if (s.startsWith('84') && s.length === 11) return `0${s.slice(2)}`;
  return s;
}

/** ^0\d{9}$ sau chuẩn hoá. Chuỗi RỖNG coi là hợp lệ (field tuỳ chọn). */
export function isValidVnPhoneOrEmpty(raw: string | null | undefined): boolean {
  const s = normalizeVnPhone(raw);
  if (s === '') return true;
  return /^0\d{9}$/.test(s);
}

/** So 2 số sau chuẩn hoá; rỗng thì false. */
export function sameVnPhone(a?: string | null, b?: string | null): boolean {
  const x = normalizeVnPhone(a);
  const y = normalizeVnPhone(b);
  if (!x || !y) return false;
  return x === y;
}
