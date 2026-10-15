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

describe('getTeamProvinceDrivers', () => {
  it("mã 'none' đi vào path (nhóm chưa xác định tỉnh), KHÔNG bị ép thành số", async () => {
    const { getTeamProvinceDrivers } = await import('./api');
    await getTeamProvinceDrivers('none', { from: '2026-08-01', to: '2026-08-31' });
    expect(urlOf()).toContain('/admin/driver-team/provinces/none/drivers');
  });

  it('mã tỉnh 2 chữ số giữ nguyên số 0 đầu ở path', async () => {
    const { getTeamProvinceDrivers } = await import('./api');
    await getTeamProvinceDrivers('01', { from: '2026-08-01', to: '2026-08-31' });
    expect(urlOf()).toContain('/admin/driver-team/provinces/01/drivers');
  });

  it('KHÔNG còn gọi API theo tuyến cũ', async () => {
    const { getTeamProvinceDrivers } = await import('./api');
    await getTeamProvinceDrivers('31', { from: '2026-08-01', to: '2026-08-31' });
    expect(urlOf()).not.toContain('/routes');
  });

  it('bỏ qua field rỗng, không gửi param rác', async () => {
    const { getTeamProvinceDrivers } = await import('./api');
    await getTeamProvinceDrivers('31', {
      from: '2026-08-01', to: '2026-08-31', q: '', stage: undefined,
    });
    const url = urlOf();
    expect(url).not.toContain('q=');
    expect(url).not.toContain('stage=');
  });

  it('gửi from/to đúng dạng VN YYYY-MM-DD', async () => {
    const { getTeamProvinceDrivers } = await import('./api');
    await getTeamProvinceDrivers('31', { from: '2026-08-01', to: '2026-08-31' });
    expect(urlOf()).toContain('from=2026-08-01');
    expect(urlOf()).toContain('to=2026-08-31');
  });

  it('thiếu data/meta thì rơi về mảng rỗng + meta mặc định (backend cũ không vỡ)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const { getTeamProvinceDrivers } = await import('./api');
    const out = await getTeamProvinceDrivers('31', { from: '2026-08-01', to: '2026-08-31' });
    expect(out.data).toEqual([]);
    expect(out.meta.total).toBe(0);
  });
});

describe('getTeamProvinces', () => {
  it('đọc đúng shape {provinces, unknown} — KHÔNG phải {data, meta}', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          provinces: [{ provinceCode: '31', provinceName: 'Hải Phòng' }],
          unknown: { provinceCode: null, provinceName: 'Chưa xác định tỉnh' },
          range: { from: '2026-08-01', to: '2026-08-31' },
          bucketNote: 'Mỗi chuyến được đếm ở mọi tỉnh…',
        },
      }),
    });
    const { getTeamProvinces } = await import('./api');

    const out = await getTeamProvinces({ from: '2026-08-01', to: '2026-08-31' });

    expect(urlOf()).toContain('/admin/driver-team/provinces?');
    expect(out.provinces).toHaveLength(1);
    expect(out.unknown?.provinceCode).toBeNull();
    expect(out.bucketNote).toContain('Mỗi chuyến');
  });

  it('gửi q để lọc theo tên tỉnh và driverQ để tìm tài xế', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ success: true, data: { provinces: [], unknown: null } }),
    });
    const { getTeamProvinces } = await import('./api');
    await getTeamProvinces({ from: '2026-08-01', to: '2026-08-31', q: 'Hải Phòng', driverQ: 'Nguyễn' });
    // Đọc qua searchParams thay vì so chuỗi: URLSearchParams mã hoá khoảng trắng
    // thành '+', so chuỗi thô sẽ fail dù URL hoàn toàn đúng.
    const sp = new URL(urlOf()).searchParams;
    expect(sp.get('q')).toBe('Hải Phòng');
    expect(sp.get('driverQ')).toBe('Nguyễn');
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

  it('assignedProvinceCodes gửi nguyên mảng; [] VẪN được gửi (nghĩa là bỏ hết tỉnh)', async () => {
    const { patchTeamMember } = await import('./api');
    await patchTeamMember('d1', { assignedProvinceCodes: ['31', '22'] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      assignedProvinceCodes: ['31', '22'],
    });
    fetchMock.mockClear();
    await patchTeamMember('d1', { assignedProvinceCodes: [] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ assignedProvinceCodes: [] });
  });
});
