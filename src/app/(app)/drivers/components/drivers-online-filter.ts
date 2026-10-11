import type { DriverOnlineState } from '@/lib/driver-presence';

/** Tab có ý nghĩa lọc online — tài chưa được duyệt thì không chạy được. */
export const ONLINE_FILTER_TABS = ['true', 'all'] as const;

export const onlineFilterApplies = (tab: string) =>
  (ONLINE_FILTER_TABS as readonly string[]).includes(tab);

/** Giá trị `onlineState` gửi lên API cho tab hiện tại (undefined = không lọc). */
export function onlineStateParam(
  tab: string,
  value: '' | DriverOnlineState,
): DriverOnlineState | undefined {
  return value && onlineFilterApplies(tab) ? value : undefined;
}

export type OnlineFilterWarning = 'unsupported' | 'presenceUnavailable';

/**
 * Backend cũ im lặng bỏ param lạ và trả danh sách KHÔNG lọc; backend mới echo
 * `meta.onlineState`. Redis lỗi → `meta.presenceUnavailable`, kết quả không đáng tin.
 */
export function onlineFilterWarning(
  sent: DriverOnlineState | undefined,
  meta: { onlineState?: string; presenceUnavailable?: boolean } | undefined,
): OnlineFilterWarning | null {
  if (!sent) return null;
  if (meta?.onlineState !== sent) return 'unsupported';
  if (meta.presenceUnavailable) return 'presenceUnavailable';
  return null;
}
