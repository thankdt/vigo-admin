'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAgentMe, AgentMe } from '@/lib/api';
import { ListOrdered, Wallet, RotateCcw, PlusCircle, ArrowRight, BadgePercent } from 'lucide-react';
import { CreateBookingDialog } from '@/app/(app)/bookings/components/create-booking-dialog';

const fmtVnd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`);

export default function AgentDashboardPage() {
  const [me, setMe] = React.useState<AgentMe | null>(null);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
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

  const commissionRate = me?.commissionPercent != null ? `${me.commissionPercent}%` : '10%';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Chào {me?.displayName ?? 'đại lý'} 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">Cổng đặt hộ — tạo chuyến cho khách, nhận hoa hồng trực tiếp.</p>
        </div>
        <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 self-start sm:self-auto shadow-xs">
          <BadgePercent className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Chính sách</div>
            <div className="text-lg sm:text-xl font-black text-emerald-700 dark:text-emerald-300 leading-tight">
              Đặt hộ hoa hồng {commissionRate}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Card Số Dư Ví */}
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
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Wallet className="h-4 w-4" /> {me?.walletType === 'DRIVER_MAIN' ? 'Ví tài xế' : 'Ví hoa hồng'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black tracking-tight">{me?.walletBalance != null ? fmtVnd(me.walletBalance) : '—'}</div>
            <p className="text-xs text-muted-foreground mt-1.5 font-medium">
              Số dư khả dụng để nhận cuốc và nhận tiền thưởng
            </p>
            {inApp && <p className="text-xs text-primary mt-2 font-semibold flex items-center gap-1">Xem chi tiết ví <ArrowRight className="h-3 w-3" /></p>}
          </CardContent>
        </Card>

        {/* Card Mức Hoa Hồng Đặt Hộ To Rõ (thay thế Card Trạng Thái) */}
        <Card className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <BadgePercent className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Hoa hồng mỗi chuyến
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight flex items-baseline gap-2">
              <span>{commissionRate}</span>
              <span className="text-xs font-semibold text-emerald-700/80 dark:text-emerald-300/80">trên cước chuyến</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 font-medium">
              Tính trên cước trước VAT của mỗi đơn hoàn thành, cộng tự động vào ví
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Nhóm nút thao tác to rõ, dễ nhìn, dễ bấm */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Thao tác đặt chuyến
        </h2>

        {/* 2 Nút chính dạng Action Card to rõ */}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Tự đặt chuyến */}
          <Link
            href="/agent-portal/return-trip"
            className="group relative flex items-center justify-between p-4 rounded-xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all shadow-xs active:scale-[0.99]"
          >
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md shrink-0">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <div className="text-base sm:text-lg font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                  Tự đặt chuyến
                  <span className="text-[10px] font-bold bg-primary/15 text-primary px-2 py-0.5 rounded-full">Khuyên dùng</span>
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Khách lẻ ghép xe hoặc bao xe, gán ngay cho bạn
                </div>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
          </Link>

          {/* Đặt hộ chuyến mới */}
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="group relative flex items-center justify-between p-4 rounded-xl border-2 border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/40 text-left transition-all shadow-xs active:scale-[0.99]"
          >
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
                <PlusCircle className="h-6 w-6" />
              </div>
              <div>
                <div className="text-base sm:text-lg font-bold text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">
                  Đặt hộ chuyến mới
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Tạo đơn cho khách nhận hoa hồng {commissionRate}
                </div>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
          </button>
        </div>

        {/* 2 Nút phụ to rõ, dễ nhìn */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Button
            variant="outline"
            size="lg"
            className="h-12 border-muted-foreground/25 text-sm sm:text-base font-semibold justify-center gap-2 hover:bg-accent shadow-2xs"
            asChild
          >
            <Link href="/agent-portal/orders">
              <ListOrdered className="h-5 w-5 text-primary shrink-0" />
              <span>Đơn của tôi</span>
            </Link>
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="h-12 border-muted-foreground/25 text-sm sm:text-base font-semibold justify-center gap-2 hover:bg-accent shadow-2xs"
            asChild
          >
            <Link href="/agent-portal/wallet">
              <Wallet className="h-5 w-5 text-emerald-600 shrink-0" />
              <span>Ví & rút tiền</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Controlled CreateBookingDialog */}
      <CreateBookingDialog
        mode="agent"
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSuccess={() => {}}
      />
    </div>
  );
}
