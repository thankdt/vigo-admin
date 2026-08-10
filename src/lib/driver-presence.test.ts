import { describe, expect, it } from 'vitest';
import {
  DRIVER_ONLINE_LABEL,
  driverOnlineState,
  type DriverPresence,
} from './driver-presence';

const presence = (over: Partial<DriverPresence> = {}): DriverPresence => ({
  hasSocket: false,
  hasAlive: false,
  hasModernFlag: true,
  quality: 'low',
  ...over,
});

describe('driverOnlineState', () => {
  it('khai ONLINE + có tín hiệu → online', () => {
    expect(driverOnlineState('ONLINE', presence({ quality: 'high' }))).toBe('online');
    expect(driverOnlineState('ONLINE', presence({ quality: 'medium' }))).toBe('online');
  });

  // Đây chính là bug người dùng báo: tài test bấm ONLINE từ tháng 5 rồi bỏ app,
  // danh sách vẫn hiện "Online".
  it('khai ONLINE nhưng app im lặng → mất kết nối', () => {
    expect(driverOnlineState('ONLINE', presence({ quality: 'low' }))).toBe('stale');
  });

  it('app cũ → legacy, KHÔNG vu là mất kết nối', () => {
    expect(driverOnlineState('ONLINE', presence({ quality: 'legacy' }))).toBe('legacy');
  });

  // Redis chớp → BE bỏ field. Nếu quy thành "mất kết nối" thì cả danh sách báo sai.
  it('thiếu presence (BE cũ / Redis lỗi) → giữ hành vi cũ, tin status', () => {
    expect(driverOnlineState('ONLINE', undefined)).toBe('online');
    expect(driverOnlineState('ONLINE', null)).toBe('online');
  });

  it('BUSY luôn là bận, không phụ thuộc presence', () => {
    expect(driverOnlineState('BUSY', presence({ quality: 'low' }))).toBe('busy');
    expect(driverOnlineState('BUSY', undefined)).toBe('busy');
  });

  it('OFFLINE / thiếu / lạ → offline', () => {
    expect(driverOnlineState('OFFLINE', presence({ quality: 'high' }))).toBe('offline');
    expect(driverOnlineState(undefined, undefined)).toBe('offline');
    expect(driverOnlineState('SOMETHING_ELSE', undefined)).toBe('offline');
  });

  it('mọi state đều có nhãn tiếng Việt', () => {
    for (const label of Object.values(DRIVER_ONLINE_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
