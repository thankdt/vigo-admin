import type { DriverTeamStage, TeamDriverRow, TeamRouteRow } from './types';

export const STAGE_ORDER: DriverTeamStage[] = [
  'CONTACTED',
  'INVITED',
  'JOINED',
  'DECLINED',
  'DROPPED',
];

const STAGE_LABEL: Record<DriverTeamStage, string> = {
  CONTACTED: 'Đã liên hệ',
  INVITED: 'Đã mời',
  JOINED: 'Trong team',
  // Tách đôi có chủ đích: "Từ chối" là họ chối mình (còn gọi lại được),
  // "Loại" là mình đóng hẳn. Hai việc tiếp theo khác nhau.
  DECLINED: 'Từ chối',
  DROPPED: 'Loại',
};

/** null/undefined = chưa có row trong driver_team_member = Tiềm năng (spec §4.1). */
export function stageLabel(stage: DriverTeamStage | null | undefined): string {
  return stage ? STAGE_LABEL[stage] : 'Tiềm năng';
}

const STAGE_CLASS: Record<DriverTeamStage, string> = {
  CONTACTED: 'bg-sky-100 text-sky-800',
  INVITED: 'bg-amber-100 text-amber-800',
  JOINED: 'bg-emerald-100 text-emerald-800',
  DECLINED: 'bg-orange-100 text-orange-800',
  DROPPED: 'bg-muted text-muted-foreground',
};

export function stageBadgeClass(stage: DriverTeamStage | null | undefined): string {
  return stage ? STAGE_CLASS[stage] : 'bg-slate-100 text-slate-700';
}

/** 0..1 → '28,7%'. 0 và null đều ra '—' để không hiện "0,0%" gây tưởng đã đo được. */
export function formatShare(share: number | null | undefined): string {
  if (share == null || !Number.isFinite(share) || share <= 0) return '—';
  return `${(share * 100).toFixed(1).replace('.', ',')}%`;
}

/** Cảnh báo mạnh nhất trước — ban > tạm khoá > chưa duyệt. */
export function driverWarning(row: TeamDriverRow): string | null {
  if (row.isBanned) return 'Đang bị khoá';
  if (row.suspendedUntil && new Date(row.suspendedUntil).getTime() > Date.now()) {
    return 'Đang tạm khoá';
  }
  if (!row.isApproved) return 'Chưa duyệt hồ sơ';
  return null;
}

/**
 * Tuyến CÓ khách đặt nhưng KHÔNG tài nào chạy xong = cần tuyển gấp.
 * Cố ý KHÔNG dùng tỉ lệ completedTrips/totalBookings: hai số đó đếm theo hai mốc
 * thời gian khác nhau (spec §5.1) nên tỉ lệ giữa chúng vô nghĩa.
 */
export function routeNeedsDrivers(row: TeamRouteRow): boolean {
  return row.totalBookings > 0 && row.driverCount === 0;
}

/** Ngày VN của một mốc, độc lập timezone trình duyệt. */
export function vnDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

function vnDateOf(ms: number): string {
  return new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Đến hạn = ngày hẹn (giờ VN) <= hôm nay (giờ VN). */
export function isFollowUpOverdue(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!iso) return false;
  return vnDateOf(new Date(iso).getTime()) <= vnDateOf(nowMs);
}
