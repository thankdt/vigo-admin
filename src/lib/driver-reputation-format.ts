/**
 * Hiển thị điểm & đánh giá tài xế — thuần format, KHÔNG render (để test không cần DOM).
 *
 * LUẬT BẤT DI BẤT DỊCH (xem spec "Điểm uy tín tài xế"):
 *  1. `null` KHÔNG PHẢI 0. Chỉ số null — hoặc có tên trong `collecting` — phải hiện
 *     "Đang thu thập", TUYỆT ĐỐI không hiện "0%". `acceptRate`/`onTimeRate` không
 *     backfill được nên những tuần đầu chắc chắn rỗng; hiện 0% là vu cho tài xế kém
 *     trong khi hệ thống chỉ chưa có số.
 *  2. `displayStars === null` → "Chưa có đánh giá", không phải 0 sao / "0.0".
 *     Tài mới bị dán nhãn 0 sao là mất chuyến oan.
 *  3. Không có hàm nào ở đây dùng để xếp hạng/lọc/chặn — giai đoạn 1 CHỈ hiển thị.
 */

/** Nhãn dùng chung cho mọi chỉ số chưa có dữ liệu. */
export const COLLECTING_LABEL = 'Đang thu thập';

/** Nhãn khi tài xế chưa đủ đánh giá để công khai sao. */
export const NO_RATING_LABEL = 'Chưa có đánh giá';

/** Tên chỉ số vận hành trong mảng `collecting` của backend. */
export type OpsMetricKey = 'accept' | 'onTime' | 'completion';

/**
 * Chỉ số vận hành 0..1 → "87%". null/NaN, hoặc `key` nằm trong `collecting`
 * → "Đang thu thập" (LUẬT 1). Kẹp về 0..100% để số lệch từ backend không
 * hiện ra thành "-12%" / "140%".
 */
export function formatOpsRate(
  value: number | null | undefined,
  key: OpsMetricKey,
  collecting?: string[] | null,
): string {
  if (collecting?.includes(key)) return COLLECTING_LABEL;
  if (value == null || typeof value !== 'number' || !Number.isFinite(value)) {
    return COLLECTING_LABEL;
  }
  const pct = Math.round(value * 100);
  return `${Math.min(100, Math.max(0, pct))}%`;
}

/**
 * Sao công khai → "4.4". null (chưa đủ đánh giá), hoặc 'star' nằm trong
 * `collecting` → "Chưa có đánh giá" (LUẬT 2 — không bao giờ trả "0.0").
 *
 * `<= 0` cũng coi là chưa có: khách chỉ chấm được 1..5 sao nên trung bình 0
 * KHÔNG thể có thật — số 0 chỉ có thể là backend trả placeholder thay cho null.
 * Rơi về "Chưa có đánh giá" ở trường hợp đó là an toàn tuyệt đối (không thể
 * giấu mất dữ liệu thật), còn hiện "0.0" thì đúng là cái hại LUẬT 2 cấm.
 */
export function formatDisplayStars(
  displayStars: number | null | undefined,
  collecting?: string[] | null,
): string {
  if (collecting?.includes('star')) return NO_RATING_LABEL;
  if (displayStars == null || typeof displayStars !== 'number' || !Number.isFinite(displayStars)) {
    return NO_RATING_LABEL;
  }
  if (displayStars <= 0) return NO_RATING_LABEL;
  return displayStars.toFixed(1);
}

/** Điểm tổng 0..100 → "72". Thiếu số → "—" (không hiện 0). */
export function formatScore(score: number | null | undefined): string {
  if (score == null || typeof score !== 'number' || !Number.isFinite(score)) return '—';
  return String(Math.min(100, Math.max(0, Math.round(score))));
}

/** Phân bố sao trả về từ backend: { "1": n, … "5": n }. */
export type StarDistribution = Record<string, number>;

/** Tổng số đánh giá trong phân bố (bỏ qua khoá lạ / giá trị không phải số). */
export function distributionTotal(distribution: StarDistribution | null | undefined): number {
  if (!distribution) return 0;
  let total = 0;
  for (const star of [1, 2, 3, 4, 5]) {
    const n = distribution[String(star)];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

/**
 * Bề rộng thanh phân bố (0..100) cho mức `star`. Tổng = 0 → 0 (thanh rỗng),
 * KHÔNG chia cho 0.
 */
export function distributionPercent(
  distribution: StarDistribution | null | undefined,
  star: 1 | 2 | 3 | 4 | 5,
): number {
  const total = distributionTotal(distribution);
  if (total <= 0) return 0;
  const n = distribution?.[String(star)];
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 0;
  return (n / total) * 100;
}

/** Số đánh giá ở mức `star` (an toàn khi thiếu khoá). */
export function distributionCount(
  distribution: StarDistribution | null | undefined,
  star: 1 | 2 | 3 | 4 | 5,
): number {
  const n = distribution?.[String(star)];
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}
