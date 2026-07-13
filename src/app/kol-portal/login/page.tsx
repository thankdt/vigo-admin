'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';
import { sendKolLoginOtp, kolLoginOtp, getKolMe } from '@/lib/api';
import React from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Crown, ArrowLeft } from 'lucide-react';

/**
 * KOL/KOC portal login — passwordless (phone + OTP). After login we call /kol/me to confirm the
 * account is actually an ACTIVE KOL; if not, we clear the session and refuse.
 */
export default function KolLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = React.useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('access_token')) {
      getKolMe()
        .then(() => router.replace('/kol-portal/dashboard'))
        .catch(() => {/* stale/non-KOL token — stay on login */});
    }
  }, [router]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await sendKolLoginOtp(phone.trim());
      setStep('otp');
      toast({ title: 'Đã gửi OTP', description: 'Nhập mã vừa gửi tới số điện thoại của bạn.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không gửi được OTP', description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await kolLoginOtp(phone.trim(), otp.trim());
      // Confirm this account is an ACTIVE KOL (KolGuard → 403 otherwise).
      try {
        await getKolMe();
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        throw new Error('Tài khoản này chưa được cấp quyền KOL. Vui lòng liên hệ admin để được duyệt.');
      }
      toast({ title: 'Đăng nhập thành công' });
      router.push('/kol-portal/dashboard');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không đăng nhập được', description: err.message });
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-2xl">
          <CardHeader className="items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Crown className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Vigo KOL Portal</CardTitle>
            <CardDescription>Cổng dành cho KOL/KOC và thủ lĩnh</CardDescription>
          </CardHeader>
          <CardContent>
            {step === 'phone' ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Số điện thoại</Label>
                  <Input id="phone" type="tel" inputMode="numeric" placeholder="0912345678" required value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading || !phone.trim()}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Gửi mã OTP
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="otp">Mã OTP gửi tới {phone}</Label>
                  <Input id="otp" inputMode="numeric" maxLength={6} placeholder="6 chữ số" required value={otp} onChange={(e) => setOtp(e.target.value)} autoFocus />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading || otp.trim().length !== 6}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Đăng nhập
                </Button>
                <button type="button" onClick={() => { setStep('phone'); setOtp(''); }} className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-3.5 w-3.5" /> Đổi số điện thoại
                </button>
              </form>
            )}
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Lưu ý: đăng nhập tại đây sẽ đăng xuất tài khoản trên app Vigo (mỗi tài khoản 1 phiên).
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
