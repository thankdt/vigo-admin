'use client';
import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PromotionsTable } from "./components/promotions-table";
import { RetentionCampaign } from "./components/retention-campaign";

/**
 * "Tặng mã giữ khách" là một TAB của trang này, không phải một mục menu riêng.
 *
 * Cố ý: quyền được khoá theo href cấp 1 (`rbac.ts` → `topSegment`), và backend gác
 * `/voucher-campaign` bằng đúng function `promotions` — ai sửa được voucher thì sửa
 * được chiến dịch. Thêm mục menu riêng sẽ ngụ ý một quyền riêng vốn không tồn tại,
 * đồng thời phá bijection của `rbac.test.ts` mà chẳng đổi được gì về an ninh.
 */
export default function PromotionsPage() {
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [tab, setTab] = React.useState('list');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý Voucher"
        description="Tạo và quản lý các voucher khuyến mãi."
      >
        {/* Nút "Thêm Voucher" chỉ có nghĩa ở tab danh sách — tab chiến dịch không
            tạo voucher tay, nó tự sinh mã khi chuyến có tài xế nhận. */}
        {tab === 'list' && (
          <Button onClick={() => setIsFormOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Thêm Voucher
          </Button>
        )}
      </PageHeader>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="list">Danh sách Voucher</TabsTrigger>
          <TabsTrigger value="retention">Tặng mã giữ khách</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          <PromotionsTable isFormOpen={isFormOpen} setIsFormOpen={setIsFormOpen} />
        </TabsContent>

        <TabsContent value="retention" className="mt-6">
          <RetentionCampaign />
        </TabsContent>
      </Tabs>
    </div>
  );
}
