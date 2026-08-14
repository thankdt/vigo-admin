'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getRoutes,
  getTeamOwners,
  getTeamRouteDrivers,
  getTeamRoutes,
  getTeamSummary,
  patchTeamMember,
} from '@/lib/api';
import type {
  DriverTeamDetail,
  DriverTeamStage,
  TeamDriverRow,
  TeamOwner,
  TeamRouteRow,
  TeamSummary,
} from '@/lib/types';
import { STAGE_ORDER, stageLabel } from '@/lib/driver-team-labels';
import { patchDriverAcrossGroups, type DriverGroups } from '@/lib/driver-team-sync';
import { applyBulk, type BulkBody } from '@/lib/driver-team-bulk';
import { buildExportRows, EXPORT_HEADER } from '@/lib/driver-team-export';
import { downloadXlsx } from '@/lib/csv';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FinanceFilter, PRESETS, type DateRange } from '../../finance/components/finance-filter';
import { RouteAccordion } from './route-accordion';
import { DriverTeamDrawer } from './driver-team-drawer';

// Preset mặc định gắn theo KEY chứ không theo index — chèn preset vào giữa mảng sẽ
// không âm thầm đổi khoảng ngày mặc định của trang.
const DEFAULT_PRESET = PRESETS.find((p) => p.key === 'thisYear') ?? PRESETS[0];
const ALL = '__all__';
/**
 * "Chưa liên hệ" KHÔNG phải một stage trong DB — tài chưa có row pipeline thì không
 * có stage nào cả (spec §4.1). Sentinel riêng để phân biệt với "mọi trạng thái".
 */
const NOT_CONTACTED = '__not_contacted__';
const EXPORT_CAP = 1000;

export type TeamFilters = {
  stage: string;
  ownerAdminUserId: string;
  q: string;
  /** ALL | 'none' | id tuyến dạng chuỗi. Lọc client-side trên danh sách đã tải. */
  routeId: string;
  minTrips: string;
};

/**
 * MỘT component cho cả 7 thẻ số — trước đây có hai loại (một loại kèm dòng chú thích,
 * một loại không) nên thẻ cao thẻ thấp so le nhau.
 *
 * `h-full` ở CẢ nút bọc lẫn Card: ô lưới vốn đã stretch, nhưng nút bọc không giãn thì
 * Card bên trong co lại theo nội dung và lại lệch chiều cao.
 */
function TeamStatCard({
  title,
  value,
  active,
  onClick,
}: {
  title: string;
  value: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const card = (
    <Card
      className={`flex h-full flex-col justify-between ${
        active ? 'border-primary ring-1 ring-primary' : ''
      } ${onClick ? 'transition-colors hover:border-primary/60' : ''}`}
    >
      <CardHeader className="gap-1 pb-3">
        <CardDescription className="text-xs leading-tight">{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value ?? '—'}</CardTitle>
      </CardHeader>
    </Card>
  );

  if (!onClick) return <div className="h-full">{card}</div>;
  return (
    <button type="button" className="h-full text-left" onClick={onClick}>
      {card}
    </button>
  );
}

export function DriverTeamScreen() {
  const { toast } = useToast();
  const [range, setRange] = React.useState<DateRange>(DEFAULT_PRESET.range());
  const [filters, setFilters] = React.useState<TeamFilters>({
    stage: ALL,
    ownerAdminUserId: ALL,
    q: '',
    routeId: ALL,
    minTrips: '',
  });
  const [routes, setRoutes] = React.useState<TeamRouteRow[]>([]);
  const [unassigned, setUnassigned] = React.useState<TeamRouteRow | null>(null);
  const [summary, setSummary] = React.useState<TeamSummary | null>(null);
  const [owners, setOwners] = React.useState<TeamOwner[]>([]);
  const [allRoutes, setAllRoutes] = React.useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [detailDriver, setDetailDriver] = React.useState<TeamDriverRow | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  // groups (tài xế đã tải theo từng nhóm tuyến) và open SỐNG Ở ĐÂY: accordion, drawer
  // và hành động hàng loạt đều ghi vào cùng một chỗ, nếu không sẽ có hai bản trạng
  // thái lệch nhau.
  const [groups, setGroups] = React.useState<DriverGroups>({});
  const [open, setOpen] = React.useState<string[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getTeamRoutes({
        ...range,
        driverQ: filters.q || undefined,
      }),
      getTeamSummary(range),
    ])
      .then(([r, s]) => {
        if (cancelled) return;
        const list = r.routes ?? [];
        setRoutes(list);
        setUnassigned(r.unassigned ?? null);
        setSummary(s);
        // Đang tìm tài xế → tự bung ĐÚNG những tuyến có người khớp. Đây là mảnh
        // khiến việc tìm theo tên dùng được: gõ một cái tên là thấy ngay người đó
        // chạy những tuyến nào, không phải mở thủ công từng tuyến một.
        if (filters.q) {
          setOpen(
            list
              .filter((x) => (x.matchedDriverCount ?? 0) > 0)
              .map((x) => (x.routeId === null ? 'none' : String(x.routeId))),
          );
        }
      })
      .catch((e) =>
        toast({
          variant: 'destructive',
          title: 'Không tải được dữ liệu',
          description: String(e?.message ?? e),
        }),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, filters.q, toast]);

  React.useEffect(() => {
    // Hai nguồn phụ hỏng KHÔNG được làm sập cả màn.
    getTeamOwners()
      .then(setOwners)
      .catch(() => setOwners([]));
    getRoutes()
      .then((rs) => setAllRoutes(rs.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setAllRoutes([]));
  }, []);

  const handleSaved = React.useCallback(
    (driverId: string, team: DriverTeamDetail['team']) => {
      // Cùng một hàm với accordion — lưu ở drawer cũng phải lan sang mọi nhóm đang
      // mở, nếu không bảng phía sau drawer sẽ hiện trạng thái cũ.
      setGroups((g) => patchDriverAcrossGroups(g, driverId, team));
    },
    [],
  );

  const toggleSelect = React.useCallback((driverId: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(driverId)) n.delete(driverId);
      else n.add(driverId);
      return n;
    });
  }, []);

  const runBulk = async (body: BulkBody) => {
    const res = await applyBulk([...selected], body, patchTeamMember);

    // Dùng team backend trả về. KHÔNG lọc theo row.team — tài "Tiềm năng" chưa có
    // team chính là nhóm hay dùng thao tác này nhất.
    setGroups((g) => {
      let next = g;
      for (const { driverId, team } of res.ok) {
        next = patchDriverAcrossGroups(next, driverId, team);
      }
      return next;
    });

    if (res.failed.length) {
      toast({
        variant: 'destructive',
        title: `${res.failed.length} dòng lỗi`,
        description: res.failed.map((f) => `${f.driverId}: ${f.message}`).join('; '),
      });
    }
    if (res.skipped.length) {
      toast({
        title: 'Chỉ xử lý 50 dòng mỗi lượt',
        description: `Còn ${res.skipped.length} dòng chưa xử lý — chọn lại rồi chạy tiếp.`,
      });
    }
    if (res.ok.length && !res.failed.length && !res.skipped.length) {
      toast({ title: `Đã cập nhật ${res.ok.length} tài xế` });
    }
    setSelected(new Set());
  };

  /**
   * Lọc tuyến làm CLIENT-SIDE: cấp 1 trả về TẤT CẢ tuyến trong một lần (~27 dòng,
   * không phân trang), nên lọc tại chỗ vừa khớp chính xác theo routeId vừa không
   * phải gọi lại API mỗi lần đổi lựa chọn.
   */
  const visibleRoutes = React.useMemo(() => {
    if (filters.routeId === ALL) return routes;
    if (filters.routeId === 'none') return [];
    return routes.filter((r) => String(r.routeId) === filters.routeId);
  }, [routes, filters.routeId]);

  const visibleUnassigned =
    filters.routeId === ALL || filters.routeId === 'none' ? unassigned : null;

  const allRouteRows = React.useMemo(
    () => (visibleUnassigned ? [...visibleRoutes, visibleUnassigned] : visibleRoutes),
    [visibleRoutes, visibleUnassigned],
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const items: { routeName: string; driver: TeamDriverRow }[] = [];

      if (selected.size > 0) {
        // Có tick → xuất ĐÚNG dòng đã tick, không gọi thêm API.
        for (const [key, rows] of Object.entries(groups)) {
          const routeName =
            allRouteRows.find((r) => (r.routeId === null ? 'none' : String(r.routeId)) === key)
              ?.routeName ?? key;
          for (const d of rows) {
            if (selected.has(d.driverId)) items.push({ routeName, driver: d });
          }
        }
      } else {
        for (const r of allRouteRows) {
          const key = r.routeId === null ? ('none' as const) : r.routeId;
          let page = 1;
          for (;;) {
            // PHẢI truyền nguyên bộ lọc đang áp. Xuất toàn bộ mọi tuyến trong khi
            // người dùng đang lọc "Trong team, phụ trách = A" là sai nguy hiểm: họ
            // nhận file của tất cả mọi người, bị cắt ngẫu nhiên ở tuyến thứ n, kèm
            // cảnh báo cắt dòng càng làm họ tin file đúng.
            const res = await getTeamRouteDrivers(key, {
              from: range.from,
              to: range.to,
              stage:
                filters.stage === ALL
                  ? undefined
                  : filters.stage === NOT_CONTACTED
                    ? 'none'
                    : filters.stage,
              ownerAdminUserId:
                filters.ownerAdminUserId === ALL ? undefined : filters.ownerAdminUserId,
              q: filters.q || undefined,
              minTrips: filters.minTrips ? Number(filters.minTrips) : undefined,
              page,
              limit: 200,
            });
            items.push(...res.data.map((d) => ({ routeName: r.routeName, driver: d })));
            if (
              page >= res.meta.totalPages ||
              res.data.length === 0 ||
              items.length >= EXPORT_CAP
            ) {
              break;
            }
            page += 1;
          }
          if (items.length >= EXPORT_CAP) break;
        }
      }

      if (items.length === 0) {
        toast({ title: 'Không có dòng nào để xuất' });
        return;
      }

      const { rows, truncated } = buildExportRows(items, EXPORT_CAP);
      const stamp = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
      await downloadXlsx(
        `doi-tai-chuyen-nghiep_${stamp}.xlsx`,
        [...EXPORT_HEADER],
        rows,
        'Đội tài',
      );
      if (truncated > 0) {
        toast({
          title: 'File đã bị cắt bớt',
          description: `Chỉ xuất ${EXPORT_CAP} dòng đầu, bỏ qua ${truncated} dòng. Thu hẹp khoảng ngày hoặc lọc thêm rồi xuất lại.`,
        });
      }
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Xuất file thất bại',
        description: String(e?.message ?? e),
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <FinanceFilter value={range} onChange={setRange} isLoading={loading} initialPreset="thisYear" />

      {/* Bấm một tầng là lọc luôn xuống tầng đó — thẻ ở đây là lối vào việc cần làm,
          không phải số để ngắm. Chú thích gom xuống MỘT dòng dưới hàng thay vì rải trên
          từng thẻ, để 7 thẻ cùng chiều cao. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <TeamStatCard
          title="Chạy thành công"
          value={summary?.driversWithCompletedTrips ?? '—'}
        />
        <TeamStatCard
          title="Chưa liên hệ"
          value={summary?.notContactedDrivers}
          active={filters.stage === NOT_CONTACTED}
          onClick={() => setFilters((f) => ({ ...f, stage: NOT_CONTACTED }))}
        />
        <TeamStatCard
          title="Đã liên hệ"
          value={summary?.contactedDrivers}
          active={filters.stage === 'CONTACTED'}
          onClick={() => setFilters((f) => ({ ...f, stage: 'CONTACTED' }))}
        />
        <TeamStatCard
          title="Đã mời"
          value={summary?.invitedDrivers}
          active={filters.stage === 'INVITED'}
          onClick={() => setFilters((f) => ({ ...f, stage: 'INVITED' }))}
        />
        <TeamStatCard
          title="Trong team"
          value={summary?.joinedDrivers}
          active={filters.stage === 'JOINED'}
          onClick={() => setFilters((f) => ({ ...f, stage: 'JOINED' }))}
        />
        <TeamStatCard
          title="Từ chối / Loại"
          value={summary ? summary.declinedDrivers + summary.droppedDrivers : undefined}
          active={filters.stage === 'DECLINED'}
          onClick={() => setFilters((f) => ({ ...f, stage: 'DECLINED' }))}
        />
        <TeamStatCard
          title="Cần gọi lại hôm nay"
          value={summary?.followUpDueToday ?? '—'}
          onClick={() =>
            setOpen(allRouteRows.map((r) => (r.routeId === null ? 'none' : String(r.routeId))))
          }
        />
      </div>

      <p className="-mt-3 text-xs text-muted-foreground">
        Bấm một thẻ để lọc xuống tầng đó. Thẻ &quot;Từ chối / Loại&quot; mở nhóm Từ chối.
        &quot;Cần gọi lại hôm nay&quot; mở mọi tuyến và không phụ thuộc khoảng ngày đang chọn.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Tuyến</Label>
          <Select
            value={filters.routeId}
            onValueChange={(v) => setFilters((f) => ({ ...f, routeId: v }))}
          >
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Mọi tuyến" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi tuyến</SelectItem>
              {routes.map((r) => (
                <SelectItem key={String(r.routeId)} value={String(r.routeId)}>
                  {r.routeName}
                </SelectItem>
              ))}
              {unassigned ? <SelectItem value="none">Không gắn tuyến</SelectItem> : null}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Tài xế</Label>
          <Input
            className="w-56"
            placeholder="Tên hoặc SĐT"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Trạng thái</Label>
          <Select
            value={filters.stage}
            onValueChange={(v) => setFilters((f) => ({ ...f, stage: v }))}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
              <SelectItem value={NOT_CONTACTED}>Chưa liên hệ</SelectItem>
              {STAGE_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {stageLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Người phụ trách</Label>
          <Select
            value={filters.ownerAdminUserId}
            onValueChange={(v) => setFilters((f) => ({ ...f, ownerAdminUserId: v }))}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Người phụ trách" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi người phụ trách</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.fullName ?? o.phone ?? o.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Chuyến tối thiểu</Label>
          <Input
            className="w-36"
            type="number"
            min={0}
            placeholder="vd 5"
            value={filters.minTrips}
            onChange={(e) => setFilters((f) => ({ ...f, minTrips: e.target.value }))}
          />
        </div>
        <Button variant="outline" onClick={() => void handleExport()} disabled={exporting}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {selected.size > 0 ? `Xuất ${selected.size} dòng đã chọn` : 'Xuất Excel'}
        </Button>
      </div>

      {filters.q ? (
        <p className="text-xs text-muted-foreground">
          Đã tự mở những tuyến có tài xế khớp — mỗi tuyến gắn nhãn số tài khớp. Muốn lọc
          bớt tuyến thì dùng ô &quot;Tên tuyến&quot;.
        </p>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3">
          <span className="text-sm font-medium">Đã chọn {selected.size} tài xế</span>
          <Select onValueChange={(v) => void runBulk({ stage: v as DriverTeamStage })}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="Đổi trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {STAGE_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {stageLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(v) => void runBulk({ ownerAdminUserId: v })}>
            <SelectTrigger className="h-8 w-52">
              <SelectValue placeholder="Gán người phụ trách" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.fullName ?? o.phone ?? o.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <RouteAccordion
          routes={visibleRoutes}
          unassigned={visibleUnassigned}
          range={range}
          filters={filters}
          allValue={ALL}
          notContactedValue={NOT_CONTACTED}
          groups={groups}
          setGroups={setGroups}
          open={open}
          setOpen={setOpen}
          selected={selected}
          onToggleSelect={toggleSelect}
          onSelectDriver={setDetailDriver}
        />
      )}

      <DriverTeamDrawer
        driver={detailDriver}
        range={range}
        owners={owners}
        allRoutes={allRoutes}
        onClose={() => setDetailDriver(null)}
        onSaved={handleSaved}
      />
    </div>
  );
}
