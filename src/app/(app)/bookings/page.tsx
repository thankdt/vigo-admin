
'use client';

import { PageHeader } from "@/components/page-header";
import { BookingsTable } from "./components/bookings-table";

export default function BookingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Booking Management"
        description="View and manage all bookings in the system."
      />
      <BookingsTable />
    </div>
  );
}
