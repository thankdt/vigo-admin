import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { RolesList } from "./components/roles-list";

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Vai trò & Quyền hạn"
        description="Định nghĩa vai trò người dùng và quản lý quyền truy cập."
      >
        <Button disabled>
          <PlusCircle className="mr-2 h-4 w-4" />
          Thêm vai trò
        </Button>
      </PageHeader>
      <RolesList />
    </div>
  );
}
