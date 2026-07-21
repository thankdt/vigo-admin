import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adminListReferrers, adminTriggerLinkSync, API_BASE_URL } from './api';

// Verifies the ChottuLink referral-link admin client: the referrers list forwards the new
// clicks/installs sort + surfaces the enriched shape, and the sync trigger POSTs the right endpoint.
describe('referral-link admin API client', () => {
  let fetchMock: any;

  beforeEach(() => {
    localStorage.setItem('access_token', 'tok');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('adminListReferrers forwards sort=clicks and returns the enriched rows', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 'u1', phone: '09', fullName: 'A', referralCode: 'CODE',
            refereeCount: 3, tripCount: 5, totalReward: 100,
            shortUrl: 'https://aff.vigogroup.vn/x',
            clicks: { total: 42, last7: 5, last30: 20 },
            installs: { total: 7, last7: 1, last30: 3 },
            installsUnavailable: false,
            analyticsSyncedAt: '2026-07-21T03:00:00.000Z',
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrevious: false },
      }),
    });

    const res = await adminListReferrers({ sort: 'clicks', page: 1 });

    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain(`${API_BASE_URL}/referrals/admin/referrers`);
    expect(url).toContain('sort=clicks');
    expect(res.data[0].shortUrl).toBe('https://aff.vigogroup.vn/x');
    expect(res.data[0].clicks).toEqual({ total: 42, last7: 5, last30: 20 });
    expect(res.data[0].installs).toEqual({ total: 7, last7: 1, last30: 3 });
  });

  it('adminTriggerLinkSync POSTs /referrals/admin/link-sync and unwraps the result', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ranBy: 'manual', skipped: false, discovered: 2, synced: 5 } }),
    });

    const res = await adminTriggerLinkSync();

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/referrals/admin/link-sync`);
    expect(opts.method).toBe('POST');
    expect(res).toEqual({ ranBy: 'manual', skipped: false, discovered: 2, synced: 5 });
  });
});
