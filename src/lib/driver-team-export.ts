import { commissionRateLabel, formatShare, stageLabel, vnDay } from './driver-team-labels';
import type { TeamDriverRow, TeamMemberRow } from './types';

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

export const MEMBER_EXPORT_HEADER = [
  'Tài xế',
  'SĐT',
  'Trạng thái',
  '% hoa hồng',
  'Người phụ trách',
  'Tuyến phụ trách',
  'Hẹn gọi lại',
  'Ngày vào team',
  'Chuyến trong kỳ',
  'Chuyến gần nhất',
];

/**
 * Xuất PHẲNG tab "Đội tài" — mỗi dòng MỘT tài, khác `buildExportRows` (mỗi dòng
 * một cặp tài × tuyến của tab "Theo tuyến"). Không phụ thuộc khoảng ngày để lọc
 * bớt người — cột "Chuyến trong kỳ"/"Chuyến gần nhất" chỉ PHẢN ÁNH khoảng ngày
 * đang chọn, không phải điều kiện lọc (xem team-members-table.tsx).
 */
export function buildMemberExportRows(
  members: TeamMemberRow[],
  cap = 1000,
): { rows: (string | number)[][]; truncated: number } {
  const kept = members.slice(0, cap);
  const rows = kept.map((m) => {
    // null/0 phải hiện KHÁC NHAU trong file xuất đúng như trên bảng — xem
    // commissionRateLabel.
    const commission = commissionRateLabel(m.commissionRate);
    return [
      m.fullName ?? '',
      m.phone ?? '',
      stageLabel(m.stage),
      commission.text,
      m.ownerName ?? '',
      m.assignedRouteNames.join(', '),
      day(m.nextFollowUpAt),
      // "Ngày vào team" ước lượng bằng stageChangedAt (fallback createdAt cho
      // tài chưa từng đổi stage kể từ khi tạo row) — DB không có cột riêng
      // "ngày vào team", xem driver-team-member.entity.ts.
      day(m.stageChangedAt ?? m.createdAt),
      m.completedTripsInRange,
      day(m.lastCompletedAt),
    ];
  });
  return { rows, truncated: Math.max(0, members.length - kept.length) };
}
