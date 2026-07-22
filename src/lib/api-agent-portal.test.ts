import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAgentMe, listAgentBookings, API_BASE_URL } from './api';

// Agent-portal (đặt hộ) client: /agent/me must surface the commission-wallet balance + type, and
// /agent/bookings must surface the "dự kiến" commission estimate — both additive fields.
describe('agent-portal API client', () => {
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

  it('getAgentMe surfaces walletBalance + walletType', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          status: 'ACTIVE',
          displayName: 'Đại lý A',
          commissionPercent: 12,
          bankInfo: null,
          walletBalance: 150000,
          walletType: 'USER_REFERRAL',
        },
      }),
    });

    const me = await getAgentMe();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/agent/me`);
    expect(me.walletBalance).toBe(150000);
    expect(me.walletType).toBe('USER_REFERRAL');
    expect(me.commissionPercent).toBe(12);
  });

  it('listAgentBookings surfaces agentCommissionEstimate (active) + agentCommissionAmount (completed)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'a', status: 'ACCEPTED', finalPrice: 242000, agentCommissionAmount: null, agentCommissionEstimate: 22000 },
          { id: 'b', status: 'COMPLETED', finalPrice: 242000, agentCommissionAmount: 21500, agentCommissionEstimate: null },
        ],
        meta: { page: 1, limit: 50, total: 2, totalPages: 1 },
      }),
    });

    const res = await listAgentBookings(1, 50);
    expect(fetchMock.mock.calls[0][0]).toContain(`${API_BASE_URL}/agent/bookings`);
    expect(res.data[0].agentCommissionEstimate).toBe(22000);
    expect(res.data[0].agentCommissionAmount).toBeNull();
    expect(res.data[1].agentCommissionAmount).toBe(21500);
    expect(res.data[1].agentCommissionEstimate).toBeNull();
  });
});
