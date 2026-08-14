'use client';

/**
 * Dialog chi tiết chuyến + bảng giá, tách khỏi `bookings-table.tsx` (module ~1900 dòng).
 *
 * Hai màn dùng chung file này: trang Chuyến đi và hàng đợi CSKH `/crm-queue`. Import
 * thẳng từ `bookings-table.tsx` sẽ kéo cả `getAvailableDrivers`, `reassignBooking`,
 * `CreateBookingDialog`… vào bundle của hàng đợi.
 *
 * CẤM import bất cứ thứ gì từ `./bookings-table` — sẽ tạo vòng import và vô hiệu hoá
 * chính lý do tách file.
 */
import * as React from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Loader2, Car, User, Clock, Zap, CopyPlus, Store } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
// [DISABLED 2026-07-09] adminAcceptBooking bỏ khỏi import — "admin ôm chuyến về operator" đã tắt (vỡ dòng tiền).
import { getBookingDetails, /* adminAcceptBooking, */ recordBookingCustomerCall, getBookingCustomerCallHistory, getCustomerCallReasons } from '@/lib/api';
import { CANCELLED_BY_ROLE_LABEL, getStatusBadge } from './booking-shared';
import {} from './void-booking-dialog';
import { buildDiscountRows, grossTransportPrice, subtractableDiscountTotal } from './price-breakdown-utils';
import type {} from '@/lib/types';
import {} from '@/lib/utils';
import {} from './create-booking-dialog';
import type { Booking, CustomerCallStatus, BookingCustomerCallEvent } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import {} from '@/components/ui/input';
import {} from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {} from '@/lib/utils';


const paymentMethodMap: Record<string, string> = {
  CASH: '💵 Tiền mặt',
  WALLET: '💳 Ví điện tử',
};

const vehicleTypeMap: Record<string, string> = {
  CAR_4: 'Xe 4 chỗ',
  CAR_7: 'Xe 7 chỗ',
};

export function PriceBreakdownCard({ booking }: { booking: Booking }) {
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

  const discounts = buildDiscountRows(breakdown);

  const vatAmount = Number(breakdown?.vatAmount ?? 0);
  // CHỈ trừ loyalty + promotion. `seatDiscountAmount` backend đã trừ sẵn vào
  // `transportPrice` (và `booking.price` = transportPrice + phụ phí), nên cộng nó
  // vào đây là trừ hai lần — xem ghi chú ở price-breakdown-utils.ts.
  const totalDiscount = subtractableDiscountTotal(breakdown);
  // Chặn sàn 0 cho khớp backend: `pricing.service.ts` chốt
  // `priceAfterDiscount = Math.max(0, currentPrice - discount)` rồi mới cộng VAT.
  // Không clamp thì ca loyalty + mã KM > giá chuyến sẽ hiện "Giá thực tế" ÂM trong
  // khi "Khách trả" là 0 — cột tự mâu thuẫn.
  const priceAfterDiscountUi = Math.max(0, Number(booking.price ?? 0) - totalDiscount);
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
              <span>Chi phí</span>
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
              <span>Chi phí</span>
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
            {/* Nhãn nói rõ đây là số GỘP khi có giảm ghế: chuyến 2 ghế tuyến
                300k hiện 600.000 chứ không phải 300.000, không có chú thích thì
                kế toán/CSKH dễ tưởng sai giá tuyến. */}
            <span>
              Giá vận chuyển
              {Number(breakdown.seatDiscountAmount ?? 0) > 0 && (
                <span className="text-muted-foreground"> (trước giảm ghế)</span>
              )}
            </span>
            {/* GỘP (trước giảm ghế) để dòng "giảm theo số ghế" bên dưới có cái mà
                trừ. Chuyến không phải CARPOOL thì seatDiscountAmount = 0 nên số này
                bằng đúng transportPrice như cũ. */}
            <span>{fmtVnd(grossTransportPrice(breakdown))}</span>
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

// Gọi check khách — nhãn + toast + badge dùng chung cho khối chi tiết lẫn cột danh sách.
const CUSTOMER_CALL_LABEL: Record<CustomerCallStatus, string> = {
  CLAIMED: 'Đã nhận gọi',
  CALLED: 'Đã gọi',
  UNREACHED: 'Không gọi được',
};
const CUSTOMER_CALL_TOAST: Record<CustomerCallStatus, string> = {
  CLAIMED: 'Đã nhận gọi check khách.',
  CALLED: 'Đã gọi được khách.',
  UNREACHED: 'Đã ghi nhận không liên lạc được.',
};
// Badge 4 trạng thái: null = Chưa gọi (đỏ), CLAIMED = xanh dương, CALLED = xanh lá,
// UNREACHED = hổ phách. Style thống nhất 2 nơi render.
export function CustomerCallBadge({ status }: { status?: CustomerCallStatus | null }) {
  if (status === 'CALLED') return <Badge className="bg-green-600 text-white hover:bg-green-600 text-[10px] px-1.5 py-0">Đã gọi</Badge>;
  if (status === 'UNREACHED') return <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-[10px] px-1.5 py-0">Không gọi được</Badge>;
  if (status === 'CLAIMED') return <Badge className="bg-blue-600 text-white hover:bg-blue-600 text-[10px] px-1.5 py-0">Đã nhận gọi</Badge>;
  return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Chưa gọi</Badge>;
}

// Exported (only the keyword — no behavior/signature change) so it can be
// unit-tested standalone, same pattern as PriceBreakdownCard above: lets a
// test mock getBookingDetails() and assert on badges (e.g.
// switchedToWholeCar) without mounting the whole BookingsTable.
export function BookingDetail({ bookingId, onClose, onDuplicate, onCallRecorded }: {
  bookingId: string,
  onClose: () => void,
  // Bỏ trống (vd trong unit test) → không hiện nút "Nhân bản chuyến".
  onDuplicate?: (booking: Booking) => void,
  // CSKH gọi check khách xong → báo danh sách refetch cột "Gọi check".
  onCallRecorded?: () => void,
}) {
  const [booking, setBooking] = React.useState<Booking | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  // CSKH gọi check khách: note nội bộ + lịch sử (tách khỏi Ghi chú của khách).
  const [callNote, setCallNote] = React.useState('');
  const [callSaving, setCallSaving] = React.useState<CustomerCallStatus | null>(null);
  const [callHistory, setCallHistory] = React.useState<BookingCustomerCallEvent[]>([]);
  // Lý do chuẩn hoá — danh mục lấy từ backend (system_config) nên ops sửa được, không hardcode.
  const [callReason, setCallReason] = React.useState<string>('');
  const [reasonOptions, setReasonOptions] = React.useState<string[]>([]);

  React.useEffect(() => {
    // Phần phụ: lỗi thì dropdown rỗng, không chặn thao tác ghi nhận cuộc gọi.
    getCustomerCallReasons().then(setReasonOptions).catch(() => setReasonOptions([]));
  }, []);

  const loadCallHistory = React.useCallback(async () => {
    if (!bookingId) return;
    // Phần phụ — lỗi thì để trống, không chặn phần chi tiết chính.
    try {
      setCallHistory(await getBookingCustomerCallHistory(bookingId));
    } catch {
      setCallHistory([]);
    }
  }, [bookingId]);

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
    loadCallHistory();
    setCallNote('');
  }, [bookingId, toast, loadCallHistory]);

  const handleRecordCall = async (status: CustomerCallStatus) => {
    if (!booking) return;
    setCallSaving(status);
    try {
      await recordBookingCustomerCall(booking.id, {
        status,
        note: callNote.trim() || undefined,
        reason: callReason || undefined,
      });
      toast({ title: 'Đã lưu', description: CUSTOMER_CALL_TOAST[status] });
      setCallNote('');
      setCallReason('');
      // Cập nhật trạng thái tại chỗ + reload lịch sử; báo danh sách ngoài refetch cột.
      setBooking((prev) => (prev ? { ...prev, customerCallStatus: status } : prev));
      await loadCallHistory();
      onCallRecorded?.();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không lưu được', description: err.message });
    } finally {
      setCallSaving(null);
    }
  };

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
              {/* Status & Service. All meta lives in one left-aligned badge
                  row now — status, service, trip shape, payment — so admin
                  scans a single line for the booking's at-a-glance summary. */}
              <div className="flex items-center gap-2 flex-wrap">
                {getStatusBadge(booking)}
                {booking.serviceType && (
                  <Badge variant="outline" className="text-xs">
                    {serviceTypeMap[booking.serviceType] ?? booking.serviceType}
                  </Badge>
                )}
                {booking.switchedToWholeCar && (
                  <Badge className="text-xs bg-amber-600 text-white hover:bg-amber-600">
                    🔁 Đã tự chuyển sang Bao xe
                  </Badge>
                )}
                {booking.isPooled && <Badge variant="secondary" className="text-xs">Đi chung</Badge>}
                {booking.requestedSeats != null && (
                  <Badge variant="outline" className="text-xs">
                    {booking.requestedSeats} người
                  </Badge>
                )}
                {booking.requestedVehicleType && (
                  <Badge variant="outline" className="text-xs">
                    {vehicleTypeMap[booking.requestedVehicleType] ?? booking.requestedVehicleType}
                  </Badge>
                )}
                {booking.paymentMethod && (
                  <Badge variant="outline" className="text-xs">
                    {paymentMethodMap[booking.paymentMethod] ?? booking.paymentMethod}
                  </Badge>
                )}
              </div>

              {/* Vi-now — customer used the 6-digit code flow instead of
                  going through dispatch. The journey differs enough that
                  admin needs a banner-sized callout, not just a small badge
                  in the crowded status row. */}
              {booking.isVinow && (
                <Card className="p-3 flex items-center gap-3 border-orange-300 bg-orange-50 dark:border-orange-900/60 dark:bg-orange-950/30">
                  <div className="h-9 w-9 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-orange-700 dark:text-orange-300" />
                  </div>
                  <div className="flex-1 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">Vi-now</div>
                    <div className="font-semibold">Khách đặt qua Vinow</div>
                  </div>
                </Card>
              )}

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
                    {/* SĐT người đi cùng — chỉ hiện khi chuyến có (backend strip khỏi
                        feed/offer nên tài chưa nhận chuyến không thấy). */}
                    {booking.companionPhone && (
                      <div className="text-muted-foreground">Người đi cùng: {booking.companionPhone}</div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Đặt hộ: đại lý đã đặt chuyến hộ khách — chỉ hiện với chuyến đặt hộ (backend trả agentPhone). */}
              {(booking.agentName || booking.agentPhone) && (
                <Card className="p-3 space-y-1 border-purple-200 bg-purple-50/50 dark:border-purple-900/50 dark:bg-purple-950/20">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Người đặt hộ (đại lý)</div>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Store className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="font-semibold">{booking.agentName || '—'}</div>
                      <div className="text-muted-foreground">{booking.agentPhone || '—'}</div>
                    </div>
                  </div>
                </Card>
              )}

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
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tuyến đường</div>
                  {booking.route?.name ? (
                    <Badge variant="outline" className="text-xs font-medium">{booking.route.name}</Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Chưa gắn tuyến</span>
                  )}
                </div>
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

              {/* Ghi chú của KHÁCH — tài xế ĐỌC ĐƯỢC ô này trên app. */}
              {booking.note && (
                <Card className="p-3 space-y-1">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ghi chú của khách</div>
                  <p className="text-sm whitespace-pre-wrap">{booking.note}</p>
                </Card>
              )}

              {/* Ghi chú vận hành NỘI BỘ (admin đổi trạng thái kèm ghi chú).
                  Trước đây phần này bị nối vào "Ghi chú của khách" nên mọi tài xế
                  được chào chuyến đọc được. Nay tách cột riêng, chỉ hiện ở đây. */}
              {booking.adminNote && (
                <Card className="p-3 space-y-1 border-amber-300/60 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                    Ghi chú nội bộ · không lộ cho tài/khách
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{booking.adminNote}</p>
                </Card>
              )}

              {/* Gọi check khách — KHỐI RIÊNG, nội bộ admin. Note ở đây TÁCH khỏi
                  "Ghi chú" của khách phía trên (không lộ cho tài/khách). Chỉ hiện ở
                  chi tiết chuyến ĐÃ TẠO — form Tạo chuyến không có khối này. */}
              <Card className="p-3 space-y-2 border-blue-300/60 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-950/20">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                    Gọi check khách <span className="normal-case font-normal text-muted-foreground">(nội bộ)</span>
                  </div>
                  <CustomerCallBadge status={booking.customerCallStatus} />
                  {booking.customerCallCheckedBy && (
                    <span className="text-[11px] text-muted-foreground">
                      {booking.customerCallCheckedBy.fullName || booking.customerCallCheckedBy.phone || 'Admin'}
                      {booking.customerCallCheckedAt ? ` · ${format(new Date(booking.customerCallCheckedAt), "dd/MM HH:mm")}` : ''}
                    </span>
                  )}
                </div>
                {/* Lý do chuẩn hoá — danh mục lấy từ backend (system_config CSKH_CALL_REASONS)
                    nên ops sửa được, không hardcode ở FE. Không bắt buộc chọn. */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="shrink-0 text-xs text-muted-foreground">Lý do:</span>
                  <Select value={callReason} onValueChange={setCallReason} disabled={!!callSaving}>
                    <SelectTrigger className="h-8 w-[240px] text-sm">
                      <SelectValue placeholder="Chọn lý do (không bắt buộc)" />
                    </SelectTrigger>
                    <SelectContent>
                      {reasonOptions.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {callReason && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => setCallReason('')}
                    >
                      Bỏ chọn
                    </Button>
                  )}
                </div>
                <Textarea
                  value={callNote}
                  onChange={(e) => setCallNote(e.target.value)}
                  placeholder="Ghi chú cuộc gọi cho admin khác (vd: khách xác nhận đúng địa chỉ)..."
                  rows={2}
                  className="text-sm"
                  disabled={!!callSaving}
                />
                {/* Chưa gọi → chỉ nút "Nhận gọi". Sau khi có người nhận (hoặc đã resolve)
                    → hiện 2 nút kết quả (đổi lại được nếu bấm nhầm — event append-only). */}
                <div className="flex flex-wrap gap-2">
                  {!booking.customerCallStatus ? (
                    <Button size="sm" disabled={!!callSaving} onClick={() => handleRecordCall('CLAIMED')}>
                      {callSaving === 'CLAIMED' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                      Nhận gọi
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" disabled={!!callSaving} onClick={() => handleRecordCall('CALLED')}>
                        {callSaving === 'CALLED' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                        Đã gọi được
                      </Button>
                      <Button size="sm" variant="outline" className="border border-input" disabled={!!callSaving} onClick={() => handleRecordCall('UNREACHED')}>
                        {callSaving === 'UNREACHED' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                        Không liên lạc được
                      </Button>
                    </>
                  )}
                </div>
                {callHistory.length > 0 && (
                  <ul className="space-y-1.5 pt-1">
                    {callHistory.slice(0, 5).map((e) => (
                      <li key={e.id} className="rounded-md border bg-background p-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-medium">
                            {CUSTOMER_CALL_LABEL[e.status] ?? e.status} · {e.byAdminName || '—'}
                          </span>
                          <span className="text-muted-foreground">{format(new Date(e.createdAt), "dd/MM/yyyy HH:mm")}</span>
                        </div>
                        {e.reason && (
                          <div className="mt-1">
                            <Badge variant="secondary" className="text-[10px] font-normal">{e.reason}</Badge>
                          </div>
                        )}
                        {e.note && <div className="text-muted-foreground whitespace-pre-wrap">{e.note}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

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
        {booking && onDuplicate && (
          <DialogFooter>
            {/* Đặt lại chuyến giống hệt cho khách quen — mở form Tạo chuyến đã điền sẵn.
                Chuyến đang xem KHÔNG bị thay đổi. */}
            <Button variant="outline" onClick={() => onDuplicate(booking)}>
              <CopyPlus className="mr-2 h-4 w-4" />
              Nhân bản chuyến
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
