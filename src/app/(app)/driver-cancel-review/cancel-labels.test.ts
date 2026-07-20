import { describe, it, expect } from 'vitest';
import { rateBadgeClass, driverStatus } from './cancel-labels';

describe('rateBadgeClass', () => {
  it('>50 đỏ, 30-50 vàng, <30 xám', () => {
    expect(rateBadgeClass(60)).toContain('red');
    expect(rateBadgeClass(40)).toContain('amber');
    expect(rateBadgeClass(10)).toContain('slate');
  });
  it('biên: 50 chưa đỏ (chỉ >50), 30 là vàng', () => {
    expect(rateBadgeClass(50)).toContain('amber'); // 50 thuộc 30–50
    expect(rateBadgeClass(30)).toContain('amber');
    expect(rateBadgeClass(29)).toContain('slate');
  });
  it('biên: 100% đỏ đậm, 99% vẫn đỏ nhạt', () => {
    expect(rateBadgeClass(100)).toContain('red-600');
    expect(rateBadgeClass(99)).toContain('red-100');
  });
});

describe('driverStatus', () => {
  it('banned → destructive', () => {
    expect(driverStatus({ isBanned: true, suspendedUntil: null }).variant).toBe('destructive');
  });
  it('suspended tương lai → secondary', () => {
    expect(driverStatus({ isBanned: false, suspendedUntil: new Date(Date.now()+3600_000).toISOString() }).variant).toBe('secondary');
  });
  it('suspend đã hết hạn → default (active)', () => {
    expect(driverStatus({ isBanned: false, suspendedUntil: new Date(Date.now()-3600_000).toISOString() }).variant).toBe('default');
  });
  it('không khoá → default', () => {
    expect(driverStatus({ isBanned: false, suspendedUntil: null }).variant).toBe('default');
  });
});
