/**
 * Quy đổi "trạng thái tài xế" cho MỌI màn hình — một nơi duy nhất.
 *
 * Vì sao cần: `driver.status` là **trạng thái KHAI BÁO** (declared). Tài bấm ONLINE
 * rồi gỡ app thì cột đó vẫn ONLINE vĩnh viễn. Backend nay trả kèm `presence` đọc từ
 * Redis: có socket/heartbeat ngay lúc này không, và đã **im lặng bao nhiêu phút**.
 *
 * Chỉ LOGIC quy đổi dùng chung; CHỮ hiển thị để mỗi màn tự chọn (danh sách admin
 * nói "Bận", portal HTX nói "Đang chở khách" — khác nhau có chủ đích).
 */

export type DriverPresence = {
  hasSocket: boolean;
  hasAlive: boolean;
  hasModernFlag: boolean;
  quality: 'high' | 'medium' | 'low' | 'legacy';
  /** Số phút không thấy tín hiệu nào. `null` = KHÔNG ĐO ĐƯỢC (chưa từng ping). */
  silentMinutes: number | null;
};

export type DriverOnlineState =
  | 'online' // đang có tín hiệu thật
  | 'busy' // đang chở khách
  | 'idle' // im lặng ngắn — app ở nền, vẫn nhận chuyến qua thông báo đẩy
  | 'stale' // im lặng dài — nhiều khả năng đã bỏ app
  | 'unknown' // chưa ghi nhận tín hiệu nào, không kết luận được
  | 'offline';

/**
 * Dưới ngưỡng này thì im lặng là chuyện BÌNH THƯỜNG: iOS thu app xuống nền là
 * socket rớt và heartbeat hết hạn trong ~3 phút, nhưng tài vẫn nhận chuyến qua
 * thông báo đẩy (dispatch không hề gate theo socket). Gắn nhãn "Mất kết nối" cho
 * cửa sổ đó là vu oan hàng loạt.
 */
export const STALE_AFTER_MINUTES = 30;

/**
 * @param presence thiếu (backend cũ chưa trả, hoặc BE bỏ field vì Redis lỗi)
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

  if (presence.hasSocket || presence.hasAlive) return 'online';
  if (presence.silentMinutes === null || presence.silentMinutes === undefined) return 'unknown';
  return presence.silentMinutes < STALE_AFTER_MINUTES ? 'idle' : 'stale';
}

/** Nhãn mặc định (tiếng Việt). Màn nào cần chữ khác thì tự map từ state. */
export const DRIVER_ONLINE_LABEL: Record<DriverOnlineState, string> = {
  online: 'Online',
  busy: 'Bận',
  idle: 'Chờ tín hiệu',
  stale: 'Mất kết nối',
  unknown: 'Không rõ',
  offline: 'Offline',
};

/** Giải thích cho ô tooltip — chỉ những trạng thái cần nói thêm. */
export const DRIVER_ONLINE_HINT: Partial<Record<DriverOnlineState, string>> = {
  idle: 'Ứng dụng đang ở nền — tài xế vẫn nhận chuyến qua thông báo đẩy',
  stale: `Không có tín hiệu nào quá ${STALE_AFTER_MINUTES} phút — nhiều khả năng đã thoát ứng dụng`,
  unknown: 'Chưa ghi nhận tín hiệu nào từ ứng dụng của tài xế',
};
