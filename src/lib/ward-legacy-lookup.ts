import legacyRaw from './ward-legacy-data.json';

type RawLegacyData = {
  /** provinceCode -> tên tỉnh/thành rút gọn (vd "01" -> "Hà Nội"). */
  p: Record<string, string>;
  /** [tên quận/huyện cũ, mã tỉnh mới, tên tỉnh cũ (rỗng nếu trùng tỉnh mới), [mã xã mới...]] */
  d: [string, string, string, string[]][];
  /** wardCode -> [mã tỉnh mới, [chỉ số huyện trong d...], [tên phường/xã cũ...]] */
  w: Record<string, [string, number[], string[]]>;
};

const RAW = legacyRaw as unknown as RawLegacyData;

export type LegacyDistrictInfo = {
  index: number;
  name: string;
  newProvinceCode: string;
  newProvinceName: string;
  /** Rỗng nếu tên tỉnh cũ trùng tên tỉnh mới (vd Hà Nội); ngược lại là tên tỉnh cũ (vd "Long An"). */
  oldProvinceName: string;
  /** Có >= 2 quận/huyện cũ trùng y hệt tên (vd Huyện Châu Thành, Huyện Chợ Mới). */
  isDuplicateName: boolean;
  wardCodes: string[];
};

const nameCounts = new Map<string, number>();
for (const [name] of RAW.d) {
  nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
}

export const LEGACY_PROVINCE_NAMES: Record<string, string> = RAW.p;

export const LEGACY_DISTRICTS: LegacyDistrictInfo[] = RAW.d.map(
  ([name, newProvinceCode, oldProvinceName, wardCodes], index) => ({
    index,
    name,
    newProvinceCode,
    newProvinceName: RAW.p[newProvinceCode] ?? newProvinceCode,
    oldProvinceName,
    isDuplicateName: (nameCounts.get(name) ?? 0) > 1,
    wardCodes,
  }),
);

export type WardLegacyInfo = {
  districtIndices: number[];
  districtNames: string[];
  oldWardNames: string[];
  /** Tên tỉnh cũ (nếu sáp nhập sang tỉnh mới khác tên). */
  oldProvinceNames: string[];
};

const wardCache = new Map<string, WardLegacyInfo>();

/**
 * Tra cứu quận/huyện cũ & phường/xã cũ của một xã/phường mới.
 *
 * RÀO CHỐNG ĐỤNG MÃ TEST: chỉ trả kết quả khi CẢ `provinceCode` lẫn `wardCode`
 * khớp đúng tỉnh thật trong `ward-legacy-data.json` (vd fixture test tổng hợp
 * dùng `{ provinceCode: '15', code: '15001' }` sẽ KHÔNG đụng `'38'|'15001'` thật).
 */
export function getWardLegacyInfo(provinceCode: string | undefined, wardCode: string | undefined): WardLegacyInfo | null {
  if (!provinceCode || !wardCode) return null;
  const raw = RAW.w[wardCode];
  if (!raw || raw[0] !== provinceCode) return null;

  const cacheKey = `${provinceCode}|${wardCode}`;
  const cached = wardCache.get(cacheKey);
  if (cached) return cached;

  const districtIndices = raw[1];
  const districtNames: string[] = [];
  const oldProvinceNames: string[] = [];
  for (const idx of districtIndices) {
    const dist = LEGACY_DISTRICTS[idx];
    if (!dist) continue;
    if (!districtNames.includes(dist.name)) districtNames.push(dist.name);
    if (dist.oldProvinceName && !oldProvinceNames.includes(dist.oldProvinceName)) {
      oldProvinceNames.push(dist.oldProvinceName);
    }
  }

  const info: WardLegacyInfo = {
    districtIndices,
    districtNames,
    oldWardNames: raw[2],
    oldProvinceNames,
  };
  wardCache.set(cacheKey, info);
  return info;
}

/** Từ khoá bổ sung để Combobox / MultiSelectComboBox gõ được tên huyện cũ, xã cũ, Q1..Q12. */
export function wardComboboxKeywords(
  provinceCode: string | undefined,
  wardCode: string | undefined,
): string[] | undefined {
  const info = getWardLegacyInfo(provinceCode, wardCode);
  if (!info) return undefined;
  const out: string[] = [...info.districtNames, ...info.oldWardNames, ...info.oldProvinceNames];
  for (const distName of info.districtNames) {
    const numMatch = /^Quận\s+(\d+)$/i.exec(distName.trim());
    if (numMatch) {
      out.push(`q${numMatch[1]}`, `q.${numMatch[1]}`);
    }
  }
  return out;
}

/** Gợi ý ngắn hiện bên cạnh tên xã trong Combobox (vd "thuộc Quận Bắc Từ Liêm cũ"). */
export function wardComboboxHint(
  provinceCode: string | undefined,
  wardCode: string | undefined,
): string | undefined {
  const info = getWardLegacyInfo(provinceCode, wardCode);
  if (!info || info.districtNames.length === 0) return undefined;
  if (info.districtNames.length <= 2) {
    return `thuộc ${info.districtNames.join(', ')} cũ`;
  }
  return `thuộc ${info.districtNames[0]}, +${info.districtNames.length - 1} huyện cũ`;
}
