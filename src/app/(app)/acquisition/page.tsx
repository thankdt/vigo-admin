'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getAcquisition, type AcquisitionData } from '@/lib/api';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

// last30 preset (index 3) — the sensible default window for an acquisition view.
const DEFAULT_PRESET_INDEX = 3;

const nf = new Intl.NumberFormat('vi-VN');
const fmt = (v: number) => nf.format(v);
const fmtCompact = (v: number) => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(v);
const fmtMoney = (v: number) => `${nf.format(Math.round(v))} đ`;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent> : null}
    </Card>
  );
}

export default function AcquisitionPage() {
  const { toast } = useToast();
  const [range, setRange] = React.useState<DateRange>(PRESETS[DEFAULT_PRESET_INDEX].range());
  const [data, setData] = React.useState<AcquisitionData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const load = React.useCallback(
    async (r: DateRange) => {
      setIsLoading(true);
      try {
        const result = await getAcquisition(r.from, r.to);
        setData(result);
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Không tải được dữ liệu nguồn khách', description: err.message });
      } finally {
        setIsLoading(false);
      }
    },
    [toast],
  );

  React.useEffect(() => {
    load(range);
  }, [range, load]);

  const fp = data?.firstParty;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nguồn khách</h1>
        <p className="text-sm text-muted-foreground">
          Khách đăng ký đến từ đâu — số liệu thật của Vigo (first-party), đối chiếu với GA4, quảng cáo Meta và
          ChottuLink. Mọi ngày theo giờ Việt Nam (GMT+7).
        </p>
      </div>

      <FinanceFilter
        value={range}
        onChange={setRange}
        isLoading={isLoading}
        initialPreset={PRESETS[DEFAULT_PRESET_INDEX].key}
      />

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : data && fp ? (
        <>
          {/* Summary — first-party is the source of truth for OUR real customers. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Tổng khách đăng ký"
              value={fmt(fp.totalSignups)}
              hint="Tài khoản khách mới (không tính tài khoản admin tạo hộ)"
            />
            <StatCard
              title="Qua giới thiệu"
              value={fmt(fp.viaReferral)}
              hint={`${pct(fp.viaReferral, fp.totalSignups)}% tổng đăng ký (nhập mã giới thiệu)`}
            />
            <StatCard
              title="Trực tiếp / khác"
              value={fmt(fp.direct)}
              hint={`${pct(fp.direct, fp.totalSignups)}% tổng đăng ký`}
            />
            <StatCard
              title="ChottuLink (tổng hiện tại)"
              value={data.chottulink.installsUnavailable ? '—' : fmt(data.chottulink.totalInstalls)}
              hint={
                <>
                  {data.chottulink.installsUnavailable ? 'Lượt tải: gói chưa bật' : 'lượt tải'} ·{' '}
                  {fmt(data.chottulink.totalClicks)} lượt nhấn · {fmt(data.chottulink.referrerCount)} người giới thiệu
                </>
              }
            />
          </div>

          {/* First-party signups over time. */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Khách đăng ký theo thời gian</CardTitle>
              <CardDescription>Số tài khoản khách mới mỗi mốc (giờ VN).</CardDescription>
            </CardHeader>
            <CardContent>
              {fp.byDay.length === 0 ? (
                <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                  Không có dữ liệu trong kỳ.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={fp.byDay} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} tickFormatter={fmtCompact} />
                    <Tooltip formatter={(v: number) => [fmt(v), 'Đăng ký']} />
                    <Line type="monotone" dataKey="signups" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* GA4 acquisition by channel. */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Kênh (Google Analytics)</CardTitle>
                  {data.ga4.available ? (
                    <Badge variant="secondary">GA4</Badge>
                  ) : (
                    <Badge variant="outline">Không khả dụng</Badge>
                  )}
                </div>
                <CardDescription>Người dùng mới &amp; lượt đăng ký theo kênh (số của GA, không map 1:1 khách Vigo).</CardDescription>
              </CardHeader>
              <CardContent>
                {!data.ga4.available ? (
                  <div className="flex h-[260px] items-center justify-center text-center text-sm text-muted-foreground">
                    GA4 chưa cấu hình hoặc không lấy được dữ liệu.
                  </div>
                ) : data.ga4.byChannel.length === 0 ? (
                  <div className="flex h-[260px] items-center justify-center text-muted-foreground">
                    Không có dữ liệu kênh trong kỳ.
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={data.ga4.byChannel} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="channel" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                        <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} tickFormatter={fmtCompact} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar name="Người dùng mới" dataKey="newUsers" fill="#2563eb" radius={[3, 3, 0, 0]} />
                        <Bar name="Đăng ký (sign_up)" dataKey="signups" fill="#16a34a" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-3 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kênh</TableHead>
                            <TableHead className="text-right">Người dùng mới</TableHead>
                            <TableHead className="text-right">Đăng ký</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.ga4.byChannel.map((c) => (
                            <TableRow key={c.channel}>
                              <TableCell className="font-medium">{c.channel}</TableCell>
                              <TableCell className="text-right">{fmt(c.newUsers)}</TableCell>
                              <TableCell className="text-right">{fmt(c.signups)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Meta paid ads. */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Quảng cáo Meta</CardTitle>
                  {data.meta.available ? (
                    <Badge variant="secondary">Meta Ads</Badge>
                  ) : (
                    <Badge variant="outline">Không khả dụng</Badge>
                  )}
                </div>
                <CardDescription>Lượt đăng ký &amp; chi phí do chiến dịch quảng cáo trả phí mang lại.</CardDescription>
              </CardHeader>
              <CardContent>
                {!data.meta.available ? (
                  <div className="flex h-[260px] items-center justify-center text-center text-sm text-muted-foreground">
                    Meta Ads chưa cấu hình hoặc không lấy được dữ liệu.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Lượt đăng ký</div>
                        <div className="text-2xl font-bold">{fmt(data.meta.registrations)}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Chi phí</div>
                        <div className="text-2xl font-bold">{fmtMoney(data.meta.spend)}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Lượt nhấn</div>
                        <div className="text-lg font-semibold">{fmt(data.meta.clicks)}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">Hiển thị</div>
                        <div className="text-lg font-semibold">{fmt(data.meta.impressions)}</div>
                      </div>
                    </div>
                    {data.meta.campaigns.length > 0 && (
                      <div className="mt-3 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Chiến dịch</TableHead>
                              <TableHead className="text-right">Đăng ký</TableHead>
                              <TableHead className="text-right">Chi phí</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.meta.campaigns.map((c, i) => (
                              <TableRow key={`${c.name}-${i}`}>
                                <TableCell className="max-w-[220px] truncate font-medium" title={c.name}>
                                  {c.name}
                                </TableCell>
                                <TableCell className="text-right">{fmt(c.registrations)}</TableCell>
                                <TableCell className="text-right">{fmtMoney(c.spend)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Lưu ý: “first-party” là khách thật đã đăng ký trong hệ thống Vigo (nguồn chân lý). GA4 và Meta là số liệu
            của nền tảng ngoài (đo lường khác nhau, không cộng dồn 1:1). ChottuLink là tổng lũy kế của link giới thiệu,
            không giới hạn theo kỳ.
          </p>
        </>
      ) : null}
    </div>
  );
}
