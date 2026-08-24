/**
 * Đọc số tiền từ ô nhập TỰ DO của người dùng.
 *
 * 🚨 Vì sao không dùng thẳng `Number(input)`: ngay cạnh ô nhập, màn hình in trần dưới dạng
 * `500.000đ` (`toLocaleString('vi-VN')` — dấu chấm ngăn nghìn). Người duyệt đọc dòng đó rồi
 * gõ đúng định dạng vừa thấy: `500.000`. Nhưng `Number("500.000") === 500` vì JS đọc dấu
 * chấm là dấu THẬP PHÂN — và 500 là số nguyên dương hợp lệ, nên nó đi lọt qua mọi lớp kiểm
 * và **cấp 500đ cho khách đáng được 500.000đ**, không một cảnh báo nào.
 *
 * Trớ trêu hơn: gõ `500,000` (dấu phẩy) thì `Number` ra `NaN` → bị chặn và người dùng THẤY
 * lỗi. Tức hai cách gõ tự nhiên nhất cho ra hai hành vi khác nhau, và cách nguy hiểm hơn
 * lại là cách IM LẶNG.
 *
 * Cách xử lý: bỏ MỌI ký tự không phải chữ số rồi mới đọc. Tiền VND không có phần lẻ nên
 * không mất gì. Người gọi PHẢI hiện lại con số đã hiểu để người dùng đối chiếu trước khi bấm.
 */
export function parseVndInput(raw: string): number | null {
  const digits = (raw ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}
