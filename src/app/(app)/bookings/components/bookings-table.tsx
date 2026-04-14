'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import { Button } from '@/components/ui/button';
import { MoreHorizontal, ArrowUpDown, Loader2, Search, Car, User, Phone } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { getBookings, getBookingDetails, updateBookingStatus, getAvailableDrivers, reassignBooking, adminAcceptBooking } from '@/lib/api';
import { CreateBookingDialog } from './create-booking-dialog';
import type { Booking, BookingStatus, Driver } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

type SortKey = keyof Booking;
const allStatuses: BookingStatus[] = ['SEARCHING', 'SCHEDULED', 'ACCEPTED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'];

const statusLabelMap: Record<string, string> = {
  ALL: 'Tất cả',
  SEARCHING: 'Đang tìm',
  SCHEDULED: 'Đặt lịch',
  ACCEPTED: 'Đã nhận',
  PICKED_UP: 'Đã đón',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

function BookingDetail({ bookingId, onClose }: { bookingId: string, onClose: () => void }) {
  const [booking, setBooking] = React.useState<Booking | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    const fetchDetails = async () => {
      if (!bookingId) return;
      setIsLoading(true);
      setError(null);
      try {
        const details = await getBookingDetails(bookingId);
        setBooking(details);
      } catch (err: any) {
        setError(err.message);
        toast({ variant: 'destructive', title: 'Không thể tải chi tiết', description: err.message });
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetails();
  }, [bookingId, toast]);

  const serviceTypeMap: Record<string, string> = {
    RIDE: '🚗 Chở khách',
    DELIVERY: '📦 Giao hàng',
    CARPOOL: '🚌 Đi chung',
  };

  const paymentMethodMap: Record<string, string> = {
    CASH: '💵 Tiền mặt',
    WALLET: '💳 Ví điện tử',
  };

  const getAddress = (addr: string | { address: string; lat?: number; lng?: number; long?: number } | null | undefined): string => {
    if (!addr) return 'N/A';
    if (typeof addr === 'string') return addr;
    return addr.address || 'N/A';
  };

  const getCoords = (addr: string | { address: string; lat?: number; lng?: number; long?: number } | null | undefined): string | null => {
    if (!addr || typeof addr === 'string') return null;
    const lat = addr.lat;
    const lng = addr.lng ?? (addr as any).long;
    if (lat != null && lng != null) return `${lat}, ${lng}`;
    return null;
  };

  const driverName = booking?.driver
    ? (booking.driver as any).fullName || booking.driver.name || booking.driver.fullName || 'N/A'
    : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
        <DialogHeader>
          <DialogTitle>Chi tiết chuyến đi</DialogTitle>
          <DialogDescription>
            Mã chuyến: {bookingId}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>}
          {error && <p className="text-destructive text-center py-4">{error}</p>}
          {booking && (
            <>
              {/* Status & Service */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusBadge(booking.status)}
                  {booking.serviceType && (
                    <Badge variant="outline" className="text-xs">
                      {serviceTypeMap[booking.serviceType] ?? booking.serviceType}
                    </Badge>
                  )}
                  {booking.isPooled && <Badge variant="secondary" className="text-xs">Đi chung</Badge>}
                </div>
                {booking.paymentMethod && (
                  <span className="text-xs text-muted-foreground">
                    {paymentMethodMap[booking.paymentMethod] ?? booking.paymentMethod}
                  </span>
                )}
              </div>

              {/* Customer */}
              <Card className="p-3 space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Khách hàng</div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 text-sm">
                    <div className="font-semibold">{booking.customer?.fullName ?? 'N/A'}</div>
                    <div className="text-muted-foreground">{booking.customer?.phone ?? 'N/A'}</div>
                  </div>
                </div>
              </Card>

              {/* Driver */}
              <Card className="p-3 space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tài xế</div>
                {driverName ? (
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <Car className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="font-semibold">{driverName}</div>
                      <div className="text-muted-foreground">{booking.driver?.phone ?? 'N/A'}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Chưa có tài xế</p>
                )}
              </Card>

              {/* Addresses */}
              <Card className="p-3 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tuyến đường</div>
                <div className="space-y-2">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-3 rounded-full bg-green-500 mt-1" />
                      <div className="w-0.5 flex-1 bg-border my-1" />
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="font-medium">Điểm đón</div>
                      <div className="text-muted-foreground">{getAddress(booking.pickupAddress)}</div>
                      {getCoords(booking.pickupAddress) && (
                        <div className="text-xs text-muted-foreground/60 mt-0.5">📍 {getCoords(booking.pickupAddress)}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-3 w-3 rounded-full bg-red-500 mt-1" />
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="font-medium">Điểm trả</div>
                      <div className="text-muted-foreground">{getAddress(booking.dropoffAddress)}</div>
                      {getCoords(booking.dropoffAddress) && (
                        <div className="text-xs text-muted-foreground/60 mt-0.5">📍 {getCoords(booking.dropoffAddress)}</div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Pricing */}
              <Card className="p-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chi phí</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-muted-foreground">Giá gốc</div>
                    <div className="font-semibold">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.price)}</div>
                  </div>
                  {booking.finalPrice != null && booking.finalPrice !== booking.price && (
                    <div>
                      <div className="text-muted-foreground">Giá cuối</div>
                      <div className="font-semibold text-green-600">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.finalPrice)}</div>
                    </div>
                  )}
                  {booking.requestedSeats != null && (
                    <div>
                      <div className="text-muted-foreground">Số ghế yêu cầu</div>
                      <div className="font-semibold">{booking.requestedSeats}</div>
                    </div>
                  )}
                  {booking.requestedVehicleType && (
                    <div>
                      <div className="text-muted-foreground">Loại xe</div>
                      <div className="font-semibold">{booking.requestedVehicleType}</div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Note */}
              {booking.note && (
                <Card className="p-3 space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ghi chú</div>
                  <p className="text-sm whitespace-pre-wrap">{booking.note}</p>
                </Card>
              )}

              {/* Cancel Reason */}
              {booking.cancelReason && (
                <Card className="p-3 space-y-1 border-destructive/30 bg-destructive/5">
                  <div className="text-xs font-semibold text-destructive uppercase tracking-wider">Lý do hủy</div>
                  <p className="text-sm">{booking.cancelReason}</p>
                </Card>
              )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t pt-3">
                <div>
                  <span className="font-medium">Ngày tạo:</span>{' '}
                  {format(new Date(booking.createdAt), "dd/MM/yyyy HH:mm")}
                </div>
                {booking.updatedAt && (
                  <div>
                    <span className="font-medium">Cập nhật:</span>{' '}
                    {format(new Date(booking.updatedAt), "dd/MM/yyyy HH:mm")}
                  </div>
                )}
              </div>

              {/* Share Link */}
              {booking.shareLink && (
                <div className="text-xs border-t pt-3">
                  <span className="font-medium text-muted-foreground">Link chia sẻ:</span>{' '}
                  <a href={booking.shareLink} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
                    {booking.shareLink}
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({ booking, open, onOpenChange, onReassignSuccess }: { booking: Booking | null, open: boolean, onOpenChange: (open: boolean) => void, onReassignSuccess: () => void }) {
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isReassigning, setIsReassigning] = React.useState(false);
  const [selectedDriverId, setSelectedDriverId] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    const fetchDrivers = async () => {
      if (!open) return;
      setIsLoading(true);
      try {
        const response = await getAvailableDrivers();
        setDrivers(response);
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Không thể tải danh sách tài xế', description: err.message });
      } finally {
        setIsLoading(false);
      }
    };
    fetchDrivers();
  }, [open, toast]);

  const handleReassign = async () => {
    if (!booking || !selectedDriverId) return;
    setIsReassigning(true);
    try {
      await reassignBooking(booking.id, selectedDriverId);
      toast({ title: 'Thành công', description: `Đã chuyển quốc chuyến thành công.` });
      onReassignSuccess();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Chuyển quốc thất bại', description: err.message });
    } finally {
      setIsReassigning(false);
    }
  }

  // Derive display name: API may return fullName at top level or nested under user
  const getDriverName = (driver: Driver) =>
    (driver as any).fullName || driver.name || driver.user?.fullName || 'N/A';

  const getDriverId = (driver: Driver) =>
    (driver as any).driverId || driver.user?.id || driver.id;

  const getDriverAvatar = (driver: Driver) =>
    driver.user?.avatarUrl || driver.user?.avatar || (driver as any).avatar || '';

  const getDriverRoute = (driver: Driver) =>
    driver.fixedRoute?.name || null;

  const getDriverPlate = (driver: Driver) =>
    driver.vehicle?.plateNumber || driver.vehicleRegistration?.plateNumber || null;

  return (
    <DialogContent className="sm:max-w-lg" onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
      <DialogHeader>
        <DialogTitle>Chuyển quốc chuyến #{booking?.id?.slice(0, 8)}...</DialogTitle>
        <DialogDescription>Chọn tài xế mới cho chuyến này. Chỉ hiển thị tài xế đang online.</DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto p-1">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : drivers.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Không tìm thấy tài xế khả dụng.</p>
        ) : (
          <div className="space-y-2">
            {drivers.map(driver => {
              const name = getDriverName(driver);
              const id = getDriverId(driver);
              const avatar = getDriverAvatar(driver);
              const route = getDriverRoute(driver);
              const plate = getDriverPlate(driver);

              return (
                <Card
                  key={driver.id || id}
                  className={cn(
                    "p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/50 transition-colors",
                    selectedDriverId === id && "ring-2 ring-primary bg-primary/5"
                  )}
                  onClick={() => setSelectedDriverId(id)}
                >
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={avatar} alt={name} data-ai-hint="person portrait" />
                    <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className='flex-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm'>
                    <div className="flex items-center gap-2 font-semibold"><User className="h-4 w-4 text-muted-foreground" /> {name}</div>
                    <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {driver.phone}</div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Car className="h-4 w-4" />
                      {route ? route : ''}
                      {plate ? ` • ${plate}` : ''}
                      {!route && !plate ? 'Chưa có thông tin xe' : ''}
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      {(driver as any).availableSeats != null && (
                        <Badge variant="outline" className="text-xs">
                          {(driver as any).availableSeats} ghế trống
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
        <Button onClick={handleReassign} disabled={!selectedDriverId || isReassigning}>
          {isReassigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Xác nhận chuyển quốc
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}


function getStatusBadge(status: Booking['status']) {
  switch (status) {
    case 'COMPLETED':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400 capitalize">{status.toLowerCase().replace('_', ' ')}</Badge>;
    case 'ACCEPTED':
    case 'PICKED_UP':
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400 capitalize">{status.toLowerCase().replace('_', ' ')}</Badge>;
    case 'SEARCHING':
      return <Badge variant="secondary" className="capitalize">{status.toLowerCase().replace('_', ' ')}</Badge>;
    case 'CANCELLED':
      return <Badge variant="destructive" className="capitalize">{status.toLowerCase().replace('_', ' ')}</Badge>;
    default:
      return <Badge className="capitalize">{status ? String(status).toLowerCase().replace('_', ' ') : ''}</Badge>;
  }
};

export function BookingsTable() {
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<string>('ALL');

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);

  const [selectedBookingId, setSelectedBookingId] = React.useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = React.useState(false);
  const [reassigningBooking, setReassigningBooking] = React.useState<Booking | null>(null);

  const [dialogState, setDialogState] = React.useState<{ open: boolean; booking: Booking | null; newStatus: BookingStatus | null }>({ open: false, booking: null, newStatus: null });
  const [statusNote, setStatusNote] = React.useState('');
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [acceptingBookingId, setAcceptingBookingId] = React.useState<string | null>(null);
  const [isAccepting, setIsAccepting] = React.useState(false);


  const fetchBookings = React.useCallback(async (status: string, search: string, page: number, limit: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = { page, limit, status: status === 'ALL' ? undefined : status };
      if (search) {
        params.customerId = search;
      }

      const response = await getBookings(params);
      setBookings(response.data);
      setTotalPages(response.totalPages || 1);
      setTotalItems(response.total || 0);
    } catch (err: any) {
      setError(err.message);
      toast({
        variant: "destructive",
        title: "Failed to fetch bookings",
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchBookings(activeTab, searchTerm, currentPage, pageSize);
    }, 500); // Debounce search

    return () => clearTimeout(timer);
  }, [fetchBookings, activeTab, searchTerm, currentPage, pageSize]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as string);
    setCurrentPage(1); // Reset to page 1 on tab change
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to page 1 on search
  }

  const openDetails = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setIsDetailOpen(true);
  }

  const handleStatusUpdate = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!dialogState.booking || !dialogState.newStatus) return;

    setIsUpdating(true);
    try {
      await updateBookingStatus(dialogState.booking.id, dialogState.newStatus, statusNote || undefined);
      toast({ title: 'Status Updated', description: `Booking #${dialogState.booking.id} has been updated to ${dialogState.newStatus}.` });
      fetchBookings(activeTab, searchTerm, currentPage, pageSize);
      setDialogState({ open: false, booking: null, newStatus: null });
      setStatusNote('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to update status', description: err.message });
    } finally {
      setIsUpdating(false);
    }
  }

  const openConfirmationDialog = (booking: Booking, newStatus: BookingStatus) => {
    setDialogState({ open: true, booking, newStatus });
  }

  const handleAcceptBooking = async () => {
    if (!acceptingBookingId) return;
    setIsAccepting(true);
    try {
      await adminAcceptBooking(acceptingBookingId);
      toast({ title: 'Thành công', description: 'Đã nhận chuyến thành công.' });
      fetchBookings(activeTab, searchTerm, currentPage, pageSize);
      setAcceptingBookingId(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Nhận chuyến thất bại', description: err.message });
    } finally {
      setIsAccepting(false);
    }
  }

  const sortedBookings = React.useMemo(() => {
    let sortableBookings = [...bookings];
    if (sortConfig !== null) {
      sortableBookings.sort((a, b) => {
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
    return sortableBookings;
  }, [bookings, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const statusChangeOptions: BookingStatus[] = ['ACCEPTED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'];

  return (
    <>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex items-center pb-4">
          <TabsList className='flex-wrap h-auto'>
            <TabsTrigger value="ALL">{statusLabelMap['ALL']}</TabsTrigger>
            {allStatuses.map(status => (
              <TabsTrigger key={status} value={status}>{statusLabelMap[status] ?? status}</TabsTrigger>
            ))}
          </TabsList>
          <div className='ml-auto flex items-center gap-2'>
            <CreateBookingDialog onSuccess={() => fetchBookings(activeTab, searchTerm, currentPage, pageSize)} />
            <div className='relative'>
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm theo ID khách/tài xế"
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="max-w-sm pl-8"
              />
            </div>
          </div>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Khách hàng</TableHead>
                <TableHead>Tài xế</TableHead>
                <TableHead>Tuyến đường</TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('price')}>
                    Giá
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
                  <Button variant="ghost" onClick={() => requestSort('status')}>
                    Trạng thái
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : sortedBookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    Không tìm thấy chuyến nào.
                  </TableCell>
                </TableRow>
              ) : (
                sortedBookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span className='font-semibold'>{booking.customer?.fullName ?? 'N/A'}</span>
                        <span className='text-sm text-muted-foreground'>{booking.customer?.phone ?? 'N/A'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {booking.driver ? (
                        <div className="flex flex-col">
                          <span className='font-semibold'>{booking.driver.fullName ?? booking.driver.name ?? 'N/A'}</span>
                          <span className='text-sm text-muted-foreground'>{booking.driver.phone}</span>
                        </div>
                      ) : (
                        <span className='text-sm text-muted-foreground'>N/A</span>
                      )}
                    </TableCell>
                    <TableCell className='max-w-xs'>
                      <div className="flex flex-col">
                        <span className='truncate'><span className='font-medium'>From:</span> {typeof booking.pickupAddress === 'object' ? booking.pickupAddress?.address : booking.pickupAddress ?? 'N/A'}</span>
                        <span className='truncate'><span className='font-medium'>To:</span> {typeof booking.dropoffAddress === 'object' ? booking.dropoffAddress?.address : booking.dropoffAddress ?? 'N/A'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.price)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(booking.createdAt), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(booking.status)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Thao tác</DropdownMenuLabel>
                          <DropdownMenuItem onSelect={() => openDetails(booking.id)}>Xem chi tiết</DropdownMenuItem>
                          {(booking.status === 'SEARCHING' || booking.status === 'SCHEDULED') && (
                            <DropdownMenuItem onSelect={() => setAcceptingBookingId(booking.id)}>
                              ⭐ Nhận chuyến
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => setReassigningBooking(booking)} disabled={booking.status === 'COMPLETED' || booking.status === 'CANCELLED'}>
                            Chuyển quốc
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Cập nhật trạng thái</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {statusChangeOptions.map(status => (
                                <DropdownMenuItem
                                  key={status}
                                  disabled={booking.status === status || booking.status === 'COMPLETED' || booking.status === 'CANCELLED'}
                                  onSelect={() => openConfirmationDialog(booking, status)}
                                >
                                  {statusLabelMap[status] ?? status}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )))}
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
      {selectedBookingId && <BookingDetail bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />}
      <AlertDialog open={dialogState.open} onOpenChange={(open) => setDialogState(prev => ({ ...prev, open }))}>
        <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận thay đổi trạng thái</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn chuyển trạng thái chuyến #{dialogState.booking?.id} sang "{statusLabelMap[dialogState.newStatus ?? ''] ?? dialogState.newStatus}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="status-note">Ghi chú <span className="text-muted-foreground font-normal">(Tùy chọn)</span></Label>
            <Textarea
              id="status-note"
              placeholder="VD: Khách gọi hủy chuyến"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDialogState({ open: false, booking: null, newStatus: null }); setStatusNote(''); }} disabled={isUpdating}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleStatusUpdate} disabled={isUpdating}>
              {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!reassigningBooking} onOpenChange={(open) => !open && setReassigningBooking(null)}>
        <ReassignDialog
          booking={reassigningBooking}
          open={!!reassigningBooking}
          onOpenChange={(open) => !open && setReassigningBooking(null)}
          onReassignSuccess={() => {
            setReassigningBooking(null);
            fetchBookings(activeTab, searchTerm, currentPage, pageSize);
          }}
        />
      </Dialog>
      {/* Accept Booking Confirmation */}
      <AlertDialog open={!!acceptingBookingId} onOpenChange={(open) => !open && setAcceptingBookingId(null)}>
        <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Nhận chuyến</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn nhận chuyến này? Chuyến sẽ được gán về tài khoản operator của bạn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isAccepting}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleAcceptBooking} disabled={isAccepting}>
              {isAccepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận nhận chuyến
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
