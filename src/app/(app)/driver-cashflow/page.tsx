'use client';

import * as React from 'react';
import { Loader2, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Wallet, ArrowUpRight, ArrowDownLeft, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getDriverCashflow, type DriverCashflowRow } from '@/lib/api';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';

const fmtVnd = (v: number) => new Intl.NumberFormat('vi-VN').format(v) + ' đ';
const fmtVnTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));

// key '' = tất cả. Order = how they appear in the filter dropdown.
const CATEGORIES: Array<{ key: string; label: string }> = [
  { key: '', label: 'Tất cả' },
  { key: 'payos', label: 'Nạp PayOS' },
  { key: 'admin_credit', label: 'Admin cộng tay' },
  { key: 'km', label: 'Thưởng KM' },
  { key: 'earnings', label: 'Earnings chuyến' },
  { key: 'refund', label: 'Hoàn tiền' },
  { key: 'admin_debit', label: 'Admin trừ tay' },
  { key: 'commission', label: 'Trừ hoa hồng' },
  { key: 'tax', label: 'Trừ VAT/PIT' },
  { key: 'other', label: 'Khác' },
];
const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.filter((c) => c.key).map((c) => [c.key, c.label]));

const PAGE_SIZES = [10, 20, 50, 100];
const COL_COUNT = 7;

// CSV: quote every field, escape embedded quotes, prefix BOM so Excel reads UTF-8.
const csvCell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number>>) {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DriverCashflowPage() {
  const { toast } = useToast();
  const [range, setRange] = React.useState<DateRange>(PRESETS[0].range());
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [pageSize, setPageSize] = React.useState(20);
  const [page, setPage] = React.useState(1);
  const [rows, setRows] = React.useState<DriverCashflowRow[]>([]);
  const [meta, setMeta] = React.useState<{ total: number; totalPages: number; totalIn: number; totalOut: number }>({ total: 0, totalPages: 1, totalIn: 0, totalOut: 0 });
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => { setPage(1); }, [range, search, category, pageSize]);

  // Export ALL rows matching the current filters (not just the page on screen):
  // page through the API (200/req) until everything is collected, then build CSV.
  const handleExport = async () => {
    setExporting(true);
    try {
      const all: DriverCashflowRow[] = [];
      const LIMIT = 200;
      for (let p = 1; p <= 1000; p++) {
        const res = await getDriverCashflow({ from: range.from, to: range.to, page: p, limit: LIMIT, search: search || undefined, category: category || undefined });
        all.push(...res.data);
        if (all.length >= res.meta.total || res.data.length < LIMIT) break;
      }
      if (all.length === 0) { toast({ title: 'Không có dữ liệu để xuất' }); return; }
      downloadCsv(
        `dong-tien-tai-xe_${range.from}_${range.to}.csv`,
        ['Thời gian (VN)', 'Tài xế', 'SĐT', 'HTX', 'Biển số', 'Loại', 'Chiều', 'Số tiền (đ)', 'Mã GD', 'Diễn giải'],
        all.map((r) => [
          fmtVnTime(r.createdAt),
          r.driverName, r.driverPhone, r.htxName, r.plate,
          CAT_LABEL[r.category] ?? 'Khác',
          r.direction === 'in' ? 'Vào' : 'Ra',
          r.amount,
          r.category === 'payos' ? r.refCode : '',
          r.description,
        ]),
      );
      toast({ title: `Đã xuất ${all.length} dòng` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Xuất CSV thất bại', description: err.message });
    } finally {
      setExporting(false);
    }
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDriverCashflow({ from: range.from, to: range.to, page, limit: pageSize, search: search || undefined, category: category || undefined });
      setRows(res.data);
      setMeta({ total: res.meta.total, totalPages: res.meta.totalPages, totalIn: res.meta.totalIn, totalOut: res.meta.totalOut });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được dòng tiền tài xế', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, page, pageSize, search, category, toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Wallet className="h-6 w-6" /> Dòng tiền tài xế
          </h1>
          <p className="text-sm text-muted-foreground">
            Mọi khoản tiền vào/ra ví tài xế: nạp PayOS, thưởng KM, earnings, admin cộng/trừ, hoàn, hoa hồng, VAT/PIT.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-green-700 dark:text-green-400"><ArrowDownLeft className="h-3.5 w-3.5" /> Vào {fmtVnd(meta.totalIn)}</Badge>
          <Badge variant="secondary" className="gap-1 text-red-600"><ArrowUpRight className="h-3.5 w-3.5" /> Ra {fmtVnd(meta.totalOut)}</Badge>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || loading}>
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            Xuất CSV (tất cả)
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <FinanceFilter value={range} onChange={setRange} isLoading={loading} />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <Button key={c.key} variant={category === c.key ? 'default' : 'outline'} size="sm" disabled={loading} onClick={() => setCategory(c.key)}>
              {c.label}
            </Button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 max-w-md" placeholder="Tìm theo tên / SĐT tài xế / HTX / biển số..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Thời gian (VN)</TableHead>
              <TableHead>Tài xế</TableHead>
              <TableHead>HTX</TableHead>
              <TableHead>Biển số</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Mã GD</TableHead>
              <TableHead className="text-right">Số tiền</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={COL_COUNT} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={COL_COUNT} className="h-24 text-center text-muted-foreground">Không có giao dịch nào khớp bộ lọc.</TableCell></TableRow>
            ) : (
              rows.map((r) => {
                const isIn = r.direction === 'in';
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{fmtVnTime(r.createdAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.driverName || '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.driverPhone || '—'}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.htxName || '—'}</TableCell>
                    <TableCell className="font-mono text-xs uppercase">{r.plate || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={isIn ? 'border-green-300 text-green-700 dark:text-green-400' : 'border-red-300 text-red-600'}>
                        {CAT_LABEL[r.category] ?? 'Khác'}
                      </Badge>
                      {r.description && <div className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground" title={r.description}>{r.description}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.category === 'payos' ? (r.refCode || '—') : '—'}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${isIn ? 'text-green-600 dark:text-green-400' : 'text-red-600'}`}>
                      {isIn ? '+' : '−'}{fmtVnd(r.amount)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Trang {page} / {meta.totalPages} · {meta.total} giao dịch</span>
            <span className="mx-1">·</span>
            <label className="flex items-center gap-1">
              Hiện
              <select className="h-8 rounded-md border bg-background px-2 text-sm" value={pageSize} disabled={loading} onChange={(e) => setPageSize(Number(e.target.value))}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              / trang
            </label>
          </div>
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
