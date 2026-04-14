import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { ContentTable } from "./components/content-table";

export default function ContentPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Nội dung"
        description="Quản lý bài viết, blog và các nội dung khác."
      >
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Thêm nội dung
        </Button>
      </PageHeader>
      <ContentTable />
    </div>
  );
}
