import { describe, expect, it } from 'vitest';
import { matchWardNames, normalizeWardName, splitPasteInput, wardsToEndpoints } from './ward-match';

const wards = [
  { code: '13285', name: 'Phường Phủ Lý', provinceCode: '35' },
  { code: '13291', name: 'Xã Bình Lục', provinceCode: '35' },
  { code: '13300', name: 'Phường Thanh Châu', provinceCode: '35' },
  { code: '13301', name: 'Xã Thanh Châu', provinceCode: '35' },
  { code: '13310', name: 'Thị trấn Đồng Văn', provinceCode: '35' },
];

describe('normalizeWardName', () => {
  it('bỏ dấu, hoa thường, tiền tố hành chính, khoảng trắng', () => {
    expect(normalizeWardName('  PHƯỜNG   Phủ  Lý ')).toBe('phu ly');
    expect(normalizeWardName('Đặc khu Cồn Cỏ')).toBe('con co');
    expect(normalizeWardName('Đồng Văn')).toBe('dong van');
  });

  it('dạng NFD (gõ từ macOS) giống dạng NFC', () => {
    expect(normalizeWardName('Phủ Lý'.normalize('NFD'))).toBe(normalizeWardName('Phủ Lý'.normalize('NFC')));
  });
});

describe('splitPasteInput', () => {
  it('tách theo xuống dòng, phẩy, chấm phẩy, tab; bỏ rỗng và trùng', () => {
    expect(splitPasteInput('A, B;C\nD\t E\n\n A ')).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('matchWardNames', () => {
  it('tự khớp theo tên, không phân biệt dấu/tiền tố', () => {
    const r = matchWardNames(['phu ly', 'Xã Bình Lục'], wards);
    expect(r.matched.map((m) => m.ward.code)).toEqual(['13285', '13291']);
    expect(r.ambiguous).toEqual([]);
    expect(r.unmatched).toEqual([]);
  });

  it('khớp theo mã 5 số', () => {
    expect(matchWardNames(['13291'], wards).matched[0].ward.code).toBe('13291');
  });

  it('hai xã trùng tên chuẩn hoá ⇒ cần chọn; gõ cả tiền tố thì tự khớp đúng xã', () => {
    const r = matchWardNames(['Thanh Châu', 'Phường Thanh Châu'], wards);
    expect(r.ambiguous).toHaveLength(1);
    expect(r.ambiguous[0].candidates.map((c) => c.code).sort()).toEqual(['13300', '13301']);
    expect(r.matched.map((m) => m.ward.code)).toEqual(['13300']);
  });

  it('không khớp ⇒ gợi ý tối đa 3 tên gần nhất, không tự áp', () => {
    const r = matchWardNames(['Phu Li'], wards);
    expect(r.matched).toEqual([]);
    expect(r.unmatched[0].input).toBe('Phu Li');
    expect(r.unmatched[0].suggestions.length).toBeLessThanOrEqual(3);
    expect(r.unmatched[0].suggestions[0].code).toBe('13285');
  });

  it('dòng không giống gì ⇒ không gợi ý bừa', () => {
    expect(matchWardNames(['zzzzzzzzzz'], wards).unmatched[0].suggestions).toEqual([]);
  });

  it('một xã được nhắc hai lần chỉ tính một', () => {
    expect(matchWardNames(['Phu Ly', '13285'], wards).matched).toHaveLength(1);
  });
});

describe('wardsToEndpoints', () => {
  it('đổi xã sang điểm đón/trả có nhãn "Tên (Tỉnh)", bỏ mã lạ', () => {
    const e = wardsToEndpoints(['13285', 'x'], wards, new Map([['35', 'Ninh Bình']]));
    expect(e).toEqual([{ provinceCode: '35', wardCode: '13285', label: 'Phường Phủ Lý (Ninh Bình)' }]);
  });
});
