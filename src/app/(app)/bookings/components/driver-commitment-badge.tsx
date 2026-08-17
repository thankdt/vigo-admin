'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { Driver } from '@/lib/types';

/**
 * Nhãn "tài đang giữ chuyến gì" cho màn gán chuyến của admin.
 *
 * Từ 14/08/2026 backend KHÔNG còn ẩn tài chỉ vì họ đang giữ một cam kết — chỉ ẩn
 * khi cam kết đó CHỒNG GIỜ với chuyến đang tạo (trước đó tài nhận một chuyến bao
 * xe hẹn giờ là biến mất khỏi danh sách suốt tới lúc chạy xong). Đổi lại, danh
 * sách giờ có cả tài đang bận ở khung giờ khác, nên phải nói rõ ra cho admin.
 *
 * Chữ trên nhãn CỐ Ý không khẳng định "không đụng chuyến đang tạo": cờ
 * `overlapsCandidate` chỉ là kết quả một phép ƯỚC LƯỢNG thời lượng chuyến, nó có
 * thể sai. Nhãn nêu SỰ KIỆN (giữ chuyến gì, mấy giờ, trạng thái nào) để admin tự
 * đọc, và chỉ dùng màu để gợi ý mức đáng lo.
 */

const SERVICE_LABEL: Record<string, string> = {
  RIDE: 'bao xe',
  CARPOOL: 'ghép',
  DELIVERY: 'giao hàng',
};

const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: 'đã nhận',
  ARRIVED: 'đã tới điểm đón',
  PICKED_UP: 'đang chở',
  DELAYED_WAITING: 'đang chờ khách',
};

/** Tài ĐÃ lên đường — đáng lo bất kể cờ chồng giờ nói gì. */
const IN_PROGRESS = new Set(['ARRIVED', 'PICKED_UP', 'DELAYED_WAITING']);

/**
 * Giờ VN (UTC+7), pin tường minh chứ không mượn giờ máy admin — luật bắt buộc của
 * repo. Ngày hợp lệ mới format: chuỗi rác từ API không được phép làm vỡ cả bảng.
 */
function formatVn(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Ghép từ `formatToParts` chứ không dùng thẳng `format()`: dữ liệu locale quyết
  // định dấu phân cách (ICU của Node cho `vi-VN` ra `14-08`, trình duyệt ra
  // `14/08`) nên chuỗi sẽ khác nhau giữa máy admin và test. Ghép tay thì cố định
  // `HH:mm dd/MM` — đúng convention đang dùng ở bảng chuyến.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${at('hour')}:${at('minute')} ${at('day')}/${at('month')}`;
}

/** Mốc dùng để xếp thứ tự + hiển thị. Không có mốc → đẩy xuống cuối. */
function whenOf(c: NonNullable<Driver['activeCommitments']>[number]): number {
  const raw = c.confirmedPickupTime ?? c.scheduledFrom;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

export function DriverCommitmentBadge({
  commitments,
}: {
  commitments?: Driver['activeCommitments'];
}) {
  if (!commitments || commitments.length === 0) return null;

  // Ưu tiên: đang trên đường → chồng giờ → SỚM NHẤT. Không có nấc cuối thì khi mọi
  // cam kết đều "không chồng" (đúng cái nhánh mới sinh ra) thứ tự rơi về thứ tự DB
  // trả — query không có ORDER BY — nên cam kết sát giờ nhất có thể bị giấu sau "+1".
  const sorted = [...commitments].sort((a, b) => {
    const rank = (c: typeof a) =>
      (IN_PROGRESS.has(String(c.status)) ? 0 : 2) + (c.overlapsCandidate ? 0 : 1);
    return rank(a) - rank(b) || whenOf(a) - whenOf(b);
  });
  const top = sorted[0];
  const alarming = IN_PROGRESS.has(String(top.status)) || !!top.overlapsCandidate;

  const label = [
    'đang giữ',
    SERVICE_LABEL[String(top.serviceType)] ?? 'chuyến',
    formatVn(top.confirmedPickupTime ?? top.scheduledFrom),
    STATUS_LABEL[String(top.status)] ? `· ${STATUS_LABEL[String(top.status)]}` : null,
    sorted.length > 1 ? `+${sorted.length - 1}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Badge
      variant={alarming ? 'destructive' : 'outline'}
      className="text-xs whitespace-nowrap"
      title={
        alarming
          ? 'Tài xế đang bận ở khoảng thời gian này — gán tiếp là double-book'
          : 'Cam kết ở khoảng thời gian khác theo ước tính. Kiểm lại giờ trước khi gán.'
      }
    >
      {label}
    </Badge>
  );
}
