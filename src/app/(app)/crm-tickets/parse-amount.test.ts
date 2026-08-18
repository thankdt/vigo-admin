import { describe, it, expect } from 'vitest';
import { parseVndInput } from './parse-amount';

describe('parseVndInput', () => {
  /**
   * 🚨 Ca sinh ra cả hàm này: `Number("500.000")` = 500. Người duyệt đọc dòng "Trần:
   * 500.000đ/vụ" ngay trên màn rồi gõ y hệt — và khách đáng 500k nhận 500đ, im lặng.
   */
  it('định dạng VN có dấu chấm ngăn nghìn -> đúng số', () => {
    expect(parseVndInput('500.000')).toBe(500000);
    expect(parseVndInput('1.500.000')).toBe(1500000);
    expect(parseVndInput('3.000.000')).toBe(3000000);
  });

  it('dấu phẩy, khoảng trắng, chữ "đ" đều đọc đúng', () => {
    expect(parseVndInput('500,000')).toBe(500000);
    expect(parseVndInput('500 000')).toBe(500000);
    expect(parseVndInput('500.000đ')).toBe(500000);
    expect(parseVndInput(' 500000 ')).toBe(500000);
  });

  it('số trần trụi vẫn đúng', () => {
    expect(parseVndInput('200000')).toBe(200000);
  });

  it('rỗng / không có chữ số -> null (nút phải disabled)', () => {
    expect(parseVndInput('')).toBeNull();
    expect(parseVndInput('   ')).toBeNull();
    expect(parseVndInput('abc')).toBeNull();
    expect(parseVndInput('đ')).toBeNull();
  });

  it('số 0 và số âm -> null', () => {
    expect(parseVndInput('0')).toBeNull();
    // Dấu trừ bị loại như mọi ký tự khác -> '5' ; không có đường nào ra số âm.
    expect(parseVndInput('-5')).toBe(5);
  });

  // Ký pháp mũ không còn nghĩa sau khi lọc chữ số — '1e9' thành '19'.
  it('ký pháp mũ không lọt thành số thiên văn', () => {
    expect(parseVndInput('1e9')).toBe(19);
  });
});
