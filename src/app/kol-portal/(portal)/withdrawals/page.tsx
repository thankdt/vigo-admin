'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getKolMe,
  getMyWithdrawals,
  updateMyBankInfo,
  submitMyWithdrawal,
  parseApiError,
  type KolMe,
  type KolWithdrawal,
} from '@/lib/api';

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const STATUS: Record<KolWithdrawal['status'], { label: string; cls: string }> = {
  PENDING: { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Đã duyệt', cls: 'bg-blue-100 text-blue-800' },
  TRANSFERRED: { label: 'Đã chuyển', cls: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Từ chối', cls: 'bg-red-100 text-red-800' },
};

export default function KolWithdrawalsPage() {
  const { toast } = useToast();
  const [me, setMe] = React.useState<KolMe | null>(null);
  const [list, setList] = React.useState<KolWithdrawal[]>([]);
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
      const [m, w] = await Promise.all([getKolMe(), getMyWithdrawals()]);
      setMe(m);
      setList(w);
      if (m.bankInfo) {
        setBankName(m.bankInfo.bankName || '');
        setAccountNumber(m.bankInfo.accountNumber || '');
        setAccountHolder(m.bankInfo.accountHolder || '');
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được dữ liệu', description: parseApiError(err.message) });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  const saveBank = async () => {
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

  const hasBank = !!me?.bankInfo?.accountNumber;
  const hasInFlight = list.some((w) => w.status === 'PENDING' || w.status === 'APPROVED');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6 text-primary" /> Rút tiền</h1>

      <Card className="p-4 border-primary">
        <div className="text-xs text-muted-foreground">Số dư khả dụng</div>
        <div className="text-2xl font-bold text-primary">{formatVND(me?.balance ?? 0)}</div>
      </Card>

      {/* Bank info */}
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
            <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="NGUYEN VAN A" />
          </div>
        </div>
        <Button variant="outline" onClick={saveBank} disabled={savingBank}>
          {savingBank && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Lưu tài khoản
        </Button>
      </Card>

      {/* Withdraw request */}
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
      </Card>

      {/* History */}
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
                <TableCell className="text-sm text-muted-foreground">{new Date(w.createdAt).toLocaleDateString('vi-VN')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
