'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Building2, Search, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getHtxReconciliation, type HtxReconRow, type HtxReconTotals } from '@/lib/api';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';

const fmt = (v: number) => new Intl.NumberFormat('vi-VN').format(v ?? 0);

export default function HtxReconciliationPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [range, setRange] = React.useState<DateRange>(PRESETS[2].range()); // tháng này
  const [search, setSearch] = React.useState('');
  const [rows, setRows] = React.useState<HtxReconRow[]>([]);
  const [totals, setTotals] = React.useState<HtxReconTotals | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getHtxReconciliation(range.from, range.to);
      setRows(res.data);
      setTotals(res.totals);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được đối soát HTX', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, toast]);

  React.useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const cols: Array<{ key: keyof HtxReconRow; label: string; className?: string }> = [
    { key: 'grossRevenue', label: 'Doanh thu gộp' },
    { key: 'totalVat', label: 'VAT tổng' },
    { key: 'htxCommission', label: 'HH HTX' },
    { key: 'htxVatRemit', label: 'VAT HTX' },
    { key: 'htxTotalReceived', label: 'Tổng HTX nhận', className: 'text-purple-700 dark:text-purple-400 font-semibold' },
    { key: 'vigoCommission', label: 'HH VIGO' },
    { key: 'vigoVatRemit', label: 'VAT VIGO' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Building2 className="h-6 w-6" /> Đối soát HTX
        </h1>
        <p className="text-sm text-muted-foreground">
          Doanh thu &amp; chia tiền theo từng HTX trong kỳ. Bấm 1 HTX để xem chi tiết từng chuyến.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <FinanceFilter value={range} onChange={setRange} isLoading={loading} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 max-w-md" placeholder="Lọc theo tên HTX..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">HTX</TableHead>
                <TableHead className="text-right whitespace-nowrap">Số chuyến</TableHead>
                {cols.map((c) => <TableHead key={c.key} className="text-right whitespace-nowrap">{c.label}</TableHead>)}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={cols.length + 3} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={cols.length + 3} className="h-24 text-center text-muted-foreground">Không có HTX nào khớp.</TableCell></TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/htx-reconciliation/detail?id=${encodeURIComponent(r.id)}`)}>
                    <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.bookingCount}</TableCell>
                    {cols.map((c) => <TableCell key={c.key} className={`text-right tabular-nums whitespace-nowrap ${c.className ?? ''}`}>{fmt(r[c.key] as number)}</TableCell>)}
                    <TableCell className="text-right"><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {totals && !loading && filtered.length > 0 && (
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell className="whitespace-nowrap">TỔNG</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.bookingCount}</TableCell>
                  {cols.map((c) => <TableCell key={c.key} className="text-right tabular-nums whitespace-nowrap">{fmt(totals[c.key as keyof HtxReconTotals] as number)}</TableCell>)}
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">Đơn vị: đồng (đ). Doanh thu gộp = tổng tiền khách trả (gồm VAT). Tổng HTX nhận = HH HTX + VAT HTX + PIT giữ hộ.</p>
    </div>
  );
}
