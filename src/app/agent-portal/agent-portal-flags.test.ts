import { describe, expect, it } from 'vitest';
import { AGENT_MULTI_STOP_ENABLED, AGENT_PORTAL_HOME } from './agent-portal-flags';
import { ALL_NAV_ITEMS, visibleNavItems } from './agent-portal-nav';

/**
 * Chốt hành vi "tắt tạm màn Đặt hộ mới".
 *
 * Test này CỐ Ý bám vào giá trị hiện tại của cờ: khi bật lại tính năng, test đỏ
 * và người bật buộc phải đọc lại file này thay vì bật xong quên mất còn chỗ nào
 * chưa mở (nav / redirect / early-return trong page).
 */
describe('cờ cổng đại lý', () => {
  it('Đặt hộ mới đang TẮT', () => {
    expect(AGENT_MULTI_STOP_ENABLED).toBe(false);
  });

  it('nav không còn mục "Đặt hộ mới"', () => {
    const hrefs = visibleNavItems().map((i) => i.href);
    expect(hrefs).not.toContain('/agent-portal/orders/new');
  });

  it('mục bị tắt vẫn nằm trong danh sách đầy đủ (tắt tạm, không phải xoá)', () => {
    const item = ALL_NAV_ITEMS.find((i) => i.href === '/agent-portal/orders/new');
    expect(item).toBeDefined();
    expect(item!.enabled).toBe(false);
    expect(item!.label).toBe('Đặt hộ mới');
  });

  it('các mục còn lại vẫn hiện đủ', () => {
    const hrefs = visibleNavItems().map((i) => i.href);
    expect(hrefs).toEqual([
      '/agent-portal/dashboard',
      // "Đơn của tôi" đọc listAgentBookings (bảng booking) — KHÔNG liên quan
      // multi_stop_order nên không được tắt theo.
      '/agent-portal/orders',
      '/agent-portal/wallet',
    ]);
  });

  it('đích chuyển hướng là một mục đang bật', () => {
    expect(visibleNavItems().map((i) => i.href)).toContain(AGENT_PORTAL_HOME);
  });
});
