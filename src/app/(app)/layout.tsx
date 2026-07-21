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
import { RadixPointerEventsWatchdog } from '@/components/radix-pointer-events-watchdog';
import { ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { SidebarIdentity } from '@/components/sidebar-identity';
import React from 'react';
import { navItems, type NavItem } from '@/lib/nav-items';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { isMenuVisible, isRouteAllowed } from '@/lib/rbac';
import { logout } from '@/lib/api';

// Mục "Phân quyền" chỉ hiện cho super admin (không nằm trong navItems catalog).
const ROLES_NAV_ITEM: NavItem = { href: '/roles', label: 'Phân quyền', icon: ShieldCheck };

// Error Boundary to prevent full page crash
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center space-y-4">
            <h2 className="text-lg font-semibold text-destructive">Đã xảy ra lỗi</h2>
            <p className="text-sm text-muted-foreground">{this.state.error?.message}</p>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, loading } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  React.useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.replace('/');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  // Route guard (UX). Chỉ chạy khi đã biết quyền (me loaded) — nếu không thì có thể
  // đá nhầm trước khi biết. /no-access luôn được phép (đích redirect, chống loop).
  React.useEffect(() => {
    if (loading || !me) return;
    if (!isRouteAllowed(pathname, me)) {
      router.replace('/no-access');
    }
  }, [pathname, me, loading, router]);

  // Chưa xác thực token: chờ (tránh gọi API trước khi check auth). Đang tải quyền:
  // chưa render menu để không chớp mục không có quyền (spec §5.1).
  if (!isAuthenticated || loading) {
    return null;
  }

  // Token còn nhưng /admin/me lỗi (mạng/500 — không phải 401, vì 401 đã bị fetchWithAuth
  // xử lý). KHÔNG render children (tránh trang con gọi API nhầm) — hiện fallback + logout.
  if (!me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Không tải được thông tin quyền tài khoản. Vui lòng thử lại hoặc đăng nhập lại.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>Thử lại</Button>
          <Button onClick={async () => { await logout(); router.push('/'); }}>Đăng xuất</Button>
        </div>
      </div>
    );
  }

  const visibleNav = navItems.filter((item) => isMenuVisible(item.href, me));
  if (me.isSuperAdmin) visibleNav.push(ROLES_NAV_ITEM);

  // Route không có quyền: KHÔNG render children (chặn nội dung + effect fetch của trang
  // cấm chớp lên trước khi effect guard redirect). Sidebar vẫn hiện (menu đã lọc).
  const routeAllowed = isRouteAllowed(pathname, me);

  return (
    <SidebarProvider>
      <RadixPointerEventsWatchdog />
      <Sidebar>
        <SidebarHeader className="p-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <Logo className="h-7 w-7 text-primary" />
            <span className="duration-200 group-data-[collapsible=icon]:hidden">Vigo Admin</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {visibleNav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  // Exact match or a true sub-path (href + '/') — NOT a bare prefix, so sibling
                  // routes that share a prefix (e.g. /agent vs /agent-orders) don't both highlight.
                  isActive={pathname === item.href || pathname.startsWith(item.href + '/')}
                  tooltip={item.label}
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-4">
          <SidebarIdentity
            fullName={me?.fullName ?? null}
            phone={me?.phone ?? null}
            onLogout={async () => {
              await logout();
              router.push('/');
            }}
          />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <Header />
        <main className="flex-1 p-4 sm:px-6 sm:py-0">
          <ErrorBoundary>{routeAllowed ? children : null}</ErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
