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
import { MoreHorizontal, ArrowUpDown, Loader2, Search, Car, User, Phone, Clock, Zap, CopyPlus, Store } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
// [DISABLED 2026-07-09] adminAcceptBooking bỏ khỏi import — "admin ôm chuyến về operator" đã tắt (vỡ dòng tiền).
import { getBookings, getBookingDetails, updateBookingStatus, getAvailableDrivers, reassignBooking, /* adminAcceptBooking, */ claimProcessingBooking, getRoutes, recordBookingCustomerCall, getBookingCustomerCallHistory, getCustomerCallReasons, setBookingTestFlag } from '@/lib/api';
import { VoidBookingDialog } from './void-booking-dialog';
import { buildDiscountRows, grossTransportPrice, subtractableDiscountTotal } from './price-breakdown-utils';
import type { Route } from '@/lib/types';
import {
  DRIVER_ONLINE_HINT,
  DRIVER_ONLINE_LABEL,
  driverOnlineState,
} from '@/lib/driver-presence';
import { getImageUrl } from '@/lib/utils';
import { CreateBookingDialog } from './create-booking-dialog';
import { DriverCommitmentBadge } from './driver-commitment-badge';
import { bookingToDraft, type BookingDraft } from './duplicate-utils';
import { formatScheduleWindow } from './schedule-window';
import type { Booking, BookingStatus, Driver, CustomerCallStatus, CustomerCallFilter, TestTripFilter, BookingCustomerCallEvent } from '@/lib/types';
import { Switch } from '@/components/ui/switch';
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

// Outer trip-type tabs: 'all' = no filter (default landing, unchanged behaviour),
// 'regular' = ride-now (scheduledTime IS NULL), 'scheduled' = booked-ahead (IS NOT NULL).
// Maps to the `scheduled` query param (all → omit) so CSKH can distinguish the two.
type TripKind = 'all' | 'regular' | 'scheduled';

// Options object for fetchBookings — 8 inputs is past the point where positional args are
// safe (a missed/re-ordered arg at any of the 6 call sites would be silent). tsc now checks
// each call site names every field.
type FetchArgs = {
  tab: string;
  search: string;
  bookingId: string;
  page: number;
  limit: number;
  routeFilter: string;
  sort: { key: SortKey; direction: 'ascending' | 'descending' };
  tripKind: TripKind;
  customerCall: CustomerCallFilter | 'ALL';
  /** Lọc riêng từng pha gọi CSKH (trước / sau khi chuyến hoàn thành). */
  callBefore?: CustomerCallFilter | 'ALL';
  callAfter?: CustomerCallFilter | 'ALL';
  dateFrom: string;
  dateTo: string;
  /**
   * Lọc "Chuyến test". 'ALL' = hiện cả hai (mặc định).
   *
   * CỐ Ý bắt buộc (không `?:`): tsc phải đỏ ở CẢ HAI call-site nếu quên truyền —
   * đúng lý do type này tồn tại (xem chú thích trên). Mảng deps của useEffect thì
   * không có gì chặn được, vì next.config bật ignoreDuringBuilds.
   */
  testFilter: TestTripFilter | 'ALL';
};

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
  // Renamed from "Đặt lịch" → "Chờ đến giờ" so it no longer collides with the outer
  // trip-type tab "Đặt lịch". This is the transient pre-dispatch status (a booked-ahead
  // trip waiting for its pickup time); the outer tab covers scheduled trips of ANY status.
  SCHEDULED: 'Chờ đến giờ',
  ACCEPTED: 'Đã nhận',
  PICKED_UP: 'Đã đón',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

const paymentMethodMap: Record<string, string> = {
  CASH: '💵 Tiền mặt',
  WALLET: '💳 Ví điện tử',
};

const vehicleTypeMap: Record<string, string> = {
  CAR_4: 'Xe 4 chỗ',
  CAR_7: 'Xe 7 chỗ',
};

const CANCELLED_BY_ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Khách hàng',
  DRIVER: 'Tài xế',
  ADMIN: 'Admin',
  SYSTEM: 'Hệ thống',
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
    // Kiểm SỰ TỒN TẠI của trường, không kiểm dấu: tài 0% không thuộc HTX có
    // htxCommission = vigoCommission = 0, và giờ vigoCommission còn có thể ÂM
    // (Vigo bù cho HTX của tài hưởng mức riêng thấp) — kiểm `> 0` sẽ rơi nhầm
    // vào nhánh legacy (dành cho chuyến trước migration
    // 1782000000000-AddBookingEarningsBreakdown) và mất ô "Tổng kiểm tra".
    const hasNewSplit =
      earnings.htxCommission !== undefined && earnings.vigoCommission !== undefined;

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
              {/* platformFee = htxCommission + vigoCommission có thể ÂM (Vigo bù
                  cho HTX của tài hưởng mức riêng thấp). fmtVnd đã tự in dấu "-"
                  cho số âm — thêm "-" cứng ở đây sẽ ra "--40.000". */}
              <span>{platformFee < 0 ? fmtVnd(platformFee) : `-${fmtVnd(platformFee)}`}</span>
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
function CustomerCallBadge({ status }: { status?: CustomerCallStatus | null }) {
  if (status === 'CALLED') return <Badge className="bg-green-600 text-white hover:bg-green-600 text-[10px] px-1.5 py-0">Đã gọi</Badge>;
  if (status === 'UNREACHED') return <Badge className="bg-amber-500 text-white hover:bg-amber-500 text-[10px] px-1.5 py-0">Không gọi được</Badge>;
  if (status === 'CLAIMED') return <Badge className="bg-blue-600 text-white hover:bg-blue-600 text-[10px] px-1.5 py-0">Đã nhận gọi</Badge>;
  return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Chưa gọi</Badge>;
}

/**
 * Nhãn "chuyến test" — dùng CHUNG cho hàng danh sách và header dialog chi tiết, để
 * hai nơi không trôi dạt về màu/chữ. Tím đặc: cố ý không trùng bảng màu trạng thái
 * (xanh/đỏ/hổ phách) vì đây không phải một trạng thái chuyến, mà là "đừng tin số này".
 */
export function TestTripBadge() {
  return (
    <Badge className="bg-purple-600 text-white hover:bg-purple-600 text-[10px] px-1.5 py-0">
      🧪 TEST
    </Badge>
  );
}

// Exported (only the keyword — no behavior/signature change) so it can be
// unit-tested standalone, same pattern as PriceBreakdownCard above: lets a
// test mock getBookingDetails() and assert on badges (e.g.
// switchedToWholeCar) without mounting the whole BookingsTable.
export function BookingDetail({ bookingId, onClose, onDuplicate, onCallRecorded, onTestFlagChanged }: {
  bookingId: string,
  onClose: () => void,
  // Bỏ trống (vd trong unit test) → không hiện nút "Nhân bản chuyến".
  onDuplicate?: (booking: Booking) => void,
  // CSKH gọi check khách xong → báo danh sách refetch cột "Gọi check".
  onCallRecorded?: () => void,
  // Gạt công tắc "chuyến test" xong → báo danh sách refetch để badge TEST ngoài
  // bảng cập nhật. Dialog có state RIÊNG, không có callback này thì hàng ngoài
  // đứng im tới khi F5. Optional vì test render component này trần.
  onTestFlagChanged?: () => void,
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

  // Công tắc "chuyến test". `testSaving` khoá Switch trong lúc gọi API — bấm nhanh
  // 2 lần sẽ sinh 2 request đua nhau và kết quả cuối cùng là ngẫu nhiên.
  const [testSaving, setTestSaving] = React.useState(false);
  // Giá trị đang chờ xác nhận (chỉ dùng cho chuyến ĐÃ hoàn thành). null = không hỏi gì.
  const [pendingTestFlag, setPendingTestFlag] = React.useState<boolean | null>(null);

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

  /**
   * Gạt công tắc "chuyến test".
   *
   * Cập nhật lạc quan rồi revert về GIÁ TRỊ CŨ ĐÃ CHỤP nếu lỗi — không revert bằng
   * `!next` như mẫu ở promotions-table: ở đó `isActive` là boolean bắt buộc, còn
   * `isTestTrip` optional nên `!undefined === true` sẽ bịa ra một chuyến test.
   */
  const applyTestFlag = async (next: boolean) => {
    if (!booking) return;
    const previous = booking.isTestTrip;
    setTestSaving(true);
    setBooking((prev) => (prev ? { ...prev, isTestTrip: next } : prev));
    try {
      await setBookingTestFlag(booking.id, next);
      toast({
        title: next ? 'Đã đánh dấu chuyến test' : 'Đã bỏ đánh dấu chuyến test',
        description: next
          ? 'Chuyến này không còn được tính vào dashboard, tài chính, hoá đơn và đối soát HTX.'
          : 'Chuyến này được tính lại vào các báo cáo như bình thường.',
      });
      onTestFlagChanged?.();
    } catch (err: any) {
      // Vá lại đúng object đang có, KHÔNG nuốt response của API: response chỉ có
      // { id, isTestTrip }, gán cả object vào state sẽ làm trắng dialog.
      setBooking((prev) => (prev ? { ...prev, isTestTrip: previous } : prev));
      toast({ variant: 'destructive', title: 'Không lưu được', description: err.message });
    } finally {
      setTestSaving(false);
    }
  };

  // Chuyến ĐÃ hoàn thành: tiền (ví tài xế, hoa hồng) đã chuyển rồi, cờ chỉ giấu chuyến
  // khỏi báo cáo. Hỏi xác nhận trước để admin biết mình đang làm gì.
  const handleTestToggle = (next: boolean) => {
    if (!booking) return;
    if (booking.status === 'COMPLETED') {
      setPendingTestFlag(next);
      return;
    }
    void applyTestFlag(next);
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

  // null = chuyến đi ngay (không có mốc hẹn nào).
  const scheduleWindow = formatScheduleWindow(
    booking?.scheduledFromTime ?? booking?.scheduledTime,
    booking?.scheduledToTime,
  );

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
                {booking.isTestTrip && <TestTripBadge />}
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

              {/* Công tắc "chuyến test" — đặt ngay dưới hàng badge vì nó quyết định
                  liệu MỌI con số của chuyến này có được tính hay không. */}
              <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="test-trip-toggle" className="text-sm font-medium">
                    Chuyến test
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Bật để loại chuyến khỏi dashboard, tài chính, hoá đơn và đối soát HTX.
                    {booking.status !== 'COMPLETED' &&
                      ' Bật trước khi chuyến hoàn thành thì chuyến cũng không chuyển tiền thật.'}
                  </p>
                </div>
                <Switch
                  id="test-trip-toggle"
                  // `=== true` chứ không phải giá trị trần: field optional, `checked={undefined}`
                  // biến Radix Switch thành uncontrolled và công tắc kẹt cứng.
                  checked={booking.isTestTrip === true}
                  disabled={testSaving}
                  onCheckedChange={handleTestToggle}
                  aria-label="Đánh dấu chuyến test"
                />
              </div>

              {/* Xác nhận cho chuyến ĐÃ HOÀN THÀNH — nói thẳng cái cờ này KHÔNG làm được,
                  để admin không tưởng nó hoàn tiền.
                  CỐ Ý là khối inline chứ không phải AlertDialog: lồng modal Radix trong
                  Dialog này tạo hai focus scope tranh nhau — đúng họ lỗi mà file đã phải vá
                  3 lần bằng workaround pointer-events (L551, L1904, L1949), và ở jsdom nó
                  lặp focus vô hạn tới mức treo test. Một khối cảnh báo tại chỗ vừa tránh
                  hẳn vấn đề, vừa đỡ phải bắt người dùng đọc modal-trên-modal. */}
              {pendingTestFlag !== null && (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-2">
                  <p className="text-sm font-medium">
                    {pendingTestFlag
                      ? 'Đánh dấu chuyến ĐÃ HOÀN THÀNH là chuyến test?'
                      : 'Bỏ đánh dấu chuyến test?'}
                  </p>
                  {pendingTestFlag ? (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        Chuyến sẽ biến khỏi <b>hoá đơn VAT</b> và <b>đối soát HTX</b> — kể cả khi
                        hoá đơn/hợp đồng đã xuất cho khách.
                      </p>
                      <p>
                        Tiền <b>KHÔNG được hoàn</b>: ví tài xế và hoa hồng đã cộng vẫn giữ nguyên.
                        Muốn đảo ngược tiền thật, dùng &ldquo;Huỷ chuyến (đã hoàn thành)&rdquo;
                        thay vì công tắc này.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Chuyến sẽ được tính lại vào mọi báo cáo, gồm cả hoá đơn và đối soát HTX.
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPendingTestFlag(null)}>
                      Huỷ
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        const next = pendingTestFlag;
                        setPendingTestFlag(null);
                        if (next !== null) void applyTestFlag(next);
                      }}
                    >
                      Xác nhận
                    </Button>
                  </div>
                </div>
              )}

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

              {/* Scheduled pickup time — only when the customer booked ahead.
                  Chuyến đời mới có khung [from, to]; `scheduledTime` chỉ mirror
                  mốc đầu (client cũ) nên phải đọc from/to mới thấy đủ 2 mốc. */}
              {scheduleWindow && (
                <Card className="p-3 flex items-center gap-3 border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
                  <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                  </div>
                  <div className="flex-1 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Hẹn giờ</div>
                    <div className="font-semibold">{scheduleWindow}</div>
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

function ReassignDialog({ booking, open, onOpenChange, onReassignSuccess }: { booking: Booking | null, open: boolean, onOpenChange: (open: boolean) => void, onReassignSuccess: () => void }) {
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isReassigning, setIsReassigning] = React.useState(false);
  const [selectedDriverId, setSelectedDriverId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  // Ca CHIỀU VỀ: khách đặt lượt về cho ĐÚNG tài đang chở lượt đi. Mặc định TẮT —
  // bật là hành động có chủ ý của admin, và tài hiện thêm luôn kèm nhãn đỏ.
  const [includeBusy, setIncludeBusy] = React.useState(false);
  const { toast } = useToast();

  // Khung giờ đón của CHÍNH chuyến đang đổi tài — backend chỉ ẩn tài chồng giờ với
  // nó. Chuyến đi ngay (không có mốc hẹn) → bỏ trống, backend hiểu là "bây giờ".
  //
  // Chuyến ĐANG CHẠY (đổi tài để cứu chuyến kẹt): giờ đón đã trôi qua, lọc theo nó
  // là lọc theo một cửa sổ chết. Cần tài rảnh BÂY GIỜ → bỏ hẳn khung giờ đi.
  // (Backend cũng kẹp về `now`, đây là lớp thứ hai cho rõ ý.)
  const rescueInProgress =
    booking?.status === 'ARRIVED' ||
    booking?.status === 'PICKED_UP' ||
    booking?.status === 'DELAYED_WAITING';
  const assignFromIso = rescueInProgress
    ? undefined
    : booking?.scheduledFromTime ?? booking?.scheduledTime ?? undefined;
  const assignToIso = rescueInProgress ? undefined : booking?.scheduledToTime ?? undefined;
  // Chính chuyến đang đổi tài không phải cam kết cản trở — nếu không, tài đang ôm nó
  // sẽ bị cảnh báo đỏ về đúng chuyến admin đang thao tác.
  const excludeBookingId = booking?.id;

  // Reset TÁCH khỏi vòng nạp: gạt ô "hiện tài đang bận" cũng chạy lại effect nạp,
  // mà gộp chung thì mỗi lần gạt sẽ xoá luôn ô tìm kiếm admin vừa gõ.
  //
  // Reset ở chiều ĐÓNG, không phải chiều MỞ. Component này luôn mounted (xem chỗ
  // render `<ReassignDialog>`) nên state sống qua đóng/mở — nhưng reset lúc MỞ thì
  // render đầu vẫn mang `includeBusy` cũ: effect nạp bắn 1 request thừa với giá trị
  // cũ (mỗi request = 3 query DB trên toàn pool), và công tắc hiện BẬT một frame
  // rồi mới lật TẮT. Reset lúc đóng ⇒ lần mở sau đã sạch từ render đầu.
  React.useEffect(() => {
    if (open) return;
    setQuery('');
    setSelectedDriverId(null);
    setIncludeBusy(false);
  }, [open]);

  // Seq guard: gạt qua gạt lại nhanh thì phản hồi của lần gạt CŨ có thể về sau và
  // ghi đè danh sách của lần gạt MỚI — admin nhìn danh sách không khớp ô đang bật.
  const driverFetchSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (!open) return;
    const seq = ++driverFetchSeqRef.current;
    const fetchDrivers = async () => {
      setIsLoading(true);
      try {
        const response = await getAvailableDrivers({
          scheduledFrom: assignFromIso,
          scheduledTo: assignToIso,
          excludeBookingId,
          includeBusy,
        });
        if (seq !== driverFetchSeqRef.current) return; // phản hồi cũ → vứt
        setDrivers(response);
        // Tắt ô lại có thể làm tài ĐANG CHỌN rơi khỏi danh sách. Lúc đó UI trông
        // như chưa chọn ai trong khi `selectedDriverId` vẫn còn và nút Xác nhận
        // vẫn gán được — bỏ chọn hẳn và nói rõ, đừng gán ngầm người admin tưởng đã bỏ.
        setSelectedDriverId((cur) =>
          cur && !response.some((d) => getDriverId(d) === cur) ? null : cur,
        );
      } catch (err: any) {
        if (seq !== driverFetchSeqRef.current) return;
        // Xoá danh sách cũ: giữ lại thì tắt công tắc mà request hỏng sẽ để nguyên
        // danh sách CÓ tài bận dưới một công tắc đọc là TẮT — UI nói dối.
        setDrivers([]);
        toast({ variant: 'destructive', title: 'Không thể tải danh sách tài xế', description: err.message });
      } finally {
        if (seq === driverFetchSeqRef.current) setIsLoading(false);
      }
    };
    fetchDrivers();
  }, [open, toast, assignFromIso, assignToIso, excludeBookingId, includeBusy]);

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
    getImageUrl(driver.user?.avatarUrl || driver.user?.avatar || (driver as any).avatar);

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
        {/* Câu cũ ("Chỉ hiển thị tài xế đang online") SAI: backend nhận cả ONLINE
            lẫn BUSY, chỉ ẩn tài có cam kết CHỒNG GIỜ. Ops đọc câu đó thì kết luận
            tài đang bận vốn không được hiện, và không báo lỗi khi cần gán chiều về. */}
        <DialogDescription>
          Chọn tài xế mới cho chuyến này. Mặc định ẩn tài đang bận trùng khung giờ.
        </DialogDescription>
      </DialogHeader>
      {/* Ca CHIỀU VỀ: khách đặt lượt về cho đúng tài đang chở lượt đi. Lệnh gán vốn
          đã cho phép (không có guard bận) — chỗ này chỉ mở tầng hiển thị. */}
      <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
        <Switch
          id="reassign-include-busy"
          checked={includeBusy}
          onCheckedChange={setIncludeBusy}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <Label htmlFor="reassign-include-busy" className="cursor-pointer text-sm font-medium">
            Hiện cả tài xế đang bận
          </Label>
          <p className="text-xs text-muted-foreground">
            Dùng khi khách đặt chiều về cho đúng tài đang chở. Tài hiện thêm sẽ có nhãn
            đỏ — kiểm giờ trước khi gán, hệ thống không chặn double-book.
          </p>
        </div>
      </div>
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
          // Danh sách rỗng KHÔNG có nghĩa là hết tài: tài đang chở khách bị lọc im
          // lặng. Nói ra, nếu không ops kết luận "hết tài" rồi thôi không tìm nữa.
          <p className="text-center text-muted-foreground py-8">
            Không tìm thấy tài xế khả dụng.
            {!includeBusy && ' Tài đang bận trùng khung giờ đang bị ẩn — bật công tắc phía trên để hiện.'}
          </p>
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
                      {/* Tài đang giữ cam kết ở khung giờ khác giờ VẪN hiện trong danh
                          sách (fix 14/08/2026) — phải nói rõ họ đang giữ chuyến gì. */}
                      <DriverCommitmentBadge commitments={driver.activeCommitments} />
                      {/* `status` chỉ là trạng thái KHAI BÁO — tài bỏ app vẫn ONLINE mãi.
                          Hiện tín hiệu thật để admin không đẩy chuyến vào một máy đã chết. */}
                      {(() => {
                        const state = driverOnlineState(driver.status, (driver as any).presence);
                        if (state === 'online' || state === 'offline') return null;
                        return (
                          <Badge
                            variant="outline"
                            className="text-xs"
                            title={DRIVER_ONLINE_HINT[state]}
                          >
                            {DRIVER_ONLINE_LABEL[state]}
                          </Badge>
                        );
                      })()}
                      {/* Ẩn khi 0 (cùng luật với màn Tạo chuyến): `accept()` zero hoá
                          `availableSeats` cho chuyến không-ghép, nên tài lọt vào danh
                          sách nhờ khung giờ — hoặc nhờ công tắc "hiện tài đang bận" —
                          gần như luôn hiện "còn 0 ghế khách". Bày ra để gán mà lại ghi
                          0 ghế thì UI tự mâu thuẫn. Số ghế thật nằm ở nhãn cam kết. */}
                      {(driver as any).availableSeats > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {/* "ghế KHÁCH": số này là chỗ chở khách, KHÁC "xe N chỗ" (tổng
                              ghế kể ghế lái) trong thông báo BOK_013. Ghi tắt là gây hiểu nhầm. */}
                          còn {(driver as any).availableSeats} ghế khách
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
        {/* Khoá cả khi đang nạp lại: tắt công tắc rồi bấm ngay trong cửa sổ fetch sẽ
            gán đúng tài vừa bị loại — logic bỏ chọn chạy sau nên không cứu kịp. */}
        <Button onClick={handleReassign} disabled={!selectedDriverId || isReassigning || isLoading}>
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

/**
 * `agentOnly` — chỉ hiện chuyến do ĐẠI LÝ đặt hộ. Dùng cho trang "Đơn đặt hộ",
 * vốn trước đây đọc bảng multi_stop_order (rỗng trên prod) nên hiện trắng dù đại
 * lý vẫn đặt đều. Bỏ trống (mặc định) → không lọc, trang "Quản lý chuyến đi"
 * giữ nguyên hành vi cũ.
 */
export function BookingsTable({ agentOnly }: { agentOnly?: boolean } = {}) {
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  // Server-side sort (sắp cả bảng, không chỉ trang hiện tại). Mặc định ngày tạo
  // mới nhất trước; tab Hoàn thành đổi mặc định sang updatedAt (thời gian hoàn thành).
  const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'createdAt', direction: 'descending' });
  // Tìm theo tên/SĐT của khách HOẶC tài xế (BE LIKE %term%).
  const [searchTerm, setSearchTerm] = React.useState('');
  // Tìm theo ID chuyến — BE prefix-match nên admin paste full UUID hay 8 ký tự đầu đều ra.
  const [bookingIdTerm, setBookingIdTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<string>('ALL');
  // Outer trip-type tab. Default 'all' = same landing view as before (no scheduled filter).
  const [tripKind, setTripKind] = React.useState<TripKind>('all');
  // 'ALL' = no route filter; 'none' = trips with no route stamped (debug
  // bucket: legacy + routing-miss); numeric string = exact match. UI keeps
  // it as string so the Select's value/onValueChange contract is clean —
  // we cast back to number | 'none' when calling the API.
  const [selectedRouteId, setSelectedRouteId] = React.useState<string>('ALL');
  // Lọc "gọi check khách": 'ALL' = không lọc; called/unreached/uncalled = trạng thái.
  const [customerCallFilter] = React.useState<CustomerCallFilter | 'ALL'>('ALL');
  // Lọc riêng từng pha. Dùng đồng thời được: "đã gọi trước" + "chưa gọi sau" = danh
  // sách chuyến CSKH còn nợ cuộc gọi hậu mãi.
  const [callBeforeFilter, setCallBeforeFilter] = React.useState<CustomerCallFilter | 'ALL'>('ALL');
  const [callAfterFilter, setCallAfterFilter] = React.useState<CustomerCallFilter | 'ALL'>('ALL');
  // Lọc khoảng ngày ĐẶT chuyến (createdAt). VN-local YYYY-MM-DD; '' = không lọc.
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  // Lọc "Chuyến test". Mặc định 'ALL' = hiện cả hai: đây là màn admin gạt cờ, giấu
  // chuyến test đi thì chuyến gạt nhầm biến mất khỏi tầm mắt, không sửa lại được.
  const [testFilter, setTestFilter] = React.useState<TestTripFilter | 'ALL'>('ALL');
  const [routes, setRoutes] = React.useState<Route[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);

  const [selectedBookingId, setSelectedBookingId] = React.useState<string | null>(null);
  const [reassigningBooking, setReassigningBooking] = React.useState<Booking | null>(null);
  const [voidBookingId, setVoidBookingId] = React.useState<string | null>(null);
  // Nhân bản chuyến: bản nháp điền sẵn cho form Tạo chuyến (null = không nhân bản).
  const [duplicateDraft, setDuplicateDraft] = React.useState<BookingDraft | null>(null);
  // Tăng mỗi lần bấm "Nhân bản" → remount form để state luôn sạch. Không dùng
  // draft làm key vì lúc đóng draft về null sẽ remount giữa chừng, cụt animation.
  const [duplicateSeq, setDuplicateSeq] = React.useState(0);

  const [dialogState, setDialogState] = React.useState<{ open: boolean; booking: Booking | null; newStatus: BookingStatus | null }>({ open: false, booking: null, newStatus: null });
  const [statusNote, setStatusNote] = React.useState('');
  const [isUpdating, setIsUpdating] = React.useState(false);
  // [DISABLED 2026-07-09] state cho "admin ôm chuyến về operator" (đã tắt).
  // const [acceptingBookingId, setAcceptingBookingId] = React.useState<string | null>(null);
  // const [isAccepting, setIsAccepting] = React.useState(false);


  const fetchBookings = React.useCallback(async ({ tab, search, bookingId, page, limit, routeFilter, sort, tripKind, customerCall, callBefore, callAfter, dateFrom, dateTo, testFilter }: FetchArgs) => {
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

      const params: any = {
        page, limit, status, processingState,
        // Sắp xếp ở server → áp cho toàn bộ dữ liệu của tab, không chỉ trang đang xem.
        sortBy: sort.key,
        order: sort.direction === 'ascending' ? 'ASC' : 'DESC',
      };
      if (search) {
        params.q = search;
      }
      if (bookingId) {
        params.bookingId = bookingId;
      }
      // 'ALL' = unset → no filter; 'none' passes through as the sentinel the
      // backend understands; everything else parses to numeric routeId.
      if (routeFilter === 'none') {
        params.routeId = 'none';
      } else if (routeFilter !== 'ALL') {
        const parsed = Number(routeFilter);
        if (Number.isFinite(parsed)) params.routeId = parsed;
      }
      // Trip-type: 'all' omits the param (no filter); the other two map to the boolean.
      if (tripKind === 'scheduled') params.scheduled = true;
      else if (tripKind === 'regular') params.scheduled = false;
      // Gọi check khách: 'ALL' bỏ param; còn lại truyền thẳng cho backend.
      if (customerCall !== 'ALL') params.customerCall = customerCall;
      if (callBefore && callBefore !== 'ALL') params.callBefore = callBefore;
      if (callAfter && callAfter !== 'ALL') params.callAfter = callAfter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      if (agentOnly) params.agentOnly = true;
      // Chuyến test: 'ALL' bỏ hẳn param (mặc định backend cũng là hiện cả hai) — gửi
      // thừa không sai, nhưng bỏ hẳn thì màn này vẫn chạy cả khi backend chưa deploy.
      if (testFilter !== 'ALL') params.testFilter = testFilter;

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
  }, [toast, agentOnly]);

  // Reload with the CURRENT filter/sort/trip-kind state — used by every imperative refetch
  // (status update, claim, reassign, void, create). Keeps all 5 in sync with the outer tab.
  const reload = React.useCallback(() => {
    fetchBookings({ tab: activeTab, search: searchTerm, bookingId: bookingIdTerm, page: currentPage, limit: pageSize, routeFilter: selectedRouteId, sort: sortConfig, tripKind, customerCall: customerCallFilter, callBefore: callBeforeFilter, callAfter: callAfterFilter, dateFrom, dateTo, testFilter });
  }, [fetchBookings, activeTab, searchTerm, bookingIdTerm, currentPage, pageSize, selectedRouteId, sortConfig, tripKind, customerCallFilter, callBeforeFilter, callAfterFilter, dateFrom, dateTo, testFilter]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchBookings({ tab: activeTab, search: searchTerm, bookingId: bookingIdTerm, page: currentPage, limit: pageSize, routeFilter: selectedRouteId, sort: sortConfig, tripKind, customerCall: customerCallFilter, callBefore: callBeforeFilter, callAfter: callAfterFilter, dateFrom, dateTo, testFilter });
    }, 500); // Debounce search

    return () => clearTimeout(timer);
    // ⚠️ testFilter PHẢI có trong deps: đây (không phải reload) mới là chỗ fetch khi
    // bộ lọc đổi. Thiếu nó thì chọn filter xong bảng đứng im, không lỗi, không log.
  }, [fetchBookings, activeTab, searchTerm, bookingIdTerm, currentPage, pageSize, selectedRouteId, sortConfig, tripKind, customerCallFilter, callBeforeFilter, callAfterFilter, dateFrom, dateTo, testFilter]);

  // Fetch routes once on mount for the Lọc theo tuyến dropdown. Soft-fail
  // to an empty list — the filter just collapses to "Tất cả / Chưa có tuyến"
  // if routes don't load.
  React.useEffect(() => {
    let cancelled = false;
    getRoutes()
      .then((data) => {
        if (!cancelled) setRoutes(data ?? []);
      })
      .catch(() => {
        if (!cancelled) setRoutes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value as string);
    setCurrentPage(1); // Reset to page 1 on tab change
    // Tab Hoàn thành sắp theo completedAt — cùng cột với giá trị đang hiển thị. Trước đây sort
    // updatedAt còn hiện completedAt: chuyến cũ nào bị ghi lại (backfill distanceKm) là nhảy lên
    // đầu danh sách nhưng mang ngày hoàn thành cũ, nên tab "hôm nay" lẫn chuyến của tháng trước.
    // Backfill (BE migration 1790200000000) điền completedAt cho TOÀN BỘ chuyến COMPLETED — 125 dòng
    // lấy mốc từ ledger lúc hoàn thành, 121 dòng cũ (01–04/2026, chưa có ledger giữ thuế) lấy
    // updatedAt; không còn dòng NULL nào. BE vẫn có NULLS LAST phòng chuyến mới lỡ thiếu.
    setSortConfig(
      value === 'COMPLETED'
        ? { key: 'completedAt', direction: 'descending' }
        : { key: 'createdAt', direction: 'descending' },
    );
  }

  const handleTripKindChange = (value: string) => {
    setTripKind(value as TripKind);
    // Reset the status sub-tab to "Tất cả" and the sort to the createdAt default: switching to
    // "Chuyến thường" hides the SCHEDULED sub-tab, so staying on it would orphan the selection
    // (empty table, no highlighted tab). Resetting keeps the view predictable.
    setActiveTab('ALL');
    setSortConfig({ key: 'createdAt', direction: 'descending' });
    setCurrentPage(1);
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to page 1 on search
  }

  const handleBookingIdChange = (value: string) => {
    setBookingIdTerm(value);
    setCurrentPage(1);
  }

  const openDetails = (bookingId: string) => {
    setSelectedBookingId(bookingId);
  }

  // Nhân bản: đóng chi tiết (nếu đang mở) rồi mở form Tạo chuyến đã điền sẵn.
  const startDuplicate = (booking: Booking) => {
    setSelectedBookingId(null);
    setDuplicateSeq((n) => n + 1);
    // Draft dựng MỘT LẦN rồi giữ trong state: form chỉ áp prefill khi identity của
    // draft đổi. Đừng dựng inline ở JSX (bookingToDraft(...) trong prop) — object
    // mới mỗi render sẽ đè liên tục lên phần admin đang gõ.
    setDuplicateDraft(bookingToDraft(booking));
  }

  const handleStatusUpdate = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!dialogState.booking || !dialogState.newStatus) return;

    setIsUpdating(true);
    try {
      await updateBookingStatus(dialogState.booking.id, dialogState.newStatus, statusNote || undefined);
      toast({ title: 'Đã cập nhật trạng thái', description: `Chuyến #${dialogState.booking.id} đã được chuyển sang ${statusLabelMap[dialogState.newStatus] ?? dialogState.newStatus}.` });
      reload();
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

  // [DISABLED 2026-07-09] handler "admin ôm chuyến về operator" — gán về tài khoản ảo,
  // 0 commission => vỡ dòng tiền. Dùng PROCESSING + claim + reassign tài thật thay thế.
  /*
  const handleAcceptBooking = async () => {
    if (!acceptingBookingId) return;
    setIsAccepting(true);
    try {
      await adminAcceptBooking(acceptingBookingId);
      toast({ title: 'Thành công', description: 'Đã nhận chuyến thành công.' });
      reload();
      setAcceptingBookingId(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Nhận chuyến thất bại', description: err.message });
    } finally {
      setIsAccepting(false);
    }
  }
  */

  const handleClaimBooking = async (booking: Booking) => {
    try {
      await claimProcessingBooking(booking.id);
      toast({ title: 'Đã nhận xử lý', description: 'Chuyến không còn bị tự huỷ sau 5 phút. Bạn cần đẩy chuyến cho tài xế hoặc huỷ thủ công.' });
      reload();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Nhận xử lý thất bại', description: err.message });
    }
  }

  // Server đã sắp xếp toàn bộ tập dữ liệu của tab (không chỉ trang hiện tại), nên
  // hiển thị nguyên thứ tự trả về — KHÔNG sắp lại phía client (sẽ chỉ đảo 20 dòng).
  const sortedBookings = bookings;

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1); // Sắp xếp lại từ trang đầu để đúng thứ tự toàn cục.
  };

  const statusChangeOptions: BookingStatus[] = ['ACCEPTED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'];

  // Hide the SCHEDULED status sub-tab under "Chuyến thường" — a ride-now trip is never in the
  // pre-dispatch SCHEDULED state, so that sub-tab would always be empty there.
  const visibleTabKeys = tripKind === 'regular' ? tabKeys.filter((k) => k !== 'SCHEDULED') : tabKeys;

  // The "Đặt lịch" tab adds a "Giờ hẹn đón" column. Column count for the loading/empty/error rows:
  // base 8 (gồm cột "Gọi check" luôn hiện), +1 for COMPLETED (Ngày hoàn thành), +3 for CANCELLED
  // (huỷ cols), +1 for the scheduled column — these stack.
  const showScheduledCol = tripKind === 'scheduled';
  // +1: cột "Gọi check" tách thành 2 (Gọi trước / Gọi sau hoàn thành).
  const colSpan =
    9 +
    (activeTab === 'COMPLETED' ? 1 : 0) +
    (activeTab === 'CANCELLED' ? 3 : 0) +
    (showScheduledCol ? 1 : 0);

  return (
    <>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {/* Hàng 1: chỉ tab TRẠNG THÁI. Loại chuyến (thường/đặt lịch) đã chuyển thành
            dropdown ở hàng filter bên dưới — trước là 1 lớp tab riêng phía trên. */}
        <TabsList className='flex-wrap h-auto'>
          <TabsTrigger value="ALL">{statusLabelMap['ALL']}</TabsTrigger>
          {visibleTabKeys.map(key => (
            <TabsTrigger key={key} value={key}>{statusLabelMap[key] ?? key}</TabsTrigger>
          ))}
        </TabsList>
        {/* Hàng 2 (dưới tab trạng thái): mọi bộ lọc + search + tạo chuyến gộp 1 hàng. */}
        <div className="flex flex-wrap items-center gap-2 py-4">
          <Select
            value={tripKind}
            onValueChange={(val) => handleTripKindChange(val)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Loại chuyến" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả loại</SelectItem>
              <SelectItem value="regular">Chuyến thường</SelectItem>
              <SelectItem value="scheduled">Đặt lịch</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={selectedRouteId}
            onValueChange={(val) => { setSelectedRouteId(val); setCurrentPage(1); }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Lọc theo tuyến" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả tuyến</SelectItem>
              <SelectItem value="none">Chưa có tuyến</SelectItem>
              {routes.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {([
            { label: 'Gọi trước HT', value: callBeforeFilter, set: setCallBeforeFilter },
            { label: 'Gọi sau HT', value: callAfterFilter, set: setCallAfterFilter },
          ] as const).map((f) => (
            <Select
              key={f.label}
              value={f.value}
              onValueChange={(val) => { f.set(val as CustomerCallFilter | 'ALL'); setCurrentPage(1); }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{f.label}: tất cả</SelectItem>
                <SelectItem value="uncalled">Chưa gọi</SelectItem>
                <SelectItem value="claimed">Đã nhận gọi</SelectItem>
                <SelectItem value="called">Đã gọi được</SelectItem>
                <SelectItem value="unreached">Không liên lạc được</SelectItem>
              </SelectContent>
            </Select>
          ))}
          <Select
            value={testFilter}
            // setCurrentPage(1) như MỌI filter khác: đang ở trang 5 mà chọn "Chỉ chuyến
            // test" thì trang 5 của tập nhỏ hơn là rỗng, và nút phân trang khoá luôn.
            onValueChange={(val) => { setTestFilter(val as TestTripFilter | 'ALL'); setCurrentPage(1); }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Chuyến test" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Chuyến test: tất cả</SelectItem>
              <SelectItem value="exclude">Chỉ chuyến thật</SelectItem>
              <SelectItem value="only">Chỉ chuyến test</SelectItem>
            </SelectContent>
          </Select>
          <div className='relative'>
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm tên/SĐT khách hoặc tài xế"
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-[240px] pl-8"
            />
          </div>
          <div className='relative'>
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm ID chuyến (8 ký tự đầu OK)"
              value={bookingIdTerm}
              onChange={(e) => handleBookingIdChange(e.target.value)}
              className="w-[240px] pl-8"
            />
          </div>
          {/* Lọc khoảng ngày ĐẶT chuyến (createdAt, giờ VN). Đổi ngày → về trang 1. */}
          <div className="flex items-center gap-1.5">
            <Label className="whitespace-nowrap text-xs text-muted-foreground">Ngày đặt:</Label>
            <Input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
              className="w-[150px]"
              aria-label="Từ ngày"
            />
            <span className="text-sm text-muted-foreground">→</span>
            <Input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
              className="w-[150px]"
              aria-label="Đến ngày"
            />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { setDateFrom(''); setDateTo(''); setCurrentPage(1); }}>
                Xóa
              </Button>
            )}
          </div>
          <div className='ml-auto'>
            <CreateBookingDialog onSuccess={() => reload()} />
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
                {/* Tab Đặt lịch: cột "Giờ hẹn đón" (scheduledTime) + cho sắp xếp theo giờ đón. */}
                {showScheduledCol && (
                  <TableHead>
                    <Button variant="ghost" onClick={() => requestSort('scheduledTime')}>
                      Giờ hẹn đón
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                )}
                {/* Tab Hoàn thành: cột thời gian hoàn thành THẬT (completedAt, fallback updatedAt).
                    Sort cùng cột với giá trị hiển thị — xem handleTabChange. */}
                {activeTab === 'COMPLETED' && (
                  <TableHead>
                    <Button variant="ghost" onClick={() => requestSort('completedAt')}>
                      Ngày hoàn thành
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                )}
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('status')}>
                    Trạng thái
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                {/* Gọi check khách — trạng thái CSKH đã gọi verify khách hay chưa. */}
                {/* CSKH gọi 2 lần cho mỗi chuyến: trước khi hoàn thành và sau khi hoàn
                    thành. Hai việc độc lập nên phải là 2 cột — trước đây gộp 1 cột nên
                    lần gọi sau đè mất dấu vết lần gọi trước. */}
                <TableHead>Gọi trước HT</TableHead>
                <TableHead>Gọi sau HT</TableHead>
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
                  <TableCell colSpan={colSpan} className="h-24 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : sortedBookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="h-24 text-center">
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
                        {booking.agentPhone && (
                          <span className='inline-flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400'>
                            <Store className='h-3 w-3' /> Đặt hộ: {booking.agentPhone}
                          </span>
                        )}
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
                    {/* Giờ hẹn đón — chỉ ở tab Đặt lịch. Chuyến thường không có scheduledTime. */}
                    {showScheduledCol && (
                      <TableCell>
                        {booking.scheduledTime
                          ? format(new Date(booking.scheduledTime), "dd/MM/yyyy HH:mm")
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    {/* Ngày hoàn thành = completedAt THẬT (fallback updatedAt cho rows cũ chưa có
                        completedAt). Không dùng updatedAt trực tiếp vì nó bị bump bởi ghi sau hoàn
                        thành (vd backfill distanceKm). Chỉ hiện ở tab Hoàn thành. */}
                    {activeTab === 'COMPLETED' && (
                      <TableCell>
                        {(booking.completedAt ?? booking.updatedAt)
                          ? format(new Date(booking.completedAt ?? booking.updatedAt!), "dd/MM/yyyy HH:mm")
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        {getStatusBadge(booking)}
                        {/* Trip-shape badges live under the status badge so the
                            "Trạng thái" column tells admin at a glance how
                            this trip was placed, not just where it's at. */}
                        {/* Chuyến test đứng ĐẦU stack: nó là điều quan trọng nhất cần
                            biết về dòng này (chuyến không tính vào bất kỳ báo cáo nào). */}
                        {booking.isTestTrip && <TestTripBadge />}
                        {booking.isVinow && (
                          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 hover:bg-orange-100 text-[10px] px-1.5 py-0">
                            ⚡ Vi-now
                          </Badge>
                        )}
                        {booking.scheduledTime && (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-100 text-[10px] px-1.5 py-0">
                            🕐 Hẹn giờ
                          </Badge>
                        )}
                        {booking.status === 'PROCESSING' && booking.adminClaimedAt && booking.adminClaimedBy && (
                          <span className="text-[11px] text-muted-foreground">
                            {booking.adminClaimedBy.fullName || booking.adminClaimedBy.phone || 'Admin'}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {/* Hai pha gọi độc lập. Bấm vào chuyến để ghi nhận (khối "Gọi check
                        khách" trong dialog chi tiết tự chọn pha theo trạng thái chuyến). */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5 items-start">
                        <CustomerCallBadge status={booking.callBeforeStatus} />
                        {booking.callBeforeAt && (
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(booking.callBeforeAt), 'dd/MM HH:mm')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 items-start">
                        <CustomerCallBadge status={booking.callAfterStatus} />
                        {booking.callAfterAt && (
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(booking.callAfterAt), 'dd/MM HH:mm')}
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
                          {/* [DISABLED 2026-07-09] "⭐ Nhận chuyến" (admin ôm về operator) — vỡ dòng tiền.
                              Dùng "🛎️ Nhận xử lý" (PROCESSING) + gán tài xế THẬT.
                          {(booking.status === 'SEARCHING' || booking.status === 'SCHEDULED') && (
                            <DropdownMenuItem onSelect={() => setAcceptingBookingId(booking.id)}>
                              ⭐ Nhận chuyến
                            </DropdownMenuItem>
                          )}
                          */}
                          {booking.status === 'PROCESSING' && !booking.adminClaimedAt && (
                            <DropdownMenuItem onSelect={() => handleClaimBooking(booking)}>
                              🛎️ Nhận xử lý
                            </DropdownMenuItem>
                          )}
                          {/* Không khoá theo trạng thái: nhân bản chuyến đã hoàn thành / đã huỷ
                              chính là ca dùng chính (khách quen đặt lại tuyến cũ). */}
                          <DropdownMenuItem onSelect={() => startDuplicate(booking)}>
                            <CopyPlus className="mr-2 h-4 w-4" />
                            Nhân bản chuyến
                          </DropdownMenuItem>
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
                          {booking.status === 'COMPLETED' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => setVoidBookingId(booking.id)}
                              >
                                Huỷ chuyến (đã hoàn thành)
                              </DropdownMenuItem>
                            </>
                          )}
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
      {selectedBookingId && (
        <BookingDetail
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onDuplicate={startDuplicate}
          onCallRecorded={reload}
          // Gạt công tắc test → refetch để badge TEST + bộ lọc ngoài bảng khớp lại.
          onTestFlagChanged={reload}
        />
      )}
      {/* Form Tạo chuyến ở chế độ controlled — chỉ dùng cho luồng nhân bản (không có
          nút trigger riêng). `key` theo chuyến gốc để mỗi lần nhân bản là state sạch. */}
      <CreateBookingDialog
        key={duplicateSeq}
        open={!!duplicateDraft}
        onOpenChange={(v) => { if (!v) setDuplicateDraft(null); }}
        initial={duplicateDraft}
        onSuccess={() => { setDuplicateDraft(null); reload(); }}
      />
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
            reload();
          }}
        />
      </Dialog>
      <VoidBookingDialog
        bookingId={voidBookingId}
        open={!!voidBookingId}
        onOpenChange={(o) => { if (!o) setVoidBookingId(null); }}
        onDone={() => reload()}
      />
      {/* [DISABLED 2026-07-09] Dialog "admin ôm chuyến về operator" — vỡ dòng tiền (gán về tài khoản ảo, 0 commission).
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
      */}
    </>
  );
}
