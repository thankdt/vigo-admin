import { PageHeader } from "@/components/page-header";
import { RolesList } from "./components/roles-list";

// Trang Phân quyền (super-only, guard ở layout). Nút "Thêm vai trò" + CRUD nằm trong
// RolesList vì cần state. Màn gán role/override cho user: xem UserAssignment (Task 8).
export default function RolesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Phân quyền"
        description="Định nghĩa vai trò theo function và gán cho tài khoản admin."
      />
      <RolesList />
    </div>
  );
}
