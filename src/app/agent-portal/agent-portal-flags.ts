/**
 * Cờ bật/tắt tính năng của cổng đại lý.
 *
 * Cố ý để là hằng số biên dịch chứ không phải config runtime: đây là cách TẮT
 * TẠM một màn chưa chạy được, không phải một nút gạt nghiệp vụ. Bật lại =
 * đổi `false` thành `true` rồi deploy lại (admin là static export nên đằng nào
 * cũng phải build lại).
 */

/**
 * Màn "Đặt hộ mới" của cổng đại lý (`/agent-portal/orders/new`).
 *
 * TẮT vì chế độ "Xe riêng" (bao trọn xe nhiều điểm, ghi vào bảng
 * `multi_stop_order`) chưa hoạt động. Trang đó cũng chứa chế độ "Ghép tuyến"
 * (ghi vào `booking` qua `POST /agent/bookings/ghep`) — chế độ này vẫn chạy
 * được nhưng bị tắt cùng, theo chốt với nghiệp vụ: đại lý hiện chỉ đặt qua nút
 * "Đặt hộ chuyến" ở màn Tổng quan (`CreateBookingDialog mode="agent"`).
 *
 * KHÔNG ảnh hưởng "Đơn của tôi" — trang đó đọc `listAgentBookings` (bảng
 * `booking`), không liên quan `multi_stop_order`.
 *
 * Backend `/agent/orders` vẫn còn sống (trả 401 khi thiếu token). Đây là tắt ở
 * giao diện, không phải chặn ở API.
 */
export const AGENT_MULTI_STOP_ENABLED = false;

/** Nơi đá người dùng về khi họ deep-link vào màn đang tắt. */
export const AGENT_PORTAL_HOME = '/agent-portal/dashboard';
