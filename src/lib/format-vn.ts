/**
 * Định dạng tiền + thời gian dùng chung cho các màn affiliate.
 *
 * Tách ra file riêng vì `formatVnDateTime` bản cũ nằm cục bộ trong `referrals/page.tsx` và
 * KHÔNG có NĂM — sổ hoa hồng trải nhiều tháng mà hiện "12/03 09:15" thì người đối soát không
 * phân biệt được năm nào, đúng chỗ dễ soát nhầm nhất.
 */

export const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(n);

/**
 * Giờ VN (Asia/Ho_Chi_Minh) độc lập timezone trình duyệt — bắt buộc theo CLAUDE.md.
 * `withYear` mặc định BẬT: mọi mốc dùng để đối soát đều cần năm.
 */
export const formatVnDateTime = (
  iso: string | null | undefined,
  opts: { withYear?: boolean } = {},
): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    ...(opts.withYear === false ? {} : { year: 'numeric' as const }),
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Chỉ ngày, giờ VN — cho cột "Ngày" không cần giờ. */
export const formatVnDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};
