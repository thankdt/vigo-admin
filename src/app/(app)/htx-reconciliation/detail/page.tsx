'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Building2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getHtxTrips, type HtxTripRow, type HtxReconTotals } from '@/lib/api';
import { FinanceFilter, PRESETS, type DateRange } from '../../finance/components/finance-filter';

const fmt = (v: number) => new Intl.NumberFormat('vi-VN').format(v ?? 0);
const fmtVnTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export default function HtxDetailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = searchParams.get('id') ?? '';
  const [range, setRange] = React.useState<DateRange>(PRESETS[2].range());
  const [name, setName] = React.useState('');
  const [trips, setTrips] = React.useState<HtxTripRow[]>([]);
  const [totals, setTotals] = React.useState<HtxReconTotals | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await getHtxTrips(id, range.from, range.to);
      setName(res.htx.name);
      setTrips(res.trips);
      setTotals(res.totals);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được chi tiết HTX', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [id, range.from, range.to, toast]);

  React.useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const cols: Array<{ key: keyof HtxTripRow; label: string; className?: string }> = [
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
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => router.push('/htx-reconciliation')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Building2 className="h-6 w-6" /> {name || 'HTX'}
          </h1>
          <p className="text-sm text-muted-foreground">Chi tiết từng chuyến của HTX trong kỳ.</p>
        </div>
        <Badge variant="secondary" className="ml-auto">{trips.length} chuyến</Badge>
      </div>

      <Card className="p-4">
        <FinanceFilter value={range} onChange={setRange} isLoading={loading} />
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Thời gian (VN)</TableHead>
                <TableHead>Tài xế</TableHead>
                <TableHead>Biển số</TableHead>
                {cols.map((c) => <TableHead key={c.key} className="text-right whitespace-nowrap">{c.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={cols.length + 3} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
              ) : trips.length === 0 ? (
                <TableRow><TableCell colSpan={cols.length + 3} className="h-24 text-center text-muted-foreground">Không có chuyến nào trong kỳ.</TableCell></TableRow>
              ) : (
                trips.map((t) => (
                  <TableRow key={t.bookingId}>
                    <TableCell className="whitespace-nowrap">{fmtVnTime(t.createdAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{t.driverName || '—'}</div>
                      <div className="text-xs text-muted-foreground">{t.driverPhone || '—'}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs uppercase">{t.plate || '—'}</TableCell>
                    {cols.map((c) => <TableCell key={c.key} className={`text-right tabular-nums whitespace-nowrap ${c.className ?? ''}`}>{fmt(t[c.key] as number)}</TableCell>)}
                  </TableRow>
                ))
              )}
            </TableBody>
            {totals && !loading && trips.length > 0 && (
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell colSpan={3} className="whitespace-nowrap">TỔNG</TableCell>
                  {cols.map((c) => <TableCell key={c.key} className="text-right tabular-nums whitespace-nowrap">{fmt(totals[c.key as keyof HtxReconTotals] as number)}</TableCell>)}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">Đơn vị: đồng (đ). Tổng HTX nhận = HH HTX + VAT HTX + PIT giữ hộ.</p>
    </div>
  );
}
