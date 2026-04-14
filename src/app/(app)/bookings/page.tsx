
'use client';

import { PageHeader } from "@/components/page-header";
import { BookingsTable } from "./components/bookings-table";

export default function BookingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý chuyến đi"
        description="Xem và quản lý tất cả chuyến đi trong hệ thống."
      />
      <BookingsTable />
    </div>
  );
}
