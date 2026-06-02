'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, ArrowUpDown, Loader2, CheckCircle, XCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Building2, AlertTriangle, Pencil, Check as CheckIcon, X as XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ImageThumbList } from '@/components/ui/image-thumb-list';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { getDrivers, approveDriver, rejectDriver, assignTransportCompany, getTransportCompanyList, updateDriverServices, updateDriverProfile } from '@/lib/api';
import { DriverIssueBadges } from './driver-issue-badges';
import { DriversFilterBar, EMPTY_FILTERS, hasAnyFilter, type DriverFilters } from './drivers-filter-bar';
import type { Driver, TransportCompany } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { getImageUrl } from '@/lib/utils';
import { RejectReasonPicker } from '@/components/reject-reason-picker';
import { combineRejectReason } from '@/lib/reject-reasons';

// Safely parse image arrays - handles string, comma-separated, PostgreSQL array format, etc.
function safeImageArray(images: any): string[] {
  if (!images) return [];
  if (Array.isArray(images)) return images.filter(Boolean);
  if (typeof images === 'string') {
    // Handle PostgreSQL array format: {"a.jpg","b.jpg"}
    const trimmed = images.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
    // Handle JSON string: ["a.jpg","b.jpg"]
    if (trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { /* fall through */ }
    }
    // Handle comma-separated string: "a.jpg,b.jpg"
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    // Single image path
    return trimmed ? [trimmed] : [];
  }
  return [];
}

type SortKey = keyof Driver;
type TableTab = 'all' | 'unsubmitted' | 'pending' | 'true' | 'false' | 'needsReview';

export function DriversTable() {
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
  const [filters, setFilters] = React.useState<DriverFilters>(EMPTY_FILTERS);
  const [activeTab, setActiveTab] = React.useState<TableTab>('pending');
  const [needsReviewCount, setNeedsReviewCount] = React.useState<number>(0);

  const [dialogState, setDialogState] = React.useState<{ open: boolean; driver: Driver | null, action: 'approve' | 'reject' }>({ open: false, driver: null, action: 'approve' });
  const [rejectionValues, setRejectionValues] = React.useState<string[]>([]);
  const [rejectionNote, setRejectionNote] = React.useState('');
  const [enabledServices, setEnabledServices] = React.useState<string[]>(['RIDE', 'CARPOOL', 'DELIVERY']);

  const [viewDriver, setViewDriver] = React.useState<Driver | null>(null);

  // Edit-services state (inline in viewDriver dialog). Null = not editing; array = staging picks.
  const [editingServices, setEditingServices] = React.useState<string[] | null>(null);
  const [isSavingServices, setIsSavingServices] = React.useState(false);

  // Inline approve/reject inside the detail dialog. Null = showing the two trigger buttons.
  const [detailAction, setDetailAction] = React.useState<'approve' | 'reject' | null>(null);
  const [detailServices, setDetailServices] = React.useState<string[]>(['RIDE', 'CARPOOL', 'DELIVERY']);
  const [detailReasonValues, setDetailReasonValues] = React.useState<string[]>([]);
  const [detailReasonNote, setDetailReasonNote] = React.useState('');
  const [isSubmittingDetail, setIsSubmittingDetail] = React.useState(false);

  // Assign transport company state
  const [assignDriver, setAssignDriver] = React.useState<Driver | null>(null);
  const [transportCompanies, setTransportCompanies] = React.useState<TransportCompany[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string>('');
  const [isAssigning, setIsAssigning] = React.useState(false);

  // Inline edit name state (in view-driver detail dialog)
  const [editingName, setEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState('');
  const [savingName, setSavingName] = React.useState(false);

  const handleSaveName = async () => {
    if (!viewDriver) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === (viewDriver.name || viewDriver.user?.fullName || '')) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const updated = await updateDriverProfile(viewDriver.id, { fullName: trimmed });
      setViewDriver({ ...viewDriver, ...updated });
      toast({ title: 'Đã cập nhật tên tài xế' });
      setEditingName(false);
      fetchDrivers(activeTab, filters, currentPage, pageSize);
    } catch (e: any) {
      toast({ title: 'Không cập nhật được tên', description: e?.message, variant: 'destructive' });
    } finally {
      setSavingName(false);
    }
  };

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);

  const fetchGenRef = React.useRef(0);

  const fetchDrivers = React.useCallback(async (tab: TableTab, f: DriverFilters, page: number, limit: number) => {
    const gen = ++fetchGenRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const apiParams: Parameters<typeof getDrivers>[0] = {
        page,
        limit,
        name: f.name || undefined,
        phone: f.phone || undefined,
        plate: f.plate || undefined,
        serviceType: f.serviceType || undefined,
        transportCompanyName: f.transportCompanyName || undefined,
        unconfirmedTransportCompany: f.unconfirmedTransportCompany ? 'true' : undefined,
      };
      if (tab === 'needsReview') {
        apiParams.needsReview = 'true';
      } else if (tab !== 'all') {
        apiParams.isApproved = tab as 'pending' | 'true' | 'false' | 'unsubmitted';
      }

      const response = await getDrivers(apiParams);
      if (gen !== fetchGenRef.current) return;
      setDrivers(response.data);
      const total = response.meta?.total ?? 0;
      const apiLimit = response.meta?.limit ?? limit;
      setTotalItems(total);
      setTotalPages(Math.max(1, Math.ceil(total / apiLimit)));
    } catch (err: any) {
      if (gen !== fetchGenRef.current) return;
      setError(err.message);
      toast({
        variant: 'destructive',
        title: 'Không thể tải danh sách tài xế',
        description: err.message,
      });
    } finally {
      if (gen === fetchGenRef.current) {
        setIsLoading(false);
      }
    }
  }, [toast]);

  const refreshNeedsReviewCount = React.useCallback(async () => {
    try {
      const response = await getDrivers({ needsReview: 'true', limit: 1, page: 1 });
      const total = response.meta?.total ?? 0;
      setNeedsReviewCount(total);
    } catch {
      // Non-fatal; leave previous count
    }
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchDrivers(activeTab, filters, currentPage, pageSize);
    }, 400);

    return () => clearTimeout(timer);
  }, [fetchDrivers, activeTab, filters, currentPage, pageSize]);

  React.useEffect(() => {
    refreshNeedsReviewCount();
  }, [refreshNeedsReviewCount]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as TableTab);
    setCurrentPage(1);
  };

  const handleFiltersChange = (next: DriverFilters) => {
    setFilters(next);
    setCurrentPage(1);
  };

  const sortedDrivers = React.useMemo(() => {
    let sortableDrivers = [...drivers];
    if (sortConfig !== null) {
      sortableDrivers.sort((a, b) => {
        const aValue = a[sortConfig.key] as any;
        const bValue = b[sortConfig.key] as any;
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableDrivers;
  }, [drivers, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getStatusBadge = (status: Driver['isApproved']) => {
    switch (status) {
      case 'true':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">Đã duyệt</Badge>;
      case 'pending':
      case '-': // Backend seems to return '-' for pending
        return <Badge variant="secondary">Chờ duyệt</Badge>;
      case 'false':
        return <Badge variant="destructive">Từ chối</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const openConfirmationDialog = (driver: Driver, action: 'approve' | 'reject') => {
    setDialogState({ open: true, driver, action });
  };

  const closeConfirmationDialog = () => {
    setDialogState({ open: false, driver: null, action: 'approve' });
    setRejectionValues([]);
    setRejectionNote('');
    setEnabledServices(['RIDE', 'CARPOOL', 'DELIVERY']);
  }

  const handleConfirmAction = async () => {
    if (!dialogState.driver) return;

    const driverName = dialogState.driver.name || dialogState.driver.user?.fullName || 'Driver';

    try {
      if (dialogState.action === 'approve') {
        if (enabledServices.length === 0) {
          toast({ title: "Yêu cầu dịch vụ", description: "Vui lòng chọn ít nhất một dịch vụ.", variant: "destructive" });
          return;
        }
        await approveDriver(dialogState.driver.id, enabledServices);
        toast({ title: "Đã duyệt tài xế", description: `${driverName} đã được duyệt.` });
      } else {
        if (rejectionValues.length === 0) {
          toast({ title: "Yêu cầu lý do", description: "Vui lòng chọn ít nhất một lý do từ chối.", variant: "destructive" });
          return;
        }
        await rejectDriver(dialogState.driver.id, combineRejectReason(rejectionValues, rejectionNote));
        toast({ title: "Đã từ chối tài xế", description: `${driverName} đã bị từ chối.` });
      }
      fetchDrivers(activeTab, filters, currentPage, pageSize);
      refreshNeedsReviewCount();
      closeConfirmationDialog();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: `Không thể ${dialogState.action === 'approve' ? 'duyệt' : 'từ chối'} tài xế`,
        description: err.message,
      });
    }
  }

  const resetDetailAction = () => {
    setDetailAction(null);
    setDetailServices(['RIDE', 'CARPOOL', 'DELIVERY']);
    setDetailReasonValues([]);
    setDetailReasonNote('');
  };

  const handleDetailAction = async () => {
    if (!viewDriver || !detailAction) return;
    const driverName = viewDriver.name || viewDriver.user?.fullName || 'Driver';

    if (detailAction === 'approve' && detailServices.length === 0) {
      toast({ title: 'Yêu cầu dịch vụ', description: 'Vui lòng chọn ít nhất một dịch vụ.', variant: 'destructive' });
      return;
    }
    if (detailAction === 'reject' && detailReasonValues.length === 0) {
      toast({ title: 'Yêu cầu lý do', description: 'Vui lòng chọn ít nhất một lý do từ chối.', variant: 'destructive' });
      return;
    }

    setIsSubmittingDetail(true);
    try {
      if (detailAction === 'approve') {
        await approveDriver(viewDriver.id, detailServices);
        toast({ title: 'Đã duyệt tài xế', description: `${driverName} đã được duyệt.` });
      } else {
        await rejectDriver(viewDriver.id, combineRejectReason(detailReasonValues, detailReasonNote));
        toast({ title: 'Đã từ chối tài xế', description: `${driverName} đã bị từ chối.` });
      }
      setViewDriver(null);
      resetDetailAction();
      fetchDrivers(activeTab, filters, currentPage, pageSize);
      refreshNeedsReviewCount();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: `Không thể ${detailAction === 'approve' ? 'duyệt' : 'từ chối'} tài xế`,
        description: err.message,
      });
    } finally {
      setIsSubmittingDetail(false);
    }
  };

  const openAssignDialog = async (driver: Driver) => {
    setAssignDriver(driver);
    setSelectedCompanyId(driver.transportCompanyId || '');
    try {
      const list = await getTransportCompanyList();
      setTransportCompanies(list);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Không thể tải danh sách đơn vị vận tải.' });
    }
  };

  const handleAssign = async () => {
    if (!assignDriver || !selectedCompanyId) return;
    setIsAssigning(true);
    try {
      await assignTransportCompany(assignDriver.id, selectedCompanyId);
      toast({ title: 'Thành công', description: 'Đã gán đơn vị vận tải cho tài xế.' });
      setAssignDriver(null);
      setSelectedCompanyId('');
      fetchDrivers(activeTab, filters, currentPage, pageSize);
      refreshNeedsReviewCount();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: err.message });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="pb-4">
          <TabsList>
            <TabsTrigger value="all">Tất cả</TabsTrigger>
            <TabsTrigger value="unsubmitted">Chưa nộp hồ sơ</TabsTrigger>
            <TabsTrigger value="pending">Chờ duyệt</TabsTrigger>
            <TabsTrigger value="true">Đã duyệt</TabsTrigger>
            <TabsTrigger value="false">Từ chối</TabsTrigger>
            <TabsTrigger value="needsReview" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Cần kiểm tra
              {needsReviewCount > 0 && (
                <span
                  aria-label={`${needsReviewCount} tài xế cần kiểm tra`}
                  className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white"
                >
                  {needsReviewCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <DriversFilterBar
          value={filters}
          onChange={handleFiltersChange}
        />

        {activeTab === 'needsReview' && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            Đang hiển thị tài xế có thông tin chưa chuẩn. Tổng: {totalItems} tài xế.
          </div>
        )}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('name')}>
                    Tài xế
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>Phương tiện</TableHead>
                <TableHead>Đơn vị vận tải</TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('isApproved')}>
                    Trạng thái
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('createdAt')}>
                    Ngày tạo
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>
                  <span className="sr-only">Thao tác</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : sortedDrivers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    {activeTab === 'needsReview' && !hasAnyFilter(filters)
                      ? '✅ Tất cả tài xế đều có thông tin đầy đủ.'
                      : 'Không tìm thấy tài xế nào.'}
                  </TableCell>
                </TableRow>
              ) : (
                sortedDrivers.map((driver) => {
                  const driverName = driver.name || driver.user?.fullName || 'Tài xế';
                  const driverPhone = driver.phone || driver.user?.phone || 'Chưa có SĐT';
                  return (
                  <TableRow
                    key={driver.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setViewDriver(driver)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={driver.user?.avatarUrl || driver.user?.avatar} alt={driverName} data-ai-hint="person portrait" />
                          <AvatarFallback>{driverName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="grid">
                          <span className="font-semibold">{driverName}</span>
                          <span className="text-sm text-muted-foreground">{driverPhone}</span>
                          <DriverIssueBadges issues={driver.issues} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid">
                        <span className="font-semibold">{driver.vehicle?.model || driver.vehicleRegistration?.model || 'N/A'}</span>
                        <span className="text-sm text-muted-foreground">{driver.vehicle?.plateNumber || driver.vehicleRegistration?.plateNumber || 'Chưa có'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {driver.transportCompany ? (
                        <span className="text-sm font-medium">{driver.transportCompany.name}</span>
                      ) : driver.customTransportCompanyName ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{driver.customTransportCompanyName}</span>
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Chưa xác nhận</Badge>
                        </div>
                      ) : driver.isIndependentDriver ? (
                        <Badge variant="secondary">Tài xế độc lập</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Chưa cung cấp</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(driver.isApproved)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {driver.createdAt ? new Date(driver.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Mở menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Thao tác</DropdownMenuLabel>
                          <DropdownMenuItem onSelect={() => setTimeout(() => setViewDriver(driver), 0)}>Xem chi tiết</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setTimeout(() => openAssignDialog(driver), 0)}>
                            <Building2 className="mr-2 h-4 w-4" /> Gán đơn vị vận tải
                          </DropdownMenuItem>
                          {(driver.isApproved === 'pending' || driver.isApproved === '-' || activeTab === 'pending') && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => setTimeout(() => openConfirmationDialog(driver, 'approve'), 0)}>
                                <CheckCircle className="mr-2 h-4 w-4" /> Duyệt
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setTimeout(() => openConfirmationDialog(driver, 'reject'), 0)} className="text-destructive focus:text-destructive">
                                <XCircle className="mr-2 h-4 w-4" /> Từ chối
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {/* Pagination Controls */}
          <div className="flex items-center justify-between px-4 py-4 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Hiển thị</span>
              <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}>
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
              <span>/ {totalItems} kết quả</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Trang {currentPage} / {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage <= 1 || isLoading}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages || isLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages || isLoading}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </Tabs>

      <AlertDialog open={dialogState.open} onOpenChange={closeConfirmationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogState.action === 'approve'
                ? `Bạn sắp duyệt tài xế ${dialogState.driver?.name || dialogState.driver?.user?.fullName || 'Driver'}. Họ sẽ được thông báo và bắt đầu nhận chuyến.`
                : `Bạn sắp từ chối tài xế ${dialogState.driver?.name || dialogState.driver?.user?.fullName || 'Driver'}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dialogState.action === 'approve' && (
            <div className="grid gap-2 pt-2 pb-4">
              <Label>Loại dịch vụ được phép</Label>
              <div className="flex flex-col gap-2 mt-2">
                {['RIDE', 'CARPOOL', 'DELIVERY'].map((service) => (
                  <div key={service} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`service-${service}`} 
                      checked={enabledServices.includes(service)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setEnabledServices([...enabledServices, service]);
                        } else {
                          setEnabledServices(enabledServices.filter(s => s !== service));
                        }
                      }}
                    />
                    <label
                      htmlFor={`service-${service}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {service === 'RIDE' ? 'Chở khách (Taxi)' : service === 'CARPOOL' ? 'Đi chung' : 'Giao hàng'}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
          {dialogState.action === 'reject' && (
            <div className="pt-2">
              <RejectReasonPicker
                selectedValues={rejectionValues}
                onSelectedValuesChange={setRejectionValues}
                note={rejectionNote}
                onNoteChange={setRejectionNote}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeConfirmationDialog}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
              {dialogState.action === 'approve' ? 'Duyệt' : 'Xác nhận từ chối'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewDriver} onOpenChange={(open) => { if (!open) { setViewDriver(null); setEditingServices(null); resetDetailAction(); setEditingName(false); } }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Chi tiết tài xế</DialogTitle>
          </DialogHeader>
          {viewDriver && (
            <div className="space-y-6">
              <div className="flex items-center space-x-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={viewDriver.user?.avatarUrl || viewDriver.user?.avatar} alt={viewDriver.name || viewDriver.user?.fullName} />
                  <AvatarFallback>{(viewDriver.name || viewDriver.user?.fullName || 'Driver').charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveName();
                          if (e.key === 'Escape') setEditingName(false);
                        }}
                        disabled={savingName}
                        autoFocus
                        className="h-8 text-base font-bold"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={handleSaveName}
                        disabled={savingName}
                        aria-label="Lưu"
                      >
                        {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckIcon className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setEditingName(false)}
                        disabled={savingName}
                        aria-label="Huỷ"
                      >
                        <XIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 group">
                      <h3 className="text-xl font-bold truncate">{viewDriver.name || viewDriver.user?.fullName || 'Tài xế'}</h3>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 opacity-60 hover:opacity-100"
                        onClick={() => {
                          setNameDraft(viewDriver.name || viewDriver.user?.fullName || '');
                          setEditingName(true);
                        }}
                        aria-label="Sửa tên"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground truncate">{viewDriver.phone || viewDriver.user?.phone || 'Chưa có SĐT'}</p>
                  <p className="text-sm font-medium mt-1">Trạng thái: {getStatusBadge(viewDriver.isApproved)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">ID</Label>
                  <p className="font-medium text-sm break-all">{viewDriver.id}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Số dư ví</Label>
                  <p className="font-medium text-sm">{viewDriver.walletBalance !== undefined ? `${viewDriver.walletBalance} VNĐ` : 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Số bằng lái</Label>
                  <p className="font-medium text-sm">{viewDriver.licenseNumber || 'N/A'}</p>
                </div>
              </div>

              {viewDriver.vehicleRegistration && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="font-semibold">Đăng ký xe</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Biển số</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicleRegistration.plateNumber}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Hãng xe</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicleRegistration.brand}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Dòng xe</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicleRegistration.model}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Màu sắc</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicleRegistration.color}</p>
                    </div>
                  </div>
                  {safeImageArray(viewDriver.vehicleRegistration.images).length > 0 && (
                    <div className="space-y-2 pt-3">
                      <Label className="text-xs text-muted-foreground">Ảnh xe</Label>
                      <ImageThumbList
                        urls={safeImageArray(viewDriver.vehicleRegistration.images).map((img) => getImageUrl(img))}
                        altPrefix="Vehicle"
                      />
                    </div>
                  )}
                </div>
              )}

              {viewDriver.vehicle && !viewDriver.vehicleRegistration && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="font-semibold">Xe</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Biển số</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicle.plateNumber}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Dòng xe</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicle.model}</p>
                    </div>
                  </div>
                </div>
              )}

              {safeImageArray(viewDriver.cccdImages).length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="font-semibold">Ảnh CCCD</h4>
                  <ImageThumbList
                    urls={safeImageArray(viewDriver.cccdImages).map((img) => getImageUrl(img))}
                    altPrefix="CCCD"
                  />
                </div>
              )}

              {safeImageArray(viewDriver.licenseImages).length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="font-semibold">Ảnh bằng lái</h4>
                  <ImageThumbList
                    urls={safeImageArray(viewDriver.licenseImages).map((img) => getImageUrl(img))}
                    altPrefix="License"
                  />
                </div>
              )}

              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Dịch vụ được phép</h4>
                  {editingServices === null ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingServices([...(viewDriver.enabledServices ?? [])])}
                    >
                      Sửa
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSavingServices}
                        onClick={() => setEditingServices(null)}
                      >
                        Hủy
                      </Button>
                      <Button
                        size="sm"
                        disabled={isSavingServices || editingServices.length === 0}
                        onClick={async () => {
                          if (!viewDriver) return;
                          if (editingServices.length === 0) {
                            toast({ variant: 'destructive', title: 'Thiếu dịch vụ', description: 'Phải bật ít nhất một dịch vụ.' });
                            return;
                          }
                          setIsSavingServices(true);
                          try {
                            const updated = await updateDriverServices(viewDriver.id, editingServices);
                            setViewDriver({ ...viewDriver, enabledServices: updated.enabledServices ?? editingServices });
                            setEditingServices(null);
                            toast({ title: 'Đã cập nhật dịch vụ' });
                            fetchDrivers(activeTab, filters, currentPage, pageSize);
                            refreshNeedsReviewCount();
                          } catch (err: any) {
                            toast({ variant: 'destructive', title: 'Không thể cập nhật', description: err.message });
                          } finally {
                            setIsSavingServices(false);
                          }
                        }}
                      >
                        {isSavingServices && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                        Lưu
                      </Button>
                    </div>
                  )}
                </div>
                {editingServices === null ? (
                  <div className="flex flex-wrap gap-2">
                    {(viewDriver.enabledServices ?? []).length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Chưa bật dịch vụ nào.</p>
                    ) : (
                      viewDriver.enabledServices!.map(service => (
                        <Badge key={service} variant="outline">
                          {service === 'RIDE' ? 'Chở khách (Taxi)' : service === 'CARPOOL' ? 'Đi chung' : service === 'DELIVERY' ? 'Giao hàng' : service}
                        </Badge>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    {['RIDE', 'CARPOOL', 'DELIVERY'].map(service => (
                      <div key={service} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-svc-${service}`}
                          checked={editingServices.includes(service)}
                          onCheckedChange={(checked) => {
                            if (checked) setEditingServices([...editingServices, service]);
                            else setEditingServices(editingServices.filter(s => s !== service));
                          }}
                        />
                        <Label htmlFor={`edit-svc-${service}`} className="text-sm font-normal cursor-pointer">
                          {service === 'RIDE' ? 'Chở khách (Taxi)' : service === 'CARPOOL' ? 'Đi chung' : 'Giao hàng'}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transport company info in detail dialog */}
          {viewDriver && (
            <div className="space-y-2 border-t pt-4">
              <h4 className="font-semibold">Đơn vị vận tải</h4>
              {viewDriver.transportCompany ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tên đơn vị</Label>
                    <p className="font-medium text-sm">{viewDriver.transportCompany.name}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Chủ đơn vị</Label>
                    <p className="font-medium text-sm">{viewDriver.transportCompany.ownerName || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">SĐT chủ</Label>
                    <p className="font-medium text-sm">{viewDriver.transportCompany.ownerPhone || 'N/A'}</p>
                  </div>
                </div>
              ) : viewDriver.customTransportCompanyName ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm">{viewDriver.customTransportCompanyName}</p>
                  <Badge variant="outline" className="text-amber-600 border-amber-300">Chưa xác nhận</Badge>
                </div>
              ) : viewDriver.isIndependentDriver ? (
                <Badge variant="secondary">Tài xế độc lập</Badge>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa cung cấp</p>
              )}
            </div>
          )}

          {viewDriver && viewDriver.isApproved !== 'true' && viewDriver.isApproved !== 'false' && (
            <div className="border-t pt-4">
              {detailAction === null && (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDetailAction('reject')}>
                    <XCircle className="mr-2 h-4 w-4" /> Từ chối
                  </Button>
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => setDetailAction('approve')}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Duyệt
                  </Button>
                </div>
              )}

              {detailAction === 'approve' && (
                <div className="space-y-3">
                  <Label>Loại dịch vụ được phép</Label>
                  <div className="flex flex-col gap-2">
                    {['RIDE', 'CARPOOL', 'DELIVERY'].map((service) => (
                      <div key={service} className="flex items-center space-x-2">
                        <Checkbox
                          id={`detail-approve-${service}`}
                          checked={detailServices.includes(service)}
                          onCheckedChange={(checked) => {
                            if (checked) setDetailServices([...detailServices, service]);
                            else setDetailServices(detailServices.filter(s => s !== service));
                          }}
                        />
                        <Label htmlFor={`detail-approve-${service}`} className="text-sm font-normal cursor-pointer">
                          {service === 'RIDE' ? 'Chở khách (Taxi)' : service === 'CARPOOL' ? 'Đi chung' : 'Giao hàng'}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" disabled={isSubmittingDetail} onClick={resetDetailAction}>Huỷ</Button>
                    <Button className="bg-green-600 hover:bg-green-700" disabled={isSubmittingDetail || detailServices.length === 0} onClick={handleDetailAction}>
                      {isSubmittingDetail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Xác nhận duyệt
                    </Button>
                  </div>
                </div>
              )}

              {detailAction === 'reject' && (
                <div className="space-y-3">
                  <RejectReasonPicker
                    selectedValues={detailReasonValues}
                    onSelectedValuesChange={setDetailReasonValues}
                    note={detailReasonNote}
                    onNoteChange={setDetailReasonNote}
                    disabled={isSubmittingDetail}
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" disabled={isSubmittingDetail} onClick={resetDetailAction}>Huỷ</Button>
                    <Button variant="destructive" disabled={isSubmittingDetail || detailReasonValues.length === 0} onClick={handleDetailAction}>
                      {isSubmittingDetail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Xác nhận từ chối
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Transport Company Dialog */}
      <Dialog open={!!assignDriver} onOpenChange={(open) => { if (!open) { setAssignDriver(null); setSelectedCompanyId(''); } }}>
        <DialogContent className="w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Gán đơn vị vận tải</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Gán đơn vị vận tải chính thức cho tài xế <span className="font-semibold text-foreground">{assignDriver?.name || assignDriver?.user?.fullName || 'N/A'}</span>.
            </p>
            {assignDriver?.customTransportCompanyName && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
                <span className="text-sm">Tài xế đã nhập: <span className="font-medium">{assignDriver.customTransportCompanyName}</span></span>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Chọn đơn vị vận tải</Label>
              <Combobox
                options={transportCompanies.map((c) => ({ value: c.id, label: c.name }))}
                selectedValue={selectedCompanyId}
                onSelect={(v) => setSelectedCompanyId(v || '')}
                placeholder="Chọn đơn vị..."
                searchPlaceholder="Tìm đơn vị..."
                noResultsText="Không tìm thấy đơn vị nào."
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignDriver(null); setSelectedCompanyId(''); }}>Huỷ</Button>
            <Button onClick={handleAssign} disabled={!selectedCompanyId || isAssigning}>
              {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gán đơn vị
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
