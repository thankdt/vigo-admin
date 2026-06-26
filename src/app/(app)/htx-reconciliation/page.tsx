'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Building2, Search, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getHtxReconciliation, type HtxReconRow, type HtxReconTotals } from '@/lib/api';
import { downloadXlsxGrouped } from '@/lib/csv';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';
import { expandHtxRow, HTX_LEAF_COLS, buildHtxExportHeader, HTX_PAYMENT_LABEL } from './htx-recon-shared';
import { HtxHeadTailRow1, HtxHeadLowerRows, HtxLeafCells } from './htx-recon-table';

// Leading (non-financial) columns before the shared 17 financial leaf columns.
const LEADING = 3; // STT, TÊN HTX/ĐVCCX, Hình thức TT
const TOTAL_COLS = LEADING + HTX_LEAF_COLS.length;

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

  const handleExport = async () => {
    if (filtered.length === 0) { toast({ title: 'Không có dữ liệu để xuất' }); return; }
    const { headerRows, merges } = buildHtxExportHeader(['STT', 'TÊN HTX/ĐVCCX', 'Hình thức TT']);
    const body: Array<Array<string | number>> = filtered.map((r, i) => {
      const ex = expandHtxRow(r);
      return [i + 1, r.name, HTX_PAYMENT_LABEL, ...HTX_LEAF_COLS.map((c) => ex[c.key])];
    });
    if (totals) {
      const ex = expandHtxRow(totals);
      body.push(['', 'TỔNG', '', ...HTX_LEAF_COLS.map((c) => ex[c.key])]);
    }
    await downloadXlsxGrouped(`doi-soat-htx_${range.from}_${range.to}.xlsx`, headerRows, merges, body, 'Đối soát HTX');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Building2 className="h-6 w-6" /> Đối soát HTX
          </h1>
          <p className="text-sm text-muted-foreground">
            Doanh thu &amp; chia tiền theo từng HTX trong kỳ. Bấm 1 HTX để xem chi tiết từng chuyến.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || filtered.length === 0}>
          <Download className="mr-1.5 h-4 w-4" /> Xuất Excel
        </Button>
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
                <TableHead rowSpan={4} className="align-bottom whitespace-nowrap">STT</TableHead>
                <TableHead rowSpan={4} className="align-bottom whitespace-nowrap">TÊN HTX/ĐVCCX</TableHead>
                <TableHead rowSpan={4} className="align-bottom whitespace-nowrap">Hình thức TT</TableHead>
                <HtxHeadTailRow1 />
              </TableRow>
              <HtxHeadLowerRows />
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={TOTAL_COLS} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={TOTAL_COLS} className="h-24 text-center text-muted-foreground">Không có HTX nào khớp.</TableCell></TableRow>
              ) : (
                filtered.map((r, i) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/htx-reconciliation/detail?id=${encodeURIComponent(r.id)}`)}>
                    <TableCell className="tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{HTX_PAYMENT_LABEL}</TableCell>
                    <HtxLeafCells row={expandHtxRow(r)} />
                  </TableRow>
                ))
              )}
            </TableBody>
            {totals && !loading && filtered.length > 0 && (
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell colSpan={LEADING} className="whitespace-nowrap">TỔNG</TableCell>
                  <HtxLeafCells row={expandHtxRow(totals)} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">
        Đơn vị: đồng (đ). VAT = 8%. Tổng khách trả = (Cước vận tải HTX + VAT) + (Phí APP trước VAT + VAT), và luôn bằng (Tài xế thực nhận + HTX, ĐVCCX nhận + VIGO nhận).
      </p>
    </div>
  );
}
