'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity, Users, Car, Wifi, CheckCircle2, XCircle, Wallet, Banknote, DollarSign,
  Building2, UserPlus, UserCheck, Loader2, ChevronRight, Route, Armchair, Trophy,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  getAdminOverview, getFinanceDashboard, getFinanceSeries, getOverviewSeries,
  type AdminOverview, type FinanceDashboard, type FinanceSeries,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';
import {
  DASHBOARD_METRICS, cancelRatePct, defaultMetric, fmtCount, resolveMetric,
  type DashboardMetricKey,
} from './dashboard-metrics';

const fmtVnd = (v: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);
const fmtNum = (v: number) => new Intl.NumberFormat('vi-VN').format(v);
const fmtCompact = (v: number) => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(v);

// "Vận hành (hiện tại)" tự làm mới theo chu kỳ này — trước đây chỉ đổi khi tải lại trang.
const REALTIME_REFRESH_MS = 60_000;

type StatProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  // Có onSelect = ô bấm được: chọn metric này cho biểu đồ bên dưới.
  onSelect?: () => void;
  selected?: boolean;
};

function Stat({ icon, label, value, hint, accent, onSelect, selected }: StatProps) {
  const card = (
    <Card className={`h-full ${onSelect ? 'transition-shadow group-hover:shadow-md' : ''} ${selected ? 'border-primary ring-1 ring-primary' : ''}`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={selected ? 'text-primary' : 'text-muted-foreground'}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accent ?? ''}`}>{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
  if (!onSelect) return card;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={!!selected}
      title="Bấm để xem biểu đồ theo thời gian"
      className="group block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {card}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-muted-foreground">{children}</h2>;
}

export default function DashboardPage() {
  const { toast } = useToast();
  const { can } = useAuth();
  // Widget tiền (GMV, doanh thu, Top HTX/tài xế) lấy từ /admin/finance/* — backend gate
  // bằng quyền `finance`. User không có `finance` thì bỏ qua các call đó (tránh 403
  // làm hỏng cả trang) và ẩn phần tiền; phần vận hành (/admin/overview) vẫn hiện.
  const canFinance = can('finance');
  const [range, setRange] = React.useState<DateRange>(PRESETS[0].range());
  const [ov, setOv] = React.useState<AdminOverview | null>(null);
  const [fin, setFin] = React.useState<FinanceDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);

  // null = chưa bấm ô nào → mặc định theo quyền (quyền có thể về SAU lần render đầu).
  const [picked, setPicked] = React.useState<DashboardMetricKey | null>(null);
  const metricKey = picked ? resolveMetric(picked, canFinance) : defaultMetric(canFinance);
  const metric = DASHBOARD_METRICS[metricKey];
  const [series, setSeries] = React.useState<FinanceSeries | null>(null);
  const [seriesLoading, setSeriesLoading] = React.useState(true);
  const [seriesError, setSeriesError] = React.useState(false);

  // Kỳ đang hiển thị — để lượt làm mới nền/response về muộn của kỳ CŨ không ghi đè kỳ mới.
  const rangeRef = React.useRef(range);
  rangeRef.current = range;
  const sameRange = React.useCallback((r: DateRange) => rangeRef.current.from === r.from && rangeRef.current.to === r.to, []);

  const load = React.useCallback(async (r: DateRange) => {
    setLoading(true);
    try {
      const [o, f] = await Promise.all([
        getAdminOverview(r.from, r.to),
        canFinance ? getFinanceDashboard(r.from, r.to) : Promise.resolve(null),
      ]);
      if (!sameRange(r)) return;
      setOv(o); setFin(f);
    } catch (err: any) {
      if (sameRange(r)) toast({ variant: 'destructive', title: 'Không tải được dashboard', description: err.message });
    } finally {
      if (sameRange(r)) setLoading(false);
    }
  }, [toast, canFinance, sameRange]);

  React.useEffect(() => { load(range); }, [range, load]);

  // Chuỗi thời gian của ô đang chọn. Tách khỏi `load`: lỗi biểu đồ không được báo hỏng cả
  // trang, và bấm nhanh nhiều ô thì chỉ nhận kết quả của lần bấm CUỐI (cleanup → stale).
  React.useEffect(() => {
    let stale = false;
    setSeriesLoading(true); setSeriesError(false);
    const fetchSeries = metric.source === 'finance' ? getFinanceSeries : getOverviewSeries;
    fetchSeries(metric.metric, range.from, range.to)
      .then((s) => { if (!stale) setSeries(s); })
      .catch(() => { if (!stale) { setSeries(null); setSeriesError(true); } })
      .finally(() => { if (!stale) setSeriesLoading(false); });
    return () => { stale = true; };
  }, [metric.source, metric.metric, range]);

  // Làm mới nền số vận hành. Lỗi thì giữ số cũ, im lặng (lượt sau thử lại); tab ẩn thì bỏ qua.
  React.useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      const r = rangeRef.current;
      getAdminOverview(r.from, r.to).then((o) => { if (sameRange(r)) setOv(o); }).catch(() => {});
    }, REALTIME_REFRESH_MS);
    return () => clearInterval(id);
  }, [sameRange]);

  const avgFare = ov && ov.business.completedTripsInPeriod > 0 && fin
    ? Math.round(fin.cashFlow.totalTripIncludingTax / ov.business.completedTripsInPeriod)
    : 0;

  const pick = (key: DashboardMetricKey) => ({ onSelect: () => setPicked(key), selected: metricKey === key });
  const fmtValue = (v: number) => (metric.unit === 'vnd' ? `${fmtNum(v)} đ` : fmtNum(v));
  const cancelPct = ov ? cancelRatePct(ov.business.completedPassengerTripsInPeriod, ov.business.cancelledPassengerTripsInPeriod) : null;
  const cancelled = ov?.business.cancelledPassengerTripsInPeriod ?? 0;
  const pendingDrivers = ov?.supply.pendingApproval ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tổng quan</h1>
        <p className="text-sm text-muted-foreground">Tình hình vận hành hiện tại và chỉ số theo kỳ. Bấm vào một ô số theo kỳ để xem biểu đồ theo thời gian.</p>
      </div>

      <FinanceFilter value={range} onChange={setRange} isLoading={loading} alwaysShowCustom />

      {loading && !ov ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : ov ? (
        <>
          {/* A — Vận hành hiện tại: số tức thời, KHÔNG đổi theo bộ lọc ngày, tự làm mới mỗi phút. */}
          <SectionTitle>Vận hành (hiện tại)</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={<Activity className="h-5 w-5" />} label="Chuyến đang chạy" value={fmtNum(ov.realtime.activeTrips)} hint="ACCEPTED / ARRIVED / PICKED_UP" />
            <Stat icon={<Wifi className="h-5 w-5" />} label="Tài xế online" value={fmtNum(ov.realtime.onlineDrivers)} hint={`${ov.realtime.busyDrivers} đang bận`} accent="text-green-600 dark:text-green-400" />
            <Stat icon={<Car className="h-5 w-5" />} label="Tài xế đang bận" value={fmtNum(ov.realtime.busyDrivers)} hint="Đang trên chuyến" />
            <Link href="/drivers" className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Card className={`h-full transition-shadow hover:shadow-md ${pendingDrivers > 0 ? 'border-amber-400 dark:border-amber-600' : ''}`}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Tài xế chờ duyệt</CardTitle>
                  <div className={pendingDrivers > 0 ? 'text-amber-500' : 'text-muted-foreground'}><UserPlus className="h-5 w-5" /></div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${pendingDrivers > 0 ? 'text-amber-600 dark:text-amber-500' : ''}`}>{fmtNum(pendingDrivers)}</div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-0.5">Xem danh sách <ChevronRight className="h-3 w-3" /></p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* B — Theo kỳ đã chọn. Số chuyến = "chuyến xe khách" (bao xe + đi chung): giao hàng
              và xe máy chưa vận hành nên backend bỏ qua. */}
          <SectionTitle>Theo kỳ đã chọn</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={<Route className="h-5 w-5" />} label="Tổng chuyến" value={fmtCount(ov.business.tripsInPeriod)} hint="Chuyến tạo trong kỳ (bao xe + đi chung)" {...pick('trips')} />
            <Stat icon={<Car className="h-5 w-5" />} label="Tổng bao xe" value={fmtCount(ov.business.rideTripsInPeriod)} hint="Chuyến tạo trong kỳ" {...pick('rideTrips')} />
            <Stat icon={<Users className="h-5 w-5" />} label="Tổng đi chung" value={fmtCount(ov.business.carpoolTripsInPeriod)} hint="Chuyến tạo trong kỳ" {...pick('carpoolTrips')} />
            <Stat icon={<CheckCircle2 className="h-5 w-5" />} label="Tổng hoàn thành" value={fmtCount(ov.business.completedPassengerTripsInPeriod)} hint="Hoàn thành trong kỳ" accent="text-green-600 dark:text-green-400" {...pick('completedTrips')} />

            <Stat icon={<XCircle className="h-5 w-5" />} label="Chuyến huỷ" value={fmtCount(ov.business.cancelledPassengerTripsInPeriod)} hint={cancelPct == null ? 'Huỷ trong kỳ' : `${cancelPct}% số chuyến đã kết thúc`} accent={cancelled > 0 ? 'text-destructive' : ''} {...pick('cancelledTrips')} />
            <Stat icon={<UserPlus className="h-5 w-5" />} label="Người dùng mới" value={fmtNum(ov.demand.newCustomersInPeriod)} hint="Đăng ký trong kỳ" accent="text-green-600 dark:text-green-400" {...pick('newCustomers')} />
            <Stat icon={<Users className="h-5 w-5" />} label="Người đặt chuyến" value={fmtCount(ov.demand.bookingCustomersInPeriod)} hint="Khách có tạo chuyến trong kỳ" {...pick('bookingCustomers')} />
            <Stat icon={<UserPlus className="h-5 w-5" />} label="Tài xế mới" value={fmtNum(ov.supply.newDriversInPeriod)} hint="Đăng ký trong kỳ" {...pick('newDrivers')} />

            <Stat icon={<UserCheck className="h-5 w-5" />} label="Tài xế hoàn thành chuyến" value={fmtCount(ov.supply.activeDriversInPeriod)} hint="Có chuyến hoàn thành trong kỳ" {...pick('activeDrivers')} />
            <Stat icon={<Car className="h-5 w-5" />} label="Tổng tài xế" value={fmtNum(ov.supply.totalDrivers)} hint="Toàn hệ thống, đến hiện tại" />
            <Stat icon={<Users className="h-5 w-5" />} label="Tổng khách hàng" value={fmtNum(ov.demand.totalCustomers)} hint="Toàn hệ thống, đến hiện tại" />
            <Stat icon={<Armchair className="h-5 w-5" />} label="Khách đã phục vụ" value={fmtCount(ov.business.passengersServedInPeriod)} hint="Ước tính: đi chung theo ghế đặt, bao xe theo ghế tối đa (4/6)" {...pick('passengersServed')} />
          </div>

          {/* C — Kinh doanh theo kỳ (chỉ role có quyền `finance`) */}
          {canFinance && fin && (<>
          <SectionTitle>Kinh doanh (theo kỳ đã chọn)</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={<Banknote className="h-5 w-5" />} label="GMV (tổng tiền chuyến)" value={fmtVnd(fin.cashFlow.totalTripIncludingTax)} hint="Tiền khách trả (chuyến hoàn thành)" {...pick('gmv')} />
            <Stat
              icon={<DollarSign className="h-5 w-5" />}
              label="Doanh thu VIGO"
              value={fmtVnd(fin.breakdown.vigoRevenue)}
              // vigoRevenue có thể ÂM: tài hưởng mức riêng thấp thì VIGO vẫn
              // phải bù đủ phần HTX của họ.
              accent={fin.breakdown.vigoRevenue < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}
              hint={fin.breakdown.vigoRevenue < 0
                ? 'Hoa hồng VIGO giữ. ÂM: gồm phần VIGO bù cho HTX của tài hưởng mức riêng thấp.'
                : 'Hoa hồng VIGO giữ'}
              {...pick('vigoRevenue')}
            />
            <Stat icon={<Activity className="h-5 w-5" />} label="Giá TB / chuyến" value={fmtVnd(avgFare)} hint="GMV / chuyến hoàn thành" />
            <Stat icon={<Wallet className="h-5 w-5" />} label="Tài xế nạp" value={fmtVnd(fin.cashFlow.driverPayosTopUp)} hint="Nạp ví qua chuyển khoản trong kỳ" {...pick('driverTopUp')} />
          </div>
          </>)}

          {/* Biểu đồ dùng chung — đổi theo ô đang chọn ở hai mục trên. */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
              <CardTitle className="text-base">{metric.title} theo thời gian</CardTitle>
              {seriesLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardHeader>
            <CardContent>
              {seriesError ? (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">Không tải được biểu đồ cho chỉ số này.</div>
              ) : !series || series.points.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center text-muted-foreground">{seriesLoading ? 'Đang tải…' : 'Không có dữ liệu trong kỳ.'}</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={series.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={fmtCompact} allowDecimals={metric.unit === 'vnd'} />
                    <Tooltip formatter={(v: number) => [fmtValue(v), metric.title]} />
                    <Bar dataKey="value" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {metric.note && !seriesError && <p className="text-xs text-muted-foreground mt-2">{metric.note}</p>}
            </CardContent>
          </Card>

          {canFinance && fin && (
          <div className="grid gap-4 lg:grid-cols-2">
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

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Top tài xế theo thu nhập (kỳ)</CardTitle>
              </CardHeader>
              <CardContent>
                {fin.topDrivers.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">Chưa có dữ liệu.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tài xế</TableHead>
                        <TableHead className="text-right">Số chuyến</TableHead>
                        <TableHead className="text-right">Tài xế nhận</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fin.topDrivers.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>
                            <div className="font-medium">{d.fullName}</div>
                            <div className="text-xs text-muted-foreground">{d.phone}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtNum(d.bookingCount)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtVnd(d.netEarnings)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
          )}
        </>
      ) : null}
    </div>
  );
}
