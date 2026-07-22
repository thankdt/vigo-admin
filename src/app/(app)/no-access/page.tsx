'use client';

import { useRouter } from 'next/navigation';
import { ShieldAlert, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/api';

// Trang đích khi user vào route không có quyền. KHÔNG đòi quyền (guard cho /no-access
// luôn qua) -> tránh vòng lặp redirect. Chỉ có thông báo + nút đăng xuất.
export default function NoAccessPage() {
  const router = useRouter();
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md space-y-4 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Bạn chưa được cấp quyền</h1>
        <p className="text-sm text-muted-foreground">
          Tài khoản của bạn chưa có quyền truy cập mục này. Vui lòng liên hệ quản trị viên
          để được cấp quyền phù hợp.
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            await logout();
            router.push('/');
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
        </Button>
      </div>
    </div>
  );
}
