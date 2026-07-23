'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendAgentLoginOtp, agentLoginOtp, getAgentMe } from '@/lib/api';
import React from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Store, ArrowLeft } from 'lucide-react';

/**
 * Booking-agent (đại lý đặt hộ) portal login — passwordless (phone + OTP). After login we call
 * /agent/me to confirm the account is an ACTIVE agent; if not, we clear the session and refuse.
 */
export default function AgentLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = React.useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('access_token')) {
      getAgentMe()
        .then(() => router.replace('/agent-portal/dashboard'))
        .catch(() => {/* stale/non-agent token — stay on login */});
    }
  }, [router]);

  const requestOtp = async () => {
    if (!phone.trim()) return;
    setIsLoading(true);
    try {
      await sendAgentLoginOtp(phone.trim());
      setStep('otp');
      toast({ title: 'Đã gửi mã OTP', description: 'Kiểm tra tin nhắn Zalo/SMS.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: e?.message ?? 'Không gửi được OTP' });
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.trim().length !== 6) return;
    setIsLoading(true);
    // Step 1: verify the OTP (wrong code → its own message, no session to clear).
    try {
      await agentLoginOtp(phone.trim(), otp.trim());
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Sai mã OTP', description: e?.message ?? 'Mã OTP không đúng' });
      setIsLoading(false);
      return;
    }
    // Step 2: logged in — confirm this account is an ACTIVE agent. Only here do we drop the
    // freshly-minted session (both tokens), and only because it isn't an agent account.
    try {
      await getAgentMe(); // AgentGuard → 403 for non-agents
      router.replace('/agent-portal/dashboard');
    } catch {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      }
      toast({ variant: 'destructive', title: 'Không vào được', description: 'Tài khoản chưa được duyệt làm đại lý đặt hộ.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vigo-icon.png" alt="ViiGO" className="mx-auto mb-2 h-12 w-12 rounded-xl" />
          <CardTitle>Cổng đại lý đặt hộ</CardTitle>
          <CardDescription>
            {step === 'phone' ? 'Đăng nhập bằng số điện thoại' : `Nhập mã OTP gửi tới ${phone}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'phone' ? (
            <>
              <div className="space-y-1.5">
                <Label>Số điện thoại</Label>
                <Input
                  type="tel" value={phone} placeholder="09xxxxxxxx"
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && requestOtp()}
                />
              </div>
              <Button className="w-full" onClick={requestOtp} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gửi mã OTP'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Chưa có tài khoản?{' '}
                <Link href="/agent-portal/register" className="font-medium text-primary hover:underline">Đăng ký</Link>
              </p>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Mã OTP</Label>
                <Input
                  inputMode="numeric" maxLength={6} value={otp} placeholder="●●●●●●"
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && verifyOtp()}
                />
              </div>
              <Button className="w-full" onClick={verifyOtp} disabled={isLoading || otp.trim().length !== 6}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Đăng nhập'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep('phone')}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Đổi số
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
