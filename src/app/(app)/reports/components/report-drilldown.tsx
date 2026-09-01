'use client';

import * as React from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getReportRows, type ReportRow, type ReportSpec } from '@/lib/api';
import { statusLabelMap, CANCELLED_BY_ROLE_LABEL } from '../../bookings/components/booking-shared';
import { formatVnDate } from '@/lib/format-vn';

const PAGE_SIZE = 100;

export function ReportDrilldown({
  spec,
  dims,
  expectedTotal,
  onClose,
}: {
  spec: ReportSpec;
  dims: Record<string, string>;
  /** Chuyến tạo của đúng dòng vừa bấm (measure `created` của bảng) — hiện cạnh tiêu
   *  đề để người dùng tự đối chiếu với tổng số dòng đang xem qua các trang. */
  expectedTotal?: number | null;
  onClose: () => void;
}) {
  const [rows, setRows] = React.useState<ReportRow[] | null>(null);
  const [page, setPage] = React.useState(1);

  // Bộ lọc của ô = bộ lọc hiện có CỘNG giá trị từng chiều của dòng vừa bấm.
  const drillSpec: ReportSpec = React.useMemo(
    () => ({
      ...spec,
      filters: {
        ...spec.filters,
        ...Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, [v]])),
      },
    }),
    [spec, dims],
  );

  React.useEffect(() => {
    let cancelled = false;
    setRows(null);
    getReportRows(drillSpec, page, PAGE_SIZE)
      .then((r) => { if (!cancelled) setRows(r.rows); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [drillSpec, page]);

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            Chuyến trong ô: {Object.entries(dims).map(([, v]) => v).join(' · ')}
            {expectedTotal != null ? (
              <span className="ml-2 font-normal text-muted-foreground">
                — Tổng theo bảng: {expectedTotal.toLocaleString('vi-VN')} chuyến
              </span>
            ) : null}
          </p>
          {/* In kỳ của ẢNH CHỤP (`spec` truyền vào — chụp lúc bấm, xem page.tsx) chứ
              không phải kỳ đang chọn trên bộ lọc phía trên. Nếu người dùng đổi kỳ trong
              lúc drill-down này còn mở, bảng phía trên có thể đã nhảy sang số của kỳ
              mới trong khi ô này vẫn đúng cho kỳ cũ — dòng này giải thích vì sao hai
              con số không khớp, thay vì để người dùng tự đoán hoặc nghi ngờ có bug. */}
          <p className="text-xs text-muted-foreground">
            Kỳ: {formatVnDate(spec.from)} – {formatVnDate(spec.to)}
          </p>
        </div>
        <Button size="sm" variant="ghost" aria-label="Đóng" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      {rows === null ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Mã chuyến</th>
                  <th className="px-2 py-1 text-left font-medium">Tạo lúc</th>
                  <th className="px-2 py-1 text-left font-medium">Trạng thái</th>
                  <th className="px-2 py-1 text-right font-medium">Giá</th>
                  <th className="px-2 py-1 text-left font-medium">Người huỷ</th>
                  <th className="px-2 py-1 text-left font-medium">Lý do huỷ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1">
                      {/* Không phải link: /bookings không đọc bất kỳ query param nào để
                          mở đúng một chuyến — trỏ tới đó sẽ là link chết. Hiện mã đầy đủ
                          qua title để admin tự sao chép/tìm bằng ô "Mã chuyến". */}
                      <span className="font-mono" title={r.id}>{r.id.slice(0, 8)}</span>
                    </td>
                    <td className="px-2 py-1">
                      {new Date(r.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </td>
                    <td className="px-2 py-1">{statusLabelMap[r.status] ?? r.status}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {r.price != null ? r.price.toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className="px-2 py-1">
                      {r.cancelledByRole ? (CANCELLED_BY_ROLE_LABEL[r.cancelledByRole] ?? r.cancelledByRole) : '—'}
                    </td>
                    <td className="px-2 py-1">{r.cancelReason ?? '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">Không có chuyến nào.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Trang trước</Button>
            <span className="text-sm text-muted-foreground">Trang {page}</span>
            <Button size="sm" variant="outline" disabled={rows.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Trang sau</Button>
          </div>
        </>
      )}
    </div>
  );
}
