'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  addTeamEvent,
  getDriverCallHistory,
  getDriverReputation,
  getTeamDriverDetail,
  patchTeamMember,
  type DriverCallEvent,
} from '@/lib/api';
import type {
  DriverReputation,
  DriverTeamDetail,
  DriverTeamStage,
  TeamDriverRow,
  TeamOwner,
} from '@/lib/types';
import { driverWarning, stageLabel, STAGE_ORDER, vnDay } from '@/lib/driver-team-labels';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MultiSelectComboBox } from '@/components/ui/multi-select-combobox';
import type { DateRange } from '../../finance/components/finance-filter';
import { DRIVER_TEAM_EVENT_LABEL, unknownEnumLabel } from '@/lib/enum-labels';
import { DRIVER_CALL_TYPE_LABEL } from '@/lib/cskh-call-labels';

/** shadcn Select cấm value rỗng — cần sentinel để biểu diễn "không ai phụ trách". */
const NONE = '__none__';

export function DriverTeamDrawer({
  driver,
  range,
  owners,
  allRoutes,
  onClose,
  onSaved,
}: {
  // Nhận cả DÒNG chứ không chỉ id: tên/SĐT/HTX đã có sẵn trong bảng, truyền xuống
  // là drawer hiện được ngay "đang xem ai" mà không cần endpoint trả thêm hồ sơ.
  driver: TeamDriverRow | null;
  range: DateRange;
  owners: TeamOwner[];
  allRoutes: { id: number; name: string }[];
  onClose: () => void;
  onSaved: (driverId: string, team: DriverTeamDetail['team']) => void;
}) {
  const { toast } = useToast();
  const driverId = driver?.driverId ?? null;
  const [detail, setDetail] = React.useState<DriverTeamDetail | null>(null);
  const [reputation, setReputation] = React.useState<DriverReputation | null>(null);
  const [csCalls, setCsCalls] = React.useState<DriverCallEvent[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [callNote, setCallNote] = React.useState('');

  React.useEffect(() => {
    if (!driverId) return;
    setLoading(true);
    setDetail(null);
    setReputation(null);
    setCsCalls([]);
    setCallNote('');
    getTeamDriverDetail(driverId, range)
      .then(setDetail)
      .catch((e) =>
        toast({
          variant: 'destructive',
          title: 'Không tải được chi tiết',
          description: String(e?.message ?? e),
        }),
      )
      .finally(() => setLoading(false));
    // Hai nguồn phụ: người chỉ có quyền driver-team sẽ nhận 403 ở đây. Nuốt lỗi để
    // suy giảm chức năng, KHÔNG chặn drawer.
    getDriverReputation(driverId)
      .then(setReputation)
      .catch(() => setReputation(null));
    getDriverCallHistory(driverId)
      .then(setCsCalls)
      .catch(() => setCsCalls([]));
  }, [driverId, range, toast]);

  const save = async (body: Parameters<typeof patchTeamMember>[1]) => {
    if (!driverId) return;
    try {
      const team = await patchTeamMember(driverId, body);
      setDetail((d) => (d ? { ...d, team } : d));
      onSaved(driverId, team);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Không lưu được',
        description: String(e?.message ?? e),
      });
    }
  };

  const logCall = async () => {
    if (!driverId) return;
    try {
      await addTeamEvent(driverId, { type: 'CALL', note: callNote || undefined });
      setCallNote('');
      setDetail(await getTeamDriverDetail(driverId, range));
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Không ghi được cuộc gọi',
        description: String(e?.message ?? e),
      });
    }
  };

  const registered = new Set(detail?.registeredRouteIds ?? []);
  const run = new Set(
    (detail?.routesRun ?? []).map((r) => r.routeId).filter((x): x is number => x != null),
  );
  const registeredNotRun = (detail?.registeredRouteIds ?? []).filter((id) => !run.has(id));
  const warn = driver ? driverWarning(driver) : null;

  return (
    <Sheet open={!!driverId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{driver?.fullName ?? 'Chi tiết tài xế'}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            <a href={`tel:${driver?.phone ?? ''}`} className="hover:underline">
              {driver?.phone ?? '—'}
            </a>
            {driver?.transportCompanyName ? ` · ${driver.transportCompanyName}` : ''}
          </p>
          {warn ? <Badge className="w-fit bg-red-100 text-red-800">{warn}</Badge> : null}
        </SheetHeader>

        {loading || !detail ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* 1. Pipeline */}
            <section className="space-y-3">
              <h3 className="text-sm font-medium">Pipeline tuyển team</h3>

              <div>
                <Label className="text-xs text-muted-foreground">Trạng thái</Label>
                <Select
                  value={detail.team?.stage ?? ''}
                  onValueChange={(v) => void save({ stage: v as DriverTeamStage })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={stageLabel(null)} />
                  </SelectTrigger>
                  <SelectContent>
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
                {/* Sentinel NONE để GỠ người phụ trách — shadcn Select không cho
                    SelectItem value rỗng, thiếu mục này thì gán rồi không bỏ ra được. */}
                <Select
                  value={detail.team?.ownerAdminUserId ?? NONE}
                  onValueChange={(v) => void save({ ownerAdminUserId: v === NONE ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chưa gán người phụ trách" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Không ai phụ trách</SelectItem>
                    {owners.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.fullName ?? o.phone ?? o.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Tuyến được phân công</Label>
                <MultiSelectComboBox
                  options={allRoutes.map((r) => ({ value: String(r.id), label: r.name }))}
                  selectedValues={(detail.team?.assignedRouteIds ?? []).map(String)}
                  onSelectedValuesChange={(vals) =>
                    void save({ assignedRouteIds: vals.map(Number) })
                  }
                  placeholder="Chọn tuyến"
                  searchPlaceholder="Tìm tuyến..."
                  noResultsText="Không có tuyến khớp"
                />
                {/* assignedRouteIds cố ý không có FK (spec §4.1) → tuyến xoá mềm còn
                    nằm lại. Hiện tường minh thay vì để nó biến mất im lặng. */}
                {(detail.team?.assignedRouteIds ?? [])
                  .filter((id) => !allRoutes.some((r) => r.id === id))
                  .map((id) => (
                    <Badge key={id} className="mr-1 mt-1 bg-muted text-muted-foreground">
                      Tuyến đã xoá (#{id})
                    </Badge>
                  ))}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Hẹn gọi lại (ngày VN)</Label>
                {/* `key` ép React dựng lại input khi giá trị từ server đổi — uncontrolled
                    thuần thì sau khi logCall() nạp lại detail, ô vẫn giữ giá trị cũ. */}
                <Input
                  key={detail.team?.nextFollowUpAt ?? 'empty'}
                  type="date"
                  defaultValue={
                    detail.team?.nextFollowUpAt ? vnDay(detail.team.nextFollowUpAt) : ''
                  }
                  onChange={(e) =>
                    void save({
                      // Ngày VN người dùng chọn → 09:00 giờ VN = 02:00Z, tránh lệch
                      // ngày khi backend so sánh theo mốc VN.
                      nextFollowUpAt: e.target.value ? `${e.target.value}T02:00:00.000Z` : null,
                    })
                  }
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Ghi chú riêng (vận hành/CSKH không đọc được)
                </Label>
                <Textarea
                  key={detail.team?.note ?? 'empty'}
                  defaultValue={detail.team?.note ?? ''}
                  onBlur={(e) => void save({ note: e.target.value })}
                  rows={3}
                />
              </div>
            </section>

            {/* 2. Tuyến: thực chạy vs đăng ký */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Tuyến thực chạy so với tuyến đăng ký</h3>
              {detail.routesRun.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Không có chuyến hoàn thành trong kỳ.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {detail.routesRun.map((r) => (
                    <li key={String(r.routeId)} className="flex items-center gap-2">
                      <span className="flex-1">
                        {r.routeDeleted
                          ? `Tuyến đã xoá (#${r.routeId})`
                          : (r.name ?? 'Không gắn tuyến')}
                      </span>
                      <span className="text-muted-foreground">{r.trips} chuyến</span>
                      {r.routeId != null && !registered.has(r.routeId) ? (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          Chạy nhưng chưa đăng ký
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {registeredNotRun.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Đăng ký {registeredNotRun.length} tuyến nhưng không chạy chuyến nào trong kỳ.
                </p>
              ) : null}
            </section>

            {/* 3. Điểm & đánh giá */}
            <section className="space-y-1">
              <h3 className="text-sm font-medium">Điểm &amp; đánh giá</h3>
              {reputation === null ? (
                <p className="text-sm text-muted-foreground">Chưa tải được điểm.</p>
              ) : (
                <p className="text-sm">
                  {reputation.displayStars != null
                    ? `${reputation.displayStars.toFixed(1)} sao · ${reputation.ratingCount} đánh giá`
                    : 'Chưa đủ đánh giá để công khai'}
                </p>
              )}
            </section>

            {/* 4. Nhật ký riêng */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Nhật ký chăm sóc (riêng tư)</h3>
              <div className="flex gap-2">
                <Input
                  value={callNote}
                  onChange={(e) => setCallNote(e.target.value)}
                  placeholder="Nội dung cuộc gọi"
                />
                <Button onClick={() => void logCall()}>Ghi nhận gọi</Button>
              </div>
              {detail.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có hoạt động nào.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {detail.events.map((e) => (
                    <li key={e.id} className="text-muted-foreground">
                      {vnDay(e.createdAt)} · {DRIVER_TEAM_EVENT_LABEL(e.type)}
                      {e.toStage ? ` → ${stageLabel(e.toStage)}` : ''}
                      {e.note ? ` · ${e.note}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 5. Log CSKH — CHỈ ĐỌC */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Lịch sử CSKH đã gọi (chỉ đọc)</h3>
              {csCalls.length === 0 ? (
                <p className="text-sm text-muted-foreground">CSKH chưa liên hệ tài này.</p>
              ) : (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {csCalls.map((c) => (
                    <li key={c.id}>
                      {vnDay(c.createdAt)} · {DRIVER_CALL_TYPE_LABEL[c.type] ?? unknownEnumLabel(c.type)}
                      {c.note ? ` · ${c.note}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
