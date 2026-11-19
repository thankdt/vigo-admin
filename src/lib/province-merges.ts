import { foldVietnamese } from '@/components/ui/combobox-filter';

/**
 * Ánh xạ 63 tỉnh/thành trước sáp nhập 07/2025 → 34 tỉnh/thành mới (mã GIS).
 *
 * Nguồn chuẩn: `vigo-backend/src/database/migrations/1778100000000-AddProvinceMergedIntoCode.ts`
 * + `ward_legacy_parts.json.gz`.
 *
 * Phân tách rõ:
 * - `mergedFrom`: danh sách TỈNH CŨ bị sáp nhập vào tỉnh mới (mỗi tỉnh cũ chỉ là MỘT PHẦN của tỉnh mới).
 * - `mergedAliases`: các cách viết thay thế/viết tắt phổ biến của những tỉnh cũ đó (vd "Vũng Tàu", "BRVT", "Bắc Cạn", "Đắc Nông").
 * - `sameBoundaryAliases`: tên cũ/nhãn UI/viết tắt tương đương 1-1 toàn bộ địa bàn tỉnh mới
 *   (vd `Thừa Thiên Huế` → `Huế`, `Nội đô Hà Nội` → `Hà Nội`).
 */
export type ProvinceMergeSpec = {
  /** Tên hiển thị chuẩn của các tỉnh cũ đã sáp nhập vào tỉnh này (nếu có). */
  mergedFrom?: readonly string[];
  /** Cách gọi không chính thức / viết tắt / chính tả khác của các tỉnh cũ ở trên. */
  mergedAliases?: readonly string[];
  /** Bí danh tương đương 1-1 toàn tỉnh (không mở rộng phạm vi địa bàn). */
  sameBoundaryAliases?: readonly string[];
};

export const PROVINCE_MERGE_SPECS: Readonly<Record<string, ProvinceMergeSpec>> = {
  '01': { sameBoundaryAliases: ['Nội đô Hà Nội', 'HN'] },
  '08': { mergedFrom: ['Hà Giang'] },
  '15': { mergedFrom: ['Yên Bái'] },
  '19': { mergedFrom: ['Bắc Kạn'], mergedAliases: ['Bắc Cạn'] },
  '24': { mergedFrom: ['Bắc Giang'] },
  '25': { mergedFrom: ['Hoà Bình', 'Vĩnh Phúc'], mergedAliases: ['Hòa Bình'] },
  '31': { mergedFrom: ['Hải Dương'], sameBoundaryAliases: ['HP'] },
  '33': { mergedFrom: ['Thái Bình'] },
  '37': { mergedFrom: ['Hà Nam', 'Nam Định'] },
  '44': { mergedFrom: ['Quảng Bình'] },
  '46': { sameBoundaryAliases: ['Thừa Thiên Huế', 'Thừa Thiên - Huế', 'TT Huế'] },
  '48': { mergedFrom: ['Quảng Nam'] },
  '51': { mergedFrom: ['Kon Tum'] },
  '52': { mergedFrom: ['Bình Định'] },
  '56': { mergedFrom: ['Ninh Thuận'] },
  '66': { mergedFrom: ['Phú Yên'], sameBoundaryAliases: ['Đắc Lắc', 'Đắc Lắk', 'Đắk Lắc'] },
  '68': { mergedFrom: ['Bình Thuận', 'Đắk Nông'], mergedAliases: ['Đắc Nông'] },
  '75': { mergedFrom: ['Bình Phước'] },
  '79': {
    mergedFrom: ['Bình Dương', 'Bà Rịa - Vũng Tàu'],
    mergedAliases: ['Bà Rịa Vũng Tàu', 'Vũng Tàu', 'BRVT', 'BR-VT'],
    sameBoundaryAliases: ['HCM', 'TPHCM', 'SG', 'Sài Gòn'],
  },
  '80': { mergedFrom: ['Long An'] },
  '82': { mergedFrom: ['Tiền Giang'] },
  '86': { mergedFrom: ['Bến Tre', 'Trà Vinh'] },
  '91': { mergedFrom: ['Kiên Giang'] },
  '92': { mergedFrom: ['Hậu Giang', 'Sóc Trăng'] },
  '96': { mergedFrom: ['Bạc Liêu'] },
};

const CORE_NAME_TO_CODE: Readonly<Record<string, string>> = {
  'ha noi': '01',
  'cao bang': '04',
  'tuyen quang': '08',
  'tuien quang': '08',
  'dien bien': '11',
  'lai chau': '12',
  'son la': '14',
  'lao cai': '15',
  'thai nguyen': '19',
  'thai nguien': '19',
  'lang son': '20',
  'quang ninh': '22',
  'bac ninh': '24',
  'phu tho': '25',
  'hai phong': '31',
  'hung yen': '33',
  'hung ien': '33',
  'ninh binh': '37',
  'thanh hoa': '38',
  'nghe an': '40',
  'ha tinh': '42',
  'quang tri': '44',
  hue: '46',
  'da nang': '48',
  'quang ngai': '51',
  'gia lai': '52',
  'khanh hoa': '56',
  'dak lak': '66',
  'lam dong': '68',
  'dong nai': '75',
  'ho chi minh': '79',
  'tay ninh': '80',
  'tai ninh': '80',
  'dong thap': '82',
  'vinh long': '86',
  'an giang': '91',
  'can tho': '92',
  'ca mau': '96',
};

function normalizeCoreProvinceName(raw?: string | null): string {
  if (!raw) return '';
  return foldVietnamese(raw)
    .replace(/y/g, 'i')
    .replace(/^(?:tinh\s+|thanh pho\s+|tp\.\s*|tp\s+)/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCanonicalProvinceCode(code?: string | null, rawName?: string | null): string | null {
  const core = normalizeCoreProvinceName(rawName);
  if (core && CORE_NAME_TO_CODE[core]) return CORE_NAME_TO_CODE[core];
  if (!rawName && code && PROVINCE_MERGE_SPECS[code]) return code;
  if (code && PROVINCE_MERGE_SPECS[code]) {
    // Chỉ fallback về mã nếu tên không phải tên một tỉnh hoàn toàn khác (ví dụ mock cũ dùng mã '35' cho Ninh Bình hay Hà Nam).
    return CORE_NAME_TO_CODE[core] ?? (!core ? code : null);
  }
  return null;
}

/** Danh sách tên tỉnh cũ đã sáp nhập (hoặc đổi tên 1-1 như Thừa Thiên Huế) để hiển thị gợi ý cho admin. */
export function getProvinceOldNames(code?: string | null, rawName?: string | null): readonly string[] {
  const canonical = resolveCanonicalProvinceCode(code, rawName);
  if (!canonical) return [];
  const spec = PROVINCE_MERGE_SPECS[canonical];
  if (!spec) return [];
  if (spec.mergedFrom && spec.mergedFrom.length > 0) return spec.mergedFrom;
  if (canonical === '46') return ['Thừa Thiên Huế'];
  return [];
}

/** Tập từ khoá tìm kiếm mở rộng phân tách rạch ròi: ngang bằng 1-1 vs tỉnh cũ bị gộp (một phần). */
export function getProvinceSearchTerms(
  code?: string | null,
  rawName?: string | null,
): { exactAliases: string[]; subsetOldNames: string[] } {
  const canonical = resolveCanonicalProvinceCode(code, rawName);
  if (!canonical) return { exactAliases: [], subsetOldNames: [] };
  const spec = PROVINCE_MERGE_SPECS[canonical];
  if (!spec) return { exactAliases: [], subsetOldNames: [] };
  return {
    exactAliases: [...(spec.sameBoundaryAliases ?? [])],
    subsetOldNames: [...(spec.mergedFrom ?? []), ...(spec.mergedAliases ?? [])],
  };
}

/** Từ khoá truyền cho `Combobox` (`cmdk`) để gõ tên tỉnh cũ vẫn tìm ra đúng tỉnh mới. */
export function provinceComboboxKeywords(code?: string | null, rawName?: string | null): string[] {
  const { exactAliases, subsetOldNames } = getProvinceSearchTerms(code, rawName);
  const all = [...exactAliases, ...subsetOldNames];
  const expanded: string[] = [];
  for (const term of all) {
    expanded.push(term);
    if (!/^(hn|hp|hcm|tphcm|sg|brvt|br-vt|tt huế)$/i.test(term)) {
      expanded.push(`${term} cũ`);
    }
  }
  return expanded;
}

/** Ghi chú phụ hiện dưới tên tỉnh (ví dụ "gồm: Hà Nam, Nam Định cũ"). */
export function provinceOldNamesHint(code?: string | null, rawName?: string | null): string | undefined {
  const canonical = resolveCanonicalProvinceCode(code, rawName);
  if (!canonical) return undefined;
  const spec = PROVINCE_MERGE_SPECS[canonical];
  if (spec?.mergedFrom && spec.mergedFrom.length > 0) {
    return `gồm ${spec.mergedFrom.join(', ')} cũ`;
  }
  if (canonical === '46') {
    return 'tên cũ: Thừa Thiên Huế';
  }
  return undefined;
}
