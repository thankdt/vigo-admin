'use client';

import * as React from 'react';
import { Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getBookings,
  getCskhActivityFeed,
  getCskhActivitySummary,
  getCskhActivityStaff,
  type CskhActivityKind,
  type CskhActivitySummary,
  type CskhCallRow,
} from '@/lib/api';
import {
  BOOKING_CALL_STATUS_LABEL,
  BOOKING_CALL_STATUS_ORDER,
  DRIVER_CALL_TYPE_LABEL,
  DRIVER_CALL_TYPE_ORDER,
  KIND_LABEL,
  outcomeBadgeClass,
  outcomeLabel,
} from '@/lib/cskh-call-labels';
import { formatVnDateTime } from '../leakage-review/leakage-labels';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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

// Preset mặc định gắn theo KEY chứ không theo index — chèn thêm một preset vào giữa
// mảng sẽ không âm thầm đổi khoảng ngày mặc định của trang.
const DEFAULT_PRESET_KEY = 'today';
const DEFAULT_PRESET = PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY) ?? PRESETS[0];

const ALL = '__all__';
const PAGE_SIZE = 50;

const nf = new Intl.NumberFormat('vi-VN');
const fmt = (v: number | null | undefined) => nf.format(Number(v ?? 0));

// Cột "Lúc" tách 2 dòng giờ / ngày cho dễ quét. Hai formatter riêng thay vì cắt chuỗi
// của formatVnDateTime — thứ tự ngày/giờ trong chuỗi là do locale quyết, không chắc chắn.
const VN_TIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
});
const VN_DATE = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
});

function StatCard({ title, value, hint }: { title: string; value: React.ReactNode; hint?: string }) {
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

/**
 * Ô đích được gọi: tên + SĐT. KHÔNG link sang /bookings hay /drivers — hai màn đó chưa
 * đọc query param nào (không dùng useSearchParams), link sẽ chỉ mở trang trắng bộ lọc
 * chứ không tra được đúng người. Dán SĐT vào ô tìm kiếm bên đó là cách dùng thật.
 */
function TargetCell({ row }: { row: CskhCallRow }) {

  return (
    <div className="min-w-0">
      <div className="font-medium">
        {row.targetName || (row.kind === 'BOOKING' ? 'Khách không rõ tên' : 'Tài xế không rõ tên')}
      </div>
      <div className="text-xs text-muted-foreground">{row.targetPhone || '—'}</div>
    </div>
  );
}

export default function CskhActivityPage() {
  const { toast } = useToast();

  const [range, setRange] = React.useState<DateRange>(DEFAULT_PRESET.range());
  const [adminUserId, setAdminUserId] = React.useState<string>(ALL);
  const [kind, setKind] = React.useState<string>(ALL);
  const [outcome, setOutcome] = React.useState<string>(ALL);
  const [contactOnly, setContactOnly] = React.useState(false);
  const [page, setPage] = React.useState(1);

  const [staff, setStaff] = React.useState<Array<{ id: string; fullName: string | null }>>([]);
  const [summary, setSummary] = React.useState<CskhActivitySummary | null>(null);
  const [feed, setFeed] = React.useState<CskhCallRow[]>([]);
  const [feedMeta, setFeedMeta] = React.useState({ total: 0, totalPages: 1 });
  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [loadingFeed, setLoadingFeed] = React.useState(true);

  const outcomeOptions = React.useMemo(() => {
    if (kind === 'BOOKING') {
      return BOOKING_CALL_STATUS_ORDER.map((s) => ({ value: s as string, label: BOOKING_CALL_STATUS_LABEL[s] }));
    }
    if (kind === 'DRIVER') {
      return DRIVER_CALL_TYPE_ORDER.map((t) => ({ value: t as string, label: DRIVER_CALL_TYPE_LABEL[t] }));
    }
    // Không lọc theo nguồn → hợp của 2 bộ, khử trùng mã dùng chung (CALLED/UNREACHED).
    const merged = new Map<string, { value: string; label: string }>();
    for (const s of BOOKING_CALL_STATUS_ORDER) {
      merged.set(s, { value: s, label: BOOKING_CALL_STATUS_LABEL[s] });
    }
    for (const t of DRIVER_CALL_TYPE_ORDER) {
      if (!merged.has(t)) merged.set(t, { value: t, label: DRIVER_CALL_TYPE_LABEL[t] });
    }
    return [...merged.values()];
  }, [kind]);

  // Đổi nguồn có thể làm kết quả đang chọn không còn hợp lệ (vd "Hẹn gọi lại" chỉ có ở
  // luồng tài xế). DẪN XUẤT giá trị hợp lệ thay vì reset bằng useEffect: effect sẽ để lọt
  // đúng một lượt render mang bộ lọc vô nghĩa → một request thừa trả 0 dòng rồi mới reset.
  // Giữ nguyên `outcome` trong state nên chọn lại nguồn cũ thì lựa chọn cũ hiện lại.
  const effectiveOutcome =
    outcome === ALL || outcomeOptions.some((o) => o.value === outcome) ? outcome : ALL;

  const filters = React.useMemo(
    () => ({
      from: range.from,
      to: range.to,
      adminUserId: adminUserId === ALL ? undefined : adminUserId,
      kind: kind === ALL ? undefined : (kind as CskhActivityKind),
      outcome: effectiveOutcome === ALL ? undefined : effectiveOutcome,
      contactOnly: contactOnly || undefined,
    }),
    [range.from, range.to, adminUserId, kind, effectiveOutcome, contactOnly],
  );

  // Đổi bất kỳ bộ lọc nào → về trang 1, nếu không sẽ rơi vào trang trống của kết quả mới.
  // Chỉnh state ngay trong lúc render (mẫu chính thức của React) thay vì useEffect: dùng
  // effect thì lượt render đầu vẫn fetch bằng page CŨ rồi mới fetch lại — 2 request cho
  // một thao tác lọc.
  const filtersKey = JSON.stringify(filters);
  const [prevFiltersKey, setPrevFiltersKey] = React.useState(filtersKey);
  if (prevFiltersKey !== filtersKey) {
    setPrevFiltersKey(filtersKey);
    setPage(1);
  }

  React.useEffect(() => {
    getCskhActivityStaff()
      .then(setStaff)
      .catch(() => setStaff([])); // dropdown trống vẫn dùng trang được, không chặn
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingSummary(true);
    getCskhActivitySummary(filters)
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch((err: any) => {
        if (!cancelled) toast({ variant: 'destructive', title: 'Không tải được tổng hợp CSKH', description: err.message });
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, toast]);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingFeed(true);
    getCskhActivityFeed({ ...filters, page, limit: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setFeed(res.data);
        setFeedMeta({ total: res.meta.total, totalPages: Math.max(1, res.meta.totalPages) });
      })
      .catch((err: any) => {
        if (!cancelled) toast({ variant: 'destructive', title: 'Không tải được nhật ký cuộc gọi', description: err.message });
      })
      .finally(() => {
        if (!cancelled) setLoadingFeed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, page, toast]);

  const t = summary?.totals;


  /**
   * Chuyến bị SÓT GỌI TRƯỚC — chuyến đã hoàn thành mà chưa ai gọi xác nhận trước đó.
   *
   * Chỉ số này là ĐIỀU KIỆN của một quyết định thiết kế, không phải trang trí: hàng đợi
   * CSKH cố ý LOẠI những chuyến này khỏi tab "Cần gọi trước hoàn thành" (cơ hội gọi trước
   * đã qua, giữ lại thì hàng đợi không bao giờ vơi). Spec §6.1 cho phép loại VỚI ĐIỀU KIỆN
   * đếm được ở đây — thiếu ô này thì chúng biến mất khỏi mọi tầm nhìn.
   *
   * Không phụ thuộc bộ lọc ngày của trang: đây là TỒN KHO tại thời điểm hiện tại, không
   * phải số phát sinh trong kỳ. `limit: 1` vì chỉ cần `total`.
   */
  const [missedBefore, setMissedBefore] = React.useState<number | null>(null);
  React.useEffect(() => {
    getBookings({ callBefore: 'uncalled', status: 'COMPLETED', limit: 1 })
      .then((r) => setMissedBefore(r.total))
      // Hỏng thì để null -> ô hiện '—'. Không chặn cả trang vì một chỉ số phụ.
      .catch(() => setMissedBefore(null));
  }, []);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hoạt động CSKH</h1>
        <p className="text-sm text-muted-foreground">
          Nhân viên CSKH đã gọi cho ai, lúc nào, vì sao và kết quả ra sao. Mọi ngày/giờ theo giờ Việt Nam (GMT+7).
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <FinanceFilter
            value={range}
            onChange={setRange}
            isLoading={loadingSummary}
            initialPreset={DEFAULT_PRESET.key}
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nhân viên</Label>
              <Select value={adminUserId} onValueChange={setAdminUserId}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả nhân viên</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName || s.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Gọi cho</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Khách và tài xế</SelectItem>
                  <SelectItem value="BOOKING">{KIND_LABEL.BOOKING}</SelectItem>
                  <SelectItem value="DRIVER">{KIND_LABEL.DRIVER}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Kết quả</Label>
              <Select value={effectiveOutcome} onValueChange={setOutcome}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Mọi kết quả</SelectItem>
                  {outcomeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Checkbox
                id="contact-only"
                checked={contactOnly}
                onCheckedChange={(v) => setContactOnly(v === true)}
              />
              <Label htmlFor="contact-only" className="text-sm font-normal">
                Chỉ cuộc gọi thật
              </Label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            &ldquo;Cuộc gọi thật&rdquo; = gọi được / không nghe máy / hẹn gọi lại. Thao tác &ldquo;Nhận gọi&rdquo; và các
            mốc ghi chú (đã xử lý, nhắc nhở, ghi chú) không được tính vào xếp hạng.
          </p>
        </CardContent>
      </Card>

      {loadingSummary && !summary ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : summary && t ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Cuộc gọi thật" value={fmt(t.contactCalls)} hint="Gọi được / không nghe máy / hẹn gọi lại" />
            <StatCard title="Tổng số mốc" value={fmt(t.total)} hint="Gồm cả nhận việc và ghi chú" />
            <StatCard
              title="Nhân viên có gọi"
              value={`${fmt(t.activeStaff)}/${fmt(t.staffListed)}`}
              hint="Số người thực sự phát sinh cuộc gọi trong kỳ"
            />
            <StatCard
              title="Khách/tài xế đã gọi"
              value={fmt(t.distinctTargets)}
              hint="Đếm theo người, gọi 1 người nhiều lần chỉ tính 1"
            />
            <StatCard
              title="Sót gọi trước hoàn thành"
              value={missedBefore === null ? '—' : fmt(missedBefore)}
              hint="Chuyến đã đi xong mà chưa ai gọi xác nhận trước đó. Không vào hàng đợi được nữa — đây là chỗ duy nhất đếm chúng."
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Xếp hạng nhân viên</CardTitle>
              <CardDescription>
                Sắp theo số cuộc gọi thật. Nhân viên không gọi cuộc nào trong kỳ vẫn hiện ở cuối bảng.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Nhân viên</TableHead>
                    <TableHead className="text-right">Cuộc gọi thật</TableHead>
                    <TableHead className="text-right">Gọi được</TableHead>
                    <TableHead className="text-right">Không nghe</TableHead>
                    <TableHead className="text-right">Hẹn gọi lại</TableHead>
                    <TableHead className="text-right">Nhận gọi</TableHead>
                    <TableHead className="text-right">Người khác nhau</TableHead>
                    <TableHead className="text-right">Khách / Tài xế</TableHead>
                    <TableHead>Mốc đầu → cuối</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byStaff.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                        Không có hoạt động nào trong khoảng đã chọn.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.byStaff.map((s, i) => (
                      <TableRow key={s.adminUserId ?? `unknown-${i}`} className={s.contactCalls === 0 ? 'opacity-60' : ''}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">
                          {s.adminName || (s.adminUserId ? s.adminUserId.slice(0, 8) : 'Không xác định')}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{fmt(s.contactCalls)}</TableCell>
                        <TableCell className="text-right">{fmt(s.called)}</TableCell>
                        <TableCell className="text-right">{fmt(s.unreached)}</TableCell>
                        <TableCell className="text-right">{fmt(s.callback)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{fmt(s.claimed)}</TableCell>
                        <TableCell className="text-right">{fmt(s.distinctTargets)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {fmt(s.bookingEvents)} / {fmt(s.driverEvents)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {s.firstAt ? `${formatVnDateTime(s.firstAt)} → ${formatVnDateTime(s.lastAt)}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Theo ngày</CardTitle>
                <CardDescription>Số mốc và số cuộc gọi thật mỗi ngày (giờ VN).</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={summary.byDay}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="contactCalls" name="Cuộc gọi thật" stroke="#059669" strokeWidth={2} />
                    <Line type="monotone" dataKey="total" name="Tổng mốc" stroke="#94a3b8" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Theo khung giờ</CardTitle>
                <CardDescription>Nhân viên làm việc dồn vào giờ nào trong ngày (giờ VN).</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.byHour}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" interval={1} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="contactCalls" name="Cuộc gọi thật" fill="#059669" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Theo kết quả</CardTitle>
                <CardDescription>Bóc tách chất lượng, không chỉ số lượng.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gọi cho</TableHead>
                      <TableHead>Kết quả</TableHead>
                      <TableHead className="text-right">Số mốc</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.byOutcome.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                          Chưa có dữ liệu.
                        </TableCell>
                      </TableRow>
                    ) : (
                      summary.byOutcome.map((o) => (
                        <TableRow key={`${o.kind}-${o.outcome}`}>
                          <TableCell className="text-muted-foreground">{KIND_LABEL[o.kind]}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={outcomeBadgeClass(o.outcome)}>
                              {outcomeLabel(o.kind, o.outcome)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmt(o.total)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Theo lý do gọi</CardTitle>
                <CardDescription>
                  Chỉ có ở cuộc gọi check khách theo chuyến — mốc làm việc với tài xế không có trường lý do.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lý do</TableHead>
                      <TableHead className="text-right">Số cuộc</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.byReason.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="h-20 text-center text-muted-foreground">
                          Chưa có cuộc gọi nào ghi lý do.
                        </TableCell>
                      </TableRow>
                    ) : (
                      summary.byReason.map((r) => (
                        <TableRow key={r.reason}>
                          <TableCell>{r.reason}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(r.total)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Nhật ký cuộc gọi</CardTitle>
            <CardDescription>
              {fmt(feedMeta.total)} mốc trong khoảng đã chọn — mới nhất trước.
            </CardDescription>
          </div>
          {loadingFeed ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Lúc</TableHead>
                <TableHead>Nhân viên</TableHead>
                <TableHead>Gọi cho</TableHead>
                <TableHead>Kết quả</TableHead>
                <TableHead>Lý do</TableHead>
                <TableHead>Ghi chú</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    {loadingFeed ? 'Đang tải…' : 'Không có cuộc gọi nào khớp bộ lọc.'}
                  </TableCell>
                </TableRow>
              ) : (
                feed.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      <div className="font-medium">{VN_TIME.format(new Date(row.createdAt))}</div>
                      <div className="text-xs text-muted-foreground">{VN_DATE.format(new Date(row.createdAt))}</div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.byAdminName || (row.byAdminUserId ? row.byAdminUserId.slice(0, 8) : 'Không xác định')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className="mt-0.5 shrink-0">
                          {KIND_LABEL[row.kind]}
                        </Badge>
                        <TargetCell row={row} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={outcomeBadgeClass(row.outcome)}>
                        {outcomeLabel(row.kind, row.outcome)}
                      </Badge>
                      {row.phase === 'AFTER_COMPLETE' ? (
                        <div className="mt-1 text-xs text-muted-foreground">sau khi hoàn thành</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[180px] text-sm">{row.reason || '—'}</TableCell>
                    <TableCell className="max-w-[320px] whitespace-pre-wrap text-sm text-muted-foreground">
                      {row.note || '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-muted-foreground">
          <span>
            Trang {page} / {feedMeta.totalPages} · {fmt(feedMeta.total)} mốc
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || loadingFeed} onClick={() => setPage(1)}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1 || loadingFeed}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= feedMeta.totalPages || loadingFeed}
              onClick={() => setPage((p) => Math.min(feedMeta.totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= feedMeta.totalPages || loadingFeed}
              onClick={() => setPage(feedMeta.totalPages)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
