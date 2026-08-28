import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatVnd, REJECT_HINT, REJECT_LABEL, shortAddress, shortId, vnTime, vnToday } from './pooling-labels';

describe('pooling-labels', () => {
  afterEach(() => vi.useRealTimers());

  it('mọi lý do loại đều có nhãn và giải thích — không để lộ mã máy ra UI', () => {
    for (const key of Object.keys(REJECT_LABEL)) {
      expect(REJECT_LABEL[key as keyof typeof REJECT_LABEL]).toBeTruthy();
      expect(REJECT_HINT[key as keyof typeof REJECT_HINT]).toBeTruthy();
    }
    expect(Object.keys(REJECT_LABEL)).toHaveLength(Object.keys(REJECT_HINT).length);
  });

  it('vnToday theo giờ VN, không theo giờ máy admin', () => {
    // 23:30 UTC 27/08 = 06:30 VN 28/08 — máy ở UTC vẫn phải ra ngày 28.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T23:30:00Z'));
    expect(vnToday()).toBe('2026-08-28');

    // 16:59 UTC = 23:59 VN cùng ngày.
    vi.setSystemTime(new Date('2026-08-27T16:59:00Z'));
    expect(vnToday()).toBe('2026-08-27');
  });

  it('vnToday luôn 2 chữ số', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-04T20:00:00Z'));
    expect(vnToday()).toBe('2026-01-05');
  });

  it('formatVnd theo kiểu Việt, null thành gạch ngang chứ KHÔNG thành 0', () => {
    // Hiện 0đ cho một nhóm chưa biết giá là nói dối admin về doanh thu.
    expect(formatVnd(430000)).toBe('430.000đ');
    expect(formatVnd(null)).toBe('—');
    expect(formatVnd(undefined)).toBe('—');
    expect(formatVnd(0)).toBe('0đ');
  });

  it('shortAddress cắt địa chỉ dài, rỗng thành gạch ngang', () => {
    expect(shortAddress('Bến xe Mỹ Đình')).toBe('Bến xe Mỹ Đình');
    expect(shortAddress(null)).toBe('—');
    expect(shortAddress('   ')).toBe('—');
    const dai = 'Số 1 đường Phạm Hùng, phường Mỹ Đình 2, quận Nam Từ Liêm, Hà Nội';
    expect(shortAddress(dai).length).toBeLessThanOrEqual(42);
    expect(shortAddress(dai).endsWith('…')).toBe(true);
  });

  it('vnTime đổi sang giờ VN, không theo giờ máy admin', () => {
    expect(vnTime('2026-08-28T01:00:00.000Z')).toBe('08:00');
    // Qua nửa đêm VN: 17:30 UTC = 00:30 hôm sau.
    expect(vnTime('2026-08-27T17:30:00.000Z')).toBe('00:30');
    expect(vnTime('2026-08-27T16:59:00.000Z')).toBe('23:59');
  });

  it('vnTime với mốc hỏng/rỗng → gạch ngang, KHÔNG ném', () => {
    expect(vnTime(null)).toBe('—');
    expect(vnTime('')).toBe('—');
    expect(vnTime('không-phải-ngày')).toBe('—');
  });

  it('shortId rút gọn nhưng vẫn đủ phân biệt', () => {
    expect(shortId('0a1b2c3d-dead-beef-0000-111122223333')).toBe('0a1b2c3d');
  });
});
