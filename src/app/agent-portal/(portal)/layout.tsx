'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger,
} from '@/components/ui/sidebar';
import { LogOut, Wallet } from 'lucide-react';
import { getAgentMe, type AgentMe } from '@/lib/api';
import { visibleNavItems } from '../agent-portal-nav';
import React from 'react';

/** Số dư tài khoản hoa hồng luôn hiện để đại lý dễ quan sát. Ẩn khi backend chưa trả walletBalance. */
function WalletChip({ me }: { me: AgentMe | null }) {
  if (me?.walletBalance == null) return null;
  const label = me.walletType === 'DRIVER_MAIN' ? 'Tài khoản tài xế' : 'Tài khoản hoa hồng';
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

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const ssoToken = searchParams.get('sso_token') || searchParams.get('token');
      if (ssoToken) {
        localStorage.setItem('access_token', ssoToken);
        searchParams.delete('sso_token');
        searchParams.delete('token');
        const cleanSearch = searchParams.toString();
        const cleanUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '') + window.location.hash;
        window.history.replaceState({}, '', cleanUrl);
      }
    } catch (_) {}

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

        {/* Nội dung trang: padding gọn trên mobile (p-3 sm:p-6) */}
        <main className="p-3 sm:p-6 max-w-5xl mx-auto w-full">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
