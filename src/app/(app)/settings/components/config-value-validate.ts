// Validate giá trị config trước khi gửi lên backend.
//
// ⚠️ GIỮ ĐỒNG BỘ với backend `src/master-data/config-value-validate.ts` (repo
// vigo-backend) — đổi một bên PHẢI đổi bên kia, nếu không admin sẽ chặn cái
// backend cho phép (người vận hành tưởng hỏng) hoặc cho gửi cái backend từ chối
// (báo lỗi VAL_002 khó hiểu sau khi bấm Lưu).
//
// Đây là lớp UX (fail fast + thông báo tiếng Việt cụ thể). Lớp CHẶN thật nằm ở
// backend: `users.service.ts` / `zalo.service.ts` ghi thẳng bảng `system_config`
// không qua service, nên "validate ở service = mọi call path" là SAI.

// Gate CHỈ đúng `*_MAP_STYLE_URL`. KHÔNG được nới thành /_URL$/:
//   - CUSTOMER_APP_UPDATE_URL / DRIVER_APP_UPDATE_URL nhận deep link
//     `market://…`, `itms-apps://…` — hợp lệ với chúng, sẽ bị chặn oan.
//   - KOL_SHARE_BASE_URL đang cố ý để rỗng ở prod.
export const MAP_STYLE_KEY_RE = /_MAP_STYLE_URL$/;

// Allowlist hardcode trong code, KHÔNG để trong system_config (admin bị chiếm =
// ép hàng chục nghìn thiết bị fetch URL tuỳ ý → rò vị trí + IP).
// Khớp = bằng ĐÚNG host, hoặc là subdomain (`.` + host) của một trong các mục này.
export const MAP_STYLE_ALLOWED_HOSTS = ['maps.vietmap.vn', 'api.mapbox.com', 'vigogroup.vn'];

const MAX_LEN = 2048;
const WHITESPACE_RE = /\s/;

/**
 * Chuẩn hoá giá trị TRƯỚC khi gửi lên backend — mirror của giá trị mà
 * `assertValidConfigValue` bên backend TRẢ VỀ và ghi xuống DB
 * (`master-data.service.ts#setSystemConfig` lưu `normalized`, không lưu chuỗi thô).
 *
 * Phải gọi ở mọi chỗ admin gửi giá trị đi, nếu không snapshot local sẽ giữ chuỗi
 * chưa trim trong khi DB giữ chuỗi đã trim → mở lại trang thấy giá trị "tự đổi".
 * Key ngoài diện kiểm trả nguyên giá trị (giữ nguyên hành vi ~150 config khác).
 */
export function normalizeConfigValue(key: string, value: string): string {
  if (!MAP_STYLE_KEY_RE.test(key)) return value;
  return value.trim();
}

/**
 * @returns `null` nếu hợp lệ, ngược lại là message lỗi tiếng Việt để hiển thị.
 *
 * Key không khớp `MAP_STYLE_KEY_RE` luôn hợp lệ (không áp luật nào).
 * Giá trị rỗng (sau `trim`) là HỢP LỆ — nghĩa là "xoá cấu hình", app sẽ quay về
 * bản đồ mặc định cài sẵn.
 */
export function validateConfigValue(key: string, value: string): string | null {
  if (!MAP_STYLE_KEY_RE.test(key)) return null;

  // TRIM TRƯỚC rồi mới áp luật — y hệt backend (`const v = (value ?? '').trim()`).
  // Backend CỐ Ý nhận khoảng trắng đầu/cuối và tự trim khi ghi (spec BE:
  // "trim khoảng trắng đầu/cuối trước khi ghi"). Nếu admin soi chuỗi thô thì một
  // URL dán kèm space/newline ở cuối — ca thường gặp nhất khi copy từ chat/email —
  // sẽ bị admin chặn cứng dù backend chấp nhận. Sau khi trim, luật `\s` bên dưới
  // chỉ còn bắt khoảng trắng Ở GIỮA, đúng như backend.
  const v = normalizeConfigValue(key, value);

  // Rỗng = xoá cấu hình (ngữ nghĩa 3 trạng thái: vắng / rỗng / URL).
  if (v === '') return null;

  if (v.length > MAX_LEN) {
    return `URL quá dài (${v.length} ký tự, tối đa ${MAX_LEN}).`;
  }

  if (WHITESPACE_RE.test(v)) {
    return 'URL không được chứa khoảng trắng (kể cả xuống dòng hay tab).';
  }

  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return 'URL không hợp lệ — hãy dán đầy đủ, bắt đầu bằng https://';
  }

  if (url.protocol !== 'https:') {
    return 'URL phải dùng https:// (không chấp nhận http hay scheme khác).';
  }

  const host = url.hostname.toLowerCase();
  const allowed = MAP_STYLE_ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  if (!allowed) {
    return `Tên miền "${host}" không được phép. Chỉ chấp nhận: ${MAP_STYLE_ALLOWED_HOSTS.join(
      ', ',
    )} (và tên miền con của chúng).`;
  }

  return null;
}
