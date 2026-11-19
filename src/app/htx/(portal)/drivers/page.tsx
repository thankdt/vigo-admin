'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  STICKY_ACTION_HEAD_CLASS,
  STICKY_ACTION_CELL_CLASS,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { htxListDrivers, htxToggleDriverActive, type HtxDriverRow } from '@/lib/api';
import { getImageUrl } from '@/lib/utils';
import { HtxContractDialog } from './components/htx-contract-dialog';
import { HtxApprovalBadge, HtxDriverDetailDialog } from './components/htx-driver-detail-dialog';
import {
  DRIVER_ONLINE_HINT,
  driverOnlineState,
  type DriverPresence,
} from '@/lib/driver-presence';

type ApprovalTab = 'all' | 'unsubmitted' | 'pending' | 'true' | 'false';
type StatusFilter = '' | 'ONLINE' | 'OFFLINE' | 'BUSY';
type ActiveFilter = '' | 'true' | 'false';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

// `status` chỉ là trạng thái KHAI BÁO — tài bỏ app vẫn ONLINE mãi. Kết hợp tín
// hiệu Redis (`presence`) qua `driverOnlineState` để chủ HTX không nhìn nhầm một
// tài đã biến mất thành "sẵn sàng". Chữ ở portal khác danh sách admin có chủ đích.
const statusBadge = (status: string, presence?: DriverPresence) => {
  const state = driverOnlineState(status, presence);
  switch (state) {
    case 'online':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">Sẵn sàng</Badge>;
    case 'busy':
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">Đang chở khách</Badge>;
    case 'idle':
      return (
        <Badge
          title={DRIVER_ONLINE_HINT.idle}
          className="bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-400"
        >
          Chờ tín hiệu
        </Badge>
      );
    case 'stale':
      return (
        <Badge
          title={DRIVER_ONLINE_HINT.stale}
          className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400"
        >
          Mất kết nối
        </Badge>
      );
    case 'unknown':
      return (
        <Badge title={DRIVER_ONLINE_HINT.unknown} variant="outline">
          Không rõ
        </Badge>
      );
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

  const [selectedContractDriver, setSelectedContractDriver] = React.useState<HtxDriverRow | null>(null);
  const [isContractOpen, setIsContractOpen] = React.useState(false);
  const [selectedDetailDriver, setSelectedDetailDriver] = React.useState<HtxDriverRow | null>(null);
  const [isDetailOpen, setIsDetailOpen] = React.useState(false);

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
          Xem hồ sơ chi tiết, duyệt / từ chối tài xế, ký hợp đồng và tạm dừng / kích hoạt từng tài xế.
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
        <Table stackBelow="xl">
          <TableHeader>
            <TableRow>
              <TableHead>Tài xế</TableHead>
              <TableHead>Số điện thoại</TableHead>
              <TableHead>Hồ sơ duyệt</TableHead>
              <TableHead className="text-right">Số chuyến</TableHead>
              <TableHead className="text-right">Thu nhập</TableHead>
              <TableHead className="text-right">Thuế TNCN</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead className="text-center">Hợp đồng HTX</TableHead>
              <TableHead className={cn(STICKY_ACTION_HEAD_CLASS, 'text-right')}>Hoạt động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : drivers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Car className="h-8 w-8 text-muted-foreground" />
                    <span className="text-muted-foreground">Không tìm thấy tài xế nào.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              drivers.map((d) => {
                const openProfile = () => {
                  setSelectedDetailDriver(d);
                  setIsDetailOpen(true);
                };
                return (
                <TableRow
                  key={d.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={openProfile}
                >
                  <TableCell data-card="header">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openProfile();
                      }}
                      className="flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                    >
                      <Avatar className="h-8 w-8">
                        {d.avatar ? <AvatarImage src={getImageUrl(d.avatar)} /> : null}
                        <AvatarFallback>{(d.fullName ?? '?').slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-primary hover:underline">{d.fullName ?? '—'}</div>
                        {d.vehicleRegistration?.plateNumber && (
                          <div className="text-xs text-muted-foreground">
                            {d.vehicleRegistration.plateNumber}
                            {d.vehicleRegistration.seats ? ` · ${d.vehicleRegistration.seats} chỗ` : ''}
                          </div>
                        )}
                      </div>
                    </button>
                  </TableCell>
                  <TableCell data-label="Số điện thoại">{d.phone ?? '—'}</TableCell>
                  <TableCell
                    data-label="Hồ sơ duyệt"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <HtxApprovalBadge driver={d} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={openProfile}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Xem hồ sơ
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell data-label="Số chuyến" className="text-right tabular-nums">{d.tripCount}</TableCell>
                  <TableCell data-label="Thu nhập" className="text-right tabular-nums font-medium">{formatCurrency(d.lifetimeIncome ?? 0)}</TableCell>
                  <TableCell data-label="Thuế TNCN" className="text-right tabular-nums text-amber-700 dark:text-amber-400">{formatCurrency(d.lifetimeTax ?? 0)}</TableCell>
                  <TableCell data-label="Trạng thái">{statusBadge(d.status, d.presence)}</TableCell>
                  <TableCell data-label="Ngày tạo">
                    <span className="text-sm text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                  </TableCell>
                  <TableCell
                    data-label="Hợp đồng HTX"
                    className="text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {d.htxApprovalStatus === 'PENDING_HTX' ? (
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs gap-1 shadow-sm"
                        onClick={() => {
                          setSelectedContractDriver(d);
                          setIsContractOpen(true);
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Ký ICA
                      </Button>
                    ) : d.htxApprovalStatus === 'HTX_APPROVED' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-green-600 text-green-700 dark:text-green-400 gap-1 hover:bg-green-50"
                        onClick={() => {
                          setSelectedContractDriver(d);
                          setIsContractOpen(true);
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        Đã ký ICA
                      </Button>
                    ) : d.htxApprovalStatus === 'HTX_REJECTED' ? (
                      <Badge variant="outline" className="border-red-400 text-red-600 text-xs">
                        Từ chối
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Chưa nộp</span>
                    )}
                  </TableCell>
                  <TableCell
                    data-card="actions"
                    className={cn(STICKY_ACTION_CELL_CLASS, 'text-right whitespace-nowrap')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-2">
                      <span className={`text-xs ${d.isActive ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {d.isActive ? 'Đang hoạt động' : 'Tạm dừng'}
                      </span>
                      <Switch
                        checked={d.isActive}
                        disabled={pendingId === d.id}
                        onCheckedChange={() => handleToggle(d)}
                        aria-label={d.isActive ? `Tạm dừng ${d.fullName ?? 'tài xế'}` : `Kích hoạt ${d.fullName ?? 'tài xế'}`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3 sm:px-4 sm:py-4">
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

      <HtxContractDialog
        driver={selectedContractDriver}
        open={isContractOpen}
        onOpenChange={setIsContractOpen}
        onSuccess={load}
      />

      <HtxDriverDetailDialog
        driver={selectedDetailDriver}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onSuccess={load}
      />
    </div>
  );
}
