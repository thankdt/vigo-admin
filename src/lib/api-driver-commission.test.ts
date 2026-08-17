import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('localStorage', {
    getItem: () => 'fake-token',
    setItem: () => {},
    removeItem: () => {},
  });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: [] }),
  });
});

afterEach(() => vi.unstubAllGlobals());

const urlOf = () => String(fetchMock.mock.calls[0][0]);

describe('getTeamMembers', () => {
  it('đọc đúng shape {members} — KHÔNG phải {data, meta}', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          members: [
            { driverId: 'd1', fullName: 'Tài A', phone: '0900000000', stage: 'JOINED', commissionRate: 0.1, ownerAdminUserId: null, ownerName: null, assignedRouteIds: [], assignedRouteNames: [], nextFollowUpAt: null, stageChangedAt: null, createdAt: '2026-08-01T00:00:00.000Z', completedTripsInRange: 3, lastCompletedAt: null },
          ],
        },
      }),
    });
    const { getTeamMembers } = await import('./api');

    const out = await getTeamMembers({ from: '2026-08-01', to: '2026-08-31' });

    expect(out.members).toHaveLength(1);
    expect(out.members[0].driverId).toBe('d1');
  });

  it('bỏ qua field rỗng, không gửi param rác', async () => {
    const { getTeamMembers } = await import('./api');
    await getTeamMembers({ from: '2026-08-01', to: '2026-08-31', q: '', stage: undefined, ownerId: undefined });
    const url = urlOf();
    expect(url).not.toContain('q=');
    expect(url).not.toContain('stage=');
    expect(url).not.toContain('ownerId=');
  });

  it('gửi stage/q/ownerId khi có', async () => {
    const { getTeamMembers } = await import('./api');
    await getTeamMembers({ from: '2026-08-01', to: '2026-08-31', stage: 'JOINED', q: 'A', ownerId: 'u1' });
    const url = new URL(urlOf());
    expect(url.searchParams.get('stage')).toBe('JOINED');
    expect(url.searchParams.get('q')).toBe('A');
    expect(url.searchParams.get('ownerId')).toBe('u1');
  });
});

describe('getTeamSubsidySummary', () => {
  it('đọc đúng shape {forgone, cashLoss}', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { forgone: 120000, cashLoss: 30000 } }),
    });
    const { getTeamSubsidySummary } = await import('./api');

    const out = await getTeamSubsidySummary({ from: '2026-08-01', to: '2026-08-31' });

    expect(out).toEqual({ forgone: 120000, cashLoss: 30000 });
  });

  it('gửi from/to đúng dạng VN YYYY-MM-DD', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { forgone: 0, cashLoss: 0 } }),
    });
    const { getTeamSubsidySummary } = await import('./api');
    await getTeamSubsidySummary({ from: '2026-08-01', to: '2026-08-31' });
    expect(urlOf()).toContain('from=2026-08-01');
    expect(urlOf()).toContain('to=2026-08-31');
  });
});

describe('updateTeamCommissionRate', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: {} }) });
  });

  it('gửi commissionRate = 0 chứ không bỏ qua (0 là giá trị hợp lệ)', async () => {
    const { updateTeamCommissionRate } = await import('./api');
    await updateTeamCommissionRate('d1', 0);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ commissionRate: 0 });
  });

  it('null = gỡ mức riêng, vẫn được gửi', async () => {
    const { updateTeamCommissionRate } = await import('./api');
    await updateTeamCommissionRate('d1', null);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ commissionRate: null });
  });

  it('gửi mức thường (vd 0.15) bình thường', async () => {
    const { updateTeamCommissionRate } = await import('./api');
    await updateTeamCommissionRate('d1', 0.15);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ commissionRate: 0.15 });
  });

  it('gọi đúng path PATCH /admin/driver-team/:driverId/commission-rate', async () => {
    const { updateTeamCommissionRate } = await import('./api');
    await updateTeamCommissionRate('d1', 0.1);
    expect(urlOf()).toContain('/admin/driver-team/d1/commission-rate');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
  });
});
