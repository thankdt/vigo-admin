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
    json: async () => ({ success: true, data: { id: 'd1', provinces: [] } }),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('updateDriverProvinces', () => {
  it('PUT /drivers/admin/:id/provinces với provinceCodes + provinceIds, KHÔNG đụng /routes', async () => {
    const { updateDriverProvinces } = await import('./api');
    await updateDriverProvinces('d1', { provinceCodes: ['01', '31'], provinceIds: [101, 102] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/drivers/admin/d1/provinces');
    expect(String(url)).not.toContain('/routes');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ provinceCodes: ['01', '31'], provinceIds: [101, 102] });
  });

  it('gỡ hết tỉnh gửi mảng rỗng (không bỏ trường — thiếu cả hai là 400 VAL_003)', async () => {
    const { updateDriverProvinces } = await import('./api');
    await updateDriverProvinces('d1', { provinceCodes: [] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ provinceCodes: [] });
  });
});

describe('getDrivers lọc tỉnh', () => {
  it('gửi provinceCode, không còn fixedRouteId', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [], meta: {} }) });
    const { getDrivers } = await import('./api');
    await getDrivers({ provinceCode: '31' });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('provinceCode')).toBe('31');
    expect(url.searchParams.has('fixedRouteId')).toBe(false);
  });

  it('không gửi provinceCode khi rỗng', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [], meta: {} }) });
    const { getDrivers } = await import('./api');
    await getDrivers({ provinceCode: '' });
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('provinceCode');
  });
});
