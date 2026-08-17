import { describe, it, expect } from 'vitest';
import { boolToConfigValue, isBooleanConfigValue, parseBooleanConfigValue } from './config-boolean';

describe('isBooleanConfigValue', () => {
  it('nhận đúng true/false', () => {
    expect(isBooleanConfigValue('true')).toBe(true);
    expect(isBooleanConfigValue('false')).toBe(true);
  });

  it('bỏ qua khoảng trắng và chữ hoa (dữ liệu cũ)', () => {
    expect(isBooleanConfigValue(' true ')).toBe(true);
    expect(isBooleanConfigValue('FALSE')).toBe(true);
    expect(isBooleanConfigValue('True')).toBe(true);
  });

  it('KHÔNG nhận các dạng gần giống — ô đó phải giữ ô gõ text', () => {
    for (const v of ['1', '0', 'yes', 'no', 'on', 'off', 'truee', 'ture', 'true false']) {
      expect(isBooleanConfigValue(v), v).toBe(false);
    }
  });

  it('rỗng / null / undefined không phải cờ', () => {
    expect(isBooleanConfigValue('')).toBe(false);
    expect(isBooleanConfigValue('   ')).toBe(false);
    expect(isBooleanConfigValue(null)).toBe(false);
    expect(isBooleanConfigValue(undefined)).toBe(false);
  });

  it('không nhận nhầm URL/số của config khác', () => {
    expect(isBooleanConfigValue('https://maps.vietmap.vn/style.json')).toBe(false);
    expect(isBooleanConfigValue('0.15')).toBe(false);
  });
});

describe('parseBooleanConfigValue', () => {
  it('chỉ true (mọi kiểu viết) mới là BẬT', () => {
    expect(parseBooleanConfigValue('true')).toBe(true);
    expect(parseBooleanConfigValue(' TRUE ')).toBe(true);
  });

  it('fail-closed: mọi thứ khác là TẮT', () => {
    expect(parseBooleanConfigValue('false')).toBe(false);
    expect(parseBooleanConfigValue('')).toBe(false);
    expect(parseBooleanConfigValue('1')).toBe(false);
    expect(parseBooleanConfigValue(null)).toBe(false);
  });
});

describe('boolToConfigValue', () => {
  it('luôn ghi chuỗi thường — backend đọc bằng === "true"', () => {
    expect(boolToConfigValue(true)).toBe('true');
    expect(boolToConfigValue(false)).toBe('false');
  });

  it('gạt đi gạt lại về đúng chuỗi gốc ⇒ row tự hết dirty', () => {
    const original = 'false';
    const afterOn = boolToConfigValue(!parseBooleanConfigValue(original));
    expect(afterOn).toBe('true');
    const afterOff = boolToConfigValue(!parseBooleanConfigValue(afterOn));
    expect(afterOff).toBe(original);
  });
});
