import { describe, it, expect } from 'vitest';
import {
  COLLECTING_LABEL,
  NO_RATING_LABEL,
  formatOpsRate,
  formatDisplayStars,
  formatScore,
  distributionTotal,
  distributionPercent,
  distributionCount,
} from './driver-reputation-format';

describe('formatOpsRate — LUẬT 1: null KHÔNG PHẢI 0', () => {
  it.each([
    [0.87, '87%'],
    [0, '0%'],
    [1, '100%'],
    [0.5, '50%'],
    [0.874, '87%'],
    [0.876, '88%'],
    [0.005, '1%'],
  ])('%s → %s', (v, out) => {
    expect(formatOpsRate(v, 'accept')).toBe(out);
  });

  it('null → Đang thu thập (KHÔNG phải 0%)', () => {
    expect(formatOpsRate(null, 'accept')).toBe(COLLECTING_LABEL);
    expect(formatOpsRate(null, 'accept')).not.toContain('0%');
  });

  it('undefined → Đang thu thập', () => {
    expect(formatOpsRate(undefined, 'onTime')).toBe(COLLECTING_LABEL);
  });

  it('NaN → Đang thu thập', () => {
    expect(formatOpsRate(Number.NaN, 'completion')).toBe(COLLECTING_LABEL);
  });

  it('tên chỉ số nằm trong collecting → Đang thu thập, kể cả khi có số', () => {
    expect(formatOpsRate(0.42, 'accept', ['accept'])).toBe(COLLECTING_LABEL);
    expect(formatOpsRate(0.42, 'onTime', ['accept'])).toBe('42%');
  });

  it('0 THẬT (có dữ liệu, không nằm trong collecting) vẫn hiện 0%', () => {
    expect(formatOpsRate(0, 'completion', ['accept', 'onTime'])).toBe('0%');
  });

  it('kẹp số lệch về 0..100%', () => {
    expect(formatOpsRate(-0.3, 'accept')).toBe('0%');
    expect(formatOpsRate(1.4, 'accept')).toBe('100%');
  });
});

describe('formatDisplayStars — LUẬT 2: chưa đủ đánh giá KHÔNG phải 0 sao', () => {
  it('null → Chưa có đánh giá (KHÔNG phải "0.0")', () => {
    expect(formatDisplayStars(null)).toBe(NO_RATING_LABEL);
    expect(formatDisplayStars(null)).not.toBe('0.0');
  });

  it('undefined → Chưa có đánh giá', () => {
    expect(formatDisplayStars(undefined)).toBe(NO_RATING_LABEL);
  });

  it("'star' trong collecting → Chưa có đánh giá", () => {
    expect(formatDisplayStars(4.6, ['star'])).toBe(NO_RATING_LABEL);
  });

  it.each([
    [4.36, '4.4'],
    [4.34, '4.3'],
    [5, '5.0'],
    [4, '4.0'],
    [1, '1.0'],
    [3.14, '3.1'],
  ])('%s → %s', (v, out) => {
    expect(formatDisplayStars(v)).toBe(out);
  });

  it('0 (khách chỉ chấm 1..5 nên 0 chắc chắn là placeholder) → Chưa có đánh giá', () => {
    expect(formatDisplayStars(0)).toBe(NO_RATING_LABEL);
    expect(formatDisplayStars(-1)).toBe(NO_RATING_LABEL);
  });

  // toFixed làm tròn theo biểu diễn nhị phân: 4.35 lưu thành 4.34999… nên ra "4.3".
  // Ghi lại cho khỏi ai "sửa nhầm" — sai số 0.05 sao không ảnh hưởng gì khi hiển thị.
  it('nửa đơn vị đi theo float64 (4.35 → "4.3"), chấp nhận được khi chỉ để hiện', () => {
    expect(formatDisplayStars(4.35)).toBe('4.3');
  });
});

describe('formatScore', () => {
  it.each([
    [0, '0'],
    [72, '72'],
    [72.6, '73'],
    [100, '100'],
    [120, '100'],
    [-5, '0'],
  ])('%s → %s', (v, out) => {
    expect(formatScore(v)).toBe(out);
  });

  it('thiếu số → — (không hiện 0)', () => {
    expect(formatScore(null)).toBe('—');
    expect(formatScore(undefined)).toBe('—');
    expect(formatScore(Number.NaN)).toBe('—');
  });
});

describe('phân bố sao', () => {
  const dist = { '1': 1, '2': 0, '3': 2, '4': 3, '5': 4 };

  it('tổng đúng', () => {
    expect(distributionTotal(dist)).toBe(10);
    expect(distributionTotal(null)).toBe(0);
    expect(distributionTotal({})).toBe(0);
  });

  it('phần trăm đúng', () => {
    expect(distributionPercent(dist, 5)).toBe(40);
    expect(distributionPercent(dist, 4)).toBe(30);
    expect(distributionPercent(dist, 2)).toBe(0);
  });

  it('tổng = 0 → 0, KHÔNG chia cho 0 (NaN)', () => {
    expect(distributionPercent({}, 5)).toBe(0);
    expect(distributionPercent(null, 5)).toBe(0);
    expect(Number.isNaN(distributionPercent({}, 5))).toBe(false);
  });

  it('đếm an toàn khi thiếu khoá', () => {
    expect(distributionCount(dist, 5)).toBe(4);
    expect(distributionCount(dist, 2)).toBe(0);
    expect(distributionCount({}, 3)).toBe(0);
    expect(distributionCount(null, 3)).toBe(0);
  });
});
