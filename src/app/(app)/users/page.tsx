'use client';

import { UsersTable } from './components/user-table';
import { PageHeader } from '@/components/page-header';

/**
 * Danh bạ KHÁCH — nằm trong nhóm menu "Khách hàng (CRM)".
 *
 * Nút "Thêm người dùng" đã gỡ (spec CRM §6.2): nó chưa bao giờ nối vào đâu, và cũng
 * không có endpoint admin tạo user để nối. Kèm theo là khối 14 dòng comment ghi lại
 * quá trình phân vân về việc nâng state của dialog lên đây — dialog đó không tồn tại,
 * nên comment chỉ còn là chỉ dẫn sai cho người đọc sau.
 *
 * Tiêu đề đổi "Quản lý người dùng" -> "Khách hàng" cho khớp nhãn menu mới và mặc định
 * lọc `role=USER` của bảng bên dưới.
 */
export default function UsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Khách hàng"
        description="Danh bạ khách đi xe. Đổi bộ lọc Vai trò để xem chủ HTX hoặc tất cả tài khoản."
      />
      <UsersTable />
    </div>
  );
}
