import { describe, it, expect } from 'vitest';
import {
  driverWarning,
  formatShare,
  isFollowUpOverdue,
  routeNeedsDrivers,
  stageLabel,
  vnDay,
} from './driver-team-labels';

describe('stageLabel', () => {
  it('không có row = Tiềm năng, KHÔNG phải chuỗi rỗng', () => {
    expect(stageLabel(null)).toBe('Tiềm năng');
    expect(stageLabel(undefined)).toBe('Tiềm năng');
  });
  it('phân biệt họ-từ-chối với mình-loại', () => {
    expect(stageLabel('DECLINED')).toBe('Từ chối');
    expect(stageLabel('DROPPED')).toBe('Loại');
  });
  it('các bậc còn lại', () => {
    expect(stageLabel('CONTACTED')).toBe('Đã liên hệ');
    expect(stageLabel('INVITED')).toBe('Đã mời');
    expect(stageLabel('JOINED')).toBe('Trong team');
  });
});

describe('formatShare', () => {
  it('0..1 thành phần trăm 1 chữ số thập phân, dấu phẩy kiểu VN', () => {
    expect(formatShare(0.287)).toBe('28,7%');
  });
  it('0 và null đều ra "—", không ra "NaN%" hay "0,0%"', () => {
    expect(formatShare(0)).toBe('—');
    expect(formatShare(null)).toBe('—');
    expect(formatShare(undefined)).toBe('—');
  });
});

describe('driverWarning', () => {
  const base = {
    driverId: 'd', fullName: 'A', phone: '09', transportCompanyName: null,
    tripsOnRoute: 1, tripsAllRoutes: 1, shareOfRoute: 1,
    lastCompletedAt: null, firstCompletedAt: null,
    isApproved: true, isBanned: false, suspendedUntil: null, team: null,
  } as any;

  it('bị khoá cứng → cảnh báo ban (ưu tiên cao nhất)', () => {
    expect(driverWarning({ ...base, isBanned: true })).toBe('Đang bị khoá');
  });
  it('khoá tạm CÒN hạn mới cảnh báo', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(driverWarning({ ...base, suspendedUntil: future })).toBe('Đang tạm khoá');
  });
  it('khoá tạm ĐÃ hết hạn thì KHÔNG cảnh báo', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(driverWarning({ ...base, suspendedUntil: past })).toBeNull();
  });
  it('chưa duyệt hồ sơ → cảnh báo', () => {
    expect(driverWarning({ ...base, isApproved: false })).toBe('Chưa duyệt hồ sơ');
  });
  it('bình thường → null', () => {
    expect(driverWarning(base)).toBeNull();
  });
});

describe('routeNeedsDrivers', () => {
  const r = (o: any) => ({
    routeId: 1, routeName: 'x', driverCount: 0, completedTrips: 0, totalBookings: 0,
    lastCompletedAt: null, contactedCount: 0, joinedCount: 0, ...o,
  });

  it('có khách đặt mà 0 tài chạy xong → cần tuyển', () => {
    expect(routeNeedsDrivers(r({ totalBookings: 12, driverCount: 0 }))).toBe(true);
  });
  it('không ai đặt → KHÔNG phải vấn đề tuyển tài', () => {
    expect(routeNeedsDrivers(r({ totalBookings: 0, driverCount: 0 }))).toBe(false);
  });
  it('đã có tài chạy → không gắn cờ', () => {
    expect(routeNeedsDrivers(r({ totalBookings: 12, driverCount: 3 }))).toBe(false);
  });
});

describe('isFollowUpOverdue — mốc theo ngày VN', () => {
  // 2026-08-10T20:00Z === 03:00 ngày 11/8 giờ VN.
  const nowMs = Date.parse('2026-08-10T20:00:00.000Z');

  it('hẹn hôm nay (giờ VN) là ĐẾN HẠN', () => {
    expect(isFollowUpOverdue('2026-08-11T02:00:00.000Z', nowMs)).toBe(true);
  });
  it('hẹn ngày mai giờ VN thì chưa tới hạn', () => {
    expect(isFollowUpOverdue('2026-08-12T02:00:00.000Z', nowMs)).toBe(false);
  });
  it('không hẹn → không quá hạn', () => {
    expect(isFollowUpOverdue(null, nowMs)).toBe(false);
  });
});

describe('vnDay', () => {
  it('23:30 giờ VN ngày 1/8 hiển thị là 2026-08-01, không phải 31/7', () => {
    expect(vnDay('2026-08-01T16:30:00.000Z')).toBe('2026-08-01');
  });
  it('null → "—"', () => {
    expect(vnDay(null)).toBe('—');
  });
});
