'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2, PackageOpen, ChevronLeft, ChevronRight, Search, Ban, Eye, MapPin, User as UserIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  adminListAgentOrders, adminVoidAgentOrder, type AdminAgentOrder,
} from '@/lib/api';

type Status = AdminAgentOrder['status'];

const STATUS_META: Record<Status, { label: string; className: string }> = {
  DRAFT: { label: 'Nháp', className: 'bg-gray-100 text-gray-700 hover:bg-gray-100' },
  SEARCHING: { label: 'Đang tìm xe', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
  ACCEPTED: { label: 'Đã nhận', className: 'bg-blue-100 text-blue-800 hover:bg-blue-100' },
  IN_PROGRESS: { label: 'Đang chạy', className: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100' },
  COMPLETED: { label: 'Hoàn thành', className: 'bg-green-100 text-green-800 hover:bg-green-100' },
  CANCELLED: { label: 'Đã huỷ', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
};

const fmtVnd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`);
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—');

export default function AgentOrdersAdminPage() {
  const { toast } = useToast();

  const [rows, setRows] = React.useState<AdminAgentOrder[]>([]);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | Status>('ALL');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  const [detail, setDetail] = React.useState<AdminAgentOrder | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<AdminAgentOrder | null>(null);
  const [voidReason, setVoidReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await adminListAgentOrders({
        page, limit: 20,
        search: search || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });
      const tp = result.meta.totalPages || 1;
      if (page > tp) { setPage(tp); return; }
      setRows(result.data);
      setTotalPages(tp);
      setTotal(result.meta.total);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được đơn', description: parseErr(err.message) });
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
  }, [load]);

  const doVoid = async () => {
    if (!voidTarget) return;
    setSubmitting(true);
    try {
      await adminVoidAgentOrder(voidTarget.id, voidReason.trim() || undefined);
      toast({ title: 'Đã huỷ đơn hoàn thành', description: 'Đã thu hồi hoa hồng đại lý.' });
      setVoidTarget(null);
      setVoidReason('');
      await load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Void thất bại', description: parseErr(err.message) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PackageOpen className="h-6 w-6" /> Đơn đặt hộ
        </h1>
        <p className="text-sm text-muted-foreground">
          Xem toàn bộ chuyến đặt hộ. Void đơn đã hoàn thành để thu hồi hoa hồng khi cần.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Số HĐ, tên/SĐT đại lý·tài xế·khách..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Trạng thái</Label>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
              {(Object.keys(STATUS_META) as Status[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Đơn</TableHead>
                <TableHead>Đại lý</TableHead>
                <TableHead>Tài xế</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Cước</TableHead>
                <TableHead className="text-right">Hoa hồng</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Không có đơn nào khớp bộ lọc.</TableCell></TableRow>
              ) : (
                rows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="font-medium">{o.contractNumber || o.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.billingMode === 'BAO' ? 'Bao xe' : 'Đi ghép'} · {o.passengers.length} khách · {fmtDate(o.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{o.agentName || '—'}</div>
                      <div className="text-xs text-muted-foreground">{o.agentPhone || '—'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{o.driverName || <span className="text-muted-foreground">chưa có</span>}</div>
                      <div className="text-xs text-muted-foreground">{o.driverPhone || ''}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_META[o.status].className}>
                        {STATUS_META[o.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtVnd(o.totalFare)}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">{fmtVnd(o.commissionAmount)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-8" onClick={() => setDetail(o)}>
                          <Eye className="mr-1 h-3.5 w-3.5" /> Chi tiết
                        </Button>
                        {o.status === 'COMPLETED' && (
                          <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => { setVoidTarget(o); setVoidReason(''); }}>
                            <Ban className="mr-1 h-3.5 w-3.5" /> Void
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-muted-foreground">{total} đơn</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Trang {page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || isLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages || isLoading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.contractNumber || detail?.id.slice(0, 8)}</DialogTitle>
            <DialogDescription>
              {detail && `${detail.billingMode === 'BAO' ? 'Bao xe' : 'Đi ghép'} · ${STATUS_META[detail.status].label} · ${fmtDate(detail.createdAt)}`}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Info label="Đại lý" value={`${detail.agentName || '—'}${detail.agentPhone ? ` · ${detail.agentPhone}` : ''}`} />
                <Info label="Tài xế" value={detail.driverName ? `${detail.driverName}${detail.driverPhone ? ` · ${detail.driverPhone}` : ''}` : 'chưa có'} />
                <Info label="Khách liên hệ" value={detail.customerName ? `${detail.customerName}${detail.customerPhone ? ` · ${detail.customerPhone}` : ''}` : '—'} />
                <Info label="Thanh toán" value={detail.paymentMethod || '—'} />
                <Info label="Tổng cước" value={fmtVnd(detail.totalFare)} />
                <Info label="Hoa hồng" value={fmtVnd(detail.commissionAmount)} />
                <Info label="Số chỗ cần" value={String(detail.capacityRequired)} />
                <Info label="Hoàn thành" value={fmtDate(detail.completedAt)} />
              </div>

              <div>
                <div className="mb-1 flex items-center gap-1 font-medium"><MapPin className="h-4 w-4" /> Các điểm ({detail.waypoints.length})</div>
                <ol className="list-decimal pl-5 space-y-0.5 text-muted-foreground">
                  {detail.waypoints.map((w, i) => (
                    <li key={i}><span className="text-foreground">{w.label ? `${w.label} — ` : ''}{w.address}</span></li>
                  ))}
                </ol>
              </div>

              <div>
                <div className="mb-1 flex items-center gap-1 font-medium"><UserIcon className="h-4 w-4" /> Khách ({detail.passengers.length})</div>
                <ul className="space-y-1">
                  {detail.passengers.map((p, i) => (
                    <li key={i} className="rounded border px-2 py-1">
                      <span className="font-medium">{p.name}</span> · {p.phone}
                      <span className="text-muted-foreground"> — đón đ.{p.pickupIdx + 1} → trả đ.{p.dropoffIdx + 1}</span>
                      {p.note ? <div className="text-xs text-muted-foreground">Ghi chú: {p.note}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void confirm */}
      <Dialog open={!!voidTarget} onOpenChange={(open) => { if (!open && !submitting) { setVoidTarget(null); setVoidReason(''); } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void đơn hoàn thành</DialogTitle>
            <DialogDescription>
              {voidTarget && `Huỷ đơn ${voidTarget.contractNumber || voidTarget.id.slice(0, 8)} và thu hồi hoa hồng ${fmtVnd(voidTarget.commissionAmount)} đã trả cho đại lý.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Lý do (tuỳ chọn)</Label>
            <Textarea rows={2} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="VD: đơn gian lận, nhập nhầm..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVoidTarget(null); setVoidReason(''); }} disabled={submitting}>Huỷ</Button>
            <Button variant="destructive" onClick={doVoid} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Void & thu hồi hoa hồng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function parseErr(msg: string): string {
  try {
    const o = JSON.parse(msg);
    return o?.error?.message || o?.message || msg;
  } catch {
    return msg;
  }
}
