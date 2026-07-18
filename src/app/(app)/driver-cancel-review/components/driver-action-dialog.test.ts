import { describe, it, expect } from 'vitest';
import { suspendMinutes } from './driver-action-dialog';

describe('suspendMinutes', () => {
  it('quy đổi ngày → phút (đơn vị durationMinutes backend nhận)', () => {
    expect(suspendMinutes(1)).toBe(1440);
    expect(suspendMinutes(3)).toBe(4320);
  });
  it('0 ngày → 0 phút (không phải case hợp lệ ở UI nhưng hàm thuần không tự chặn)', () => {
    expect(suspendMinutes(0)).toBe(0);
  });
});
