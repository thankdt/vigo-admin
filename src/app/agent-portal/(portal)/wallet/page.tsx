'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Wallet, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getAgentMe,
  getMyWithdrawals,
  updateMyBankInfo,
  submitMyWithdrawal,
  listAgentBookings,
  agentCanSelfWithdraw,
  parseApiError,
  type AgentMe,
  type KolWithdrawal,
  type AgentBooking,
} from '@/lib/api';
import { agentCommissionDisplay } from '@/lib/agent-commission-display';

const formatVND = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const STATUS: Record<KolWithdrawal['status'], { label: string; cls: string }> = {
  PENDING: { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Đã duyệt', cls: 'bg-blue-100 text-blue-800' },
  TRANSFERRED: { label: 'Đã chuyển', cls: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Từ chối', cls: 'bg-red-100 text-red-800' },
};

const addr = (a: { address?: string } | null | undefined) => a?.address ?? '—';

export default function AgentWalletPage() {
  const { toast } = useToast();
  const [me, setMe] = React.useState<AgentMe | null>(null);
  const [list, setList] = React.useState<KolWithdrawal[]>([]);
  const [bookings, setBookings] = React.useState<AgentBooking[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [bankName, setBankName] = React.useState('');
  const [accountNumber, setAccountNumber] = React.useState('');
  const [accountHolder, setAccountHolder] = React.useState('');
  const [savingBank, setSavingBank] = React.useState(false);

  const [amount, setAmount] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const m = await getAgentMe();
      setMe(m);
      if (m.bankInfo) {
        setBankName(m.bankInfo.bankName || '');
        setAccountNumber(m.bankInfo.accountNumber || '');
        setAccountHolder(m.bankInfo.accountHolder || '');
      }
      // Lịch sử hoa hồng theo chuyến — mọi loại ví đều xem được ("tiền cộng từ chuyến nào").
      const b = await listAgentBookings(1, 50).catch(() => ({ data: [] as AgentBooking[] }));
      setBookings(b.data ?? []);
      // Lịch sử rút chỉ có nghĩa với ví tự rút được (USER_REFERRAL). Ví tài xế không có luồng này.
      if (agentCanSelfWithdraw(m.walletType)) {
        setList(await getMyWithdrawals().catch(() => []));
      } else {
        setList([]);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được dữ liệu', description: parseApiError(err.message) });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  const saveBank = async () => {
    // Cổng an toàn tiền (defense-in-depth): chỉ ví USER_REFERRAL mới có tài khoản nhận tiền để rút.
    // Không dựa duy nhất vào render có điều kiện — guard ở đây sống sót qua mọi refactor JSX sau này.
    if (!me || !agentCanSelfWithdraw(me.walletType)) return;
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      toast({ variant: 'destructive', title: 'Thiếu thông tin', description: 'Điền đủ ngân hàng, số tài khoản và chủ tài khoản.' });
      return;
    }
    setSavingBank(true);
    try {
      await updateMyBankInfo({ bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountHolder: accountHolder.trim() });
      toast({ title: 'Đã lưu tài khoản nhận tiền' });
      await load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lưu thất bại', description: parseApiError(err.message) });
    } finally {
      setSavingBank(false);
    }
  };

  const submit = async () => {
    // Cổng an toàn tiền (defense-in-depth): /referrals/me/withdrawals hard-code ví USER_REFERRAL.
    // Chặn triệt để ví tài xế (DRIVER_MAIN) ngay cả khi UI bị refactor lộ nút ra ngoài nhánh gate.
    if (!me || !agentCanSelfWithdraw(me.walletType)) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ variant: 'destructive', title: 'Số tiền không hợp lệ' });
      return;
    }
    setSubmitting(true);
    try {
      await submitMyWithdrawal(Math.round(n));
      toast({ title: 'Đã tạo lệnh rút', description: 'Admin sẽ duyệt và chuyển khoản.' });
      setAmount('');
      await load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Tạo lệnh rút thất bại', description: parseApiError(err.message) });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="py-24 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /></div>;
  }

  const canWithdraw = me ? agentCanSelfWithdraw(me.walletType) : false;
  const hasBank = !!me?.bankInfo?.accountNumber;
  const hasInFlight = list.some((w) => w.status === 'PENDING' || w.status === 'APPROVED');
  const walletLabel = me?.walletType === 'DRIVER_MAIN' ? 'Ví tài xế' : 'Ví hoa hồng';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6 text-primary" /> Ví & Rút tiền</h1>

      {/* Số dư ví */}
      <Card className="p-4 border-primary">
        <div className="text-xs text-muted-foreground">{walletLabel} — số dư khả dụng</div>
        <div className="text-2xl font-bold text-primary">{formatVND(me?.walletBalance ?? 0)}</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Hoa hồng {me?.commissionPercent != null ? `${me.commissionPercent}%` : '—'} trên cước (trước VAT) mỗi đơn hoàn thành.
        </p>
      </Card>

      {canWithdraw ? (
        <>
          {/* Tài khoản nhận tiền */}
          <Card className="p-4 space-y-3">
            <div className="text-sm font-medium">Tài khoản nhận tiền</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Ngân hàng</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="VD: Vietcombank" />
              </div>
              <div className="space-y-1.5">
                <Label>Số tài khoản</Label>
                <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label>Chủ tài khoản</Label>
                <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value.toUpperCase())} placeholder="NGUYEN VAN A" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Số tài khoản dùng để chuyển tiền khi bạn rút. Admin kiểm tra trước khi chuyển khoản.</p>
            <Button variant="outline" onClick={saveBank} disabled={savingBank}>
              {savingBank && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu tài khoản
            </Button>
          </Card>

          {/* Tạo lệnh rút */}
          <Card className="p-4 space-y-3">
            <div className="text-sm font-medium">Tạo lệnh rút</div>
            {!hasBank && <p className="text-sm text-amber-700">Vui lòng lưu tài khoản nhận tiền trước khi rút.</p>}
            {hasInFlight && <p className="text-sm text-amber-700">Bạn đang có lệnh rút đang xử lý — vui lòng đợi hoàn tất.</p>}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label>Số tiền (VND)</Label>
                <Input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Tối thiểu 50.000" />
              </div>
              <Button onClick={submit} disabled={submitting || !hasBank || hasInFlight}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gửi lệnh rút
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Mỗi lần chỉ gửi 1 lệnh đang xử lý. Tiền được giữ trong hệ thống cho tới khi admin chuyển khoản.</p>
          </Card>

          {/* Lịch sử rút */}
          <Card>
            <div className="border-b px-4 py-3 text-sm font-medium">Lịch sử rút tiền</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead>Tài khoản</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ngày</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">Chưa có lệnh rút nào.</TableCell></TableRow>
                ) : list.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-right tabular-nums font-semibold">{formatVND(w.amount)}</TableCell>
                    <TableCell className="text-sm">
                      <div>{w.bankName}</div>
                      <div className="text-xs text-muted-foreground">{w.accountNumber}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className={STATUS[w.status].cls}>{STATUS[w.status].label}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(w.createdAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      ) : (
        // Đại lý là TÀI XẾ: hoa hồng tự cộng vào ví (thưởng/khuyến mại) trong app tài xế — cổng không tự rút.
        <Card className="flex items-start gap-3 border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Tài khoản của bạn là <span className="font-medium">tài xế</span>. Hoa hồng đặt hộ được cộng thẳng vào
            ví thưởng của bạn — theo dõi và sử dụng số dư này ngay trong <span className="font-medium">ứng dụng tài xế</span>.
          </div>
        </Card>
      )}

      {/* Hoa hồng theo chuyến — "tiền cộng từ chuyến nào" (mọi loại ví đều xem được) */}
      <Card>
        <div className="border-b px-4 py-3 text-sm font-medium">Hoa hồng theo chuyến</div>
        {bookings.length === 0 ? (
          <div className="h-20 flex items-center justify-center text-sm text-muted-foreground">Chưa có chuyến đặt hộ nào.</div>
        ) : (
          <ul className="divide-y">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="truncate text-sm">{addr(b.pickupAddress)} → {addr(b.dropoffAddress)}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(b.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    {b.finalPrice != null ? ` · Cước ${formatVND(b.finalPrice)}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {(() => {
                    const c = agentCommissionDisplay(b);
                    if (c.tone === 'earned')
                      return <div className="text-sm font-semibold text-green-600 dark:text-green-400">+{formatVND(c.amount)}</div>;
                    if (c.tone === 'estimate')
                      return <div className="text-xs font-medium text-muted-foreground">dự kiến ~{formatVND(c.amount)}</div>;
                    return (
                      <div className="text-xs font-medium text-muted-foreground">
                        0₫
                        {c.reason && <span className="block text-[10px] text-muted-foreground/80">{c.reason}</span>}
                      </div>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
        )}
        {bookings.some((b) => b.agentCommissionAmount == null && (b.agentCommissionEstimate ?? 0) > 0) && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground">
            * Hoa hồng dự kiến là mức tối đa — số thật chốt khi đơn hoàn thành (có thể giảm theo giới hạn tháng).
          </p>
        )}
      </Card>
    </div>
  );
}
