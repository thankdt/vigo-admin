import { describe, it, expect } from 'vitest';
import { formatVND, formatVnDate, formatVnDateTime } from './format-vn';

/**
 * Mốc thời gian trên màn đối soát PHẢI là giờ VN và PHẢI có năm.
 *
 * Bản cũ (cục bộ trong referrals/page.tsx) không có năm — sổ hoa hồng trải nhiều tháng mà hiện
 * "12/03 09:15" thì không phân biệt được năm, đúng chỗ dễ soát nhầm nhất.
 */
describe('format-vn', () => {
  it('formatVnDateTime đổi UTC sang giờ VN (+07:00) và có NĂM', () => {
    // 2026-08-10T17:30Z = 00:30 ngày 11/08/2026 giờ VN — qua ngày, và qua cả năm ở ca dưới.
    const s = formatVnDateTime('2026-08-10T17:30:00.000Z');
    expect(s).toContain('11/08/2026');
    expect(s).toContain('00:30');
  });

  it('mốc sang năm mới theo giờ VN, không theo UTC', () => {
    // 2025-12-31T17:00Z = 00:00 ngày 01/01/2026 giờ VN.
    expect(formatVnDate('2025-12-31T17:00:00.000Z')).toBe('01/01/2026');
  });

  it('rỗng / không hợp lệ → gạch ngang, không "Invalid Date"', () => {
    expect(formatVnDateTime(null)).toBe('—');
    expect(formatVnDateTime(undefined)).toBe('—');
    expect(formatVnDateTime('rác')).toBe('—');
    expect(formatVnDate(null)).toBe('—');
  });

  it('formatVND: tiền là số nguyên đồng', () => {
    expect(formatVND(20000)).toMatch(/20\.000/);
    expect(formatVND(0)).toMatch(/0/);
    // Số âm (thu hồi vượt) phải hiện được, không nuốt dấu.
    expect(formatVND(-20000)).toMatch(/-|−/);
  });
});
