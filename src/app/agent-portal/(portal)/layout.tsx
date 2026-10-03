'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger,
} from '@/components/ui/sidebar';
import { LogOut, Wallet, Home, History, User } from 'lucide-react';
import { getAgentMe, type AgentMe } from '@/lib/api';
import { visibleNavItems } from '../agent-portal-nav';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import React from 'react';

/** Số dư ví hoa hồng luôn hiện để đại lý dễ quan sát. Ẩn khi backend chưa trả walletBalance. */
function WalletChip({ me }: { me: AgentMe | null }) {
  if (me?.walletBalance == null) return null;
  const label = me.walletType === 'DRIVER_MAIN' ? 'Ví tài xế' : 'Ví hoa hồng';
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-indigo-50/90 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/50 px-2.5 py-1 text-xs font-medium shadow-2xs">
      <Wallet className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
      <span className="font-semibold">{label}:</span>
      <span className="font-bold">{me.walletBalance.toLocaleString('vi-VN')}₫</span>
    </div>
  );
}

// Sidebar khai ở `agent-portal-nav.ts` — Next App Router cấm layout.tsx export
// thêm thứ gì ngoài default/metadata/…
const navItems = visibleNavItems();

/** Protected agent portal. Gates on /agent/me (AgentGuard → 403 for non-agents). */
export default function AgentPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = React.useState(false);
  const [me, setMe] = React.useState<AgentMe | null>(null);
  const [isAccountOpen, setIsAccountOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('access_token')) {
      router.replace('/agent-portal/login');
      return;
    }
    getAgentMe()
      .then((m) => { setMe(m); setAuthorized(true); })
      .catch(() => router.replace('/agent-portal/login'));
  }, [router]);

  if (!authorized) return null;

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_role');
    router.replace('/agent-portal/login');
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4 space-y-3">
          <Link href="/agent-portal/dashboard" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vigo-wordmark.png" alt="ViiGO" className="h-7 w-auto group-data-[collapsible=icon]:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vigo-icon.png" alt="ViiGO" className="hidden h-8 w-8 shrink-0 rounded group-data-[collapsible=icon]:block" />
            <span className="text-lg font-semibold text-muted-foreground group-data-[collapsible=icon]:hidden">Đại lý</span>
          </Link>
          <WalletChip me={me} />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/agent-portal/orders'
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active}>
                    <Link href={item.href}>
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                <span>Đăng xuất</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        {/* Mobile header: sidebar is hidden on small screens (webview), so give a hamburger to
            open the nav — otherwise there's no way to move between pages / go back. */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-3 py-2.5 md:hidden">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <Link href="/agent-portal/dashboard" className="flex items-center gap-1.5 font-bold text-foreground">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/vigo-wordmark.png" alt="ViiGO" className="h-5 w-auto" />
              <span className="text-base font-semibold">Đại lý</span>
            </Link>
          </div>
          <div>
            <Link href="/agent-portal/wallet">
              <WalletChip me={me} />
            </Link>
          </div>
        </header>

        {/* Nội dung trang: padding gọn trên mobile (p-3 sm:p-6), chừa pb-20 cho bottom nav */}
        <main className="p-3 sm:p-6 pb-20 sm:pb-6 max-w-5xl mx-auto w-full">{children}</main>

        {/* Mobile Bottom Navigation Bar: Cố định ở đáy màn hình theo thiết kế */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t bg-background/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden shadow-sm">
          <Link
            href="/agent-portal/dashboard"
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium transition-colors',
              pathname === '/agent-portal/dashboard'
                ? 'text-teal-600 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Home className="h-5 w-5" />
            <span>Trang chủ</span>
          </Link>
          <Link
            href="/agent-portal/wallet"
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium transition-colors',
              pathname.startsWith('/agent-portal/wallet')
                ? 'text-teal-600 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Wallet className="h-5 w-5" />
            <span>Ví</span>
          </Link>
          <Link
            href="/agent-portal/orders"
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium transition-colors',
              pathname.startsWith('/agent-portal/orders')
                ? 'text-teal-600 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <History className="h-5 w-5" />
            <span>Lịch sử</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsAccountOpen(true)}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium transition-colors',
              isAccountOpen
                ? 'text-teal-600 font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <User className="h-5 w-5" />
            <span>Tài khoản</span>
          </button>
        </nav>

        {/* Bottom sheet hiển thị thông tin tài khoản cho tab "Tài khoản" trên mobile */}
        <Sheet open={isAccountOpen} onOpenChange={setIsAccountOpen}>
          <SheetContent side="bottom" className="rounded-t-2xl px-5 py-6 max-h-[85vh] overflow-y-auto">
            <SheetHeader className="text-left pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold text-base">
                  {me?.displayName ? me.displayName.slice(0, 2).toUpperCase() : 'ĐL'}
                </div>
                <div>
                  <SheetTitle className="text-lg font-bold">{me?.displayName ?? 'Đại lý ViiGO'}</SheetTitle>
                  <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                    {me?.walletType === 'DRIVER_MAIN' ? 'Tài xế kiêm đại lý đặt hộ' : 'Đại lý đối tác'}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="py-4 space-y-3 text-sm">
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground">Hoa hồng đặt hộ</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {me?.commissionPercent != null ? `${me.commissionPercent}%` : '10%'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground">Loại ví</span>
                <span className="font-semibold">
                  {me?.walletType === 'DRIVER_MAIN' ? 'Ví tài xế (App tài xế)' : 'Ví hoa hồng'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground">Số dư hiện tại</span>
                <span className="font-bold text-foreground">
                  {me?.walletBalance != null ? `${me.walletBalance.toLocaleString('vi-VN')}₫` : '0₫'}
                </span>
              </div>
              {me?.bankInfo && (
                <div className="flex justify-between items-center py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Tài khoản nhận tiền</span>
                  <span className="font-semibold text-right text-xs">
                    {me.bankInfo.bankName} - {me.bankInfo.accountNumber}
                  </span>
                </div>
              )}
            </div>
            <div className="pt-2">
              <Button
                variant="destructive"
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl"
                onClick={() => {
                  setIsAccountOpen(false);
                  handleLogout();
                }}
              >
                <LogOut className="h-4 w-4" />
                <span>Đăng xuất</span>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </SidebarInset>
    </SidebarProvider>
  );
}
