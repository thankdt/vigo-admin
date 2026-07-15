'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  listAgentOrders, redispatchAgentOrder, cancelAgentOrder, openAgentContract, AgentOrder,
} from '@/lib/api';
import { PlusCircle, FileText, RefreshCw, XCircle, Loader2 } from 'lucide-react';

const STATUS_META: Record<AgentOrder['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  DRAFT: { label: 'Nháp', variant: 'outline' },
  SEARCHING: { label: 'Đang tìm xe', variant: 'secondary' },
  ACCEPTED: { label: 'Đã nhận', variant: 'default' },
  IN_PROGRESS: { label: 'Đang chạy', variant: 'default' },
  COMPLETED: { label: 'Hoàn thành', variant: 'default' },
  CANCELLED: { label: 'Đã huỷ', variant: 'destructive' },
};

const fmtVnd = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`;

export default function AgentOrdersPage() {
  const { toast } = useToast();
  const [orders, setOrders] = React.useState<AgentOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    listAgentOrders(1, 50)
      .then((r) => setOrders(r.data ?? []))
      .catch((e) => toast({ variant: 'destructive', title: 'Lỗi tải đơn', description: e?.message }))
      .finally(() => setLoading(false));
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  const doRedispatch = async (id: string) => {
    setBusyId(id);
    try {
      const r = await redispatchAgentOrder(id);
      toast({ title: 'Đã phát lại chuyến', description: `Gửi tới ${r.offered} tài xế.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: e?.message });
    } finally { setBusyId(null); }
  };

  const doOpenContract = async (id: string) => {
    try {
      await openAgentContract(id);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Không mở được hợp đồng', description: e?.message });
    }
  };

  const doCancel = async (id: string) => {
    if (!confirm('Huỷ đơn này?')) return;
    setBusyId(id);
    try {
      await cancelAgentOrder(id);
      toast({ title: 'Đã huỷ đơn' });
      load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Không huỷ được', description: e?.message });
    } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Đơn của tôi</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </Button>
          <Button size="sm" asChild>
            <Link href="/agent-portal/orders/new"><PlusCircle className="mr-2 h-4 w-4" /> Đặt hộ mới</Link>
          </Button>
        </div>
      </div>

      {loading && orders.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : orders.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Chưa có đơn nào. <Link href="/agent-portal/orders/new" className="text-primary underline">Tạo đơn đầu tiên</Link>.
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const meta = STATUS_META[o.status];
            const canCancel = o.status === 'DRAFT' || o.status === 'SEARCHING';
            const canRedispatch = o.status === 'SEARCHING';
            return (
              <Card key={o.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <Badge variant="outline">{o.billingMode === 'BAO' ? 'Bao xe' : 'Đi ghép'}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(o.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                      </span>
                    </div>
                    <div className="text-sm">
                      {o.waypoints.length} điểm · {o.passengers.length} khách · cần {o.capacityRequired} chỗ
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Tổng cước: <span className="font-medium text-foreground">{fmtVnd(o.totalFare)}</span>
                      {o.commissionAmount != null && <> · Hoa hồng: <span className="font-medium text-green-600">{fmtVnd(o.commissionAmount)}</span></>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => doOpenContract(o.id)}>
                      <FileText className="mr-2 h-4 w-4" /> Hợp đồng
                    </Button>
                    {canRedispatch && (
                      <Button variant="outline" size="sm" onClick={() => doRedispatch(o.id)} disabled={busyId === o.id}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Phát lại
                      </Button>
                    )}
                    {canCancel && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => doCancel(o.id)} disabled={busyId === o.id}>
                        <XCircle className="mr-2 h-4 w-4" /> Huỷ
                      </Button>
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
