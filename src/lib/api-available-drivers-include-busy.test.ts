import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAvailableDrivers, API_BASE_URL } from './api';

// Ca CHIỀU VỀ: khách đặt lượt về cho ĐÚNG tài đang chở lượt đi. Backend ẩn tài có
// cam kết CHỒNG GIỜ khỏi màn gán, nên admin không chọn được — dù `reassignDriver`
// vốn KHÔNG có guard bận. `includeBusy` nới đúng tầng hiển thị đó.
//
// Ràng buộc quan trọng: cờ chỉ được gửi khi BẬT. Gửi `includeBusy=false` cũng vô
// hại (backend đọc 'true'/'1') nhưng "không gửi" mới là bằng chứng hành vi cũ của
// client cũ không đổi.
describe('getAvailableDrivers — includeBusy (bypass tài đang bận)', () => {
  let fetchMock: any;

  beforeEach(() => {
    localStorage.setItem('access_token', 'tok');
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const calledUrl = () => fetchMock.mock.calls[0][0] as string;

  it('gửi includeBusy=true khi admin bật công tắc', async () => {
    await getAvailableDrivers({ includeBusy: true });
    expect(calledUrl()).toContain(`${API_BASE_URL}/bookings/admin/available-drivers`);
    expect(calledUrl()).toContain('includeBusy=true');
  });

  it('KHÔNG gửi includeBusy khi tắt (hành vi cũ y nguyên)', async () => {
    await getAvailableDrivers({ includeBusy: false });
    expect(calledUrl()).not.toContain('includeBusy');
  });

  it('KHÔNG gửi includeBusy khi không truyền gì', async () => {
    await getAvailableDrivers();
    expect(calledUrl()).not.toContain('includeBusy');
  });

  // Cờ mới không được nuốt mất khung giờ / excludeBookingId: thiếu khung giờ thì
  // backend coi là "đi ngay" và lọc theo cửa sổ khác hẳn, thiếu excludeBookingId
  // thì chính chuyến đang đổi tài lại bị tính là cam kết cản trở.
  it('đi kèm khung giờ + excludeBookingId mà không nuốt tham số nào', async () => {
    await getAvailableDrivers({
      scheduledFrom: '2026-08-17T10:00:00.000Z',
      scheduledTo: '2026-08-17T11:00:00.000Z',
      excludeBookingId: 'bk-1',
      includeBusy: true,
    });
    const url = calledUrl();
    expect(url).toContain('scheduledFrom=2026-08-17T10%3A00%3A00.000Z');
    expect(url).toContain('scheduledTo=2026-08-17T11%3A00%3A00.000Z');
    expect(url).toContain('excludeBookingId=bk-1');
    expect(url).toContain('includeBusy=true');
  });
});
