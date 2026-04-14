'use client';

import { PageHeader } from "@/components/page-header";
import { DriversTable } from "./components/drivers-table";

export default function DriversPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý tài xế"
        description="Duyệt, từ chối và quản lý tài khoản tài xế."
      />
      <DriversTable />
    </div>
  );
}
