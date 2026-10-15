import type { ProvinceOption } from '@/lib/types';

/** Giá trị "không lọc" của cả hai bộ lọc địa lý (tỉnh / tuyến cũ). */
export const GEO_FILTER_ALL = 'ALL';
/** Sentinel của BE: chuyến còn THIẾU mã tỉnh ở ít nhất một đầu. */
export const PROVINCE_FILTER_NONE = 'none';

/** Tham số lọc địa lý của `getBookings`, tách ra để test được mà không phải render cả bảng. */
export function geoFilterParams(
  provinceFilter: string,
  legacyRouteFilter: string,
): { provinceCode?: string; routeId?: number } {
  const out: { provinceCode?: string; routeId?: number } = {};
  if (provinceFilter !== GEO_FILTER_ALL && provinceFilter.trim() !== '') {
    out.provinceCode = provinceFilter;
  }
  if (legacyRouteFilter !== GEO_FILTER_ALL) {
    const id = Number(legacyRouteFilter);
    if (Number.isFinite(id)) out.routeId = id;
  }
  return out;
}

/** Lựa chọn của combobox "Lọc theo tỉnh". '01' đã mang nhãn "Nội đô Hà Nội" từ `parseProvinceOptions`. */
export function provinceFilterOptions(provinces: readonly ProvinceOption[]) {
  return [
    { value: GEO_FILTER_ALL, label: 'Tất cả tỉnh' },
    { value: PROVINCE_FILTER_NONE, label: 'Thiếu mã tỉnh' },
    ...provinces.map((p) => ({ value: p.code, label: p.name })),
  ];
}

/** Lựa chọn của bộ lọc TUYẾN CŨ — chỉ còn ý nghĩa với chuyến tạo trước khi bỏ tuyến. */
export function legacyRouteFilterOptions(routes: ReadonlyArray<{ id: number; name: string }>) {
  return [
    { value: GEO_FILTER_ALL, label: 'Tất cả tuyến cũ' },
    ...routes.map((r) => ({ value: String(r.id), label: r.name })),
  ];
}
