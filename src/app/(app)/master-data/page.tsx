
'use client';

import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminUnitsManager } from "./components/admin-units-manager";
import { RoutesManager } from "./components/routes-manager";
import { RoutePricingManager } from "./components/route-pricing-manager";
import { AreaPriceAdjustmentsManager } from "./components/area-price-adjustments-manager";

export default function MasterDataPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tuyến đường & Vùng"
        description="Quản lý đơn vị hành chính, tuyến đường, bảng giá và điều chỉnh giá khu vực."
      />
      <Tabs defaultValue="admin-units" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="admin-units">Đơn vị hành chính</TabsTrigger>
          <TabsTrigger value="routes">Tuyến đường</TabsTrigger>
          <TabsTrigger value="route-pricing">Bảng giá</TabsTrigger>
          <TabsTrigger value="area-adjustments">Điều chỉnh giá Khu vực (±Δ)</TabsTrigger>
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

        <TabsContent value="area-adjustments">
          <AreaPriceAdjustmentsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
