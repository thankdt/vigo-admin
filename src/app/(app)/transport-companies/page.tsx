'use client';

import { PageHeader } from "@/components/page-header";
import { TransportCompaniesTable } from "./components/transport-companies-table";

export default function TransportCompaniesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Đơn vị vận tải"
        description="Quản lý danh sách HTX / Công ty vận tải."
      />
      <TransportCompaniesTable />
    </div>
  );
}
