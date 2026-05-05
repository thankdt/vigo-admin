'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Car } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { htxListDrivers, htxToggleDriverActive, type HtxDriverRow } from '@/lib/api';

const statusBadge = (status: string) => {
  switch (status) {
    case 'ONLINE':
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">Sẵn sàng</Badge>;
    case 'BUSY':
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400">Đang chở khách</Badge>;
    case 'OFFLINE':
    default:
      return <Badge variant="secondary">Ngoại tuyến</Badge>;
  }
};

export default function HtxDriversPage() {
  const { toast } = useToast();
  const [drivers, setDrivers] = React.useState<HtxDriverRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  // Track which driver row is mid-flight so the switch disables only itself, not the whole table.
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await htxListDrivers();
      setDrivers(list);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được danh sách tài xế', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (driver: HtxDriverRow) => {
    setPendingId(driver.id);
    // Optimistic update — UI flips instantly, revert on failure.
    setDrivers((prev) =>
      prev.map((d) => (d.id === driver.id ? { ...d, isActive: !d.isActive } : d)),
    );
    try {
      const result = await htxToggleDriverActive(driver.id);
      // Reconcile with server truth (in case the request lost a race).
      setDrivers((prev) => prev.map((d) => (d.id === driver.id ? { ...d, isActive: result.isActive } : d)));
      toast({
        title: result.isActive ? 'Đã kích hoạt' : 'Đã tạm dừng',
        description: `${driver.fullName ?? driver.phone ?? 'Tài xế'} ${result.isActive ? 'sẽ tiếp tục nhận chuyến.' : 'sẽ không nhận thêm chuyến mới.'}`,
      });
    } catch (err: any) {
      // Rollback the optimistic flip.
      setDrivers((prev) => prev.map((d) => (d.id === driver.id ? { ...d, isActive: driver.isActive } : d)));
      toast({ variant: 'destructive', title: 'Lỗi', description: err.message });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tài xế của HTX</h1>
        <p className="text-sm text-muted-foreground">
          Tạm dừng / kích hoạt từng tài xế. Khi tạm dừng, hệ thống sẽ không gửi chuyến mới cho tài xế đó.
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tài xế</TableHead>
              <TableHead>Số điện thoại</TableHead>
              <TableHead className="text-right">Số chuyến</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead className="text-right">Hoạt động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : drivers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Car className="h-8 w-8 text-muted-foreground" />
                    <span className="text-muted-foreground">HTX chưa có tài xế nào.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              drivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      {d.avatar && d.avatar !== 'default_avatar.png' ? <AvatarImage src={d.avatar} /> : null}
                      <AvatarFallback>{(d.fullName ?? '?').slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{d.fullName ?? '—'}</div>
                      {d.vehicleRegistration?.plateNumber && (
                        <div className="text-xs text-muted-foreground">
                          {d.vehicleRegistration.plateNumber}
                          {d.vehicleRegistration.seats ? ` · ${d.vehicleRegistration.seats} chỗ` : ''}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{d.phone ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.tripCount}</TableCell>
                  <TableCell>{statusBadge(d.status)}</TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`text-xs ${d.isActive ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {d.isActive ? 'Đang hoạt động' : 'Tạm dừng'}
                      </span>
                      <Switch
                        checked={d.isActive}
                        disabled={pendingId === d.id}
                        onCheckedChange={() => handleToggle(d)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
