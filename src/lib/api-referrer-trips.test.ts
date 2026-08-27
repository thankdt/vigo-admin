import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { adminListReferrerTrips, API_BASE_URL } from './api';
import { ApiError } from './api-error';

// Sổ hoa hồng theo chuyến của một người giới thiệu — client gọi đúng route mới và đọc được
// khối `meta.totals` (backend đặt tổng trong meta vì TransformInterceptor chỉ giữ data/meta).
describe('adminListReferrerTrips', () => {
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

  const ok = (body: any) =>
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => body });

  const emptyBody = {
    data: [],
    meta: {
      page: 1, limit: 20, total: 0, totalPages: 1, hasNext: false, hasPrevious: false,
      totals: { trip: 0, agent: 0, kolOverride: 0, affiliate: 0, agentDriverWallet: 0 },
    },
  };

  it('gọi đúng route và chuyển tiếp bộ lọc', async () => {
    ok(emptyBody);
    await adminListReferrerTrips('u1', {
      page: 2, limit: 20, from: '2026-08-01', to: '2026-08-31', source: 'AGENT',
    });

    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain(`${API_BASE_URL}/referrals/admin/referrers/u1/trips`);
    expect(url).toContain('page=2');
    expect(url).toContain('from=2026-08-01');
    expect(url).toContain('to=2026-08-31');
    expect(url).toContain('source=AGENT');
  });

  it('nửa khoảng ngày thì KHÔNG gửi đi — BE trả 400 cho ca đó', async () => {
    ok(emptyBody);
    await adminListReferrerTrips('u1', { from: '2026-08-01' });

    const url = fetchMock.mock.calls[0][0];
    expect(url).not.toContain('from=');
    expect(url).not.toContain('to=');
  });

  it('đọc được dòng + tổng, giữ nguyên số đã net', async () => {
    ok({
      data: [
        {
          key: 'TRIP:b1', source: 'TRIP', orderId: 'b1', orderKind: 'BOOKING', bookingId: 'b1',
          amount: 0, grossAmount: 20000, clawedBack: true, walletType: 'USER_REFERRAL',
          creditedAt: '2026-08-10T03:00:00.000Z', clawedBackAt: '2026-08-20T03:00:00.000Z',
          yearMonthVn: null, base: null, percent: null,
          counterparty: { id: 'u2', fullName: 'Khách A', phone: '0900000001' },
          booking: {
            status: 'COMPLETED', price: 150000, createdAt: '2026-08-10T02:00:00.000Z',
            completedAt: null, scheduledFromTime: null, isTestTrip: false,
            pickupAddress: 'Số 1 Trần Phú', dropoffAddress: 'Nội Bài',
          },
        },
      ],
      meta: {
        page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrevious: false,
        totals: { trip: 0, agent: 15000, kolOverride: 2000, affiliate: 17000, agentDriverWallet: 7000 },
      },
    });

    const res = await adminListReferrerTrips('u1');

    expect(res.data[0].clawedBack).toBe(true);
    expect(res.data[0].grossAmount).toBe(20000);
    expect(res.data[0].amount).toBe(0);
    // Ví tài xế phải đứng RIÊNG, không được cộng vào affiliate.
    expect(res.meta.totals.affiliate).toBe(17000);
    expect(res.meta.totals.agentDriverWallet).toBe(7000);
  });

  it('BE cũ chưa có route ⇒ ApiError giữ nguyên httpStatus 404 để UI hiện banner riêng', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 404,
      json: async () => ({ success: false, error: { code: 'NOT_FOUND', message: 'Cannot GET' } }),
    });

    await expect(adminListReferrerTrips('u1')).rejects.toMatchObject({ httpStatus: 404 });
    await expect(adminListReferrerTrips('u1')).rejects.toBeInstanceOf(ApiError);
  });
});
