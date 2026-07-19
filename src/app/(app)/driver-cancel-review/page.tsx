'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, ShieldAlert, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getDriverCancelStats } from '@/lib/api';
import type { DriverCancelStat } from '@/lib/types';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';
import { formatVnDateTime } from '../leakage-review/leakage-labels';
import { rateBadgeClass, driverStatus } from './cancel-labels';
import { DriverDetailSheet } from './components/driver-detail-sheet';

const COL_COUNT = 7;
const PAGE_SIZE = 20;

/** Key-coupled, not index-coupled: reordering PRESETS must not desync the range
 *  from the highlighted chip (the exact bug `initialPreset` exists to prevent).
 *  Matches the backend's 30-day rolling window. */
const DEFAULT_PRESET = 'last30';
const defaultRange = () =>
  (PRESETS.find((p) => p.key === DEFAULT_PRESET) ?? PRESETS.find((p) => p.key === 'last7') ?? PRESETS[0]).range();

type LevelTab = 'all' | '100' | '50' | '30' | 'lt30';

const LEVEL_TAB_LABEL: Record<LevelTab, string> = {
  all: 'Tất cả',
  '100': '100%',
  '50': '50–99%',
  '30': '30–49%',
  lt30: '<30%',
};

function matchesLevel(pct: number, tab: LevelTab): boolean {
  switch (tab) {
    case '100':
      return pct >= 100;
    case '50':
      return pct >= 50 && pct < 100;
    case '30':
      return pct >= 30 && pct < 50;
    case 'lt30':
      return pct < 30;
    default:
      return true;
  }
}

export default function DriverCancelReviewPage() {
  const [range, setRange] = React.useState<DateRange>(defaultRange());
  const [rows, setRows] = React.useState<DriverCancelStat[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<DriverCancelStat | null>(null);
  const [search, setSearch] = React.useState('');
  const [levelTab, setLevelTab] = React.useState<LevelTab>('all');
  const [page, setPage] = React.useState(0);
  const { toast } = useToast();

  // The debounce cancels the pending timer, not an in-flight request. Without a
  // sequence guard, a slow earlier fetch can resolve last and overwrite the list
  // with data that contradicts the current filters.
  const reqIdRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await getDriverCancelStats(range.from, range.to);
      if (reqId !== reqIdRef.current) return; // superseded — drop the stale result
      setRows(data);
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return;
      toast({ variant: 'destructive', title: 'Không tải được danh sách tài xế', description: err.message });
    } finally {
      // Only the newest request may clear the spinner.
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [range.from, range.to, toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Search / tab / range đổi → về trang đầu, tránh trang hiện tại vượt quá
  // số trang mới của tập đã lọc.
  React.useEffect(() => {
    setPage(0);
  }, [search, levelTab, range.from, range.to]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      if (q) {
        const name = (s.fullName || '').toLowerCase();
        const phone = (s.phone || '').toLowerCase();
        if (!name.includes(q) && !phone.includes(q)) return false;
      }
      return matchesLevel(s.ratePct, levelTab);
    });
  }, [rows, search, levelTab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const paged = filtered.slice(pageClamped * PAGE_SIZE, (pageClamped + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tỉ lệ huỷ tài xế"
        description="Tài xế bị khách huỷ nhiều (nghi câu kéo khách ra ngoài). Đỏ >50% (tự khoá nếu bật AUTO), vàng 30–50% (theo dõi). Bấm vào một tài xế để xem chi tiết chuyến huỷ, lịch sử khoá và thao tác khoá/gỡ."
      />

      <Card className="p-4 text-sm text-muted-foreground">
        Tài xế huỷ nghi ngờ (khách huỷ 10 giây–5 phút sau khi tài nhận) bị tạm khoá 3 ngày; tái phạm khoá vĩnh viễn.
        Tỉ lệ khách huỷ ≥50% → tạm khoá 1 ngày; &gt;30% → theo dõi. Số ngày/ngưỡng cấu hình ở Cài đặt › Chống huỷ
        chuyến.
      </Card>

      <Card className="space-y-3 p-4">
        <FinanceFilter value={range} onChange={setRange} isLoading={loading} initialPreset={DEFAULT_PRESET} />
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={levelTab} onValueChange={(v) => setLevelTab(v as LevelTab)}>
            <TabsList className="flex-wrap h-auto">
              {(Object.keys(LEVEL_TAB_LABEL) as LevelTab[]).map((key) => (
                <TabsTrigger key={key} value={key}>
                  {LEVEL_TAB_LABEL[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên hoặc SĐT tài xế..."
              className="pl-8"
            />
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Tài xế</TableHead>
              <TableHead className="whitespace-nowrap">Chuyến giao</TableHead>
              <TableHead className="whitespace-nowrap">Khách huỷ</TableHead>
              <TableHead className="whitespace-nowrap">Tỉ lệ</TableHead>
              <TableHead className="whitespace-nowrap">Số lần vi phạm</TableHead>
              <TableHead className="whitespace-nowrap">Trạng thái</TableHead>
              <TableHead className="whitespace-nowrap">Cảnh báo gần nhất</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT} className="h-28 text-center text-muted-foreground">
                  <ShieldAlert className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  Không có tài xế nào khớp bộ lọc.
                </TableCell>
              </TableRow>
            ) : (
              paged.map((s) => {
                const status = driverStatus(s);
                return (
                  <TableRow key={s.driverEntityId} className="cursor-pointer" onClick={() => setSelected(s)}>
                    <TableCell className="whitespace-nowrap">
                      {s.fullName || 'Không tên'}
                      <div className="text-xs text-muted-foreground">{s.phone}</div>
                    </TableCell>
                    <TableCell>{s.assignedTrips}</TableCell>
                    <TableCell>{s.customerCancels}</TableCell>
                    <TableCell>
                      <Badge className={rateBadgeClass(s.ratePct)}>{s.ratePct}%</Badge>
                    </TableCell>
                    <TableCell>{s.cancelRuleAStrikes}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {s.depositForfeitFlagged && (
                          <Badge variant="outline" className="gap-1" title="Đã đánh cờ giữ cọc">
                            <Wallet className="h-3 w-3" />
                            Cờ cọc
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[16rem] text-sm">
                      <span className="break-words">{s.lastAlertReason || '—'}</span>
                      <div className="text-xs text-muted-foreground">{formatVnDateTime(s.lastAlertAt)}</div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {!loading && filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm text-muted-foreground">
            <span>
              Trang {pageClamped + 1}/{totalPages} · {filtered.length} tài
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pageClamped <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pageClamped >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </Card>

      <DriverDetailSheet
        stat={selected}
        range={range}
        onOpenChange={(open) => !open && setSelected(null)}
        onDone={load}
      />
    </div>
  );
}
