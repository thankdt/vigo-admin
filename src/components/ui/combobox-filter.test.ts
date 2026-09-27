import { describe, expect, it } from 'vitest';
import { foldVietnamese, vietnameseInsensitiveFilter } from './combobox-filter';

describe('foldVietnamese', () => {
  it('bỏ dấu, đổi đ/Đ thành d và hạ chữ thường', () => {
    expect(foldVietnamese('Hà Nội - Bắc Giang')).toBe('ha noi - bac giang');
    expect(foldVietnamese('Đà Nẵng')).toBe('da nang');
    expect(foldVietnamese('Quảng Ngãi')).toBe('quang ngai');
  });
});

describe('vietnameseInsensitiveFilter', () => {
  const value = 'Hà Nội - Bắc Giang__12';

  it('gõ không dấu vẫn khớp tên có dấu', () => {
    expect(vietnameseInsensitiveFilter(value, 'ha noi')).toBeGreaterThan(0);
    expect(vietnameseInsensitiveFilter('Đà Nẵng - Huế__3', 'da nang')).toBeGreaterThan(0);
  });

  it('gõ có dấu vẫn khớp', () => {
    expect(vietnameseInsensitiveFilter(value, 'Bắc Giang')).toBeGreaterThan(0);
  });

  it('không khớp thì trả 0', () => {
    expect(vietnameseInsensitiveFilter(value, 'sai gon')).toBe(0);
  });

  it('ô tìm rỗng thì giữ mọi mục', () => {
    expect(vietnameseInsensitiveFilter(value, '')).toBeGreaterThan(0);
  });
});
