'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAgentMe, AgentMe } from '@/lib/api';
import { ListOrdered, Wallet } from 'lucide-react';
import { CreateBookingDialog } from '@/app/(app)/bookings/components/create-booking-dialog';

const fmtVnd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`);

export default function AgentDashboardPage() {
  const [me, setMe] = React.useState<AgentMe | null>(null);
  // Trong app (webview đặt hộ) app inject bridge `VigoApp`. Có bridge → card hoa hồng bấm được
  // để thoát webview về màn ví hoa hồng native (khách: affiliate, tài xế: ví thưởng). Trên web
  // thuần không có bridge → card giữ nguyên như cũ (chỉ hiển thị %), không tương tác.
  const [inApp, setInApp] = React.useState(false);

  React.useEffect(() => {
    getAgentMe().then(setMe).catch(() => {});
    setInApp(typeof window !== 'undefined' && !!(window as unknown as { VigoApp?: unknown }).VigoApp);
  }, []);

  const openCommissionWallet = React.useCallback(() => {
    (window as unknown as { VigoApp?: { postMessage: (m: string) => void } }).VigoApp?.postMessage('open-commission');
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Chào {me?.displayName ?? 'đại lý'} 👋</h1>
        <p className="text-muted-foreground">Cổng đặt hộ — tạo chuyến cho khách, nhận hoa hồng.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          {...(inApp
            ? {
                role: 'button' as const,
                tabIndex: 0,
                'aria-label': 'Xem ví hoa hồng',
                onClick: openCommissionWallet,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openCommissionWallet();
                  }
                },
                className:
                  'cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              }
            : {})}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Wallet className="h-4 w-4" /> {me?.walletType === 'DRIVER_MAIN' ? 'Ví tài xế' : 'Ví hoa hồng'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Số dư ví — nguồn hoa hồng đổ về. undefined (backend cũ) → "—", không vỡ. */}
            <div className="text-3xl font-bold">{me?.walletBalance != null ? fmtVnd(me.walletBalance) : '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Hoa hồng {me?.commissionPercent != null ? `${me.commissionPercent}%` : '—'} trên cước (trước VAT) mỗi đơn hoàn thành
            </p>
            {inApp && <p className="text-xs text-primary mt-2 font-medium">Xem chi tiết ví →</p>}
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
        <CreateBookingDialog mode="agent" onSuccess={() => {}} />
        <Button variant="outline" asChild>
          <Link href="/agent-portal/orders"><ListOrdered className="mr-2 h-4 w-4" /> Đơn của tôi</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/agent-portal/wallet"><Wallet className="mr-2 h-4 w-4" /> Ví & rút tiền</Link>
        </Button>
      </div>
    </div>
  );
}
