import { describe, it, expect } from 'vitest';
import {
  FORM_SERVICE_VALUES,
  FORM_VEHICLE_VALUES,
  MACRO_BULK_MAX_COMBOS,
  MACRO_BULK_MAX_SIDE,
  addEndpoints,
  adjustmentValueError,
  adjustmentValueRange,
  anySide,
  bidirectionalNotHonored,
  checkBulkSelection,
  chunk,
  comboCount,
  describeSkipped,
  endpointKey,
  formServiceValue,
  formatMacroAdjustment,
  formVehicleValue,
  pendingStagedSelection,
  priorityError,
  removeEndpoint,
  serviceLabel,
  summarizeEndpoints,
  toSelectors,
  vehicleLabel,
  type MacroEndpoint,
  isLegacyAdjustmentType,
  summarizeWarnings,
} from './macro-bulk';

const HN: MacroEndpoint = { provinceCode: '01', label: 'Hà Nội' };
const NGHIA_DO: MacroEndpoint = { provinceCode: '01', wardCode: '00160', label: 'Nghĩa Đô' };
const HY: MacroEndpoint = { provinceCode: '33', label: 'Hưng Yên' };

describe('macro-bulk — danh sách điểm', () => {
  it('addEndpoints bỏ trùng theo (tỉnh, phường) và giữ thứ tự', () => {
    const a = addEndpoints([], [HN, NGHIA_DO]);
    expect(a.map(endpointKey)).toEqual(['01|', '01|00160']);
    const b = addEndpoints(a, [NGHIA_DO, HY]);
    expect(b.map((e) => e.label)).toEqual(['Hà Nội', 'Nghĩa Đô', 'Hưng Yên']);
  });

  it('cả tỉnh và một phường của tỉnh đó là HAI điểm khác nhau (độ cụ thể khác nhau)', () => {
    expect(endpointKey(HN)).not.toBe(endpointKey(NGHIA_DO));
  });

  it('removeEndpoint chỉ bỏ đúng điểm', () => {
    const list = addEndpoints([], [HN, NGHIA_DO, HY]);
    expect(removeEndpoint(list, endpointKey(NGHIA_DO)).map((e) => e.label)).toEqual(['Hà Nội', 'Hưng Yên']);
  });

  it('toSelectors: phường kèm tỉnh, tỉnh đơn thuần chỉ có provinceCode', () => {
    expect(toSelectors([HN, NGHIA_DO])).toEqual([{ provinceCode: '01' }, { provinceCode: '01', wardCode: '00160' }]);
  });
});

describe('macro-bulk — số tổ hợp và giới hạn', () => {
  it('một bên trống = "bất kỳ"; cả hai trống = 0', () => {
    expect(comboCount(0, 0)).toBe(0);
    expect(comboCount(3, 0)).toBe(3);
    expect(comboCount(0, 4)).toBe(4);
    expect(comboCount(3, 4)).toBe(12);
  });

  it('checkBulkSelection: hợp lệ, trống, vượt tổ hợp, vượt mỗi bên', () => {
    expect(checkBulkSelection(2, 3)).toEqual({ ok: true, combos: 6, error: null });
    expect(checkBulkSelection(0, 0).error).toMatch(/ít nhất một điểm/);
    expect(checkBulkSelection(1, 0).ok).toBe(true);

    const over = checkBulkSelection(30, 30); // 900 > 500
    expect(over.ok).toBe(false);
    expect(over.error).toMatch(new RegExp(`tối đa ${MACRO_BULK_MAX_COMBOS}`));

    const side = checkBulkSelection(MACRO_BULK_MAX_SIDE + 1, 1);
    expect(side.ok).toBe(false);
    expect(side.error).toMatch(new RegExp(`tối đa ${MACRO_BULK_MAX_SIDE}`));

    expect(checkBulkSelection(25, 20)).toMatchObject({ ok: true, combos: 500 }); // đúng trần
    expect(checkBulkSelection(25, 21).ok).toBe(false);
  });

  it('chunk chia đúng cỡ và không mất phần tử', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 500)).toEqual([]);
    const big = Array.from({ length: 1201 }, (_, i) => i);
    expect(chunk(big, 500).map((c) => c.length)).toEqual([500, 500, 201]);
  });
});

describe('macro-bulk — biên giá trị (khớp backend)', () => {
  it('DELTA ±2.000.000 nguyên', () => {
    expect(adjustmentValueError('DELTA_AMOUNT', 2_000_000)).toBeNull();
    expect(adjustmentValueError('DELTA_AMOUNT', -2_000_000)).toBeNull();
    expect(adjustmentValueError('DELTA_AMOUNT', 2_000_001)).toMatch(/tối đa/);
    expect(adjustmentValueError('DELTA_AMOUNT', 10.5)).toMatch(/nguyên/);
  });

  it('PERCENT −80 … 200', () => {
    expect(adjustmentValueError('PERCENTAGE', -80)).toBeNull();
    expect(adjustmentValueError('PERCENTAGE', 200)).toBeNull();
    expect(adjustmentValueError('PERCENTAGE', -81)).toMatch(/Phần trăm/);
    expect(adjustmentValueError('PERCENTAGE', 201)).toMatch(/Phần trăm/);
  });

  it('sàn ≥ 1; trần ≥ 20.000; cả hai ≤ 20.000.000 và nguyên', () => {
    expect(adjustmentValueError('MIN_FLOOR', 1)).toBeNull();
    expect(adjustmentValueError('MIN_FLOOR', 0)).toMatch(/lớn hơn 0/);
    expect(adjustmentValueError('MAX_CEILING', 20_000)).toBeNull();
    expect(adjustmentValueError('MAX_CEILING', 19_999)).toMatch(/20\.000/);
    expect(adjustmentValueError('MAX_CEILING', 20_000_001)).toMatch(/tối đa|đến/);
    expect(adjustmentValueError('MIN_FLOOR', 150000.5)).toMatch(/nguyên/);
    expect(adjustmentValueError('DELTA_AMOUNT', NaN)).toMatch(/số/);
  });

  it('priority nguyên trong [−1000, 1000]', () => {
    expect(priorityError(0)).toBeNull();
    expect(priorityError(1000)).toBeNull();
    expect(priorityError(-1000)).toBeNull();
    expect(priorityError(1001)).toMatch(/Độ ưu tiên/);
    expect(priorityError(1.5)).toMatch(/Độ ưu tiên/);
  });
});

describe('macro-bulk — từ vựng dịch vụ/xe', () => {
  it('ô chọn trong form hiểu cả dạng admin và dạng chuẩn backend', () => {
    expect(formServiceValue('RIDE')).toBe('CONVENIENT');
    expect(formServiceValue('convenient')).toBe('CONVENIENT');
    expect(formServiceValue('CARPOOL')).toBe('CARPOOL');
    expect(formServiceValue(undefined)).toBe('ALL');
    expect(formVehicleValue('CAR_4')).toBe('4SEATS');
    expect(formVehicleValue('CAR_7')).toBe('7SEATS');
    expect(formVehicleValue('4seats')).toBe('4SEATS');
    expect(formVehicleValue('')).toBe('ALL');
  });

  it('giá trị LẠ (vd DELIVERY) được GIỮ NGUYÊN khi mở form sửa, không bị nới thành ALL', () => {
    expect(formServiceValue('DELIVERY')).toBe('DELIVERY');
    expect(formServiceValue(' DELIVERY ')).toBe('DELIVERY');
    expect(formVehicleValue('CAR_16')).toBe('CAR_16');
    // chỉ trống/null mới về ALL
    expect(formServiceValue('')).toBe('ALL');
    expect(formServiceValue(null)).toBe('ALL');
    expect(formVehicleValue('   ')).toBe('ALL');
    // và biết giá trị nào có sẵn trong ô chọn
    expect(FORM_SERVICE_VALUES).toEqual(['ALL', 'CARPOOL', 'CONVENIENT']);
    expect(FORM_VEHICLE_VALUES).toEqual(['ALL', '4SEATS', '7SEATS']);
  });

  it('nhãn hiển thị: tiếng Việt cho giá trị đã biết, nguyên văn cho giá trị lạ', () => {
    expect(serviceLabel('RIDE')).toBe('Bao xe');
    expect(serviceLabel('CONVENIENT')).toBe('Bao xe');
    expect(serviceLabel('CARPOOL')).toBe('Ghép xe');
    expect(serviceLabel('ALL')).toBe('Mọi dịch vụ');
    expect(serviceLabel('DELIVERY')).toBe('DELIVERY');
    expect(vehicleLabel('CAR_4')).toBe('Xe 4 chỗ');
    expect(vehicleLabel('7SEATS')).toBe('Xe 7 chỗ');
    expect(vehicleLabel(null)).toBe('Mọi loại xe');
  });
});

describe('macro-bulk — mô tả tổ hợp bị bỏ qua', () => {
  const labelFor = (s: { provinceCode?: string | null; wardCode?: string | null }) =>
    s.wardCode === '00160' ? 'Nghĩa Đô' : s.provinceCode === '33' ? 'Hưng Yên' : s.provinceCode === '01' ? 'Hà Nội' : 'Mọi nơi';

  it('trùng khoá với luật có sẵn: nêu id, tên, trạng thái, hai chiều', () => {
    const text = describeSkipped(
      {
        origin: { provinceCode: '01', wardCode: '00160' },
        dest: { provinceCode: '33' },
        reason: 'TRUNG_KHOA',
        message: 'x',
        blockedBy: { id: 11, name: 'Có sẵn', isActive: false, isBidirectional: true, adjustmentType: 'DELTA_AMOUNT', adjustmentValue: 70000 },
      },
      labelFor,
    );
    expect(text).toBe('Nghĩa Đô → Hưng Yên: đã có quy tắc #11 "Có sẵn" (đang tắt, hai chiều)');
  });

  it('lặp trong chính yêu cầu', () => {
    const text = describeSkipped(
      { origin: { provinceCode: '33' }, dest: { provinceCode: '01' }, reason: 'TRUNG_TRONG_YEU_CAU', message: 'm', blockedBy: { id: null, name: 'n', isActive: true, isBidirectional: true, adjustmentType: 'DELTA_AMOUNT', adjustmentValue: 1 } },
      labelFor,
    );
    expect(text).toBe('Hưng Yên → Hà Nội: lặp lại một tổ hợp khác trong cùng yêu cầu');
  });
});

describe('macro-bulk — phát hiện backend cũ bỏ qua hai chiều', () => {
  it('yêu cầu hai chiều mà backend không xác nhận → true; xác nhận hoặc không yêu cầu → false', () => {
    expect(bidirectionalNotHonored(true, { isBidirectional: undefined })).toBe(true);
    expect(bidirectionalNotHonored(true, { isBidirectional: false })).toBe(true);
    expect(bidirectionalNotHonored(true, null)).toBe(true);
    expect(bidirectionalNotHonored(true, { isBidirectional: true })).toBe(false);
    expect(bidirectionalNotHonored(false, {})).toBe(false);
  });
});

describe('macro-bulk — bên trống = "mọi nơi"', () => {
  it('anySide chỉ báo khi MỘT bên trống và bên kia có điểm', () => {
    expect(anySide(0, 3)).toBe('origin');
    expect(anySide(2, 0)).toBe('dest');
    expect(anySide(2, 3)).toBeNull();
    expect(anySide(0, 0)).toBeNull(); // cả hai trống bị chặn riêng bởi checkBulkSelection
  });

  it('summarizeEndpoints: trống = MỌI NƠI; rút gọn khi dài', () => {
    expect(summarizeEndpoints([])).toBe('MỌI NƠI (toàn quốc)');
    expect(summarizeEndpoints([HN])).toBe('Hà Nội');
    const four: MacroEndpoint[] = [HN, NGHIA_DO, HY, { provinceCode: '31', label: 'Hải Phòng' }];
    expect(summarizeEndpoints(four)).toBe('Hà Nội, Nghĩa Đô, Hưng Yên và 1 điểm khác');
    expect(summarizeEndpoints(four, 4)).toBe('Hà Nội, Nghĩa Đô, Hưng Yên, Hải Phòng');
  });
});

describe('macro-bulk — lựa chọn đang chờ bấm "Thêm"', () => {
  const base = { provinceCode: '33', provinceName: 'Hưng Yên', wardCount: 0, items: [] as MacroEndpoint[], staged: true };

  it('chưa chọn tỉnh → không có gì chờ', () => {
    expect(pendingStagedSelection({ ...base, provinceCode: '' })).toBeNull();
  });

  it('đã chọn phường mà chưa Thêm → chờ, nêu số phường', () => {
    const msg = pendingStagedSelection({ ...base, wardCount: 2 });
    expect(msg).toMatch(/đã chọn 2 phường\/xã của Hưng Yên/);
    expect(msg).toMatch(/Thêm 2 phường\/xã/);
  });

  it('đã chọn tỉnh, danh sách chưa có điểm nào của tỉnh đó → chờ', () => {
    expect(pendingStagedSelection({ ...base, items: [NGHIA_DO] })).toMatch(/chưa bấm «Thêm cả tỉnh»/);
  });

  it('ô tỉnh còn giữ tỉnh cũ nhưng admin KHÔNG vừa chọn nó (đã bỏ chip/xoá danh sách) → không phải đang chờ', () => {
    expect(pendingStagedSelection({ ...base, staged: false })).toBeNull();
    expect(pendingStagedSelection({ ...base, staged: false, items: [NGHIA_DO] })).toBeNull();
    // nhưng phường đang tích thì vẫn chờ bất kể cờ
    expect(pendingStagedSelection({ ...base, staged: false, wardCount: 1 })).toMatch(/đã chọn 1 phường\/xã/);
  });

  it('đã Thêm (cả tỉnh hoặc một phường) rồi thì ô tỉnh còn giữ cũng KHÔNG tính là chờ', () => {
    expect(pendingStagedSelection({ ...base, items: [HY] })).toBeNull();
    expect(
      pendingStagedSelection({
        ...base,
        provinceCode: '01',
        provinceName: 'Hà Nội',
        items: [NGHIA_DO],
      }),
    ).toBeNull();
  });

  it('phường đang chọn dở thì vẫn là chờ dù tỉnh đó đã có điểm trong danh sách', () => {
    expect(
      pendingStagedSelection({ ...base, provinceCode: '01', provinceName: 'Hà Nội', wardCount: 1, items: [NGHIA_DO] }),
    ).toMatch(/đã chọn 1 phường\/xã của Hà Nội/);
  });
});

describe('macro-bulk — hiển thị mức điều chỉnh và ô nhập số', () => {
  it('formatMacroAdjustment', () => {
    expect(formatMacroAdjustment('DELTA_AMOUNT', 30000, true)).toBe('+30.000 đ/ghế');
    expect(formatMacroAdjustment('DELTA_AMOUNT', -20000, false)).toBe('-20.000 đ');
    expect(formatMacroAdjustment('PERCENTAGE', 7.5, true)).toBe('+7.5%');
    expect(formatMacroAdjustment('MIN_FLOOR', 150000, true)).toBe('Sàn: 150.000 đ');
    expect(formatMacroAdjustment('MAX_CEILING', 900000, false)).toBe('Trần: 900.000 đ');
  });

  it('phần trăm cho số lẻ (step 0.01); các loại tiền chỉ nhận số nguyên (step 1)', () => {
    expect(adjustmentValueRange('PERCENTAGE')).toMatchObject({ min: -80, max: 200, step: 0.01 });
    expect(adjustmentValueRange('DELTA_AMOUNT').step).toBe(1);
    expect(adjustmentValueRange('MIN_FLOOR').step).toBe(1);
    expect(adjustmentValueRange('MAX_CEILING').step).toBe(1);
    // và kiểm tra JS khớp: 2.5% hợp lệ
    expect(adjustmentValueError('PERCENTAGE', 2.5)).toBeNull();
  });
});

describe('macro-bulk — loại điều chỉnh đã ngừng áp dụng', () => {
  it('chỉ MIN_FLOOR / MAX_CEILING là "cũ"; cộng/trừ tiền và % thì không', () => {
    expect(isLegacyAdjustmentType('MIN_FLOOR')).toBe(true);
    expect(isLegacyAdjustmentType('MAX_CEILING')).toBe(true);
    expect(isLegacyAdjustmentType('DELTA_AMOUNT')).toBe(false);
    expect(isLegacyAdjustmentType('PERCENTAGE')).toBe(false);
  });
});

describe('macro-bulk — tóm tắt cảnh báo của backend', () => {
  const w = (m: string, i = 1) => ({ code: 'XUNG_DOT_CUNG_CAP', message: m, ruleId: i });

  it('không có / không phải mảng → 0 cảnh báo', () => {
    expect(summarizeWarnings(undefined)).toEqual({ count: 0, lines: [], more: 0 });
    expect(summarizeWarnings(null)).toEqual({ count: 0, lines: [], more: 0 });
    expect(summarizeWarnings([])).toEqual({ count: 0, lines: [], more: 0 });
  });

  it('cắt ở `max` dòng và ghi số còn lại', () => {
    const r = summarizeWarnings([w('a'), w('b'), w('c'), w('d'), w('e')], 3);
    expect(r).toEqual({ count: 5, lines: ['a', 'b', 'c'], more: 2 });
  });

  it('bỏ phần tử rác (thiếu message) thay vì làm vỡ giao diện', () => {
    const r = summarizeWarnings([w('a'), { code: 'X', ruleId: null } as never, null as never]);
    expect(r).toEqual({ count: 1, lines: ['a'], more: 0 });
  });
});
