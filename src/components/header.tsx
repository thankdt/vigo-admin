'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { navItems } from '@/lib/nav-items';

const EXTRA_TITLES: Record<string, string> = {
  '/roles': 'Phân quyền',
  '/no-access': 'Không có quyền truy cập',
  '/users/detail': 'Chi tiết người dùng',
  '/htx-reconciliation/detail': 'Chi tiết đối soát HTX',
};

function resolvePageTitle(pathname: string): string {
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname];
  const exact = navItems.find((item) => item.href === pathname);
  if (exact) return exact.label;
  const prefix = navItems.find((item) => pathname.startsWith(item.href + '/'));
  if (prefix) return prefix.label;
  return 'Vigo Admin';
}

// Logout đã gộp về footer sidebar (SidebarIdentity) — UserNav góc phải bị bỏ (spec §5.4).
// Sticky header hiển thị nút đóng/mở sidebar cho mọi kích cỡ màn hình (mobile/iPad mở drawer,
// iPad ngang & desktop thu gọn sang icon rail) kèm tên màn hình hiện tại trên mobile/tablet.
export function Header() {
  const pathname = usePathname() || '';
  const pageTitle = resolvePageTitle(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2.5 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4 lg:h-12 lg:px-6">
      <SidebarTrigger aria-label="Mở hoặc thu gọn menu điều hướng" />
      <Link
        href="/dashboard"
        className="flex items-center gap-1.5 lg:hidden"
        aria-label="Trang tổng quan ViiGO Admin"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vigo-icon.png" alt="ViiGO" className="h-6 w-6 shrink-0 rounded" />
      </Link>
      <span className="truncate text-sm font-semibold text-foreground lg:text-muted-foreground">
        {pageTitle}
      </span>
      <div className="flex-1" />
    </header>
  );
}
