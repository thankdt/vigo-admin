
'use client';

import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminUnitsManager } from "./components/admin-units-manager";
import { RoutesManager } from "./components/routes-manager";
import { RoutePricingManager } from "./components/route-pricing-manager";

export default function MasterDataPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dữ liệu chung"
        description="Quản lý đơn vị hành chính, tuyến đường và bảng giá."
      />
      <Tabs defaultValue="admin-units" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="admin-units">Đơn vị hành chính</TabsTrigger>
          <TabsTrigger value="routes">Tuyến đường</TabsTrigger>
          <TabsTrigger value="route-pricing">Bảng giá</TabsTrigger>
        </TabsList>

        <TabsContent value="admin-units">
          <AdminUnitsManager />
        </TabsContent>

        <TabsContent value="routes">
          <RoutesManager />
        </TabsContent>

        <TabsContent value="route-pricing">
          <RoutePricingManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
