import { describe, it, expect } from 'vitest';
import type { MacroMatchCombo, MacroMatchVerdict } from './api';
import { serviceLabel, vehicleLabel, type MacroEndpoint } from './macro-bulk';
import {
  EMPTY_FILTERS,
  MACRO_NOTE_SEARCH_MAX,
  MACRO_TEXT_SEARCH_MAX,
  comboLabel,
  comboMatchesFilters,
  comboShortLabel,
  defaultComboIndex,
  flatPriceText,
  hasActiveFilters,
  macroRuleAdjustmentText,
  macroRuleEndText,
  macroRuleRouteText,
  matchAvailability,
  noteOnlyQuery,
  placeFilterLabel,
  toMatchParams,
  toSearchParams,
  verdictLabel,
  type MacroPlaceFilter,
  type MacroSearchFilters,
} from './macro-search';
import type { PricingMacroRule } from './types';

const DAI_TU: MacroEndpoint = { provinceCode: '19', wardCode: '19001', label: 'Đại Từ (Thái Nguyên)' };
const CAU_GIAY: MacroEndpoint = { provinceCode: '01', wardCode: '01002', label: 'Cầu Giấy (Hà Nội)' };
const HA_NOI: MacroEndpoint = { provinceCode: '01', label: 'Cả tỉnh Hà Nội' };
const NOI_BAI: MacroEndpoint = { provinceCode: '01', wardCode: 'ZONE:NOIBAI', label: 'Sân bay Nội Bài (điểm đặc biệt)' };

const place = (endpoint: MacroEndpoint): MacroPlaceFilter => ({ kind: 'place', endpoint });
const text = (t: string): MacroPlaceFilter => ({ kind: 'text', text: t });
const f = (patch: Partial<MacroSearchFilters>): MacroSearchFilters => ({ ...EMPTY_FILTERS, ...patch });
const PAGING = { page: 3, limit: 20 };

describe('EMPTY_FILTERS / hasActiveFilters', () => {
  it('bộ lọc rỗng: không điểm, mọi ô "tất cả", ghi chú trống, «gồm cấp tỉnh/mọi nơi» BẬT sẵn; không sửa nhầm được', () => {
    expect(EMPTY_FILTERS).toEqual({ origin: null, dest: null, serviceType: '', vehicleType: '', isActive: '', q: '', cover: true });
    expect(Object.isFrozen(EMPTY_FILTERS)).toBe(true);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('mỗi ô lọc riêng lẻ đều tính là đang lọc', () => {
    expect(hasActiveFilters(f({ origin: place(DAI_TU) }))).toBe(true);
    expect(hasActiveFilters(f({ dest: place(HA_NOI) }))).toBe(true);
    expect(hasActiveFilters(f({ origin: text('Đông Anh') }))).toBe(true);
    expect(hasActiveFilters(f({ serviceType: 'CARPOOL' }))).toBe(true);
    expect(hasActiveFilters(f({ vehicleType: 'CAR_7' }))).toBe(true);
    expect(hasActiveFilters(f({ isActive: 'false' }))).toBe(true);
    expect(hasActiveFilters(f({ isActive: 'true' }))).toBe(true);
    expect(hasActiveFilters(f({ q: '#12' }))).toBe(true);
  });

  it('chỉ khoảng trắng / chỉ tắt «gồm cấp tỉnh» (không có điểm nào) thì KHÔNG phải đang lọc', () => {
    expect(hasActiveFilters(f({ q: '   ' }))).toBe(false);
    expect(hasActiveFilters(f({ cover: false }))).toBe(false);
    expect(hasActiveFilters(f({ origin: text('   ') }))).toBe(false);
  });
});

describe('toSearchParams — mỗi đầu gửi MÃ hoặc CHỮ, không bao giờ cả hai', () => {
  it('bộ lọc rỗng: chỉ còn trang', () => {
    expect(toSearchParams(EMPTY_FILTERS, PAGING)).toStrictEqual({ page: 3, limit: 20 });
  });

  it('điểm đón là xã: gửi mã tỉnh + mã xã, KHÔNG gửi chữ; có điểm cụ thể ⇒ gửi cover', () => {
    expect(toSearchParams(f({ origin: place(DAI_TU) }), PAGING)).toStrictEqual({
      page: 3,
      limit: 20,
      originProvinceCode: '19',
      originWardCode: '19001',
      cover: true,
    });
  });

  it('điểm đến là «Cả tỉnh»: chỉ mã tỉnh (không có khoá mã xã); điểm đặc biệt: mã xã là ZONE:<mã>', () => {
    expect(toSearchParams(f({ dest: place(HA_NOI), cover: false }), PAGING)).toStrictEqual({
      page: 3,
      limit: 20,
      destProvinceCode: '01',
    });
    expect(toSearchParams(f({ origin: place(NOI_BAI), cover: false }), PAGING)).toStrictEqual({
      page: 3,
      limit: 20,
      originProvinceCode: '01',
      originWardCode: 'ZONE:NOIBAI',
    });
  });

  it('một đầu theo chữ: chỉ originSearch/destSearch (đã cắt), KHÔNG có mã; không có điểm cụ thể ⇒ KHÔNG gửi cover', () => {
    expect(toSearchParams(f({ origin: text('  Đông Anh '), dest: text('huyện Tứ Kỳ') }), PAGING)).toStrictEqual({
      page: 3,
      limit: 20,
      originSearch: 'Đông Anh',
      destSearch: 'huyện Tứ Kỳ',
    });
  });

  it('trộn: đón theo chữ + đến theo mã ⇒ mỗi đầu đúng một cách; cover gửi vì có một điểm cụ thể', () => {
    const p = toSearchParams(f({ origin: text('Đông Anh'), dest: place(CAU_GIAY) }), PAGING);
    expect(p).toStrictEqual({
      page: 3,
      limit: 20,
      originSearch: 'Đông Anh',
      destProvinceCode: '01',
      destWardCode: '01002',
      cover: true,
    });
  });

  it('không đầu nào gửi cả mã lẫn chữ (mọi tổ hợp dạng điểm)', () => {
    const sides: (MacroPlaceFilter | null)[] = [null, place(DAI_TU), place(HA_NOI), place(NOI_BAI), text('Đông Anh')];
    for (const origin of sides) {
      for (const dest of sides) {
        const p = toSearchParams(f({ origin, dest }), PAGING);
        expect(Boolean(p.originSearch) && Boolean(p.originProvinceCode || p.originWardCode)).toBe(false);
        expect(Boolean(p.destSearch) && Boolean(p.destProvinceCode || p.destWardCode)).toBe(false);
        // cover chỉ khi có ít nhất một đầu theo MÃ
        const exact = origin?.kind === 'place' || dest?.kind === 'place';
        expect(p.cover === true).toBe(exact);
      }
    }
  });

  it('tắt «gồm cấp tỉnh/mọi nơi» ⇒ không có khoá cover', () => {
    expect('cover' in toSearchParams(f({ origin: place(DAI_TU), cover: false }), PAGING)).toBe(false);
  });

  it('dịch vụ / loại xe / bật-tắt / ghi chú: ánh xạ đúng, ô trống không gửi', () => {
    expect(
      toSearchParams(f({ serviceType: 'RIDE', vehicleType: 'CAR_4', isActive: 'true', q: '  #42 ' }), PAGING),
    ).toStrictEqual({ page: 3, limit: 20, serviceType: 'RIDE', vehicleType: 'CAR_4', isActive: true, q: '#42' });
    expect(toSearchParams(f({ serviceType: 'CARPOOL', vehicleType: 'CAR_7', isActive: 'false' }), PAGING)).toStrictEqual({
      page: 3,
      limit: 20,
      serviceType: 'CARPOOL',
      vehicleType: 'CAR_7',
      isActive: false,
    });
    expect('q' in toSearchParams(f({ q: '   ' }), PAGING)).toBe(false);
  });
});

describe('toMatchParams / matchAvailability — «đang áp dụng» chỉ khi CẢ HAI đầu là điểm cụ thể', () => {
  it('thiếu một đầu, hoặc một đầu theo chữ ⇒ null', () => {
    expect(toMatchParams(EMPTY_FILTERS)).toBeNull();
    expect(toMatchParams(f({ origin: place(DAI_TU) }))).toBeNull();
    expect(toMatchParams(f({ dest: place(DAI_TU) }))).toBeNull();
    expect(toMatchParams(f({ origin: place(DAI_TU), dest: text('Đông Anh') }))).toBeNull();
    expect(toMatchParams(f({ origin: text('Đông Anh'), dest: place(DAI_TU) }))).toBeNull();
  });

  it('xã ↔ xã: đủ 4 mã; «Cả tỉnh» không có khoá mã xã; điểm đặc biệt mang ZONE:<mã>', () => {
    expect(toMatchParams(f({ origin: place(DAI_TU), dest: place(CAU_GIAY) }))).toStrictEqual({
      originProvinceCode: '19',
      originWardCode: '19001',
      destProvinceCode: '01',
      destWardCode: '01002',
    });
    expect(toMatchParams(f({ origin: place(NOI_BAI), dest: place(HA_NOI) }))).toStrictEqual({
      originProvinceCode: '01',
      originWardCode: 'ZONE:NOIBAI',
      destProvinceCode: '01',
    });
    expect(toMatchParams(f({ origin: place(HA_NOI), dest: place(DAI_TU) }))).toStrictEqual({
      originProvinceCode: '01',
      destProvinceCode: '19',
      destWardCode: '19001',
    });
  });

  it('dịch vụ / xe / bật-tắt / ghi chú / cover KHÔNG ảnh hưởng tra «đang áp» (máy chủ trả đủ 5 tổ hợp)', () => {
    const base = f({ origin: place(DAI_TU), dest: place(CAU_GIAY) });
    const noisy = { ...base, serviceType: 'RIDE' as const, vehicleType: 'CAR_7' as const, isActive: 'false' as const, q: '#1', cover: false };
    expect(toMatchParams(noisy)).toStrictEqual(toMatchParams(base));
  });

  it('matchAvailability: NEED_BOTH → TEXT_SIDE → PROVINCE_ONLY → READY', () => {
    expect(matchAvailability(EMPTY_FILTERS)).toBe('NEED_BOTH');
    expect(matchAvailability(f({ origin: place(DAI_TU) }))).toBe('NEED_BOTH');
    expect(matchAvailability(f({ dest: place(DAI_TU) }))).toBe('NEED_BOTH');
    expect(matchAvailability(f({ origin: text('Đông Anh') }))).toBe('NEED_BOTH');

    expect(matchAvailability(f({ origin: text('Đông Anh'), dest: place(DAI_TU) }))).toBe('TEXT_SIDE');
    expect(matchAvailability(f({ origin: place(DAI_TU), dest: text('Đông Anh') }))).toBe('TEXT_SIDE');
    expect(matchAvailability(f({ origin: text('a b'), dest: text('c d') }))).toBe('TEXT_SIDE');
    expect(matchAvailability(f({ origin: place(HA_NOI), dest: text('c d') }))).toBe('TEXT_SIDE');

    expect(matchAvailability(f({ origin: place(HA_NOI), dest: place(DAI_TU) }))).toBe('PROVINCE_ONLY');
    expect(matchAvailability(f({ origin: place(DAI_TU), dest: place(HA_NOI) }))).toBe('PROVINCE_ONLY');
    expect(matchAvailability(f({ origin: place(NOI_BAI), dest: place(HA_NOI) }))).toBe('PROVINCE_ONLY');

    expect(matchAvailability(f({ origin: place(DAI_TU), dest: place(CAU_GIAY) }))).toBe('READY');
    expect(matchAvailability(f({ origin: place(NOI_BAI), dest: place(DAI_TU) }))).toBe('READY');
  });

  it('có tra được thì toMatchParams khác null, và ngược lại', () => {
    const sides: (MacroPlaceFilter | null)[] = [null, place(DAI_TU), place(HA_NOI), place(NOI_BAI), text('Đông Anh')];
    for (const origin of sides) {
      for (const dest of sides) {
        const a = matchAvailability(f({ origin, dest }));
        const canAsk = a === 'READY' || a === 'PROVINCE_ONLY';
        expect(toMatchParams(f({ origin, dest })) !== null).toBe(canAsk);
      }
    }
  });
});

describe('nhãn', () => {
  it('verdictLabel: 5 kết luận của máy chủ; giá trị lạ hiện nguyên để thấy bất thường', () => {
    const cases: [MacroMatchVerdict, string][] = [
      ['WINNER', 'Đang áp dụng'],
      ['LOSES_SPECIFICITY', 'Thua: kém cụ thể hơn'],
      ['LOSES_PRIORITY', 'Thua: ưu tiên thấp hơn'],
      ['LOSES_ID', 'Thua: mã nhỏ hơn'],
      ['IGNORED_TYPE', 'Không áp dụng (loại cũ)'],
    ];
    for (const [v, label] of cases) expect(verdictLabel(v)).toBe(label);
    expect(verdictLabel('SOMETHING_NEW' as MacroMatchVerdict)).toBe('SOMETHING_NEW');
  });

  it('comboLabel dùng ĐÚNG nhãn dịch vụ / xe của bảng (không đặt nhãn mới)', () => {
    const combo = (serviceType: MacroMatchCombo['serviceType'], vehicleType: MacroMatchCombo['vehicleType']): MacroMatchCombo => ({
      serviceType,
      vehicleType,
      winnerRuleId: null,
      orientation: null,
      score: null,
      ranking: [],
      truncated: false,
    });
    expect(comboLabel(combo('CARPOOL', 'CAR_4'))).toBe('Ghép xe · Xe 4 chỗ');
    expect(comboLabel(combo('CARPOOL', 'CAR_7'))).toBe('Ghép xe · Xe 7 chỗ');
    expect(comboLabel(combo('RIDE', 'CAR_4'))).toBe('Bao xe · Xe 4 chỗ');
    expect(comboLabel(combo('RIDE', 'CAR_7'))).toBe(`${serviceLabel('RIDE')} · ${vehicleLabel('CAR_7')}`);
    // chuyến KHÔNG chọn loại xe: không phải «Mọi loại xe» (luật chỉ định xe bị bỏ ở tổ hợp này)
    expect(comboLabel(combo('CARPOOL', null))).toBe('Ghép xe · không chọn loại xe');
  });

  it('comboShortLabel (nhãn «ĐANG ÁP · …» trong bảng): ngắn, đủ 5 tổ hợp', () => {
    const c = (serviceType: MacroMatchCombo['serviceType'], vehicleType: MacroMatchCombo['vehicleType']) => ({ serviceType, vehicleType });
    expect(comboShortLabel(c('CARPOOL', 'CAR_4'))).toBe('Ghép 4 chỗ');
    expect(comboShortLabel(c('CARPOOL', null))).toBe('Ghép, không chọn xe');
    expect(comboShortLabel(c('CARPOOL', 'CAR_7'))).toBe('Ghép 7 chỗ');
    expect(comboShortLabel(c('RIDE', 'CAR_4'))).toBe('Bao xe 4 chỗ');
    expect(comboShortLabel(c('RIDE', 'CAR_7'))).toBe('Bao xe 7 chỗ');
  });

  it('flatPriceText: giá định dạng vi-VN + đơn vị ghế/chuyến + mã hàng đồng giá', () => {
    expect(flatPriceText({ source: 'FLAT_WARD', rowId: 7, price: 150000, unit: 'SEAT' })).toBe('Đồng giá 150.000đ/ghế (hàng #7)');
    expect(flatPriceText({ source: 'FLAT_DEFAULT', rowId: 12, price: 1250000, unit: 'TRIP' })).toBe(
      'Đồng giá 1.250.000đ/chuyến (hàng #12)',
    );
  });

  it('MACRO_NOTE_SEARCH_MAX khớp trần 200 ký tự của ô ghi chú/mã (`q`) ở máy chủ', () => {
    expect(MACRO_NOTE_SEARCH_MAX).toBe(200);
  });
});

describe('tổ hợp mặc định theo bộ lọc Dịch vụ / Loại xe (khung «đang áp» + nhãn trong bảng)', () => {
  const combo = (
    serviceType: MacroMatchCombo['serviceType'],
    vehicleType: MacroMatchCombo['vehicleType'],
    winnerRuleId: number | null,
  ): MacroMatchCombo => ({
    serviceType,
    vehicleType,
    winnerRuleId,
    orientation: winnerRuleId === null ? null : 'FORWARD',
    score: winnerRuleId === null ? null : 200,
    ranking: [],
    truncated: false,
    flatPrice: null,
  });
  // Thứ tự máy chủ: ghép 4, ghép không chọn xe, ghép 7, bao xe 4, bao xe 7.
  const FIVE = [
    combo('CARPOOL', 'CAR_4', 10),
    combo('CARPOOL', null, 10),
    combo('CARPOOL', 'CAR_7', 10),
    combo('RIDE', 'CAR_4', 10),
    combo('RIDE', 'CAR_7', 11),
  ];
  const sv = (serviceType: MacroSearchFilters['serviceType'], vehicleType: MacroSearchFilters['vehicleType']) => ({
    serviceType,
    vehicleType,
  });

  it('comboMatchesFilters: ô trống = mọi giá trị (Loại xe trống gồm cả «không chọn loại xe»); có giá trị = đúng giá trị đó', () => {
    expect(FIVE.map((c) => comboMatchesFilters(c, sv('', '')))).toEqual([true, true, true, true, true]);
    expect(FIVE.map((c) => comboMatchesFilters(c, sv('CARPOOL', '')))).toEqual([true, true, true, false, false]);
    expect(FIVE.map((c) => comboMatchesFilters(c, sv('RIDE', '')))).toEqual([false, false, false, true, true]);
    expect(FIVE.map((c) => comboMatchesFilters(c, sv('', 'CAR_4')))).toEqual([true, false, false, true, false]);
    expect(FIVE.map((c) => comboMatchesFilters(c, sv('', 'CAR_7')))).toEqual([false, false, true, false, true]);
    expect(FIVE.map((c) => comboMatchesFilters(c, sv('RIDE', 'CAR_7')))).toEqual([false, false, false, false, true]);
  });

  it('defaultComboIndex: tổ hợp ĐẦU khớp bộ lọc VÀ có luật thắng (Bao xe + Xe 7 chỗ ⇒ bao xe/7, KHÔNG phải ghép/4)', () => {
    expect(defaultComboIndex(FIVE, sv('', ''))).toBe(0);
    expect(defaultComboIndex(FIVE, sv('RIDE', 'CAR_7'))).toBe(4);
    expect(defaultComboIndex(FIVE, sv('RIDE', ''))).toBe(3);
    expect(defaultComboIndex(FIVE, sv('', 'CAR_7'))).toBe(2);
  });

  it('defaultComboIndex: bỏ qua tổ hợp không có luật thắng; khớp mà không ai thắng ⇒ tổ hợp khớp đầu tiên; rỗng ⇒ 0', () => {
    const someEmpty = [
      combo('CARPOOL', 'CAR_4', null),
      combo('CARPOOL', null, null),
      combo('CARPOOL', 'CAR_7', 13),
      combo('RIDE', 'CAR_4', null),
      combo('RIDE', 'CAR_7', null),
    ];
    expect(defaultComboIndex(someEmpty, sv('', ''))).toBe(2);
    expect(defaultComboIndex(someEmpty, sv('RIDE', ''))).toBe(3); // không ai thắng ⇒ tổ hợp khớp đầu tiên
    expect(defaultComboIndex(someEmpty, sv('RIDE', 'CAR_7'))).toBe(4);
    expect(defaultComboIndex([], sv('RIDE', 'CAR_7'))).toBe(0);
    expect(defaultComboIndex(null, sv('', ''))).toBe(0);
    // không tổ hợp nào khớp (máy chủ lạ) ⇒ 0, không vỡ
    expect(defaultComboIndex([combo('CARPOOL', 'CAR_4', 1)], sv('RIDE', ''))).toBe(0);
  });
});

describe('noteOnlyQuery — chỉ lọc ghi chú/mã ⇒ route danh sách cũ (noteSearch)', () => {
  it('chỉ có ô ghi chú/mã ⇒ chữ đã cắt; «gồm cấp tỉnh/mọi nơi» không tính là lọc', () => {
    expect(noteOnlyQuery(f({ q: ' #12 ' }))).toBe('#12');
    expect(noteOnlyQuery(f({ q: 'dịp lễ', cover: false }))).toBe('dịp lễ');
  });

  it('ô ghi chú trống/khoảng trắng, hoặc có thêm BẤT KỲ ô lọc nào khác ⇒ null (đi tìm kiếm mới / danh sách thường)', () => {
    expect(noteOnlyQuery(f({}))).toBeNull();
    expect(noteOnlyQuery(f({ q: '   ' }))).toBeNull();
    expect(noteOnlyQuery(f({ q: '#12', origin: place(DAI_TU) }))).toBeNull();
    expect(noteOnlyQuery(f({ q: '#12', dest: text('Đông Anh') }))).toBeNull();
    expect(noteOnlyQuery(f({ q: '#12', serviceType: 'RIDE' }))).toBeNull();
    expect(noteOnlyQuery(f({ q: '#12', vehicleType: 'CAR_7' }))).toBeNull();
    expect(noteOnlyQuery(f({ q: '#12', isActive: 'false' }))).toBeNull();
    // đầu theo chữ chỉ có khoảng trắng = không lọc ⇒ vẫn là «chỉ ghi chú»
    expect(noteOnlyQuery(f({ q: '#12', dest: text('  ') }))).toBe('#12');
  });

  it('placeFilterLabel: điểm ⇒ nhãn điểm; chữ ⇒ «Chữ: … (gồm tên cũ)»; trống ⇒ chuỗi rỗng', () => {
    expect(placeFilterLabel(place(DAI_TU))).toBe('Đại Từ (Thái Nguyên)');
    expect(placeFilterLabel(text(' Đông Anh '))).toBe('Chữ: Đông Anh (gồm tên cũ)');
    expect(placeFilterLabel(null)).toBe('');
  });

  it('MACRO_TEXT_SEARCH_MAX khớp trần 100 ký tự của máy chủ', () => {
    expect(MACRO_TEXT_SEARCH_MAX).toBe(100);
  });
});

describe('mô tả một quy tắc trong khung «đang áp dụng»', () => {
  const name = (code: string) => ({ '01': 'Hà Nội', '19': 'Thái Nguyên' } as Record<string, string>)[code] ?? code;
  const rule = (patch: Partial<PricingMacroRule>): PricingMacroRule => ({
    id: 1,
    name: 'x',
    isActive: true,
    priority: 0,
    serviceType: 'ALL',
    vehicleType: 'ALL',
    originProvinceCode: null,
    originWardCode: null,
    destProvinceCode: null,
    destWardCode: null,
    adjustmentType: 'DELTA_AMOUNT',
    adjustmentValue: 10000,
    applyPerSeat: true,
    ...patch,
  });

  it('macroRuleEndText: toàn quốc / cả tỉnh / xã kèm tỉnh / điểm đặc biệt / thiếu tên xã thì hiện mã', () => {
    expect(macroRuleEndText(null, null, undefined, name)).toBe('Toàn quốc');
    expect(macroRuleEndText('01', null, undefined, name)).toBe('Cả tỉnh Hà Nội');
    expect(macroRuleEndText('19', '19001', 'Đại Từ', name)).toBe('Đại Từ (Thái Nguyên)');
    expect(macroRuleEndText('01', 'ZONE:NOIBAI', 'Sân bay Nội Bài', name)).toBe('Sân bay Nội Bài (Hà Nội)');
    expect(macroRuleEndText('01', 'ZONE:NOIBAI', undefined, name)).toBe('Điểm đặc biệt NOIBAI (Hà Nội)');
    expect(macroRuleEndText('19', '19001', undefined, name)).toBe('Xã #19001 (Thái Nguyên)');
    expect(macroRuleEndText('77', null, undefined, name)).toBe('Cả tỉnh 77');
  });

  it('macroRuleRouteText: một chiều "→", hai chiều "↔"', () => {
    const r = rule({ originProvinceCode: '19', originWardCode: '19001', originWardName: 'Đại Từ', destProvinceCode: '01' });
    expect(macroRuleRouteText(r, name)).toBe('Đại Từ (Thái Nguyên) → Cả tỉnh Hà Nội');
    expect(macroRuleRouteText({ ...r, isBidirectional: true }, name)).toBe('Đại Từ (Thái Nguyên) ↔ Cả tỉnh Hà Nội');
  });

  it('macroRuleAdjustmentText: như cột "Điều chỉnh" của bảng — bao xe không "/ghế", giá trị chuỗi vẫn đọc được', () => {
    expect(macroRuleAdjustmentText(rule({ adjustmentValue: 20000 }))).toBe('+20.000 đ/ghế');
    expect(macroRuleAdjustmentText(rule({ serviceType: 'RIDE', adjustmentValue: 20000 }))).toBe('+20.000 đ');
    expect(macroRuleAdjustmentText(rule({ serviceType: 'CONVENIENT', adjustmentValue: -5000 }))).toBe('-5.000 đ');
    expect(macroRuleAdjustmentText(rule({ adjustmentType: 'PERCENTAGE', adjustmentValue: '12.5' as unknown as number }))).toBe('+12.5%');
    expect(macroRuleAdjustmentText(rule({ adjustmentType: 'FIXED_PRICE', adjustmentValue: 300000, applyPerSeat: false }))).toBe(
      'Ghi đè: 300.000 đ',
    );
  });

  it('macroRuleAdjustmentText theo TỔ HỢP: bao xe ⇒ «/chuyến» (không «/ghế»), ghép ⇒ «/ghế» (máy giá cộng trên giá 1 ghế / cả xe)', () => {
    const all = rule({ adjustmentValue: 30000 }); // luật «Mọi dịch vụ»
    expect(macroRuleAdjustmentText(all, 'RIDE')).toBe('+30.000 đ/chuyến');
    expect(macroRuleAdjustmentText(all, 'CARPOOL')).toBe('+30.000 đ/ghế');
    const fixed = rule({ adjustmentType: 'FIXED_PRICE', adjustmentValue: 400000 });
    expect(macroRuleAdjustmentText(fixed, 'RIDE')).toBe('Ghi đè: 400.000 đ/chuyến');
    expect(macroRuleAdjustmentText(fixed, 'CARPOOL')).toBe('Ghi đè: 400.000 đ/ghế');
    // cờ applyPerSeat không còn tác dụng ở máy giá: ghép vẫn theo ghế
    expect(macroRuleAdjustmentText(rule({ adjustmentValue: -5000, applyPerSeat: false }), 'CARPOOL')).toBe('-5.000 đ/ghế');
    // phần trăm / loại cũ: không có đơn vị
    expect(macroRuleAdjustmentText(rule({ adjustmentType: 'PERCENTAGE', adjustmentValue: 5 }), 'RIDE')).toBe('+5%');
    expect(macroRuleAdjustmentText(rule({ adjustmentType: 'MIN_FLOOR', adjustmentValue: 50000 }), 'RIDE')).toBe('Sàn: 50.000 đ');
  });
});
