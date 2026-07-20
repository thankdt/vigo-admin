'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { listAgentBookings, AgentBooking } from '@/lib/api';
import { RefreshCw, Loader2, MapPin } from 'lucide-react';

// Booking statuses (chuyến thường). Unknown → shown as-is (outline).
const STATUS_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'Chờ xử lý', variant: 'outline' },
  SEARCHING: { label: 'Đang tìm xe', variant: 'secondary' },
  SCHEDULED: { label: 'Đã hẹn giờ', variant: 'secondary' },
  ACCEPTED: { label: 'Đã nhận', variant: 'default' },
  DRIVER_ARRIVED: { label: 'Tài xế đã đến', variant: 'default' },
  IN_PROGRESS: { label: 'Đang chạy', variant: 'default' },
  COMPLETED: { label: 'Hoàn thành', variant: 'default' },
  CANCELLED: { label: 'Đã huỷ', variant: 'destructive' },
};
const statusMeta = (s: string) => STATUS_META[s] ?? { label: s, variant: 'outline' as const };

const fmtVnd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`);
const addr = (a: { address?: string } | null | undefined) => a?.address ?? '—';

export default function AgentOrdersPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = React.useState<AgentBooking[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    listAgentBookings(1, 50)
      .then((r) => setBookings(r.data ?? []))
      .catch((e) => toast({ variant: 'destructive', title: 'Lỗi tải đơn', description: e?.message }))
      .finally(() => setLoading(false));
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Đơn của tôi</h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
        </Button>
      </div>

      {loading && bookings.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : bookings.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Chưa có đơn đặt hộ nào. Về{' '}
          <Link href="/agent-portal/dashboard" className="text-primary underline">Tổng quan</Link>{' '}
          để đặt hộ chuyến đầu tiên.
        </Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const meta = statusMeta(b.status);
            return (
              <Card key={b.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(b.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                      </span>
                    </div>
                    <div className="text-sm flex items-start gap-1.5">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="break-words">{addr(b.pickupAddress)} → {addr(b.dropoffAddress)}</span>
                    </div>
                    {(b.customerName || b.customerPhone) && (
                      <div className="text-xs text-muted-foreground">
                        Khách: {b.customerName ?? '—'}{b.customerPhone ? ` · ${b.customerPhone}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">{fmtVnd(b.finalPrice)}</div>
                    {b.agentCommissionAmount != null && (
                      <div className="text-xs font-medium text-green-600 dark:text-green-400">
                        HH: {fmtVnd(b.agentCommissionAmount)}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
