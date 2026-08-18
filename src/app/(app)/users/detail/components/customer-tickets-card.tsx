'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { getCrmTickets, type CrmTicket } from '@/lib/api';
import { formatVnDateTime } from '../../../leakage-review/leakage-labels';
import { TICKET_STATUS_LABEL, slaStateOf } from '../../../crm-tickets/ticket-labels';

/**
 * Khối "Ticket khiếu nại" trên hồ sơ khách 360 (spec §6.3 gán cho GĐ3).
 *
 * Chỉ ĐỌC: mọi thao tác nằm ở `/crm-tickets`. Dựng thêm một bản xử lý thứ hai ở đây là
 * nhân đôi UI — đúng rủi ro #7 của spec.
 */
export function CustomerTicketsCard({ userId }: { userId: string }) {
  const [rows, setRows] = React.useState<CrmTicket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await getCrmTickets({ customerUserId: userId, limit: 20 });
        if (cancelled) return;
        setRows(res.data);
        setNow(Date.now());
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toastApiError(e, 'Không tải được danh sách ticket');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Ticket khiếu nại</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {loading ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : failed ? (
          <p className="text-destructive">Không tải được danh sách ticket.</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">Khách chưa có khiếu nại nào.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((t) => {
              // Suy từ CHÍNH DÒNG (§13.2).
              const sla = slaStateOf(t, now);
              return (
                <li key={t.id} data-testid="crm-customer-ticket" className="rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{t.code}</span>
                    <span className="font-medium">{t.title}</span>
                    <Badge variant="secondary">{TICKET_STATUS_LABEL[t.status]}</Badge>
                    {sla.overdue ? (
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">{sla.text}</Badge>
                    ) : null}
                    {Number(t.compensationAmount) > 0 ? (
                      <Badge>Đã đền {Number(t.compensationAmount).toLocaleString('vi-VN')}đ</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatVnDateTime(t.createdAt)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
