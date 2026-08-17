// Nhận diện config kiểu cờ bật/tắt để render nút gạt thay vì ô gõ text.
//
// Vì sao nhận diện theo GIÁ TRỊ chứ không theo danh sách key hardcode: backend
// thêm cờ mới bằng migration seed, admin không có cách nào biết trước tên key.
// Bám vào giá trị ⇒ cờ mới tự có nút gạt, không bao giờ lệch danh sách với BE.
//
// ⚠️ Backend đọc cờ bằng `=== 'true'` (một số call site có `.toLowerCase()`), nên
// chiều GHI phải luôn là chuỗi thường `'true'` / `'false'` — xem `boolToConfigValue`.

/**
 * Giá trị có phải cờ bật/tắt không.
 *
 * Chấp nhận khoảng trắng thừa và chữ hoa khi ĐỌC (dữ liệu cũ có thể lẫn `TRUE`),
 * nhưng KHÔNG nhận `1`/`0`/`yes`/`on` — không key nào của Vigo dùng dạng đó, nhận
 * bừa sẽ biến một ô số/text thành nút gạt và khoá mất khả năng nhập giá trị thật.
 */
export function isBooleanConfigValue(value: string | null | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'true' || v === 'false';
}

/** Trạng thái nút gạt. Mọi giá trị không phải `true` đều coi là TẮT (fail-closed, giống backend). */
export function parseBooleanConfigValue(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

/** Chuỗi canonical để gửi lên backend. Luôn chữ thường, không khoảng trắng. */
export function boolToConfigValue(on: boolean): string {
  return on ? 'true' : 'false';
}
