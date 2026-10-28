'use client';

import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  ExternalLink,
  Loader2,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { useAuth } from '@/lib/auth-context';
import {
  getAdminContractPdfBlob,
  getAdminInvoices,
  getTransportCompanyList,
  reopenAdminInvoice,
  type AdminInvoiceRow,
} from '@/lib/api';
import type { TransportCompany } from '@/lib/types';
import { downloadXlsx } from '@/lib/csv';
import {
  INVOICE_EXPORT_HEADERS,
  REOPEN_REASON_MAX_LENGTH,
  REOPEN_REASON_MIN_LENGTH,
  buildInvoiceExportAoa,
  buildInvoiceServiceText,
  describeEInvoiceStatus,
  formatInvoiceCurrency,
  formatInvoiceDateOnly,
  formatInvoiceTripDate,
  getInvoiceExportFileName,
  isInvoiceReopenable,
  partitionInvoiceTripsForExport,
  safeExternalHttpsUrl,
  validateReopenInvoiceInput,
  type EInvoiceStatusView,
} from './invoice-utils';

const ALL_TC = '__ALL__';
const EXPORT_PAGE_SIZE = 1000;

const TONE_BADGE_CLASS: Record<EInvoiceStatusView['tone'], string> = {
  none: 'border-slate-200 bg-slate-50 text-slate-600',
  pending: 'border-blue-200 bg-blue-50 text-blue-700',
  submitting: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  submitted: 'border-sky-200 bg-sky-50 text-sky-700',
  issued: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  retryable: 'border-amber-200 bg-amber-50 text-amber-800',
  permanent: 'border-red-200 bg-red-50 text-red-700',
  skipped: 'border-zinc-200 bg-zinc-100 text-zinc-700',
};

export default function InvoicesPage() {
  const { toast } = useToast();
  const { can } = useAuth();
  const canReopenInvoice = can('invoice-reopen');

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

  // State cho dialog mở lại hoá đơn MISA bị kẹt (FAILED_RETRYABLE / FAILED_PERMANENT / SKIPPED).
  const [reopeningTrip, setReopeningTrip] = React.useState<AdminInvoiceRow | null>(null);
  const [reopenReason, setReopenReason] = React.useState('');
  const [confirmNotIssuedManually, setConfirmNotIssuedManually] = React.useState(false);
  const [isReopening, setIsReopening] = React.useState(false);

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

      // Điều kiện chặn C4 (spec §10, runbook §4.4): loại các chuyến đã ISSUED hoặc đang xử lý
      // (PENDING / SUBMITTING / SUBMITTED) trên MISA để kế toán không import Excel tay trùng.
      const { exportable, excludedCount, excludedIssuedCount, excludedInFlightCount } =
        partitionInvoiceTripsForExport(exportRows);

      if (exportable.length === 0) {
        toast({
          title: 'Không có chuyến cần xuất Excel tay',
          description:
            excludedCount > 0
              ? `Đã tự động loại ${excludedCount} chuyến đã phát hành (${excludedIssuedCount}) hoặc đang xử lý (${excludedInFlightCount}) trên MISA để tránh xuất trùng.`
              : 'Không có hoá đơn nào trong bộ lọc hiện tại.',
        });
        return;
      }

      await downloadXlsx(
        getInvoiceExportFileName({ from: fromDate, to: toDate }),
        INVOICE_EXPORT_HEADERS,
        buildInvoiceExportAoa(exportable),
        'Hoá đơn',
      );

      toast({
        title: 'Đã xuất Excel',
        description:
          excludedCount > 0
            ? `Đã xuất ${exportable.length} hoá đơn cần nhập tay (đã loại ${excludedCount} chuyến đã phát hành / đang xử lý trên MISA để tránh xuất trùng).`
            : `Đã xuất ${exportable.length} hoá đơn theo bộ lọc hiện tại.`,
      });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không xuất được Excel', description: err.message });
    } finally {
      setIsExporting(false);
    }
  }, [fromDate, getInvoiceQuery, toDate, toast]);

  const openReopenDialog = React.useCallback((trip: AdminInvoiceRow) => {
    setReopeningTrip(trip);
    setReopenReason('');
    setConfirmNotIssuedManually(false);
  }, []);

  const closeReopenDialog = React.useCallback(() => {
    if (isReopening) return;
    setReopeningTrip(null);
  }, [isReopening]);

  const reopenValidation = validateReopenInvoiceInput(reopenReason, confirmNotIssuedManually);

  const handleReopenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopeningTrip?.invoice) return;
    const check = validateReopenInvoiceInput(reopenReason, confirmNotIssuedManually);
    if (!check.valid) {
      toast({
        variant: 'destructive',
        title: 'Thông tin chưa hợp lệ',
        description: check.error ?? 'Vui lòng kiểm tra lại.',
      });
      return;
    }

    setIsReopening(true);
    try {
      await reopenAdminInvoice(reopeningTrip.invoice.id, {
        reason: check.trimmedReason,
        confirmNotIssuedManually: true,
      });
      toast({
        title: 'Đã mở lại hoá đơn',
        description: `Chuyến ${reopeningTrip.bookingCode} đã chuyển về trạng thái Chờ gửi MISA (PENDING).`,
      });
      setReopeningTrip(null);
      await load();
    } catch (err) {
      toastApiError(err, 'Không mở lại được hoá đơn');
    } finally {
      setIsReopening(false);
    }
  };

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
            Danh sách hoá đơn chuyến đi (chỉ chuyến đã hoàn thành). File Excel xuất tay tự động loại chuyến đã phát hành hoặc đang xử lý trên MISA.
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
              Xuất Excel (chưa phát hành)
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
              <TableHead className="min-w-[220px]">HĐĐT MISA</TableHead>
              <TableHead className="text-center whitespace-nowrap">Hợp đồng</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  Không có chuyến đi nào khớp bộ lọc.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((trip) => {
                const inv = trip.invoice ?? null;
                const statusView = describeEInvoiceStatus(inv);
                const lookupHref = safeExternalHttpsUrl(inv?.lookupUrl);
                const reopenable = isInvoiceReopenable(inv);

                return (
                  <TableRow key={trip.id}>
                    <TableCell className="whitespace-nowrap">{formatInvoiceDateOnly(trip.tripDate)}</TableCell>
                    <TableCell className="max-w-[420px] text-sm">{buildInvoiceServiceText(trip)}</TableCell>
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
                            MST: {trip.vatInfo.taxCode ?? '—'}
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
                    <TableCell className="align-top text-xs" data-testid={`einvoice-cell-${trip.id}`}>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={`font-medium ${TONE_BADGE_CLASS[statusView.tone]}`}
                            data-testid={`einvoice-status-${trip.id}`}
                          >
                            {statusView.label}
                          </Badge>
                          {inv?.invSeries ? (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {inv.invSeries}
                            </span>
                          ) : null}
                          {inv?.invNo ? (
                            <span className="font-mono font-semibold text-foreground" data-testid={`einvoice-invno-${trip.id}`}>
                              #{inv.invNo}
                            </span>
                          ) : null}
                        </div>

                        {inv?.lookupCode ? (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <span>Mã tra cứu:</span>
                            {lookupHref ? (
                              <a
                                href={lookupHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 font-mono text-primary underline-offset-2 hover:underline"
                              >
                                {inv.lookupCode}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="font-mono text-foreground">{inv.lookupCode}</span>
                            )}
                          </div>
                        ) : null}

                        {inv?.issuedAt ? (
                          <div className="text-muted-foreground">
                            Phát hành: {formatInvoiceTripDate(inv.issuedAt)}
                          </div>
                        ) : null}

                        {inv && (inv.status === 'FAILED_RETRYABLE' || inv.status === 'FAILED_PERMANENT') ? (
                          <div className="space-y-0.5 text-red-700" data-testid={`einvoice-error-${trip.id}`}>
                            {inv.lastErrorCode ? (
                              <div className="font-mono text-[11px] font-semibold">
                                Mã lỗi: {inv.lastErrorCode}
                              </div>
                            ) : null}
                            {statusView.detail ? <div>{statusView.detail}</div> : null}
                            {inv.attempts > 0 ? (
                              <div className="text-[11px] text-muted-foreground">
                                Số lần thử: {inv.attempts}
                                {inv.nextAttemptAt ? ` · Thử lại: ${formatInvoiceTripDate(inv.nextAttemptAt)}` : ''}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {inv?.status === 'SKIPPED' ? (
                          <div className="text-muted-foreground" data-testid={`einvoice-skip-${trip.id}`}>
                            {statusView.detail}
                          </div>
                        ) : null}

                        {(!inv ||
                          (inv.status !== 'ISSUED' &&
                            inv.status !== 'FAILED_RETRYABLE' &&
                            inv.status !== 'FAILED_PERMANENT' &&
                            inv.status !== 'SKIPPED')) &&
                        statusView.detail ? (
                          <div className="text-muted-foreground">{statusView.detail}</div>
                        ) : null}

                        {reopenable && canReopenInvoice && inv ? (
                          <div className="pt-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              data-testid={`reopen-invoice-btn-${inv.id}`}
                              onClick={() => openReopenDialog(trip)}
                            >
                              <RefreshCw className="mr-1 h-3 w-3" />
                              Mở lại HĐ
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-center align-top">
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
                );
              })
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

      <Dialog open={!!reopeningTrip} onOpenChange={(open) => { if (!open) closeReopenDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mở lại hoá đơn MISA để phát hành lại</DialogTitle>
            <DialogDescription>
              {reopeningTrip
                ? `Chuyến ${reopeningTrip.bookingCode} (${reopeningTrip.contractNo}) · Ngày HĐ: ${reopeningTrip.invoice?.invDate ?? '—'}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReopenSubmit} className="space-y-4 py-2">
            {reopeningTrip?.invoice ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
                <div>
                  <span className="text-muted-foreground">Trạng thái hiện tại: </span>
                  <span className="font-semibold">{describeEInvoiceStatus(reopeningTrip.invoice).label}</span>
                  {' '}({reopeningTrip.invoice.status})
                </div>
                {reopeningTrip.invoice.lastErrorCode ? (
                  <div>
                    <span className="text-muted-foreground">Mã lỗi: </span>
                    <span className="font-mono font-medium text-red-700">{reopeningTrip.invoice.lastErrorCode}</span>
                  </div>
                ) : null}
                {reopeningTrip.invoice.lastError ? (
                  <div>
                    <span className="text-muted-foreground">Chi tiết: </span>
                    <span>{reopeningTrip.invoice.lastError}</span>
                  </div>
                ) : null}
                {reopeningTrip.invoice.skipReason ? (
                  <div>
                    <span className="text-muted-foreground">Lý do bỏ qua: </span>
                    <span className="font-mono">{reopeningTrip.invoice.skipReason}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="reopen-invoice-reason">
                Lý do mở lại hoá đơn (bắt buộc, {REOPEN_REASON_MIN_LENGTH}–{REOPEN_REASON_MAX_LENGTH} ký tự)
              </Label>
              <Textarea
                id="reopen-invoice-reason"
                placeholder="VD: Khách đã cung cấp lại MST và địa chỉ công ty hợp lệ, mở lại để hệ thống phát hành tự động"
                value={reopenReason}
                maxLength={REOPEN_REASON_MAX_LENGTH}
                onChange={(e) => setReopenReason(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {reopenValidation.trimmedReason.length}/{REOPEN_REASON_MAX_LENGTH} ký tự (tối thiểu {REOPEN_REASON_MIN_LENGTH} ký tự sau khi cắt khoảng trắng)
              </p>
            </div>

            <div className="flex items-start space-x-2 rounded-md border border-amber-200 bg-amber-50/70 p-3">
              <Checkbox
                id="reopen-confirm-not-issued"
                checked={confirmNotIssuedManually}
                onCheckedChange={(checked) => setConfirmNotIssuedManually(checked === true)}
              />
              <Label
                htmlFor="reopen-confirm-not-issued"
                className="text-xs leading-relaxed text-amber-950 cursor-pointer"
              >
                Tôi xác nhận chuyến này <strong>CHƯA được xuất tay hoá đơn trên MISA</strong>. (Nếu kế toán đã xuất tay mà mở lại, hệ thống sẽ phát hành hoá đơn thứ hai trùng cho cùng chuyến.)
              </Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeReopenDialog} disabled={isReopening}>
                Huỷ
              </Button>
              <Button
                type="submit"
                disabled={!reopenValidation.valid || isReopening}
                data-testid="reopen-invoice-submit"
              >
                {isReopening && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Xác nhận mở lại
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
