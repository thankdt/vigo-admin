import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { RolesList } from "./components/roles-list";

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Permissions"
        description="Define user roles and manage their access permissions."
      >
        <Button disabled>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Role
        </Button>
      </PageHeader>
      <RolesList />
    </div>
  );
}
