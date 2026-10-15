import { describe, it, expect } from 'vitest';
import {
  HANOI_PROVINCE_LABEL,
  parseProvinceOptions,
  provinceLabel,
  provinceNameMap,
  provincePairLabel,
} from './province-labels';

describe('parseProvinceOptions', () => {
  it('lấy gisCode làm mã, KHÔNG lấy `code` cũ; "01" luôn là "Nội đô Hà Nội"', () => {
    const out = parseProvinceOptions([
      { id: 5, code: 'HP-OLD', gisCode: '31', name: 'Hải Phòng' },
      { id: 1, code: 'HN-OLD', gisCode: '01', name: 'Hà Nội' },
      { id: 9, code: 'QN-OLD', gisCode: '22', name: 'Quảng Ninh' },
    ]);
    expect(out).toEqual([
      { code: '31', name: 'Hải Phòng' },
      { code: '01', name: HANOI_PROVINCE_LABEL },
      { code: '22', name: 'Quảng Ninh' },
    ].sort((a, b) => a.name.localeCompare(b.name, 'vi')));
    expect(out.map((o) => o.code)).not.toContain('HP-OLD');
  });

  it('bỏ dòng thiếu gisCode (backend cũ) và dòng rác; không ném lỗi', () => {
    expect(parseProvinceOptions([{ id: 1, code: 'X', name: 'A' }, null, 7, { gisCode: '' }])).toEqual([]);
    expect(parseProvinceOptions(undefined)).toEqual([]);
    expect(parseProvinceOptions({ data: [] })).toEqual([]);
  });

  it('khử trùng theo mã; thiếu tên thì dùng chính mã', () => {
    expect(parseProvinceOptions([{ gisCode: '79', name: 'TP HCM' }, { gisCode: '79', name: 'TP HCM' }, { gisCode: '48' }])).toEqual([
      { code: '48', name: '48' },
      { code: '79', name: 'TP HCM' },
    ]);
  });
});

describe('provinceLabel / provincePairLabel', () => {
  const names = provinceNameMap([
    { code: '31', name: 'Hải Phòng' },
    { code: '22', name: 'Quảng Ninh' },
  ]);

  it('mã "01" luôn có nhãn dù danh sách tỉnh chưa tải', () => {
    expect(provinceLabel('01', {})).toBe('Nội đô Hà Nội');
  });

  it('mã lạ hiện "Mã tỉnh <mã>", trống/null → null', () => {
    expect(provinceLabel('99', names)).toBe('Mã tỉnh 99');
    expect(provinceLabel(null, names)).toBeNull();
    expect(provinceLabel('  ', names)).toBeNull();
    expect(provinceLabel(undefined, names)).toBeNull();
  });

  it('cặp tỉnh có THỨ TỰ: đón → trả', () => {
    expect(provincePairLabel('01', '31', names)).toBe('Nội đô Hà Nội → Hải Phòng');
    expect(provincePairLabel('31', '01', names)).toBe('Hải Phòng → Nội đô Hà Nội');
    expect(provincePairLabel('31', '31', names)).toBe('Hải Phòng → Hải Phòng');
  });

  it('thiếu một đầu → "—" ở đầu đó; thiếu cả hai → null (chuyến cũ chưa backfill)', () => {
    expect(provincePairLabel('31', null, names)).toBe('Hải Phòng → —');
    expect(provincePairLabel(undefined, '22', names)).toBe('— → Quảng Ninh');
    expect(provincePairLabel(null, null, names)).toBeNull();
    expect(provincePairLabel(undefined, undefined, names)).toBeNull();
  });
});
