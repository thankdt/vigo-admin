import type { MacroEndpoint } from './macro-bulk';
import type { WardOption } from './types';

/** Mã xã → điểm đón/trả (bỏ mã không có trong `wards`). */
export function wardsToEndpoints(
  codes: string[],
  wards: Pick<WardOption, 'code' | 'name' | 'provinceCode'>[],
  provinceNames: Map<string, string>,
): MacroEndpoint[] {
  const byCode = new Map(wards.map((w) => [w.code, w]));
  const out: MacroEndpoint[] = [];
  for (const c of codes) {
    const w = byCode.get(c);
    if (!w) continue;
    const prov = provinceNames.get(w.provinceCode);
    out.push({ provinceCode: w.provinceCode, wardCode: w.code, label: prov ? `${w.name} (${prov})` : w.name });
  }
  return out;
}
