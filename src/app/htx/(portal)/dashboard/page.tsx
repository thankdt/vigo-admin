'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Car, DollarSign, Ticket, Receipt, Wifi, XCircle, Landmark, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { htxGetDashboard, htxGetMe, type HtxDashboard } from '@/lib/api';
import type { TransportCompany } from '@/lib/types';

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

export default function HtxDashboardPage() {
  const { toast } = useToast();
  const [data, setData] = React.useState<HtxDashboard | null>(null);
  const [company, setCompany] = React.useState<TransportCompany | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    htxGetMe().then(setCompany).catch(() => {/* shown via dashboard load error */});
  }, []);

  type DateRange = { from: string; to: string };

  const todayVn = (): string => {
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return vn.toISOString().slice(0, 10);
  };

  const daysAgoVn = (n: number): string => {
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    vn.setUTCDate(vn.getUTCDate() - n);
    return vn.toISOString().slice(0, 10);
  };

  const firstOfMonthVn = (offsetMonths = 0): string => {
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    vn.setUTCDate(1);
    vn.setUTCMonth(vn.getUTCMonth() + offsetMonths);
    return vn.toISOString().slice(0, 10);
  };

  const lastOfMonthVn = (offsetMonths = 0): string => {
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    vn.setUTCMonth(vn.getUTCMonth() + offsetMonths + 1);
    vn.setUTCDate(0);
    return vn.toISOString().slice(0, 10);
  };

  const firstOfYearVn = (): string => {
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return `${vn.getUTCFullYear()}-01-01`;
  };

  const PRESETS: Array<{ key: string; label: string; range: () => DateRange }> = [
    { key: 'today', label: 'Hôm nay', range: () => ({ from: todayVn(), to: todayVn() }) },
    { key: 'last7', label: '7 ngày qua', range: () => ({ from: daysAgoVn(6), to: todayVn() }) },
    { key: 'thisMonth', label: 'Tháng này', range: () => ({ from: firstOfMonthVn(0), to: todayVn() }) },
    { key: 'last30', label: '30 ngày qua', range: () => ({ from: daysAgoVn(29), to: todayVn() }) },
    { key: 'lastMonth', label: 'Tháng trước', range: () => ({ from: firstOfMonthVn(-1), to: lastOfMonthVn(-1) }) },
    { key: 'thisYear', label: 'Năm nay', range: () => ({ from: firstOfYearVn(), to: todayVn() }) },
  ];

  const [range, setRange] = React.useState<DateRange>(PRESETS[0].range());
  const [activePreset, setActivePreset] = React.useState<string | null>('today');

  const applyPreset = (key: string) => {
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setActivePreset(key);
    setRange(preset.range());
  };

  const handleCustomRange = (key: 'from' | 'to', v: string) => {
    setActivePreset(null);
    setRange((prev) => ({ ...prev, [key]: v }));
  };

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await htxGetDashboard({ mode: 'range', from: range.from, to: range.to });
      setData(result);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được dashboard', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [range, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tổng quan {company ? `— ${company.name}` : ''}</h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi doanh thu, hoa hồng và số chuyến của HTX theo khoảng thời gian đã chọn.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              variant={activePreset === p.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => applyPreset(p.key)}
              disabled={isLoading}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Từ</Label>
            <Input
              type="date"
              value={range.from}
              onChange={(e) => handleCustomRange('from', e.target.value)}
              className="w-full sm:w-44"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Đến</Label>
            <Input
              type="date"
              value={range.to}
              onChange={(e) => handleCustomRange('to', e.target.value)}
              className="w-full sm:w-44"
              disabled={isLoading}
            />
          </div>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Defensive `?? 0` everywhere — first dashboard load might race the API response */}
          {/* and we never want a missing field to crash the whole page. */}
          <StatCard
            icon={<Ticket className="h-5 w-5" />}
            label="Số lượng chuyến"
            value={String((data.ticketCount ?? 0) + (data.cancelledTripCount ?? 0))}
            hint={`Tổng chuyến (thành công + hủy) trong khoảng đã chọn`}
            highlight
          />
          <StatCard icon={<Car className="h-5 w-5" />} label="Số tài xế" value={String(data.vehicleCount ?? 0)} hint="Tài xế thuộc HTX đã đăng ký với ViGo" />
          <StatCard icon={<Wifi className="h-5 w-5" />} label="Xe đã online trong ngày" value={String(data.onlineVehicleCount ?? 0)} hint="Tài xế có chuyến trong khoảng đã chọn" />
          <StatCard icon={<Ticket className="h-5 w-5" />} label="Chuyến thành công" value={String(data.ticketCount ?? 0)} hint="Hoàn thành trong khoảng đã chọn" />
          <StatCard icon={<XCircle className="h-5 w-5" />} label="Chuyến hủy" value={String(data.cancelledTripCount ?? 0)} hint="Bị hủy trong khoảng đã chọn" />
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="Tổng tiền" value={formatCurrency(data.grossRevenue ?? 0)} hint="Giá vận chuyển trước thuế / giảm giá" />
          <StatCard icon={<Landmark className="h-5 w-5" />} label="Thuế TNCN" value={formatCurrency(data.pitAmount ?? 0)} hint="Thuế thu nhập cá nhân tài xế trong kỳ" />
          <StatCard icon={<Receipt className="h-5 w-5" />} label="Thuế VAT" value={formatCurrency(data.vatAmount ?? 0)} hint="Tổng VAT thu hộ" />
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            label="Hoa hồng HTX"
            value={formatCurrency(data.htxCommissionAmount ?? 0)}
            hint={`${((data.htxCommissionRate ?? 0) * 100).toFixed(2)}% × tổng tiền trước thuế`}
            highlight
          />
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-primary' : undefined}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={highlight ? 'text-primary' : 'text-muted-foreground'}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${highlight ? 'text-primary' : ''}`}>{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
