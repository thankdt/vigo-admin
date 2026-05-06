'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Wallet, Check, X, Banknote, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  adminListWithdrawals,
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  adminMarkWithdrawalTransferred,
  type AdminWithdrawalRow,
  type WithdrawalStatus,
} from '@/lib/api';

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const statusBadge = (s: WithdrawalStatus) => {
  switch (s) {
    case 'PENDING': return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">Chờ duyệt</Badge>;
    case 'APPROVED': return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400">Đã duyệt</Badge>;
    case 'TRANSFERRED': return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">Đã chuyển</Badge>;
    case 'REJECTED': return <Badge variant="destructive">Từ chối</Badge>;
  }
};

export default function WithdrawalsPage() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<AdminWithdrawalRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<WithdrawalStatus | 'ALL'>('PENDING');
  const [isLoading, setIsLoading] = React.useState(true);

  // Pending action: approve / reject / mark-transferred. Modal collects optional note.
  type Action = 'approve' | 'reject' | 'mark-transferred';
  const [actionTarget, setActionTarget] = React.useState<{ row: AdminWithdrawalRow; action: Action } | null>(null);
  const [actionNote, setActionNote] = React.useState('');
  const [isActing, setIsActing] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await adminListWithdrawals({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        page,
        limit: 20,
      });
      setRows(result.data);
      setTotalPages(result.meta.totalPages || 1);
      setTotal(result.meta.total);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được danh sách', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, page, toast]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => { setPage(1); }, [statusFilter]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Đã copy', description: `${label}: ${text}` });
  };

  const submitAction = async () => {
    if (!actionTarget) return;
    if (actionTarget.action === 'reject' && !actionNote.trim()) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Phải nhập lý do từ chối.' });
      return;
    }
    setIsActing(true);
    try {
      if (actionTarget.action === 'approve') {
        await adminApproveWithdrawal(actionTarget.row.id, actionNote.trim() || undefined);
        toast({ title: 'Đã duyệt', description: 'Tiền đang giữ — chuyển khoản xong nhớ đánh dấu "Đã chuyển".' });
      } else if (actionTarget.action === 'reject') {
        await adminRejectWithdrawal(actionTarget.row.id, actionNote.trim());
        toast({ title: 'Đã từ chối', description: 'Tiền đã hoàn về ví affiliate của user.' });
      } else {
        await adminMarkWithdrawalTransferred(actionTarget.row.id);
        toast({ title: 'Đã đánh dấu chuyển khoản', description: 'Lệnh đã hoàn tất.' });
      }
      setActionTarget(null);
      setActionNote('');
      load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: err.message });
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" /> Lệnh rút tiền affiliate
        </h1>
        <p className="text-sm text-muted-foreground">
          Khi user gửi lệnh rút, tiền được giữ trong hệ thống. Admin chuyển khoản tay theo TT bank rồi đánh dấu &ldquo;Đã chuyển&rdquo;.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Trạng thái</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả</SelectItem>
              <SelectItem value="PENDING">Chờ duyệt</SelectItem>
              <SelectItem value="APPROVED">Đã duyệt</SelectItem>
              <SelectItem value="TRANSFERRED">Đã chuyển</SelectItem>
              <SelectItem value="REJECTED">Từ chối</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Người yêu cầu</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
              <TableHead>Ngân hàng</TableHead>
              <TableHead>Số tài khoản</TableHead>
              <TableHead>Chủ tài khoản</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Tạo lúc</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">Không có lệnh nào.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.userName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{r.userPhone}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold">{formatVND(r.amount)}</TableCell>
                  <TableCell>{r.bankName}</TableCell>
                  <TableCell>
                    <button onClick={() => copy(r.accountNumber, 'STK')} className="font-mono text-sm hover:underline inline-flex items-center gap-1">
                      {r.accountNumber}
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </TableCell>
                  <TableCell>{r.accountHolder}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {r.status === 'PENDING' && (
                        <>
                          <Button variant="ghost" size="sm" className="h-8 text-blue-700" onClick={() => setActionTarget({ row: r, action: 'approve' })}>
                            <Check className="h-4 w-4 mr-1" /> Duyệt
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setActionTarget({ row: r, action: 'reject' })}>
                            <X className="h-4 w-4 mr-1" /> Từ chối
                          </Button>
                        </>
                      )}
                      {r.status === 'APPROVED' && (
                        <>
                          <Button variant="ghost" size="sm" className="h-8 text-green-700" onClick={() => setActionTarget({ row: r, action: 'mark-transferred' })}>
                            <Banknote className="h-4 w-4 mr-1" /> Đã chuyển
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setActionTarget({ row: r, action: 'reject' })}>
                            <X className="h-4 w-4 mr-1" /> Huỷ
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-muted-foreground">{total} lệnh</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Trang {page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || isLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages || isLoading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      <Dialog open={!!actionTarget} onOpenChange={(open) => { if (!open && !isActing) { setActionTarget(null); setActionNote(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.action === 'approve' && 'Duyệt lệnh rút tiền'}
              {actionTarget?.action === 'reject' && 'Từ chối lệnh rút tiền'}
              {actionTarget?.action === 'mark-transferred' && 'Xác nhận đã chuyển khoản'}
            </DialogTitle>
            <DialogDescription>
              {actionTarget && (
                <>
                  <span className="font-medium">{actionTarget.row.userName ?? actionTarget.row.userPhone}</span> · {formatVND(actionTarget.row.amount)} · {actionTarget.row.bankName} {actionTarget.row.accountNumber}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {actionTarget?.action !== 'mark-transferred' && (
            <div className="space-y-2">
              <Label htmlFor="action-note">
                Ghi chú {actionTarget?.action === 'reject' ? <span className="text-destructive">(bắt buộc)</span> : '(tuỳ chọn)'}
              </Label>
              <Textarea id="action-note" value={actionNote} onChange={(e) => setActionNote(e.target.value)} rows={3} placeholder={actionTarget?.action === 'reject' ? 'VD: Sai TT tài khoản, nghi ngờ gian lận...' : 'Tuỳ chọn'} />
            </div>
          )}
          {actionTarget?.action === 'mark-transferred' && (
            <p className="text-sm text-muted-foreground">
              Bạn đã chuyển khoản số tiền trên đến TK người nhận? Sau khi xác nhận, lệnh sẽ chuyển sang trạng thái &ldquo;Đã chuyển&rdquo; (final).
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)} disabled={isActing}>Huỷ</Button>
            <Button
              variant={actionTarget?.action === 'reject' ? 'destructive' : 'default'}
              onClick={submitAction}
              disabled={isActing}
            >
              {isActing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {actionTarget?.action === 'approve' && 'Duyệt'}
              {actionTarget?.action === 'reject' && 'Từ chối'}
              {actionTarget?.action === 'mark-transferred' && 'Xác nhận'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
