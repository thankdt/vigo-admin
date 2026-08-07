import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDriverReputationRanking, getRecentDriverRatings, API_BASE_URL } from './api';

/**
 * Hai client danh sách của trang /driver-reputation: đúng đường dẫn, đúng tham
 * số, và gỡ đúng lớp bọc `{ success, data }` của interceptor backend.
 */
describe('driver-reputation list API clients', () => {
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

  const ok = (data: unknown) =>
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data }) });

  const calledUrl = () => String(fetchMock.mock.calls[0][0]);

  describe('getDriverReputationRanking', () => {
    it('GET /admin/driver-reputation, gỡ envelope và giữ nguyên displayStars null', () => {
      ok({
        items: [
          {
            driverId: 'd1',
            fullName: 'Nguyễn Văn A',
            phone: '0900000001',
            ratingCount: 0,
            displayStars: null,
            bayesStars: 4.5,
            lastRatingAt: null,
          },
        ],
        total: 1,
        minRatingsToShow: 5,
      });

      return getDriverReputationRanking({ limit: 20, offset: 0 }).then((res) => {
        expect(calledUrl()).toContain(`${API_BASE_URL}/admin/driver-reputation?`);
        // KHÔNG được nhầm sang /admin/driver-reputation/ratings/recent.
        expect(calledUrl()).not.toContain('/ratings');
        expect(res.total).toBe(1);
        expect(res.minRatingsToShow).toBe(5);
        // null phải đi thẳng tới tầng hiển thị — ?? 0 ở đây là dán nhãn "0 sao".
        expect(res.items[0].displayStars).toBeNull();
        expect(res.items[0].ratingCount).toBe(0);
      });
    });

    it('mặc định gửi minRatings=1 (không để admin nhận 11.7k dòng rỗng)', async () => {
      ok({ items: [], total: 0, minRatingsToShow: 5 });
      await getDriverReputationRanking();
      expect(new URL(calledUrl()).searchParams.get('minRatings')).toBe('1');
    });

    it('minRatings=0 đi tới backend nguyên vẹn (checkbox "hiện cả tài chưa có đánh giá")', async () => {
      ok({ items: [], total: 0, minRatingsToShow: 5 });
      await getDriverReputationRanking({ minRatings: 0 });
      expect(new URL(calledUrl()).searchParams.get('minRatings')).toBe('0');
    });

    it('chuyển tiếp q/limit/offset', async () => {
      ok({ items: [], total: 0, minRatingsToShow: 5 });
      await getDriverReputationRanking({ q: '0901234567', limit: 50, offset: 100 });
      const p = new URL(calledUrl()).searchParams;
      expect(p.get('q')).toBe('0901234567');
      expect(p.get('limit')).toBe('50');
      expect(p.get('offset')).toBe('100');
    });

    it('payload thiếu items → mảng rỗng, KHÔNG undefined (nơi gọi map thẳng)', async () => {
      ok({ total: 0 });
      const res = await getDriverReputationRanking();
      expect(res.items).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.minRatingsToShow).toBe(0);
    });
  });

  describe('getRecentDriverRatings', () => {
    it('GET /admin/driver-reputation/ratings/recent + giữ isCounted/excludeReason', async () => {
      ok({
        items: [
          {
            id: 'r1',
            bookingId: 'b1',
            driverId: 'd1',
            stars: 2,
            comment: 'Tài đi ẩu',
            serviceType: 'CARPOOL',
            isCounted: false,
            excludeReason: 'SELF_AGENT',
            createdAt: '2026-08-01T03:00:00.000Z',
            driverName: 'Nguyễn Văn A',
            driverPhone: '0900000001',
          },
        ],
        total: 1,
      });

      const res = await getRecentDriverRatings({ maxStars: 3 });

      expect(calledUrl()).toContain(`${API_BASE_URL}/admin/driver-reputation/ratings/recent?`);
      expect(new URL(calledUrl()).searchParams.get('maxStars')).toBe('3');
      expect(res.items[0].isCounted).toBe(false);
      expect(res.items[0].excludeReason).toBe('SELF_AGENT');
    });

    it('không lọc → KHÔNG gửi maxStars', async () => {
      ok({ items: [], total: 0 });
      await getRecentDriverRatings({ limit: 20 });
      expect(new URL(calledUrl()).searchParams.get('maxStars')).toBeNull();
    });

    it('payload thiếu items → mảng rỗng', async () => {
      ok({});
      const res = await getRecentDriverRatings();
      expect(res.items).toEqual([]);
      expect(res.total).toBe(0);
    });
  });
});
