/**
 * Quy đổi "trạng thái tài xế" cho MỌI màn hình — một nơi duy nhất.
 *
 * Vì sao cần: `driver.status` là **trạng thái KHAI BÁO** (declared). Tài bấm ONLINE
 * rồi gỡ app thì cột đó vẫn ONLINE vĩnh viễn. Backend nay trả kèm `presence` (đọc
 * từ Redis: socket / heartbeat / cờ app hiện đại) để phân biệt "đang thật sự kết
 * nối" với "khai online rồi biến mất".
 *
 * Chỉ LOGIC quy đổi dùng chung; CHỮ hiển thị để mỗi màn tự chọn (danh sách admin
 * nói "Bận", portal HTX nói "Đang chở khách" — khác nhau có chủ đích).
 */

export type DriverPresence = {
  hasSocket: boolean;
  hasAlive: boolean;
  hasModernFlag: boolean;
  quality: 'high' | 'medium' | 'low' | 'legacy';
};

export type DriverOnlineState =
  | 'online' // khai ONLINE và đang có tín hiệu thật
  | 'busy' // đang chở khách
  | 'stale' // khai ONLINE nhưng app không phản hồi
  | 'legacy' // app cũ: không đo được, đừng vu oan là mất kết nối
  | 'offline';

/**
 * @param presence thiếu (backend cũ chưa trả, hoặc Redis lỗi nên BE bỏ field)
 *   → giữ nguyên hành vi cũ: tin `status`. Không degrade thành "mất kết nối",
 *   nếu không cả danh sách sẽ báo sai mỗi lần Redis chớp.
 */
export function driverOnlineState(
  status: string | null | undefined,
  presence?: DriverPresence | null,
): DriverOnlineState {
  if (status === 'BUSY') return 'busy';
  if (status !== 'ONLINE') return 'offline';
  if (!presence) return 'online';

  switch (presence.quality) {
    case 'high':
    case 'medium':
      return 'online';
    case 'legacy':
      return 'legacy';
    case 'low':
    default:
      return 'stale';
  }
}

/** Nhãn mặc định (tiếng Việt). Màn nào cần chữ khác thì tự map từ state. */
export const DRIVER_ONLINE_LABEL: Record<DriverOnlineState, string> = {
  online: 'Online',
  busy: 'Bận',
  stale: 'Mất kết nối',
  legacy: 'Online (app cũ)',
  offline: 'Offline',
};

/** Giải thích cho ô tooltip — chỉ những trạng thái cần nói thêm. */
export const DRIVER_ONLINE_HINT: Partial<Record<DriverOnlineState, string>> = {
  stale: 'Tài xế khai online nhưng ứng dụng không phản hồi',
  legacy: 'Ứng dụng phiên bản cũ — không xác định được kết nối',
};
