import { describe, it, expect } from 'vitest';
import {
  BUSINESS_REFERENCE_VND,
  FLAT_PRICE_BYPASS_WARNING,
  FLAT_PRICE_MAX_VND,
  FLAT_PRICE_NOTE_MAX,
  FLAT_PRICE_UNIT_VND,
  REFERENCE_PROVENANCE,
  describeBlankFallbacks,
  describeFlatPriceDelete,
  describeFlatPriceSave,
  diffFlatPrice,
  flatPriceTargetLabel,
  formatVnd,
  hasPriceChange,
  parsePriceInput,
  roundToThousand,
  validateFlatPriceForm,
  validateFlatPriceBatch,
  FLAT_PRICE_BATCH_MAX,
} from './special-zone-flat-price';

const ZONE = { name: 'Sân bay Nội Bài', provinceName: 'Hà Nội', provinceCode: '01' };
const WARDS = new Set(['00001', '00002']);

const form = (over: Partial<Parameters<typeof validateFlatPriceForm>[0]> = {}) => ({
  wardCode: null as string | null,
  prices: { pricePerSeatGhep: '', priceCar4: '250000', priceCar7: '' },
  note: '',
  ...over,
});
const opts = (over: Partial<Parameters<typeof validateFlatPriceForm>[1]> = {}) => ({
  mode: 'create' as const,
  provinceWardCodes: WARDS as ReadonlySet<string> | null,
  existing: [] as { wardCode: string | null }[],
  ...over,
});

describe('parsePriceInput', () => {
  it('trống = null (không áp đồng giá)', () => {
    expect(parsePriceInput('')).toEqual({ ok: true, value: null });
    expect(parsePriceInput('   ')).toEqual({ ok: true, value: null });
  });
  it('nhận số nguyên và nhóm 3 chữ số kiểu VN', () => {
    expect(parsePriceInput('250000')).toEqual({ ok: true, value: 250000 });
    expect(parsePriceInput(' 250.000 ')).toEqual({ ok: true, value: 250000 });
    expect(parsePriceInput('1,250,000')).toEqual({ ok: true, value: 1250000 });
    expect(parsePriceInput('350 000')).toEqual({ ok: true, value: 350000 });
  });
  it.each(['0', '000', '-5', '250.5', '250,5', '2.5', '1.00', 'abc', '250k', '1e6', '12.34.567'])(
    'từ chối %s',
    (raw) => {
      expect(parsePriceInput(raw).ok).toBe(false);
    },
  );
  it('chặn vượt trần lưu trữ; trần lưu trữ (…999) không tròn nghìn nên mức tròn nghìn lớn nhất mới được nhận', () => {
    const maxRound = FLAT_PRICE_MAX_VND - 999;
    expect(parsePriceInput(String(maxRound))).toEqual({ ok: true, value: maxRound });
    const over = parsePriceInput(String(FLAT_PRICE_MAX_VND + 1));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toMatch(/giới hạn lưu trữ/);
    expect(parsePriceInput('99999999999999999999').ok).toBe(false);
  });
});

// Backend: DTO/DB chỉ chặn "số nguyên > 0", KHÔNG làm tròn lúc ghi; lúc báo giá ghép/bao xe nó lấy
// `Math.round(giá / 1000) * 1000` (pricing.service.ts, `giaMotGhe`) — kể cả giá đồng giá. Số lẻ nghìn nằm nguyên trong
// DB rồi bị đổi thành giá khác khi bán, nên màn này chỉ nhận bội số của 1.000 đ.
describe('parsePriceInput — bội số của 1.000 đ (backend làm tròn lúc báo giá)', () => {
  it('đơn vị là 1.000 đ', () => {
    expect(FLAT_PRICE_UNIT_VND).toBe(1000);
  });

  it.each(['1000', '250000', '250.000', '1,250,000', '350 000', '999000'])('nhận bội số của 1.000: %s', (raw) => {
    const r = parsePriceInput(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as number) % 1000).toBe(0);
  });

  it('từ chối số lẻ nghìn và nói rõ giá sẽ bán là bao nhiêu', () => {
    const r = parsePriceInput('250400');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/bội số của 1\.000 đ/);
      expect(r.error).toContain('250.400 đ');
      expect(r.error).toContain('sẽ bán 250.000 đ');
    }
  });

  it('250.500 bị làm tròn LÊN 251.000 (đúng Math.round của backend) nên cũng bị từ chối', () => {
    const r = parsePriceInput('250.500');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('sẽ bán 251.000 đ');
  });

  it('500–999 đ thành 1.000 đ: từ chối, không nhận như thể là 500 đ', () => {
    const r = parsePriceInput('500');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('sẽ bán 1.000 đ');
  });

  it('dưới 500 đ thành 0 đ: từ chối và nói mọi báo giá loại này sẽ bị từ chối (PRC_002)', () => {
    for (const raw of ['1', '400', '499']) {
      const r = parsePriceInput(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toMatch(/tối thiểu 1\.000 đ/);
        expect(r.error).toMatch(/PRC_002/);
      }
    }
  });

  it('0 vẫn báo "lớn hơn 0", không lẫn với thông điệp bội số', () => {
    const r = parsePriceInput('0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/lớn hơn 0/);
  });

  it('roundToThousand khớp Math.round(giá/1000)*1000 của backend', () => {
    expect(roundToThousand(250400)).toBe(250000);
    expect(roundToThousand(250500)).toBe(251000);
    expect(roundToThousand(499)).toBe(0);
    expect(roundToThousand(500)).toBe(1000);
    expect(roundToThousand(250000)).toBe(250000);
  });
});

describe('formatVnd', () => {
  it('nhóm nghìn bằng dấu chấm', () => {
    expect(formatVnd(250000)).toBe('250.000 đ');
    expect(formatVnd(1250000)).toBe('1.250.000 đ');
    expect(formatVnd(500)).toBe('500 đ');
  });
  it('null/undefined = không áp đồng giá', () => {
    expect(formatVnd(null)).toBe('không áp đồng giá');
    expect(formatVnd(undefined)).toBe('không áp đồng giá');
  });
});

describe('validateFlatPriceForm', () => {
  it('hàng mặc định hợp lệ → request đủ 4 khoá, null cho giá bỏ trống', () => {
    const v = validateFlatPriceForm(form(), opts());
    expect(v.request).toEqual({
      wardCode: null,
      pricePerSeatGhep: null,
      priceCar4: 250000,
      priceCar7: null,
      note: null,
    });
    expect(v.warnings).toEqual([]);
  });

  it('hàng theo phường thuộc tỉnh: hợp lệ, cắt khoảng trắng ghi chú', () => {
    const v = validateFlatPriceForm(form({ wardCode: '00001', note: '  sân bay  ' }), opts());
    expect(v.request?.wardCode).toBe('00001');
    expect(v.request?.note).toBe('sân bay');
  });

  it('chặn khi KHÔNG có giá nào', () => {
    const v = validateFlatPriceForm(
      form({ prices: { pricePerSeatGhep: '', priceCar4: '', priceCar7: '' } }),
      opts(),
    );
    expect(v.request).toBeUndefined();
    expect(v.errors.form).toMatch(/ít nhất một giá/);
  });

  it('chặn giá sai, báo lỗi đúng ô', () => {
    const v = validateFlatPriceForm(
      form({ prices: { pricePerSeatGhep: '0', priceCar4: '250.5', priceCar7: '350000' } }),
      opts(),
    );
    expect(v.request).toBeUndefined();
    expect(Object.keys(v.errors.prices).sort()).toEqual(['priceCar4', 'pricePerSeatGhep']);
    expect(v.errors.form).toBeUndefined();
  });

  it('chặn giá lẻ nghìn (backend làm tròn lúc báo giá), báo đúng ô và đúng giá sẽ bán', () => {
    const v = validateFlatPriceForm(
      form({ prices: { pricePerSeatGhep: '90000', priceCar4: '250400', priceCar7: '350000' } }),
      opts(),
    );
    expect(v.request).toBeUndefined();
    expect(Object.keys(v.errors.prices)).toEqual(['priceCar4']);
    expect(v.errors.prices.priceCar4).toMatch(/^Bao xe 4 chỗ: .*sẽ bán 250\.000 đ/);
    // Chặn cả khi sửa hàng có sẵn (không để một giá lẻ nghìn lọt qua đường "sửa").
    expect(
      validateFlatPriceForm(form({ prices: { pricePerSeatGhep: '', priceCar4: '250500', priceCar7: '' } }), opts({ mode: 'edit' }))
        .request,
    ).toBeUndefined();
  });

  it('chặn phường không thuộc tỉnh của vùng', () => {
    const v = validateFlatPriceForm(form({ wardCode: '99999' }), opts());
    expect(v.request).toBeUndefined();
    expect(v.errors.ward).toMatch(/không thuộc tỉnh/);
  });

  it('chặn hàng theo phường khi danh sách phường chưa tải', () => {
    const v = validateFlatPriceForm(form({ wardCode: '00001' }), opts({ provinceWardCodes: null }));
    expect(v.request).toBeUndefined();
    expect(v.errors.ward).toMatch(/chưa tải xong/);
  });

  it('không cho mã "default" làm mã phường', () => {
    const v = validateFlatPriceForm(form({ wardCode: 'default' }), opts());
    expect(v.errors.ward).toBeDefined();
  });

  it('thêm MỚI trùng hàng có sẵn bị chặn (PUT sẽ ghi đè lặng lẽ); sửa thì được', () => {
    const existing = [{ wardCode: null }, { wardCode: '00001' }];
    expect(validateFlatPriceForm(form(), opts({ existing })).errors.ward).toMatch(/hàng mặc định/);
    expect(validateFlatPriceForm(form({ wardCode: '00001' }), opts({ existing })).errors.ward).toMatch(/đã có đồng giá/);
    expect(validateFlatPriceForm(form({ wardCode: '00002' }), opts({ existing })).request).toBeDefined();
    expect(validateFlatPriceForm(form({ wardCode: '00001' }), opts({ existing, mode: 'edit' })).request).toBeDefined();
  });

  it('ghi chú quá dài bị chặn', () => {
    const v = validateFlatPriceForm(form({ note: 'x'.repeat(FLAT_PRICE_NOTE_MAX + 1) }), opts());
    expect(v.request).toBeUndefined();
    expect(v.errors.note).toBeDefined();
  });

  it('cảnh báo (không chặn) khi lệch xa mức tham chiếu — bắt thiếu/thừa số 0', () => {
    const lo = validateFlatPriceForm(form({ prices: { pricePerSeatGhep: '', priceCar4: '25000', priceCar7: '' } }), opts());
    expect(lo.request).toBeDefined();
    expect(lo.warnings.join(' ')).toMatch(/lệch xa mức tham chiếu/);
    // Mốc chỉ là tham chiếu (trần cũ của tuyến đã bỏ), không phải số kinh doanh đã chốt — cảnh báo phải nói vậy.
    expect(lo.warnings.join(' ')).toMatch(/chưa phải giá đã chốt/);
    const hi = validateFlatPriceForm(form({ prices: { pricePerSeatGhep: '', priceCar4: '', priceCar7: '3500000' } }), opts());
    expect(hi.request).toBeDefined();
    expect(hi.warnings.length).toBe(1);
  });

  it('đúng mức tham chiếu thì không cảnh báo; biên đúng ×2 vẫn không cảnh báo', () => {
    const ok = validateFlatPriceForm(
      form({
        prices: {
          pricePerSeatGhep: '',
          priceCar4: String(BUSINESS_REFERENCE_VND.priceCar4),
          priceCar7: String(BUSINESS_REFERENCE_VND.priceCar7 * 2),
        },
      }),
      opts(),
    );
    expect(ok.warnings).toEqual([]);
  });

  it('cảnh báo thứ tự giá bất thường (7 chỗ < 4 chỗ, 1 ghế ≥ cả xe 4 chỗ)', () => {
    const v = validateFlatPriceForm(
      form({ prices: { pricePerSeatGhep: '260000', priceCar4: '250000', priceCar7: '240000' } }),
      opts(),
    );
    expect(v.warnings.some((w) => /7 chỗ.*thấp hơn/.test(w))).toBe(true);
    expect(v.warnings.some((w) => /1 ghế ghép/.test(w))).toBe(true);
  });
});

describe('diffFlatPrice / hasPriceChange', () => {
  const before = { pricePerSeatGhep: null, priceCar4: 250000, priceCar7: 350000 };
  it('đánh dấu đúng giá đổi; null → số là đổi', () => {
    const lines = diffFlatPrice(before, { pricePerSeatGhep: 80000, priceCar4: 250000, priceCar7: 360000 });
    expect(lines.map((l) => [l.key, l.changed])).toEqual([
      ['pricePerSeatGhep', true],
      ['priceCar4', false],
      ['priceCar7', true],
    ]);
    expect(hasPriceChange(lines)).toBe(true);
  });
  it('không đổi', () => {
    expect(hasPriceChange(diffFlatPrice(before, { ...before }))).toBe(false);
  });
  it('hàng mới: mọi giá cũ coi là null', () => {
    const lines = diffFlatPrice(null, { pricePerSeatGhep: null, priceCar4: 250000, priceCar7: null });
    expect(lines.find((l) => l.key === 'priceCar4')).toMatchObject({ before: null, after: 250000, changed: true });
    expect(lines.find((l) => l.key === 'priceCar7')).toMatchObject({ before: null, after: null, changed: false });
  });
});

describe('flatPriceTargetLabel', () => {
  it('cả tỉnh / theo phường', () => {
    expect(flatPriceTargetLabel(ZONE, null)).toBe('Cả Hà Nội (mặc định)');
    expect(flatPriceTargetLabel({ provinceName: null, provinceCode: '01' }, null)).toBe('Cả tỉnh 01 (mặc định)');
    expect(flatPriceTargetLabel(ZONE, '00001', 'Phường Ba Đình')).toBe('Phường Ba Đình (00001)');
    expect(flatPriceTargetLabel(ZONE, '00001')).toBe('Phường/xã 00001');
  });
});

describe('describeFlatPriceSave', () => {
  it('nêu giá cũ → mới, điều khoản bỏ qua macro/band và cảnh báo', () => {
    const t = describeFlatPriceSave({
      zone: ZONE,
      wardCode: null,
      before: { pricePerSeatGhep: null, priceCar4: 250000, priceCar7: null },
      after: { pricePerSeatGhep: null, priceCar4: 300000, priceCar7: 350000 },
      warnings: ['cảnh báo X'],
    });
    expect(t.title).toBe('Cập nhật đồng giá Sân bay Nội Bài — Cả Hà Nội (mặc định)');
    expect(t.lines).toEqual([
      'Ghép (1 ghế): không áp đồng giá (không đổi)',
      'Bao xe 4 chỗ: 250.000 đ → 300.000 đ',
      'Bao xe 7 chỗ: không áp đồng giá → 350.000 đ',
    ]);
    expect(t.warnings).toEqual(['cảnh báo X']);
    expect(t.bypass).toBe(FLAT_PRICE_BYPASS_WARNING);
    expect(t.bypass).toMatch(/macro/);
    expect(t.bypass).toMatch(/PRC_002/);
  });
  it('hàng mới: tiêu đề "Thêm"', () => {
    const t = describeFlatPriceSave({
      zone: ZONE,
      wardCode: '00001',
      wardName: 'Phường Ba Đình',
      before: null,
      after: { pricePerSeatGhep: 90000, priceCar4: null, priceCar7: null },
    });
    expect(t.title).toBe('Thêm đồng giá Sân bay Nội Bài — Phường Ba Đình (00001)');
    expect(t.lines[0]).toBe('Ghép (1 ghế): không áp đồng giá → 90.000 đ');
  });

  // Backend `timDongGia`/`giaDongGia`: ô NULL chỉ bỏ bậc đó CHO ĐÚNG loại đó. Hàng phường để trống một loại thì loại
  // ấy rơi về GIÁ CỦA HÀNG MẶC ĐỊNH cả tỉnh (nếu hàng đó có giá loại ấy) — KHÔNG thẳng về bảng km.
  it('hàng phường để trống một loại mà hàng mặc định có giá loại đó: nói rõ sẽ lấy giá mặc định', () => {
    const t = describeFlatPriceSave({
      zone: ZONE,
      wardCode: '00001',
      wardName: 'Phường Ba Đình',
      before: { pricePerSeatGhep: 90000, priceCar4: 230000, priceCar7: 340000 },
      after: { pricePerSeatGhep: 90000, priceCar4: 230000, priceCar7: null },
      defaultRow: { pricePerSeatGhep: null, priceCar4: 250000, priceCar7: 350000 },
    });
    expect(t.fallbacks).toEqual(['Bao xe 7 chỗ: lấy giá hàng mặc định cả tỉnh 350.000 đ.']);
  });

  it('hàng phường để trống mà hàng mặc định không có giá loại đó: rơi về bảng km (+ macro); loại khác vẫn lấy giá mặc định', () => {
    const t = describeFlatPriceSave({
      zone: ZONE,
      wardCode: '00001',
      before: null,
      after: { pricePerSeatGhep: null, priceCar4: 230000, priceCar7: null },
      defaultRow: { pricePerSeatGhep: null, priceCar4: 250000, priceCar7: 350000 },
    });
    expect(t.fallbacks).toEqual([
      'Ghép (1 ghế): hàng mặc định cả tỉnh cũng không có giá loại này → tính theo bảng km (+ luật macro).',
      'Bao xe 7 chỗ: lấy giá hàng mặc định cả tỉnh 350.000 đ.',
    ]);
  });

  it('hàng phường để trống khi CHƯA có hàng mặc định: nói thẳng là chưa có, rơi về bảng km', () => {
    const t = describeFlatPriceSave({
      zone: ZONE,
      wardCode: '00001',
      before: null,
      after: { pricePerSeatGhep: 90000, priceCar4: null, priceCar7: null },
      defaultRow: null,
    });
    expect(t.fallbacks).toEqual([
      'Bao xe 4 chỗ: chưa có hàng mặc định cả tỉnh → tính theo bảng km (+ luật macro).',
      'Bao xe 7 chỗ: chưa có hàng mặc định cả tỉnh → tính theo bảng km (+ luật macro).',
    ]);
  });

  it('hàng mặc định để trống một loại: rơi về bảng km (trừ phường có hàng riêng với giá loại đó); bỏ qua defaultRow', () => {
    const t = describeFlatPriceSave({
      zone: ZONE,
      wardCode: null,
      before: null,
      after: { pricePerSeatGhep: null, priceCar4: 250000, priceCar7: 350000 },
      // Đưa nhầm một hàng mặc định khác vào cũng không được dùng: hàng mặc định không rơi về chính nó.
      defaultRow: { pricePerSeatGhep: 80000, priceCar4: 1, priceCar7: 1 },
    });
    expect(t.fallbacks).toHaveLength(1);
    expect(t.fallbacks[0]).toMatch(/^Ghép \(1 ghế\): cả tỉnh không có giá riêng → .*bảng km.*trừ phường có hàng riêng/);
  });

  it('đủ ba giá thì không có dòng rơi-về nào', () => {
    const t = describeFlatPriceSave({
      zone: ZONE,
      wardCode: '00001',
      before: null,
      after: { pricePerSeatGhep: 90000, priceCar4: 230000, priceCar7: 340000 },
      defaultRow: null,
    });
    expect(t.fallbacks).toEqual([]);
  });
});

describe('describeBlankFallbacks', () => {
  it('chỉ liệt kê loại để trống (null), theo thứ tự ghép → 4 chỗ → 7 chỗ', () => {
    const lines = describeBlankFallbacks({
      wardCode: '00001',
      after: { pricePerSeatGhep: null, priceCar4: 230000, priceCar7: null },
      defaultRow: { pricePerSeatGhep: 80000, priceCar4: null, priceCar7: 350000 },
    });
    expect(lines).toEqual([
      'Ghép (1 ghế): lấy giá hàng mặc định cả tỉnh 80.000 đ.',
      'Bao xe 7 chỗ: lấy giá hàng mặc định cả tỉnh 350.000 đ.',
    ]);
  });
});

describe('mức tham chiếu', () => {
  it('nhãn nói rõ nguồn gốc: trần bao xe cũ của tuyến nội đô Hà Nội gồm sân bay, KHÔNG phải số đã chốt', () => {
    expect(REFERENCE_PROVENANCE).toMatch(/không phải số kinh doanh đã chốt/);
    expect(REFERENCE_PROVENANCE).toMatch(/trần bao xe/);
    expect(REFERENCE_PROVENANCE).toMatch(/Nội đô Hà Nội gồm sân bay/);
    expect(REFERENCE_PROVENANCE).toMatch(/trước 15\/10\/2026/);
    expect(BUSINESS_REFERENCE_VND).toEqual({ priceCar4: 250_000, priceCar7: 350_000 });
  });
});

describe('describeFlatPriceDelete', () => {
  const row = { wardCode: null, wardName: null, pricePerSeatGhep: null, priceCar4: 250000, priceCar7: 350000 };
  it('nêu giá sẽ mất và hệ quả rơi về bảng km + macro (trừ phường có hàng riêng với giá loại đó)', () => {
    const t = describeFlatPriceDelete({ zone: ZONE, row });
    expect(t.title).toBe('Xoá đồng giá Sân bay Nội Bài — Cả Hà Nội (mặc định)');
    expect(t.lines).toContain('Bao xe 4 chỗ: 250.000 đ → không áp đồng giá');
    expect(t.consequence).toMatch(/bảng km/);
    expect(t.consequence).toMatch(/không có hàng riêng của phường \(với giá cho loại đó\)/);
  });
  it('hàng theo phường: loại nào hàng mặc định có giá thì lấy giá đó, còn lại rơi về bảng km', () => {
    const t = describeFlatPriceDelete({ zone: ZONE, row: { ...row, wardCode: '00001', wardName: 'Phường Ba Đình' } });
    expect(t.consequence).toMatch(/hàng mặc định cả tỉnh có giá/);
    expect(t.consequence).toMatch(/loại còn lại tính theo bảng km/);
  });
});

describe('validateFlatPriceBatch', () => {
  const prices = { pricePerSeatGhep: '', priceCar4: '300000', priceCar7: '' };
  const wards = new Set(['A', 'B']);
  it('một yêu cầu cho mỗi nơi, theo thứ tự chọn', () => {
    const v = validateFlatPriceBatch({ targets: ['B', 'A', null], prices, note: '' }, { provinceWardCodes: wards, existing: [] });
    expect(v.errors.ward).toBeUndefined();
    expect(v.requests?.map((r) => r.wardCode)).toEqual(['B', 'A', null]);
  });
  it('rỗng, quá trần, nơi đã có hàng, phường ngoài tỉnh đều bị chặn (không có requests)', () => {
    const opts = { provinceWardCodes: wards, existing: [{ wardCode: 'A' }] };
    expect(validateFlatPriceBatch({ targets: [], prices, note: '' }, opts).requests).toBeUndefined();
    const many = Array.from({ length: FLAT_PRICE_BATCH_MAX + 1 }, () => 'B');
    expect(validateFlatPriceBatch({ targets: many, prices, note: '' }, opts).errors.ward).toMatch(/Tối đa/);
    expect(validateFlatPriceBatch({ targets: ['A'], prices, note: '' }, opts).errors.ward).toMatch(/đã có đồng giá/);
    expect(validateFlatPriceBatch({ targets: ['Z'], prices, note: '' }, opts).errors.ward).toMatch(/không thuộc tỉnh/);
  });
  it('lỗi giá chặn cả lô', () => {
    const v = validateFlatPriceBatch({ targets: ['A'], prices: { ...prices, priceCar4: '250400' }, note: '' }, { provinceWardCodes: wards, existing: [] });
    expect(v.requests).toBeUndefined();
    expect(v.errors.prices.priceCar4).toBeTruthy();
  });
});
