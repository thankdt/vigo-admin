import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBookings } from './api';
import { paramsForTab, QUEUE_TAB_ORDER } from '@/app/(app)/crm-queue/queue-tabs';

/**
 * 3 dòng serialize `claimedBy` / `excludeStatus` / `overdue` trong `getBookings` không có
 * test nào chạm: xoá hoặc gõ sai tên khoá thì `tsc` và `vitest` đều xanh, còn tab
 * "Việc của tôi" — nơi `claimedBy` là bộ lọc DUY NHẤT — sẽ trả TOÀN BỘ chuyến của hệ thống
 * thay vì việc của riêng mình. Đây là loại lỗi không ai nhìn ra bằng mắt.
 *
 * Dùng thẳng `paramsForTab` làm input để test luôn khớp với thứ trang thật gửi đi.
 */

const ADMIN_ID = '3f7c1e2a-1111-4222-8333-444455556666';

function lastUrl(): string {
  const call = vi.mocked(global.fetch).mock.calls.at(-1);
  return String(call?.[0]);
}

function q(name: string): string | null {
  return new URL(lastUrl(), 'https://x').searchParams.get(name);
}

beforeEach(() => {
  localStorage.setItem('access_token', 'tok');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ data: [], meta: {} }), { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('getBookings — 3 tham số hàng đợi CSKH', () => {
  it('claimedBy đi vào query string đúng tên', async () => {
    await getBookings({ claimedBy: ADMIN_ID });
    expect(q('claimedBy')).toBe(ADMIN_ID);
  });

  it('excludeStatus giữ nguyên chuỗi CSV', async () => {
    await getBookings({ excludeStatus: 'COMPLETED,CANCELLED' });
    expect(q('excludeStatus')).toBe('COMPLETED,CANCELLED');
  });

  // BE so sánh `overdue === 'true'` (chuỗi). Gửi boolean sẽ thành 'true' nhờ URLSearchParams,
  // nhưng gửi false PHẢI bỏ hẳn param — không thì BE nhận 'false' và... vẫn không bật, may mắn.
  // Khoá lại để không phụ thuộc may mắn.
  it('overdue=true thành chuỗi "true"; false/absent thì KHÔNG gửi param', async () => {
    await getBookings({ overdue: true });
    expect(q('overdue')).toBe('true');

    await getBookings({ overdue: false });
    expect(q('overdue')).toBeNull();

    await getBookings({});
    expect(q('overdue')).toBeNull();
  });

  it('client cũ không gửi gì thì query không có 3 khoá mới', async () => {
    await getBookings({ page: 1, limit: 20 });
    for (const key of ['claimedBy', 'excludeStatus', 'overdue']) {
      expect(q(key)).toBeNull();
    }
  });
});

describe('getBookings ← paramsForTab — 4 tab gửi đúng thứ backend hiểu', () => {
  it.each(QUEUE_TAB_ORDER)('tab %s', async (tab) => {
    await getBookings({ page: 1, limit: 20, ...paramsForTab(tab, ADMIN_ID) });
    const p = paramsForTab(tab, ADMIN_ID);

    // Mọi khoá mà paramsForTab sinh ra phải thực sự tới được query string. Thiếu một
    // khoá = tab lọc hụt và trả nhiều dữ liệu hơn nó nên trả.
    for (const [k, v] of Object.entries(p)) {
      expect(q(k), `tab ${tab} thiếu tham số ${k}`).toBe(v === true ? 'true' : String(v));
    }
  });

  it('chỉ tab "mine" gửi claimedBy — rò sang tab khác là CSKH mất việc của đồng nghiệp', async () => {
    for (const tab of QUEUE_TAB_ORDER) {
      await getBookings({ ...paramsForTab(tab, ADMIN_ID) });
      expect(q('claimedBy')).toBe(tab === 'mine' ? ADMIN_ID : null);
    }
  });
});
