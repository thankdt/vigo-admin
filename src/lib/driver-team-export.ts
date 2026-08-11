import { formatShare, stageLabel, vnDay } from './driver-team-labels';
import type { TeamDriverRow } from './types';

export const EXPORT_HEADER = [
  'Tuyến',
  'Tài xế',
  'SĐT',
  'Đơn vị vận tải',
  'Chuyến trên tuyến',
  'Tỉ trọng tuyến',
  'Tổng chuyến mọi tuyến',
  'Chuyến gần nhất',
  'Trạng thái',
  'Người phụ trách',
  'Hẹn gọi lại',
  'Ghi chú',
];

/** vnDay trả '—' khi rỗng — trong file Excel thì ô trống dễ đọc hơn. */
const day = (iso: string | null | undefined) => {
  const d = vnDay(iso);
  return d === '—' ? '' : d;
};

/**
 * Ma trận dòng cho xlsx. Xuất PHẲNG (mỗi dòng là một cặp tài × tuyến) vì file này
 * để mang đi gọi điện, phẳng dễ dùng hơn cấu trúc lồng.
 * Số giữ dạng number để Excel sort/sum; SĐT giữ dạng string vì ép sang number sẽ
 * mất số 0 đầu.
 */
export function buildExportRows(
  items: { routeName: string; driver: TeamDriverRow }[],
  cap = 1000,
): { rows: (string | number)[][]; truncated: number } {
  const kept = items.slice(0, cap);
  const rows = kept.map(({ routeName, driver: d }) => [
    routeName,
    d.fullName ?? '',
    d.phone ?? '',
    d.transportCompanyName ?? '',
    d.tripsOnRoute,
    formatShare(d.shareOfRoute),
    d.tripsAllRoutes,
    day(d.lastCompletedAt),
    stageLabel(d.team?.stage ?? null),
    d.team?.ownerAdminName ?? '',
    day(d.team?.nextFollowUpAt ?? null),
    d.team?.note ?? '',
  ]);
  return { rows, truncated: Math.max(0, items.length - kept.length) };
}
