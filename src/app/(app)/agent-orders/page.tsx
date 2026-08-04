'use client';

import { PageHeader } from '@/components/page-header';
import { BookingsTable } from '../bookings/components/bookings-table';

/**
 * "Đơn đặt hộ" — chuyến do ĐẠI LÝ đặt thay khách.
 *
 * Trang này trước đây gọi `adminListAgentOrders` → `GET /agent/admin/orders` →
 * `MultiStopAdminController` → bảng `multi_stop_order` (luồng bao xe nhiều điểm).
 * Bảng đó có 0 dòng trên prod nên trang luôn trắng — trong khi đơn đại lý THẬT
 * nằm ở `booking.agentUserId` (18 đơn tính tới 02/08/2026, vẫn đang phát sinh).
 *
 * Nay dùng lại bảng chuyến đi với bộ lọc `agentOnly`, nên có sẵn tìm kiếm, sắp
 * xếp server-side, lọc khoảng ngày theo giờ VN, dialog chi tiết và khối "gọi
 * check khách" của CSKH — thay vì phải dựng lại từ đầu.
 *
 * Luồng bao xe nhiều điểm (`multi_stop_order`) vẫn còn nguyên ở backend
 * (`MultiStopAdminController`, hàm `adminListAgentOrders`/`adminVoidAgentOrder`
 * trong lib/api.ts); khi nào dùng tới thì dựng trang riêng, không trộn vào đây.
 */
export default function AgentOrdersAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Đơn đặt hộ"
        description="Các chuyến do đại lý đặt thay khách hàng."
      />
      <BookingsTable agentOnly />
    </div>
  );
}
