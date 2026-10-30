import type { MacroMatchCombo, MacroMatchParams, MacroMatchVerdict, MacroSearchParams } from './api';
import {
  MACRO_ZONE_PREFIX,
  formServiceValue,
  formatMacroAdjustment,
  isZoneWardCode,
  serviceLabel,
  vehicleLabel,
  type MacroEndpoint,
} from './macro-bulk';
import type { PricingMacroRule } from './types';

/**
 * Hàm thuần cho thanh «Tìm quy tắc» của màn "Điều chỉnh khu vực" (thay ô «Hỏi AI»): bộ lọc → tham số
 * `GET /pricing/macro-rules/search`, điều kiện tra «quy tắc đang áp» (`GET /pricing/macro-rules/match`), và nhãn.
 *
 * Mỗi đầu (đón / đến) lọc theo MỘT trong hai cách, không bao giờ cả hai (máy chủ trả 400 nếu gửi cả hai):
 *  - `place`: điểm cụ thể chọn từ gợi ý — so khớp theo MÃ (tỉnh, xã hoặc `ZONE:<mã>`), không đoán chữ;
 *  - `text`: chữ tự do, máy chủ phân giải (hiểu cả tên huyện/tỉnh CŨ) — không biết chính xác xã nào nên KHÔNG tra được
 *    «quy tắc đang áp».
 */

/** Trần độ dài chữ tìm theo tên của máy chủ (`SEARCH_TEXT_MAX`); dài hơn ⇒ 400. */
export const MACRO_TEXT_SEARCH_MAX = 100;

export type MacroPlaceFilter = { kind: 'place'; endpoint: MacroEndpoint } | { kind: 'text'; text: string };

export type MacroSearchFilters = {
  origin: MacroPlaceFilter | null;
  dest: MacroPlaceFilter | null;
  /** '' = mọi dịch vụ. Có giá trị = luật ÁP cho dịch vụ đó (gồm luật «Mọi dịch vụ»). */
  serviceType: '' | 'CARPOOL' | 'RIDE';
  /** '' = mọi loại xe. Có giá trị = luật ÁP cho loại xe đó (gồm luật «Mọi loại xe»). */
  vehicleType: '' | 'CAR_4' | 'CAR_7';
  isActive: '' | 'true' | 'false';
  /** Ghi chú, hoặc `#123` / `123` = mã quy tắc. Giữ nguyên chữ đang gõ; cắt khoảng trắng khi gửi. */
  q: string;
  /** Gồm cả luật rộng hơn (cấp tỉnh, mọi nơi) phủ điểm đã chọn — chỉ có tác dụng khi có một đầu theo MÃ. */
  cover: boolean;
};

export const EMPTY_FILTERS: MacroSearchFilters = Object.freeze({
  origin: null,
  dest: null,
  serviceType: '',
  vehicleType: '',
  isActive: '',
  q: '',
  cover: true,
});

const isExactPlace = (p: MacroPlaceFilter | null): p is { kind: 'place'; endpoint: MacroEndpoint } => p?.kind === 'place';

/** Một đầu có thực sự lọc gì không (chữ chỉ có khoảng trắng = không). */
function isActiveSide(p: MacroPlaceFilter | null): boolean {
  if (!p) return false;
  return p.kind === 'place' ? true : p.text.trim() !== '';
}

/**
 * Có ô nào đang lọc không. `cover` một mình KHÔNG tính: không có điểm cụ thể thì nó chẳng đổi kết quả. Trang dùng hàm
 * này để chọn giữa danh sách thường (`getPricingMacroRulesPage`) và tìm kiếm mới.
 */
export function hasActiveFilters(f: MacroSearchFilters): boolean {
  return Boolean(
    isActiveSide(f.origin) || isActiveSide(f.dest) || f.serviceType || f.vehicleType || f.isActive || f.q.trim(),
  );
}

function putSide(
  out: MacroSearchParams,
  side: MacroPlaceFilter | null,
  keys: { province: 'originProvinceCode' | 'destProvinceCode'; ward: 'originWardCode' | 'destWardCode'; text: 'originSearch' | 'destSearch' },
): void {
  if (!side) return;
  if (side.kind === 'place') {
    const province = side.endpoint.provinceCode?.trim();
    const ward = side.endpoint.wardCode?.trim();
    if (province) out[keys.province] = province;
    if (ward) out[keys.ward] = ward;
    return;
  }
  const text = side.text.trim();
  if (text) out[keys.text] = text;
}

/**
 * Bộ lọc → tham số tìm kiếm. Mỗi đầu: điểm ⇒ mã tỉnh (+ mã xã nếu có); chữ ⇒ `originSearch`/`destSearch` đã cắt.
 * Ô trống không gửi. `cover` chỉ gửi khi bật VÀ có ít nhất một đầu là điểm cụ thể (máy chủ chỉ áp nó cho đầu theo mã).
 */
export function toSearchParams(f: MacroSearchFilters, paging: { page: number; limit: number }): MacroSearchParams {
  const out: MacroSearchParams = { page: paging.page, limit: paging.limit };
  putSide(out, f.origin, { province: 'originProvinceCode', ward: 'originWardCode', text: 'originSearch' });
  putSide(out, f.dest, { province: 'destProvinceCode', ward: 'destWardCode', text: 'destSearch' });
  if (f.serviceType) out.serviceType = f.serviceType;
  if (f.vehicleType) out.vehicleType = f.vehicleType;
  if (f.isActive) out.isActive = f.isActive === 'true';
  const q = f.q.trim();
  if (q) out.q = q;
  if (f.cover && (isExactPlace(f.origin) || isExactPlace(f.dest))) out.cover = true;
  return out;
}

/**
 * Tham số tra «quy tắc đang áp» — chỉ khi CẢ HAI đầu là điểm cụ thể có mã tỉnh (máy chủ bắt buộc tỉnh). Dịch vụ / xe /
 * bật-tắt / ghi chú không dùng: máy chủ luôn trả đủ 4 tổ hợp và chỉ xét luật đang bật.
 */
export function toMatchParams(f: MacroSearchFilters): MacroMatchParams | null {
  if (!isExactPlace(f.origin) || !isExactPlace(f.dest)) return null;
  const o = f.origin.endpoint;
  const d = f.dest.endpoint;
  const oProvince = o.provinceCode?.trim();
  const dProvince = d.provinceCode?.trim();
  if (!oProvince || !dProvince) return null;
  const oWard = o.wardCode?.trim();
  const dWard = d.wardCode?.trim();
  return {
    originProvinceCode: oProvince,
    ...(oWard ? { originWardCode: oWard } : {}),
    destProvinceCode: dProvince,
    ...(dWard ? { destWardCode: dWard } : {}),
  };
}

export type MacroMatchAvailability = 'READY' | 'NEED_BOTH' | 'TEXT_SIDE' | 'PROVINCE_ONLY';

/**
 * Tra được «quy tắc đang áp» tới đâu:
 *  - NEED_BOTH: thiếu một đầu;
 *  - TEXT_SIDE: một đầu theo chữ ⇒ không biết chính xác xã nào, không có câu trả lời chính xác;
 *  - PROVINCE_ONLY: một đầu là «Cả tỉnh» ⇒ có câu trả lời nhưng chỉ luật cấp tỉnh/mọi nơi khớp được (luật cấp xã bị bỏ);
 *  - READY: hai đầu đều là xã / điểm đặc biệt.
 * Chỉ READY và PROVINCE_ONLY gọi máy chủ (khi đó `toMatchParams` khác null).
 */
export function matchAvailability(f: MacroSearchFilters): MacroMatchAvailability {
  if (!isActiveSide(f.origin) || !isActiveSide(f.dest)) return 'NEED_BOTH';
  if (!isExactPlace(f.origin) || !isExactPlace(f.dest)) return 'TEXT_SIDE';
  if (toMatchParams(f) === null) return 'NEED_BOTH';
  if (!f.origin.endpoint.wardCode?.trim() || !f.dest.endpoint.wardCode?.trim()) return 'PROVINCE_ONLY';
  return 'READY';
}

const VERDICT_LABEL: Record<MacroMatchVerdict, string> = {
  WINNER: 'Đang áp dụng',
  LOSES_SPECIFICITY: 'Thua: kém cụ thể hơn',
  LOSES_PRIORITY: 'Thua: ưu tiên thấp hơn',
  LOSES_ID: 'Thua: mã nhỏ hơn',
  IGNORED_TYPE: 'Không áp dụng (loại cũ)',
};

/** Nhãn kết luận của một dòng xếp hạng. Giá trị lạ (máy chủ mới hơn) hiện nguyên để thấy có gì bất thường. */
export function verdictLabel(verdict: MacroMatchVerdict): string {
  return VERDICT_LABEL[verdict] ?? String(verdict);
}

/** «Ghép xe · Xe 4 chỗ» — dùng ĐÚNG nhãn dịch vụ / loại xe của bảng quy tắc. */
export function comboLabel(combo: Pick<MacroMatchCombo, 'serviceType' | 'vehicleType'>): string {
  return `${serviceLabel(combo.serviceType)} · ${vehicleLabel(combo.vehicleType)}`;
}

/** Nhãn một đầu đã chọn: điểm ⇒ nhãn của điểm; chữ ⇒ «Chữ: … (gồm tên cũ)»; chưa chọn ⇒ ''. */
export function placeFilterLabel(p: MacroPlaceFilter | null): string {
  if (!p) return '';
  return p.kind === 'place' ? p.endpoint.label : `Chữ: ${p.text.trim()} (gồm tên cũ)`;
}

/**
 * Một đầu của LUẬT (không phải của bộ lọc): «Toàn quốc» / «Cả tỉnh X» / «Xã (Tỉnh)». Máy chủ cũ không trả tên xã ⇒ hiện
 * mã; điểm đặc biệt thiếu tên ⇒ «Điểm đặc biệt <mã>».
 */
export function macroRuleEndText(
  provinceCode: string | null | undefined,
  wardCode: string | null | undefined,
  wardName: string | null | undefined,
  provinceName: (code: string) => string,
): string {
  if (!provinceCode && !wardCode) return 'Toàn quốc';
  const province = provinceCode ? provinceName(provinceCode) : '';
  if (!wardCode) return `Cả tỉnh ${province}`;
  const ward =
    wardName ||
    (isZoneWardCode(wardCode) ? `Điểm đặc biệt ${wardCode.trim().slice(MACRO_ZONE_PREFIX.length)}` : `Xã #${wardCode}`);
  return province ? `${ward} (${province})` : ward;
}

/** «Đón → Trả» (một chiều) hoặc «Đón ↔ Trả» (hai chiều) của một luật. */
export function macroRuleRouteText(rule: PricingMacroRule, provinceName: (code: string) => string): string {
  const origin = macroRuleEndText(rule.originProvinceCode, rule.originWardCode, rule.originWardName, provinceName);
  const dest = macroRuleEndText(rule.destProvinceCode, rule.destWardCode, rule.destWardName, provinceName);
  return `${origin} ${rule.isBidirectional ? '↔' : '→'} ${dest}`;
}

/**
 * Mức điều chỉnh như cột "Điều chỉnh" của bảng: theo GHẾ khi `applyPerSeat` và luật không chỉ dành cho bao xe.
 * `adjustmentValue` có thể về dạng chuỗi (cột numeric) ⇒ đổi số trước khi định dạng.
 */
export function macroRuleAdjustmentText(rule: Pick<PricingMacroRule, 'adjustmentType' | 'adjustmentValue' | 'applyPerSeat' | 'serviceType'>): string {
  const perSeat = Boolean(rule.applyPerSeat) && formServiceValue(rule.serviceType) !== 'CONVENIENT';
  return formatMacroAdjustment(rule.adjustmentType, Number(rule.adjustmentValue), perSeat);
}
