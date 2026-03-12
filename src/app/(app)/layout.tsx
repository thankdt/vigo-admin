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
import {
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  Bot,
  Car,
  Book,
  Map,
  Ticket,
  Bell,
  Newspaper,
  Image as ImageIcon,
} from 'lucide-react';
import { Logo } from '@/components/logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Header } from '@/components/header';
import placeholderData from '@/lib/placeholder-images.json';
import { Separator } from '@/components/ui/separator';
import React from 'react';

const { placeholderImages } = placeholderData;

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/drivers', label: 'Drivers', icon: Car },
  { href: '/bookings', label: 'Bookings', icon: Book },
  { href: '/master-data', label: 'Master Data', icon: Map },
  { href: '/promotions', label: 'Promotions', icon: Ticket },
  { href: '/reports', label: 'Reports', icon: Bot },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/news', label: 'News', icon: Newspaper },
  { href: '/banners', label: 'Banners', icon: ImageIcon },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const avatarUrl = placeholderImages.find(p => p.id === 'avatar1')?.imageUrl;

  React.useEffect(() => {
    // In a production app, you would want robust token validation here.
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.replace('/');
    }
  }, [router]);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="p-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <Logo className="h-7 w-7 text-primary" />
            <span className="duration-200 group-data-[collapsible=icon]:hidden">Vigo Admin</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(item.href)}
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
          <div className="flex items-center gap-3 duration-200 group-data-[collapsible=icon]:hidden">
            <Avatar className="h-9 w-9">
              <AvatarImage src={avatarUrl} alt="@vigo-admin" />
              <AvatarFallback>AJ</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Alex Johnson</span>
              <span className="text-xs text-muted-foreground">alex.j@example.com</span>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <Header />
        <main className="flex-1 p-4 sm:px-6 sm:py-0">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
