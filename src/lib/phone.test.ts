import { describe, it, expect } from 'vitest';
import { normalizeVnPhone, isValidVnPhoneOrEmpty, sameVnPhone } from './phone';

describe('normalizeVnPhone', () => {
  it.each([
    ['', ''],
    [null, ''],
    [undefined, ''],
    ['0912345678', '0912345678'],
    ['+84912345678', '0912345678'],
    ['84912345678', '0912345678'],
    ['0912 345 678', '0912345678'],
    ['091.234.5678', '0912345678'],
    ['091-234-5678', '0912345678'],
    ['(091) 234 5678', '0912345678'],
    ['+84 912 345 678', '0912345678'],
  ])('%s → %s', (raw, out) => {
    expect(normalizeVnPhone(raw as any)).toBe(out);
  });

  it('không đụng chuỗi không phải SĐT VN (để validate bắt)', () => {
    expect(normalizeVnPhone('1912345678')).toBe('1912345678');
    expect(normalizeVnPhone('0912345678a')).toBe('0912345678a');
  });

  // Khớp backend (src/common/utils/phone.util.ts): '84…' chỉ quy đổi khi dài
  // đúng 11. Cắt vô điều kiện sẽ biến số nội địa gõ thiếu số 0 thành số KHÁC.
  it("'84…' không đủ 11 ký tự thì giữ nguyên, không cắt", () => {
    expect(normalizeVnPhone('846123456')).toBe('846123456');
    expect(normalizeVnPhone('8461234567')).toBe('8461234567');
    // đủ 11 → mới quy đổi
    expect(normalizeVnPhone('84612345678')).toBe('0612345678');
  });
});

describe('isValidVnPhoneOrEmpty', () => {
  it.each([
    [''],
    ['   '],
    [null],
    [undefined],
    ['0912345678'],
    ['+84912345678'],
    ['84912345678'],
    ['0912 345 678'],
    ['091.234.5678'],
  ])('nhận %s', (raw) => {
    expect(isValidVnPhoneOrEmpty(raw as any)).toBe(true);
  });

  it.each([
    ['123'],
    ['0912345678a'],
    // không bắt đầu bằng 0 sau chuẩn hoá
    ['1912345678'],
    // 11 chữ số
    ['09123456789'],
    // 9 chữ số
    ['091234567'],
    ['+84 912 345 6789'],
  ])('từ chối %s', (raw) => {
    expect(isValidVnPhoneOrEmpty(raw)).toBe(false);
  });
});

describe('sameVnPhone', () => {
  it('so sau chuẩn hoá — khác cách gõ vẫn là một số', () => {
    expect(sameVnPhone('0912345678', '+84912345678')).toBe(true);
    expect(sameVnPhone('0912 345 678', '091.234.5678')).toBe(true);
    expect(sameVnPhone('84912345678', '0912345678')).toBe(true);
  });

  it('số khác nhau → false', () => {
    expect(sameVnPhone('0912345678', '0912345679')).toBe(false);
  });

  it('rỗng/thiếu → false (không cảnh báo trùng khi chưa nhập)', () => {
    expect(sameVnPhone('', '')).toBe(false);
    expect(sameVnPhone('0912345678', '')).toBe(false);
    expect(sameVnPhone('', '0912345678')).toBe(false);
    expect(sameVnPhone(null, undefined)).toBe(false);
  });
});
