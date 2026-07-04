'use client';

import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  Receipt,
  RotateCcw,
  Search,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  getAdminContractPdfBlob,
  getAdminInvoices,
  getTransportCompanyList,
  type AdminInvoiceRow,
} from '@/lib/api';
import type { TransportCompany } from '@/lib/types';
import { downloadXlsx } from '@/lib/csv';
import {
  INVOICE_EXPORT_HEADERS,
  buildInvoiceExportAoa,
  buildInvoiceServiceText,
  formatInvoiceCurrency,
  formatInvoiceDateOnly,
  getInvoiceExportFileName,
} from './invoice-utils';

const ALL_TC = '__ALL__';
const EXPORT_PAGE_SIZE = 1000;

export default function InvoicesPage() {
  const { toast } = useToast();
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [transportCompanyId, setTransportCompanyId] = React.useState<string>('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const [rows, setRows] = React.useState<AdminInvoiceRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isExporting, setIsExporting] = React.useState(false);

  const [companies, setCompanies] = React.useState<TransportCompany[]>([]);

  // Load transport-company options once for the dropdown.
  React.useEffect(() => {
    getTransportCompanyList()
      .then(setCompanies)
      .catch(() => { /* non-fatal — dropdown stays empty */ });
  }, []);

  // Reset to page 1 whenever any filter changes.
  React.useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, search, transportCompanyId, pageSize]);

  const getInvoiceQuery = React.useCallback(
    (pagination: { page: number; limit: number }) => ({
      ...pagination,
      from: fromDate || undefined,
      to: toDate || undefined,
      search: search.trim() || undefined,
      transportCompanyId: transportCompanyId || undefined,
    }),
    [fromDate, toDate, search, transportCompanyId],
  );

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getAdminInvoices(getInvoiceQuery({ page, limit: pageSize }));
      setRows(response.data);
      setTotal(response.meta?.total ?? 0);
      setTotalPages(Math.max(1, response.meta?.totalPages ?? 1));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được hoá đơn', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, getInvoiceQuery, toast]);

  // Debounce: search input fires keystroke-by-keystroke; the other filters are dropdown/date so
  // they don't need debounce but the timer captures them uniformly.
  React.useEffect(() => {
    const timer = setTimeout(load, 350);
    return () => clearTimeout(timer);
  }, [load]);

  const resetFilters = () => {
    setFromDate('');
    setToDate('');
    setSearch('');
    setTransportCompanyId('');
  };

  const [downloadingContractId, setDownloadingContractId] = React.useState<string | null>(null);

  const downloadContract = React.useCallback(
    async (bookingId: string) => {
      setDownloadingContractId(bookingId);
      try {
        const blob = await getAdminContractPdfBlob(bookingId);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `contract-${bookingId}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Không tải được hợp đồng',
          description: err?.message,
        });
      } finally {
        setDownloadingContractId(null);
      }
    },
    [toast],
  );

  const exportInvoices = React.useCallback(async () => {
    setIsExporting(true);
    try {
      const firstPage = await getAdminInvoices(getInvoiceQuery({ page: 1, limit: EXPORT_PAGE_SIZE }));
      const exportRows = [...firstPage.data];
      const exportTotalPages = Math.max(1, firstPage.meta?.totalPages ?? 1);

      for (let nextPage = 2; nextPage <= exportTotalPages; nextPage += 1) {
        const response = await getAdminInvoices(getInvoiceQuery({ page: nextPage, limit: EXPORT_PAGE_SIZE }));
        exportRows.push(...response.data);
      }

      await downloadXlsx(
        getInvoiceExportFileName({ from: fromDate, to: toDate }),
        INVOICE_EXPORT_HEADERS,
        buildInvoiceExportAoa(exportRows),
        'Hoá đơn',
      );

      toast({
        title: 'Đã xuất Excel',
        description: `Đã xuất ${exportRows.length} hoá đơn theo bộ lọc hiện tại.`,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không xuất được Excel', description: err.message });
    } finally {
      setIsExporting(false);
    }
  }, [fromDate, getInvoiceQuery, toDate, toast]);

  const hasFilters = Boolean(fromDate || toDate || search || transportCompanyId);
  const pageTotalAmount = rows.reduce((sum, r) => sum + (r.totalWithVat ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Receipt className="h-6 w-6" />
            Hoá đơn
          </h1>
          <p className="text-sm text-muted-foreground">
            Danh sách hoá đơn chuyến đi (chỉ chuyến đã hoàn thành). Filter theo ngày, HTX, mã chuyến hoặc biển số.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          {total} chuyến · {formatInvoiceCurrency(pageTotalAmount)} (trang này)
        </Badge>
      </div>

      <Card className="p-4">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-from" className="text-xs text-muted-foreground">Từ ngày</Label>
              <Input id="invoice-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-to" className="text-xs text-muted-foreground">Đến ngày</Label>
              <Input id="invoice-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">HTX</Label>
              <Select
                value={transportCompanyId || ALL_TC}
                onValueChange={(v) => setTransportCompanyId(v === ALL_TC ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="Tất cả HTX" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TC}>Tất cả HTX</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-search" className="text-xs text-muted-foreground">Mã chuyến / Biển số</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="invoice-search"
                  className="pl-9"
                  placeholder="VD: 29A hoặc UUID prefix..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <RotateCcw className="mr-1 h-4 w-4" /> Đặt lại bộ lọc
              </Button>
            )}
            <Button onClick={exportInvoices} disabled={isLoading || isExporting || total === 0} className="w-full sm:w-auto">
              {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Xuất Excel
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Ngày hoàn thành</TableHead>
              <TableHead>Dịch vụ</TableHead>
              <TableHead className="text-right">Thành tiền (gồm VAT)</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead>Biển số xe</TableHead>
              <TableHead>Tên DVVT</TableHead>
              <TableHead>Xuất hoá đơn</TableHead>
              <TableHead className="text-center whitespace-nowrap">Hợp đồng</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  Không có chuyến đi nào khớp bộ lọc.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((trip) => (
                <TableRow key={trip.id}>
                  <TableCell className="whitespace-nowrap">{formatInvoiceDateOnly(trip.tripDate)}</TableCell>
                  <TableCell className="max-w-[480px] text-sm">{buildInvoiceServiceText(trip)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatInvoiceCurrency(trip.totalWithVat)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInvoiceCurrency(trip.vat)}
                  </TableCell>
                  <TableCell className="font-mono">{trip.vehiclePlate}</TableCell>
                  <TableCell>{trip.transportCompanyName}</TableCell>
                  <TableCell className="text-sm align-top">
                    {trip.vatInfo?.companyName ? (
                      <div className="space-y-0.5 min-w-[200px]">
                        <div className="font-medium">{trip.vatInfo.companyName}</div>
                        <div className="text-muted-foreground text-xs">
                          MST: {trip.vatInfo.taxCode ?? "—"}
                        </div>
                        {trip.vatInfo.companyAddress ? (
                          <div className="text-muted-foreground text-xs">
                            {trip.vatInfo.companyAddress}
                          </div>
                        ) : null}
                        {trip.vatInfo.invoiceEmail ? (
                          <div className="text-muted-foreground text-xs">
                            {trip.vatInfo.invoiceEmail}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Khách lẻ</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Tải hợp đồng"
                      aria-label="Tải hợp đồng"
                      onClick={() => downloadContract(trip.id)}
                      disabled={downloadingContractId === trip.id}
                    >
                      {downloadingContractId === trip.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-3 border-t px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Hiển thị</span>
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger className="h-8 w-[74px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span>/ {total} kết quả</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Trang {page} / {totalPages}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(1)} disabled={page <= 1 || isLoading}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isLoading}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isLoading}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(totalPages)} disabled={page >= totalPages || isLoading}>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
