import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RolesList } from "./components/roles-list";
import { UserAssignment } from "./components/user-assignment";
import { AdminAccounts } from "./components/admin-accounts";

// Trang Phân quyền (super-only, guard ở layout). Hai màn: Vai trò (CRUD) + Gán người dùng
// (role/override/super). CRUD nằm trong component vì cần state.
export default function RolesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Phân quyền"
        description="Định nghĩa vai trò theo function và gán cho tài khoản admin."
      />
      <Tabs defaultValue="roles" className="w-full">
        <TabsList>
          <TabsTrigger value="roles">Vai trò</TabsTrigger>
          <TabsTrigger value="assign">Gán người dùng</TabsTrigger>
          <TabsTrigger value="accounts">Tài khoản admin</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="pt-4">
          <RolesList />
        </TabsContent>
        <TabsContent value="assign" className="pt-4">
          <UserAssignment />
        </TabsContent>
        <TabsContent value="accounts" className="pt-4">
          <AdminAccounts />
        </TabsContent>
      </Tabs>
    </div>
  );
}
