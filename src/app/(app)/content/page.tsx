import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { ContentTable } from "./components/content-table";

export default function ContentPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Management"
        description="Manage articles, blog posts, and other media."
      >
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Content
        </Button>
      </PageHeader>
      <ContentTable />
    </div>
  );
}
