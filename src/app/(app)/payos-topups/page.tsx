'use client';

import * as React from 'react';
import { Loader2, Search, Banknote, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getPayosTopUps, type PayosTopUp } from '@/lib/api';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';

const fmtVnd = (v: number) => new Intl.NumberFormat('vi-VN').format(v) + ' đ';
// Always render in VN time regardless of the admin's browser timezone.
const fmtVnTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));

const PAGE_SIZE = 20;

export default function PayosTopUpsPage() {
  const { toast } = useToast();
  const [range, setRange] = React.useState<DateRange>(PRESETS[2].range()); // default: this month
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [rows, setRows] = React.useState<PayosTopUp[]>([]);
  const [meta, setMeta] = React.useState<{ total: number; totalPages: number; totalAmount: number }>({ total: 0, totalPages: 1, totalAmount: 0 });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => { setPage(1); }, [range, search]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPayosTopUps({ from: range.from, to: range.to, page, limit: PAGE_SIZE, search: search || undefined });
      setRows(res.data);
      setMeta({ total: res.meta.total, totalPages: res.meta.totalPages, totalAmount: res.meta.totalAmount });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được dữ liệu nạp PayOS', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, page, search, toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ArrowDownCircle className="h-6 w-6" /> Nạp ví qua PayOS
          </h1>
          <p className="text-sm text-muted-foreground">
            Tiền nạp thật qua cổng thanh toán, map với từng tài xế. Lọc theo thời gian / tên / SĐT.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          {meta.total} lượt · {fmtVnd(meta.totalAmount)} (toàn kỳ)
        </Badge>
      </div>

      <Card className="p-4 space-y-3">
        <FinanceFilter value={range} onChange={setRange} isLoading={loading} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 max-w-md" placeholder="Tìm theo tên / SĐT tài xế..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Thời gian (VN)</TableHead>
              <TableHead>Tài xế</TableHead>
              <TableHead>Mã giao dịch</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Không có lượt nạp PayOS nào khớp bộ lọc.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{fmtVnTime(r.createdAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.driverName || '—'}</div>
                    <div className="text-xs text-muted-foreground">{r.driverPhone || '—'}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.refCode}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-green-600 dark:text-green-400">
                    <span className="inline-flex items-center gap-1"><Banknote className="h-3.5 w-3.5" />{fmtVnd(r.amount)}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-sm text-muted-foreground">Trang {page} / {meta.totalPages} · {meta.total} lượt</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || loading} onClick={() => setPage(1)}><ChevronsLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= meta.totalPages || loading} onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= meta.totalPages || loading} onClick={() => setPage(meta.totalPages)}><ChevronsRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
