'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
} from '@/components/ui/sidebar';
import { LayoutDashboard, LogOut, Car } from 'lucide-react';
import { Logo } from '@/components/logo';
import React from 'react';

const navItems = [
  { href: '/htx/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/htx/drivers', label: 'Tài xế', icon: Car },
];

/**
 * Protected layout for the HTX portal. Verifies an access token + the TRANSPORT_COMPANY_OWNER
 * role on mount, otherwise bounces to /htx/login. We also wipe the token if role doesn't
 * match — protects against an admin opening htx.* on the same browser by accident.
 */
export default function HtxPortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = React.useState(false);

  React.useEffect(() => {
    const token = localStorage.getItem('access_token');
    const role = localStorage.getItem('user_role');
    if (!token || role !== 'TRANSPORT_COMPANY_OWNER') {
      router.replace('/htx/login');
    } else {
      setIsAuthorized(true);
    }
  }, [router]);

  if (!isAuthorized) return null;

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_role');
    router.replace('/htx/login');
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <Link href="/htx/dashboard" className="flex items-center gap-2 font-semibold">
            <Logo className="h-7 w-7 text-primary" />
            <span className="duration-200 group-data-[collapsible=icon]:hidden">Vigo HTX</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
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
        <div className="p-6 max-w-7xl mx-auto w-full">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
