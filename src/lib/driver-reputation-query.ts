/**
 * Dựng query string cho 2 endpoint danh sách điểm uy tín.
 *
 * Tách khỏi `api.ts` để test được mà không cần mock `fetch`, và để nơi gọi
 * KHÔNG tự nối chuỗi — mỗi chỗ tự nối là một chỗ có thể quên `minRatings`.
 *
 * Vì sao phải kẹp/lọc ở client dù backend đã kẹp: backend đọc tham số bằng
 * `Number(x) || default`, nên một giá trị rác lọt xuống sẽ ÂM THẦM rơi về mặc
 * định — `limit=NaN` thành 20, `minRatings=NaN` thành 0. Cái thứ hai nguy hiểm:
 * bộ lọc "chỉ tài đã có đánh giá" tự tắt và admin nhận nguyên 11.7k dòng rỗng
 * mà không có lỗi nào báo. Chặn ngay ở đây, đúng chỗ dựng URL.
 */

/** Trần `limit` của cả 2 endpoint (backend: `Math.min(..., 100)`). */
export const MAX_PAGE_LIMIT = 100;

/** Mặc định của trang: CHỈ hiện tài đã có ≥1 đánh giá. Thực tế dữ liệu là
 *  ~11.7k tài mà chỉ một nhúm có đánh giá — bỏ lọc thì trang mở ra toàn dòng
 *  rỗng, admin không dùng được. Bỏ lọc phải là hành động CỐ Ý (checkbox). */
export const DEFAULT_MIN_RATINGS = 1;

/** Số nguyên không âm dùng được, hoặc `null` nếu vô nghĩa (NaN/Infinity/âm).
 *  `null` ⇒ nơi gọi BỎ HẲN tham số thay vì gửi rác cho backend nuốt. */
function toNonNegativeInt(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const floored = Math.floor(value);
  return floored >= 0 ? floored : null;
}

export type RankingQueryInput = {
  /** Tìm theo tên hoặc SĐT. Chuỗi rỗng/khoảng trắng ⇒ bỏ hẳn tham số. */
  q?: string | null;
  limit?: number | null;
  offset?: number | null;
  /** Số đánh giá tối thiểu. `0` là GIÁ TRỊ THẬT ("hiện cả tài chưa có đánh
   *  giá"), không phải "chưa set" — đừng thay bằng falsy check. */
  minRatings?: number | null;
};

/**
 * `?q=&limit=&offset=&minRatings=` cho GET /admin/driver-reputation.
 *
 * `minRatings` KHÔNG được suy ra bằng `x || DEFAULT`: `0 || 1` ra 1, tức là
 * người dùng tick "Hiện cả tài chưa có đánh giá" xong danh sách vẫn lọc như cũ.
 * Chỉ `undefined`/`null`/rác mới rơi về mặc định.
 */
export function buildRankingQuery(input: RankingQueryInput = {}): string {
  const params = new URLSearchParams();

  const q = (input.q ?? '').trim();
  if (q) params.set('q', q);

  const limit = toNonNegativeInt(input.limit);
  // limit=0 vô nghĩa (backend đổi thành 20) — chỉ gửi khi ≥1, và kẹp trần 100.
  if (limit !== null && limit >= 1) params.set('limit', String(Math.min(limit, MAX_PAGE_LIMIT)));

  const offset = toNonNegativeInt(input.offset);
  if (offset !== null && offset > 0) params.set('offset', String(offset));

  const minRatings = toNonNegativeInt(input.minRatings);
  params.set('minRatings', String(minRatings ?? DEFAULT_MIN_RATINGS));

  return params.toString();
}

export type RecentRatingsQueryInput = {
  limit?: number | null;
  offset?: number | null;
  /** Chỉ lấy đánh giá ≤ N sao (1..5). `null`/bỏ trống ⇒ không lọc. */
  maxStars?: number | null;
};

/**
 * `?limit=&offset=&maxStars=` cho GET /admin/driver-reputation/ratings/recent.
 *
 * `maxStars` ngoài 1..5 bị BỎ HẲN chứ không kẹp: backend kẹp về [1,5] nên
 * `maxStars=0` sẽ thành 1 và admin thấy "1 sao" trong khi họ chọn "0" —
 * không lọc còn trung thực hơn là lọc sai âm thầm.
 */
export function buildRecentRatingsQuery(input: RecentRatingsQueryInput = {}): string {
  const params = new URLSearchParams();

  const limit = toNonNegativeInt(input.limit);
  if (limit !== null && limit >= 1) params.set('limit', String(Math.min(limit, MAX_PAGE_LIMIT)));

  const offset = toNonNegativeInt(input.offset);
  if (offset !== null && offset > 0) params.set('offset', String(offset));

  const maxStars = toNonNegativeInt(input.maxStars);
  if (maxStars !== null && maxStars >= 1 && maxStars <= 5) params.set('maxStars', String(maxStars));

  return params.toString();
}
