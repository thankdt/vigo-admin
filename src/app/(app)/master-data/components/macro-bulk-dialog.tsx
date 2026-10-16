'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { MultiSelectComboBox } from '@/components/ui/multi-select-combobox';
import { WardSourcePanel } from './ward-source-panel';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MapPin, X } from 'lucide-react';
import { bulkCreatePricingMacroRules, getPricingMacroWards } from '@/lib/api';
import {
  MACRO_BULK_MAX_COMBOS,
  MACRO_VALUE_LIMITS,
  addEndpoints,
  adjustmentValueError,
  adjustmentValueHint,
  adjustmentValueRange,
  anySide,
  checkBulkSelection,
  describeSkipped,
  endpointKey,
  formatMacroAdjustment,
  pendingStagedSelection,
  priorityError,
  removeEndpoint,
  summarizeEndpoints,
  summarizeWarnings,
  toSelectors,
  type MacroEndpoint,
} from '@/lib/macro-bulk';
import type {
  BulkCreatePricingMacroRulesRequest,
  BulkCreatePricingMacroRulesResult,
  MacroAdjustmentType,
  MacroEndSelector,
  ProvinceOption,
  WardOption,
} from '@/lib/types';

const NATIVE_SELECT =
  'h-8 w-full rounded-md border border-input bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';

type FormState = {
  namePrefix: string;
  serviceType: string;
  vehicleType: string;
  adjustmentType: MacroAdjustmentType;
  adjustmentValue: string;
  isBidirectional: boolean;
  priority: string;
  isActive: boolean;
  note: string;
};

const initialForm = (): FormState => ({
  namePrefix: '',
  serviceType: 'ALL',
  vehicleType: 'ALL',
  adjustmentType: 'DELTA_AMOUNT',
  adjustmentValue: '',
  // Spec bỏ-tuyến §5 (QĐ#4): luật MỚI mặc định HAI chiều, giống form tạo đơn lẻ. Bỏ tích khi chỉ muốn một chiều.
  isBidirectional: true,
  priority: '0',
  isActive: true,
  note: '',
});


// ───────────────────────── Danh sách điểm đón / trả ─────────────────────────

function EndpointBuilder({
  title,
  provinces,
  items,
  onChange,
  onPendingChange,
  accent,
}: {
  title: string;
  provinces: ProvinceOption[];
  items: MacroEndpoint[];
  onChange: (next: MacroEndpoint[]) => void;
  /** Báo lên cha khi có lựa chọn đã nhập mà CHƯA bấm "Thêm" (null = không có). */
  onPendingChange: (pending: string | null) => void;
  accent: string;
}) {
  const [provinceCode, setProvinceCode] = React.useState('');
  const [wards, setWards] = React.useState<WardOption[]>([]);
  const [loadingWards, setLoadingWards] = React.useState(false);
  const [wardCodes, setWardCodes] = React.useState<string[]>([]);
  // Admin vừa chọn tỉnh trong ô mà chưa bấm Thêm (xem `pendingStagedSelection`).
  const [staged, setStaged] = React.useState(false);
  // Đổi tỉnh nhanh: chỉ nhận kết quả của lần gọi MỚI NHẤT.
  const requestSeq = React.useRef(0);

  const provinceName = provinces.find((p) => p.code === provinceCode)?.name ?? provinceCode;
  // Mục đầu "— Chọn tỉnh —" (mã rỗng) = bỏ chọn, như ô chọn cũ: bỏ chọn tỉnh đã nhập mà chưa "Thêm" là cách gỡ chặn tạo.
  const provinceOptions = React.useMemo(
    () => [{ value: '', label: '— Chọn tỉnh —' }, ...provinces.map((p) => ({ value: p.code, label: p.name }))],
    [provinces],
  );
  const addLabel = wardCodes.length ? `Thêm ${wardCodes.length} phường/xã` : provinceCode ? 'Thêm cả tỉnh' : 'Thêm';

  // Lựa chọn đã nhập mà chưa "Thêm" sẽ KHÔNG vào payload — cha phải biết để chặn tạo (bên đó sẽ thành "mọi nơi").
  const pendingMsg = pendingStagedSelection({
    provinceCode,
    provinceName: provinceName || provinceCode,
    wardCount: wardCodes.length,
    items,
    staged,
  });
  React.useEffect(() => {
    onPendingChange(pendingMsg);
  }, [pendingMsg, onPendingChange]);

  const handleProvince = async (code: string) => {
    setProvinceCode(code);
    setStaged(!!code);
    setWardCodes([]);
    setWards([]);
    const seq = ++requestSeq.current;
    if (!code) return;
    setLoadingWards(true);
    try {
      const list = await getPricingMacroWards(code);
      if (seq === requestSeq.current) setWards(list || []);
    } catch {
      if (seq === requestSeq.current) setWards([]);
    } finally {
      if (seq === requestSeq.current) setLoadingWards(false);
    }
  };

  const add = () => {
    if (!provinceCode) return;
    const additions: MacroEndpoint[] = wardCodes.length
      ? wardCodes.map((c) => ({
          provinceCode,
          wardCode: c,
          label: `${wards.find((w) => w.code === c)?.name ?? c} (${provinceName})`,
        }))
      : [{ provinceCode, label: `Cả tỉnh ${provinceName}` }];
    onChange(addEndpoints(items, additions));
    setWardCodes([]);
    setStaged(false);
  };

  return (
    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-2">
      <div className="font-semibold text-slate-700 flex items-center gap-1.5">
        <MapPin className={`w-3.5 h-3.5 ${accent}`} />
        {title}
        <span className="font-normal text-slate-400">({items.length})</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-slate-500">Tỉnh / Thành phố</Label>
          <Combobox
            ariaLabel={`${title}: tỉnh/thành`}
            className="h-8 text-xs bg-white"
            options={provinceOptions}
            selectedValue={provinceCode}
            // Bấm lại mục đang chọn làm Combobox trả undefined: bỏ qua (không xoá tỉnh/phường đã chọn).
            onSelect={(code) => {
              if (code !== undefined) void handleProvince(code);
            }}
            placeholder="— Chọn tỉnh —"
            searchPlaceholder="Tìm tỉnh / thành phố..."
            noResultsText="Không tìm thấy tỉnh"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-slate-500">Phường / Xã (bỏ trống = cả tỉnh)</Label>
          <MultiSelectComboBox
            options={wards.map((w) => ({ value: w.code, label: w.name }))}
            selectedValues={wardCodes}
            onSelectedValuesChange={setWardCodes}
            placeholder={loadingWards ? 'Đang tải danh sách...' : provinceCode ? 'Chọn phường/xã' : 'Chọn tỉnh trước'}
            searchPlaceholder="Tìm phường/xã..."
            noResultsText="Không tìm thấy"
            disabled={!provinceCode || loadingWards}
            className="min-h-8 text-xs"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={add}
          disabled={!provinceCode}
          aria-label={`${title}: ${addLabel}`}
        >
          {addLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={!provinceCode || wards.length === 0}
          onClick={() => setWardCodes(wards.map((w) => w.code))}
          aria-label={`${title}: Chọn tất cả phường/xã (${wards.length})`}
        >
          Chọn tất cả phường/xã ({wards.length})
        </Button>
        {items.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-red-600"
            onClick={() => onChange([])}
            aria-label={`${title}: Xoá danh sách`}
          >
            Xoá danh sách
          </Button>
        )}
      </div>

      <WardSourcePanel title={title} provinces={provinces} onAdd={(add) => onChange(addEndpoints(items, add))} />

      {items.length === 0 ? (
        <div className="text-[11px] text-slate-400">Chưa chọn — áp dụng cho mọi điểm (chỉ được khi bên kia đã chọn).</div>
      ) : (
        <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto" role="group" aria-label={`${title}: đã chọn`}>
          {items.map((e) => (
            <Badge key={endpointKey(e)} variant="secondary" className="text-[11px] gap-1 pr-1">
              {e.label}
              <button
                type="button"
                aria-label={`${title}: bỏ ${e.label}`}
                className="rounded hover:bg-slate-300/60"
                onClick={() => onChange(removeEndpoint(items, endpointKey(e)))}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Hộp thoại ─────────────────────────

export function MacroBulkDialog({
  open,
  onOpenChange,
  provinces,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provinces: ProvinceOption[];
  /** Gọi sau khi đã tạo được ít nhất một quy tắc (để màn danh sách tải lại). */
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<FormState>(initialForm);
  const [origins, setOrigins] = React.useState<MacroEndpoint[]>([]);
  const [dests, setDests] = React.useState<MacroEndpoint[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [pendingOrigin, setPendingOrigin] = React.useState<string | null>(null);
  const [pendingDest, setPendingDest] = React.useState<string | null>(null);
  // Xác nhận "áp cho MỌI điểm" — gắn với danh sách hiện tại, đổi danh sách là phải xác nhận lại.
  const [ackAny, setAckAny] = React.useState(false);
  const [result, setResult] = React.useState<{
    data: BulkCreatePricingMacroRulesResult;
    labels: Record<string, string>;
    requestedBidirectional: boolean;
  } | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(initialForm());
      setOrigins([]);
      setDests([]);
      setResult(null);
      setAckAny(false);
    }
  }, [open]);
  // Xác nhận chỉ đúng cho đúng danh sách + đúng hướng đã thấy: bật "hai chiều" nới phạm vi gấp đôi.
  React.useEffect(() => {
    setAckAny(false);
  }, [origins, dests, form.isBidirectional]);

  const selection = checkBulkSelection(origins.length, dests.length);
  const value = Number(form.adjustmentValue);
  const valueError = form.adjustmentValue.trim() === '' ? 'Nhập giá trị điều chỉnh.' : adjustmentValueError(form.adjustmentType, value);
  const prioError = priorityError(Number(form.priority));
  const prefix = form.namePrefix.trim();
  const prefixError = !prefix
    ? 'Nhập tiền tố tên quy tắc.'
    : prefix.length > MACRO_VALUE_LIMITS.NAME_PREFIX_MAX
      ? `Tiền tố tối đa ${MACRO_VALUE_LIMITS.NAME_PREFIX_MAX} ký tự.`
      : null;
  const emptySide = selection.ok ? anySide(origins.length, dests.length) : null;
  const emptySideName = emptySide === 'origin' ? 'điểm đón' : emptySide === 'dest' ? 'điểm trả' : '';
  const pendingError = pendingOrigin
    ? `Điểm đón: ${pendingOrigin}.`
    : pendingDest
      ? `Điểm trả: ${pendingDest}.`
      : null;
  const anyError = emptySide && !ackAny ? `Cần xác nhận áp dụng cho MỌI ${emptySideName}.` : null;
  const firstError = prefixError || selection.error || pendingError || anyError || valueError || prioError;

  const labelMap = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of [...origins, ...dests]) m[endpointKey(e)] = e.label;
    return m;
  }, [origins, dests]);

  // Đang gửi thì không cho đóng: mở lại trước khi phản hồi về sẽ để kết quả cũ đè lên form mới.
  const handleOpenChange = (next: boolean) => {
    if (!next && saving) return;
    onOpenChange(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (firstError || saving) return;
    const payload: BulkCreatePricingMacroRulesRequest = {
      namePrefix: prefix,
      isActive: form.isActive,
      priority: Number(form.priority) || 0,
      serviceType: form.serviceType,
      vehicleType: form.vehicleType,
      adjustmentType: form.adjustmentType,
      adjustmentValue: value,
      // Backend luôn nhân theo ghế và từ chối `applyPerSeat=false`: gửi true cho khớp mọi phiên bản.
      applyPerSeat: true,
      isBidirectional: form.isBidirectional,
      note: form.note.trim() ? form.note.trim() : null,
      origins: toSelectors(origins),
      dests: toSelectors(dests),
    };
    setSaving(true);
    try {
      const data = await bulkCreatePricingMacroRules(payload);
      setResult({ data, labels: labelMap, requestedBidirectional: form.isBidirectional });
      if (data.created.length > 0) onDone();
      const warn = summarizeWarnings(data.warnings);
      const notes = [
        data.skipped.length
          ? `Bỏ qua ${data.skipped.length} tổ hợp (đã có quy tắc cùng khoá hoặc lặp trong yêu cầu).`
          : null,
        warn.count ? `Có ${warn.count} cảnh báo (không chặn) — xem chi tiết trong hộp kết quả.` : null,
      ].filter(Boolean);
      toast({
        title: `Đã tạo ${data.created.length} quy tắc`,
        description: notes.length ? notes.join(' ') : undefined,
      });
    } catch (err: any) {
      toast({
        title: 'Lỗi tạo hàng loạt',
        description: err?.message || 'Không thể tạo quy tắc hàng loạt',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const labelFor = (s: MacroEndSelector) =>
    (result?.labels[endpointKey(s)] ?? '') ||
    (s.wardCode ? `Phường/xã ${s.wardCode}` : s.provinceCode ? `Tỉnh ${s.provinceCode}` : 'Mọi nơi');

  // Backend cũ bỏ qua isBidirectional lặng lẽ → luật tạo ra là MỘT chiều dù admin tích hai chiều.
  const notHonored =
    !!result &&
    result.requestedBidirectional &&
    result.data.created.length > 0 &&
    result.data.created.some((r) => r.isBidirectional !== true);

  // Cảnh báo (không chặn) backend trả kèm kết quả tạo hàng loạt — tính một lần cho hộp kết quả.
  const resultWarnings = summarizeWarnings(result?.data.warnings, 8);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">Thêm quy tắc macro định giá mới</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Chọn điểm đón × điểm trả (một hay nhiều xã mỗi bên); mỗi cặp sinh một quy tắc với cùng mức điều chỉnh. Có thể
            chọn theo tỉnh cũ/huyện cũ, nhóm xã hoặc dán danh sách. Cặp đã có quy tắc cùng khoá (kể cả chiều ngược) sẽ
            được BỎ QUA, không ghi đè.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-xs" data-testid="bulk-result">
            <div className="text-sm font-semibold text-slate-800">
              Đã tạo {result.data.created.length} quy tắc · bỏ qua {result.data.skipped.length} tổ hợp
            </div>
            {notHonored && (
              <div role="alert" className="p-2 rounded border border-red-300 bg-red-50 text-red-700">
                Máy chủ chưa hỗ trợ quy tắc hai chiều: các quy tắc vừa tạo chỉ áp dụng MỘT chiều. Hãy báo lập trình
                viên cập nhật backend trước khi dùng tính năng này.
              </div>
            )}
            {resultWarnings.count > 0 && (
              <div role="note" data-testid="bulk-warnings" className="p-2 rounded border border-amber-300 bg-amber-50 text-amber-900">
                <div className="font-semibold">Cảnh báo (không chặn)</div>
                <ul className="list-disc pl-5 space-y-0.5 mt-0.5">
                  {resultWarnings.lines.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
                {resultWarnings.more > 0 && (
                  <div className="mt-1 text-amber-700">… và {resultWarnings.more} cảnh báo khác.</div>
                )}
              </div>
            )}
            {result.data.skipped.length > 0 && (
              <div>
                <div className="font-semibold text-slate-700 mb-1">Tổ hợp bị bỏ qua</div>
                <ul className="list-disc pl-5 space-y-0.5 max-h-56 overflow-y-auto text-slate-600">
                  {result.data.skipped.slice(0, 100).map((s, i) => (
                    <li key={i}>{describeSkipped(s, labelFor)}</li>
                  ))}
                </ul>
                {result.data.skipped.length > 100 && (
                  <div className="text-slate-400 mt-1">… và {result.data.skipped.length - 100} tổ hợp khác.</div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => { setResult(null); setAckAny(false); }}>
                Tạo thêm
              </Button>
              <Button type="button" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => handleOpenChange(false)}>
                Đóng
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 text-xs">
            <div className="space-y-1">
              <Label htmlFor="bulk-prefix" className="text-xs font-semibold">Tiền tố tên quy tắc *</Label>
              <Input
                id="bulk-prefix"
                className="h-9 text-xs"
                placeholder={`Ví dụ: HN-HY — tên mỗi quy tắc sẽ là «HN-HY: Nghĩa Đô ${form.isBidirectional ? '↔' : '→'} Hưng Yên»`}
                value={form.namePrefix}
                onChange={(e) => setForm((p) => ({ ...p, namePrefix: e.target.value }))}
              />
              {prefix && prefixError && <div className="text-[11px] text-red-600">{prefixError}</div>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EndpointBuilder
                title="Điểm đón"
                accent="text-blue-600"
                provinces={provinces}
                items={origins}
                onChange={setOrigins}
                onPendingChange={setPendingOrigin}
              />
              <EndpointBuilder
                title="Điểm trả"
                accent="text-purple-600"
                provinces={provinces}
                items={dests}
                onChange={setDests}
                onPendingChange={setPendingDest}
              />
            </div>

            <div
              className={`rounded border p-2 ${selection.ok && !emptySide ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-amber-300 bg-amber-50 text-amber-800'}`}
              aria-live="polite"
              data-testid="bulk-count"
            >
              {selection.ok
                ? `Sẽ tạo tối đa ${selection.combos} quy tắc ${
                    form.isBidirectional ? '(mỗi quy tắc áp dụng cả hai chiều)' : '(chỉ chiều đón → trả)'
                  }. Trần ${MACRO_BULK_MAX_COMBOS} mỗi lần.`
                : selection.error}
            </div>

            {pendingError && (
              <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-800" data-testid="bulk-pending">
                {pendingError} Lựa chọn chưa bấm «Thêm» sẽ KHÔNG được tạo thành quy tắc.
              </div>
            )}

            {emptySide && (
              <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900 space-y-1.5" data-testid="bulk-any">
                <div>
                  <span className="font-semibold">Bên {emptySideName} đang TRỐNG = MỌI {emptySideName.toUpperCase()} (toàn quốc, kể cả
                  nội tỉnh).</span>{' '}
                  Mỗi quy tắc sẽ áp dụng cho mọi chuyến {emptySide === 'dest' ? 'đi từ các điểm đón đã chọn tới BẤT KỲ đâu' : 'đến các điểm trả đã chọn từ BẤT KỲ đâu'}
                  {form.isBidirectional ? ' (và chiều ngược lại)' : ''}.
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="bulk-ack-any" checked={ackAny} onCheckedChange={(c) => setAckAny(!!c)} />
                  <Label htmlFor="bulk-ack-any" className="text-xs font-semibold cursor-pointer">
                    Tôi hiểu và muốn áp dụng cho MỌI {emptySideName}
                  </Label>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="bulk-service" className="text-xs font-semibold">Loại dịch vụ</Label>
                <select
                  id="bulk-service"
                  className={NATIVE_SELECT}
                  value={form.serviceType}
                  onChange={(e) => setForm((p) => ({ ...p, serviceType: e.target.value }))}
                >
                  <option value="ALL">Tất cả dịch vụ</option>
                  <option value="CARPOOL">Ghép xe (CARPOOL)</option>
                  <option value="CONVENIENT">Bao xe (CONVENIENT)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bulk-vehicle" className="text-xs font-semibold">Loại phương tiện</Label>
                <select
                  id="bulk-vehicle"
                  className={NATIVE_SELECT}
                  value={form.vehicleType}
                  onChange={(e) => setForm((p) => ({ ...p, vehicleType: e.target.value }))}
                >
                  <option value="ALL">Tất cả loại xe</option>
                  <option value="4SEATS">Xe 4 chỗ</option>
                  <option value="7SEATS">Xe 7 chỗ</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bulk-type" className="text-xs font-semibold">Kiểu điều chỉnh</Label>
                <select
                  id="bulk-type"
                  className={NATIVE_SELECT}
                  value={form.adjustmentType}
                  onChange={(e) => setForm((p) => ({ ...p, adjustmentType: e.target.value as MacroAdjustmentType }))}
                >
                  <option value="DELTA_AMOUNT">Cộng/Trừ tiền cố định (± VNĐ)</option>
                  <option value="PERCENTAGE">Theo phần trăm (± %)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bulk-value" className="text-xs font-semibold">
                  Giá trị ({form.adjustmentType === 'PERCENTAGE' ? '%' : 'VNĐ'}) *
                </Label>
                <Input
                  id="bulk-value"
                  className="h-8 text-xs"
                  type="number"
                  {...adjustmentValueRange(form.adjustmentType)}
                  value={form.adjustmentValue}
                  onChange={(e) => setForm((p) => ({ ...p, adjustmentValue: e.target.value }))}
                />
                <div className={`text-[11px] ${valueError && form.adjustmentValue.trim() !== '' ? 'text-red-600' : 'text-slate-400'}`}>
                  {valueError && form.adjustmentValue.trim() !== '' ? valueError : adjustmentValueHint(form.adjustmentType)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="bulk-bidirectional"
                    checked={form.isBidirectional}
                    onCheckedChange={(c) => setForm((p) => ({ ...p, isBidirectional: !!c }))}
                  />
                  <Label htmlFor="bulk-bidirectional" className="text-xs font-normal cursor-pointer">
                    Áp dụng cả chiều ngược (trả → đón)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="bulk-active"
                    checked={form.isActive}
                    onCheckedChange={(c) => setForm((p) => ({ ...p, isActive: !!c }))}
                  />
                  <Label htmlFor="bulk-active" className="text-xs font-normal cursor-pointer">
                    Kích hoạt ngay
                  </Label>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bulk-priority" className="text-xs font-semibold">Độ ưu tiên (chỉ phân xử khi hai quy tắc khớp chi tiết như nhau)</Label>
                <Input
                  id="bulk-priority"
                  className="h-8 text-xs"
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                />
                {prioError && <div className="text-[11px] text-red-600">{prioError}</div>}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="bulk-note" className="text-xs font-semibold">Ghi chú</Label>
              <Input
                id="bulk-note"
                className="h-8 text-xs"
                placeholder="Ghi chú nội bộ cho admin..."
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              />
            </div>

            {selection.ok && (
              <div className="rounded border border-indigo-200 bg-indigo-50/60 p-2 text-slate-700" data-testid="bulk-summary">
                <span className="font-semibold">Sẽ tạo:</span> {selection.combos} quy tắc · Đón: {summarizeEndpoints(origins)}{' '}
                {form.isBidirectional ? '↔' : '→'} Trả: {summarizeEndpoints(dests)} ·{' '}
                {form.isBidirectional ? 'hai chiều' : 'chỉ chiều đón → trả'} ·{' '}
                {valueError ? 'mức điều chỉnh chưa hợp lệ' : formatMacroAdjustment(form.adjustmentType, value, true)} ·{' '}
                {form.isActive ? 'BẬT ngay' : 'tạo ở trạng thái tắt'}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => handleOpenChange(false)}>
                Huỷ
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving || !!firstError}
                title={firstError ?? undefined}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                Tạo {selection.ok ? selection.combos : ''} quy tắc
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
