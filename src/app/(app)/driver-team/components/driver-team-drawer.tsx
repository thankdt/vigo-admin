'use client';

import * as React from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import {
  addTeamEvent,
  getDriverCallHistory,
  getDriverReputation,
  getTeamDriverDetail,
  patchTeamMember,
  updateTeamCommissionRate,
  type DriverCallEvent,
} from '@/lib/api';
import type {
  DriverReputation,
  DriverTeamDetail,
  DriverTeamStage,
  TeamDriverRow,
  TeamOwner,
} from '@/lib/types';
import {
  buildAssignedProvincePatch,
  commissionRateLabel,
  driverWarning,
  isCatalogProvince,
  type ProvinceOption,
  PROVINCE_BUCKET_NOTE_FALLBACK,
  splitAssignedByCatalog,
  stageLabel,
  STAGE_ORDER,
  unknownProvinceCodeLabel,
  vnDay,
} from '@/lib/driver-team-labels';
import { commissionRateWarning } from './commission-warning';
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
  provinceOptions,
  onClose,
  onSaved,
}: {
  // Nhận cả DÒNG chứ không chỉ id: tên/SĐT/HTX đã có sẵn trong bảng, truyền xuống
  // là drawer hiện được ngay "đang xem ai" mà không cần endpoint trả thêm hồ sơ.
  driver: TeamDriverRow | null;
  range: DateRange;
  owners: TeamOwner[];
  /** Danh mục tỉnh để giao cho tài (mã gis + tên hiển thị). Rỗng khi chưa tải được. */
  provinceOptions: ProvinceOption[];
  onClose: () => void;
  onSaved: (driverId: string, team: DriverTeamDetail['team']) => void;
}) {
  const { toast } = useToast();
  const { me } = useAuth();
  const driverId = driver?.driverId ?? null;
  const [detail, setDetail] = React.useState<DriverTeamDetail | null>(null);
  const [reputation, setReputation] = React.useState<DriverReputation | null>(null);
  const [csCalls, setCsCalls] = React.useState<DriverCallEvent[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [callNote, setCallNote] = React.useState('');
  // Nháp ô "% hoa hồng riêng" — TÁCH khỏi detail.team.commissionRate (số đã lưu)
  // vì input hiện đơn vị PHẦN TRĂM (string) trong khi backend giữ PHÂN SỐ 0..1.
  // Đồng bộ lại từ giá trị đã lưu mỗi khi nó đổi (tải xong / vừa lưu thành công).
  const [rateDraft, setRateDraft] = React.useState('');
  // PATCH tỉnh thay NGUYÊN tập, mà tập mới được tính từ `assignedCodes` ở lần render hiện tại. Hai lần
  // chọn chồng nhau thì lần sau tính trên state cũ và ghi đè lần trước — mất lựa chọn im lặng. Nên KHOÁ
  // việc chọn từ lúc gửi đến lúc có phản hồi. Phải chặn ở `saveProvinces` chứ không chỉ `disabled` ở
  // nút: nút `disabled` không đóng popover, các mục bên trong popover đang mở vẫn bấm được.
  const [provincesSaving, setProvincesSaving] = React.useState(false);

  React.useEffect(() => {
    setRateDraft(
      detail?.team?.commissionRate != null ? String(detail.team.commissionRate * 100) : '',
    );
  }, [detail?.team?.commissionRate]);

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

  /** Trả `true` khi backend đã nhận — nơi gọi cần biết để không báo "đã bỏ…" cho thứ chưa lưu. */
  const save = async (body: Parameters<typeof patchTeamMember>[1]): Promise<boolean> => {
    if (!driverId) return false;
    try {
      const team = await patchTeamMember(driverId, body);
      setDetail((d) => (d ? { ...d, team } : d));
      onSaved(driverId, team);
      return true;
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Không lưu được',
        description: String(e?.message ?? e),
      });
      return false;
    }
  };

  /**
   * Sửa % hoa hồng riêng — endpoint RIÊNG (`updateTeamCommissionRate`, SuperOnlyGuard
   * ở backend), khác `patchTeamMember` ở trên. `rate` gửi NGUYÊN — `null` là "gỡ mức
   * riêng", `0` là "miễn hoa hồng" — hai nghĩa khác nhau, TUYỆT ĐỐI không lọc bằng
   * `||`/truthiness ở đây hay ở nơi gọi.
   */
  const saveRate = async (rate: number | null) => {
    if (!driverId) return;
    try {
      const team = await updateTeamCommissionRate(driverId, rate);
      setDetail((d) => (d ? { ...d, team } : d));
      onSaved(driverId, team);
      toast({
        title:
          rate === null
            ? 'Đã gỡ mức riêng — tài quay về mức chung'
            : `Đã đặt mức riêng ${commissionRateLabel(rate).text}`,
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Không lưu được % hoa hồng riêng',
        description: String(e?.message ?? e),
      });
    }
  };

  /**
   * Chốt giá trị đang gõ ở ô % hoa hồng riêng (đơn vị PHẦN TRĂM) thành PHÂN SỐ
   * 0..1 rồi lưu. Để trống ô KHÔNG xoá mức riêng — trả input về giá trị đã lưu
   * thay vì âm thầm gửi `null`; muốn gỡ mức riêng PHẢI bấm nút riêng.
   */
  const commitRateDraft = () => {
    const committed = detail?.team?.commissionRate ?? null;
    const trimmed = rateDraft.trim();
    if (trimmed === '') {
      setRateDraft(committed != null ? String(committed * 100) : '');
      return;
    }
    const pct = Number(trimmed);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast({
        variant: 'destructive',
        title: 'Tỉ lệ không hợp lệ',
        description: 'Nhập một số từ 0 đến 100.',
      });
      setRateDraft(committed != null ? String(committed * 100) : '');
      return;
    }
    // Giữ tối đa 2 chữ số thập phân của % (= 4 chữ số thập phân của phân số),
    // tránh rác dấu phẩy động kiểu 0.1 + 0.2.
    const rate = Math.round(pct * 100) / 10000;
    if (rate === committed) return;
    void saveRate(rate);
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

  const assignedCodes = detail?.team?.assignedProvinceCodes ?? [];
  // Danh mục = những tỉnh backend nhận khi giao. Cấp 1 còn có thể chứa mã có số liệu mà danh mục không
  // có (nhãn "Mã tỉnh XX") — giao mã đó là 400, nên không đưa vào ô chọn.
  const catalogOptions = provinceOptions.filter(isCatalogProvince);
  const catalogCodes = new Set(catalogOptions.map((p) => p.code));
  // Mã tỉnh đang giao nhưng ngoài danh mục (không nên có): hiện tường minh kèm nút gỡ thay vì để nó
  // biến mất im lặng khỏi ô chọn. Backend 400 nếu gửi lại → `saveProvinces` luôn bỏ chúng khi lưu.
  const { inCatalog: assignedInCatalog, outside: assignedOutsideCatalog } = splitAssignedByCatalog(
    assignedCodes,
    catalogCodes,
  );

  /**
   * Lưu tập tỉnh được giao. Bỏ qua khi đang có một PATCH tỉnh bay (xem `provincesSaving`). Mã ngoài
   * danh mục KHÔNG gửi (backend 400 cả request) — bỏ chúng và báo người dùng đúng mã nào đã bỏ.
   */
  const saveProvinces = async (selected: string[]) => {
    if (provincesSaving) return;
    const { codes, dropped } = buildAssignedProvincePatch(selected, assignedCodes, catalogCodes);
    setProvincesSaving(true);
    try {
      const ok = await save({ assignedProvinceCodes: codes });
      if (ok && dropped.length > 0) {
        toast({
          title: 'Đã bỏ mã tỉnh ngoài danh mục',
          description: `${dropped.map(unknownProvinceCodeLabel).join(', ')} không có trong danh mục tỉnh nên không được lưu lại.`,
        });
      }
    } finally {
      setProvincesSaving(false);
    }
  };

  const provincesRun = detail?.provincesRun ?? [];
  const registered = new Set(detail?.registeredProvinceCodes ?? []);
  const runCodes = new Set(
    provincesRun.map((r) => r.provinceCode).filter((x): x is string => x != null),
  );
  const registeredNames = detail?.registeredProvinceNames ?? [];
  const registeredNotRun = (detail?.registeredProvinceCodes ?? [])
    .map((code, i) => ({ code, name: registeredNames[i] || unknownProvinceCodeLabel(code) }))
    .filter((r) => !runCodes.has(r.code));
  const warn = driver ? driverWarning(driver) : null;

  // Cảnh báo % hoa hồng riêng tính trên giá trị ĐANG GÕ (nháp), không phải giá trị
  // đã lưu — super admin thấy ngay hậu quả trước khi rời khỏi ô, không phải sau khi
  // đã lưu xong mới biết.
  const draftPct = rateDraft.trim() === '' ? null : Number(rateDraft);
  const draftPctValid =
    draftPct != null && Number.isFinite(draftPct) && draftPct >= 0 && draftPct <= 100;
  const draftWarning = draftPctValid ? commissionRateWarning(draftPct! / 100) : null;

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

              {/* % hoa hồng riêng — CHỈ có hiệu lực ở stage "Trong team" (spec §8),
                  nên chỉ hiện ô khi đúng trạng thái đó. Trạng thái khác ẩn hẳn,
                  không phải disable, để khỏi ai tưởng nhầm mức riêng vẫn còn áp. */}
              {detail.team?.stage === 'JOINED' ? (
                <div>
                  <Label className="text-xs text-muted-foreground">% hoa hồng riêng</Label>
                  {me?.isSuperAdmin ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          className="w-28"
                          placeholder="Mức chung"
                          value={rateDraft}
                          onChange={(e) => setRateDraft(e.target.value)}
                          onBlur={commitRateDraft}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                        {detail.team?.commissionRate != null ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void saveRate(null)}
                          >
                            Gỡ, dùng mức chung
                          </Button>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        0% là mức HỢP LỆ (miễn hoa hồng) — để trống ô KHÔNG xoá mức riêng, bấm
                        &quot;Gỡ, dùng mức chung&quot; để đưa tài về mức chung.
                      </p>
                      {draftWarning ? (
                        <p
                          className={`flex items-start gap-1.5 rounded-md p-2 text-xs ${
                            draftWarning.direction === 'above'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{draftWarning.message}</span>
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {(() => {
                        const c = commissionRateLabel(detail.team?.commissionRate);
                        return c.warn ? (
                          <Badge className="gap-1 bg-red-100 text-red-800 hover:bg-red-100">
                            <AlertTriangle className="h-3 w-3" />
                            {c.text}
                          </Badge>
                        ) : (
                          <span className="text-sm">{c.text}</span>
                        );
                      })()}
                      <span className="text-xs text-muted-foreground">
                        Chỉ đọc — cần quyền super admin để sửa mức riêng.
                      </span>
                    </div>
                  )}
                </div>
              ) : null}

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
                <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Tỉnh được phân công
                  {provincesSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                </Label>
                <MultiSelectComboBox
                  options={catalogOptions.map((p) => ({ value: p.code, label: p.name }))}
                  selectedValues={assignedInCatalog}
                  // Gửi nguyên tập đã chọn (kể cả rỗng = bỏ hết). Mã ngoài danh mục không
                  // nằm trong ô chọn và KHÔNG được gửi lại — xem `saveProvinces`.
                  onSelectedValuesChange={(vals) => void saveProvinces(vals)}
                  disabled={provincesSaving}
                  placeholder="Chọn tỉnh"
                  searchPlaceholder="Tìm tỉnh..."
                  noResultsText="Không có tỉnh khớp"
                />
                {assignedOutsideCatalog.length > 0 ? (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex flex-wrap gap-1">
                      {assignedOutsideCatalog.map((code) => (
                        <Badge
                          key={code}
                          className="gap-1 bg-amber-100 pr-1 text-amber-800 hover:bg-amber-100"
                        >
                          {unknownProvinceCodeLabel(code)} · ngoài danh mục
                          <button
                            type="button"
                            aria-label={`Gỡ ${unknownProvinceCodeLabel(code)} (ngoài danh mục)`}
                            disabled={provincesSaving}
                            onClick={() => void saveProvinces(assignedInCatalog)}
                            className="rounded-full p-0.5 hover:bg-amber-200 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Mã ngoài danh mục tỉnh — hệ thống không nhận nên sẽ bị bỏ ở lần lưu tỉnh
                      tiếp theo. Bấm × để gỡ ngay (gỡ cùng lúc mọi mã ngoài danh mục).
                    </p>
                  </div>
                ) : null}
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

            {/* 2. Tỉnh: thực chạy vs đăng ký hoạt động */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Tỉnh thực chạy so với tỉnh đăng ký hoạt động</h3>
              {provincesRun.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Không có chuyến hoàn thành trong kỳ.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {provincesRun.map((r) => (
                    <li key={r.provinceCode ?? 'none'} className="flex items-center gap-2">
                      <span className="flex-1">{r.provinceName}</span>
                      <span className="text-muted-foreground">{r.trips} chuyến</span>
                      {r.provinceCode != null && !registered.has(r.provinceCode) ? (
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
                  Đăng ký {registeredNotRun.length} tỉnh nhưng không chạy chuyến nào trong kỳ:{' '}
                  {registeredNotRun.map((r) => r.name).join(', ')}.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {detail.bucketNote ?? PROVINCE_BUCKET_NOTE_FALLBACK}
              </p>
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
