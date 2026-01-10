import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, Shield, Wifi } from "lucide-react";
import type { ReactNode } from "react";

type StatCardProps = {
  title: string;
  value: string;
  icon: ReactNode;
  description: string;
};

function StatCard({ title, value, icon, description }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function StatCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Users"
        value="1,254"
        icon={<Users className="h-4 w-4" />}
        description="+20.1% from last month"
      />
      <StatCard
        title="Total Articles"
        value="3,402"
        icon={<FileText className="h-4 w-4" />}
        description="+180.1% from last month"
      />
      <StatCard
        title="Active Roles"
        value="3"
        icon={<Shield className="h-4 w-4" />}
        description="Admin, Editor, Viewer"
      />
      <StatCard
        title="API Status"
        value="Connected"
        icon={<Wifi className="h-4 w-4 text-green-500" />}
        description="All systems operational"
      />
    </div>
  );
}
