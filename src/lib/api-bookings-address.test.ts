import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBookings, API_BASE_URL } from './api';

// Ô "Tìm theo địa chỉ" của danh sách chuyến: getBookings phải gửi `address=…` khi có,
// và BỎ HẲN param khi rỗng (backend không thêm mệnh đề → tương thích ngược).
describe('getBookings — lọc theo địa chỉ đón/trả', () => {
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
  // Đọc lại bằng searchParams, KHÔNG toContain chuỗi thô: 'Đà Nẵng' nằm trong URL ở dạng
  // percent-encoded ('%C4%90%C3%A0+N%E1%BA%B5ng') nên assert trên chuỗi thô sẽ đỏ oan.
  const addressParam = () => new URL(calledUrl()).searchParams.get('address');

  it('gửi address nguyên văn (có dấu) — backend lo phần bỏ dấu', async () => {
    await getBookings({ address: 'Đà Nẵng' });
    expect(calledUrl()).toContain(`${API_BASE_URL}/bookings/admin/list`);
    expect(addressParam()).toBe('Đà Nẵng');
  });

  it('giữ nguyên ký tự % và _ (backend dùng POSITION, không phải LIKE)', async () => {
    await getBookings({ address: '100% Lê_Lợi' });
    expect(addressParam()).toBe('100% Lê_Lợi');
  });

  it('bỏ hẳn param khi chuỗi rỗng', async () => {
    await getBookings({ address: '' });
    expect(addressParam()).toBeNull();
  });

  it('bỏ hẳn param khi không truyền (mọi màn khác dùng chung getBookings không đổi)', async () => {
    await getBookings({});
    expect(addressParam()).toBeNull();
  });

  it('dùng được đồng thời với q và bookingId (ba ô độc lập nhau)', async () => {
    await getBookings({ q: '0364843878', bookingId: 'abd6f444', address: 'My Dinh' });
    const url = new URL(calledUrl());
    expect(url.searchParams.get('q')).toBe('0364843878');
    expect(url.searchParams.get('bookingId')).toBe('abd6f444');
    expect(url.searchParams.get('address')).toBe('My Dinh');
  });
});
