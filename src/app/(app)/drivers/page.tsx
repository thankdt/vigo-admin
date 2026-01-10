'use client';

import { PageHeader } from "@/components/page-header";
import { DriversTable } from "./components/drivers-table";

export default function DriversPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Driver Management"
        description="Approve, reject, and manage driver accounts."
      />
      <DriversTable />
    </div>
  );
}
