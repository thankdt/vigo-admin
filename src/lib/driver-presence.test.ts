import { describe, expect, it } from 'vitest';
import {
  DRIVER_ONLINE_LABEL,
  driverOnlineState,
  STALE_AFTER_MINUTES,
  type DriverPresence,
} from './driver-presence';

const presence = (over: Partial<DriverPresence> = {}): DriverPresence => ({
  hasSocket: false,
  hasAlive: false,
  hasModernFlag: true,
  quality: 'low',
  silentMinutes: null,
  ...over,
});

describe('driverOnlineState', () => {
  it('có socket hoặc heartbeat → online', () => {
    expect(driverOnlineState('ONLINE', presence({ hasSocket: true }))).toBe('online');
    expect(driverOnlineState('ONLINE', presence({ hasAlive: true }))).toBe('online');
  });

  // iOS thu app xuống nền là rụng socket + heartbeat trong ~3 phút, nhưng tài vẫn
  // nhận chuyến qua push. Gắn "Mất kết nối" cho cửa sổ đó là vu oan hàng loạt.
  it('im lặng ngắn → chờ tín hiệu, KHÔNG phải mất kết nối', () => {
    expect(driverOnlineState('ONLINE', presence({ silentMinutes: 0 }))).toBe('idle');
    expect(driverOnlineState('ONLINE', presence({ silentMinutes: STALE_AFTER_MINUTES - 1 }))).toBe('idle');
  });

  // Đây là bug người dùng báo: tài test bấm ONLINE từ tháng 5 rồi bỏ app, danh
  // sách vẫn hiện "Online".
  it('im lặng dài → mất kết nối', () => {
    expect(driverOnlineState('ONLINE', presence({ silentMinutes: STALE_AFTER_MINUTES }))).toBe('stale');
    expect(driverOnlineState('ONLINE', presence({ silentMinutes: 60 * 24 * 30 }))).toBe('stale');
  });

  it('chưa ghi nhận tín hiệu nào → không rõ (không kết luận bừa)', () => {
    expect(driverOnlineState('ONLINE', presence({ silentMinutes: null }))).toBe('unknown');
  });

  // Redis chớp → BE bỏ field. Nếu quy thành "mất kết nối" thì cả danh sách báo sai.
  it('thiếu presence (BE cũ / Redis lỗi) → giữ hành vi cũ, tin status', () => {
    expect(driverOnlineState('ONLINE', undefined)).toBe('online');
    expect(driverOnlineState('ONLINE', null)).toBe('online');
  });

  it('BUSY luôn là bận, không phụ thuộc presence', () => {
    expect(driverOnlineState('BUSY', presence({ silentMinutes: 9999 }))).toBe('busy');
    expect(driverOnlineState('BUSY', undefined)).toBe('busy');
  });

  it('OFFLINE / thiếu / lạ → offline', () => {
    expect(driverOnlineState('OFFLINE', presence({ hasSocket: true }))).toBe('offline');
    expect(driverOnlineState(undefined, undefined)).toBe('offline');
    expect(driverOnlineState('SOMETHING_ELSE', undefined)).toBe('offline');
  });

  it('mọi state đều có nhãn tiếng Việt', () => {
    for (const label of Object.values(DRIVER_ONLINE_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
