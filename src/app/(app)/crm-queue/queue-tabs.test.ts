import { describe, it, expect } from 'vitest';
import {
  paramsForTab,
  QUEUE_TAB_ORDER,
  QUEUE_TAB_LABEL,
  waitedSince,
  formatWaited,
} from './queue-tabs';

describe('paramsForTab', () => {
  // Chuyến đã COMPLETED/CANCELLED KHÔNG được nằm trong tab gọi trước: backend suy pha
  // theo completedAt nên xử lý chúng sẽ ghi vào callAfter*, callBeforeStatus vẫn NULL
  // -> dòng đó ở lại hàng đợi VĨNH VIỄN.
  it('tab "before" loại trừ chuyến đã xong và sắp theo chờ lâu nhất', () => {
    expect(paramsForTab('before', 'admin-1')).toEqual({
      callBefore: 'uncalled',
      excludeStatus: 'COMPLETED,CANCELLED',
      sortBy: 'createdAt',
      order: 'ASC',
    });
  });

  it('tab "after" chỉ chuyến đã hoàn thành, sắp theo hoàn thành sớm nhất', () => {
    expect(paramsForTab('after', 'admin-1')).toEqual({
      callAfter: 'uncalled',
      status: 'COMPLETED',
      sortBy: 'completedAt',
      order: 'ASC',
    });
  });

  it('tab "mine" lọc theo admin đang đăng nhập', () => {
    expect(paramsForTab('mine', 'admin-1')).toEqual({
      claimedBy: 'admin-1',
      sortBy: 'createdAt',
      order: 'ASC',
    });
  });

  it('tab "overdue" = "after" + cờ overdue (ngưỡng giờ do BE quyết)', () => {
    const p = paramsForTab('overdue', 'admin-1');
    expect(p).toMatchObject({ callAfter: 'uncalled', status: 'COMPLETED', overdue: true });
    // Ngưỡng nằm ở system_config phía BE — FE biết con số này là bắt đầu trôi lệch.
    expect(p).not.toHaveProperty('overdueHours');
  });

  it('4 tab, đúng thứ tự hiển thị', () => {
    expect(QUEUE_TAB_ORDER).toEqual(['before', 'after', 'mine', 'overdue']);
  });

  it('mọi tab đều có nhãn tiếng Việt', () => {
    for (const tab of QUEUE_TAB_ORDER) {
      expect(QUEUE_TAB_LABEL[tab]).toBeTruthy();
    }
  });

  // Chỉ tab "mine" được phép mang claimedBy. Rò sang tab khác là CSKH thấy thiếu việc
  // của đồng nghiệp mà không hiểu vì sao.
  it('chỉ tab "mine" gửi claimedBy', () => {
    for (const tab of QUEUE_TAB_ORDER) {
      const p = paramsForTab(tab, 'admin-1');
      if (tab === 'mine') expect(p.claimedBy).toBe('admin-1');
      else expect(p).not.toHaveProperty('claimedBy');
    }
  });
});

describe('waitedSince — đếm chờ từ mốc nào', () => {
  const bk = { createdAt: '2026-08-01T00:00:00Z', completedAt: '2026-08-02T00:00:00Z' };

  it('tab gọi TRƯỚC đếm từ lúc khách đặt', () => {
    expect(waitedSince('before', bk)).toBe(bk.createdAt);
    expect(waitedSince('mine', bk)).toBe(bk.createdAt);
  });

  // Dùng createdAt ở tab gọi-sau sẽ hiện tuổi của CHUYẾN chứ không phải tuổi của VIỆC —
  // chuyến đặt trước 3 ngày, hoàn thành 10 phút trước, mà cột hiện "3 ngày".
  it('tab gọi SAU và Quá hạn đếm từ lúc chuyến hoàn thành', () => {
    expect(waitedSince('after', bk)).toBe(bk.completedAt);
    expect(waitedSince('overdue', bk)).toBe(bk.completedAt);
  });

  it('thiếu mốc thì trả null, không rơi về mốc khác', () => {
    expect(waitedSince('after', { createdAt: bk.createdAt, completedAt: null })).toBeNull();
  });
});

describe('formatWaited', () => {
  const now = new Date('2026-08-10T12:00:00Z').getTime();
  const ago = (mins: number) => new Date(now - mins * 60_000).toISOString();

  it('dưới 1 giờ hiện phút', () => {
    expect(formatWaited(ago(0), now)).toBe('0 phút');
    expect(formatWaited(ago(45), now)).toBe('45 phút');
  });

  it('từ 1 giờ hiện giờ + phút, bỏ phần phút khi tròn', () => {
    expect(formatWaited(ago(60), now)).toBe('1 giờ');
    expect(formatWaited(ago(192), now)).toBe('3 giờ 12 phút');
  });

  it('từ 1 ngày hiện ngày + giờ', () => {
    expect(formatWaited(ago(60 * 24), now)).toBe('1 ngày');
    expect(formatWaited(ago(60 * 50), now)).toBe('2 ngày 2 giờ');
  });

  it('thiếu mốc hoặc mốc hỏng → gạch ngang, không NaN', () => {
    expect(formatWaited(null, now)).toBe('—');
    expect(formatWaited(undefined, now)).toBe('—');
    expect(formatWaited('không-phải-ngày', now)).toBe('—');
  });

  // Đồng hồ máy admin lệch so với server là chuyện có thật; hiện "-5 phút" trông như bug.
  it('mốc ở tương lai (lệch đồng hồ) → gạch ngang, không hiện số âm', () => {
    expect(formatWaited(ago(-5), now)).toBe('—');
  });
});
