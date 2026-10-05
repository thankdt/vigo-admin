'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getAgentMe, AgentMe } from '@/lib/api';
import { ListOrdered, Wallet, PlusCircle, ArrowRight, BadgePercent, ChevronRight } from 'lucide-react';
import { CreateBookingDialog } from '@/app/(app)/bookings/components/create-booking-dialog';

const fmtVnd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`);

export default function AgentDashboardPage() {
  const router = useRouter();
  const [me, setMe] = React.useState<AgentMe | null>(null);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  // Trong app (webview đặt hộ) app inject bridge `VigoApp`. Có bridge → card hoa hồng bấm được
  // để thoát webview về màn ví hoa hồng native (khách: affiliate, tài xế: ví thưởng). Trên web
  // thuần không có bridge → card điều hướng sang trang ví web.
  const [inApp, setInApp] = React.useState(false);

  React.useEffect(() => {
    getAgentMe().then(setMe).catch(() => {});
    setInApp(typeof window !== 'undefined' && !!(window as unknown as { VigoApp?: unknown }).VigoApp);
  }, []);

  const openCommissionWallet = React.useCallback(() => {
    (window as unknown as { VigoApp?: { postMessage: (m: string) => void } }).VigoApp?.postMessage('open-commission');
  }, []);

  const handleWalletClick = React.useCallback(() => {
    if (inApp) {
      openCommissionWallet();
    } else {
      router.push('/agent-portal/wallet');
    }
  }, [inApp, openCommissionWallet, router]);

  const commissionRate = me?.commissionPercent != null ? `${me.commissionPercent}%` : '10%';

  return (
    <div className="space-y-3.5 max-w-lg mx-auto">
      {/* 1. Banner Chính sách hoa hồng: thu gọn tối đa diện tích, thanh ngang thanh lịch */}
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/40 shadow-2xs">
        <BadgePercent className="h-7 w-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            CHÍNH SÁCH
          </div>
          <div className="text-base sm:text-lg font-bold text-emerald-900 dark:text-emerald-100 leading-tight truncate">
            Đặt hộ hoa hồng {commissionRate}
          </div>
        </div>
      </div>

      {/* 2. Card chính: Đặt hộ chuyến mới (To, rõ ràng, tối ưu diện tích cho mobile) */}
      <button
        type="button"
        onClick={() => setIsCreateOpen(true)}
        className="group w-full relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl border border-emerald-200/90 dark:border-emerald-800/60 bg-[#F2FAF7] dark:bg-emerald-950/20 hover:bg-emerald-50/80 dark:hover:bg-emerald-950/40 text-left transition-all shadow-2xs active:scale-[0.99]"
      >
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <PlusCircle className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Đặt hộ chuyến mới
              </span>
              <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 px-2 py-0.5 rounded-full shrink-0">
                +{commissionRate} hoa hồng
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-snug line-clamp-2">
              Tạo đơn xe ghép hoặc bao xe cho khách hàng để nhận hoa hồng ngay
            </p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
      </button>

      {/* 3. Card Tài khoản tài xế dạng 2 cột chia đôi ngang siêu gọn */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleWalletClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleWalletClick();
          }
        }}
        className="cursor-pointer bg-card border border-border/80 rounded-2xl p-3.5 sm:p-4 shadow-2xs hover:border-emerald-500/30 transition-all flex items-center divide-x divide-border"
      >
        {/* Nửa trái: Icon + Tài khoản tài xế + Số tiền */}
        <div className="pr-3 sm:pr-4 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            <span>{me?.walletType === 'DRIVER_MAIN' ? 'Tài khoản tài xế' : 'Tài khoản hoa hồng'}</span>
          </div>
          <div className="text-lg sm:text-xl font-black text-foreground tracking-tight mt-1 truncate">
            {me?.walletBalance != null ? fmtVnd(me.walletBalance) : '—'}
          </div>
        </div>

        {/* Nửa phải: Diễn giải + Mũi tên */}
        <div className="pl-3 sm:pr-4 flex-1 min-w-0 flex items-center justify-between gap-1">
          <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug">
            Số dư khả dụng để nhận cước và nhận tiền thưởng / hoa hồng
          </p>
          <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
        </div>
      </div>

      {/* 4. Nhóm thao tác đặt chuyến */}
      <div className="pt-1 space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          THAO TÁC ĐẶT CHUYẾN
        </h2>

        {/* 2 nút thao tác đặt cạnh nhau trên 1 hàng */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-12 sm:h-13 rounded-xl border-border bg-card text-foreground font-semibold text-sm justify-center gap-2 hover:bg-accent shadow-2xs"
            asChild
          >
            <Link href="/agent-portal/orders">
              <ListOrdered className="h-4 w-4 text-teal-600 shrink-0" />
              <span>Đơn của tôi</span>
            </Link>
          </Button>

          <Button
            className="h-12 sm:h-13 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm justify-center gap-2 shadow-2xs"
            asChild
          >
            <Link href="/agent-portal/wallet">
              <Wallet className="h-4 w-4 text-white shrink-0" />
              <span>Tài khoản & rút tiền</span>
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
