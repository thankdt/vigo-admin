'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAgentMe, AgentMe } from '@/lib/api';
import { PlusCircle, ListOrdered, Percent } from 'lucide-react';

export default function AgentDashboardPage() {
  const [me, setMe] = React.useState<AgentMe | null>(null);

  React.useEffect(() => {
    getAgentMe().then(setMe).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Chào {me?.displayName ?? 'đại lý'} 👋</h1>
        <p className="text-muted-foreground">Cổng đặt hộ — tạo chuyến đa-điểm cho khách, nhận hoa hồng.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Percent className="h-4 w-4" /> Hoa hồng của bạn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{me?.commissionPercent != null ? `${me.commissionPercent}%` : '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">Trên cước (trước VAT) mỗi đơn hoàn thành</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trạng thái</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{me?.status === 'ACTIVE' ? 'Đang hoạt động' : me?.status ?? '—'}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/agent-portal/orders/new"><PlusCircle className="mr-2 h-4 w-4" /> Đặt hộ mới</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/agent-portal/orders"><ListOrdered className="mr-2 h-4 w-4" /> Đơn của tôi</Link>
        </Button>
      </div>
    </div>
  );
}
