'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { useAuth } from '@/lib/auth-context';
import { getAdminLoyalty, type AdminLoyalty } from '@/lib/api';
import { formatVnDateTime } from '../../../leakage-review/leakage-labels';
import {
  tierLabel,
  loyaltyHistoryTypeLabel,
  pointKindLabel,
  voucherStateLabel,
  voucherStateVariant,
  bookingStatusLabel,
} from '../loyalty-labels';
import { VcoinAdjustDialog } from './vcoin-adjust-dialog';

/**
 * Khối "Vcoin & hạng" trên hồ sơ khách (spec 2026-09-21 §3.5): thẻ tóm tắt (số dư Vcoin,
 * hạng, điểm hạng, Vcoin sắp hết hạn) + bảng lịch sử Vcoin/điểm hạng (phân trang) + bảng
 * voucher đã đổi. Nút "Cộng/Trừ Vcoin" chỉ hiện khi admin có quyền RIÊNG `loyalty-adjust`
 * (tách khỏi `users` vì đây là thao tác cấp/trừ tiền thật — Vcoin đổi được voucher).
 *
 * CHỈ dùng cho role USER — nơi gọi (page.tsx) đã gate theo role, component này không
 * tự gate lại vì driver/HTX không có hồ sơ loyalty.
 */
export function CustomerLoyaltyCard({ userId, userName }: { userId: string; userName: string }) {
  const { can } = useAuth();
  const canAdjust = can('loyalty-adjust');

  const [data, setData] = React.useState<AdminLoyalty | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [historyPage, setHistoryPage] = React.useState(1);
  const [dialogOpenFor, setDialogOpenFor] = React.useState<string | null>(null);

  const fetchLoyalty = React.useCallback(
    async (page: number) => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await getAdminLoyalty(userId, page);
        setData(res);
      } catch (e) {
        setFailed(true);
        toastApiError(e, 'Không tải được Vcoin & hạng');
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  React.useEffect(() => {
    void fetchLoyalty(historyPage);
  }, [fetchLoyalty, historyPage]);

  const totalPages = data ? Math.max(1, Math.ceil(data.history.total / data.history.limit)) : 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle className="text-base">Vcoin &amp; hạng</CardTitle>
        {canAdjust && (
          <Button size="sm" onClick={() => setDialogOpenFor(userId)} disabled={loading || !data}>
            Cộng/Trừ Vcoin
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {loading && !data ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : failed && !data ? (
          <p className="text-destructive">Không tải được dữ liệu Vcoin &amp; hạng.</p>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat label="Hạng" value={<Badge variant="outline">{tierLabel(data.tier)}</Badge>} />
              <SummaryStat label="Vcoin" value={data.rewardPoints.toLocaleString('vi-VN')} />
              <SummaryStat label="Điểm hạng" value={data.tierPoints.toLocaleString('vi-VN')} />
              <SummaryStat
                label="Vcoin sắp hết hạn (30 ngày tới)"
                value={
                  data.expiringSoon.points > 0
                    ? `${data.expiringSoon.points.toLocaleString('vi-VN')} — gần nhất ${formatVnDateTime(data.expiringSoon.nextExpiresAt)}`
                    : 'Không có'
                }
              />
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Lịch sử Vcoin &amp; điểm hạng
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead>Vcoin/Điểm</TableHead>
                      <TableHead className="text-right">Số lượng</TableHead>
                      <TableHead>Lý do</TableHead>
                      <TableHead>Người thực hiện</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.history.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-20 text-center text-sm text-muted-foreground">
                          Chưa có lịch sử.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.history.items.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell className="text-xs">{formatVnDateTime(h.createdAt)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{loyaltyHistoryTypeLabel(h.type)}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{pointKindLabel(h.pointKind)}</TableCell>
                          <TableCell className={`text-right font-medium ${h.points < 0 ? 'text-destructive' : ''}`}>
                            {h.points > 0 ? '+' : ''}
                            {h.points.toLocaleString('vi-VN')}
                          </TableCell>
                          <TableCell className="max-w-[240px] text-xs">
                            <span className="line-clamp-2">{h.reason || '—'}</span>
                          </TableCell>
                          <TableCell className="text-xs">{h.createdByName ?? '—'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    Trang {data.history.page} / {totalPages} ({data.history.total.toLocaleString('vi-VN')} dòng)
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="outline" onClick={() => setHistoryPage(1)} disabled={historyPage === 1}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={historyPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                      disabled={historyPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setHistoryPage(totalPages)}
                      disabled={historyPage === totalPages}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Voucher đã đổi ({data.vouchers.length.toLocaleString('vi-VN')})
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã</TableHead>
                      <TableHead className="text-right">Giá Vcoin</TableHead>
                      <TableHead>Ngày đổi</TableHead>
                      <TableHead>Hạn dùng</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Chuyến đang gắn</TableHead>
                      <TableHead>Lịch sử dùng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.vouchers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-20 text-center text-sm text-muted-foreground">
                          Chưa đổi voucher nào.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.vouchers.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="font-mono text-xs">{v.code}</TableCell>
                          <TableCell className="text-right">{v.pointCost.toLocaleString('vi-VN')}</TableCell>
                          <TableCell className="text-xs">{formatVnDateTime(v.redeemedAt)}</TableCell>
                          <TableCell className="text-xs">{formatVnDateTime(v.endDate)}</TableCell>
                          <TableCell>
                            <Badge variant={voucherStateVariant(v.state)}>{voucherStateLabel(v.state)}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {v.bookingId ? (
                              // Repo hiện chưa có trang/route chi tiết chuyến để link tới (bảng
                              // "Chuyến đi đã đặt" ở trên mở chi tiết bằng dialog trong bookings-table,
                              // KHÔNG có URL riêng theo id) — hiện mã chuyến rút gọn + trạng thái.
                              <>
                                <span className="font-mono">{v.bookingId.slice(0, 8)}</span>
                                {' · '}
                                {bookingStatusLabel(v.bookingStatus)}
                              </>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {v.usages.length === 0 ? (
                              '—'
                            ) : (
                              <div className="space-y-0.5">
                                {v.usages.map((u, idx) => (
                                  <div key={`${u.bookingId}-${idx}`}>
                                    <span className="font-mono">{u.bookingId.slice(0, 8)}</span> ·{' '}
                                    {formatVnDateTime(u.createdAt)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
        {loading && data && (
          <div className="flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </CardContent>

      <VcoinAdjustDialog
        userId={dialogOpenFor}
        userName={userName}
        currentRewardPoints={data?.rewardPoints ?? 0}
        onClose={() => setDialogOpenFor(null)}
        onAdjusted={() => void fetchLoyalty(historyPage)}
      />
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
