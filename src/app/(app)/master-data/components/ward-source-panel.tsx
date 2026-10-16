'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import {
  getPricingMacroWards,
  getWardLegacyOrigins,
  getWardLegacyWards,
  listWardGroups,
} from '@/lib/api';
import type { MacroEndpoint } from '@/lib/macro-bulk';
import { matchWardNames, splitPasteInput, wardsToEndpoints, type WardMatchResult } from '@/lib/ward-match';
import type { ProvinceOption, WardGroup, WardLegacyProvince, WardLegacyWard, WardOption } from '@/lib/types';

const NATIVE_SELECT =
  'h-8 w-full rounded-md border border-input bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';

type Mode = 'legacy' | 'group' | 'paste';
const MODES: { id: Mode; label: string }[] = [
  { id: 'legacy', label: 'Theo tỉnh cũ / huyện cũ' },
  { id: 'group', label: 'Nhóm xã' },
  { id: 'paste', label: 'Dán danh sách' },
];

/**
 * Cách thêm xã nhanh cho một bên (đón/trả) hoặc một nhóm xã: theo tỉnh/huyện cũ, theo nhóm xã đã lưu, hoặc dán
 * tên/mã. Chỉ SINH điểm (`onAdd`) — cha quyết định gộp/trùng/giới hạn. Danh sách mọi xã nạp một lần khi cần.
 */
export function WardSourcePanel({
  title,
  provinces,
  onAdd,
}: {
  title: string;
  provinces: ProvinceOption[];
  onAdd: (endpoints: MacroEndpoint[]) => void;
}) {
  const [mode, setMode] = React.useState<Mode | null>(null);
  const [allWards, setAllWards] = React.useState<WardOption[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const provinceNames = React.useMemo(() => new Map(provinces.map((p) => [p.code, p.name])), [provinces]);

  // Cần bản đồ mã xã → (tên, tỉnh mới) cho nhóm xã và kết quả theo vùng cũ; nạp một lần, chỉ khi mở panel.
  React.useEffect(() => {
    if (!mode || allWards) return;
    let alive = true;
    getPricingMacroWards()
      .then((w) => alive && setAllWards(w || []))
      .catch((e) => alive && setError(e?.message || 'Không tải được danh sách phường/xã'));
    return () => {
      alive = false;
    };
  }, [mode, allWards]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label={`${title}: cách thêm nhanh`}>
        {MODES.map((m) => (
          <Button
            key={m.id}
            type="button"
            size="sm"
            variant={mode === m.id ? 'secondary' : 'ghost'}
            className="h-7 text-xs"
            onClick={() => setMode(mode === m.id ? null : m.id)}
            aria-pressed={mode === m.id}
            aria-label={`${title}: ${m.label}`}
          >
            {m.label}
          </Button>
        ))}
      </div>
      {mode && error && (
        <div role="alert" className="text-[11px] text-red-600">
          {error}
        </div>
      )}
      {mode === 'legacy' && (
        <LegacyPicker title={title} allWards={allWards} provinceNames={provinceNames} onAdd={onAdd} />
      )}
      {mode === 'group' && (
        <GroupPicker title={title} allWards={allWards} provinceNames={provinceNames} onAdd={onAdd} />
      )}
      {mode === 'paste' && (
        <PastePicker title={title} provinces={provinces} provinceNames={provinceNames} onAdd={onAdd} />
      )}
    </div>
  );
}

// ───────────────────────── Theo tỉnh cũ / huyện cũ ─────────────────────────

function LegacyPicker({
  title,
  allWards,
  provinceNames,
  onAdd,
}: {
  title: string;
  allWards: WardOption[] | null;
  provinceNames: Map<string, string>;
  onAdd: (endpoints: MacroEndpoint[]) => void;
}) {
  const [origins, setOrigins] = React.useState<WardLegacyProvince[] | null>(null);
  const [provCode, setProvCode] = React.useState('');
  const [distCode, setDistCode] = React.useState('');
  const [rows, setRows] = React.useState<WardLegacyWard[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const seq = React.useRef(0);

  React.useEffect(() => {
    let alive = true;
    getWardLegacyOrigins()
      .then((o) => alive && setOrigins(o || []))
      .catch((e) => alive && setError(e?.message || 'Không tải được danh sách tỉnh/huyện cũ'));
    return () => {
      alive = false;
    };
  }, []);

  const prov = origins?.find((o) => o.code === provCode);

  const load = async (province: string, district: string) => {
    const mine = ++seq.current;
    setRows(null);
    setChecked(new Set());
    setLoading(false);
    setError(null);
    if (!province) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getWardLegacyWards(district ? { legacyDistrictCode: district } : { legacyProvinceCode: province });
      if (mine !== seq.current) return;
      setRows(list || []);
      // Xã thuần ở mức đang lọc được tích sẵn; xã gộp (không thuần) để admin tự quyết từng xã.
      // Lọc theo huyện chỉ gửi mã huyện: xã có thành phần ở tỉnh cũ KHÁC (mã huyện trùng do dữ liệu lệch) không được tích sẵn.
      setChecked(
        new Set(
          (list || [])
            .filter((w) => w.selectable && w.parts.some((p) => p.legacyProvinceCode === province))
            .map((w) => w.wardCode),
        ),
      );
    } catch (e: any) {
      if (mine === seq.current) setError(e?.message || 'Không tải được danh sách phường/xã');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  };

  const toggle = (code: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });

  const pure = (rows ?? []).filter((w) => w.selectable);
  const mixed = (rows ?? []).filter((w) => !w.selectable);
  const add = () => {
    // Dựng thẳng từ kết quả API (đã có tên + tỉnh mới): không phụ thuộc danh sách mọi xã nạp riêng, không bỏ xã lặng lẽ.
    const eps = (rows ?? [])
      .filter((w) => checked.has(w.wardCode))
      .map((w) => ({
        provinceCode: w.provinceCode,
        wardCode: w.wardCode,
        label: `${w.wardName} (${provinceNames.get(w.provinceCode) ?? w.provinceName})`,
      }));
    onAdd(eps);
    setChecked(new Set());
  };
  const label = (w: WardLegacyWard) => `${w.wardName} (${provinceNames.get(w.provinceCode) ?? w.provinceName})`;

  return (
    <div className="space-y-2 rounded border border-slate-200 bg-white p-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-slate-500">Tỉnh cũ (trước 01/07/2025)</Label>
          <Combobox
            ariaLabel={`${title}: tỉnh cũ`}
            className="h-8 text-xs bg-white"
            options={(origins ?? []).map((o) => ({ value: o.code, label: `${o.name} (${o.wardCount} xã mới)` }))}
            selectedValue={provCode}
            disabled={!origins}
            onSelect={(c) => {
              // Bấm lại mục đang chọn ⇒ undefined ⇒ bỏ chọn.
              const next = c ?? '';
              setProvCode(next);
              setDistCode('');
              void load(next, '');
            }}
            placeholder={origins ? '— Chọn tỉnh cũ —' : 'Đang tải...'}
            searchPlaceholder="Tìm tỉnh cũ..."
            noResultsText="Không tìm thấy tỉnh cũ"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-slate-500">Huyện cũ (bỏ trống = cả tỉnh cũ)</Label>
          <Combobox
            ariaLabel={`${title}: huyện cũ`}
            className="h-8 text-xs bg-white"
            options={(prov?.districts ?? []).map((d) => ({ value: d.code, label: `${d.name} (${d.pureWardCount}/${d.wardCount})` }))}
            selectedValue={distCode}
            disabled={!prov}
            onSelect={(c) => {
              // Bấm lại huyện đang chọn ⇒ undefined ⇒ quay về cả tỉnh cũ.
              const next = c ?? '';
              setDistCode(next);
              void load(provCode, next);
            }}
            placeholder="— Cả tỉnh cũ —"
            searchPlaceholder="Tìm huyện cũ..."
            noResultsText="Không tìm thấy huyện cũ"
          />
        </div>
      </div>
      {loading && (
        <div className="flex items-center gap-1 text-[11px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Đang tải...
        </div>
      )}
      {error && (
        <div role="alert" className="text-[11px] text-red-600">
          {error}
        </div>
      )}
      {rows && (
        <div className="space-y-2">
          <div className="text-[11px] text-slate-500">
            Nhãn tỉnh/huyện cũ lấy từ bảng chuyển đổi đơn vị hành chính (chưa đối chiếu nghị quyết gốc).
          </div>
          <div className="text-[11px] font-semibold text-slate-700">
            Xã thuần ({pure.length}) — thuộc trọn vẹn vùng cũ đã chọn
          </div>
          <div className="max-h-32 overflow-y-auto space-y-0.5" role="group" aria-label={`${title}: xã thuần`}>
            {pure.length === 0 && <div className="text-[11px] text-slate-400">Không có.</div>}
            {pure.map((w) => (
              <label key={w.wardCode} className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={checked.has(w.wardCode)} onCheckedChange={(v) => toggle(w.wardCode, v === true)} />
                {label(w)}
              </label>
            ))}
          </div>
          {mixed.length > 0 && (
            <>
              <div className="text-[11px] font-semibold text-amber-800">
                Xã gộp từ nhiều huyện/tỉnh cũ ({mixed.length}) — không tự thêm, hãy tự quyết từng xã
              </div>
              <div className="max-h-32 overflow-y-auto space-y-0.5" role="group" aria-label={`${title}: xã gộp`}>
                {mixed.map((w) => (
                  <label key={w.wardCode} className="flex items-start gap-1.5 text-xs">
                    <Checkbox
                      className="mt-0.5"
                      checked={checked.has(w.wardCode)}
                      onCheckedChange={(v) => toggle(w.wardCode, v === true)}
                    />
                    <span>
                      {label(w)}
                      <span className="block text-[11px] text-slate-500">
                        gộp từ: {w.parts.map((p) => `${p.legacyDistrictName} (${p.legacyProvinceName})`).join('; ')}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={checked.size === 0}
            onClick={add}
            aria-label={`${title}: thêm ${checked.size} xã theo vùng cũ`}
          >
            Thêm {checked.size} phường/xã
          </Button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Nhóm xã ─────────────────────────

function GroupPicker({
  title,
  allWards,
  provinceNames,
  onAdd,
}: {
  title: string;
  allWards: WardOption[] | null;
  provinceNames: Map<string, string>;
  onAdd: (endpoints: MacroEndpoint[]) => void;
}) {
  const [groups, setGroups] = React.useState<WardGroup[] | null>(null);
  const [groupId, setGroupId] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    listWardGroups()
      .then((g) => alive && setGroups(g || []))
      .catch((e) => alive && setError(e?.message || 'Không tải được nhóm xã'));
    return () => {
      alive = false;
    };
  }, []);

  const group = groups?.find((g) => String(g.id) === groupId);
  const live = group ? group.wardCodes.filter((c) => !group.staleCodes.includes(c)) : [];
  const endpoints = group && allWards ? wardsToEndpoints(live, allWards, provinceNames) : [];
  // Mã còn sống nhưng không có trong danh sách xã đã nạp (nạp lỗi/rỗng): báo thay vì thêm ít hơn nút ghi.
  const missing = group && allWards ? live.length - endpoints.length : 0;

  return (
    <div className="space-y-2 rounded border border-slate-200 bg-white p-2">
      <Combobox
        ariaLabel={`${title}: chọn nhóm xã`}
        className="h-8 text-xs bg-white"
        options={(groups ?? []).map((g) => ({ value: String(g.id), label: `${g.name} (${g.wardCount} xã)` }))}
        selectedValue={groupId}
        disabled={!groups}
        onSelect={(c) => setGroupId(c ?? '')}
        placeholder={groups ? (groups.length ? '— Chọn nhóm xã —' : 'Chưa có nhóm xã nào') : 'Đang tải...'}
        searchPlaceholder="Tìm nhóm xã..."
        noResultsText="Không tìm thấy nhóm"
      />
      {error && (
        <div role="alert" className="text-[11px] text-red-600">
          {error}
        </div>
      )}
      {group && group.staleCodes.length > 0 && (
        <div className="text-[11px] text-amber-800">
          {group.staleCodes.length} xã trong nhóm không còn trong dữ liệu ranh giới — sẽ bị bỏ qua.
        </div>
      )}
      {missing > 0 && (
        <div role="alert" className="text-[11px] text-red-600">
          {missing} xã của nhóm không tìm thấy trong danh sách phường/xã đã tải — chỉ thêm được {endpoints.length} xã.
        </div>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={!group || endpoints.length === 0 || missing > 0}
        onClick={() => onAdd(endpoints)}
        aria-label={`${title}: thêm nhóm xã`}
      >
        {group ? `Thêm nhóm (${live.length} xã)` : 'Thêm nhóm'}
      </Button>
    </div>
  );
}

// ───────────────────────── Dán danh sách ─────────────────────────

function PastePicker({
  title,
  provinces,
  provinceNames,
  onAdd,
}: {
  title: string;
  provinces: ProvinceOption[];
  provinceNames: Map<string, string>;
  onAdd: (endpoints: MacroEndpoint[]) => void;
}) {
  const [provinceCode, setProvinceCode] = React.useState('');
  const [wards, setWards] = React.useState<WardOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [text, setText] = React.useState('');
  const [result, setResult] = React.useState<WardMatchResult | null>(null);
  // Xã admin chọn tay cho các dòng trùng tên: input → mã xã.
  const [picked, setPicked] = React.useState<Record<string, string>>({});
  const seq = React.useRef(0);

  const options = React.useMemo(
    () => [{ value: '', label: '— Chọn tỉnh —' }, ...provinces.map((p) => ({ value: p.code, label: p.name }))],
    [provinces],
  );

  const chooseProvince = async (code: string) => {
    setProvinceCode(code);
    setResult(null);
    setPicked({});
    setWards([]);
    setLoadError(null);
    const mine = ++seq.current;
    setLoading(false);
    if (!code) return;
    setLoading(true);
    try {
      const list = await getPricingMacroWards(code);
      if (mine === seq.current) {
        setWards(list || []);
        if (!list || list.length === 0) setLoadError('Tỉnh này không có phường/xã nào trong dữ liệu — không thể khớp tên.');
      }
    } catch (e: any) {
      if (mine === seq.current) {
        setWards([]);
        setLoadError(e?.message || 'Không tải được danh sách phường/xã của tỉnh');
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  };

  const match = () => {
    setPicked({});
    setResult(matchWardNames(splitPasteInput(text), wards));
  };

  const codes = result
    ? [...result.matched.map((m) => m.ward.code), ...Object.values(picked).filter(Boolean)]
    : [];
  const add = () => {
    onAdd(wardsToEndpoints([...new Set(codes)], wards, provinceNames));
    setResult(null);
    setPicked({});
    setText('');
  };

  return (
    <div className="space-y-2 rounded border border-slate-200 bg-white p-2">
      <div className="space-y-1">
        <Label className="text-[11px] text-slate-500">Tỉnh/thành mới chứa các xã sẽ dán (khớp theo tên MỚI)</Label>
        <Combobox
          ariaLabel={`${title}: tỉnh để khớp tên`}
          className="h-8 text-xs bg-white"
          options={options}
          selectedValue={provinceCode}
          onSelect={(c) => {
            if (c !== undefined) void chooseProvince(c);
          }}
          placeholder="— Chọn tỉnh —"
          searchPlaceholder="Tìm tỉnh / thành phố..."
          noResultsText="Không tìm thấy tỉnh"
        />
      </div>
      {loadError && (
        <div role="alert" className="text-[11px] text-red-600">
          {loadError}
        </div>
      )}
      <textarea
        className="min-h-20 w-full rounded-md border border-input bg-white p-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label={`${title}: danh sách tên hoặc mã xã`}
        placeholder="Mỗi dòng một tên hoặc mã xã (hoặc ngăn cách bằng dấu phẩy)"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={!provinceCode || loading || !!loadError || !text.trim()}
        onClick={match}
        aria-label={`${title}: khớp danh sách`}
      >
        {loading ? 'Đang tải xã...' : 'Khớp danh sách'}
      </Button>

      {result && (
        <div className="space-y-2 text-xs" data-testid="paste-preview">
          <div className="text-emerald-700">Tự khớp ({result.matched.length})</div>
          {result.matched.length > 0 && (
            <ul className="list-disc pl-5 text-slate-700">
              {result.matched.map((m) => (
                <li key={m.ward.code}>
                  {m.input} → {m.ward.name}
                </li>
              ))}
            </ul>
          )}
          {result.ambiguous.length > 0 && (
            <div className="space-y-1">
              <div className="text-amber-800">Cần chọn ({result.ambiguous.length}) — nhiều xã cùng tên</div>
              {result.ambiguous.map((a) => (
                <div key={a.input} className="flex items-center gap-2">
                  <span className="min-w-24">{a.input}</span>
                  <select
                    className={NATIVE_SELECT}
                    aria-label={`Chọn xã cho "${a.input}"`}
                    value={picked[a.input] ?? ''}
                    onChange={(e) => setPicked((p) => ({ ...p, [a.input]: e.target.value }))}
                  >
                    <option value="">— Chọn —</option>
                    {a.candidates.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
          {result.unmatched.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-red-700">Không khớp ({result.unmatched.length}) — sẽ KHÔNG được thêm</div>
              <ul className="list-disc pl-5 text-slate-700">
                {result.unmatched.map((u) => (
                  <li key={u.input}>
                    {u.input}
                    {u.suggestions.length > 0 && (
                      <span className="text-slate-500"> — gợi ý: {u.suggestions.map((s) => s.name).join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={codes.length === 0}
            onClick={add}
            aria-label={`${title}: thêm các xã đã khớp`}
          >
            Thêm {new Set(codes).size} xã đã khớp
          </Button>
        </div>
      )}
    </div>
  );
}
