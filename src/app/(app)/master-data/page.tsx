'use client';

import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminUnitsManager } from "./components/admin-units-manager";
import { PricingMacroManager } from "./components/pricing-macro-manager";

// Spec "bỏ tuyến → tỉnh hoạt động": không còn màn Tuyến đường / Bảng giá theo tuyến (backend trả 410 cho mọi
// thao tác ghi). Giá = bảng km + điều chỉnh theo phường/tỉnh (tab "Điều chỉnh khu vực").
export default function MasterDataPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Vùng & Giá khu vực"
        description="Quản lý đơn vị hành chính và điều chỉnh giá theo phường/xã, tỉnh/thành."
      />
      <Tabs defaultValue="area-adjustments" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="area-adjustments">Điều chỉnh khu vực</TabsTrigger>
          <TabsTrigger value="admin-units">Đơn vị hành chính</TabsTrigger>
        </TabsList>

        <TabsContent value="area-adjustments">
          <PricingMacroManager />
        </TabsContent>

        <TabsContent value="admin-units">
          <AdminUnitsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
