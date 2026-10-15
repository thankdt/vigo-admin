// Nhãn tỉnh theo mã gis (34 tỉnh sau sáp nhập 2025) — dùng chung cho bộ lọc & nhãn "cặp tỉnh"
// của chuyến (bỏ tuyến → tỉnh hoạt động, 10/2026). Thuần hàm, KHÔNG import api.ts (api.ts import
// file này) để không tạo vòng phụ thuộc.
import type { ProvinceOption } from '@/lib/types';

/** Hà Nội giữ mã '01' qua sáp nhập; nhãn sản phẩm là "Nội đô Hà Nội" (cùng nhãn app tài chọn tỉnh). */
export const HANOI_PROVINCE_CODE = '01';
export const HANOI_PROVINCE_LABEL = 'Nội đô Hà Nội';

export type ProvinceNameMap = Readonly<Record<string, string>>;

/**
 * Chuẩn hoá phản hồi `/drivers/provinces` thành `{code, name}` theo MÃ GIS.
 *
 * Chỉ nhận dòng có `gisCode` dạng chuỗi không rỗng: trường `code` của endpoint đó là mã cũ, KHÔNG
 * phải mã gis — lấy nhầm nó thì bộ lọc gửi mã sai và trả về 0 chuyến mà không báo lỗi. Backend cũ
 * (chưa có `gisCode`) cho danh sách rỗng → màn chuyến chỉ còn các lựa chọn "Tất cả"/"Thiếu mã tỉnh".
 */
export function parseProvinceOptions(raw: unknown): ProvinceOption[] {
  if (!Array.isArray(raw)) return [];
  const byCode = new Map<string, string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const { gisCode, name } = row as { gisCode?: unknown; name?: unknown };
    if (typeof gisCode !== 'string' || gisCode.trim() === '') continue;
    const code = gisCode.trim();
    const label = code === HANOI_PROVINCE_CODE
      ? HANOI_PROVINCE_LABEL
      : typeof name === 'string' && name.trim() !== '' ? name.trim() : code;
    byCode.set(code, label);
  }
  return [...byCode.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function provinceNameMap(options: readonly ProvinceOption[]): ProvinceNameMap {
  return Object.fromEntries(options.map((o) => [o.code, o.name]));
}

/** Tên tỉnh theo mã; mã lạ → "Mã tỉnh <mã>" (không bịa tên); trống → null. '01' luôn có nhãn. */
export function provinceLabel(code: string | null | undefined, names: ProvinceNameMap): string | null {
  const c = typeof code === 'string' ? code.trim() : '';
  if (c === '') return null;
  if (c === HANOI_PROVINCE_CODE) return HANOI_PROVINCE_LABEL;
  return names[c] ?? `Mã tỉnh ${c}`;
}

/**
 * Nhãn cặp tỉnh CÓ THỨ TỰ của chuyến: "Nội đô Hà Nội → Hải Phòng". Cả hai đầu trống (chuyến cũ
 * chưa backfill) → null để nơi gọi tự chọn câu thay thế; thiếu một đầu → "—" ở đầu đó.
 */
export function provincePairLabel(
  pickupCode: string | null | undefined,
  dropoffCode: string | null | undefined,
  names: ProvinceNameMap,
): string | null {
  const from = provinceLabel(pickupCode, names);
  const to = provinceLabel(dropoffCode, names);
  if (from === null && to === null) return null;
  return `${from ?? '—'} → ${to ?? '—'}`;
}
