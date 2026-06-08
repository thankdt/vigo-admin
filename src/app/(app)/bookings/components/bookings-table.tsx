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
import { MoreHorizontal, ArrowUpDown, Loader2, Search, Car, User, Phone, Clock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { getBookings, getBookingDetails, updateBookingStatus, getAvailableDrivers, reassignBooking, adminAcceptBooking, claimProcessingBooking } from '@/lib/api';
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
// PROCESSING is shown as two virtual tabs in the admin UI even though it's a
// single DB status. NEEDS_ADMIN = unclaimed (5-min auto-cancel + Telegram nags);
// ADMIN_HANDLING = an admin claimed it and owns the resolution indefinitely.
// Both are mapped to `status=PROCESSING&processingState=…` on the server.
type TabKey = BookingStatus | 'NEEDS_ADMIN' | 'ADMIN_HANDLING' | 'ALL';

const tabKeys: TabKey[] = [
  'SEARCHING',
  'NEEDS_ADMIN',
  'ADMIN_HANDLING',
  'SCHEDULED',
  'ACCEPTED',
  'PICKED_UP',
  'COMPLETED',
  'CANCELLED',
];

const statusLabelMap: Record<string, string> = {
  ALL: 'Tất cả',
  SEARCHING: 'Đang tìm',
  // Raw PROCESSING fallback label — used when a row sneaks past the tab
  // filter (e.g. legacy data or a search hit). New tabs below are preferred.
  PROCESSING: 'Đang xử lý',
  NEEDS_ADMIN: 'Cần xử lý',
  ADMIN_HANDLING: 'Admin đang xử lý',
  SCHEDULED: 'Đặt lịch',
  ACCEPTED: 'Đã nhận',
  PICKED_UP: 'Đã đón',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

const paymentMethodMap: Record<string, string> = {
  CASH: '💵 Tiền mặt',
  WALLET: '💳 Ví điện tử',
};

const CANCELLED_BY_ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Khách hàng',
  DRIVER: 'Tài xế',
  ADMIN: 'Admin',
  SYSTEM: 'Hệ thống',
};

function PriceBreakdownCard({ booking }: { booking: Booking }) {
  const fmtVnd = (v: number | string | null | undefined) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v ?? 0));

  const breakdown = booking.priceBreakdown;
  const earnings = booking.driverEarnings;

  // Surcharges EXCLUDES VAT — VAT lives on its own line below "Giá thực tế"
  // so the flow reads: base + surcharges → discounts → giá thực tế → VAT →
  // khách trả.
  const surcharges: Array<{ label: string; value: number }> = breakdown ? [
    { label: 'Phụ phí kích thước', value: Number(breakdown.sizeSurcharge ?? 0) },
    { label: 'Phụ phí trọng lượng', value: Number(breakdown.weightSurcharge ?? 0) },
    { label: 'Phụ phí cuối tuần', value: Number(breakdown.weekendSurcharge ?? 0) },
    { label: 'Phụ phí ngày lễ', value: Number(breakdown.holidaySurcharge ?? 0) },
    { label: 'Phí dịch vụ', value: Number(breakdown.serviceFee ?? 0) },
  ].filter(r => r.value > 0) : [];

  const discounts: Array<{ label: string; value: number }> = breakdown ? [
    { label: 'Khách thân thiết', value: Number(breakdown.loyaltyDiscount ?? 0) },
    { label: 'Mã khuyến mãi', value: Number(breakdown.promotionDiscount ?? 0) },
  ].filter(r => r.value > 0) : [];

  const vatAmount = Number(breakdown?.vatAmount ?? 0);
  const totalDiscount = discounts.reduce((sum, d) => sum + d.value, 0);
  const priceAfterDiscountUi = Number(booking.price ?? 0) - totalDiscount;
  const finalPrice = Number(booking.finalPrice ?? booking.price ?? 0);

  // Driver / HTX / Vigo allocation rebuild. Restored after f93e369 cut the
  // entire section as a "duplicate" — the pricing-chain repeat was the
  // duplicate, but the split itself is what support / accounting actually
  // needed for receipt review. We keep the chain consolidated above and only
  // show the allocation below.
  let allocation: React.ReactNode = null;
  if (earnings) {
    const earnPriceAfterDiscount = Number(
      earnings.priceAfterDiscount ?? priceAfterDiscountUi,
    );
    const pit = Number(earnings.personalIncomeTaxAmount ?? 0);
    const htxCommission = Number(earnings.htxCommission ?? 0);
    const vigoCommission = Number(earnings.vigoCommission ?? 0);
    const htxVatRemit = Number(earnings.htxVatRemit ?? 0);
    const vigoVatRemit = Number(earnings.vigoVatRemit ?? 0);
    const htxTotalReceived = Number(earnings.htxTotalReceived ?? 0);
    const vigoTotalReceived = Number(earnings.vigoTotalReceived ?? 0);
    const platformFee = htxCommission + vigoCommission;
    const cashKept = Number(
      earnings.tripCashKept ?? earnPriceAfterDiscount - platformFee - pit,
    );
    const bonus = Number(earnings.driverDiscountBonus ?? 0);
    const totalReceived = Number(
      earnings.driverTotalReceived ?? cashKept + bonus,
    );
    const hasNewSplit = htxCommission > 0 || vigoCommission > 0;

    if (hasNewSplit) {
      // Tổng kiểm tra: TX + HTX + Vigo must reconcile to Khách trả within
      // 1đ (rounding noise). Anything bigger means the booking's persisted
      // earnings breakdown drifted — admin sees ⚠ and can investigate.
      const sumCheck = totalReceived + htxTotalReceived + vigoTotalReceived;
      const reconciles = Math.abs(sumCheck - finalPrice) < 1;

      allocation = (
        <div className="space-y-3 border-t pt-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Phân bổ doanh thu
          </div>

          {/* Tài xế */}
          <div className="border-l-2 border-blue-500 pl-3 space-y-1.5 text-sm">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Tài xế</div>
            <div className="flex justify-between">
              <span>Giá cước</span>
              <span>{fmtVnd(earnPriceAfterDiscount)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>− Phí nền tảng</span>
              <span>-{fmtVnd(platformFee)}</span>
            </div>
            {pit > 0 && (
              <div className="flex justify-between text-red-600">
                <span>− Thuế TNCN</span>
                <span>-{fmtVnd(pit)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>= Tiền mặt</span>
              <span>{fmtVnd(cashKept)}</span>
            </div>
            {bonus > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>+ Cộng vào ví thưởng KM</span>
                <span>+{fmtVnd(bonus)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>= Tổng tài xế thực nhận</span>
              <span className="text-blue-700">{fmtVnd(totalReceived)}</span>
            </div>
          </div>

          {/* HTX */}
          <div className="border-l-2 border-purple-500 pl-3 space-y-1.5 text-sm">
            <div className="text-xs font-semibold text-purple-700 uppercase tracking-wide">HTX</div>
            <div className="flex justify-between">
              <span>Doanh thu HTX (hoa hồng)</span>
              <span>{fmtVnd(htxCommission)}</span>
            </div>
            {htxVatRemit > 0 && (
              <div className="flex justify-between">
                <span>VAT HTX phải nộp</span>
                <span>{fmtVnd(htxVatRemit)}</span>
              </div>
            )}
            {pit > 0 && (
              <div className="flex justify-between">
                <span>Thuế TNCN nộp hộ tài xế</span>
                <span>{fmtVnd(pit)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>= Tổng HTX</span>
              <span className="text-purple-700">{fmtVnd(htxTotalReceived)}</span>
            </div>
          </div>

          {/* Vigo */}
          <div className="border-l-2 border-red-500 pl-3 space-y-1.5 text-sm">
            <div className="text-xs font-semibold text-red-700 uppercase tracking-wide">Vigo</div>
            <div className="flex justify-between">
              <span>Doanh thu Vigo (hoa hồng)</span>
              <span>{fmtVnd(vigoCommission)}</span>
            </div>
            {vigoVatRemit > 0 && (
              <div className="flex justify-between">
                <span>VAT Vigo phải nộp</span>
                <span>{fmtVnd(vigoVatRemit)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>= Tổng Vigo</span>
              <span className="text-red-700">{fmtVnd(vigoTotalReceived)}</span>
            </div>
          </div>

          <div className={`flex justify-between border-t pt-2 text-xs ${reconciles ? 'text-muted-foreground' : 'text-amber-600 font-medium'}`}>
            <span>Tổng kiểm tra (TX + HTX + Vigo)</span>
            <span>
              {fmtVnd(sumCheck)} {reconciles ? '✓' : '⚠'}
            </span>
          </div>
        </div>
      );
    } else {
      // Legacy fallback for bookings completed before
      // 1782000000000-AddBookingEarningsBreakdown. Pre-migration rows have no
      // HTX/Vigo split persisted; show driver math with a single platform
      // commission line so old history rows still render meaningfully.
      const commission = Number(earnings.commissionAmount ?? 0);
      const legacyTotalReceived = Number(
        earnings.netEarnings ?? earnPriceAfterDiscount - commission - pit,
      );
      allocation = (
        <div className="space-y-3 border-t pt-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Phân bổ doanh thu
          </div>
          <div className="border-l-2 border-blue-500 pl-3 space-y-1.5 text-sm">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Tài xế</div>
            <div className="flex justify-between">
              <span>Giá cước</span>
              <span>{fmtVnd(earnPriceAfterDiscount)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>− Hoa hồng nền tảng</span>
              <span>-{fmtVnd(commission)}</span>
            </div>
            {pit > 0 && (
              <div className="flex justify-between text-red-600">
                <span>− Thuế TNCN</span>
                <span>-{fmtVnd(pit)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>= Tài xế thực nhận</span>
              <span className="text-blue-700">{fmtVnd(legacyTotalReceived)}</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground italic">
            Chuyến cũ trước khi tách HTX / Vigo — chỉ hiển thị hoa hồng gộp.
          </div>
        </div>
      );
    }
  }

  return (
    <Card className="p-3 space-y-3">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tài chính</div>

      {booking.distanceKm != null && (
        <div className="text-sm text-muted-foreground">
          Khoảng cách: <span className="font-medium text-foreground">{Number(booking.distanceKm).toFixed(1)} km</span>
        </div>
      )}

      {breakdown ? (
        <div className="space-y-1.5 text-sm">
          <div className="text-xs font-medium text-muted-foreground">Giá cước</div>
          <div className="flex justify-between">
            <span>Giá vận chuyển</span>
            <span>{fmtVnd(breakdown.transportPrice)}</span>
          </div>
          {surcharges.map(s => (
            <div key={s.label} className="flex justify-between">
              <span>{s.label}</span>
              <span>+{fmtVnd(s.value)}</span>
            </div>
          ))}

          {discounts.length > 0 && (
            <>
              <div className="text-xs font-medium text-muted-foreground pt-1">Giảm giá</div>
              {discounts.map(d => (
                <div key={d.label} className="flex justify-between text-orange-600">
                  <span>{d.label}</span>
                  <span>-{fmtVnd(d.value)}</span>
                </div>
              ))}
            </>
          )}

          <div className="flex justify-between border-t pt-1.5 font-medium">
            <span>Giá thực tế</span>
            <span>{fmtVnd(priceAfterDiscountUi)}</span>
          </div>
          {vatAmount > 0 && (
            <div className="flex justify-between">
              <span>Thuế VAT</span>
              <span>+{fmtVnd(vatAmount)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Giá gốc</span>
          <span className="font-medium">{fmtVnd(booking.price)}</span>
        </div>
      )}

      <div className="flex justify-between border-t pt-2 text-sm">
        <span className="font-semibold">Khách trả</span>
        <span className="font-semibold text-green-600">{fmtVnd(finalPrice)}</span>
      </div>
      {booking.paymentMethod && (
        <div className="text-xs text-muted-foreground -mt-1">
          Phương thức: {paymentMethodMap[booking.paymentMethod] ?? booking.paymentMethod}
        </div>
      )}

      {allocation}
    </Card>
  );
}

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
    RIDE: '🚗 Bao xe',
    DELIVERY: '📦 Giao hàng',
    CARPOOL: '🚌 Đi chung',
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
    ? booking.driver.user?.fullName || (booking.driver as any).fullName || booking.driver.name || 'N/A'
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
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(booking)}
                  {booking.serviceType && (
                    <Badge variant="outline" className="text-xs">
                      {serviceTypeMap[booking.serviceType] ?? booking.serviceType}
                    </Badge>
                  )}
                  {booking.isPooled && <Badge variant="secondary" className="text-xs">Đi chung</Badge>}
                  {/* Trip shape moved up here from the Tuyến đường card so the
                      first row tells the whole story at a glance: status,
                      service, passengers + vehicle, payment. */}
                  {booking.requestedSeats != null && (
                    <Badge variant="outline" className="text-xs">
                      Số người: {booking.requestedSeats}
                    </Badge>
                  )}
                  {booking.requestedVehicleType && (
                    <Badge variant="outline" className="text-xs">
                      Loại xe: {booking.requestedVehicleType}
                    </Badge>
                  )}
                </div>
                {booking.paymentMethod && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {paymentMethodMap[booking.paymentMethod] ?? booking.paymentMethod}
                  </span>
                )}
              </div>

              {/* Scheduled pickup time — only when the customer booked ahead. */}
              {booking.scheduledTime && (
                <Card className="p-3 flex items-center gap-3 border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
                  <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                  </div>
                  <div className="flex-1 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Hẹn giờ</div>
                    <div className="font-semibold">{format(new Date(booking.scheduledTime), "HH:mm — dd/MM/yyyy")}</div>
                  </div>
                </Card>
              )}

              {/* Customer */}
              <Card className="p-3 space-y-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Khách hàng</div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 text-sm">
                    <div className="font-semibold">{booking.senderInfo?.name || booking.customer?.fullName || 'N/A'}</div>
                    <div className="text-muted-foreground">{booking.senderInfo?.phone || booking.customer?.phone || 'N/A'}</div>
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
                      <div className="text-muted-foreground">{booking.driver?.user?.phone ?? booking.driver?.phone ?? 'N/A'}</div>
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
                {/* Số người / Loại xe used to live here as a footer row, but
                    they're now badges in the top status row alongside Đã hủy /
                    Đi chung so admin doesn't have to scroll past addresses to
                    read trip shape. */}
              </Card>

              {/* Pricing */}
              <PriceBreakdownCard booking={booking} />

              {/* Note */}
              {booking.note && (
                <Card className="p-3 space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ghi chú</div>
                  <p className="text-sm whitespace-pre-wrap">{booking.note}</p>
                </Card>
              )}

              {/* Cancellation card — covers reason, who, and when. Shown
                  whenever any cancel metadata is present (the card title
                  switches to "Thông tin huỷ" if there's no free-text reason
                  but we do have role/time info). */}
              {(booking.cancelReason || booking.cancelledByRole || booking.cancelledAt) && (
                <Card className="p-3 space-y-2 border-destructive/30 bg-destructive/5">
                  <div className="text-xs font-semibold text-destructive uppercase tracking-wider">
                    {booking.cancelReason ? 'Lý do hủy' : 'Thông tin huỷ'}
                  </div>
                  {booking.cancelReason && (
                    <p className="text-sm">{booking.cancelReason}</p>
                  )}
                  {booking.cancelledAt && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Thời gian huỷ:</span>{' '}
                      {format(new Date(booking.cancelledAt), "dd/MM/yyyy HH:mm")}
                    </div>
                  )}
                  {booking.cancelledByRole && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Người huỷ:</span>{' '}
                      {CANCELLED_BY_ROLE_LABEL[booking.cancelledByRole] ?? booking.cancelledByRole}
                      {booking.cancelledByUser && (
                        <>
                          {' — '}
                          {booking.cancelledByUser.fullName || 'Không tên'}
                          {booking.cancelledByUser.phone ? ` (${booking.cancelledByUser.phone})` : ''}
                        </>
                      )}
                    </div>
                  )}
                </Card>
              )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t pt-3">
                <div>
                  <span className="font-medium">Thời gian đặt:</span>{' '}
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
  const [query, setQuery] = React.useState('');
  const { toast } = useToast();

  React.useEffect(() => {
    const fetchDrivers = async () => {
      if (!open) return;
      setIsLoading(true);
      setQuery('');
      setSelectedDriverId(null);
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

  // Operators paste a phone (with or without leading 0/+84) to find a known
  // driver quickly; fall back to matching by name/plate so the same input box
  // covers the other lookups they used to scroll for.
  const normalizedQuery = query.trim().toLowerCase();
  const queryDigits = normalizedQuery.replace(/\D/g, '');
  const filteredDrivers = normalizedQuery
    ? drivers.filter((driver) => {
        const phone = (driver.phone || driver.user?.phone || '').toLowerCase();
        const phoneDigits = phone.replace(/\D/g, '');
        const name = getDriverName(driver).toLowerCase();
        const plate = (getDriverPlate(driver) || '').toLowerCase();
        if (queryDigits && phoneDigits.includes(queryDigits)) return true;
        if (phone.includes(normalizedQuery)) return true;
        if (name.includes(normalizedQuery)) return true;
        if (plate.includes(normalizedQuery)) return true;
        return false;
      })
    : drivers;

  return (
    <DialogContent className="sm:max-w-lg" onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
      <DialogHeader>
        <DialogTitle>Chuyển quốc chuyến #{booking?.id?.slice(0, 8)}...</DialogTitle>
        <DialogDescription>Chọn tài xế mới cho chuyến này. Chỉ hiển thị tài xế đang online.</DialogDescription>
      </DialogHeader>
      <div className="relative mt-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm theo SĐT, tên hoặc biển số…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-1">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : drivers.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Không tìm thấy tài xế khả dụng.</p>
        ) : filteredDrivers.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Không có tài xế khớp với "{query}".</p>
        ) : (
          <div className="space-y-2">
            {filteredDrivers.map(driver => {
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


function getStatusBadge(booking: Pick<Booking, 'status' | 'adminClaimedAt'>) {
  const { status, adminClaimedAt } = booking;
  // PROCESSING splits into two visual badges based on whether an admin
  // claimed the booking — orange = "Cần xử lý" (still on the auto-cancel
  // clock), purple = "Admin đang xử lý" (claimed, no timeout).
  if (status === 'PROCESSING') {
    if (adminClaimedAt) {
      return (
        <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
          {statusLabelMap.ADMIN_HANDLING}
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
        {statusLabelMap.NEEDS_ADMIN}
      </Badge>
    );
  }
  const label = statusLabelMap[status] ?? status;
  switch (status) {
    case 'COMPLETED':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">{label}</Badge>;
    case 'ACCEPTED':
    case 'PICKED_UP':
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400">{label}</Badge>;
    case 'SEARCHING':
      return <Badge variant="secondary">{label}</Badge>;
    case 'CANCELLED':
      return <Badge variant="destructive">{label}</Badge>;
    default:
      return <Badge>{label}</Badge>;
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


  const fetchBookings = React.useCallback(async (tab: string, search: string, page: number, limit: number) => {
    setIsLoading(true);
    setError(null);
    try {
      // Translate the two virtual PROCESSING tabs into the real query —
      // status=PROCESSING + processingState=unclaimed|claimed. Backend sees
      // a single enum so the customer/driver apps stay unchanged.
      let status: string | undefined = tab === 'ALL' ? undefined : tab;
      let processingState: 'unclaimed' | 'claimed' | undefined;
      if (tab === 'NEEDS_ADMIN') {
        status = 'PROCESSING';
        processingState = 'unclaimed';
      } else if (tab === 'ADMIN_HANDLING') {
        status = 'PROCESSING';
        processingState = 'claimed';
      }

      const params: any = { page, limit, status, processingState };
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
        title: "Không thể tải chuyến đi",
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
      toast({ title: 'Đã cập nhật trạng thái', description: `Chuyến #${dialogState.booking.id} đã được chuyển sang ${statusLabelMap[dialogState.newStatus] ?? dialogState.newStatus}.` });
      fetchBookings(activeTab, searchTerm, currentPage, pageSize);
      setDialogState({ open: false, booking: null, newStatus: null });
      setStatusNote('');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Cập nhật thất bại', description: err.message });
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

  const handleClaimBooking = async (booking: Booking) => {
    try {
      await claimProcessingBooking(booking.id);
      toast({ title: 'Đã nhận xử lý', description: 'Chuyến không còn bị tự huỷ sau 5 phút. Bạn cần đẩy chuyến cho tài xế hoặc huỷ thủ công.' });
      fetchBookings(activeTab, searchTerm, currentPage, pageSize);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Nhận xử lý thất bại', description: err.message });
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
            {tabKeys.map(key => (
              <TabsTrigger key={key} value={key}>{statusLabelMap[key] ?? key}</TabsTrigger>
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
                {/* CANCELLED tab gets 3 extra columns so admin can read who
                    cancelled and why without opening each detail dialog. Other
                    tabs keep the original 7-column layout. */}
                {activeTab === 'CANCELLED' && (
                  <>
                    <TableHead>Thời gian huỷ</TableHead>
                    <TableHead>Người huỷ</TableHead>
                    <TableHead>Lý do huỷ</TableHead>
                  </>
                )}
                <TableHead>
                  <span className="sr-only">Thao tác</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={activeTab === 'CANCELLED' ? 10 : 7} className="h-24 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={activeTab === 'CANCELLED' ? 10 : 7} className="text-center text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : sortedBookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={activeTab === 'CANCELLED' ? 10 : 7} className="h-24 text-center">
                    Không tìm thấy chuyến nào.
                  </TableCell>
                </TableRow>
              ) : (
                sortedBookings.map((booking) => (
                  <TableRow
                    key={booking.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetails(booking.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span className='font-semibold'>{booking.senderInfo?.name || booking.customer?.fullName || 'N/A'}</span>
                        <span className='text-sm text-muted-foreground'>{booking.senderInfo?.phone || booking.customer?.phone || 'N/A'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {booking.driver ? (
                        <div className="flex flex-col">
                          <span className='font-semibold'>{booking.driver.user?.fullName ?? booking.driver.fullName ?? booking.driver.name ?? 'N/A'}</span>
                          <span className='text-sm text-muted-foreground'>{booking.driver.user?.phone ?? booking.driver.phone ?? 'N/A'}</span>
                        </div>
                      ) : (
                        <span className='text-sm text-muted-foreground'>N/A</span>
                      )}
                    </TableCell>
                    <TableCell className='max-w-xs'>
                      <div className="flex flex-col">
                        <span className='truncate'><span className='font-medium'>Điểm đón:</span> {typeof booking.pickupAddress === 'object' ? booking.pickupAddress?.address : booking.pickupAddress ?? 'N/A'}</span>
                        <span className='truncate'><span className='font-medium'>Điểm trả:</span> {typeof booking.dropoffAddress === 'object' ? booking.dropoffAddress?.address : booking.dropoffAddress ?? 'N/A'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.price)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(booking.createdAt), "dd/MM/yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {getStatusBadge(booking)}
                        {booking.status === 'PROCESSING' && booking.adminClaimedAt && booking.adminClaimedBy && (
                          <span className="text-[11px] text-muted-foreground">
                            {booking.adminClaimedBy.fullName || booking.adminClaimedBy.phone || 'Admin'}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {activeTab === 'CANCELLED' && (
                      <>
                        <TableCell className="text-xs">
                          {booking.cancelledAt
                            ? format(new Date(booking.cancelledAt), 'dd/MM/yyyy HH:mm')
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {booking.cancelledByRole ? (
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {CANCELLED_BY_ROLE_LABEL[booking.cancelledByRole] ?? booking.cancelledByRole}
                              </span>
                              {booking.cancelledByUser && (
                                <span className="text-muted-foreground">
                                  {booking.cancelledByUser.fullName || 'Không tên'}
                                  {booking.cancelledByUser.phone ? ` (${booking.cancelledByUser.phone})` : ''}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px] text-xs">
                          {booking.cancelReason
                            ? <span className="line-clamp-2">{booking.cancelReason}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      </>
                    )}
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
                          {(booking.status === 'SEARCHING' || booking.status === 'SCHEDULED') && (
                            <DropdownMenuItem onSelect={() => setAcceptingBookingId(booking.id)}>
                              ⭐ Nhận chuyến
                            </DropdownMenuItem>
                          )}
                          {booking.status === 'PROCESSING' && !booking.adminClaimedAt && (
                            <DropdownMenuItem onSelect={() => handleClaimBooking(booking)}>
                              🛎️ Nhận xử lý
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
