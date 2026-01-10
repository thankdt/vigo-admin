'use client';
import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { PromotionsTable } from "./components/promotions-table";

export default function PromotionsPage() {
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voucher Management"
        description="Create and manage promotional vouchers."
      >
        <Button onClick={() => setIsFormOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Voucher
        </Button>
      </PageHeader>
      <PromotionsTable isFormOpen={isFormOpen} setIsFormOpen={setIsFormOpen} />
    </div>
  );
}
