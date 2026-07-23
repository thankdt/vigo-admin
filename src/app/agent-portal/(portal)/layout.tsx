'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger,
} from '@/components/ui/sidebar';
import { LayoutDashboard, LogOut, ListOrdered, PlusCircle, Wallet } from 'lucide-react';
import { getAgentMe, type AgentMe } from '@/lib/api';
import React from 'react';

/** Số dư ví hoa hồng luôn hiện để đại lý dễ quan sát. Ẩn khi backend chưa trả walletBalance. */
function WalletChip({ me }: { me: AgentMe | null }) {
  if (me?.walletBalance == null) return null;
  const label = me.walletType === 'DRIVER_MAIN' ? 'Ví tài xế' : 'Ví hoa hồng';
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
      <Wallet className="h-3.5 w-3.5 shrink-0" />
      <span className="group-data-[collapsible=icon]:hidden">{label}:</span>
      <span>{me.walletBalance.toLocaleString('vi-VN')}₫</span>
    </div>
  );
}

const navItems = [
  { href: '/agent-portal/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/agent-portal/orders/new', label: 'Đặt hộ mới', icon: PlusCircle },
  { href: '/agent-portal/orders', label: 'Đơn của tôi', icon: ListOrdered },
  { href: '/agent-portal/wallet', label: 'Ví & Rút tiền', icon: Wallet },
];

/** Protected agent portal. Gates on /agent/me (AgentGuard → 403 for non-agents). */
export default function AgentPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = React.useState(false);
  const [me, setMe] = React.useState<AgentMe | null>(null);

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
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background p-3 md:hidden">
          <SidebarTrigger />
          <Link href="/agent-portal/dashboard" className="flex items-center gap-2 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vigo-wordmark.png" alt="ViiGO" className="h-5 w-auto" /> Đại lý
          </Link>
          <div className="ml-auto"><WalletChip me={me} /></div>
        </header>
        <div className="p-6 max-w-5xl mx-auto w-full">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
