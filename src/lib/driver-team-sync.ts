import type { DriverTeamStage, TeamDriverRow, TeamMemberState } from './types';

/** Nhóm cấp 2 đã tải, khoá là routeId dạng chuỗi ('none' cho nhóm không gắn tuyến). */
export type DriverGroups = Record<string, TeamDriverRow[]>;

/**
 * Trạng thái pipeline gắn theo TÀI XẾ, nhưng một tài chạy nhiều tuyến sẽ hiện ở
 * nhiều nhóm accordion. Sau khi PATCH phải lan sang MỌI nhóm đang mở — nếu chỉ
 * cập nhật nhóm vừa bấm thì hai nhóm sẽ hiện hai trạng thái khác nhau của cùng
 * một người. Số liệu chuyến là của từng cặp (tài × tuyến) nên giữ nguyên.
 */
export function patchDriverAcrossGroups(
  groups: DriverGroups,
  driverId: string,
  team: TeamMemberState | null,
): DriverGroups {
  const out: DriverGroups = {};
  for (const [key, rows] of Object.entries(groups)) {
    out[key] = rows.map((r) => (r.driverId === driverId ? { ...r, team } : r));
  }
  return out;
}

/**
 * Đếm TÀI XẾ duy nhất — không đếm dòng, vì một tài nằm ở nhiều nhóm.
 * 4 thẻ số lấy từ GET /summary của backend (đã DISTINCT sẵn), nên hàm này chỉ dùng
 * cho các con số đếm tại chỗ trên dữ liệu đang mở.
 */
export function countUniqueByStage(groups: DriverGroups, stage: DriverTeamStage): number {
  const ids = new Set<string>();
  for (const rows of Object.values(groups)) {
    for (const r of rows) if (r.team?.stage === stage) ids.add(r.driverId);
  }
  return ids.size;
}
