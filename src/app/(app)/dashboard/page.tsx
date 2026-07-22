'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity, Users, Car, Wifi, Clock, CheckCircle2, XCircle, AlertTriangle,
  Wallet, Banknote, DollarSign, Building2, UserPlus, Percent, Loader2, ChevronRight,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  getAdminOverview, getFinanceDashboard, getFinanceSeries,
  type AdminOverview, type FinanceDashboard, type FinanceSeries,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';

const fmtVnd = (v: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);
const fmtNum = (v: number) => new Intl.NumberFormat('vi-VN').format(v);
const fmtCompact = (v: number) => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(v);

function Stat({ icon, label, value, hint, accent }: { icon: React.ReactNode; label: string; value: string; hint?: string; accent?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accent ?? ''}`}>{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// Actionable queue tile — links to the relevant page, turns amber when there's
// something waiting so the admin sees at a glance what needs handling.
function QueueTile({ icon, label, count, href }: { icon: React.ReactNode; label: string; count: number; href: string }) {
  const active = count > 0;
  return (
    <Link href={href}>
      <Card className={`cursor-pointer transition-shadow hover:shadow-md ${active ? 'border-amber-400 dark:border-amber-600' : ''}`}>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
          <div className={active ? 'text-amber-500' : 'text-muted-foreground'}>{icon}</div>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${active ? 'text-amber-600 dark:text-amber-500' : ''}`}>{fmtNum(count)}</div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-0.5">Xử lý <ChevronRight className="h-3 w-3" /></p>
        </CardContent>
      </Card>
    </Link>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-muted-foreground">{children}</h2>;
}

export default function DashboardPage() {
  const { toast } = useToast();
  const { can } = useAuth();
  // Widget tiền (GMV, doanh thu, Top HTX) lấy từ /admin/finance/* — backend gate
  // bằng quyền `finance`. User không có `finance` thì bỏ qua các call đó (tránh 403
  // làm hỏng cả trang) và ẩn phần tiền; phần vận hành (/admin/overview) vẫn hiện.
  const canFinance = can('finance');
  const [range, setRange] = React.useState<DateRange>(PRESETS[0].range());
  const [ov, setOv] = React.useState<AdminOverview | null>(null);
  const [fin, setFin] = React.useState<FinanceDashboard | null>(null);
  const [series, setSeries] = React.useState<FinanceSeries | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async (r: DateRange) => {
    setLoading(true);
    try {
      const o = await getAdminOverview(r.from, r.to);
      setOv(o);
      if (canFinance) {
        const [f, s] = await Promise.all([
          getFinanceDashboard(r.from, r.to),
          getFinanceSeries('totalTripIncludingTax', r.from, r.to),
        ]);
        setFin(f); setSeries(s);
      } else {
        setFin(null); setSeries(null);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được dashboard', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [toast, canFinance]);

  React.useEffect(() => { load(range); }, [range, load]);

  const avgFare = ov && ov.business.completedTripsInPeriod > 0 && fin
    ? Math.round(fin.cashFlow.totalTripIncludingTax / ov.business.completedTripsInPeriod)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tổng quan</h1>
        <p className="text-sm text-muted-foreground">Tình hình vận hành hiện tại, hàng chờ cần xử lý và chỉ số kinh doanh theo kỳ.</p>
      </div>

      <FinanceFilter value={range} onChange={setRange} isLoading={loading} />

      {loading && !ov ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : ov ? (
        <>
          {/* A — Vận hành hiện tại */}
          <SectionTitle>Vận hành (hiện tại)</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={<Activity className="h-5 w-5" />} label="Chuyến đang chạy" value={fmtNum(ov.realtime.activeTrips)} hint="ACCEPTED / ARRIVED / PICKED_UP" />
            <Stat icon={<Clock className="h-5 w-5" />} label="Khách đang chờ ghép" value={fmtNum(ov.realtime.waitingCustomers)} hint="SEARCHING / PENDING_MATCHING" accent={ov.realtime.waitingCustomers > 0 ? 'text-amber-600' : ''} />
            <Stat icon={<Wifi className="h-5 w-5" />} label="Tài xế online" value={fmtNum(ov.realtime.onlineDrivers)} hint={`${ov.realtime.busyDrivers} đang bận`} accent="text-green-600 dark:text-green-400" />
            <Stat icon={<Car className="h-5 w-5" />} label="Tài xế đang bận" value={fmtNum(ov.realtime.busyDrivers)} hint="Đang trên chuyến" />
          </div>

          {/* Hôm nay */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={<UserPlus className="h-5 w-5" />} label="Người dùng mới hôm nay" value={fmtNum(ov.today.newUsers ?? 0)} hint="Tài khoản đăng ký mới (giờ VN)" accent="text-green-600 dark:text-green-400" />
            <Stat icon={<Banknote className="h-5 w-5" />} label="Chuyến tạo hôm nay" value={fmtNum(ov.today.created)} />
            <Stat icon={<CheckCircle2 className="h-5 w-5" />} label="Hoàn thành hôm nay" value={fmtNum(ov.today.completed)} accent="text-green-600 dark:text-green-400" />
            <Stat icon={<XCircle className="h-5 w-5" />} label="Huỷ hôm nay" value={fmtNum(ov.today.cancelled)} accent={ov.today.cancelled > 0 ? 'text-destructive' : ''} />
            <Stat icon={<Percent className="h-5 w-5" />} label="Tỉ lệ hoàn thành" value={`${ov.today.completionRate}%`} hint="Hoàn thành / tạo (hôm nay)" />
          </div>

          {/* Hàng chờ cần xử lý */}
          <SectionTitle>⚠️ Hàng chờ cần xử lý</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <QueueTile icon={<Clock className="h-5 w-5" />} label="Vinow chờ nhận" count={ov.queues.awaitingClaim} href="/bookings" />
            <QueueTile icon={<AlertTriangle className="h-5 w-5" />} label="Chuyến cần xử lý" count={ov.queues.processing} href="/bookings" />
            <QueueTile icon={<UserPlus className="h-5 w-5" />} label="Tài xế chờ duyệt" count={ov.queues.driversPendingApproval} href="/drivers" />
            <QueueTile icon={<Wallet className="h-5 w-5" />} label="Lệnh rút chờ duyệt" count={ov.queues.withdrawalsPending} href="/withdrawals" />
          </div>

          {/* B — Kinh doanh theo kỳ (chỉ role có quyền `finance`) */}
          {canFinance && fin && (<>
          <SectionTitle>Kinh doanh (theo kỳ đã chọn)</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={<Banknote className="h-5 w-5" />} label="GMV (tổng tiền chuyến)" value={fmtVnd(fin.cashFlow.totalTripIncludingTax)} hint="Tiền khách trả (chuyến hoàn thành)" />
            <Stat icon={<DollarSign className="h-5 w-5" />} label="Doanh thu VIGO" value={fmtVnd(fin.breakdown.vigoRevenue)} accent="text-green-600 dark:text-green-400" hint="Hoa hồng VIGO giữ" />
            <Stat icon={<CheckCircle2 className="h-5 w-5" />} label="Chuyến hoàn thành" value={fmtNum(ov.business.completedTripsInPeriod)} />
            <Stat icon={<Activity className="h-5 w-5" />} label="Giá TB / chuyến" value={fmtVnd(avgFare)} hint="GMV / chuyến hoàn thành" />
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">GMV theo thời gian</CardTitle></CardHeader>
            <CardContent>
              {!series || series.points.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">Không có dữ liệu trong kỳ.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={series.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={fmtCompact} />
                    <Tooltip formatter={(v: number) => [`${fmtNum(v)} đ`, 'GMV']} />
                    <Bar dataKey="value" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          </>)}

          {/* C — Cung – cầu & tăng trưởng */}
          <SectionTitle>Cung – cầu & tăng trưởng</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={<Car className="h-5 w-5" />} label="Tổng tài xế" value={fmtNum(ov.supply.totalDrivers)} hint={`${ov.supply.onlineDrivers} online · ${ov.supply.pendingApproval} chờ duyệt`} />
            <Stat icon={<UserPlus className="h-5 w-5" />} label="Tài xế mới (kỳ)" value={fmtNum(ov.supply.newDriversInPeriod)} />
            <Stat icon={<Users className="h-5 w-5" />} label="Tổng khách hàng" value={fmtNum(ov.demand.totalCustomers)} hint={`${ov.demand.newCustomersInPeriod} mới trong kỳ`} />
            <Stat icon={<Activity className="h-5 w-5" />} label="Khách hoạt động (kỳ)" value={fmtNum(ov.demand.activeCustomersInPeriod)} hint="Có chuyến hoàn thành trong kỳ" />
          </div>

          {canFinance && fin && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Top HTX theo doanh thu (kỳ)</CardTitle>
            </CardHeader>
            <CardContent>
              {fin.topHtx.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">Chưa có dữ liệu.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>HTX</TableHead>
                      <TableHead className="text-right">Số chuyến</TableHead>
                      <TableHead className="text-right">HTX nhận</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fin.topHtx.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-medium">{h.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(h.bookingCount)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtVnd(h.netIncome)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
