'use client';

import * as React from 'react';
import { Bell, Car, CheckCircle2, PhoneCall, PhoneOff, Star, StickyNote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { getCrmCustomerTimeline, type CrmTimelineItem } from '@/lib/api';
import { formatVnDateTime } from '../../../leakage-review/leakage-labels';
import { metaForItem } from '../crm-timeline-meta';

/** Icon theo kind — chỉ phần TRÌNH BÀY nên để cạnh component (mẫu CALL_TYPE_VISUAL). */
function iconFor(item: CrmTimelineItem) {
  switch (item.kind) {
    case 'CALL':
      return item.meta?.status === 'UNREACHED' ? PhoneOff : PhoneCall;
    case 'TRIP_CREATED':
      return Car;
    case 'TRIP_COMPLETED':
      return CheckCircle2;
    case 'RATING':
      return Star;
    case 'NOTIFICATION':
      return Bell;
    default:
      return StickyNote;
  }
}

const BASE_SOURCES = 'CALL,TRIP_CREATED,TRIP_COMPLETED,RATING,NOTE';

/**
 * Timeline hợp nhất của một khách (CRM GĐ2, spec §5.3).
 *
 * Phân trang bằng nút "Xem thêm" + cursor của backend (KHÔNG cuộn vô hạn): timeline là tập
 * append liên tục, OFFSET sẽ lặp/nhảy dòng khi có sự kiện mới chèn vào lúc CSKH đang cuộn.
 *
 * Công tắc "Hiện cả thông báo tự động" mặc định TẮT: `sendPushToUser` ghi một dòng
 * notification ở ~36 call site nên một khách 5 chuyến có ~15–20 dòng push, đủ nhấn chìm
 * 3–5 mốc CSKH thật — và kết luận rút ra sẽ là "timeline vô dụng" chứ không phải "lọc sai".
 */
export function CustomerTimelineCard({ userId }: { userId: string }) {
  const [items, setItems] = React.useState<CrmTimelineItem[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [withNotifications, setWithNotifications] = React.useState(false);

  const sources = withNotifications ? `${BASE_SOURCES},NOTIFICATION` : BASE_SOURCES;

  // Nạp lại TỪ ĐẦU mỗi khi đổi khách hoặc đổi tập nguồn. Giữ cursor cũ khi đổi nguồn là
  // trộn hai tập khác nhau.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await getCrmCustomerTimeline(userId, { sources });
        if (cancelled) return;
        setItems(res.data);
        setCursor(res.nextCursor);
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toastApiError(e, 'Không tải được lịch sử tương tác');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, sources]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await getCrmCustomerTimeline(userId, { sources, cursor });
      // NỐI vào danh sách, không thay thế.
      setItems((prev) => [...prev, ...res.data]);
      setCursor(res.nextCursor);
    } catch (e) {
      toastApiError(e, 'Không tải thêm được');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Lịch sử tương tác</CardTitle>
        <div className="flex items-center gap-2">
          <Switch
            id="crm-timeline-notifications"
            checked={withNotifications}
            onCheckedChange={setWithNotifications}
          />
          <Label htmlFor="crm-timeline-notifications" className="cursor-pointer text-xs font-normal">
            Hiện cả thông báo tự động
          </Label>
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        {loading ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : failed ? (
          <p className="text-destructive">Không tải được lịch sử tương tác.</p>
        ) : items.length === 0 ? (
          // Rỗng ≠ lỗi: hai chữ khác nhau, nếu không admin không biết nên chờ hay nên báo.
          <p className="text-muted-foreground">Chưa có hoạt động nào.</p>
        ) : (
          <>
            <ol className="relative space-y-3 border-l-2 border-muted pl-4">
              {items.map((item, i) => {
                // 🚨 Render theo `item.kind` của CHÍNH DÒNG, KHÔNG theo công tắc/bộ lọc đang
                // chọn — đó đúng là bẫy §13.2 đã gây lỗi CHẶN ở GĐ1.
                const { label } = metaForItem(item);
                const Icon = iconFor(item);
                return (
                  <li
                    // Một `booking` sinh HAI mốc mang CÙNG id, nên key phải kèm kind (và
                    // index, phòng khi cùng kind trùng id qua các trang).
                    key={`${item.kind}:${item.id}:${i}`}
                    data-testid="crm-timeline-item"
                    className="relative"
                  >
                    <span className="absolute -left-[1.4rem] top-0.5 rounded-full bg-background p-0.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatVnDateTime(item.occurredAt)}
                      </span>
                      {item.byAdminName ? (
                        <span className="text-xs text-muted-foreground">· {item.byAdminName}</span>
                      ) : null}
                    </div>
                    {item.detail ? (
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                        {item.detail}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {cursor ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={loadingMore}
                onClick={loadMore}
              >
                Xem thêm
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
