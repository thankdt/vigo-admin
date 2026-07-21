import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAcquisition, API_BASE_URL, type AcquisitionData } from './api';

// Verifies the acquisition ("Nguồn khách") admin client: it GETs /admin/acquisition with the VN
// date range and unwraps the interceptor's { data } envelope into the typed shape.
describe('acquisition admin API client', () => {
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

  it('getAcquisition forwards from/to and returns the unwrapped data', async () => {
    const payload: AcquisitionData = {
      range: { from: '2026-06-22', to: '2026-07-21', granularity: 'day' },
      firstParty: {
        totalSignups: 25,
        viaReferral: 9,
        direct: 16,
        granularity: 'day',
        byDay: [{ date: '2026-07-01', label: '01/07', signups: 3 }],
      },
      ga4: {
        available: true,
        byChannel: [{ channel: 'Organic Search', newUsers: 10, totalUsers: 12, signups: 4 }],
      },
      meta: { available: false },
      chottulink: {
        totalClicks: 120,
        totalInstalls: 30,
        linkCount: 8,
        referrerCount: 3,
        installsUnavailable: false,
      },
    };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: payload }) });

    const res = await getAcquisition('2026-06-22', '2026-07-21');

    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain(`${API_BASE_URL}/admin/acquisition`);
    expect(url).toContain('from=2026-06-22');
    expect(url).toContain('to=2026-07-21');
    expect(res.firstParty.totalSignups).toBe(25);
    expect(res.firstParty.direct).toBe(16);
    expect(res.ga4.available).toBe(true);
    expect(res.ga4.byChannel[0].channel).toBe('Organic Search');
    expect(res.meta.available).toBe(false);
    expect(res.chottulink.totalInstalls).toBe(30);
  });
});
