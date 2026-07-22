'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';
import { login, getAdminMe } from '@/lib/api';
import { firstAllowedRoute } from '@/lib/rbac';
import { navItems } from '@/lib/nav-items';
import React from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

// Route đích sau đăng nhập = mục ĐẦU TIÊN user có quyền (không mù quáng /dashboard —
// user không có function 'dashboard' sẽ bị route guard đá sang /no-access, gây nhấp nháy).
// getAdminMe cần token (đã set sau login). Lỗi -> để /dashboard, guard tự xử lý.
async function resolveLanding(): Promise<string> {
  try {
    const me = await getAdminMe();
    return firstAllowedRoute(me, navItems.map((i) => i.href));
  } catch {
    return '/dashboard';
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');

  React.useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      resolveLanding().then((route) => router.replace(route));
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      console.log('Attempting login...');
      await login(phone, password);
      console.log('Login successful, redirecting...');
      toast({
        title: 'Đăng nhập thành công',
        description: 'Đang chuyển hướng đến trang quản trị...',
      });
      // Điều hướng client-side (tránh 404 trên S3) tới route đầu tiên user có quyền.
      router.push(await resolveLanding());
    } catch (error: any) {
      console.error('Login error:', error);
      toast({
        variant: 'destructive',
        title: 'Đăng nhập thất bại',
        description: error.message || 'Vui lòng kiểm tra thông tin đăng nhập và thử lại.',
      });
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-2xl">
          <CardHeader className="items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vigo-icon.png" alt="ViiGO" className="mb-4 h-14 w-14 rounded-xl" />
            <CardTitle className="text-2xl font-bold tracking-tight">Vigo Admin</CardTitle>
            <CardDescription>Chào mừng trở lại! Vui lòng đăng nhập để tiếp tục.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input id="phone" type="tel" placeholder="0999999999" required value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Mật khẩu</Label>
                </div>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Đăng nhập
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
