import { describe, it, expect, vi, afterEach } from 'vitest';
import { REJECT_HINT, REJECT_LABEL, shortId, vnToday } from './pooling-labels';

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

  it('shortId rút gọn nhưng vẫn đủ phân biệt', () => {
    expect(shortId('0a1b2c3d-dead-beef-0000-111122223333')).toBe('0a1b2c3d');
  });
});
