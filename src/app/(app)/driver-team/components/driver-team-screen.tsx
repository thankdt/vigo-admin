'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getTeamOwners,
  getTeamProvinceDrivers,
  getTeamProvinces,
  getTeamSubsidySummary,
  getTeamSummary,
  patchTeamMember,
} from '@/lib/api';
import type {
  DriverTeamDetail,
  DriverTeamStage,
  TeamDriverRow,
  TeamMemberRow,
  TeamOwner,
  TeamProvinceRow,
  TeamSummary,
} from '@/lib/types';
import {
  buildProvinceOptions,
  PROVINCE_BUCKET_NOTE_FALLBACK,
  provinceKeyOf,
  STAGE_ORDER,
  stageLabel,
  UNKNOWN_PROVINCE_KEY,
} from '@/lib/driver-team-labels';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FinanceFilter, PRESETS, type DateRange } from '../../finance/components/finance-filter';
import { ProvinceAccordion } from './province-accordion';
import { DriverTeamDrawer } from './driver-team-drawer';
import { TeamMembersTable } from './team-members-table';

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

const fmtVnd = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);

export type TeamFilters = {
  stage: string;
  ownerAdminUserId: string;
  q: string;
  /** ALL | 'none' (chưa xác định tỉnh) | mã tỉnh. Lọc client-side trên danh sách đã tải. */
  provinceCode: string;
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
    provinceCode: ALL,
    minTrips: '',
  });
  const [provinces, setProvinces] = React.useState<TeamProvinceRow[]>([]);
  const [unknown, setUnknown] = React.useState<TeamProvinceRow | null>(null);
  const [bucketNote, setBucketNote] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<TeamSummary | null>(null);
  const [owners, setOwners] = React.useState<TeamOwner[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [detailDriver, setDetailDriver] = React.useState<TeamDriverRow | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  // groups (tài xế đã tải theo từng nhóm tỉnh) và open SỐNG Ở ĐÂY: accordion, drawer
  // và hành động hàng loạt đều ghi vào cùng một chỗ, nếu không sẽ có hai bản trạng
  // thái lệch nhau.
  const [groups, setGroups] = React.useState<DriverGroups>({});
  const [open, setOpen] = React.useState<string[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getTeamProvinces({
        ...range,
        driverQ: filters.q || undefined,
      }),
      getTeamSummary(range),
    ])
      .then(([r, s]) => {
        if (cancelled) return;
        const list = r.provinces ?? [];
        setProvinces(list);
        setUnknown(r.unknown ?? null);
        setBucketNote(r.bucketNote ?? null);
        setSummary(s);
        // Đang tìm tài xế → tự bung ĐÚNG những tỉnh có người khớp. Đây là mảnh
        // khiến việc tìm theo tên dùng được: gõ một cái tên là thấy ngay người đó
        // chạy những tỉnh nào, không phải mở thủ công từng tỉnh một.
        if (filters.q) {
          setOpen(
            [...list, ...(r.unknown ? [r.unknown] : [])]
              .filter((x) => (x.matchedDriverCount ?? 0) > 0)
              .map(provinceKeyOf),
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
    // Nguồn phụ hỏng KHÔNG được làm sập cả màn.
    getTeamOwners()
      .then(setOwners)
      .catch(() => setOwners([]));
  }, []);

  // Danh mục tỉnh cho ô lọc "Tỉnh" và ô "Tỉnh được phân công" ở drawer: lấy luôn từ cấp 1 (backend trả
  // MỌI tỉnh, kể cả 0 chuyến) — khỏi gọi endpoint danh mục khác mà người chỉ có quyền driver-team sẽ
  // nhận 403. Sắp theo tên: thứ tự cấp 1 là theo số tài/số chuyến nên đổi theo khoảng ngày.
  const provinceOptions = React.useMemo(() => buildProvinceOptions(provinces), [provinces]);

  // Đội tài (tab phẳng) tải riêng, không chia state với `groups` (theo tỉnh) —
  // đổi tick này để báo TeamMembersTable tải lại sau khi lưu ở drawer, nếu không
  // bảng phẳng sẽ hiện stage/mức hoa hồng/người phụ trách CŨ tới khi đổi bộ lọc.
  const [memberRefreshTick, setMemberRefreshTick] = React.useState(0);

  // Hai thẻ "Doanh thu bỏ qua" / "Lỗ tiền mặt (bù HTX)" — TÁCH state riêng khỏi
  // effect provinces+summary ở trên (không cần tải lại toàn bộ tỉnh mỗi lần đổi %
  // hoa hồng), nhưng PHẢI tải lại khi `memberRefreshTick` đổi — nếu không, sau khi
  // sửa % ở ngăn kéo, hai thẻ vẫn hiện số cũ và người dùng tưởng chưa lưu được.
  const [subsidy, setSubsidy] = React.useState<{ forgone: number; cashLoss: number } | null>(
    null,
  );

  React.useEffect(() => {
    let cancelled = false;
    getTeamSubsidySummary(range)
      .then((s) => {
        if (!cancelled) setSubsidy(s);
      })
      .catch(() => {
        if (!cancelled) setSubsidy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [range, memberRefreshTick]);

  const handleSaved = React.useCallback(
    (driverId: string, team: DriverTeamDetail['team']) => {
      // Cùng một hàm với accordion — lưu ở drawer cũng phải lan sang mọi nhóm đang
      // mở, nếu không bảng phía sau drawer sẽ hiện trạng thái cũ.
      setGroups((g) => patchDriverAcrossGroups(g, driverId, team));
      setMemberRefreshTick((t) => t + 1);
    },
    [],
  );

  const handleOpenMember = React.useCallback((driverId: string, member: TeamMemberRow) => {
    // Tab Đội tài không có sẵn TeamDriverRow (shape khác TeamMemberRow — thiếu
    // tripsInProvince/isBanned/...) nhưng DriverTeamDrawer chỉ đọc fullName/phone từ
    // prop `driver` cho phần header, phần còn lại tự tải qua getTeamDriverDetail
    // ngay khi mở — nên chỉ cần điền đủ field bắt buộc, phần không có thì để mặc
    // định "chưa biết" thay vì bịa.
    setDetailDriver({
      driverId: member.driverId,
      fullName: member.fullName,
      phone: member.phone,
      transportCompanyName: null,
      tripsInProvince: 0,
      tripsAll: 0,
      shareOfProvince: 0,
      lastCompletedAt: member.lastCompletedAt,
      firstCompletedAt: null,
      isApproved: true,
      isBanned: false,
      suspendedUntil: null,
      team: null,
    });
  }, []);

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
   * Lọc tỉnh làm CLIENT-SIDE: cấp 1 trả về TẤT CẢ tỉnh trong một lần (~35 dòng,
   * không phân trang), nên lọc tại chỗ vừa khớp chính xác theo mã tỉnh vừa không
   * phải gọi lại API mỗi lần đổi lựa chọn.
   */
  const visibleProvinces = React.useMemo(() => {
    if (filters.provinceCode === ALL) return provinces;
    if (filters.provinceCode === UNKNOWN_PROVINCE_KEY) return [];
    return provinces.filter((p) => p.provinceCode === filters.provinceCode);
  }, [provinces, filters.provinceCode]);

  const visibleUnknown =
    filters.provinceCode === ALL || filters.provinceCode === UNKNOWN_PROVINCE_KEY ? unknown : null;

  const allProvinceRows = React.useMemo(
    () => (visibleUnknown ? [...visibleProvinces, visibleUnknown] : visibleProvinces),
    [visibleProvinces, visibleUnknown],
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const items: { provinceName: string; driver: TeamDriverRow }[] = [];

      if (selected.size > 0) {
        // Có tick → xuất ĐÚNG dòng đã tick, không gọi thêm API.
        for (const [key, rows] of Object.entries(groups)) {
          const provinceName =
            allProvinceRows.find((r) => provinceKeyOf(r) === key)?.provinceName ?? key;
          for (const d of rows) {
            if (selected.has(d.driverId)) items.push({ provinceName, driver: d });
          }
        }
      } else {
        for (const r of allProvinceRows) {
          const key = provinceKeyOf(r);
          let page = 1;
          for (;;) {
            // PHẢI truyền nguyên bộ lọc đang áp. Xuất toàn bộ mọi tỉnh trong khi
            // người dùng đang lọc "Trong team, phụ trách = A" là sai nguy hiểm: họ
            // nhận file của tất cả mọi người, bị cắt ngẫu nhiên ở tỉnh thứ n, kèm
            // cảnh báo cắt dòng càng làm họ tin file đúng.
            const res = await getTeamProvinceDrivers(key, {
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
            items.push(...res.data.map((d) => ({ provinceName: r.provinceName, driver: d })));
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

      {/*
        HAI thẻ TÁCH BẠCH (spec §8) — cố ý KHÔNG gộp làm một, hai con số lệch nhau
        trên cùng một chuyến (vd 200.000 vs 50.000): "Doanh thu bỏ qua" là phần VIGO
        chủ động giảm cho tài (kế toán), "Lỗ tiền mặt" là tiền VIGO thực chi ra bù
        HTX (dòng tiền thật). Gộp hoặc đặt nhãn mơ hồ là phản tác dụng vì CEO dùng
        đúng hai số này để quyết định.
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TeamStatCard
          title="Doanh thu bỏ qua"
          value={subsidy ? fmtVnd(subsidy.forgone) : undefined}
        />
        <TeamStatCard
          title="Lỗ tiền mặt (bù HTX)"
          value={subsidy ? fmtVnd(subsidy.cashLoss) : undefined}
        />
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        &quot;Doanh thu bỏ qua&quot; = phần hoa hồng VIGO chủ động giảm cho tài so với mức chuẩn.
        &quot;Lỗ tiền mặt (bù HTX)&quot; = tiền mặt VIGO thực sự phải bỏ thêm để trả đủ cho HTX khi
        mức riêng thấp hơn phần HTX ăn — hai số KHÁC NHAU, đừng gộp. Cả hai chỉ đếm chuyến
        <strong> đã hoàn thành</strong> trong khoảng ngày đang chọn ở trên.
      </p>

      {/*
        Hai tab dùng CHUNG khoảng ngày ở trên (FinanceFilter nằm ngoài Tabs) — xem
        constraint #3 task-16: khoảng ngày áp cho cả hai, nhưng tab "Đội tài" chỉ
        đổi cột "chuyến trong kỳ", không lọc bớt người (ghi rõ trong chính tab đó).
      */}
      <Tabs defaultValue="provinces" className="space-y-6">
        <TabsList>
          <TabsTrigger value="provinces">Theo tỉnh</TabsTrigger>
          <TabsTrigger value="members">Đội tài</TabsTrigger>
        </TabsList>

        <TabsContent value="provinces" className="space-y-6">
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
                setOpen(allProvinceRows.map(provinceKeyOf))
              }
            />
          </div>

          <p className="-mt-3 text-xs text-muted-foreground">
            Bấm một thẻ để lọc xuống tầng đó. Thẻ &quot;Từ chối / Loại&quot; mở nhóm Từ chối.
            &quot;Cần gọi lại hôm nay&quot; mở mọi tỉnh và không phụ thuộc khoảng ngày đang chọn.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Tỉnh</Label>
              <Select
                value={filters.provinceCode}
                onValueChange={(v) => setFilters((f) => ({ ...f, provinceCode: v }))}
              >
                <SelectTrigger className="w-60">
                  <SelectValue placeholder="Mọi tỉnh" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Mọi tỉnh</SelectItem>
                  {provinceOptions.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name}
                    </SelectItem>
                  ))}
                  {unknown ? (
                    <SelectItem value={UNKNOWN_PROVINCE_KEY}>{unknown.provinceName}</SelectItem>
                  ) : null}
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
              Đã tự mở những tỉnh có tài xế khớp — mỗi tỉnh gắn nhãn số tài khớp. Muốn lọc
              bớt tỉnh thì dùng ô &quot;Tỉnh&quot;.
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
            <ProvinceAccordion
              provinces={visibleProvinces}
              unknown={visibleUnknown}
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

          {/* Luật đếm: chuyến X↔Y nằm ở CẢ X và Y nên cộng các dòng lớn hơn tổng chuyến —
              nói thẳng điều này kẻo người đọc cộng dồn rồi tưởng số sai. */}
          <p className="text-xs text-muted-foreground">
            {bucketNote ?? PROVINCE_BUCKET_NOTE_FALLBACK}
          </p>
        </TabsContent>

        <TabsContent value="members">
          <TeamMembersTable
            range={range}
            owners={owners}
            onOpenDriver={handleOpenMember}
            refreshKey={memberRefreshTick}
          />
        </TabsContent>
      </Tabs>

      <DriverTeamDrawer
        driver={detailDriver}
        range={range}
        owners={owners}
        provinceOptions={provinceOptions}
        onClose={() => setDetailDriver(null)}
        onSaved={handleSaved}
      />
    </div>
  );
}
