'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getTeamRouteDrivers, patchTeamMember } from '@/lib/api';
import type { DriverTeamStage, TeamDriverRow, TeamRouteRow } from '@/lib/types';
import {
  driverWarning,
  formatShare,
  isFollowUpOverdue,
  routeNeedsDrivers,
  stageBadgeClass,
  stageLabel,
  STAGE_ORDER,
  vnDay,
} from '@/lib/driver-team-labels';
import { patchDriverAcrossGroups, type DriverGroups } from '@/lib/driver-team-sync';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DateRange } from '../../finance/components/finance-filter';
import type { TeamFilters } from './driver-team-screen';

const PAGE = 10;

export function RouteAccordion({
  routes,
  unassigned,
  range,
  filters,
  allValue,
  notContactedValue,
  groups,
  setGroups,
  open,
  setOpen,
  selected,
  onToggleSelect,
  onSelectDriver,
}: {
  routes: TeamRouteRow[];
  unassigned: TeamRouteRow | null;
  range: DateRange;
  filters: TeamFilters;
  allValue: string;
  notContactedValue: string;
  // groups và open sống ở DriverTeamScreen — drawer, hành động hàng loạt và thẻ số
  // "Cần gọi lại hôm nay" cùng ghi vào đúng state này, nên KHÔNG giữ bản sao cục bộ.
  groups: DriverGroups;
  setGroups: React.Dispatch<React.SetStateAction<DriverGroups>>;
  open: string[];
  setOpen: React.Dispatch<React.SetStateAction<string[]>>;
  selected: Set<string>;
  onToggleSelect: (driverId: string) => void;
  onSelectDriver?: (driver: TeamDriverRow) => void;
}) {
  const { toast } = useToast();
  const [loadingKeys, setLoadingKeys] = React.useState<Set<string>>(new Set());

  const rows = React.useMemo(
    () => (unassigned ? [...routes, unassigned] : routes),
    [routes, unassigned],
  );

  const keyOf = (r: TeamRouteRow) => (r.routeId === null ? 'none' : String(r.routeId));

  const load = React.useCallback(
    async (key: string) => {
      setLoadingKeys((s) => new Set(s).add(key));
      try {
        const res = await getTeamRouteDrivers(key === 'none' ? 'none' : Number(key), {
          from: range.from,
          to: range.to,
          // NOT_CONTACTED là sentinel của FE; backend nhận 'none' để lọc
          // "chưa có row pipeline" (m.id IS NULL), không phải một stage trong DB.
          stage:
            filters.stage === allValue
              ? undefined
              : filters.stage === notContactedValue
                ? 'none'
                : filters.stage,
          ownerAdminUserId:
            filters.ownerAdminUserId === allValue ? undefined : filters.ownerAdminUserId,
          q: filters.q || undefined,
          minTrips: filters.minTrips ? Number(filters.minTrips) : undefined,
          limit: PAGE,
        });
        setGroups((g) => ({ ...g, [key]: res.data }));
      } catch (e: any) {
        toast({
          variant: 'destructive',
          title: 'Không tải được danh sách tài xế',
          description: String(e?.message ?? e),
        });
      } finally {
        setLoadingKeys((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    },
    [range, filters, allValue, notContactedValue, setGroups, toast],
  );

  // Đổi bộ lọc/khoảng ngày → dữ liệu đã tải hết hạn. Xoá sạch rồi nạp lại các nhóm
  // ĐANG MỞ, nếu không nhóm mở sẽ hiện số liệu của bộ lọc cũ.
  // DEBOUNCE 400ms: filters.q đổi theo TỪNG KÝ TỰ gõ — không debounce thì mỗi ký tự
  // xoá sạch groups và bắn lại request cho mọi nhóm đang mở.
  React.useEffect(() => {
    const t = setTimeout(() => {
      setGroups({});
      open.forEach((k) => void load(k));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    range.from,
    range.to,
    filters.stage,
    filters.ownerAdminUserId,
    filters.q,
    filters.minTrips,
  ]);

  const onToggle = (keys: string[]) => {
    setOpen(keys);
    keys.filter((k) => !groups[k] && !loadingKeys.has(k)).forEach((k) => void load(k));
  };

  const changeStage = async (driverId: string, stage: DriverTeamStage) => {
    try {
      const team = await patchTeamMember(driverId, { stage });
      // Lan sang MỌI nhóm đang mở — tài chạy nhiều tuyến nằm ở nhiều nhóm.
      setGroups((g) => patchDriverAcrossGroups(g, driverId, team));
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Không đổi được trạng thái',
        description: String(e?.message ?? e),
      });
    }
  };

  if (rows.length === 0) {
    return (
      <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        Không có tuyến nào khớp bộ lọc.
      </p>
    );
  }

  return (
    <Accordion
      type="multiple"
      value={open}
      onValueChange={onToggle}
      className="rounded-md border"
    >
      {rows.map((r) => {
        const key = keyOf(r);
        const rowsOfGroup = groups[key];
        return (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 pr-4 text-sm">
                <span className="min-w-48 flex-1 text-left font-medium">{r.routeName}</span>
                {routeNeedsDrivers(r) ? (
                  <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                    Có khách, thiếu tài
                  </Badge>
                ) : null}
                {(r.matchedDriverCount ?? 0) > 0 ? (
                  <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">
                    {r.matchedDriverCount} tài khớp
                  </Badge>
                ) : null}
                <span className="w-24 text-right">{r.driverCount} tài</span>
                <span className="w-32 text-right">{r.completedTrips} hoàn thành</span>
                <span className="w-32 text-right text-muted-foreground">
                  {r.totalBookings} khách đặt
                </span>
                <span className="w-44 text-right text-muted-foreground">
                  {r.contactedCount} liên hệ · {r.joinedCount} trong team
                </span>
                <span className="w-28 text-right text-muted-foreground">
                  {vnDay(r.lastCompletedAt)}
                </span>
              </div>
            </AccordionTrigger>

            <AccordionContent className="px-4 pb-4">
              {loadingKeys.has(key) ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : !rowsOfGroup?.length ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Không có tài xế nào chạy thành công trên tuyến này trong khoảng ngày đang chọn.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Tài xế</TableHead>
                      <TableHead className="text-right">Chuyến trên tuyến</TableHead>
                      <TableHead className="text-right">Tỉ trọng</TableHead>
                      <TableHead className="text-right">Chuyến gần nhất</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Người phụ trách</TableHead>
                      <TableHead>Hẹn gọi lại</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsOfGroup.map((d: TeamDriverRow) => {
                      const warn = driverWarning(d);
                      return (
                        <TableRow key={d.driverId}>
                          <TableCell>
                            {/* Chọn theo driverId, KHÔNG theo cặp (tài × tuyến): trạng
                                thái gắn theo tài, nên tick một người ở nhóm A tức là
                                tick chính người đó ở mọi nhóm — tránh PATCH hai lần. */}
                            <Checkbox
                              checked={selected.has(d.driverId)}
                              onCheckedChange={() => onToggleSelect(d.driverId)}
                              aria-label={`Chọn ${d.fullName ?? d.driverId}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{d.fullName ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">
                              <a href={`tel:${d.phone ?? ''}`} className="hover:underline">
                                {d.phone ?? '—'}
                              </a>
                              {d.transportCompanyName ? ` · ${d.transportCompanyName}` : ''}
                            </div>
                            {warn ? (
                              <Badge className="mt-1 bg-red-100 text-red-800 hover:bg-red-100">
                                {warn}
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">{d.tripsOnRoute}</TableCell>
                          <TableCell className="text-right">
                            {formatShare(d.shareOfRoute)}
                          </TableCell>
                          <TableCell className="text-right">{vnDay(d.lastCompletedAt)}</TableCell>
                          <TableCell>
                            <Select
                              value={d.team?.stage ?? ''}
                              onValueChange={(v) =>
                                void changeStage(d.driverId, v as DriverTeamStage)
                              }
                            >
                              <SelectTrigger className="h-8 w-36">
                                <SelectValue placeholder={stageLabel(null)}>
                                  <span
                                    className={`rounded px-2 py-0.5 text-xs ${stageBadgeClass(
                                      d.team?.stage ?? null,
                                    )}`}
                                  >
                                    {stageLabel(d.team?.stage ?? null)}
                                  </span>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {STAGE_ORDER.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {stageLabel(s)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm">
                            {d.team?.ownerAdminName ?? '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span
                              className={
                                isFollowUpOverdue(d.team?.nextFollowUpAt)
                                  ? 'font-medium text-red-600'
                                  : ''
                              }
                            >
                              {vnDay(d.team?.nextFollowUpAt)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onSelectDriver?.(d)}
                            >
                              Chi tiết
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              <p className="pt-3 text-xs text-muted-foreground">
                Trạng thái áp cho TÀI XẾ, không theo từng tuyến — đổi ở đây sẽ đổi trên mọi
                tuyến người đó chạy. Danh sách hiện {PAGE} tài có nhiều chuyến nhất trên tuyến.
              </p>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
