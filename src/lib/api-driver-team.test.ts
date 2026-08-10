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

describe('getTeamRouteDrivers', () => {
  it("routeId 'none' đi vào path, KHÔNG bị ép thành số", async () => {
    const { getTeamRouteDrivers } = await import('./api');
    await getTeamRouteDrivers('none', { from: '2026-08-01', to: '2026-08-31' });
    expect(urlOf()).toContain('/admin/driver-team/routes/none/drivers');
  });

  it('bỏ qua field rỗng, không gửi param rác', async () => {
    const { getTeamRouteDrivers } = await import('./api');
    await getTeamRouteDrivers(12, {
      from: '2026-08-01', to: '2026-08-31', q: '', stage: undefined,
    });
    const url = urlOf();
    expect(url).not.toContain('q=');
    expect(url).not.toContain('stage=');
  });

  it('gửi from/to đúng dạng VN YYYY-MM-DD', async () => {
    const { getTeamRouteDrivers } = await import('./api');
    await getTeamRouteDrivers(12, { from: '2026-08-01', to: '2026-08-31' });
    expect(urlOf()).toContain('from=2026-08-01');
    expect(urlOf()).toContain('to=2026-08-31');
  });
});

describe('getTeamRoutes', () => {
  it('đọc đúng shape {routes, unassigned} — KHÔNG phải {data, meta}', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          routes: [{ routeId: 1, routeName: 'HN – HP' }],
          unassigned: { routeId: null, routeName: 'Không gắn tuyến' },
          range: { from: '2026-08-01', to: '2026-08-31' },
        },
      }),
    });
    const { getTeamRoutes } = await import('./api');

    const out = await getTeamRoutes({ from: '2026-08-01', to: '2026-08-31' });

    expect(out.routes).toHaveLength(1);
    expect(out.unassigned?.routeId).toBeNull();
  });

  it('gửi q để lọc theo tên tuyến', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ success: true, data: { routes: [], unassigned: null } }),
    });
    const { getTeamRoutes } = await import('./api');
    await getTeamRoutes({ from: '2026-08-01', to: '2026-08-31', q: 'Hải Phòng' });
    // Đọc qua searchParams thay vì so chuỗi: URLSearchParams mã hoá khoảng trắng
    // thành '+', so chuỗi thô sẽ fail dù URL hoàn toàn đúng.
    expect(new URL(urlOf()).searchParams.get('q')).toBe('Hải Phòng');
  });
});

describe('patchTeamMember', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) });
  });

  it('chỉ gửi field được truyền — không tự thêm null làm xoá dữ liệu người khác', async () => {
    const { patchTeamMember } = await import('./api');
    await patchTeamMember('d1', { stage: 'JOINED' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ stage: 'JOINED' });
  });

  it('note chuỗi rỗng VẪN được gửi (nghĩa là xoá ghi chú)', async () => {
    const { patchTeamMember } = await import('./api');
    await patchTeamMember('d1', { note: '' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ note: '' });
  });

  it('ownerAdminUserId null VẪN được gửi (nghĩa là gỡ người phụ trách)', async () => {
    const { patchTeamMember } = await import('./api');
    await patchTeamMember('d1', { ownerAdminUserId: null });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ownerAdminUserId: null });
  });
});
