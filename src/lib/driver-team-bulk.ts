import type { DriverTeamStage, TeamMemberState } from './types';

export type BulkBody = { stage?: DriverTeamStage; ownerAdminUserId?: string | null };
export type PatchFn = (driverId: string, body: BulkBody) => Promise<TeamMemberState>;

export type BulkResult = {
  /**
   * Trả kèm `team` THẬT do backend trả về, không phải giá trị FE tự đoán:
   * backend bổ sung `ownerAdminName` và tự đặt `stage` mặc định khi tạo row mới.
   * Ghép {...cũ, ...body} ở FE sẽ mất tên người phụ trách và bỏ sót đúng nhóm tài
   * "Tiềm năng" (chưa có `team`) — nhóm dùng thao tác hàng loạt nhiều nhất.
   */
  ok: { driverId: string; team: TeamMemberState }[];
  failed: { driverId: string; message: string }[];
  /** Bị bỏ vì vượt trần — PHẢI báo cho người dùng, không nuốt. */
  skipped: string[];
};

/**
 * Chạy TUẦN TỰ, không song song: mỗi lượt là một PATCH sinh event, chạy song song
 * sẽ dội request và làm thứ tự event trong nhật ký thành ngẫu nhiên.
 * Trần 50 dòng/lần — thao tác này dùng vài chục lần một ngày, không đáng làm
 * endpoint bulk riêng ở backend chỉ để tiết kiệm vài request.
 */
export async function applyBulk(
  driverIds: string[],
  body: BulkBody,
  patch: PatchFn,
  max = 50,
): Promise<BulkResult> {
  const targets = driverIds.slice(0, max);
  const skipped = driverIds.slice(max);
  const ok: { driverId: string; team: TeamMemberState }[] = [];
  const failed: { driverId: string; message: string }[] = [];

  for (const id of targets) {
    try {
      const team = await patch(id, body);
      ok.push({ driverId: id, team });
    } catch (e: any) {
      failed.push({ driverId: id, message: String(e?.message ?? e) });
    }
  }

  return { ok, failed, skipped };
}

// KHÔNG viết `matchingRouteKeys` để "tự bung nhóm khớp": groups chỉ chứa nhóm ĐANG
// MỞ, nên hàm đó chỉ trả về key của nhóm đã mở sẵn — không mở thêm được gì. Muốn
// làm thật phải để backend đếm số tài khớp theo từng tuyến. Xem spec §6.4.
