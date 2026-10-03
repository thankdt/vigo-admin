'use client';

/**
 * Ký hiệu dùng chung của CẢ `BookingsTable` LẪN `BookingDetail`.
 *
 * Tồn tại để CẮT VÒNG IMPORT: nếu để chúng ở `bookings-table.tsx` rồi cho
 * `booking-detail.tsx` import ngược, thì `/crm-queue` (chỉ cần BookingDetail) vẫn kéo
 * nguyên module bảng chuyến — kèm điều tài, tạo chuyến — vào bundle, đúng thứ việc
 * tách file này sinh ra để tránh.
 */
import * as React from 'react';
import { Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Booking } from '@/lib/types';
import { currentAccountIfDiffers } from './account-snapshot';


// Nhãn trạng thái chuyến — getStatusBadge bên dưới lẫn BookingsTable (tab, dialog
// đổi trạng thái) cùng đọc, nên nằm ở file dùng chung.
export const statusLabelMap: Record<string, string> = {
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
  // Tab ẢO (không phải BookingStatus): chuyến đã có tài xế rồi mới bị huỷ. BookingsTable
  // map nó sang status=CANCELLED + cancelledState=afterAccept. Nằm ở đây vì dải tab đọc
  // chung map này; không dòng dữ liệu nào mang status này nên getStatusBadge không đụng tới.
  CANCELLED_AFTER_ACCEPT: 'Huỷ sau khi nhận',
};

export const CANCELLED_BY_ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Khách hàng',
  DRIVER: 'Tài xế',
  ADMIN: 'Admin',
  SYSTEM: 'Hệ thống',
};

export function getStatusBadge(booking: Pick<Booking, 'status' | 'adminClaimedAt'>) {
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
 * Nhãn "chuyến test" — dùng CHUNG cho hàng danh sách (`BookingsTable`) và header dialog
 * chi tiết (`BookingDetail`), để hai nơi không trôi dạt về màu/chữ.
 *
 * Tím đặc: cố ý KHÔNG trùng bảng màu trạng thái (xanh/đỏ/hổ phách) vì đây không phải một
 * trạng thái chuyến, mà là "đừng tin số của chuyến này" — nó đã bị loại khỏi dashboard,
 * tài chính, hoá đơn và đối soát HTX.
 */
export function TestTripBadge() {
  return (
    <Badge className="bg-purple-600 text-white hover:bg-purple-600 text-[10px] px-1.5 py-0">
      🧪 TEST
    </Badge>
  );
}

/**
 * Nhãn "chuyến trùng" — dùng CHUNG cho hàng danh sách (`BookingsTable`) và header dialog
 * chi tiết (`BookingDetail`), để hai nơi không trôi dạt về màu/chữ.
 *
 * Xám đá (slate), cố ý KHÔNG trùng:
 *  - bảng màu trạng thái (xanh/đỏ/hổ phách) — đây không phải một trạng thái chuyến;
 *  - tím của {@link TestTripBadge} — hai cờ có hệ quả HOÀN TOÀN khác nhau và người đọc
 *    bảng phải phân biệt được trong nửa giây. Chuyến TEST = "đừng tin số của chuyến này"
 *    (đã bị loại khỏi mọi báo cáo). Chuyến TRÙNG = "số vẫn tính, chỉ là khỏi gọi lại".
 *
 * Chữ "TRÙNG" chứ không "NHÂN BẢN": menu dòng đã có "Nhân bản chuyến" (tạo chuyến mới từ
 * chuyến cũ) — nghĩa gần như ngược lại.
 */
export function DuplicateTripBadge() {
  return (
    <Badge className="bg-slate-600 text-white hover:bg-slate-600 text-[10px] px-1.5 py-0">
      ⧉ TRÙNG
    </Badge>
  );
}

/**
 * Nhãn "khách lần đầu" — chuyến này là chuyến ĐẦU TIÊN tài khoản khách đó từng đặt
 * (backend tính bằng cờ `isFirstBooking`, đếm mọi chuyến kể cả huỷ).
 *
 * Xanh dương nhạt, viền mảnh: đây là thông tin để CSKH chăm khéo hơn, KHÔNG phải cảnh
 * báo — không được tranh màu với cờ TEST (tím) hay TRÙNG (xám đá), càng không được
 * trông như một trạng thái chuyến.
 *
 * `title` nói "tài khoản khách này" chứ không nói "khách này": chuyến giao hàng hiện
 * tên NGƯỜI GỬI do client nhập, có thể khác chủ tài khoản mà cờ đang nói tới.
 *
 * Chữ "Chuyến đầu" (không phải "Khách lần đầu"): badge đứng cạnh SĐT — chỗ có bề rộng
 * gần như cố định — nên phải ngắn để không đẩy layout khi cột bị bóp.
 */
export function FirstTripBadge() {
  return (
    <Badge
      variant="outline"
      className="shrink-0 whitespace-nowrap border-blue-300 bg-blue-50 text-[10px] px-1.5 py-0 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950/50"
      title="Đây là chuyến đầu tiên tài khoản khách này đặt"
    >
      Chuyến đầu
    </Badge>
  );
}

/**
 * Dòng phụ "TK: tên · SĐT" khi SĐT lưu trên chuyến khác SĐT hiện tại của tài khoản
 * đặt chuyến (xem `currentAccountIfDiffers`). Không khác → không render gì.
 */
export function CurrentAccountLine({ booking, className }: {
  booking: Pick<Booking, 'senderInfo' | 'customer'>;
  className?: string;
}) {
  const account = currentAccountIfDiffers(booking);
  if (!account) return null;
  return (
    <span
      className={className ?? 'text-xs text-muted-foreground'}
      title="SĐT lưu trên chuyến khác SĐT hiện tại của tài khoản đặt chuyến"
    >
      TK: {account.name} · {account.phone}
    </span>
  );
}

/**
 * Mốc thời gian NGẮN `dd/MM HH:mm` cho các ô trong bảng chuyến, LUÔN giờ VN (UTC+7)
 * bất kể múi giờ máy admin — luật bắt buộc của repo.
 *
 * Ghép từ `formatToParts` chứ không `format()`: dữ liệu locale quyết định dấu phân
 * cách (ICU của Node cho `vi-VN` ra `14-08`, trình duyệt ra `14/08`) nên chuỗi sẽ
 * khác nhau giữa máy admin và test. Cùng cách làm với `formatVn` trong
 * driver-commitment-badge.tsx, chỉ khác thứ tự (ngày trước, giờ sau) cho khớp
 * convention của các cột trong bảng.
 *
 * Ngày rác từ API → `null` chứ không "Invalid Date": một dòng dữ liệu hỏng không
 * được phép làm vỡ cả bảng.
 */
export function formatVnShort(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${at('day')}/${at('month')} ${at('hour')}:${at('minute')}`;
}

/**
 * Nhãn "Tài mới" — tài xế đã hoàn thành < 3 chuyến.
 * Xanh dương nhạt, viền mảnh (đồng bộ bảng màu với FirstTripBadge của khách hàng).
 */
export function NewDriverBadge({ completedTrips }: { completedTrips?: number }) {
  const title =
    typeof completedTrips === 'number' && completedTrips > 0
      ? `Tài mới: đã hoàn thành ${completedTrips} chuyến`
      : 'Tài mới: chưa có chuyến hoàn thành nào';
  return (
    <Badge
      variant="outline"
      className="shrink-0 whitespace-nowrap border-blue-300 bg-blue-50 text-[10px] px-1.5 py-0 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950/50"
      title={title}
    >
      Tài mới
    </Badge>
  );
}

/**
 * Nhãn "Hay huỷ" — tài xế có vi phạm Rule A hoặc tỉ lệ huỷ 30 ngày >= 30%.
 * Hổ phách/cam (cảnh báo vận hành).
 */
export function HighCancelBadge() {
  return (
    <Badge
      className="shrink-0 whitespace-nowrap bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-300 text-[10px] px-1.5 py-0"
      title="Tài xế có tỉ lệ huỷ cao (>= 30%) hoặc có vi phạm huỷ ép khách"
    >
      Hay huỷ
    </Badge>
  );
}

/**
 * Nhãn "Hay trễ giờ" — tỉ lệ đúng giờ < 80% từ ít nhất 3 chuyến hẹn giờ đã tới điểm đón.
 * Vàng cam (cảnh báo trễ hẹn).
 */
export function LateDriverBadge() {
  return (
    <Badge
      className="shrink-0 whitespace-nowrap bg-orange-100 text-orange-800 hover:bg-orange-100 dark:bg-orange-900/50 dark:text-orange-300 text-[10px] px-1.5 py-0"
      title="Tỉ lệ đúng giờ dưới 80%"
    >
      Hay trễ giờ
    </Badge>
  );
}

/**
 * Nhãn "Có vi phạm" — tài xế từng bị phạt thu hoa hồng (driver_penalty),
 * bị khoá tài khoản, cờ cọc hoặc đang tạm khoá nhận chuyến.
 * Đỏ đậm (destructive).
 */
export function ViolationBadge() {
  return (
    <Badge
      variant="destructive"
      className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0"
      title="Tài xế từng bị phạt thu hoa hồng hoặc đang bị cảnh cáo/tạm khoá"
    >
      Có vi phạm
    </Badge>
  );
}

/**
 * Hiển thị sao đánh giá của tài xế (nếu có dữ liệu công khai).
 * Điểm < 4.0 tô màu đỏ để cảnh báo nhanh mà không cần thêm tag riêng.
 */
export function DriverRatingDisplay({ stars }: { stars: number }) {
  const isLow = stars < 4.0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums shrink-0 ${
        isLow ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
      }`}
      title={`Đánh giá trung bình: ${stars.toFixed(1)}★`}
    >
      <Star className={`h-3 w-3 ${isLow ? 'fill-red-500 text-red-500' : 'fill-amber-400 text-amber-400'}`} />
      {stars.toFixed(1)}
    </span>
  );
}

/**
 * Cụm badge cảnh báo và số sao của tài xế, hiển thị cạnh SĐT tài xế.
 */
export function DriverAlertBadges({ driver }: { driver?: Booking['driver'] }) {
  if (!driver) return null;
  const hasBadges =
    driver.displayStars != null ||
    driver.isNew === true ||
    driver.isHighCancel === true ||
    driver.isFrequentlyLate === true ||
    driver.hasViolation === true;
  if (!hasBadges) return null;
  return (
    <>
      {driver.displayStars != null && (
        <DriverRatingDisplay stars={driver.displayStars} />
      )}
      {driver.isNew === true && (
        <NewDriverBadge completedTrips={driver.completedTrips} />
      )}
      {driver.isHighCancel === true && <HighCancelBadge />}
      {driver.isFrequentlyLate === true && <LateDriverBadge />}
      {driver.hasViolation === true && <ViolationBadge />}
    </>
  );
}

