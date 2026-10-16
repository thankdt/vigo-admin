import type { MacroEndpoint } from './macro-bulk';
import type { WardOption } from './types';

const PREFIX = /^(phuong|xa|thi tran|dac khu)\s+/;

/** Chuẩn hoá để so khớp: NFD bỏ dấu, đ→d, thường, bỏ tiền tố xã/phường/thị trấn/đặc khu, gộp khoảng trắng. */
export function normalizeWardName(raw: string): string {
  const base = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return base.replace(PREFIX, '').trim();
}

/** Tên có tiền tố rõ ràng (để phân biệt "Phường X" với "Xã X"): chỉ bỏ dấu/hoa thường, GIỮ tiền tố. */
function fullKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitPasteInput(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n\r,;\t]+/)) {
    const t = part.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export type WardMatchResult = {
  matched: { input: string; ward: WardOption }[];
  ambiguous: { input: string; candidates: WardOption[] }[];
  unmatched: { input: string; suggestions: WardOption[] }[];
};

/** Khớp từng dòng người dùng dán với danh sách xã (đã giới hạn trong MỘT tỉnh). Không tự áp gợi ý. */
export function matchWardNames(inputs: string[], wards: WardOption[]): WardMatchResult {
  const byCode = new Map(wards.map((w) => [w.code, w]));
  const byNorm = new Map<string, WardOption[]>();
  for (const w of wards) {
    const k = normalizeWardName(w.name);
    byNorm.set(k, [...(byNorm.get(k) ?? []), w]);
  }
  const res: WardMatchResult = { matched: [], ambiguous: [], unmatched: [] };
  const taken = new Set<string>();
  const accept = (input: string, w: WardOption) => {
    if (taken.has(w.code)) return;
    taken.add(w.code);
    res.matched.push({ input, ward: w });
  };

  for (const input of inputs) {
    const code = input.trim();
    if (/^\d{5}$/.test(code) && byCode.has(code)) {
      accept(input, byCode.get(code)!);
      continue;
    }
    const norm = normalizeWardName(input);
    let cands = byNorm.get(norm) ?? [];
    if (cands.length > 1) {
      // Người dùng gõ cả tiền tố ("Phường X") ⇒ dùng nó để chọn đúng xã.
      const exact = cands.filter((w) => fullKey(w.name) === fullKey(input));
      if (exact.length === 1) cands = exact;
    }
    if (cands.length === 1) accept(input, cands[0]);
    else if (cands.length > 1) res.ambiguous.push({ input, candidates: cands });
    else {
      const scored = wards
        .map((w) => ({ w, d: distance(norm, normalizeWardName(w.name)) }))
        .filter((s) => s.d <= Math.max(2, Math.floor(norm.length / 3)))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .map((s) => s.w);
      res.unmatched.push({ input, suggestions: scored });
    }
  }
  return res;
}

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
