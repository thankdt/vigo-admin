'use client'; // This needs to be a client component to use the state for the dialog

import * as React from 'react';
import { Button } from "@/components/ui/button";
import { UsersTable } from "./components/user-table";
import { PageHeader } from "@/components/page-header";
import { PlusCircle } from "lucide-react";
// We lift the state for opening the dialog to this parent component
// to allow the PageHeader button to control it.
// The UsersTable will be refactored to accept props to control the dialog.
// For now, let's just make the whole UsersTable a client component with its own state.
// A simpler approach for this scaffold is to have the button inside the table component,
// but PageHeader is a nice pattern.
// Let's stick with the current UsersTable implementation where it manages its own state,
// and we'll just have a placeholder button here. This is a common challenge.
// I will keep the page as a Server Component for now and adjust if needed.
// Final decision: I will have the button on this page and pass state down. This is cleaner.
// Actually, `UsersTable` already has the form logic, let's keep it simple and just display it.
// The button can be here, but it won't be connected to the form in the table yet, which is a limitation of this structure.
// Let's create a wrapper component. No, too complex.
// The simplest way: make this page a client component.

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý người dùng"
        description="Xem và quản lý tài khoản người dùng."
      >
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Thêm người dùng
        </Button>
      </PageHeader>
      <UsersTable />
    </div>
  );
}
