'use client';

import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Footer sidebar: danh tính admin đang đăng nhập (tên + SĐT động từ /admin/me) + nút
// Đăng xuất. Tách khỏi layout để test không phải render cả sidebar (matchMedia/jsdom).
// Không avatar (spec §5.4). onLogout do layout truyền (gọi logout() rồi điều hướng).
export function SidebarIdentity({
  fullName,
  phone,
  onLogout,
}: {
  fullName: string | null;
  phone: string | null;
  onLogout: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 duration-200 group-data-[collapsible=icon]:hidden">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{fullName || 'Quản trị viên'}</span>
        <span className="text-xs text-muted-foreground">{phone || ''}</span>
      </div>
      <Button variant="ghost" size="sm" className="justify-start" onClick={onLogout}>
        <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
      </Button>
    </div>
  );
}
