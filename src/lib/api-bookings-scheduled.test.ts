import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBookings, API_BASE_URL } from './api';

// Verifies the trip-type filter for the admin "Chuyến thường / Đặt lịch" tabs: getBookings must
// send scheduled=true (đặt lịch) / scheduled=false (thường), and OMIT the param for the "Tất cả"
// tab so the backend applies no filter (backward-compatible with old admin clients).
describe('getBookings — scheduled (trip-type) filter', () => {
  let fetchMock: any;

  beforeEach(() => {
    localStorage.setItem('access_token', 'tok');
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const calledUrl = () => fetchMock.mock.calls[0][0] as string;

  it('sends scheduled=true for the Đặt lịch tab', async () => {
    await getBookings({ scheduled: true });
    expect(calledUrl()).toContain(`${API_BASE_URL}/bookings/admin/list`);
    expect(calledUrl()).toContain('scheduled=true');
  });

  it('sends scheduled=false for the Chuyến thường tab', async () => {
    await getBookings({ scheduled: false });
    expect(calledUrl()).toContain('scheduled=false');
  });

  it('omits scheduled for the Tất cả tab (no filter)', async () => {
    await getBookings({});
    expect(calledUrl()).not.toContain('scheduled=');
  });

  it('passes scheduledTime through as a sort column', async () => {
    await getBookings({ sortBy: 'scheduledTime', order: 'ASC', scheduled: true });
    expect(calledUrl()).toContain('sortBy=scheduledTime');
    expect(calledUrl()).toContain('order=ASC');
  });
});
