'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';
import { login } from '@/lib/api';
import React from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

/**
 * HTX (cooperative-owner) login page. Same /auth/login backend as the admin panel — gated by
 * role afterwards: only TRANSPORT_COMPANY_OWNER can access /htx/dashboard etc.
 */
export default function HtxLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');

  React.useEffect(() => {
    const token = localStorage.getItem('access_token');
    const role = localStorage.getItem('user_role');
    if (token && role === 'TRANSPORT_COMPANY_OWNER') {
      router.replace('/htx/dashboard');
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await login(phone, password);
      const role = result?.data?.user?.role;
      if (role !== 'TRANSPORT_COMPANY_OWNER') {
        // Don't grant a partial admin session — clear and refuse so the next try is clean.
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        toast({
          variant: 'destructive',
          title: 'Tài khoản không phải chủ HTX',
          description: 'Vui lòng dùng tài khoản chủ HTX do quản trị viên cấp.',
        });
        setIsLoading(false);
        return;
      }
      // Stash role so the layout can short-circuit the role check on subsequent loads.
      localStorage.setItem('user_role', role);
      toast({ title: 'Đăng nhập thành công' });
      router.push('/htx/dashboard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Đăng nhập thất bại',
        description: error.message || 'Vui lòng kiểm tra thông tin đăng nhập.',
      });
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-2xl">
          <CardHeader className="items-center text-center">
            <Logo className="mb-4 h-12 w-12 text-primary" />
            <CardTitle className="text-2xl font-bold tracking-tight">Vigo HTX Portal</CardTitle>
            <CardDescription>Cổng quản lý dành cho chủ Hợp tác xã</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Số điện thoại</Label>
                <Input id="phone" type="tel" placeholder="0912345678" required value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
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
