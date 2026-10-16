'use client';

import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PricingMacroManager } from "./components/pricing-macro-manager";
import { SpecialZonesManager } from "./components/special-zones-manager";
import { WardGroupsManager } from "./components/ward-groups-manager";

// Spec "bỏ tuyến → tỉnh hoạt động": không còn màn Tuyến đường / Bảng giá theo tuyến (backend trả 410 cho mọi
// thao tác ghi). Giá = bảng km + điều chỉnh theo phường/tỉnh (tab "Điều chỉnh khu vực") + đồng giá sân bay
// (tab "Sân bay & đồng giá", cùng quyền `master-data` với cả trang).
export default function MasterDataPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Vùng & Giá khu vực"
        description="Quản lý nhóm xã, điều chỉnh giá theo phường/xã, tỉnh/thành và đồng giá sân bay."
      />
      <Tabs defaultValue="area-adjustments" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="area-adjustments">Điều chỉnh khu vực</TabsTrigger>
          <TabsTrigger value="special-zones">Sân bay & đồng giá</TabsTrigger>
          <TabsTrigger value="ward-groups">Nhóm xã</TabsTrigger>
        </TabsList>

        <TabsContent value="area-adjustments">
          <PricingMacroManager />
        </TabsContent>

        <TabsContent value="special-zones">
          <SpecialZonesManager />
        </TabsContent>

        <TabsContent value="ward-groups">
          <WardGroupsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
