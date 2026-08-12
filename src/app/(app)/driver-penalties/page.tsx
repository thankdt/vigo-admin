'use client';

import * as React from 'react';
import { Gavel, Loader2, RotateCcw, Search } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  getPenaltyQueue,
  listPenalties,
  parseApiError,
  reversePenalty,
  type DriverPenaltyRow,
  type PenaltyQueueFlag,
  type PenaltyQueueRow,
} from '@/lib/api';
import { FinanceFilter, PRESETS, type DateRange } from '../finance/components/finance-filter';
import { formatVnDateTime } from '../leakage-review/leakage-labels';
import { PenaltyDialog } from './components/penalty-dialog';
import {
  REASON_LABEL,
  SOURCE_LABEL,
  cancelAlertSignal,
  cancelledByLabel,
  formatVnd,
  leakageSignal,
  penaltyStatusBadge,
} from './penalty-labels';

const PAGE_SIZE = 20;
const QUEUE_COLS = 8;
const HISTORY_COLS = 8;

/** Key-coupled, không index-coupled: đổi thứ tự PRESETS không được làm lệch khoảng ngày. */
const DEFAULT_PRESET = 'last30';
const defaultRange = () =>
  (PRESETS.find((p) => p.key === DEFAULT_PRESET) ?? PRESETS[0]).range();

type MainTab = 'queue' | 'history';

const FLAG_LABEL: Record<PenaltyQueueFlag, string> = {
  all: 'Tất cả',
  leakage: 'Nghi rò rỉ',
  cancelAlert: 'Có cảnh báo huỷ',
  unpenalized: 'Chưa phạt',
  penalized: 'Đã phạt',
};

export default function DriverPenaltiesPage() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState<MainTab>('queue');
  const [range, setRange] = React.useState<DateRange>(defaultRange());
  const [search, setSearch] = React.useState('');
  const [flag, setFlag] = React.useState<PenaltyQueueFlag>('all');
  const [page, setPage] = React.useState(1);

  const [queueRows, setQueueRows] = React.useState<PenaltyQueueRow[]>([]);
  const [historyRows, setHistoryRows] = React.useState<DriverPenaltyRow[]>([]);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totals, setTotals] = React.useState({ count: 0, amount: 0 });
  const [loading, setLoading] = React.useState(true);
  const [reversing, setReversing] = React.useState<string | null>(null);
  const [penaltyTarget, setPenaltyTarget] = React.useState<string | null>(null);

  // Debounce huỷ được timer nhưng KHÔNG huỷ request đang bay. Không có seq guard thì
  // một request cũ về sau sẽ ghi đè danh sách bằng dữ liệu trái với bộ lọc hiện tại.
  const reqIdRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      if (tab === 'queue') {
        const res = await getPenaltyQueue({
          from: range.from,
          to: range.to,
          flag,
          q: search.trim() || undefined,
          page,
          limit: PAGE_SIZE,
        });
        if (reqId !== reqIdRef.current) return;
        setQueueRows(res.data);
        setTotalPages(res.meta.totalPages);
      } else {
        const res = await listPenalties({
          from: range.from,
          to: range.to,
          q: search.trim() || undefined,
          page,
          limit: PAGE_SIZE,
        });
        if (reqId !== reqIdRef.current) return;
        setHistoryRows(res.data);
        setTotalPages(res.meta.totalPages);
        setTotals(res.meta.totals);
      }
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return;
      // fetchWithAuth ném Error(JSON envelope) — parseApiError rút ra câu người đọc được.
      toast({
        variant: 'destructive',
        title: 'Không tải được dữ liệu',
        description: err?.message ? parseApiError(err.message) : 'Vui lòng thử lại.',
      });
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [tab, range.from, range.to, flag, search, page, toast]);

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Đổi bộ lọc → về trang đầu, tránh đứng ở trang vượt quá tập mới.
  React.useEffect(() => {
    setPage(1);
  }, [tab, flag, search, range.from, range.to]);

  const doReverse = async (row: DriverPenaltyRow) => {
    const note = window.prompt(
      `Huỷ vụ phạt ${formatVnd(row.amount)} của ${row.driverName || 'tài xế'}?\nTiền sẽ được hoàn về đúng ví đã bị trừ.\n\nLý do huỷ (tuỳ chọn):`,
    );
    // prompt trả null khi bấm Huỷ — khác hẳn chuỗi rỗng (bấm OK mà không gõ gì).
    if (note === null) return;
    setReversing(row.id);
    try {
      // Backend @MaxLength(500) — cắt tại chỗ thay vì đi một vòng để nhận 400.
      await reversePenalty(row.id, note.trim().slice(0, 500) || undefined);
      toast({ title: 'Đã huỷ phạt', description: `Đã hoàn ${formatVnd(row.amount)} về ví tài xế.` });
      load();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Huỷ phạt thất bại',
        description: err?.message ? parseApiError(err.message) : 'Vui lòng thử lại.',
      });
    } finally {
      setReversing(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phạt vi phạm tài xế"
        description="Sau khi xác minh tài xế vi phạm, thu lại hoa hồng của chuyến đã huỷ thay vì để hệ thống hoàn về ví tài xế. Số tiền do hệ thống tính theo hoa hồng thực tế đã trừ của chuyến."
      />

      <Card className="p-4 text-sm text-muted-foreground">
        Tiền phạt được thu lại đúng ví đã nhận hoàn hoa hồng: hoàn vào ví nào thì trừ ví đó.
        Ví thưởng không bị đẩy xuống âm — phần thiếu thành nợ ví ký quỹ, và tài xế phải nạp bù
        mới nhận được chuyến. Phạt nhầm thì vào tab “Lịch sử phạt” bấm huỷ, tiền hoàn về đúng ví đã trừ.
      </Card>

      <Card className="space-y-3 p-4">
        <FinanceFilter
          value={range}
          onChange={setRange}
          isLoading={loading}
          initialPreset={DEFAULT_PRESET}
        />
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as MainTab)}>
            <TabsList>
              <TabsTrigger value="queue">Cần xử lý</TabsTrigger>
              <TabsTrigger value="history">Lịch sử phạt</TabsTrigger>
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

        {tab === 'queue' && (
          <Tabs value={flag} onValueChange={(v) => setFlag(v as PenaltyQueueFlag)}>
            <TabsList className="h-auto flex-wrap">
              {(Object.keys(FLAG_LABEL) as PenaltyQueueFlag[]).map((k) => (
                <TabsTrigger key={k} value={k}>
                  {FLAG_LABEL[k]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {tab === 'history' && (
          <p className="text-sm text-muted-foreground">
            Trong khoảng đã chọn: <strong>{totals.count}</strong> vụ phạt còn hiệu lực, tổng đã thu{' '}
            <strong>{formatVnd(totals.amount)}</strong>.
          </p>
        )}
      </Card>

      <Card>
        {tab === 'queue' ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Thời điểm huỷ</TableHead>
                <TableHead>Chuyến</TableHead>
                <TableHead>Tài xế</TableHead>
                <TableHead className="whitespace-nowrap">Ai huỷ</TableHead>
                <TableHead>Dấu hiệu</TableHead>
                <TableHead className="whitespace-nowrap text-right">Thu được</TableHead>
                <TableHead className="whitespace-nowrap">Trạng thái</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={QUEUE_COLS} className="py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && queueRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={QUEUE_COLS} className="py-8 text-center text-muted-foreground">
                    Không có chuyến huỷ nào cần soát trong khoảng ngày này.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                queueRows.map((r) => {
                  const status = penaltyStatusBadge(r.penaltyStatus);
                  const leakage = leakageSignal(r.leakageVerdict);
                  const alert = cancelAlertSignal({
                    rule: r.cancelAlertRule,
                    action: r.cancelAlertAction,
                    ratePct: r.cancelAlertRatePct,
                    shadow: r.cancelAlertShadow,
                    reason: r.cancelAlertReason,
                  });
                  return (
                    <TableRow key={r.bookingId}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatVnDateTime(r.cancelledAt)}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-sm">
                        <p className="font-mono text-xs text-muted-foreground">
                          {r.bookingId.slice(0, 8)}
                        </p>
                        <p className="truncate" title={`${r.pickupAddress || '—'} → ${r.dropoffAddress || '—'}`}>
                          {r.pickupAddress || '—'} → {r.dropoffAddress || '—'}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">
                        <p>{r.driverName || '—'}</p>
                        <p className="text-xs text-muted-foreground">{r.driverPhone || ''}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <p>{cancelledByLabel(r.cancelledByRole)}</p>
                        {r.cancelReason && (
                          <p
                            className="max-w-[160px] truncate text-xs text-muted-foreground"
                            title={r.cancelReason}
                          >
                            {r.cancelReason}
                          </p>
                        )}
                      </TableCell>
                      {/* Nhãn nói THẲNG hệ thống thấy gì; rê chuột ra tooltip giải
                          thích cơ sở. Người soát dựa vào ô này để quyết định trừ tiền
                          nên không được để mã kỹ thuật (LOW / rule A) lọt ra. */}
                      <TableCell className="max-w-[240px] space-y-1">
                        {leakage && (
                          <Badge className={leakage.className} title={leakage.hint}>
                            {leakage.label}
                          </Badge>
                        )}
                        {alert && (
                          <div>
                            <Badge className={alert.className} title={alert.hint}>
                              {alert.label}
                            </Badge>
                            {alert.note && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{alert.note}</p>
                            )}
                          </div>
                        )}
                        {!leakage && !alert && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* Hàng đã phạt hiện số ĐÃ THU; hàng chưa phạt hiện số CÒN thu được.
                          Hiện collectibleAmount cho hàng đã phạt sẽ bị đọc nhầm thành
                          "còn thu thêm được chừng này". */}
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {r.penaltyStatus === 'ACTIVE'
                          ? formatVnd(r.penaltyAmount ?? r.collectibleAmount)
                          : formatVnd(r.collectibleAmount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className={status.className}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={r.penaltyStatus === 'ACTIVE' || r.collectibleAmount <= 0}
                          title={
                            r.penaltyStatus === 'ACTIVE'
                              ? 'Chuyến này đã bị phạt rồi'
                              : r.collectibleAmount <= 0
                                ? 'Chuyến này không có hoa hồng để thu lại'
                                : undefined
                          }
                          onClick={() => setPenaltyTarget(r.bookingId)}
                        >
                          <Gavel className="mr-1.5 h-3.5 w-3.5" /> Phạt
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Ngày phạt</TableHead>
                <TableHead>Tài xế</TableHead>
                <TableHead className="whitespace-nowrap">Chuyến</TableHead>
                <TableHead className="whitespace-nowrap text-right">Số tiền</TableHead>
                <TableHead>Lý do</TableHead>
                <TableHead className="whitespace-nowrap">Người phạt</TableHead>
                <TableHead className="whitespace-nowrap">Trạng thái</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={HISTORY_COLS} className="py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              )}
              {!loading && historyRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={HISTORY_COLS}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Chưa có vụ phạt nào trong khoảng ngày này.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                historyRows.map((r) => {
                  const status = penaltyStatusBadge(r.status);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatVnDateTime(r.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <p>{r.driverName || '—'}</p>
                        <p className="text-xs text-muted-foreground">{r.driverPhone || ''}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {r.bookingId.slice(0, 8)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        <p>{formatVnd(r.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          thưởng {formatVnd(r.fromMain)} · ký quỹ {formatVnd(r.fromDeposit)}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-[200px] text-sm">
                        <p>{REASON_LABEL[r.reasonCode]}</p>
                        {r.note && (
                          <p className="truncate text-xs text-muted-foreground" title={r.note}>
                            {r.note}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <p>{r.createdByName || '—'}</p>
                        <p className="text-xs text-muted-foreground">{SOURCE_LABEL[r.source]}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge className={status.className}>{status.label}</Badge>
                        {r.status === 'REVERSED' && r.reversedByName && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            bởi {r.reversedByName}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {r.status === 'ACTIVE' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reversing === r.id}
                            onClick={() => doReverse(r)}
                          >
                            {reversing === r.id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Huỷ phạt
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">
          Trang {page}/{totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Trước
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Sau
        </Button>
      </div>

      <PenaltyDialog
        bookingId={penaltyTarget}
        open={!!penaltyTarget}
        source="PENALTY_PAGE"
        onOpenChange={(o) => { if (!o) setPenaltyTarget(null); }}
        onDone={load}
      />
    </div>
  );
}
