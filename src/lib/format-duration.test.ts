import { describe, it, expect } from 'vitest';
import { formatDurationVi } from './format-duration';

describe('formatDurationVi', () => {
  it.each([
    [null, '—'],
    [-5, '0 giây'],
    [0, '0 giây'],
    [45, '45 giây'],
    [59, '59 giây'],
    [60, '1 phút'],
    [61, '1 phút 1 giây'],
    [180, '3 phút'],
    [183, '3 phút 3 giây'],
    [3599, '59 phút 59 giây'],
    [3600, '1 giờ'],
    [3661, '1 giờ 1 phút'],
    [86399, '23 giờ 59 phút'],
    [86400, '1 ngày'],
    [90000, '1 ngày 1 giờ'],
    [172800, '2 ngày'],
  ])('%s → %s', (sec, out) => {
    expect(formatDurationVi(sec as any)).toBe(out);
  });
});
