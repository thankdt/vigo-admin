'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendRegistrationOtp, registerAccount, applyAgent, getAgentMe } from '@/lib/api';
import React from 'react';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft } from 'lucide-react';

/**
 * Đăng ký tài khoản đại lý đặt hộ — mirror app khách: 2 bước (nhập thông tin → xác thực OTP).
 * Tạo tài khoản role USER qua /auth/register (cùng contract app khách) rồi tự đăng nhập. Sau khi
 * có token, best-effort gọi /agent/apply để admin thấy đơn (Chờ duyệt) và cấp % hoa hồng riêng.
 */
export default function AgentRegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = React.useState<'form' | 'otp'>('form');
  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [referralCode, setReferralCode] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);

  // Token còn hạn → vào thẳng cổng, khỏi đăng ký lại.
  React.useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('access_token')) {
      getAgentMe()
        .then(() => router.replace('/agent-portal/dashboard'))
        .catch(() => {/* token hỏng → ở lại trang đăng ký */});
    }
  }, [router]);

  const sendOtp = async () => {
    if (!fullName.trim()) { toast({ variant: 'destructive', title: 'Vui lòng nhập họ và tên' }); return; }
    if (phone.trim().length < 10) { toast({ variant: 'destructive', title: 'Số điện thoại không hợp lệ' }); return; }
    if (password.length < 6) { toast({ variant: 'destructive', title: 'Mật khẩu tối thiểu 6 ký tự' }); return; }
    if (password !== confirm) { toast({ variant: 'destructive', title: 'Mật khẩu xác nhận không khớp' }); return; }
    setIsLoading(true);
    try {
      await sendRegistrationOtp(phone.trim());
      setStep('otp');
      toast({ title: 'Đã gửi mã OTP', description: 'Kiểm tra tin nhắn Zalo/SMS.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: e?.message ?? 'Không gửi được OTP' });
    } finally {
      setIsLoading(false);
    }
  };

  const doRegister = async () => {
    if (otp.trim().length !== 6) return;
    setIsLoading(true);
    // Chỉ đính kèm mã giới thiệu khi hợp lệ theo ràng buộc backend (6–16 ký tự alphanumeric). Mã gõ
    // thiếu/sai độ dài bị bỏ qua để KHÔNG chặn đăng ký (đúng tinh thần soft-fail của backend).
    const rc = referralCode.trim();
    // Bước 1: tạo tài khoản + lưu token. Sai OTP → lỗi riêng, chưa có session để dọn.
    try {
      await registerAccount({
        phone: phone.trim(),
        pass: password,
        fullName: fullName.trim(),
        otp: otp.trim(),
        referralCode: rc.length >= 6 && rc.length <= 16 ? rc : undefined,
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Đăng ký thất bại', description: e?.message ?? 'Vui lòng thử lại' });
      setIsLoading(false);
      return;
    }
    // Bước 2: đã đăng nhập → ghi nhận ứng tuyển đại lý (best-effort; lỗi không chặn vào cổng).
    try { await applyAgent('Đăng ký từ cổng đại lý đặt hộ'); } catch {/* đã là đại lý / lỗi mềm — bỏ qua */}
    toast({ title: 'Đăng ký thành công', description: 'Chào mừng bạn đến với cổng đại lý!' });
    router.replace('/agent-portal/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vigo-icon.png" alt="ViiGO" className="mx-auto mb-2 h-12 w-12 rounded-xl" />
          <CardTitle>Đăng ký đại lý đặt hộ</CardTitle>
          <CardDescription>
            {step === 'form' ? 'Tạo tài khoản để nhận hoa hồng đặt hộ' : `Nhập mã OTP gửi tới ${phone}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'form' ? (
            <>
              <div className="space-y-1.5">
                <Label>Họ và tên</Label>
                <Input value={fullName} placeholder="Nguyễn Văn A" onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Số điện thoại</Label>
                <Input
                  type="tel" value={phone} placeholder="09xxxxxxxx"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mật khẩu</Label>
                <Input
                  type="password" value={password} placeholder="Tối thiểu 6 ký tự"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Xác nhận mật khẩu</Label>
                <Input
                  type="password" value={confirm} placeholder="Nhập lại mật khẩu"
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mã giới thiệu <span className="text-muted-foreground font-normal">(nếu có)</span></Label>
                <Input
                  value={referralCode} placeholder="Tuỳ chọn"
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                />
              </div>
              <Button className="w-full" onClick={sendOtp} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Tiếp tục'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Đã có tài khoản?{' '}
                <Link href="/agent-portal/login" className="font-medium text-primary hover:underline">Đăng nhập</Link>
              </p>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Mã OTP</Label>
                <Input
                  inputMode="numeric" maxLength={6} value={otp} placeholder="●●●●●●"
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && doRegister()}
                />
              </div>
              <Button className="w-full" onClick={doRegister} disabled={isLoading || otp.trim().length !== 6}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Xác nhận đăng ký'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => { setStep('form'); setOtp(''); }} disabled={isLoading}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Sửa thông tin
              </Button>
              <Button
                variant="link" className="w-full text-muted-foreground" disabled={isLoading}
                onClick={() => sendRegistrationOtp(phone.trim()).then(() => toast({ title: 'Đã gửi lại mã OTP' })).catch((e) => toast({ variant: 'destructive', title: 'Lỗi', description: e?.message }))}
              >
                Gửi lại mã OTP
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
