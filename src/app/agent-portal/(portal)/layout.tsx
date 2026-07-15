'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset,
} from '@/components/ui/sidebar';
import { LayoutDashboard, LogOut, Store, ListOrdered, PlusCircle } from 'lucide-react';
import { getAgentMe } from '@/lib/api';
import React from 'react';

const navItems = [
  { href: '/agent-portal/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/agent-portal/orders/new', label: 'Đặt hộ mới', icon: PlusCircle },
  { href: '/agent-portal/orders', label: 'Đơn của tôi', icon: ListOrdered },
];

/** Protected agent portal. Gates on /agent/me (AgentGuard → 403 for non-agents). */
export default function AgentPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('access_token')) {
      router.replace('/agent-portal/login');
      return;
    }
    getAgentMe().then(() => setAuthorized(true)).catch(() => router.replace('/agent-portal/login'));
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
        <SidebarHeader className="p-4">
          <Link href="/agent-portal/dashboard" className="flex items-center gap-2 font-semibold">
            <Store className="h-7 w-7 text-primary" />
            <span className="duration-200 group-data-[collapsible=icon]:hidden">Vigo Đặt hộ</span>
          </Link>
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
        <div className="p-6 max-w-5xl mx-auto w-full">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
