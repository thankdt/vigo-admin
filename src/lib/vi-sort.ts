/**
 * Sắp xếp tiếng Việt: a < ă < â < b … d < đ < e …
 *
 * Máy chủ trả danh sách tỉnh/xã sắp theo mã ký tự (PostgreSQL `C.UTF-8`, giống Neon cũ), nên Đ/Ô/Ơ/Ư/Ă/Â dồn
 * xuống cuối ("Điềm Thuỵ … Đức Xuân" nằm sau "Yên Trạch"). Muốn thứ tự đọc được thì phải sắp lại ở client.
 */
const VI_COLLATOR = new Intl.Collator('vi');

export function compareVi(a: string, b: string): number {
  return VI_COLLATOR.compare(a, b);
}

/**
 * Bản sao đã sắp theo tên (tiếng Việt), hoà thì theo mã. Không phải mảng (API lỗi) thì trả nguyên giá trị; dòng null/
 * không phải object bị bỏ (thay vì làm cả lời gọi ném TypeError, khi đó các màn gọi `|| []` cũng không cứu được).
 */
export function sortByNameVi<T extends { name: string; code: string }>(list: T[]): T[] {
  if (!Array.isArray(list)) return list;
  const text = (v: unknown): string => (typeof v === 'string' ? v : '');
  return list
    .filter((x) => x !== null && typeof x === 'object')
    .sort((a, b) => compareVi(text(a.name), text(b.name)) || (text(a.code) < text(b.code) ? -1 : text(a.code) > text(b.code) ? 1 : 0));
}
