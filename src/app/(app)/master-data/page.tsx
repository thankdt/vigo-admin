
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
        title="Master Data"
        description="Manage core system data like administrative units, routes, and pricing."
      />
      <Tabs defaultValue="admin-units" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="admin-units">Administrative Units</TabsTrigger>
          <TabsTrigger value="routes">Defined Routes</TabsTrigger>
          <TabsTrigger value="route-pricing">Route Pricing</TabsTrigger>
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
