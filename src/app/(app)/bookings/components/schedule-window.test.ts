import { describe, expect, it } from 'vitest';
import { formatScheduleWindow } from './schedule-window';

describe('formatScheduleWindow', () => {
  it('khung giờ trong cùng ngày VN → hiện CẢ HAI mốc, ngày viết một lần', () => {
    expect(formatScheduleWindow('2026-08-17T01:00:00.000Z', '2026-08-17T02:30:00.000Z')).toBe(
      '08:00 → 09:30 — 17/08/2026',
    );
  });

  it('khung giờ vắt qua nửa đêm VN → mỗi mốc kèm ngày của nó', () => {
    // 16:30Z = 23:30 VN ngày 17, 17:30Z = 00:30 VN ngày 18.
    expect(formatScheduleWindow('2026-08-17T16:30:00.000Z', '2026-08-17T17:30:00.000Z')).toBe(
      '23:30 17/08/2026 → 00:30 18/08/2026',
    );
  });

  it('chuyến cũ chỉ có 1 mốc → giữ nguyên cách hiện cũ', () => {
    expect(formatScheduleWindow('2026-08-17T01:00:00.000Z', null)).toBe('08:00 — 17/08/2026');
    expect(formatScheduleWindow('2026-08-17T01:00:00.000Z')).toBe('08:00 — 17/08/2026');
  });

  it('mốc cuối bằng hoặc sớm hơn mốc đầu → không vẽ khoảng rỗng/âm', () => {
    expect(formatScheduleWindow('2026-08-17T01:00:00.000Z', '2026-08-17T01:00:00.000Z')).toBe(
      '08:00 — 17/08/2026',
    );
    expect(formatScheduleWindow('2026-08-17T01:00:00.000Z', '2026-08-17T00:00:00.000Z')).toBe(
      '08:00 — 17/08/2026',
    );
  });

  it('mốc cuối hỏng → vẫn hiện được mốc đầu', () => {
    expect(formatScheduleWindow('2026-08-17T01:00:00.000Z', 'không-phải-ngày')).toBe(
      '08:00 — 17/08/2026',
    );
  });

  it('không phải chuyến hẹn giờ (hoặc mốc đầu hỏng) → null', () => {
    expect(formatScheduleWindow(null)).toBeNull();
    expect(formatScheduleWindow(undefined, '2026-08-17T02:30:00.000Z')).toBeNull();
    expect(formatScheduleWindow('rác', '2026-08-17T02:30:00.000Z')).toBeNull();
  });
});
