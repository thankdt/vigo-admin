'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Car, DollarSign, Percent, Wallet, Ticket, Receipt, Wifi, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { htxGetDashboard, htxGetMe, type HtxDashboard } from '@/lib/api';
import type { TransportCompany } from '@/lib/types';

const periodLabels: Record<HtxDashboard['period'], string> = {
  day: 'Ngày',
  month: 'Tháng',
  year: 'Năm',
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const formatPercent = (rate: number) =>
  `${(rate * 100).toFixed(rate < 0.01 ? 2 : 1)}%`;

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function HtxDashboardPage() {
  const { toast } = useToast();
  const [period, setPeriod] = React.useState<HtxDashboard['period']>('day');
  const [date, setDate] = React.useState<string>(todayISO());
  const [data, setData] = React.useState<HtxDashboard | null>(null);
  const [company, setCompany] = React.useState<TransportCompany | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    htxGetMe().then(setCompany).catch(() => {/* shown via dashboard load error */});
  }, []);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await htxGetDashboard(period, date);
      setData(result);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được dashboard', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [period, date, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  // For month/year, day part of `date` is irrelevant but the server still accepts it. We render
  // a coarser picker to match — month: <input type="month">, year: <input type="number">.
  const renderDatePicker = () => {
    if (period === 'day') {
      return (
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-44" />
      );
    }
    if (period === 'month') {
      const ym = date.slice(0, 7); // YYYY-MM
      return (
        <Input
          type="month"
          value={ym}
          onChange={(e) => setDate(`${e.target.value}-01`)}
          className="w-full sm:w-44"
        />
      );
    }
    const year = date.slice(0, 4);
    return (
      <Input
        type="number"
        min="2020"
        max="2100"
        value={year}
        onChange={(e) => setDate(`${e.target.value}-01-01`)}
        className="w-full sm:w-32"
      />
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tổng quan {company ? `— ${company.name}` : ''}</h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi doanh thu, hoa hồng và số chuyến của HTX theo {periodLabels[period].toLowerCase()}.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Khoảng thời gian</Label>
          <Select value={period} onValueChange={(v) => setPeriod(v as HtxDashboard['period'])}>
            <SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Theo ngày</SelectItem>
              <SelectItem value="month">Theo tháng</SelectItem>
              <SelectItem value="year">Theo năm</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Chọn {periodLabels[period].toLowerCase()}</Label>
          {renderDatePicker()}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Defensive `?? 0` everywhere — first dashboard load might race the API response */}
          {/* and we never want a missing field to crash the whole page. */}
          <StatCard icon={<Car className="h-5 w-5" />} label="Số xe" value={String(data.vehicleCount ?? 0)} hint="Tài xế thuộc HTX" />
          <StatCard icon={<Wifi className="h-5 w-5" />} label="Xe đang online" value={String(data.onlineVehicleCount ?? 0)} hint="Trạng thái thời gian thực" />
          <StatCard icon={<Ticket className="h-5 w-5" />} label="Chuyến thành công" value={String(data.ticketCount ?? 0)} hint={`Hoàn thành trong ${periodLabels[period].toLowerCase()}`} />
          <StatCard icon={<XCircle className="h-5 w-5" />} label="Chuyến hủy" value={String(data.cancelledTripCount ?? 0)} hint={`Bị hủy trong ${periodLabels[period].toLowerCase()}`} />
          <StatCard icon={<DollarSign className="h-5 w-5" />} label="Tổng tiền" value={formatCurrency(data.grossRevenue ?? 0)} hint="Giá vận chuyển trước thuế / giảm giá" />
          <StatCard icon={<Percent className="h-5 w-5" />} label="% App lấy" value={formatPercent(data.commissionRate ?? 0)} hint={`Hoa hồng: ${formatCurrency(data.commissionAmount ?? 0)}`} />
          <StatCard icon={<Receipt className="h-5 w-5" />} label="Thuế VAT" value={formatCurrency(data.vatAmount ?? 0)} hint="Tổng VAT thu hộ" />
          <StatCard icon={<Wallet className="h-5 w-5" />} label="Thu nhập (HTX)" value={formatCurrency(data.netIncome ?? 0)} hint="Sau hoa hồng + VAT" highlight />
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
