'use client';

import * as React from 'react';
import { Star, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getDriverReputation, getDriverRatings } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { DriverReputation, DriverTripRating } from '@/lib/types';
import {
  COLLECTING_LABEL,
  NO_RATING_LABEL,
  formatOpsRate,
  formatDisplayStars,
  formatScore,
  distributionCount,
  distributionPercent,
  distributionTotal,
  type OpsMetricKey,
} from '@/lib/driver-reputation-format';
import { formatVnDateTime } from './driver-detail-dialog';

const RATINGS_PAGE_SIZE = 5;

const OPS_METRICS: Array<{ key: OpsMetricKey; label: string; pick: (r: DriverReputation) => number | null }> = [
  { key: 'accept', label: 'Tỉ lệ nhận chuyến', pick: (r) => r.ops?.acceptRate ?? null },
  { key: 'onTime', label: 'Tỉ lệ đúng giờ', pick: (r) => r.ops?.onTimeRate ?? null },
  { key: 'completion', label: 'Tỉ lệ hoàn thành', pick: (r) => r.ops?.completionRate ?? null },
];

const STAR_LEVELS: Array<5 | 4 | 3 | 2 | 1> = [5, 4, 3, 2, 1];

/** Hàng sao đặc — chỉ trang trí, làm tròn xuống để không "tặng" thêm sao. */
function StarRow({ value }: { value: number }) {
  const filled = Math.floor(value);
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= filled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`}
        />
      ))}
    </span>
  );
}

/** Khung chung (đường kẻ trên + tiêu đề) để trạng thái tải/lỗi/có dữ liệu trông
 *  như nhau và nơi gắn chỉ cần render một dòng. */
function RepBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t pt-4 space-y-3">
      <div>
        <h4 className="font-semibold">Điểm &amp; đánh giá</h4>
        <p className="text-xs text-muted-foreground">
          Chỉ để tham khảo — điểm/sao KHÔNG dùng để chặn hay xếp thứ tự tài xế.
        </p>
      </div>
      {children}
    </div>
  );
}

/** Function key RBAC của 2 endpoint điểm uy tín (backend: @RequireFunction('driver-reputation')
 *  trên DriverReputationAdminController). KHÁC function 'drivers' gác trang này, nên admin
 *  có quyền xem tài xế vẫn có thể KHÔNG có quyền xem điểm → phải tự ẩn khối, nếu không
 *  họ ăn 403 và thấy một vệt lỗi đỏ vô nghĩa. */
const REPUTATION_FUNCTION = 'driver-reputation';

/**
 * Khối "Điểm & đánh giá" trong chi tiết tài xế (tự bọc tiêu đề + đường kẻ trên,
 * tự ẩn khi thiếu quyền — nơi gắn chỉ cần render một dòng).
 *
 * ⚠️ CHỈ HIỂN THỊ. Không dùng điểm/sao để chặn, ẩn hay xếp thứ tự tài xế ở client.
 * ⚠️ Chỉ số `null` (hoặc tên nằm trong `collecting`) hiện "Đang thu thập", KHÔNG hiện 0% —
 *    acceptRate/onTimeRate không backfill được nên những tuần đầu chắc chắn rỗng.
 *    Mọi quy tắc đó nằm trong src/lib/driver-reputation-format.ts (có test riêng).
 */
export function DriverReputationSection({ driverId }: { driverId: string }) {
  const { can } = useAuth();
  const allowed = can(REPUTATION_FUNCTION);
  const [rep, setRep] = React.useState<DriverReputation | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [ratings, setRatings] = React.useState<DriverTripRating[]>([]);
  const [total, setTotal] = React.useState(0);
  const [offset, setOffset] = React.useState(0);
  const [ratingsLoading, setRatingsLoading] = React.useState(true);
  const [ratingsError, setRatingsError] = React.useState<string | null>(null);

  // Đổi tài xế → về trang đầu, tránh giữ offset của tài trước.
  React.useEffect(() => {
    setOffset(0);
  }, [driverId]);

  React.useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDriverReputation(driverId)
      .then((d) => { if (!cancelled) setRep(d ?? null); })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? 'Không tải được điểm đánh giá.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [driverId, allowed]);

  React.useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setRatingsLoading(true);
    setRatingsError(null);
    getDriverRatings(driverId, { limit: RATINGS_PAGE_SIZE, offset })
      .then((d) => {
        if (cancelled) return;
        setRatings(d?.items ?? []);
        setTotal(d?.total ?? 0);
      })
      .catch((e: any) => { if (!cancelled) setRatingsError(e?.message ?? 'Không tải được danh sách đánh giá.'); })
      .finally(() => { if (!cancelled) setRatingsLoading(false); });
    return () => { cancelled = true; };
  }, [driverId, offset, allowed]);

  // Thiếu quyền (hoặc chưa load xong `me` → can() trả false) ⇒ ẩn hẳn, fail-closed
  // giống isMenuVisible. Backend vẫn là chốt an ninh thật.
  if (!allowed) return null;

  if (loading) {
    return <RepBlock><p className="text-sm text-muted-foreground italic">Đang tải điểm đánh giá…</p></RepBlock>;
  }
  if (error) {
    return <RepBlock><p className="text-sm text-red-600">{error}</p></RepBlock>;
  }
  if (!rep) {
    return <RepBlock><p className="text-sm text-muted-foreground italic">Chưa có dữ liệu điểm đánh giá.</p></RepBlock>;
  }

  const starsText = formatDisplayStars(rep.displayStars, rep.collecting);
  // Gate THẲNG trên null thay vì so chuỗi nhãn: `hasStars` cũ suy ra từ
  // `starsText !== NO_RATING_LABEL`, nên đổi nhãn một cái là `displayStars`
  // null vẫn lọt vào nhánh vẽ sao và hiện 0 sao — đúng thứ luật cấm.
  // Kiểm null trực tiếp còn giúp TS thu hẹp kiểu, bỏ được `?? 0`.
  const stars = rep.displayStars;
  const hasStars = stars !== null && stars !== undefined;
  const distTotal = distributionTotal(rep.distribution);
  const canPrev = offset > 0;
  const canNext = offset + RATINGS_PAGE_SIZE < total;

  return (
    <RepBlock>
    <div className="space-y-4">
      {/* Điểm tổng + sao công khai */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Điểm tổng</Label>
          <p className="text-2xl font-bold leading-none">
            {formatScore(rep.score)}
            <span className="text-sm font-normal text-muted-foreground">/100</span>
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Sao công khai</Label>
          {hasStars ? (
            <p className="flex items-center gap-2 text-2xl font-bold leading-none">
              {starsText}
              <StarRow value={stars} />
            </p>
          ) : (
            // LUẬT 2: chưa đủ đánh giá thì KHÔNG hiện 0 sao / "0.0".
            <p className="text-sm font-medium text-muted-foreground italic leading-none py-1.5">
              {NO_RATING_LABEL}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Số đánh giá</Label>
          <p className="text-2xl font-bold leading-none">{rep.ratingCount ?? 0}</p>
        </div>
      </div>

      {!rep.hasEnoughRatings && (
        <p className="text-xs text-muted-foreground italic">
          Chưa đủ số đánh giá để công khai sao cho khách. Điểm vẫn được tính nội bộ.
        </p>
      )}

      {/* Phân bố sao 1–5 */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Phân bố sao</Label>
        {distTotal === 0 ? (
          <p className="text-sm text-muted-foreground italic">Chưa có đánh giá nào.</p>
        ) : (
          <div className="space-y-1">
            {STAR_LEVELS.map((star) => {
              const count = distributionCount(rep.distribution, star);
              const pct = distributionPercent(rep.distribution, star);
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-xs text-muted-foreground tabular-nums">{star}★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3 chỉ số vận hành — null ⇒ "Đang thu thập", KHÔNG phải 0% */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {OPS_METRICS.map(({ key, label, pick }) => {
          const text = formatOpsRate(pick(rep), key, rep.collecting);
          const collecting = text === COLLECTING_LABEL;
          return (
            <div key={key} className="space-y-1 rounded-md border p-2">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <p
                className={
                  collecting
                    ? 'text-sm font-medium text-muted-foreground italic'
                    : 'text-lg font-semibold leading-none'
                }
              >
                {text}
              </p>
            </div>
          );
        })}
      </div>

      {/* Đánh giá gần đây */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Đánh giá gần đây</Label>
        {ratingsLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground italic">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải đánh giá…
          </p>
        ) : ratingsError ? (
          <p className="text-sm text-red-600">{ratingsError}</p>
        ) : ratings.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Chưa có đánh giá nào.</p>
        ) : (
          <ul className="space-y-2">
            {ratings.map((r) => (
              <li key={r.id} className="rounded-md border p-2 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StarRow value={r.stars} />
                  <span className="text-sm font-semibold tabular-nums">{r.stars}★</span>
                  <span className="text-xs text-muted-foreground">
                    {formatVnDateTime(r.tripCompletedAt || r.createdAt)}
                  </span>
                  {!r.isCounted && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      Không tính điểm{r.excludeReason ? ` · ${r.excludeReason}` : ''}
                    </Badge>
                  )}
                </div>
                {r.comment && <p className="text-sm text-foreground/90">{r.comment}</p>}
                {r.tags && r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs font-normal">{t}</Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {total > RATINGS_PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.min(offset + 1, total)}&ndash;{Math.min(offset + RATINGS_PAGE_SIZE, total)} / {total}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canPrev || ratingsLoading}
                onClick={() => setOffset((o) => Math.max(0, o - RATINGS_PAGE_SIZE))}
              >
                Trước
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canNext || ratingsLoading}
                onClick={() => setOffset((o) => o + RATINGS_PAGE_SIZE)}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
    </RepBlock>
  );
}
