'use client';

import * as React from 'react';
import { Loader2, MessageSquare, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getRecentDriverRatings } from '@/lib/api';
import type { RecentDriverRating } from '@/lib/types';
import {
  driverNameText,
  driverPhoneText,
  formatVnDateTime,
  isLowRating,
  notCountedLabel,
  ratingStarsText,
  ratingStarsValue,
  serviceTypeText,
} from '../reputation-labels';
import type { SelectDriver } from './select-driver';
import { toastApiError } from '@/hooks/use-api-error-toast';

const PAGE_SIZE = 20;

/** Ngưỡng của bộ lọc nhanh "chỉ xem đánh giá thấp". */
const LOW_STARS_MAX = 3;

function StarRow({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
        />
      ))}
    </span>
  );
}

function RatingCard({
  rating,
  onSelectDriver,
}: {
  rating: RecentDriverRating;
  onSelectDriver: SelectDriver;
}) {
  // Nhãn loại trừ: chỉ `isCounted === false` mới gắn (xem notCountedLabel).
  const excluded = notCountedLabel(rating);
  const low = isLowRating(rating.stars);
  const comment = (rating.comment ?? '').trim();
  const service = serviceTypeText(rating.serviceType);

  return (
    <div
      className="cursor-pointer space-y-2 p-4 transition-colors hover:bg-muted/50"
      onClick={() =>
        onSelectDriver({
          id: rating.driverId,
          name: driverNameText(rating.driverName),
          phone: driverPhoneText(rating.driverPhone),
        })
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-semibold tabular-nums ${low ? 'text-red-600' : 'text-foreground'}`}
          >
            {ratingStarsText(rating.stars)}
          </span>
          <StarRow value={ratingStarsValue(rating.stars)} />
          {service && (
            <Badge variant="outline" className="font-normal">
              {service}
            </Badge>
          )}
          {/* Đánh giá không tính vào điểm PHẢI nói rõ, kèm lý do — nếu không
              admin sẽ tưởng điểm tài xế bị kéo xuống bởi phiếu này. */}
          {excluded && (
            <Badge variant="outline" className="border-amber-500 font-normal text-amber-600">
              {excluded}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{formatVnDateTime(rating.createdAt)}</span>
      </div>

      <div className="text-sm">
        <span className="font-medium">{driverNameText(rating.driverName)}</span>
        <span className="text-muted-foreground"> · {driverPhoneText(rating.driverPhone)}</span>
      </div>

      {comment ? (
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{comment}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground/70">Khách không để lại bình luận.</p>
      )}
    </div>
  );
}

/**
 * Tab "Đánh giá gần đây" — feed đánh giá mới nhất toàn hệ thống.
 * Bộ lọc "chỉ xem ≤ 3 sao" là thứ admin cần nhất hằng ngày (ai bị chê, chê gì).
 */
export function RecentRatingsTab({ onSelectDriver }: { onSelectDriver: SelectDriver }) {
  const { toast } = useToast();

  const [lowOnly, setLowOnly] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [items, setItems] = React.useState<RecentDriverRating[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  // Chốt thứ tự: request cũ về muộn không được ghi đè kết quả của bộ lọc mới.
  const reqIdRef = React.useRef(0);

  // Đổi bộ lọc → về trang đầu ngay trong handler (xem ghi chú ở tab xếp hạng):
  // reset bằng effect sẽ bắn thừa một request theo offset cũ.
  const applyLowOnly = (value: boolean) => {
    setLowOnly(value);
    setPage(0);
  };

  React.useEffect(() => {
    const reqId = ++reqIdRef.current;
    let cancelled = false;
    setLoading(true);
    getRecentDriverRatings({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      // null = không lọc. Đừng gửi 0 — 0 không phải "tắt lọc".
      maxStars: lowOnly ? LOW_STARS_MAX : null,
    })
      .then((data) => {
        if (cancelled || reqId !== reqIdRef.current) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err: any) => {
        if (cancelled || reqId !== reqIdRef.current) return;
        setItems([]);
        setTotal(0);
        toastApiError(err, 'Không tải được danh sách đánh giá');
      })
      .finally(() => {
        if (!cancelled && reqId === reqIdRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lowOnly, page, toast]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="low-ratings-only"
            checked={lowOnly}
            onCheckedChange={(checked) => applyLowOnly(checked === true)}
          />
          <Label htmlFor="low-ratings-only" className="cursor-pointer text-sm font-normal">
            Chỉ xem ≤ {LOW_STARS_MAX} sao
          </Label>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-28 flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="mb-2 h-6 w-6 opacity-50" />
            {lowOnly ? `Không có đánh giá nào ≤ ${LOW_STARS_MAX} sao.` : 'Chưa có đánh giá nào.'}
          </div>
        ) : (
          <div className="divide-y">
            {items.map((rating) => (
              <RatingCard key={rating.id} rating={rating} onSelectDriver={onSelectDriver} />
            ))}
          </div>
        )}

        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm text-muted-foreground">
            <span>
              Trang {page + 1}/{totalPages} · {total} đánh giá
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
