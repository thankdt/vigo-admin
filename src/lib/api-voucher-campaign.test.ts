import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * Kiểm ĐƯỜNG DÂY của các hàm API mới: đúng path, đúng method, đúng body, và bóc đúng
 * envelope `{ data }` của backend. Lỗi ở tầng này không lộ ra lúc typecheck — nó chỉ
 * biểu hiện thành "bấm Lưu mà không có gì đổi", đúng loại lỗi tốn nhiều thời gian nhất.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('localStorage', {
    getItem: () => 'fake-token',
    setItem: () => undefined,
    removeItem: () => undefined,
  });
});

afterEach(() => vi.unstubAllGlobals());

function respond(data: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data }),
    text: async () => JSON.stringify({ data }),
  });
}

/** (url, init) của lần fetch cuối. */
function lastCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(-1);
  return [String(call?.[0] ?? ''), (call?.[1] ?? {}) as RequestInit];
}

describe('API chiến dịch tặng mã', () => {
  it('getVoucherCampaign gọi GET /voucher-campaign và bóc envelope', async () => {
    respond({ id: 'c1', isActive: false });
    const { getVoucherCampaign } = await import('./api');

    const res = await getVoucherCampaign();

    const [url] = lastCall();
    expect(url).toContain('/voucher-campaign');
    expect(res).toMatchObject({ id: 'c1', isActive: false });
  });

  it('updateVoucherCampaign dùng PUT, không phải POST', async () => {
    respond({ id: 'c1', isActive: true });
    const { updateVoucherCampaign } = await import('./api');

    await updateVoucherCampaign({ isActive: true, validDays: 14 });

    const [url, init] = lastCall();
    expect(url).toContain('/voucher-campaign');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ isActive: true, validDays: 14 });
  });

  it('getVoucherCampaignStats gọi đúng /voucher-campaign/stats', async () => {
    respond({ granted: 10, used: 3, usedRate: 30, totalDiscount: 60000, active: 5 });
    const { getVoucherCampaignStats } = await import('./api');

    const res = await getVoucherCampaignStats();

    expect(lastCall()[0]).toContain('/voucher-campaign/stats');
    expect(res.used).toBe(3);
  });
});

describe('API gán voucher TARGETED', () => {
  it('assignPromotionToUsers POST đúng path và body', async () => {
    respond({ assigned: 2, skipped: 0 });
    const { assignPromotionToUsers } = await import('./api');

    await assignPromotionToUsers(7, ['u1', 'u2']);

    const [url, init] = lastCall();
    expect(url).toContain('/promotions/7/assign');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ userIds: ['u1', 'u2'] });
  });

  it('revokePromotionFromUser dùng DELETE với userId trong path', async () => {
    respond({ revoked: 1 });
    const { revokePromotionFromUser } = await import('./api');

    await revokePromotionFromUser(7, 'u1');

    const [url, init] = lastCall();
    expect(url).toContain('/promotions/7/assign/u1');
    expect(init.method).toBe('DELETE');
  });

  it('getPromotionAssignees trả mảng rỗng khi envelope thiếu data', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({}), text: async () => '{}',
    });
    const { getPromotionAssignees } = await import('./api');

    await expect(getPromotionAssignees(7)).resolves.toEqual([]);
  });
});

describe('lookupCustomerByPhone', () => {
  it('trả id để gán voucher được', async () => {
    respond({ exists: true, id: 'user-1', fullName: 'Nguyễn Văn A' });
    const { lookupCustomerByPhone } = await import('./api');

    await expect(lookupCustomerByPhone('0900000000')).resolves.toEqual({
      exists: true, id: 'user-1', fullName: 'Nguyễn Văn A',
    });
  });

  // Backend cũ chưa có field `id`. Phải ra `null` để UI báo "cần deploy bản mới"
  // thay vì gán bằng một id undefined và tạo dòng user_promotion trỏ vào hư không.
  it('backend cũ không trả id → id = null, KHÔNG undefined', async () => {
    respond({ exists: true, fullName: 'Nguyễn Văn A' });
    const { lookupCustomerByPhone } = await import('./api');

    const res = await lookupCustomerByPhone('0900000000');
    expect(res.id).toBeNull();
    expect(res.exists).toBe(true);
  });
});

describe('getVouchers — không kéo về mã do chiến dịch tự sinh', () => {
  // Endpoint không phân trang. Không lọc thì sau vài tuần chạy chiến dịch, trang admin
  // ngập hàng chục nghìn mã dùng-một-lần mà chẳng mã nào sửa bằng tay.
  it('mặc định KHÔNG kèm includeCampaign', async () => {
    respond([]);
    const { getVouchers } = await import('./api');

    await getVouchers();

    expect(lastCall()[0]).not.toContain('includeCampaign');
  });

  it('bật cờ thì thêm query để soi mã tự sinh', async () => {
    respond([]);
    const { getVouchers } = await import('./api');

    await getVouchers(true);

    expect(lastCall()[0]).toContain('includeCampaign=true');
  });
});
