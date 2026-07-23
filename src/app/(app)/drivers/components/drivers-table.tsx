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
import { MoreHorizontal, ArrowUpDown, Loader2, CheckCircle, XCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Building2, AlertTriangle, Pencil, Check as CheckIcon, X as XIcon, RotateCcw, Ban, LockOpen, Clock, PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ImageThumbList } from '@/components/ui/image-thumb-list';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { getDrivers, approveDriver, rejectDriver, assignTransportCompany, getTransportCompanyList, updateDriverServices, updateDriverProfile, moveDriverBackToPending, getRoutes, updateDriverRoutes, getPresignedUrl, uploadToS3, banDriver, unbanDriver, suspendDriver, unsuspendDriver } from '@/lib/api';
import { MultiSelectComboBox } from '@/components/ui/multi-select-combobox';
import { DriverIssueBadges } from './driver-issue-badges';
import { DriversFilterBar, EMPTY_FILTERS, hasAnyFilter, type DriverFilters } from './drivers-filter-bar';
import type { Driver, TransportCompany, Route } from '@/lib/types';
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
import { getImageUrl, cn } from '@/lib/utils';
import { RejectReasonPicker } from '@/components/reject-reason-picker';
import { Textarea } from '@/components/ui/textarea';
import { ApprovalTimeline, formatVnDateTime, isSuspendedNow } from './driver-detail-dialog';
import { combineRejectReason } from '@/lib/reject-reasons';
import { WalletAdjustDialog } from './wallet-adjust-dialog';
import { Wallet as WalletIcon } from 'lucide-react';
import { getDriverApprovalStatus } from './driver-approval';

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

// Only fields the backend can ORDER BY (whitelisted in
// drivers.service.findAllForAdmin). Adding a new key requires server-side
// support — there's no client-side fallback anymore.
// Driver approval status is normalized by getDriverApprovalStatus (./driver-approval),
// shared with the transport-companies dialog + xlsx export so the rule can't drift.

type SortKey = 'name' | 'isApproved' | 'createdAt';
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
  // Admin-internal note (optional) — saved on the approval event, NOT shown to the driver.
  const [adminNote, setAdminNote] = React.useState('');
  const [detailAdminNote, setDetailAdminNote] = React.useState('');
  const [moveBackNote, setMoveBackNote] = React.useState('');

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

  // Wallet adjust state — used by both the row dropdown and the detail dialog.
  const [walletDriver, setWalletDriver] = React.useState<Driver | null>(null);

  // Move-back-to-pending state (admin reverses a rejection without re-approving).
  const [moveBackTarget, setMoveBackTarget] = React.useState<Driver | null>(null);
  const [isMovingBack, setIsMovingBack] = React.useState(false);

  // Ban / unban state (admin hard-lock a driver account).
  const [banTarget, setBanTarget] = React.useState<Driver | null>(null);
  const [banReason, setBanReason] = React.useState('');
  const [banNote, setBanNote] = React.useState('');
  const [isBanning, setIsBanning] = React.useState(false);
  const [unbanTarget, setUnbanTarget] = React.useState<Driver | null>(null);
  const [unbanNote, setUnbanNote] = React.useState('');
  const [isUnbanning, setIsUnbanning] = React.useState(false);

  const handleConfirmBan = async () => {
    if (!banTarget) return;
    const reason = banReason.trim();
    if (!reason) {
      toast({ variant: 'destructive', title: 'Thiếu lý do', description: 'Vui lòng nhập lý do khoá tài khoản.' });
      return;
    }
    setIsBanning(true);
    try {
      await banDriver(banTarget.id, reason, banNote);
      toast({ title: 'Đã khoá tài khoản', description: `${banTarget.name || banTarget.user?.fullName || 'Tài xế'} sẽ bị đăng xuất và không đăng nhập được.` });
      if (viewDriver?.id === banTarget.id) setViewDriver(null);
      setBanTarget(null);
      setBanReason('');
      setBanNote('');
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể khoá tài khoản', description: err.message });
    } finally {
      setIsBanning(false);
    }
  };

  const handleConfirmUnban = async () => {
    if (!unbanTarget) return;
    setIsUnbanning(true);
    try {
      await unbanDriver(unbanTarget.id, unbanNote);
      toast({ title: 'Đã mở khoá', description: `${unbanTarget.name || unbanTarget.user?.fullName || 'Tài xế'} có thể đăng nhập lại.` });
      if (viewDriver?.id === unbanTarget.id) setViewDriver(null);
      setUnbanTarget(null);
      setUnbanNote('');
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể mở khoá', description: err.message });
    } finally {
      setIsUnbanning(false);
    }
  };

  // Tạm khoá nhận chuyến (có hẹn giờ).
  const [suspendTarget, setSuspendTarget] = React.useState<Driver | null>(null);
  const [suspendReason, setSuspendReason] = React.useState('');
  const [suspendMode, setSuspendMode] = React.useState<'duration' | 'until'>('duration');
  const [suspendMinutes, setSuspendMinutes] = React.useState<number | null>(null);
  const [suspendUntilLocal, setSuspendUntilLocal] = React.useState('');
  const [isSuspending, setIsSuspending] = React.useState(false);
  const [unsuspendTarget, setUnsuspendTarget] = React.useState<Driver | null>(null);
  const [unsuspendNote, setUnsuspendNote] = React.useState('');
  const [isUnsuspending, setIsUnsuspending] = React.useState(false);

  const SUSPEND_PRESETS: { label: string; minutes: number }[] = [
    { label: '1 giờ', minutes: 60 },
    { label: '3 giờ', minutes: 180 },
    { label: '6 giờ', minutes: 360 },
    { label: '12 giờ', minutes: 720 },
    { label: '1 ngày', minutes: 1440 },
    { label: '3 ngày', minutes: 4320 },
    { label: '7 ngày', minutes: 10080 },
  ];

  const openSuspendDialog = (driver: Driver) => {
    setSuspendReason('');
    setSuspendMode('duration');
    setSuspendMinutes(null);
    // Prefill datetime-local với mốc VN +1 giờ (browser-tz-independent).
    setSuspendUntilLocal(new Date(Date.now() + 7 * 3600_000 + 3600_000).toISOString().slice(0, 16));
    setSuspendTarget(driver);
  };

  const handleConfirmSuspend = async () => {
    if (!suspendTarget) return;
    const reason = suspendReason.trim();
    if (!reason) {
      toast({ variant: 'destructive', title: 'Thiếu lý do', description: 'Vui lòng nhập lý do khoá nhận chuyến.' });
      return;
    }
    let opts: { until?: string; durationMinutes?: number; reason: string };
    if (suspendMode === 'duration') {
      if (!suspendMinutes || suspendMinutes <= 0) {
        toast({ variant: 'destructive', title: 'Thiếu thời lượng', description: 'Chọn nhanh hoặc nhập số giờ/ngày.' });
        return;
      }
      opts = { durationMinutes: suspendMinutes, reason };
    } else {
      if (!suspendUntilLocal) {
        toast({ variant: 'destructive', title: 'Thiếu thời điểm', description: 'Chọn thời điểm kết thúc.' });
        return;
      }
      // datetime-local là giờ VN → nối offset +07:00 thành ISO tuyệt đối (KHÔNG toISOString trên string).
      const until = `${suspendUntilLocal}:00+07:00`;
      if (new Date(until).getTime() <= Date.now()) {
        toast({ variant: 'destructive', title: 'Thời điểm không hợp lệ', description: 'Thời điểm kết thúc phải ở tương lai.' });
        return;
      }
      opts = { until, reason };
    }
    setIsSuspending(true);
    try {
      await suspendDriver(suspendTarget.id, opts);
      toast({ title: 'Đã tạm khoá nhận chuyến', description: `${suspendTarget.name || suspendTarget.user?.fullName || 'Tài xế'} sẽ không nhận chuyến mới tới khi hết hạn.` });
      if (viewDriver?.id === suspendTarget.id) setViewDriver(null);
      setSuspendTarget(null);
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể tạm khoá', description: err.message });
    } finally {
      setIsSuspending(false);
    }
  };

  const handleConfirmUnsuspend = async () => {
    if (!unsuspendTarget) return;
    setIsUnsuspending(true);
    try {
      await unsuspendDriver(unsuspendTarget.id, unsuspendNote);
      toast({ title: 'Đã gỡ khoá nhận chuyến', description: `${unsuspendTarget.name || unsuspendTarget.user?.fullName || 'Tài xế'} có thể nhận chuyến trở lại.` });
      if (viewDriver?.id === unsuspendTarget.id) setViewDriver(null);
      setUnsuspendTarget(null);
      setUnsuspendNote('');
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể gỡ khoá', description: err.message });
    } finally {
      setIsUnsuspending(false);
    }
  };

  // Assign transport company state
  const [assignDriver, setAssignDriver] = React.useState<Driver | null>(null);
  const [transportCompanies, setTransportCompanies] = React.useState<TransportCompany[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string>('');
  const [isAssigning, setIsAssigning] = React.useState(false);

  // Inline edit name state (in view-driver detail dialog)
  const [editingName, setEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState('');
  const [savingName, setSavingName] = React.useState(false);

  // Inline edit vehicle state — admin can correct biển số / hãng / dòng / màu.
  const [editingVehicle, setEditingVehicle] = React.useState(false);
  const [vehicleDraft, setVehicleDraft] = React.useState<{
    plateNumber: string;
    brand: string;
    model: string;
    color: string;
  }>({ plateNumber: '', brand: '', model: '', color: '' });
  const [savingVehicle, setSavingVehicle] = React.useState(false);

  // Upload giấy xác nhận HTX (admin upload hộ tài xế).
  const [uploadingHtx, setUploadingHtx] = React.useState(false);
  const htxFileInputRef = React.useRef<HTMLInputElement>(null);

  // Edit-routes state (multi-route). null = not editing; number[] = staged route ids.
  const [editingRoutes, setEditingRoutes] = React.useState<number[] | null>(null);
  const [savingRoutes, setSavingRoutes] = React.useState(false);
  const [allRoutes, setAllRoutes] = React.useState<Route[]>([]);
  const [loadingRoutes, setLoadingRoutes] = React.useState(false);

  // Enter route-edit mode: seed from the driver's current routes (M2M, else
  // legacy fixedRoute) and lazy-load the full route list for the picker.
  const startEditRoutes = async () => {
    if (!viewDriver) return;
    const current =
      viewDriver.routes && viewDriver.routes.length > 0
        ? viewDriver.routes.map((r) => r.id)
        : viewDriver.fixedRouteId
          ? [viewDriver.fixedRouteId]
          : [];
    setEditingRoutes(current);
    if (allRoutes.length === 0) {
      setLoadingRoutes(true);
      try {
        setAllRoutes(await getRoutes());
      } catch (e: any) {
        toast({ variant: 'destructive', title: 'Không tải được danh sách tuyến', description: e?.message });
      } finally {
        setLoadingRoutes(false);
      }
    }
  };

  const handleSaveRoutes = async () => {
    if (!viewDriver || editingRoutes === null) return;
    // Clearing all routes parks the driver off dispatch — warn explicitly.
    if (editingRoutes.length === 0) {
      const ok = window.confirm(
        'Gỡ hết tuyến sẽ khiến tài xế KHÔNG nhận được chuyến nào cho tới khi gán lại. Tiếp tục?',
      );
      if (!ok) return;
    }
    setSavingRoutes(true);
    try {
      await updateDriverRoutes(viewDriver.id, editingRoutes);
      // Reflect the new routes locally from the picked ids + loaded names so the
      // dialog updates instantly without depending on the response shape.
      const picked = allRoutes
        .filter((r) => editingRoutes.includes(r.id))
        .map((r) => ({ id: r.id, name: r.name }));
      setViewDriver({
        ...viewDriver,
        routes: picked,
        fixedRouteId: editingRoutes[0] ?? undefined,
        fixedRoute: picked[0] ? { id: picked[0].id, name: picked[0].name } : undefined,
      });
      setEditingRoutes(null);
      toast({ title: 'Đã cập nhật tuyến' });
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
      refreshNeedsReviewCount();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Không cập nhật được tuyến', description: e?.message });
    } finally {
      setSavingRoutes(false);
    }
  };

  const handleSaveVehicle = async () => {
    if (!viewDriver) return;
    const current = viewDriver.vehicleRegistration;
    // Only send fields that actually changed; lets backend skip the write
    // entirely if the admin opened edit mode but didn't touch anything.
    const patch: { plateNumber?: string; brand?: string; model?: string; color?: string } = {};
    if (vehicleDraft.plateNumber.trim() !== (current?.plateNumber ?? '')) {
      patch.plateNumber = vehicleDraft.plateNumber.trim();
    }
    if (vehicleDraft.brand.trim() !== (current?.brand ?? '')) {
      patch.brand = vehicleDraft.brand.trim();
    }
    if (vehicleDraft.model.trim() !== (current?.model ?? '')) {
      patch.model = vehicleDraft.model.trim();
    }
    if (vehicleDraft.color.trim() !== (current?.color ?? '')) {
      patch.color = vehicleDraft.color.trim();
    }
    if (Object.keys(patch).length === 0) {
      setEditingVehicle(false);
      return;
    }
    setSavingVehicle(true);
    try {
      const updated = await updateDriverProfile(viewDriver.id, { vehicleRegistration: patch });
      setViewDriver({ ...viewDriver, ...updated });
      toast({ title: 'Đã cập nhật thông tin xe' });
      setEditingVehicle(false);
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
    } catch (e: any) {
      toast({ title: 'Không cập nhật được thông tin xe', description: e?.message, variant: 'destructive' });
    } finally {
      setSavingVehicle(false);
    }
  };

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
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
    } catch (e: any) {
      toast({ title: 'Không cập nhật được tên', description: e?.message, variant: 'destructive' });
    } finally {
      setSavingName(false);
    }
  };

  // Upload ảnh giấy xác nhận HTX: presign → PUT S3 → lưu key lên tài xế. "Thay
  // ảnh" dùng cùng luồng (backend ghi đè). Mirror handleSaveVehicle cho refresh.
  const handleUploadHtxImage = async (file: File) => {
    if (!viewDriver || !file) return;
    setUploadingHtx(true);
    try {
      const presigned = await getPresignedUrl(file.name, file.type || 'application/octet-stream');
      await uploadToS3(presigned.url, file);
      const updated = await updateDriverProfile(viewDriver.id, { htxConfirmationImage: presigned.key });
      setViewDriver({ ...viewDriver, ...updated });
      toast({ title: 'Đã cập nhật giấy xác nhận HTX' });
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
    } catch (e: any) {
      toast({ title: 'Tải ảnh thất bại', description: e?.message, variant: 'destructive' });
    } finally {
      setUploadingHtx(false);
    }
  };

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);

  const fetchGenRef = React.useRef(0);

  const fetchDrivers = React.useCallback(async (
    tab: TableTab,
    f: DriverFilters,
    page: number,
    limit: number,
    sort: { key: SortKey; direction: 'ascending' | 'descending' } | null,
  ) => {
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
        fixedRouteId: f.fixedRouteId || undefined,
        transportCompanyName: f.transportCompanyName || undefined,
        unconfirmedTransportCompany: f.unconfirmedTransportCompany ? 'true' : undefined,
      };
      if (sort) {
        apiParams.sort = sort.key;
        apiParams.order = sort.direction === 'ascending' ? 'asc' : 'desc';
      }
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
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
    }, 400);

    return () => clearTimeout(timer);
  }, [fetchDrivers, activeTab, filters, currentPage, pageSize, sortConfig]);

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

  // Sort now happens on the server (drivers.service.findAllForAdmin), so this
  // is just an alias — `drivers` already contains the ordered current page.
  const sortedDrivers = drivers;

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    // Reset to page 1 so the user starts at the top of the new ordering and
    // doesn't end up on a page that no longer exists for the new sort.
    setCurrentPage(1);
  };

  const getStatusBadge = (driver: Pick<Driver, 'isApproved' | 'rejectionReason'> | null | undefined) => {
    // Use the same enum the action buttons rely on, so the badge can't drift
    // from what the action area shows (and survives isApproved coming back as
    // boolean instead of the legacy 'true' / 'false' strings).
    switch (getDriverApprovalStatus(driver)) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">Đã duyệt</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Từ chối</Badge>;
      case 'pending':
      default:
        return <Badge variant="secondary">Chờ duyệt</Badge>;
    }
  };

  // Live operational state (driver.status). Shown in the "Đã duyệt" tab where
  // approval status is uniform and ops care about who's online right now.
  const getOnlineBadge = (driver: Pick<Driver, 'status'> | null | undefined) => {
    switch (driver?.status) {
      case 'ONLINE':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">Online</Badge>;
      case 'BUSY':
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400">Bận</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">Offline</Badge>;
    }
  };

  // Extra column: approval status on the "Tất cả" tab (mixed states), live
  // online status on the "Đã duyệt" tab (all approved).
  const showStatusCol = activeTab === 'all' || activeTab === 'true';
  const colCount = showStatusCol ? 8 : 7;

  const openConfirmationDialog = (driver: Driver, action: 'approve' | 'reject') => {
    setDialogState({ open: true, driver, action });
  };

  const closeConfirmationDialog = () => {
    setDialogState({ open: false, driver: null, action: 'approve' });
    setRejectionValues([]);
    setRejectionNote('');
    setAdminNote('');
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
        await approveDriver(dialogState.driver.id, enabledServices, adminNote);
        toast({ title: "Đã duyệt tài xế", description: `${driverName} đã được duyệt.` });
      } else {
        if (rejectionValues.length === 0) {
          toast({ title: "Yêu cầu lý do", description: "Vui lòng chọn ít nhất một lý do từ chối.", variant: "destructive" });
          return;
        }
        await rejectDriver(dialogState.driver.id, combineRejectReason(rejectionValues, rejectionNote), adminNote);
        toast({ title: "Đã từ chối tài xế", description: `${driverName} đã bị từ chối.` });
      }
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
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
    setDetailAdminNote('');
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
        await approveDriver(viewDriver.id, detailServices, detailAdminNote);
        toast({ title: 'Đã duyệt tài xế', description: `${driverName} đã được duyệt.` });
      } else {
        await rejectDriver(viewDriver.id, combineRejectReason(detailReasonValues, detailReasonNote), detailAdminNote);
        toast({ title: 'Đã từ chối tài xế', description: `${driverName} đã bị từ chối.` });
      }
      setViewDriver(null);
      resetDetailAction();
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
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
      fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
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
                <TableHead className="text-right">Số dư ví</TableHead>
                <TableHead>Tuyến đường</TableHead>
                {showStatusCol && (
                  <TableHead>{activeTab === 'all' ? 'Trạng thái' : 'Online'}</TableHead>
                )}
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
                  <TableCell colSpan={colCount} className="h-24 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : sortedDrivers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="h-24 text-center">
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
                          <AvatarImage src={getImageUrl(driver.user?.avatarUrl || driver.user?.avatar)} alt={driverName} data-ai-hint="person portrait" />
                          <AvatarFallback>{driverName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="grid">
                          <span className="font-semibold">{driverName}</span>
                          <span className="text-sm text-muted-foreground">{driverPhone}</span>
                          <DriverIssueBadges issues={driver.issues} />
                          {driver.isBanned ? (
                            <Badge variant="destructive" className="w-fit gap-1 mt-0.5">
                              <Ban className="h-3 w-3" /> Đã khoá
                            </Badge>
                          ) : isSuspendedNow(driver) && (
                            <Badge className="w-fit gap-1 mt-0.5 bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">
                              <Clock className="h-3 w-3" /> Tạm khoá chuyến · {formatVnDateTime(driver.suspendedUntil)}
                            </Badge>
                          )}
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
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{driver.customTransportCompanyName}</span>
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Chưa xác nhận</Badge>
                          </div>
                          {driver.customTransportCompanyPhone && (
                            <span className="text-xs text-muted-foreground">{driver.customTransportCompanyPhone}</span>
                          )}
                        </div>
                      ) : driver.isIndependentDriver ? (
                        <Badge variant="secondary">Tài xế độc lập</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Chưa cung cấp</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-medium">{new Intl.NumberFormat('vi-VN').format(driver.wallets?.deposit ?? 0)}<span className="text-muted-foreground"> đ</span></div>
                        <div className="text-xs text-muted-foreground">KM: {new Intl.NumberFormat('vi-VN').format(driver.wallets?.main ?? 0)} đ</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* Multi-route: prefer the M2M `routes` collection;
                          fall back to legacy `fixedRoute` for drivers who
                          haven't been re-saved since the migration. */}
                      {driver.routes && driver.routes.length > 0 ? (
                        // Cap at 2 badges + "+N" (full list on hover) so a driver
                        // with many routes doesn't blow up the row height.
                        <div className="flex flex-wrap gap-1">
                          {driver.routes.slice(0, 2).map((r) => (
                            <span
                              key={r.id}
                              className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium"
                            >
                              {r.name}
                            </span>
                          ))}
                          {driver.routes.length > 2 && (
                            <span
                              className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                              title={driver.routes.map((r) => r.name).join(', ')}
                            >
                              +{driver.routes.length - 2}
                            </span>
                          )}
                        </div>
                      ) : driver.fixedRoute?.name ? (
                        <span className="text-sm font-medium">{driver.fixedRoute.name}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Chưa đăng ký</span>
                      )}
                    </TableCell>
                    {showStatusCol && (
                      <TableCell>
                        {activeTab === 'all' ? getStatusBadge(driver) : getOnlineBadge(driver)}
                      </TableCell>
                    )}
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
                          <DropdownMenuItem onSelect={() => setTimeout(() => setWalletDriver(driver), 0)}>
                            <WalletIcon className="mr-2 h-4 w-4" /> Nạp / trừ tiền
                          </DropdownMenuItem>
                          {driver.isBanned ? (
                            <DropdownMenuItem onSelect={() => setTimeout(() => { setUnbanNote(''); setUnbanTarget(driver); }, 0)}>
                              <LockOpen className="mr-2 h-4 w-4" /> Mở khoá tài khoản
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() => setTimeout(() => { setBanReason(''); setBanNote(''); setBanTarget(driver); }, 0)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Ban className="mr-2 h-4 w-4" /> Khoá tài khoản
                            </DropdownMenuItem>
                          )}
                          {!driver.isBanned && (
                            isSuspendedNow(driver) ? (
                              <DropdownMenuItem onSelect={() => setTimeout(() => { setUnsuspendNote(''); setUnsuspendTarget(driver); }, 0)}>
                                <PlayCircle className="mr-2 h-4 w-4" /> Gỡ khoá nhận chuyến
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => setTimeout(() => openSuspendDialog(driver), 0)}>
                                <Clock className="mr-2 h-4 w-4" /> Khoá nhận chuyến (tạm)
                              </DropdownMenuItem>
                            )
                          )}
                          {(() => {
                            const ds = getDriverApprovalStatus(driver);
                            // Approved drivers also need a way back to rejected
                            // (compliance / re-review). Show reject directly;
                            // approve stays hidden since they're already
                            // approved. Pending drivers see both. Rejected sees
                            // "move back to pending" + approve shortcut.
                            return (
                              <>
                                <DropdownMenuSeparator />
                                {ds === 'rejected' && (
                                  <DropdownMenuItem onSelect={() => setTimeout(() => setMoveBackTarget(driver), 0)}>
                                    <RotateCcw className="mr-2 h-4 w-4" /> Đưa lại Chờ duyệt
                                  </DropdownMenuItem>
                                )}
                                {ds !== 'rejected' && (
                                  <DropdownMenuItem onSelect={() => setTimeout(() => openConfirmationDialog(driver, 'reject'), 0)} className="text-destructive focus:text-destructive">
                                    <XCircle className="mr-2 h-4 w-4" /> Từ chối
                                  </DropdownMenuItem>
                                )}
                                {ds !== 'approved' && (
                                  <DropdownMenuItem onSelect={() => setTimeout(() => openConfirmationDialog(driver, 'approve'), 0)}>
                                    <CheckCircle className="mr-2 h-4 w-4" /> Duyệt
                                  </DropdownMenuItem>
                                )}
                              </>
                            );
                          })()}
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
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-muted-foreground">Ghi chú nội bộ (tuỳ chọn — không hiện cho tài xế)</label>
            <Textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="Ghi chú cho admin…" rows={2} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeConfirmationDialog}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
              {dialogState.action === 'approve' ? 'Duyệt' : 'Xác nhận từ chối'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewDriver} onOpenChange={(open) => { if (!open) { setViewDriver(null); setEditingServices(null); resetDetailAction(); setEditingName(false); setEditingVehicle(false); } }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Chi tiết tài xế</DialogTitle>
          </DialogHeader>
          {viewDriver && (
            <div className="space-y-6">
              <div className="flex items-center space-x-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={getImageUrl(viewDriver.user?.avatarUrl || viewDriver.user?.avatar)} alt={viewDriver.name || viewDriver.user?.fullName} />
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
                  <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
                    Trạng thái: {getStatusBadge(viewDriver)}
                    {viewDriver.isBanned && <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" /> Đã khoá</Badge>}
                  </p>
                </div>
              </div>

              {viewDriver.isBanned && (
                <div className="rounded-md border border-red-400 bg-red-100 dark:border-red-800 dark:bg-red-950/50 p-3 flex items-start gap-2">
                  <Ban className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm">
                    <div className="font-semibold text-red-700 dark:text-red-400">
                      Tài khoản đã bị khoá{viewDriver.bannedAt ? ` · ${new Date(viewDriver.bannedAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
                    </div>
                    {viewDriver.bannedReason && (
                      <p className="mt-0.5 text-red-900 dark:text-red-200">Lý do: {viewDriver.bannedReason}</p>
                    )}
                    <p className="mt-1 text-xs text-red-700/80 dark:text-red-300/80">Tài xế bị đăng xuất và không thể đăng nhập cho tới khi được mở khoá.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300"
                    onClick={() => { const d = viewDriver; setViewDriver(null); setUnbanNote(''); setUnbanTarget(d); }}
                  >
                    <LockOpen className="mr-1.5 h-3.5 w-3.5" /> Mở khoá
                  </Button>
                </div>
              )}

              {!viewDriver.isBanned && isSuspendedNow(viewDriver) && (
                <div className="rounded-md border border-amber-400 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3 flex items-start gap-2">
                  <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1 text-sm">
                    <div className="font-semibold text-amber-700 dark:text-amber-400">
                      Đang tạm khoá nhận chuyến · đến {formatVnDateTime(viewDriver.suspendedUntil)}
                    </div>
                    {viewDriver.suspendedReason && (
                      <p className="mt-0.5 text-amber-900 dark:text-amber-200">Lý do: {viewDriver.suspendedReason}</p>
                    )}
                    <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">Tài xế vẫn đăng nhập được nhưng không nhận chuyến mới tới khi hết hạn.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300"
                    onClick={() => { const d = viewDriver; setViewDriver(null); setUnsuspendNote(''); setUnsuspendTarget(d); }}
                  >
                    <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Gỡ khoá
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">ID</Label>
                  <p className="font-medium text-sm break-all">{viewDriver.id}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Số bằng lái</Label>
                  <p className="font-medium text-sm">{viewDriver.licenseNumber || 'N/A'}</p>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Số dư ví</h4>
                  <Button size="sm" variant="outline" onClick={() => { const d = viewDriver; setViewDriver(null); setWalletDriver(d); }}>
                    <WalletIcon className="mr-2 h-4 w-4" /> Nạp / trừ tiền
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Ví chính (cọc)</div>
                    <div className="font-semibold tabular-nums">{new Intl.NumberFormat('vi-VN').format(viewDriver.wallets?.deposit ?? 0)} đ</div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">Ví khuyến mại</div>
                    <div className="font-semibold tabular-nums">{new Intl.NumberFormat('vi-VN').format(viewDriver.wallets?.main ?? 0)} đ</div>
                  </div>
                </div>
              </div>

              {viewDriver.vehicleRegistration && (
                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Đăng ký xe</h4>
                    {!editingVehicle ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1"
                        onClick={() => {
                          setVehicleDraft({
                            plateNumber: viewDriver.vehicleRegistration?.plateNumber ?? '',
                            brand: viewDriver.vehicleRegistration?.brand ?? '',
                            model: viewDriver.vehicleRegistration?.model ?? '',
                            color: viewDriver.vehicleRegistration?.color ?? '',
                          });
                          setEditingVehicle(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Sửa
                      </Button>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1"
                          onClick={handleSaveVehicle}
                          disabled={savingVehicle}
                        >
                          {savingVehicle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckIcon className="h-3.5 w-3.5" />}
                          Lưu
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1"
                          onClick={() => setEditingVehicle(false)}
                          disabled={savingVehicle}
                        >
                          <XIcon className="h-3.5 w-3.5" />
                          Huỷ
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Biển số</Label>
                      {editingVehicle ? (
                        <Input
                          className="h-8"
                          value={vehicleDraft.plateNumber}
                          onChange={(e) => setVehicleDraft((d) => ({ ...d, plateNumber: e.target.value }))}
                          disabled={savingVehicle}
                        />
                      ) : (
                        <p className="font-medium text-sm">{viewDriver.vehicleRegistration.plateNumber}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Hãng xe</Label>
                      {editingVehicle ? (
                        <Input
                          className="h-8"
                          value={vehicleDraft.brand}
                          onChange={(e) => setVehicleDraft((d) => ({ ...d, brand: e.target.value }))}
                          disabled={savingVehicle}
                        />
                      ) : (
                        <p className="font-medium text-sm">{viewDriver.vehicleRegistration.brand}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Dòng xe</Label>
                      {editingVehicle ? (
                        <Input
                          className="h-8"
                          value={vehicleDraft.model}
                          onChange={(e) => setVehicleDraft((d) => ({ ...d, model: e.target.value }))}
                          disabled={savingVehicle}
                        />
                      ) : (
                        <p className="font-medium text-sm">{viewDriver.vehicleRegistration.model}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Màu sắc</Label>
                      {editingVehicle ? (
                        <Input
                          className="h-8"
                          value={vehicleDraft.color}
                          onChange={(e) => setVehicleDraft((d) => ({ ...d, color: e.target.value }))}
                          disabled={savingVehicle}
                        />
                      ) : (
                        <p className="font-medium text-sm">{viewDriver.vehicleRegistration.color}</p>
                      )}
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

              {/* Giấy xác nhận HTX — admin upload hộ tài xế. Luôn hiển thị (kể cả
                  khi chưa có) để admin có nút Tải lên; có rồi thì nút Thay ảnh. */}
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Giấy xác nhận HTX</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingHtx}
                    onClick={() => htxFileInputRef.current?.click()}
                  >
                    {uploadingHtx && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {viewDriver.htxConfirmationImage ? 'Thay ảnh' : 'Tải lên'}
                  </Button>
                </div>
                {viewDriver.htxConfirmationImage ? (
                  <ImageThumbList
                    urls={[getImageUrl(viewDriver.htxConfirmationImage)]}
                    altPrefix="HTX"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Chưa có ảnh giấy xác nhận.</p>
                )}
                <input
                  ref={htxFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadHtxImage(f);
                    e.target.value = ''; // cho phép chọn lại cùng file
                  }}
                />
              </div>

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
                            fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
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

          {/* Routes (multi-route) in detail dialog */}
          {viewDriver && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Tuyến đường</h4>
                {editingRoutes === null ? (
                  <Button variant="ghost" size="sm" onClick={startEditRoutes}>Sửa</Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" disabled={savingRoutes} onClick={() => setEditingRoutes(null)}>Hủy</Button>
                    <Button size="sm" disabled={savingRoutes || loadingRoutes} onClick={handleSaveRoutes}>
                      {savingRoutes && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      Lưu
                    </Button>
                  </div>
                )}
              </div>
              {editingRoutes === null ? (
                <div className="flex flex-wrap gap-2">
                  {viewDriver.routes && viewDriver.routes.length > 0 ? (
                    viewDriver.routes.map((r) => <Badge key={r.id} variant="outline">{r.name}</Badge>)
                  ) : viewDriver.fixedRoute?.name ? (
                    <Badge variant="outline">{viewDriver.fixedRoute.name}</Badge>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Chưa đăng ký tuyến nào.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  {loadingRoutes ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Đang tải tuyến…</p>
                  ) : (
                    <MultiSelectComboBox
                      options={allRoutes.map((r) => ({ value: String(r.id), label: r.name }))}
                      selectedValues={editingRoutes.map(String)}
                      onSelectedValuesChange={(vals) => setEditingRoutes(vals.map(Number))}
                      placeholder="Chọn tuyến…"
                      searchPlaceholder="Tìm tuyến…"
                      noResultsText="Không có tuyến phù hợp"
                    />
                  )}
                  {editingRoutes.length === 0 && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Gỡ hết tuyến: tài xế sẽ KHÔNG nhận được chuyến nào cho tới khi gán lại.
                    </p>
                  )}
                </div>
              )}
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
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm">{viewDriver.customTransportCompanyName}</p>
                    <Badge variant="outline" className="text-amber-600 border-amber-300">Chưa xác nhận</Badge>
                  </div>
                  {viewDriver.customTransportCompanyPhone && (
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground">SĐT liên hệ:</Label>
                      <p className="text-sm">{viewDriver.customTransportCompanyPhone}</p>
                    </div>
                  )}
                </div>
              ) : viewDriver.isIndependentDriver ? (
                <Badge variant="secondary">Tài xế độc lập</Badge>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa cung cấp</p>
              )}
              {/* Đổi/gán đơn vị vận tải ngay trong dialog chi tiết — mở lại đúng dialog picker
                  "Gán đơn vị vận tải" sẵn có (đóng dialog chi tiết trước để tránh 2 dialog chồng). */}
              <Button
                size="sm"
                variant="outline"
                className="mt-1"
                onClick={() => { const d = viewDriver; setViewDriver(null); openAssignDialog(d); }}
              >
                <Building2 className="mr-1.5 h-3.5 w-3.5" />
                {viewDriver.transportCompany ? 'Đổi đơn vị vận tải' : 'Gán đơn vị vận tải'}
              </Button>
            </div>
          )}

          {viewDriver && (
            <div className="border-t pt-4 space-y-2">
              <h4 className="font-semibold">Lịch sử duyệt</h4>
              <ApprovalTimeline driverId={viewDriver.id} showAdminNote />
            </div>
          )}

          {(() => {
            const status = getDriverApprovalStatus(viewDriver);
            // Always render the action footer so an approved driver can be
            // sent back to "rejected" (compliance / re-review). The buttons
            // inside reshape by status — see comments below.
            return (
            <div className="border-t pt-4">
              {detailAction === null && (
                <div className="flex flex-wrap justify-end gap-2">
                  {!viewDriver?.isBanned && (
                    <div className="flex flex-wrap gap-2 mr-auto">
                      <Button
                        variant="outline"
                        className="text-destructive hover:text-destructive border-red-300 dark:border-red-800"
                        onClick={() => {
                          if (!viewDriver) return;
                          const d = viewDriver;
                          setViewDriver(null);
                          setBanReason('');
                          setBanNote('');
                          setBanTarget(d);
                        }}
                      >
                        <Ban className="mr-2 h-4 w-4" /> Khoá tài khoản
                      </Button>
                      {!isSuspendedNow(viewDriver) && (
                        <Button
                          variant="outline"
                          className="text-amber-700 hover:text-amber-800 border-amber-300 dark:border-amber-800 dark:text-amber-300"
                          onClick={() => {
                            if (!viewDriver) return;
                            const d = viewDriver;
                            setViewDriver(null);
                            openSuspendDialog(d);
                          }}
                        >
                          <Clock className="mr-2 h-4 w-4" /> Khoá nhận chuyến
                        </Button>
                      )}
                    </div>
                  )}
                  {status === 'rejected' && (
                    <Button
                      onClick={() => {
                        if (!viewDriver) return;
                        // Close the detail Dialog before opening the confirm
                        // AlertDialog — Radix leaves body.pointer-events=none
                        // when two modals close in rapid succession.
                        const d = viewDriver;
                        setViewDriver(null);
                        setMoveBackTarget(d);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" /> Đưa lại Chờ duyệt
                    </Button>
                  )}
                  {status !== 'rejected' && (
                    <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDetailAction('reject')}>
                      <XCircle className="mr-2 h-4 w-4" /> Từ chối
                    </Button>
                  )}
                  {status !== 'approved' && (
                    <Button className="bg-green-600 hover:bg-green-700" onClick={() => setDetailAction('approve')}>
                      <CheckCircle className="mr-2 h-4 w-4" /> Duyệt
                    </Button>
                  )}
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
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Ghi chú nội bộ (tuỳ chọn — không hiện cho tài xế)</label>
                    <Textarea value={detailAdminNote} onChange={(e) => setDetailAdminNote(e.target.value)} placeholder="Ghi chú cho admin…" rows={2} disabled={isSubmittingDetail} />
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

              {detailAction === 'reject' && status !== 'rejected' && (
                <div className="space-y-3">
                  <RejectReasonPicker
                    selectedValues={detailReasonValues}
                    onSelectedValuesChange={setDetailReasonValues}
                    note={detailReasonNote}
                    onNoteChange={setDetailReasonNote}
                    disabled={isSubmittingDetail}
                  />
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Ghi chú nội bộ (tuỳ chọn — không hiện cho tài xế)</label>
                    <Textarea value={detailAdminNote} onChange={(e) => setDetailAdminNote(e.target.value)} placeholder="Ghi chú cho admin…" rows={2} disabled={isSubmittingDetail} />
                  </div>
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
            );
          })()}
        </DialogContent>
      </Dialog>

      <WalletAdjustDialog
        driver={walletDriver}
        onClose={() => setWalletDriver(null)}
        onAdjusted={() => fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig)}
      />

      {/* Move-back-to-pending confirm */}
      <AlertDialog open={!!moveBackTarget} onOpenChange={(open) => { if (!open && !isMovingBack) { setMoveBackTarget(null); setMoveBackNote(''); } }}>
        <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Đưa lại Chờ duyệt</AlertDialogTitle>
            <AlertDialogDescription>
              Tài xế <span className="font-semibold text-foreground">{moveBackTarget?.name || moveBackTarget?.user?.fullName || 'N/A'}</span> sẽ chuyển từ "Từ chối" về "Chờ duyệt". Lý do từ chối cũ sẽ bị xoá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Ghi chú nội bộ (tuỳ chọn — không hiện cho tài xế)</label>
            <Textarea value={moveBackNote} onChange={(e) => setMoveBackNote(e.target.value)} placeholder="Ghi chú cho admin…" rows={2} disabled={isMovingBack} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMovingBack}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={isMovingBack}
              onClick={async (e) => {
                e.preventDefault();
                if (!moveBackTarget) return;
                setIsMovingBack(true);
                try {
                  await moveDriverBackToPending(moveBackTarget.id, moveBackNote);
                  toast({ title: 'Đã đưa về Chờ duyệt', description: moveBackTarget.name || moveBackTarget.user?.fullName || '' });
                  setMoveBackTarget(null);
                  setMoveBackNote('');
                  if (viewDriver?.id === moveBackTarget.id) setViewDriver(null);
                  fetchDrivers(activeTab, filters, currentPage, pageSize, sortConfig);
                  refreshNeedsReviewCount();
                } catch (err: any) {
                  toast({ variant: 'destructive', title: 'Không thể thực hiện', description: err.message });
                } finally {
                  setIsMovingBack(false);
                }
              }}
            >
              {isMovingBack && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ban account confirm — reason required */}
      <AlertDialog open={!!banTarget} onOpenChange={(open) => { if (!open && !isBanning) { setBanTarget(null); setBanReason(''); setBanNote(''); } }}>
        <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="h-5 w-5" /> Khoá tài khoản tài xế
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tài xế <span className="font-semibold text-foreground">{banTarget?.name || banTarget?.user?.fullName || 'N/A'}</span> sẽ bị <span className="font-semibold">đăng xuất ngay</span> và <span className="font-semibold">không thể đăng nhập</span>, không nhận chuyến cho tới khi được mở khoá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Lý do khoá <span className="text-destructive">*</span> (tài xế sẽ thấy lý do này)</label>
              <Textarea value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Ví dụ: gian lận cước, giả mạo hồ sơ…" rows={2} disabled={isBanning} autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Ghi chú nội bộ (tuỳ chọn — không hiện cho tài xế)</label>
              <Textarea value={banNote} onChange={(e) => setBanNote(e.target.value)} placeholder="Ghi chú cho admin…" rows={2} disabled={isBanning} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBanning}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBanning || !banReason.trim()}
              onClick={(e) => { e.preventDefault(); handleConfirmBan(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBanning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận khoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unban account confirm */}
      <AlertDialog open={!!unbanTarget} onOpenChange={(open) => { if (!open && !isUnbanning) { setUnbanTarget(null); setUnbanNote(''); } }}>
        <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LockOpen className="h-5 w-5" /> Mở khoá tài khoản
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tài xế <span className="font-semibold text-foreground">{unbanTarget?.name || unbanTarget?.user?.fullName || 'N/A'}</span> sẽ đăng nhập lại được và trở lại trạng thái trước khi bị khoá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Ghi chú nội bộ (tuỳ chọn)</label>
            <Textarea value={unbanNote} onChange={(e) => setUnbanNote(e.target.value)} placeholder="Ghi chú cho admin…" rows={2} disabled={isUnbanning} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnbanning}>Huỷ</AlertDialogCancel>
            <AlertDialogAction disabled={isUnbanning} onClick={(e) => { e.preventDefault(); handleConfirmUnban(); }}>
              {isUnbanning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận mở khoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Suspend (temp trip-lock) confirm — presets or specific VN datetime */}
      <AlertDialog open={!!suspendTarget} onOpenChange={(open) => { if (!open && !isSuspending) { setSuspendTarget(null); } }}>
        <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Clock className="h-5 w-5" /> Tạm khoá nhận chuyến
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tài xế <span className="font-semibold text-foreground">{suspendTarget?.name || suspendTarget?.user?.fullName || 'N/A'}</span> sẽ <span className="font-semibold">không nhận chuyến mới</span> trong thời hạn (vẫn đăng nhập/dùng app được). Tự mở lại khi hết hạn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={suspendMode === 'duration' ? 'default' : 'outline'} onClick={() => setSuspendMode('duration')} disabled={isSuspending}>Theo thời lượng</Button>
              <Button type="button" size="sm" variant={suspendMode === 'until' ? 'default' : 'outline'} onClick={() => setSuspendMode('until')} disabled={isSuspending}>Đến mốc cụ thể</Button>
            </div>

            {suspendMode === 'duration' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {SUSPEND_PRESETS.map((p) => (
                    <Button key={p.minutes} type="button" size="sm" variant={suspendMinutes === p.minutes ? 'default' : 'outline'} onClick={() => setSuspendMinutes(p.minutes)} disabled={isSuspending}>
                      {p.label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Hoặc tự nhập số giờ:</Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 w-24"
                    placeholder="giờ"
                    value={suspendMinutes && !SUSPEND_PRESETS.some((p) => p.minutes === suspendMinutes) ? String(suspendMinutes / 60) : ''}
                    onChange={(e) => { const h = Number(e.target.value); setSuspendMinutes(Number.isFinite(h) && h > 0 ? Math.round(h * 60) : null); }}
                    disabled={isSuspending}
                  />
                </div>
                {suspendMinutes ? (
                  <p className="text-xs text-muted-foreground">Kết thúc khoảng: {formatVnDateTime(new Date(Date.now() + suspendMinutes * 60000).toISOString())} (giờ VN)</p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Thời điểm kết thúc (giờ VN)</Label>
                <Input type="datetime-local" className="h-9" value={suspendUntilLocal} onChange={(e) => setSuspendUntilLocal(e.target.value)} disabled={isSuspending} />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Lý do <span className="text-destructive">*</span> (tài xế sẽ thấy)</label>
              <Textarea value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} placeholder="Ví dụ: vi phạm giờ giấc, cần xác minh lại…" rows={2} disabled={isSuspending} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSuspending}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSuspending || !suspendReason.trim() || (suspendMode === 'duration' ? !suspendMinutes : !suspendUntilLocal)}
              onClick={(e) => { e.preventDefault(); handleConfirmSuspend(); }}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {isSuspending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận khoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsuspend confirm */}
      <AlertDialog open={!!unsuspendTarget} onOpenChange={(open) => { if (!open && !isUnsuspending) { setUnsuspendTarget(null); setUnsuspendNote(''); } }}>
        <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5" /> Gỡ khoá nhận chuyến
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tài xế <span className="font-semibold text-foreground">{unsuspendTarget?.name || unsuspendTarget?.user?.fullName || 'N/A'}</span> sẽ nhận chuyến trở lại ngay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Ghi chú nội bộ (tuỳ chọn)</label>
            <Textarea value={unsuspendNote} onChange={(e) => setUnsuspendNote(e.target.value)} placeholder="Ghi chú cho admin…" rows={2} disabled={isUnsuspending} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnsuspending}>Huỷ</AlertDialogCancel>
            <AlertDialogAction disabled={isUnsuspending} onClick={(e) => { e.preventDefault(); handleConfirmUnsuspend(); }}>
              {isUnsuspending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận gỡ khoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              {/* Inline Command instead of Combobox/Popover — Radix Popover inside
                  Radix Dialog has focus/click conflicts because PopoverContent
                  is portaled outside the Dialog. A flat search + list has no
                  portal and no nested modal, so typing and clicking just work. */}
              <Command className="border rounded-md">
                <CommandInput placeholder="Tìm đơn vị..." />
                <CommandList className="max-h-64">
                  <CommandEmpty>Không tìm thấy đơn vị nào.</CommandEmpty>
                  <CommandGroup>
                    {transportCompanies.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={`${c.name}__${c.id}`}
                        onSelect={() => setSelectedCompanyId(c.id)}
                      >
                        <CheckIcon className={cn('mr-2 h-4 w-4', selectedCompanyId === c.id ? 'opacity-100' : 'opacity-0')} />
                        {c.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
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
