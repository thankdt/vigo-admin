import { ApiError } from '@/lib/api-error';
import type { AdminUnit, Driver, DriverProvince } from '@/lib/types';
import { getDriverApprovalStatus } from './driver-approval';

/**
 * Tỉnh hoạt động của tài (mô hình "bỏ tuyến → tỉnh", 10/2026).
 *
 * Nguồn thật là `driver_service_provinces` (mã gis 2 số). Backend trả `provinces` theo shape cũ
 * `{ id, name }` + `gisCode`; backend cũ không có `gisCode` nên mã được dò lại qua danh mục
 * `GET /drivers/provinces` (cùng `id`).
 */

/** Danh mục tối thiểu để dò mã: id tỉnh cũ → mã gis. */
type ProvinceCatalog = ReadonlyArray<Pick<AdminUnit, 'id' | 'name' | 'gisCode'>>;

/** Mã gis của một tỉnh tài đang có; null nếu không xác định được (backend cũ + danh mục thiếu). */
export function provinceCodeOf(p: DriverProvince, catalog: ProvinceCatalog): string | null {
  if (p.gisCode) return p.gisCode;
  return catalog.find((c) => c.id === p.id)?.gisCode ?? null;
}

/** Tập mã gis đang chọn của tài, khử trùng, bỏ tỉnh không xác định được mã. */
export function currentProvinceCodes(
  provinces: Driver['provinces'],
  catalog: ProvinceCatalog,
): string[] {
  const out: string[] = [];
  for (const p of provinces ?? []) {
    const code = provinceCodeOf(p, catalog);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Danh mục chỉ giữ mục có mã gis (mục không mã không chọn/lọc được). */
export function selectableProvinces(catalog: readonly AdminUnit[]): AdminUnit[] {
  return catalog.filter((p) => Boolean(p.gisCode));
}

/**
 * Body PUT /drivers/admin/:id/provinces: `provinceCodes` là khoá chính, `provinceIds` kèm cho
 * ảnh backend cũ (rollback). Mã không có trong danh mục bị bỏ — backend cũng bỏ qua mã lạ.
 */
export function buildProvinceSelection(
  codes: readonly string[],
  catalog: ProvinceCatalog,
): { provinceCodes: string[]; provinceIds: number[] } {
  const picked = catalog.filter((c) => c.gisCode && codes.includes(c.gisCode));
  return {
    provinceCodes: picked.map((c) => c.gisCode as string),
    provinceIds: picked.map((c) => c.id),
  };
}

/** Tỉnh để hiện lại ngay sau khi lưu (không phụ thuộc shape response). */
export function provincesFromCodes(codes: readonly string[], catalog: ProvinceCatalog): DriverProvince[] {
  return catalog
    .filter((c) => c.gisCode && codes.includes(c.gisCode))
    .map((c) => ({ id: c.id, name: c.name, gisCode: c.gisCode }));
}

/** Nhãn ô chọn: kèm các tỉnh cũ đã sáp nhập khi tên không nhắc tới chúng. */
export function provinceOptionLabel(p: Pick<AdminUnit, 'name' | 'oldProvinces'>): string {
  const lower = p.name.toLowerCase();
  const merged = (p.oldProvinces ?? []).filter((o) => !lower.includes(o.toLowerCase()));
  return merged.length > 0 ? `${p.name} (gồm ${(p.oldProvinces ?? []).join(', ')})` : p.name;
}

/**
 * Tài đã duyệt mà KHÔNG có tỉnh nào: backend chặn bật "Sẵn sàng" (DRV_PROVINCE_REQUIRED) và
 * không giao chuyến mới. `provinces` undefined (backend cũ) thì không kết luận gì.
 *
 * Biên đã biết: backend chỉ đưa vào `provinces` mã có id tỉnh cũ (provinceViewsByCode). Tài chỉ có
 * mã không map được id cũ vẫn hiện rỗng ở đây (cảnh báo sai), và Lưu từ trạng thái đó gửi tập mã
 * thiếu mã bị ẩn — backend thay cả tập nên gỡ luôn nó. Gốc ở backend: trả thêm view chỉ có gisCode.
 */
export function driverLacksProvince(
  driver: Pick<Driver, 'isApproved' | 'rejectionReason' | 'provinces'> | null | undefined,
): boolean {
  if (!driver || !Array.isArray(driver.provinces)) return false;
  return driver.provinces.length === 0 && getDriverApprovalStatus(driver) === 'approved';
}

export const NO_PROVINCE_WARNING =
  'Chưa có tỉnh hoạt động: tài xế không bật được Sẵn sàng (DRV_PROVINCE_REQUIRED) và không nhận được chuyến mới.';

/** Backend cũ im lặng bỏ `provinceCode` và trả danh sách KHÔNG lọc; backend mới echo `meta.provinceCode`. */
export function provinceFilterUnsupported(
  sent: string | undefined,
  meta: { provinceCode?: string } | undefined,
): boolean {
  return Boolean(sent) && meta?.provinceCode !== sent;
}

/** Câu lỗi lưu tỉnh: VAL_003 (thiếu cả hai trường) có câu riêng, còn lại dùng câu đã bóc của ApiError. */
export function provinceSaveErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.code === 'VAL_003') {
    return 'Danh sách tỉnh chưa được gửi lên. Chọn lại tỉnh rồi bấm Lưu.';
  }
  return err instanceof Error && err.message ? err.message : 'Vui lòng thử lại.';
}
