import type {
  SpecialZone,
  SpecialZoneFlatPrice,
  UpsertSpecialZoneFlatPriceRequest,
} from './types';

/**
 * Hàm thuần cho màn "Sân bay & đồng giá" (đồng giá điểm đặc biệt, plan bỏ-tuyến M2b).
 *
 * Hằng số giới hạn PHẢI khớp backend (`vigo-backend/src/pricing/dto/special-zone-flat-price.dto.ts`).
 * Backend là nơi CHỐT; ở đây chỉ để báo sớm. TIỀN THẬT: một hàng đồng giá khớp thì MỌI luật macro bị bỏ qua và
 * băng PRC_002 KHÔNG bảo vệ khỏi gõ nhầm số, nên màn này kiểm chặt hơn các màn khác.
 */
export const FLAT_PRICE_MAX_VND = 9_999_999_999;
export const FLAT_PRICE_NOTE_MAX = 1000;
/** Giá trị đường dẫn của hàng mặc định ở `DELETE …/flat-prices/:wardCode`. */
export const FLAT_PRICE_DEFAULT_KEY = 'default';

/**
 * Đơn vị làm tròn của backend: lúc BÁO GIÁ ghép/bao xe, `pricing.service.ts` lấy
 * `Math.round(giá / 1000) * 1000` (giá một ghế / cả xe) — kể cả giá đồng giá. DTO và DB chỉ chặn "số nguyên > 0"
 * nên backend KHÔNG làm tròn lúc ghi: số lẻ nghìn nằm nguyên trong DB rồi mới bị làm tròn khi bán. Vì vậy màn này
 * chỉ nhận bội số của 1.000 đ (số nhập = số bán).
 */
export const FLAT_PRICE_UNIT_VND = 1000;

/** Giá backend thực sự dùng khi báo giá một giá đồng giá đã lưu (cùng công thức `giaMotGhe`). */
export function roundToThousand(v: number): number {
  return Math.round(v / FLAT_PRICE_UNIT_VND) * FLAT_PRICE_UNIT_VND;
}

/**
 * Mức THAM CHIẾU — KHÔNG phải số kinh doanh đã chốt: trần bao xe cũ của tuyến "Nội đô Hà Nội gồm sân bay" trước
 * 15/10/2026, khi tuyến bị bỏ (CAR_4 250.000 đ / CAR_7 350.000 đ). Chỉ để admin đối chiếu và báo lệch xa (gõ
 * thiếu/thừa số 0) — không phải giá mặc định, không tự điền vào form; thay/xoá khi kinh doanh chốt số thật.
 */
export const BUSINESS_REFERENCE_VND = { priceCar4: 250_000, priceCar7: 350_000 } as const;
/** Nhãn nguồn của mức tham chiếu, hiện ở màn (kèm hai số của `BUSINESS_REFERENCE_VND`). */
export const REFERENCE_PROVENANCE =
  'Tham chiếu (không phải số kinh doanh đã chốt): mức trần bao xe của tuyến "Nội đô Hà Nội gồm sân bay" trước 15/10/2026';
/** Lệch quá [1/x, x] lần so với mức tham chiếu thì cảnh báo (gõ thiếu/thừa số 0). */
export const REFERENCE_DEVIATION_FACTOR = 2;

export type FlatPriceKey = 'pricePerSeatGhep' | 'priceCar4' | 'priceCar7';

export const FLAT_PRICE_FIELDS: ReadonlyArray<{ key: FlatPriceKey; label: string; hint: string }> = [
  { key: 'pricePerSeatGhep', label: 'Ghép (1 ghế)', hint: 'Giá MỘT ghế; chuyến ghép nhân số ghế rồi mới trừ giảm giá ghế.' },
  { key: 'priceCar4', label: 'Bao xe 4 chỗ', hint: 'Giá cả xe 4 chỗ.' },
  { key: 'priceCar7', label: 'Bao xe 7 chỗ', hint: 'Giá cả xe 7 chỗ.' },
];

export type PriceParse = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * Đọc một ô giá. Trống = không áp đồng giá cho loại này (null). Nhận "250000", "250.000", "250,000", "250 000"
 * (nhóm 3 chữ số); từ chối thập phân, chữ, số âm, 0, vượt trần lưu trữ và số KHÔNG tròn nghìn (backend làm tròn
 * đến nghìn khi báo giá — xem `FLAT_PRICE_UNIT_VND`; không để màn hứa một giá mà khách trả giá khác).
 */
export function parsePriceInput(raw: string): PriceParse {
  const s = raw.trim();
  if (s === '') return { ok: true, value: null };
  let digits: string;
  if (/^\d+$/.test(s)) digits = s;
  else if (/^\d{1,3}([.,\s]\d{3})+$/.test(s)) digits = s.replace(/[.,\s]/g, '');
  else return { ok: false, error: 'Chỉ nhập số nguyên VND (vd 250000 hoặc 250.000).' };
  const value = Number(digits);
  if (!Number.isSafeInteger(value) || value > FLAT_PRICE_MAX_VND) {
    return { ok: false, error: `Giá vượt giới hạn lưu trữ (${formatVnd(FLAT_PRICE_MAX_VND)}).` };
  }
  if (value < 1) return { ok: false, error: 'Giá phải lớn hơn 0 (để trống nếu không áp đồng giá cho loại này).' };
  if (value % FLAT_PRICE_UNIT_VND !== 0) {
    const sold = roundToThousand(value);
    return {
      ok: false,
      error:
        sold === 0
          ? `Giá phải là bội số của 1.000 đ, tối thiểu 1.000 đ: backend làm tròn đến nghìn khi báo giá nên ${formatVnd(value)} thành 0 đ và mọi báo giá loại này bị từ chối (PRC_002).`
          : `Giá phải là bội số của 1.000 đ: backend làm tròn đến nghìn khi báo giá nên ${formatVnd(value)} sẽ bán ${formatVnd(sold)}. Hãy nhập đúng số tròn nghìn muốn bán (vd ${formatVnd(sold)}).`,
    };
  }
  return { ok: true, value };
}

/** 250000 -> "250.000 đ"; null/undefined -> "không áp đồng giá". Định dạng tay: không phụ thuộc ICU của runtime. */
export function formatVnd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'không áp đồng giá';
  return `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ`;
}

export type FlatPriceFormInput = {
  /** null = hàng mặc định cả tỉnh của vùng; chuỗi = mã phường/xã. */
  wardCode: string | null;
  prices: Record<FlatPriceKey, string>;
  note: string;
};

export type FlatPriceFormErrors = {
  ward?: string;
  prices: Partial<Record<FlatPriceKey, string>>;
  /** Lỗi cấp biểu mẫu (vd không có giá nào). */
  form?: string;
  note?: string;
};

export type FlatPriceValidation = {
  errors: FlatPriceFormErrors;
  /** Có khi không còn lỗi. */
  request?: UpsertSpecialZoneFlatPriceRequest;
  /** Cảnh báo KHÔNG chặn (hiện lại ở hộp xác nhận). */
  warnings: string[];
};

/**
 * Kiểm cả biểu mẫu.
 * - `provinceWardCodes`: tập mã phường của TỈNH của vùng (từ `pricing/macro-rules/wards?provinceCode=`); phường
 *   ngoài tập bị chặn (backend cũng chặn, ở đây báo sớm). null = chưa tải xong ⇒ chặn lưu hàng theo phường.
 * - `existing`: các hàng hiện có; thêm MỚI mà trùng (vùng, phường) bị chặn để PUT không ghi đè lặng lẽ.
 */
export function validateFlatPriceForm(
  input: FlatPriceFormInput,
  opts: {
    mode: 'create' | 'edit';
    provinceWardCodes: ReadonlySet<string> | null;
    existing: ReadonlyArray<Pick<SpecialZoneFlatPrice, 'wardCode'>>;
  },
): FlatPriceValidation {
  const errors: FlatPriceFormErrors = { prices: {} };
  const warnings: string[] = [];

  if (input.wardCode !== null) {
    const ward = input.wardCode.trim();
    if (!ward) errors.ward = 'Chọn phường/xã, hoặc chọn "Cả tỉnh (mặc định)".';
    else if (ward === FLAT_PRICE_DEFAULT_KEY) errors.ward = 'Mã phường không hợp lệ.';
    else if (opts.provinceWardCodes === null) errors.ward = 'Danh sách phường/xã của tỉnh chưa tải xong.';
    else if (!opts.provinceWardCodes.has(ward)) errors.ward = 'Phường/xã không thuộc tỉnh của điểm đặc biệt này.';
  }
  if (opts.mode === 'create' && !errors.ward) {
    const key = input.wardCode === null ? null : input.wardCode.trim();
    if (opts.existing.some((r) => (r.wardCode ?? null) === key)) {
      errors.ward =
        key === null
          ? 'Vùng này đã có hàng mặc định cả tỉnh — hãy sửa hàng hiện có thay vì thêm mới.'
          : 'Phường/xã này đã có đồng giá — hãy sửa hàng hiện có thay vì thêm mới.';
    }
  }

  const values: Record<FlatPriceKey, number | null> = { pricePerSeatGhep: null, priceCar4: null, priceCar7: null };
  for (const { key, label } of FLAT_PRICE_FIELDS) {
    const p = parsePriceInput(input.prices[key]);
    if (p.ok) values[key] = p.value;
    else errors.prices[key] = `${label}: ${p.error}`;
  }
  const anyError = Object.keys(errors.prices).length > 0;
  if (!anyError && FLAT_PRICE_FIELDS.every((f) => values[f.key] === null)) {
    errors.form = 'Phải nhập ít nhất một giá: ghép (1 ghế), bao xe 4 chỗ hoặc bao xe 7 chỗ.';
  }

  const note = input.note.trim();
  if (note.length > FLAT_PRICE_NOTE_MAX) errors.note = `Ghi chú tối đa ${FLAT_PRICE_NOTE_MAX} ký tự.`;

  if (!anyError) warnings.push(...softWarnings(values));

  const hasError = !!errors.ward || !!errors.form || !!errors.note || anyError;
  return {
    errors,
    warnings,
    request: hasError
      ? undefined
      : {
          wardCode: input.wardCode === null ? null : input.wardCode.trim(),
          pricePerSeatGhep: values.pricePerSeatGhep,
          priceCar4: values.priceCar4,
          priceCar7: values.priceCar7,
          note: note === '' ? null : note,
        },
  };
}

/** Trần số phường/xã mỗi lần lưu hàng loạt (PUT tuần tự từng xã; backend giới hạn 300 yêu cầu/phút). */
export const FLAT_PRICE_BATCH_MAX = 100;

export type FlatPriceBatchValidation = {
  errors: FlatPriceFormErrors;
  warnings: string[];
  /** Có khi KHÔNG có lỗi nào: một yêu cầu cho mỗi nơi áp dụng, theo thứ tự đã chọn. */
  requests?: UpsertSpecialZoneFlatPriceRequest[];
};

/**
 * Kiểm form THÊM đồng giá cho NHIỀU nơi cùng một mức giá (mỗi nơi = hàng riêng; null = hàng mặc định cả tỉnh).
 * Giá/ghi chú kiểm một lần; nơi áp dụng kiểm từng cái (thuộc tỉnh, chưa có hàng) và báo lỗi nơi đầu tiên sai.
 */
export function validateFlatPriceBatch(
  input: { targets: (string | null)[]; prices: Record<FlatPriceKey, string>; note: string },
  opts: {
    provinceWardCodes: ReadonlySet<string> | null;
    existing: ReadonlyArray<Pick<SpecialZoneFlatPrice, 'wardCode'>>;
  },
): FlatPriceBatchValidation {
  if (input.targets.length === 0) {
    const base = validateFlatPriceForm(
      { wardCode: null, prices: input.prices, note: input.note },
      { mode: 'edit', provinceWardCodes: opts.provinceWardCodes, existing: [] },
    );
    return { errors: { ...base.errors, ward: 'Chọn ít nhất một phường/xã, hoặc "Cả tỉnh (mặc định)".' }, warnings: [] };
  }
  if (input.targets.length > FLAT_PRICE_BATCH_MAX) {
    const base = validateFlatPriceForm(
      { wardCode: null, prices: input.prices, note: input.note },
      { mode: 'edit', provinceWardCodes: opts.provinceWardCodes, existing: [] },
    );
    return {
      errors: { ...base.errors, ward: `Tối đa ${FLAT_PRICE_BATCH_MAX} phường/xã mỗi lần (đang chọn ${input.targets.length}).` },
      warnings: [],
    };
  }
  const results = input.targets.map((t) =>
    validateFlatPriceForm(
      { wardCode: t, prices: input.prices, note: input.note },
      { mode: 'create', provinceWardCodes: opts.provinceWardCodes, existing: opts.existing },
    ),
  );
  const first = results[0];
  const badWard = results.find((r) => r.errors.ward);
  const errors: FlatPriceFormErrors = { ...first.errors, ward: badWard?.errors.ward };
  if (!errors.ward) delete errors.ward;
  const hasError = !!errors.ward || !!errors.form || !!errors.note || Object.keys(errors.prices).length > 0;
  return {
    errors,
    warnings: first.warnings,
    requests: hasError ? undefined : results.map((r) => r.request!),
  };
}

function softWarnings(v: Record<FlatPriceKey, number | null>): string[] {
  const out: string[] = [];
  const f = REFERENCE_DEVIATION_FACTOR;
  for (const key of ['priceCar4', 'priceCar7'] as const) {
    const price = v[key];
    const ref = BUSINESS_REFERENCE_VND[key];
    if (price !== null && (price * f < ref || price > ref * f)) {
      const label = FLAT_PRICE_FIELDS.find((x) => x.key === key)!.label;
      out.push(
        `${label} = ${formatVnd(price)} lệch xa mức tham chiếu ${formatVnd(ref)} (quá ${f} lần; mốc này chỉ để đối ` +
          'chiếu, chưa phải giá đã chốt). Băng PRC_002 KHÔNG chặn lỗi gõ số — kiểm lại số 0.',
      );
    }
  }
  if (v.priceCar4 !== null && v.priceCar7 !== null && v.priceCar7 < v.priceCar4) {
    out.push(`Giá bao xe 7 chỗ (${formatVnd(v.priceCar7)}) thấp hơn giá 4 chỗ (${formatVnd(v.priceCar4)}).`);
  }
  if (v.pricePerSeatGhep !== null && v.priceCar4 !== null && v.pricePerSeatGhep >= v.priceCar4) {
    out.push(`Giá 1 ghế ghép (${formatVnd(v.pricePerSeatGhep)}) không thấp hơn giá bao cả xe 4 chỗ (${formatVnd(v.priceCar4)}).`);
  }
  return out;
}

export type PriceChangeLine = { key: FlatPriceKey; label: string; before: number | null; after: number | null; changed: boolean };

/** So từng giá cũ → mới. `before` null = hàng chưa tồn tại (mọi giá cũ coi là "không áp đồng giá"). */
export function diffFlatPrice(
  before: Pick<SpecialZoneFlatPrice, FlatPriceKey> | null,
  after: Pick<UpsertSpecialZoneFlatPriceRequest, FlatPriceKey>,
): PriceChangeLine[] {
  return FLAT_PRICE_FIELDS.map(({ key, label }) => {
    const b = before ? before[key] ?? null : null;
    const a = after[key] ?? null;
    return { key, label, before: b, after: a, changed: b !== a };
  });
}

export function hasPriceChange(lines: PriceChangeLine[]): boolean {
  return lines.some((l) => l.changed);
}

/** Nhãn của hàng: "cả tỉnh" hoặc tên (mã) phường. */
export function flatPriceTargetLabel(
  zone: Pick<SpecialZone, 'provinceName' | 'provinceCode'>,
  wardCode: string | null,
  wardName?: string | null,
): string {
  if (wardCode === null) return `Cả ${zone.provinceName ?? `tỉnh ${zone.provinceCode}`} (mặc định)`;
  return wardName ? `${wardName} (${wardCode})` : `Phường/xã ${wardCode}`;
}

/** Điều khoản đúng nghĩa của đồng giá, hiện ở màn và ở mọi hộp xác nhận. */
export const FLAT_PRICE_BYPASS_WARNING =
  'Khi hàng này khớp, MỌI luật điều chỉnh khu vực (macro) bị bỏ qua và băng chặn PRC_002 KHÔNG bảo vệ khỏi giá gõ nhầm — giá nhập là giá bán (phụ phí/VAT vẫn cộng thêm).';

export type ConfirmText = {
  title: string;
  lines: string[];
  /** Loại để TRỐNG sẽ rơi về đâu (rỗng khi hàng có đủ ba giá). */
  fallbacks: string[];
  warnings: string[];
  bypass: string;
};

/**
 * Loại để TRỐNG của hàng sắp lưu sẽ rơi về đâu — khớp `timDongGia`/`giaDongGia` (pricing.service.ts): ô NULL chỉ
 * bỏ bậc này CHO ĐÚNG loại đó. Hàng của phường rơi về hàng MẶC ĐỊNH cả tỉnh nếu hàng đó CÓ giá cho loại này (đầu
 * kia ở phường của tỉnh vùng nên điều kiện cùng tỉnh luôn đúng), rồi mới tới bảng km + luật macro. Hàng mặc định
 * không có bậc nào ở dưới ngoài bảng km.
 */
export function describeBlankFallbacks(args: {
  wardCode: string | null;
  after: Pick<UpsertSpecialZoneFlatPriceRequest, FlatPriceKey>;
  /** Hàng mặc định cả tỉnh hiện có của vùng (null = chưa có). Bỏ qua khi `wardCode` null. */
  defaultRow: Pick<SpecialZoneFlatPrice, FlatPriceKey> | null;
}): string[] {
  const out: string[] = [];
  for (const { key, label } of FLAT_PRICE_FIELDS) {
    if ((args.after[key] ?? null) !== null) continue;
    if (args.wardCode === null) {
      out.push(
        `${label}: cả tỉnh không có giá riêng → chuyến loại này tính theo bảng km (+ luật macro), trừ phường có hàng riêng với giá loại này.`,
      );
      continue;
    }
    const d = args.defaultRow?.[key] ?? null;
    if (d !== null) {
      out.push(`${label}: lấy giá hàng mặc định cả tỉnh ${formatVnd(d)}.`);
    } else {
      const why = args.defaultRow ? 'hàng mặc định cả tỉnh cũng không có giá loại này' : 'chưa có hàng mặc định cả tỉnh';
      out.push(`${label}: ${why} → tính theo bảng km (+ luật macro).`);
    }
  }
  return out;
}

/**
 * Nội dung hộp xác nhận LƯU: nêu nơi áp, từng giá cũ → mới, loại để trống rơi về đâu, cảnh báo mềm và điều khoản
 * bỏ qua macro/band.
 */
export function describeFlatPriceSave(args: {
  zone: Pick<SpecialZone, 'name' | 'provinceName' | 'provinceCode'>;
  wardCode: string | null;
  wardName?: string | null;
  before: Pick<SpecialZoneFlatPrice, FlatPriceKey> | null;
  after: Pick<UpsertSpecialZoneFlatPriceRequest, FlatPriceKey>;
  /** Hàng mặc định cả tỉnh hiện có của vùng — để nói loại để trống ở hàng phường rơi về giá nào. */
  defaultRow?: Pick<SpecialZoneFlatPrice, FlatPriceKey> | null;
  warnings?: string[];
}): ConfirmText {
  const target = flatPriceTargetLabel(args.zone, args.wardCode, args.wardName);
  const lines = diffFlatPrice(args.before, args.after).map((l) =>
    l.changed
      ? `${l.label}: ${formatVnd(l.before)} → ${formatVnd(l.after)}`
      : `${l.label}: ${formatVnd(l.after)} (không đổi)`,
  );
  return {
    title: `${args.before ? 'Cập nhật' : 'Thêm'} đồng giá ${args.zone.name} — ${target}`,
    lines,
    fallbacks: describeBlankFallbacks({
      wardCode: args.wardCode,
      after: args.after,
      defaultRow: args.defaultRow ?? null,
    }),
    warnings: args.warnings ?? [],
    bypass: FLAT_PRICE_BYPASS_WARNING,
  };
}

/** Hộp xác nhận THÊM cùng một mức giá cho nhiều nơi: nêu giá một lần + danh sách nơi áp dụng. */
export function describeFlatPriceBatchSave(args: {
  zone: Pick<SpecialZone, 'name' | 'provinceName' | 'provinceCode'>;
  targets: { wardCode: string | null; wardName?: string | null }[];
  after: Pick<UpsertSpecialZoneFlatPriceRequest, FlatPriceKey>;
  defaultRow?: Pick<SpecialZoneFlatPrice, FlatPriceKey> | null;
  warnings?: string[];
  listMax?: number;
}): ConfirmText {
  const max = args.listMax ?? 10;
  const labels = args.targets.map((t) => flatPriceTargetLabel(args.zone, t.wardCode, t.wardName));
  const head = labels.slice(0, max).join(', ');
  const more = labels.length > max ? ` và ${labels.length - max} nơi khác` : '';
  const lines = FLAT_PRICE_FIELDS.map(({ key, label }) => `${label}: ${formatVnd(args.after[key])}`);
  lines.push(`Áp cho ${labels.length} nơi: ${head}${more}`);
  const firstWard = args.targets.find((t) => t.wardCode !== null)?.wardCode ?? null;
  return {
    title: `Thêm đồng giá ${args.zone.name} cho ${labels.length} nơi`,
    lines,
    fallbacks: describeBlankFallbacks({ wardCode: firstWard, after: args.after, defaultRow: args.defaultRow ?? null }),
    warnings: args.warnings ?? [],
    bypass: FLAT_PRICE_BYPASS_WARNING,
  };
}

/** Nội dung hộp xác nhận XOÁ: giá đang áp sẽ mất, chuyến rơi về hàng mặc định (hàng phường) hoặc bảng km + macro. */
export function describeFlatPriceDelete(args: {
  zone: Pick<SpecialZone, 'name' | 'provinceName' | 'provinceCode'>;
  row: Pick<SpecialZoneFlatPrice, FlatPriceKey | 'wardCode' | 'wardName'>;
}): { title: string; lines: string[]; consequence: string } {
  const target = flatPriceTargetLabel(args.zone, args.row.wardCode, args.row.wardName);
  return {
    title: `Xoá đồng giá ${args.zone.name} — ${target}`,
    lines: FLAT_PRICE_FIELDS.map(({ key, label }) => `${label}: ${formatVnd(args.row[key])} → không áp đồng giá`),
    consequence:
      args.row.wardCode === null
        ? 'Chuyến không có hàng riêng của phường (với giá cho loại đó) sẽ tính theo bảng km (+ luật macro, gồm ZONE:<mã>), có thể đổi giá bán ngay.'
        : 'Loại nào hàng mặc định cả tỉnh có giá thì chuyến của phường này lấy giá đó; loại còn lại tính theo bảng km (+ luật macro) — giá bán đổi ngay.',
  };
}
