'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Car,
  User,
  Phone,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { htxListDrivers, htxToggleDriverActive, type HtxDriverRow } from '@/lib/api';
import { getImageUrl } from '@/lib/utils';

type ApprovalTab = 'all' | 'unsubmitted' | 'pending' | 'true' | 'false';
type StatusFilter = '' | 'ONLINE' | 'OFFLINE' | 'BUSY';
type ActiveFilter = '' | 'true' | 'false';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const statusBadge = (status: string) => {
  switch (status) {
    case 'ONLINE':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">Sẵn sàng</Badge>;
    case 'BUSY':
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">Đang chở khách</Badge>;
    case 'OFFLINE':
    default:
      return <Badge variant="secondary">Ngoại tuyến</Badge>;
  }
};

export default function HtxDriversPage() {
  const { toast } = useToast();
  const [drivers, setDrivers] = React.useState<HtxDriverRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const [tab, setTab] = React.useState<ApprovalTab>('all');
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('');
  const [activeFilter, setActiveFilter] = React.useState<ActiveFilter>('');

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await htxListDrivers({
        page,
        limit: pageSize,
        search: search || undefined,
        isApproved: tab === 'all' ? undefined : tab,
        status: statusFilter || undefined,
        isActive: activeFilter || undefined,
      });
      setDrivers(result.data);
      setTotal(result.meta.total);
      setTotalPages(Math.max(1, result.meta.totalPages));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được danh sách tài xế', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, search, tab, statusFilter, activeFilter, toast]);

  React.useEffect(() => {
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [load]);

  const handleToggle = async (driver: HtxDriverRow) => {
    setPendingId(driver.id);
    setDrivers((prev) => prev.map((d) => (d.id === driver.id ? { ...d, isActive: !d.isActive } : d)));
    try {
      const result = await htxToggleDriverActive(driver.id);
      setDrivers((prev) => prev.map((d) => (d.id === driver.id ? { ...d, isActive: result.isActive } : d)));
      toast({
        title: result.isActive ? 'Đã kích hoạt' : 'Đã tạm dừng',
        description: `${driver.fullName ?? driver.phone ?? 'Tài xế'} ${result.isActive ? 'sẽ tiếp tục nhận chuyến.' : 'sẽ không nhận thêm chuyến mới.'}`,
      });
    } catch (err: any) {
      setDrivers((prev) => prev.map((d) => (d.id === driver.id ? { ...d, isActive: driver.isActive } : d)));
      toast({ variant: 'destructive', title: 'Lỗi', description: err.message });
    } finally {
      setPendingId(null);
    }
  };

  const onTabChange = (v: string) => {
    setTab(v as ApprovalTab);
    setPage(1);
  };

  const onFilterChange = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tài xế của HTX</h1>
        <p className="text-sm text-muted-foreground">
          Lọc theo trạng thái duyệt, trạng thái hoạt động và tạm dừng / kích hoạt từng tài xế.
        </p>
      </div>

      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="all">Tất cả</TabsTrigger>
          <TabsTrigger value="unsubmitted">Chưa nộp hồ sơ</TabsTrigger>
          <TabsTrigger value="pending">Chờ duyệt</TabsTrigger>
          <TabsTrigger value="true">Đã duyệt</TabsTrigger>
          <TabsTrigger value="false">Từ chối</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="relative sm:col-span-1">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tên, SĐT, biển số..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          value={statusFilter || 'ALL'}
          onValueChange={(v) => onFilterChange(setStatusFilter, (v === 'ALL' ? '' : v) as StatusFilter)}
        >
          <SelectTrigger><SelectValue placeholder="Trạng thái hoạt động" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
            <SelectItem value="ONLINE">Sẵn sàng</SelectItem>
            <SelectItem value="BUSY">Đang chở khách</SelectItem>
            <SelectItem value="OFFLINE">Ngoại tuyến</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={activeFilter || 'ALL'}
          onValueChange={(v) => onFilterChange(setActiveFilter, (v === 'ALL' ? '' : v) as ActiveFilter)}
        >
          <SelectTrigger><SelectValue placeholder="HTX kích hoạt" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả</SelectItem>
            <SelectItem value="true">Đang hoạt động</SelectItem>
            <SelectItem value="false">Tạm dừng</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tài xế</TableHead>
              <TableHead>Số điện thoại</TableHead>
              <TableHead className="text-right">Số chuyến</TableHead>
              <TableHead className="text-right">Thu nhập</TableHead>
              <TableHead className="text-right">Thuế TNCN</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead className="text-right">Hoạt động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : drivers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Car className="h-8 w-8 text-muted-foreground" />
                    <span className="text-muted-foreground">Không tìm thấy tài xế nào.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              drivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      {d.avatar ? <AvatarImage src={getImageUrl(d.avatar)} /> : null}
                      <AvatarFallback>{(d.fullName ?? '?').slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{d.fullName ?? '—'}</div>
                      {d.vehicleRegistration?.plateNumber && (
                        <div className="text-xs text-muted-foreground">
                          {d.vehicleRegistration.plateNumber}
                          {d.vehicleRegistration.seats ? ` · ${d.vehicleRegistration.seats} chỗ` : ''}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{d.phone ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.tripCount}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatCurrency(d.lifetimeIncome ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(d.lifetimeTax ?? 0)}</TableCell>
                  <TableCell>{statusBadge(d.status)}</TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`text-xs ${d.isActive ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {d.isActive ? 'Đang hoạt động' : 'Tạm dừng'}
                      </span>
                      <Switch
                        checked={d.isActive}
                        disabled={pendingId === d.id}
                        onCheckedChange={() => handleToggle(d)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t px-4 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Hiển thị</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
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
