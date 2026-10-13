import type { BulkMacroSkippedItem, MacroAdjustmentType, MacroEndSelector } from './types';

/**
 * Hàm thuần cho màn "Điều chỉnh khu vực" (macro định giá): tạo/xoá hàng loạt, nhãn dịch vụ/xe, biên giá trị.
 *
 * Các con số giới hạn dưới đây PHẢI khớp backend (`vigo-backend/src/pricing/pricing-macro.util.ts`,
 * `MACRO_LIMITS`). Backend là nơi CHỐT — ở đây chỉ để báo sớm cho admin trước khi gọi API; lệch nhau thì
 * backend vẫn từ chối bằng thông điệp tiếng Việt của nó.
 */
export const MACRO_BULK_MAX_COMBOS = 500;
export const MACRO_BULK_MAX_SIDE = 200;
export const MACRO_BULK_DELETE_MAX = 500;

export const MACRO_VALUE_LIMITS = {
  PRIORITY_MIN: -1000,
  PRIORITY_MAX: 1000,
  DELTA_ABS_MAX: 2_000_000,
  PERCENT_MIN: -80,
  PERCENT_MAX: 200,
  FLOOR_MIN: 1,
  CEILING_MIN: 20_000,
  PRICE_MAX: 20_000_000,
  NAME_PREFIX_MAX: 60,
} as const;

/** Một điểm đón/trả trong danh sách tạo hàng loạt: cả tỉnh (không có wardCode) hoặc một phường/xã. */
export type MacroEndpoint = {
  provinceCode: string;
  wardCode?: string;
  /** Nhãn hiển thị (tên tỉnh / tên phường) — chỉ dùng cho giao diện. */
  label: string;
};

export function endpointKey(e: { provinceCode?: string | null; wardCode?: string | null }): string {
  return `${e.provinceCode ?? ''}|${e.wardCode ?? ''}`;
}

/** Thêm điểm vào danh sách, bỏ trùng theo (tỉnh, phường); giữ thứ tự thêm. */
export function addEndpoints(list: MacroEndpoint[], additions: MacroEndpoint[]): MacroEndpoint[] {
  const seen = new Set(list.map(endpointKey));
  const out = [...list];
  for (const a of additions) {
    const k = endpointKey(a);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(a);
    }
  }
  return out;
}

export function removeEndpoint(list: MacroEndpoint[], key: string): MacroEndpoint[] {
  return list.filter((e) => endpointKey(e) !== key);
}

/** Số luật sẽ sinh ra. Một bên trống nghĩa là "bất kỳ" (đếm 1); cả hai bên trống thì không tạo gì (0). */
export function comboCount(originsLen: number, destsLen: number): number {
  if (originsLen === 0 && destsLen === 0) return 0;
  return Math.max(originsLen, 1) * Math.max(destsLen, 1);
}

export function checkBulkSelection(
  originsLen: number,
  destsLen: number,
): { ok: boolean; combos: number; error: string | null } {
  const combos = comboCount(originsLen, destsLen);
  if (combos === 0) {
    return { ok: false, combos, error: 'Chọn ít nhất một điểm đón hoặc một điểm trả.' };
  }
  if (originsLen > MACRO_BULK_MAX_SIDE || destsLen > MACRO_BULK_MAX_SIDE) {
    return { ok: false, combos, error: `Mỗi bên tối đa ${MACRO_BULK_MAX_SIDE} điểm.` };
  }
  if (combos > MACRO_BULK_MAX_COMBOS) {
    return {
      ok: false,
      combos,
      error: `Một lần tạo tối đa ${MACRO_BULK_MAX_COMBOS} quy tắc (đang chọn ${combos}). Hãy chia nhỏ theo tỉnh.`,
    };
  }
  return { ok: true, combos, error: null };
}

export type EndpointSide = 'origin' | 'dest';

/**
 * Bên nào đang TRỐNG trong khi bên kia đã có điểm → bên đó sẽ là "MỌI NƠI (toàn quốc)". Trả null nếu cả hai
 * cùng có điểm, hoặc cả hai trống (trường hợp đó bị chặn riêng bởi `checkBulkSelection`).
 */
export function anySide(originsLen: number, destsLen: number): EndpointSide | null {
  if (originsLen === 0 && destsLen > 0) return 'origin';
  if (destsLen === 0 && originsLen > 0) return 'dest';
  return null;
}

/**
 * Lựa chọn đã nhập trong bộ dựng điểm nhưng CHƯA bấm "Thêm". Nếu không báo, nó bị bỏ qua lặng lẽ và bên đó
 * thành "mọi nơi". Trả câu mô tả (để ghép sau tên bên) hoặc null nếu không có gì đang chờ.
 *
 * - Phường đang tích: luôn là đang chờ.
 * - "Chọn tỉnh mà chưa Thêm": chỉ tính khi admin VỪA chọn tỉnh trong ô (`staged`) và danh sách chưa có điểm nào
 *   của tỉnh đó. Sau khi Thêm, hoặc sau khi admin tự bỏ chip/xoá danh sách, ô tỉnh vẫn giữ tỉnh cũ nhưng đó
 *   không phải lựa chọn đang chờ — báo như vậy sẽ gợi ý "Thêm cả tỉnh", tức là nới phạm vi ngược ý admin.
 */
export function pendingStagedSelection(args: {
  provinceCode: string;
  provinceName: string;
  wardCount: number;
  items: MacroEndpoint[];
  /** Bật khi admin đổi ô tỉnh sang một tỉnh; tắt khi bấm Thêm hoặc bỏ chọn tỉnh. */
  staged: boolean;
}): string | null {
  const { provinceCode, provinceName, wardCount, items, staged } = args;
  if (!provinceCode) return null;
  if (wardCount > 0) {
    return `đã chọn ${wardCount} phường/xã của ${provinceName} nhưng chưa bấm «Thêm ${wardCount} phường/xã»`;
  }
  if (staged && !items.some((i) => i.provinceCode === provinceCode)) {
    return `đã chọn tỉnh ${provinceName} nhưng chưa bấm «Thêm cả tỉnh» (nếu không dùng, chọn lại «— Chọn tỉnh —»)`;
  }
  return null;
}

/** Rút gọn danh sách điểm để đọc nhanh: tối đa `max` nhãn, phần còn lại ghi "và N điểm khác". */
export function summarizeEndpoints(list: MacroEndpoint[], max = 3): string {
  if (list.length === 0) return 'MỌI NƠI (toàn quốc)';
  const head = list.slice(0, max).map((e) => e.label).join(', ');
  return list.length > max ? `${head} và ${list.length - max} điểm khác` : head;
}

/** Cách hiển thị mức điều chỉnh (dùng chung danh sách quy tắc và tóm tắt tạo hàng loạt). */
export function formatMacroAdjustment(type: MacroAdjustmentType, value: number, applyPerSeat: boolean): string {
  const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
  const sign = value > 0 ? '+' : '';
  switch (type) {
    case 'DELTA_AMOUNT':
      return `${sign}${money(value)} đ${applyPerSeat ? '/ghế' : ''}`;
    case 'PERCENTAGE':
      return `${sign}${value}%`;
    case 'MIN_FLOOR':
      return `Sàn: ${money(value)} đ`;
    case 'MAX_CEILING':
      return `Trần: ${money(value)} đ`;
    default:
      return `${value}`;
  }
}

export function toSelectors(list: MacroEndpoint[]): MacroEndSelector[] {
  return list.map((e) => (e.wardCode ? { provinceCode: e.provinceCode, wardCode: e.wardCode } : { provinceCode: e.provinceCode }));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Báo sớm giá trị điều chỉnh ngoài biên (khớp backend). Trả thông điệp tiếng Việt hoặc null nếu hợp lệ. */
export function adjustmentValueError(type: MacroAdjustmentType, value: number): string | null {
  if (!Number.isFinite(value)) return 'Giá trị phải là một số.';
  const L = MACRO_VALUE_LIMITS;
  const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
  switch (type) {
    case 'DELTA_AMOUNT':
      if (!Number.isInteger(value)) return 'Số tiền cộng/trừ phải là số nguyên đồng.';
      if (Math.abs(value) > L.DELTA_ABS_MAX) return `Số tiền cộng/trừ tối đa ${money(L.DELTA_ABS_MAX)}đ.`;
      return null;
    case 'PERCENTAGE':
      if (value < L.PERCENT_MIN || value > L.PERCENT_MAX) {
        return `Phần trăm phải từ ${L.PERCENT_MIN}% đến ${L.PERCENT_MAX}%.`;
      }
      return null;
    case 'MIN_FLOOR':
      if (!Number.isInteger(value)) return 'Giá sàn phải là số nguyên đồng.';
      if (value < L.FLOOR_MIN || value > L.PRICE_MAX) return `Giá sàn phải lớn hơn 0 và tối đa ${money(L.PRICE_MAX)}đ.`;
      return null;
    case 'MAX_CEILING':
      if (!Number.isInteger(value)) return 'Giá trần phải là số nguyên đồng.';
      if (value < L.CEILING_MIN || value > L.PRICE_MAX) {
        return `Giá trần phải từ ${money(L.CEILING_MIN)}đ đến ${money(L.PRICE_MAX)}đ.`;
      }
      return null;
    default:
      return 'Loại điều chỉnh không được hỗ trợ.';
  }
}

export function priorityError(value: number): string | null {
  const L = MACRO_VALUE_LIMITS;
  if (!Number.isInteger(value) || value < L.PRIORITY_MIN || value > L.PRIORITY_MAX) {
    return `Độ ưu tiên phải là số nguyên từ ${L.PRIORITY_MIN} đến ${L.PRIORITY_MAX}.`;
  }
  return null;
}

// ───────── Từ vựng dịch vụ / loại xe ─────────
// Admin gửi CONVENIENT / 4SEATS / 7SEATS; backend lưu đúng giá trị gửi nhưng so khớp theo dạng chuẩn
// RIDE / CAR_4 / CAR_7. Luật tạo từ API/bulk có thể mang dạng chuẩn — hiển thị và chọn phải hiểu cả hai.

const SERVICE_FORM: Record<string, 'ALL' | 'CARPOOL' | 'CONVENIENT'> = {
  ALL: 'ALL',
  CARPOOL: 'CARPOOL',
  CONVENIENT: 'CONVENIENT',
  RIDE: 'CONVENIENT',
};
const VEHICLE_FORM: Record<string, 'ALL' | '4SEATS' | '7SEATS'> = {
  ALL: 'ALL',
  '4SEATS': '4SEATS',
  '7SEATS': '7SEATS',
  CAR_4: '4SEATS',
  CAR_7: '7SEATS',
};

/** Các giá trị có sẵn trong ô chọn dịch vụ / loại xe của form. */
export const FORM_SERVICE_VALUES: readonly string[] = ['ALL', 'CARPOOL', 'CONVENIENT'];
export const FORM_VEHICLE_VALUES: readonly string[] = ['ALL', '4SEATS', '7SEATS'];

/**
 * Giá trị cho ô chọn dịch vụ khi mở form sửa: dạng chuẩn của backend quy về dạng của ô (RIDE → CONVENIENT);
 * trống → ALL. Giá trị KHÁC (vd DELIVERY, tạo qua API) được GIỮ NGUYÊN — quy về ALL sẽ âm thầm nới luật ra
 * mọi dịch vụ khi admin chỉ sửa ghi chú rồi Lưu. Form hiển thị nó thành một mục "Khác: …".
 */
export function formServiceValue(raw?: string | null): string {
  const t = (raw ?? '').trim();
  if (!t) return 'ALL';
  return SERVICE_FORM[t.toUpperCase()] ?? t;
}

/** Như `formServiceValue`, cho loại xe (CAR_4 → 4SEATS; giá trị lạ giữ nguyên). */
export function formVehicleValue(raw?: string | null): string {
  const t = (raw ?? '').trim();
  if (!t) return 'ALL';
  return VEHICLE_FORM[t.toUpperCase()] ?? t;
}

export function serviceLabel(raw?: string | null): string {
  const v = (raw ?? '').trim().toUpperCase();
  if (!v || v === 'ALL') return 'Mọi dịch vụ';
  const f = SERVICE_FORM[v];
  if (f === 'CARPOOL') return 'Ghép xe';
  if (f === 'CONVENIENT') return 'Bao xe';
  return v; // giá trị lạ: hiện nguyên để admin thấy có gì đó bất thường
}

export function vehicleLabel(raw?: string | null): string {
  const v = (raw ?? '').trim().toUpperCase();
  if (!v || v === 'ALL') return 'Mọi loại xe';
  const f = VEHICLE_FORM[v];
  if (f === '4SEATS') return 'Xe 4 chỗ';
  if (f === '7SEATS') return 'Xe 7 chỗ';
  return v;
}

/** Một dòng mô tả tổ hợp bị bỏ qua, dùng trong bảng kết quả tạo hàng loạt. */
export function describeSkipped(
  s: BulkMacroSkippedItem,
  labelFor: (sel: MacroEndSelector) => string,
): string {
  const route = `${labelFor(s.origin)} → ${labelFor(s.dest)}`;
  if (s.reason === 'TRUNG_TRONG_YEU_CAU') return `${route}: lặp lại một tổ hợp khác trong cùng yêu cầu`;
  const b = s.blockedBy;
  if (!b || b.id === null) return `${route}: ${s.message}`;
  const state = b.isActive ? 'đang bật' : 'đang tắt';
  return `${route}: đã có quy tắc #${b.id} "${b.name}" (${state}${b.isBidirectional ? ', hai chiều' : ''})`;
}

/**
 * Backend cũ (chưa có cột `isBidirectional`) bỏ qua field này lặng lẽ (ValidationPipe whitelist) và trả luật
 * không có `isBidirectional`. Gọi sau create/update: true nếu admin đã YÊU CẦU hai chiều mà backend KHÔNG xác nhận.
 */
export function bidirectionalNotHonored(requested: boolean, saved: { isBidirectional?: boolean } | null | undefined): boolean {
  return requested === true && saved?.isBidirectional !== true;
}

/** Gợi ý ngắn dưới ô "Giá trị", theo kiểu điều chỉnh (dùng cho cả form đơn lẻ và hộp thoại hàng loạt). */
export function adjustmentValueHint(type: MacroAdjustmentType): string {
  const L = MACRO_VALUE_LIMITS;
  const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
  switch (type) {
    case 'DELTA_AMOUNT':
      return `Cộng/trừ tiền cố định, tối đa ±${money(L.DELTA_ABS_MAX)}đ. Ví dụ: -20000 hoặc 50000.`;
    case 'PERCENTAGE':
      return `Phần trăm theo giá hiện tại, từ ${L.PERCENT_MIN}% đến ${L.PERCENT_MAX}%. Ví dụ: 10 hoặc -5.`;
    case 'MIN_FLOOR':
      return 'Giá tối thiểu của chuyến (VNĐ). Chuyến rẻ hơn sẽ được nâng lên mức này.';
    case 'MAX_CEILING':
      return `Giá tối đa của chuyến (VNĐ), tối thiểu ${money(L.CEILING_MIN)}đ.`;
    default:
      return '';
  }
}

/** min/max cho ô nhập số theo kiểu điều chỉnh (chỉ là gợi ý của trình duyệt; backend mới là nơi chốt). */
export function adjustmentValueRange(type: MacroAdjustmentType): { min: number; max: number; step: number } {
  const L = MACRO_VALUE_LIMITS;
  switch (type) {
    case 'DELTA_AMOUNT':
      return { min: -L.DELTA_ABS_MAX, max: L.DELTA_ABS_MAX, step: 1 };
    case 'PERCENTAGE':
      // Backend cho số lẻ (cột numeric(12,2)); step=1 làm trình duyệt chặn 2.5% bằng tooltip gốc.
      return { min: L.PERCENT_MIN, max: L.PERCENT_MAX, step: 0.01 };
    case 'MIN_FLOOR':
      return { min: L.FLOOR_MIN, max: L.PRICE_MAX, step: 1 };
    case 'MAX_CEILING':
      return { min: L.CEILING_MIN, max: L.PRICE_MAX, step: 1 };
    default:
      return { min: 0, max: L.PRICE_MAX, step: 1 };
  }
}
