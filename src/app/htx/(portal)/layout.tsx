'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { LayoutDashboard, LogOut, Car, Route } from 'lucide-react';
import React from 'react';

const navItems = [
  { href: '/htx/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/htx/drivers', label: 'Tài xế', icon: Car },
  { href: '/htx/trips', label: 'Chuyến đi', icon: Route },
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
    <SidebarProvider mobileBreakpoint={1024}>
      <PortalDrawerAutoClose pathname={pathname} />
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
          <Link href="/htx/dashboard" className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vigo-wordmark.png" alt="ViiGO" className="h-7 w-auto group-data-[collapsible=icon]:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vigo-icon.png" alt="ViiGO" className="hidden h-8 w-8 shrink-0 rounded group-data-[collapsible=icon]:block" />
            <span className="text-lg font-semibold text-muted-foreground group-data-[collapsible=icon]:hidden">HTX</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname.startsWith(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link href={item.href}>
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleLogout} tooltip="Đăng xuất">
                <LogOut className="h-4 w-4" />
                <span>Đăng xuất</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
          <SidebarTrigger aria-label="Mở menu điều hướng HTX" />
          <Link href="/htx/dashboard" className="flex items-center gap-1.5 font-semibold text-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vigo-wordmark.png" alt="ViiGO" className="h-5 w-auto" />
            <span className="text-base">HTX</span>
          </Link>
        </header>
        <div className="mx-auto w-full max-w-7xl min-w-0 p-3 sm:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function PortalDrawerAutoClose({ pathname }: { pathname: string }) {
  const { setOpenMobile } = useSidebar();
  React.useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);
  return null;
}
