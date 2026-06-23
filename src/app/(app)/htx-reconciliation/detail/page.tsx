'use client';

import * as React from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Building2, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getHtxTrips, type HtxTripRow, type HtxReconTotals } from '@/lib/api';
import { downloadXlsx } from '@/lib/csv';
import { FinanceFilter, PRESETS, type DateRange } from '../../finance/components/finance-filter';
import { expandHtxRow, HTX_LEAF_COLS, leafExportLabel, HTX_PAYMENT_LABEL } from '../htx-recon-shared';
import { HtxHeadTailRow1, HtxHeadLowerRows, HtxLeafCells } from '../htx-recon-table';

const fmtVnTime = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

// Leading (non-financial) columns: STT, Mã chuyến, Ngày giờ, Tài xế, Biển số xe, TÊN HTX/ĐVCCX, Hình thức TT
const LEADING = 7;
const TOTAL_COLS = LEADING + HTX_LEAF_COLS.length;

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

  const handleExport = async () => {
    if (trips.length === 0) { toast({ title: 'Không có dữ liệu để xuất' }); return; }
    const header = ['STT', 'Mã chuyến', 'Ngày giờ', 'Tài xế', 'SĐT', 'Biển số xe', 'TÊN HTX/ĐVCCX', 'Hình thức TT', ...HTX_LEAF_COLS.map(leafExportLabel)];
    const body: Array<Array<string | number>> = trips.map((t, i) => {
      const ex = expandHtxRow(t);
      return [i + 1, t.bookingId, fmtVnTime(t.createdAt), t.driverName, t.driverPhone, t.plate, name, HTX_PAYMENT_LABEL, ...HTX_LEAF_COLS.map((c) => ex[c.key])];
    });
    if (totals) {
      const ex = expandHtxRow(totals);
      body.push(['', 'TỔNG', '', '', '', '', '', '', ...HTX_LEAF_COLS.map((c) => ex[c.key])]);
    }
    const safeName = (name || 'htx').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase();
    await downloadXlsx(`doi-soat-${safeName}_${range.from}_${range.to}.xlsx`, header, body, 'Đối soát HTX');
  };

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
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">{trips.length} chuyến</Badge>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || trips.length === 0}>
            <Download className="mr-1.5 h-4 w-4" /> Xuất Excel
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <FinanceFilter value={range} onChange={setRange} isLoading={loading} />
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={4} className="align-bottom whitespace-nowrap">STT</TableHead>
                <TableHead rowSpan={4} className="align-bottom whitespace-nowrap">Mã chuyến</TableHead>
                <TableHead rowSpan={4} className="align-bottom whitespace-nowrap">Ngày giờ</TableHead>
                <TableHead rowSpan={4} className="align-bottom whitespace-nowrap">Tài xế</TableHead>
                <TableHead rowSpan={4} className="align-bottom whitespace-nowrap">Biển số xe</TableHead>
                <TableHead rowSpan={4} className="align-bottom whitespace-nowrap">TÊN HTX/ĐVCCX</TableHead>
                <TableHead rowSpan={4} className="align-bottom whitespace-nowrap">Hình thức TT</TableHead>
                <HtxHeadTailRow1 />
              </TableRow>
              <HtxHeadLowerRows />
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={TOTAL_COLS} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
              ) : trips.length === 0 ? (
                <TableRow><TableCell colSpan={TOTAL_COLS} className="h-24 text-center text-muted-foreground">Không có chuyến nào trong kỳ.</TableCell></TableRow>
              ) : (
                trips.map((t, i) => (
                  <TableRow key={t.bookingId}>
                    <TableCell className="tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{t.bookingId}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtVnTime(t.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">{t.driverName || '—'}</div>
                      <div className="text-xs text-muted-foreground">{t.driverPhone || '—'}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs uppercase whitespace-nowrap">{t.plate || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{name || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{HTX_PAYMENT_LABEL}</TableCell>
                    <HtxLeafCells row={expandHtxRow(t)} />
                  </TableRow>
                ))
              )}
            </TableBody>
            {totals && !loading && trips.length > 0 && (
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
        Đơn vị: đồng (đ). Tổng khách trả = Giá cước trước VAT + VAT, và luôn bằng (Tài xế thực nhận + HTX, ĐVCCX nhận + VIGO nhận).
      </p>
    </div>
  );
}
