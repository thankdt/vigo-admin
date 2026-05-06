'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Share2, ChevronLeft, ChevronRight, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  adminListReferrals,
  adminGetReferralDetail,
  adminClawbackReferralEvent,
  type AdminReferralRow,
  type AdminReferralDetail,
} from '@/lib/api';

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

export default function ReferralsPage() {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<AdminReferralRow[]>([]);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  const [detail, setDetail] = React.useState<AdminReferralDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [clawbackTarget, setClawbackTarget] = React.useState<{ eventId: string; amount: number; type: string } | null>(null);
  const [clawbackReason, setClawbackReason] = React.useState('');
  const [isClawingBack, setIsClawingBack] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await adminListReferrals({ page, limit: 20 });
      setRows(result.data);
      setTotalPages(result.meta.totalPages || 1);
      setTotal(result.meta.total);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được danh sách', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [page, toast]);

  React.useEffect(() => { load(); }, [load]);

  const openDetail = async (row: AdminReferralRow) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await adminGetReferralDetail(row.id);
      setDetail(d);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: err.message });
    } finally {
      setDetailLoading(false);
    }
  };

  const submitClawback = async () => {
    if (!clawbackTarget || !clawbackReason.trim()) return;
    setIsClawingBack(true);
    try {
      await adminClawbackReferralEvent(clawbackTarget.eventId, clawbackReason.trim());
      toast({ title: 'Đã clawback', description: `Đã hoàn ${formatVND(clawbackTarget.amount)} từ chủ link.` });
      setClawbackTarget(null);
      setClawbackReason('');
      // Reload detail + list to reflect updated totals.
      if (detail) {
        const refreshed = await adminGetReferralDetail(detail.id);
        setDetail(refreshed);
      }
      load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Clawback thất bại', description: err.message });
    } finally {
      setIsClawingBack(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Share2 className="h-6 w-6" /> Affiliate / Giới thiệu bạn bè
        </h1>
        <p className="text-sm text-muted-foreground">
          Mỗi mối quan hệ giới thiệu hiển thị tổng tiền chủ link đã nhận. Click để xem từng giao dịch + clawback nếu phát hiện gian lận.
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chủ link</TableHead>
              <TableHead>Người được mời</TableHead>
              <TableHead>Mã</TableHead>
              <TableHead className="text-right">Số chuyến</TableHead>
              <TableHead className="text-right">Tổng tiền</TableHead>
              <TableHead>Bonus signup</TableHead>
              <TableHead>Ngày</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">Chưa có giới thiệu nào.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => openDetail(r)}>
                  <TableCell>
                    <div className="font-medium">{r.referrer.fullName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{r.referrer.phone}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.referee.fullName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{r.referee.phone}</div>
                  </TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.codeUsed}</code></TableCell>
                  <TableCell className="text-right tabular-nums">{r.tripCountUsed}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatVND(r.tripRewardTotal)}</TableCell>
                  <TableCell>
                    {r.signupRewardCredited
                      ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">Đã trả</Badge>
                      : <Badge variant="secondary">Chưa</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(r); }}>Chi tiết</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-muted-foreground">{total} mối quan hệ</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Trang {page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || isLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages || isLoading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      {/* Detail dialog with event log + clawback */}
      <Dialog open={!!detail || detailLoading} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chi tiết giới thiệu</DialogTitle>
            {detail && (
              <DialogDescription>
                <span className="font-medium">{detail.referrer.fullName ?? detail.referrer.phone}</span> →{' '}
                <span className="font-medium">{detail.referee.fullName ?? detail.referee.phone}</span> · mã{' '}
                <code className="bg-muted px-1.5 py-0.5 rounded">{detail.codeUsed}</code>
              </DialogDescription>
            )}
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-muted/50 rounded p-2"><div className="text-muted-foreground text-xs">Số chuyến</div><div className="font-bold">{detail.tripCountUsed}</div></div>
                <div className="bg-muted/50 rounded p-2"><div className="text-muted-foreground text-xs">Tiền trip</div><div className="font-bold">{formatVND(detail.tripRewardTotal)}</div></div>
                <div className="bg-muted/50 rounded p-2"><div className="text-muted-foreground text-xs">Bonus signup</div><div className="font-bold">{detail.signupRewardCredited ? 'Đã trả' : 'Chưa'}</div></div>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Lịch sử giao dịch</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loại</TableHead>
                      <TableHead className="text-right">Số tiền</TableHead>
                      <TableHead>Booking</TableHead>
                      <TableHead>Ngày</TableHead>
                      <TableHead className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.events.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-16 text-center text-muted-foreground">Chưa có giao dịch.</TableCell></TableRow>
                    ) : detail.events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <Badge variant={e.type === 'CLAWBACK' ? 'destructive' : 'secondary'}>{e.type}</Badge>
                        </TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${e.amount < 0 ? 'text-red-600' : ''}`}>{formatVND(e.amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{e.bookingId ? e.bookingId.slice(0, 8) + '...' : '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString('vi-VN')}</TableCell>
                        <TableCell className="text-right">
                          {e.type !== 'CLAWBACK' && Number(e.amount) > 0 && (
                            <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => setClawbackTarget({ eventId: e.id, amount: e.amount, type: e.type })}>
                              <Undo2 className="h-3.5 w-3.5 mr-1" /> Clawback
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clawback confirm dialog */}
      <Dialog open={!!clawbackTarget} onOpenChange={(open) => { if (!open && !isClawingBack) { setClawbackTarget(null); setClawbackReason(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clawback giao dịch</DialogTitle>
            <DialogDescription>
              Hoàn lại <span className="font-medium">{clawbackTarget && formatVND(clawbackTarget.amount)}</span> ({clawbackTarget?.type}) từ chủ link về system. Hành động này được ghi audit và không thể tự undo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="clawback-reason">Lý do (bắt buộc)</Label>
            <Input id="clawback-reason" value={clawbackReason} onChange={(e) => setClawbackReason(e.target.value)} placeholder="VD: Phát hiện account giả, IP trùng..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClawbackTarget(null)} disabled={isClawingBack}>Huỷ</Button>
            <Button variant="destructive" onClick={submitClawback} disabled={isClawingBack || !clawbackReason.trim()}>
              {isClawingBack && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận clawback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
