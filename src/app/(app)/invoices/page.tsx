'use client';

import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEFAULT_INVOICE_DATE_RANGE, mockInvoiceTrips } from './invoice-data';
import {
  filterInvoiceTrips,
  formatInvoiceCurrency,
  formatInvoiceTripDate,
  getInvoiceTotalAmount,
  getInvoiceTotalPages,
  paginateInvoiceTrips,
} from './invoice-utils';

export default function InvoicesPage() {
  const [fromDate, setFromDate] = React.useState(DEFAULT_INVOICE_DATE_RANGE.from);
  const [toDate, setToDate] = React.useState(DEFAULT_INVOICE_DATE_RANGE.to);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const filteredTrips = React.useMemo(
    () => filterInvoiceTrips(mockInvoiceTrips, { from: fromDate, to: toDate }),
    [fromDate, toDate],
  );

  const totalPages = getInvoiceTotalPages(filteredTrips.length, pageSize);
  const effectivePage = Math.min(currentPage, totalPages);
  const currentTrips = React.useMemo(
    () => paginateInvoiceTrips(filteredTrips, effectivePage, pageSize),
    [filteredTrips, effectivePage, pageSize],
  );

  React.useEffect(() => {
    setCurrentPage(1);
  }, [fromDate, toDate, pageSize]);

  React.useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const resetFilters = () => {
    setFromDate(DEFAULT_INVOICE_DATE_RANGE.from);
    setToDate(DEFAULT_INVOICE_DATE_RANGE.to);
  };

  const totalAmount = React.useMemo(() => getInvoiceTotalAmount(filteredTrips), [filteredTrips]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Receipt className="h-6 w-6" />
            Hoá đơn
          </h1>
          <p className="text-sm text-muted-foreground">
            Danh sách hoá đơn chuyến đi. Dữ liệu hiện là mock-up trong lúc chờ backend.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          {filteredTrips.length} chuyến · {formatInvoiceCurrency(totalAmount)}
        </Badge>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="invoice-from" className="text-xs text-muted-foreground">
              Từ ngày
            </Label>
            <Input
              id="invoice-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full md:w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-to" className="text-xs text-muted-foreground">
              Đến ngày
            </Label>
            <Input
              id="invoice-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full md:w-44"
            />
          </div>
          <Button variant="outline" onClick={resetFilters} className="w-full md:w-auto">
            <RotateCcw className="mr-2 h-4 w-4" />
            Đặt lại
          </Button>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày tháng</TableHead>
              <TableHead>Mã chuyến đi</TableHead>
              <TableHead>Số hợp đồng</TableHead>
              <TableHead>Điểm đi</TableHead>
              <TableHead>Điểm đến</TableHead>
              <TableHead className="text-right">Tổng tiền gồm VAT</TableHead>
              <TableHead>Biển số xe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentTrips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  Không có chuyến đi nào trong khoảng ngày đã chọn.
                </TableCell>
              </TableRow>
            ) : (
              currentTrips.map((trip) => (
                <TableRow key={trip.id}>
                  <TableCell className="whitespace-nowrap">{formatInvoiceTripDate(trip.tripDate)}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{trip.bookingCode}</code>
                  </TableCell>
                  <TableCell className="font-medium">{trip.contractNo}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{trip.pickupAddress}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{trip.dropoffAddress}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatInvoiceCurrency(trip.totalWithVat)}
                  </TableCell>
                  <TableCell className="font-mono">{trip.vehiclePlate}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-3 border-t px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Hiển thị</span>
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger className="h-8 w-[74px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
              </SelectContent>
            </Select>
            <span>/ {filteredTrips.length} kết quả</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Trang {effectivePage} / {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(1)}
                disabled={effectivePage <= 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={effectivePage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={effectivePage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(totalPages)}
                disabled={effectivePage >= totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
