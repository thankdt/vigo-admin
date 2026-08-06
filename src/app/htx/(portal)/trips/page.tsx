'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Route as RouteIcon,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { htxListTrips, type HtxOwnerTripRow } from '@/lib/api';
import { FinanceFilter, PRESETS, type DateRange } from '@/app/(app)/finance/components/finance-filter';

type StatusTab = 'completed' | 'cancelled' | 'all';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

// Giờ Việt Nam bất kể máy người xem đặt múi nào (CLAUDE.md) — backend trả mốc UTC.
const formatVnDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const CANCELLED_BY_LABEL: Record<string, string> = {
  CUSTOMER: 'Khách huỷ',
  DRIVER: 'Tài xế huỷ',
  SYSTEM: 'Hệ thống huỷ',
  ADMIN: 'Quản trị viên huỷ',
};

/**
 * Lý do huỷ hiển thị cho chủ HTX. Backend đã bỏ text khi admin huỷ (ô cancelReason
 * dùng chung với ghi chú nội bộ), nên ở đây chỉ còn việc ghép nhãn vai trò.
 */
const cancelText = (trip: HtxOwnerTripRow) => {
  const who = trip.cancelledByRole ? CANCELLED_BY_LABEL[trip.cancelledByRole] : 'Không rõ ai huỷ';
  return trip.cancelReason ? `${who} · ${trip.cancelReason}` : who;
};

const last30 = (): DateRange =>
  PRESETS.find((p) => p.key === 'last30')?.range() ?? { from: '', to: '' };

export default function HtxTripsPage() {
  const { toast } = useToast();
  const [trips, setTrips] = React.useState<HtxOwnerTripRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const [range, setRange] = React.useState<DateRange>(last30);
  const [tab, setTab] = React.useState<StatusTab>('completed');
  const [search, setSearch] = React.useState('');

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await htxListTrips({
        page,
        limit: pageSize,
        from: range.from,
        to: range.to,
        status: tab,
        search: search || undefined,
      });
      setTrips(result.data);
      setTotal(result.meta.total);
      setTotalPages(Math.max(1, result.meta.totalPages));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được danh sách chuyến', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, range.from, range.to, tab, search, toast]);

  // Gộp nhịp như trang Tài xế: gõ tìm kiếm / bấm preset liên tục không bắn mỗi phím một request.
  React.useEffect(() => {
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [load]);

  const onRangeChange = (next: DateRange) => {
    setRange(next);
    setPage(1);
  };

  const onTabChange = (v: string) => {
    setTab(v as StatusTab);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Chuyến đi</h1>
        <p className="text-sm text-muted-foreground">
          Lịch sử chuyến của tài xế thuộc HTX. Vì lý do bảo mật thông tin khách hàng, số điện thoại
          khách không được hiển thị.
        </p>
      </div>

      <FinanceFilter value={range} onChange={onRangeChange} isLoading={isLoading} initialPreset="last30" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={onTabChange}>
          <TabsList>
            <TabsTrigger value="completed">Hoàn thành</TabsTrigger>
            <TabsTrigger value="cancelled">Đã huỷ</TabsTrigger>
            <TabsTrigger value="all">Tất cả</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Mã chuyến, tên tài xế, biển số..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Thời gian</TableHead>
              <TableHead>Hành trình</TableHead>
              <TableHead>Khách</TableHead>
              <TableHead>Tài xế</TableHead>
              <TableHead className="text-right">Giá cước</TableHead>
              <TableHead className="text-right">Khách trả</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : trips.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <RouteIcon className="h-8 w-8 text-muted-foreground" />
                    <span className="text-muted-foreground">Không có chuyến nào trong khoảng đã chọn.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              trips.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap align-top">
                    <div className="text-sm">{formatVnDateTime(t.eventAt)}</div>
                    <div className="text-xs text-muted-foreground">#{t.id.slice(0, 8)}</div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="max-w-[22rem] text-sm">
                      <div className="truncate" title={t.pickup ?? undefined}>
                        <span className="text-muted-foreground">Đón: </span>
                        {t.pickup ?? '—'}
                      </div>
                      <div className="truncate" title={t.dropoff ?? undefined}>
                        <span className="text-muted-foreground">Trả: </span>
                        {t.dropoff ?? '—'}
                      </div>
                    </div>
                    {t.distanceKm != null && (
                      <div className="text-xs text-muted-foreground">{t.distanceKm} km</div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">{t.customerName ?? '—'}</TableCell>
                  <TableCell className="align-top">
                    <div className="text-sm font-medium">{t.driver.name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{t.driver.plate ?? '—'}</div>
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums">
                    {t.price != null ? formatCurrency(t.price) : '—'}
                  </TableCell>
                  <TableCell className="text-right align-top tabular-nums font-medium">
                    {t.finalPrice != null ? formatCurrency(t.finalPrice) : '—'}
                  </TableCell>
                  <TableCell className="align-top">
                    {t.status === 'CANCELLED' ? (
                      <div className="space-y-1">
                        <Badge variant="destructive">Đã huỷ</Badge>
                        <div className="max-w-[16rem] text-xs text-muted-foreground">{cancelText(t)}</div>
                      </div>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">
                        Hoàn thành
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t px-4 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Hiển thị</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span>/ {total} chuyến</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Trang {page} / {totalPages}
            </span>
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
