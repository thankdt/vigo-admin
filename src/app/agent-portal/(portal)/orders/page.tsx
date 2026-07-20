'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { listAgentBookings, cancelAgentBooking, AgentBooking } from '@/lib/api';
import { RefreshCw, Loader2, MapPin, XCircle } from 'lucide-react';

// Booking statuses (chuyến thường). Unknown → shown as-is (outline).
const STATUS_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'Chờ xử lý', variant: 'outline' },
  CREATED: { label: 'Đã tạo', variant: 'outline' },
  SEARCHING: { label: 'Đang tìm xe', variant: 'secondary' },
  SCHEDULED: { label: 'Đã hẹn giờ', variant: 'secondary' },
  ACCEPTED: { label: 'Đã nhận', variant: 'default' },
  ARRIVED: { label: 'Tài xế đã đến', variant: 'default' },
  PICKED_UP: { label: 'Đã đón khách', variant: 'default' },
  IN_PROGRESS: { label: 'Đang chạy', variant: 'default' },
  COMPLETED: { label: 'Hoàn thành', variant: 'default' },
  CANCELLED: { label: 'Đã huỷ', variant: 'destructive' },
};
const statusMeta = (s: string) => STATUS_META[s] ?? { label: s, variant: 'outline' as const };

// Có thể huỷ khi chưa hoàn thành / chưa đón khách. Backend là nguồn quyết định cuối (phí huỷ, chính sách).
const CANCELLABLE = new Set([
  'CREATED', 'SEARCHING', 'PENDING', 'PENDING_MATCHING', 'PENDING_CONFIRMATION',
  'AWAITING_CLAIM', 'PROCESSING', 'SCHEDULED', 'DELAYED_WAITING', 'ACCEPTED', 'ARRIVED',
]);

const fmtVnd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`);
const addr = (a: { address?: string } | null | undefined) => a?.address ?? '—';

export default function AgentOrdersPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = React.useState<AgentBooking[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  // Two-step inline confirm — window.confirm() is a no-op inside the in-app webview.
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    listAgentBookings(1, 50)
      .then((r) => setBookings(r.data ?? []))
      .catch((e) => toast({ variant: 'destructive', title: 'Lỗi tải đơn', description: e?.message }))
      .finally(() => setLoading(false));
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  const doCancel = async (id: string) => {
    setBusyId(id);
    try {
      await cancelAgentBooking(id);
      toast({ title: 'Đã huỷ đơn' });
      setConfirmId(null);
      load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Không huỷ được', description: e?.message });
    } finally {
      setBusyId(null);
    }
  };

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
                  <div className="text-right shrink-0 space-y-1">
                    <div className="text-sm font-semibold">{fmtVnd(b.finalPrice)}</div>
                    {b.agentCommissionAmount != null && (
                      <div className="text-xs font-medium text-green-600 dark:text-green-400">
                        HH: {fmtVnd(b.agentCommissionAmount)}
                      </div>
                    )}
                    {CANCELLABLE.has(b.status) && (
                      confirmId === b.id ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => doCancel(b.id)}
                            disabled={busyId === b.id}
                          >
                            {busyId === b.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                            Xác nhận huỷ
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => setConfirmId(null)}
                            disabled={busyId === b.id}
                          >
                            Không
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive h-7 px-2"
                          onClick={() => setConfirmId(b.id)}
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" /> Huỷ
                        </Button>
                      )
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
