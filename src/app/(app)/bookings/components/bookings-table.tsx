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
import { MoreHorizontal, ArrowUpDown, Loader2, Search, Car, User, Phone, CopyPlus, Store, MapPin, Copy } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// Dùng cho công tắc "Hiện cả tài xế đang bận" trong ReassignDialog. Import này từng bị
// ĐÁNH RƠI khi giải xung đột merge (nhánh GĐ1 bỏ khối gọi-khách khỏi cùng dòng import),
// và vì next.config bật ignoreBuildErrors nên build vẫn xanh — chỉ nổ ReferenceError lúc
// admin mở dialog gán tài xế. Đừng gộp dòng này vào cụm import khác.
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
// [DISABLED 2026-07-09] adminAcceptBooking bỏ khỏi import — "admin ôm chuyến về operator" đã tắt (vỡ dòng tiền).
import { getBookings, updateBookingStatus, getAvailableDrivers, reassignBooking, /* adminAcceptBooking, */ claimProcessingBooking, getRoutes} from '@/lib/api';
import { BookingDetail, CustomerCallBadge } from './booking-detail';
import { buildTripPassText } from './booking-pass-utils';
import { CANCELLED_BY_ROLE_LABEL, DuplicateTripBadge, FirstTripBadge, formatVnShort, getStatusBadge, statusLabelMap, TestTripBadge } from './booking-shared';
import { VoidBookingDialog } from './void-booking-dialog';
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
import type { Booking, BookingStatus, CustomerCallFilter, DuplicateTripFilter, Driver, TestTripFilter } from '@/lib/types';
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
// CANCELLED_AFTER_ACCEPT cũng là tab ảo: status=CANCELLED + cancelledState=afterAccept
// (chuyến đã có tài xế rồi mới huỷ) — cùng khuôn, cùng lý do: không đẻ thêm BookingStatus.
type TabKey = BookingStatus | 'NEEDS_ADMIN' | 'ADMIN_HANDLING' | 'CANCELLED_AFTER_ACCEPT' | 'ALL';

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
  dateFrom: string;
  dateTo: string;
  /**
   * Lọc "Chuyến test". 'ALL' = hiện cả hai (mặc định).
   *
   * CỐ Ý bắt buộc (không `?:`): tsc phải đỏ ở CẢ HAI call-site nếu quên truyền.
   * Mảng deps của useEffect thì không có gì chặn được, vì next.config bật
   * ignoreDuringBuilds — nên chỗ đó phải tự soi bằng mắt.
   */
  testFilter: TestTripFilter | 'ALL';
  /**
   * Ô "Tìm theo địa chỉ": chuỗi NGUYÊN VĂN admin gõ. '' = không lọc.
   * Bắt buộc (không `?:`) vì cùng lý do với `testFilter` ngay trên.
   */
  address: string;
  /**
   * Lọc pha gọi TRƯỚC khi chuyến hoàn thành. 'ALL' = không lọc.
   *
   * CHỈ pha "trước" — pha "sau hoàn thành" cố ý ở lại /crm-queue (CRM GĐ1). Bảng này
   * dùng để điều hành chuyến đang chạy, không phải hậu mãi.
   * Bắt buộc (không `?:`) vì cùng lý do với `testFilter`.
   */
  callBefore: CustomerCallFilter | 'ALL';
  /**
   * Lọc cờ "chuyến trùng". 'ALL' = hiện cả hai (mặc định).
   * Bắt buộc (không `?:`) vì cùng lý do với `testFilter`.
   */
  duplicateFilter: DuplicateTripFilter | 'ALL';
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
  'CANCELLED_AFTER_ACCEPT',
];






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
  // Tìm theo ĐỊA CHỈ điểm đón HOẶC điểm trả. BE bỏ dấu và tách token theo khoảng trắng
  // (mọi token phải khớp cùng một điểm), nên gõ "da nang" ra "Đà Nẵng" và
  // "nguyen van cu da nang" ra "Nguyễn Văn Cừ, Đà Nẵng".
  const [addressTerm, setAddressTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<string>('ALL');
  // Outer trip-type tab. Default 'all' = same landing view as before (no scheduled filter).
  const [tripKind, setTripKind] = React.useState<TripKind>('all');
  // 'ALL' = no route filter; 'none' = trips with no route stamped (debug
  // bucket: legacy + routing-miss); numeric string = exact match. UI keeps
  // it as string so the Select's value/onValueChange contract is clean —
  // we cast back to number | 'none' when calling the API.
  const [selectedRouteId, setSelectedRouteId] = React.useState<string>('ALL');
  // Lọc "gọi check khách": 'ALL' = không lọc; called/unreached/uncalled = trạng thái.
  // Lọc riêng từng pha. Dùng đồng thời được: "đã gọi trước" + "chưa gọi sau" = danh
  // sách chuyến CSKH còn nợ cuộc gọi hậu mãi.
  // Lọc khoảng ngày ĐẶT chuyến (createdAt). VN-local YYYY-MM-DD; '' = không lọc.
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  // Lọc "Chuyến test". Mặc định 'ALL' = hiện cả hai: đây là màn admin gạt cờ, giấu
  // chuyến test đi thì chuyến gạt nhầm biến mất khỏi tầm mắt, không sửa lại được.
  const [testFilter, setTestFilter] = React.useState<TestTripFilter | 'ALL'>('ALL');
  // Lọc pha gọi TRƯỚC hoàn thành: 'ALL' = không lọc. Chỉ pha "trước" — pha "sau" ở
  // /crm-queue. Cột + dropdown này từng bị gỡ đi ở GĐ1 rồi thêm lại theo yêu cầu vận
  // hành: điều phối cần thấy chuyến nào CHƯA được gọi xác nhận ngay trên bảng chính.
  const [callBeforeFilter, setCallBeforeFilter] = React.useState<CustomerCallFilter | 'ALL'>('ALL');
  // Lọc "Chuyến trùng". Mặc định 'ALL' = hiện cả hai, cùng lý do với chuyến test: đây là
  // màn admin gạt cờ, giấu đi thì chuyến gạt nhầm biến mất khỏi tầm mắt.
  const [duplicateFilter, setDuplicateFilter] = React.useState<DuplicateTripFilter | 'ALL'>('ALL');
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


  const fetchBookings = React.useCallback(async ({ tab, search, bookingId, page, limit, routeFilter, sort, tripKind, dateFrom, dateTo, testFilter, address, callBefore, duplicateFilter }: FetchArgs) => {
    setIsLoading(true);
    setError(null);
    try {
      // Translate the two virtual PROCESSING tabs into the real query —
      // status=PROCESSING + processingState=unclaimed|claimed. Backend sees
      // a single enum so the customer/driver apps stay unchanged.
      let status: string | undefined = tab === 'ALL' ? undefined : tab;
      let processingState: 'unclaimed' | 'claimed' | undefined;
      // Tab ảo "Huỷ sau khi nhận" — cùng khuôn: BE lọc driverId IS NOT NULL, và nó CHỈ
      // có nghĩa kèm status=CANCELLED. Quên gán lại `status` thì tab ra TOÀN BỘ chuyến.
      let cancelledState: 'afterAccept' | undefined;
      if (tab === 'NEEDS_ADMIN') {
        status = 'PROCESSING';
        processingState = 'unclaimed';
      } else if (tab === 'ADMIN_HANDLING') {
        status = 'PROCESSING';
        processingState = 'claimed';
      } else if (tab === 'CANCELLED_AFTER_ACCEPT') {
        status = 'CANCELLED';
        cancelledState = 'afterAccept';
      }

      // KHÔNG dùng `any` ở đây: `any` làm tsc thôi kiểm tên field, nên một typo kiểu
      // `params.adress` sẽ compile sạch, `getBookings` bỏ qua field lạ, và ô lọc im lặng
      // không lọc gì. Buộc kiểu theo đúng tham số của getBookings để typo là lỗi biên dịch.
      const params: NonNullable<Parameters<typeof getBookings>[0]> = {
        page, limit, status, processingState, cancelledState,
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
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      if (agentOnly) params.agentOnly = true;
      // Chuyến test: 'ALL' bỏ hẳn param (mặc định backend cũng là hiện cả hai) — gửi
      // thừa không sai, nhưng bỏ hẳn thì màn này vẫn chạy cả khi backend chưa deploy.
      if (testFilter !== 'ALL') params.testFilter = testFilter;
      // Địa chỉ: gửi nguyên văn, BE lo bỏ dấu. Rỗng → bỏ hẳn param.
      if (address) params.address = address;
      // Gọi trước HT: 'ALL' bỏ hẳn param (BE mặc định cũng là không lọc).
      if (callBefore !== 'ALL') params.callBefore = callBefore;
      // Chuyến trùng: 'ALL' bỏ hẳn param — cùng lý do với testFilter, màn này vẫn chạy
      // được cả khi backend chưa deploy cột/bộ lọc mới.
      if (duplicateFilter !== 'ALL') params.duplicateFilter = duplicateFilter;

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
  //
  // ⚠️ MỌI state lọc phải có trong deps dưới đây. Thiếu một cái (vd `addressTerm`) thì
  // `reload` đóng băng giá trị cũ: admin đang lọc "Đà Nẵng", đổi trạng thái 1 chuyến →
  // reload bắn request KHÔNG có bộ lọc đó → bảng nhảy về danh sách đầy đủ. Trông y hệt
  // "bộ lọc tự tắt", không lỗi, không log. eslint exhaustive-deps KHÔNG chặn được vì
  // next.config bật ignoreDuringBuilds.
  const reload = React.useCallback(() => {
    fetchBookings({ tab: activeTab, search: searchTerm, bookingId: bookingIdTerm, page: currentPage, limit: pageSize, routeFilter: selectedRouteId, sort: sortConfig, tripKind, dateFrom, dateTo, testFilter, address: addressTerm, callBefore: callBeforeFilter, duplicateFilter });
  }, [fetchBookings, activeTab, searchTerm, bookingIdTerm, currentPage, pageSize, selectedRouteId, sortConfig, tripKind, dateFrom, dateTo, testFilter, addressTerm, callBeforeFilter, duplicateFilter]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchBookings({ tab: activeTab, search: searchTerm, bookingId: bookingIdTerm, page: currentPage, limit: pageSize, routeFilter: selectedRouteId, sort: sortConfig, tripKind, dateFrom, dateTo, testFilter, address: addressTerm, callBefore: callBeforeFilter, duplicateFilter });
    }, 500); // Debounce search

    return () => clearTimeout(timer);
    // ⚠️ testFilter PHẢI có trong deps: đây (không phải reload) mới là chỗ fetch khi
    // bộ lọc đổi. Thiếu nó thì chọn filter xong bảng đứng im, không lỗi, không log.
  }, [fetchBookings, activeTab, searchTerm, bookingIdTerm, currentPage, pageSize, selectedRouteId, sortConfig, tripKind, dateFrom, dateTo, testFilter, addressTerm, callBeforeFilter, duplicateFilter]);

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

  const handleAddressChange = (value: string) => {
    setAddressTerm(value);
    setCurrentPage(1); // như mọi filter khác: trang 5 của tập nhỏ hơn là bảng trắng.
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

  const handleCopyPass = async (booking: Booking) => {
    const text = buildTripPassText(booking);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast({
        title: 'Đã sao chép thông tin chuyến',
        description: 'Đã copy đầy đủ thông tin để pass vào nhóm Zalo/Telegram.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Không thể sao chép',
        description: 'Vui lòng thử lại hoặc cấp quyền clipboard cho trình duyệt.',
      });
    }
  };

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
  // base 8, +1 for COMPLETED (Ngày hoàn thành), +3 for CANCELLED (huỷ cols),
  // +1 for the scheduled column — these stack.
  // 2026-08-12: 2 cột gọi khách đã chuyển sang /crm-queue (CRM GĐ1) -> 9 xuống 7.
  // 2026-08-24: thêm cột "Ghi chú" (adminMemo) -> 7 lên 8.
  // 2026-08-24 (đợt sau): BỎ cột "Ghi chú" và thêm lại cột "Gọi trước HT" -> VẪN 8.
  // Số không đổi nhưng thành phần thì đổi — đừng suy ra "không cần đếm lại". Lệch số
  // này không ném lỗi, chỉ làm dòng "Không tìm thấy chuyến nào" co lệch bảng, nên đã
  // khoá bằng test (bookings-table.colspan.test.tsx: colSpan phải bằng số <th> thật).
  const showScheduledCol = tripKind === 'scheduled';
  // 3 cột huỷ áp cho CẢ hai tab huỷ. Trước đây là chuỗi cứng `activeTab === 'CANCELLED'`
  // ở 5 chỗ (2 <th>/<td> + công thức colSpan này) — thêm tab huỷ thứ hai mà sót một chỗ
  // thì bảng lệch cột hoặc mất dữ liệu huỷ, KHÔNG có lỗi nào được ném ra.
  const isCancelledTab = activeTab === 'CANCELLED' || activeTab === 'CANCELLED_AFTER_ACCEPT';
  const colSpan =
    8 +
    (activeTab === 'COMPLETED' ? 1 : 0) +
    (isCancelledTab ? 3 : 0) +
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
          {/* Lọc cờ "chuyến trùng". Đứng cạnh bộ lọc chuyến test vì cùng dạng cờ admin
              gạt tay — nhưng hệ quả khác hẳn: chuyến trùng VẪN tính doanh thu. */}
          <Select
            value={duplicateFilter}
            onValueChange={(val) => { setDuplicateFilter(val as DuplicateTripFilter | 'ALL'); setCurrentPage(1); }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Chuyến trùng" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Chuyến trùng: tất cả</SelectItem>
              <SelectItem value="exclude">Ẩn chuyến trùng</SelectItem>
              <SelectItem value="only">Chỉ chuyến trùng</SelectItem>
            </SelectContent>
          </Select>
          {/* Lọc pha gọi TRƯỚC hoàn thành. Chỉ pha "trước" — dropdown "Gọi sau HT" cố ý
              ở lại /crm-queue, bảng này lo chuyến đang chạy chứ không lo hậu mãi. */}
          <Select
            value={callBeforeFilter}
            // setCurrentPage(1) như MỌI filter khác: trang 5 của tập nhỏ hơn là bảng trắng.
            onValueChange={(val) => { setCallBeforeFilter(val as CustomerCallFilter | 'ALL'); setCurrentPage(1); }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Gọi trước HT" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Gọi trước HT: tất cả</SelectItem>
              <SelectItem value="uncalled">Chưa gọi</SelectItem>
              <SelectItem value="claimed">Đã nhận gọi</SelectItem>
              <SelectItem value="called">Đã gọi được</SelectItem>
              <SelectItem value="unreached">Không liên lạc được</SelectItem>
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
          {/* Tìm theo địa chỉ ĐÓN hoặc TRẢ. BE bỏ dấu nên gõ không dấu vẫn ra; tách token
              theo khoảng trắng và mọi token phải khớp CÙNG một điểm (đón hoặc trả). */}
          <div className='relative'>
            <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm địa chỉ đón/trả (không dấu OK)"
              value={addressTerm}
              onChange={(e) => handleAddressChange(e.target.value)}
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
                {/* Trạng thái CSKH đã gọi xác nhận khách TRƯỚC khi chuyến hoàn thành.
                    Chỉ pha "trước" — cột "Gọi sau HT" ở lại /crm-queue (CRM GĐ1).
                    Cột đứng CỐ ĐỊNH ngay sau Trạng thái ở MỌI tab: tab Đã huỷ chèn 3 cột
                    huỷ ngay phía sau, để cột này sau cụm đó thì nó nhảy chỗ mỗi lần admin
                    đổi tab. Ghi nhận cuộc gọi vẫn ở dialog chi tiết — bấm vào dòng. */}
                <TableHead>Gọi trước HT</TableHead>
                {/* CANCELLED tab gets 3 extra columns so admin can read who
                    cancelled and why without opening each detail dialog. Other
                    tabs keep the base 8-column layout. */}
                {isCancelledTab && (
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
                        {/* Hàng NGANG: container ngoài là `flex flex-col`, thả Badge thẳng
                            vào đó thì align-items:stretch kéo badge rộng bằng cả ô. */}
                        <div className="flex items-center gap-1">
                          <span className='font-semibold'>{booking.senderInfo?.name || booking.customer?.fullName || 'N/A'}</span>
                          {booking.isFirstBooking === true && <FirstTripBadge />}
                        </div>
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
                        {/* Ngay sau TEST: hai cờ admin gạt tay đứng liền nhau, đọc một
                            lượt là biết dòng này có gì bất thường. */}
                        {booking.isDuplicateTrip && <DuplicateTripBadge />}
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
                    {/* KHÔNG stopPropagation ở ô này (khác ô "Ghi chú" trước đây): đây là ô
                        chỉ-đọc, và bấm vào là mở dialog chi tiết — đúng chỗ ghi nhận cuộc gọi. */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5 items-start">
                        <CustomerCallBadge status={booking.callBeforeStatus} />
                        {/* formatVnShort chứ KHÔNG format(new Date(...)): mốc admin đọc phải là
                            giờ VN, không phải giờ máy. Ngày rác → null, ô để trống thay vì
                            "Invalid Date". */}
                        {formatVnShort(booking.callBeforeAt) && (
                          <span className="text-[11px] text-muted-foreground">
                            {formatVnShort(booking.callBeforeAt)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {isCancelledTab && (
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
                          <DropdownMenuItem onSelect={() => handleCopyPass(booking)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy pass chuyến
                          </DropdownMenuItem>
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
          onDuplicateFlagChanged={reload}
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
