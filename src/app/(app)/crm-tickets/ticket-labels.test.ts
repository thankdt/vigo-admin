import { describe, it, expect } from 'vitest';
import {
  TICKET_ALLOWED_TRANSITIONS,
  TICKET_STATUS_LABEL,
  humanizeMs,
  slaStateOf,
} from './ticket-labels';

const NOW = new Date('2026-08-18T02:00:00Z').getTime();
const mk = (over: any = {}) => ({
  status: 'OPEN' as const,
  createdAt: '2026-08-18T00:00:00Z',
  slaResolveDueAt: '2026-08-18T08:00:00Z',
  ...over,
});

describe('slaStateOf', () => {
  it('còn hạn -> tone ok, chữ "Còn …"', () => {
    const s = slaStateOf(mk(), NOW);
    expect(s.overdue).toBe(false);
    expect(s.tone).toBe('ok');
    expect(s.text).toMatch(/^Còn /);
  });

  it('quá hạn -> tone danger, chữ "Quá hạn …"', () => {
    const s = slaStateOf(mk({ slaResolveDueAt: '2026-08-18T01:00:00Z' }), NOW);
    expect(s.overdue).toBe(true);
    expect(s.tone).toBe('danger');
    expect(s.text).toMatch(/^Quá hạn /);
  });

  it('sắp hết (còn dưới 25% thời lượng) -> tone warn', () => {
    // Tạo 00:00, hạn 08:00 (8h). Now 07:00 -> còn 1h = 12.5% < 25%.
    const s = slaStateOf(mk(), new Date('2026-08-18T07:00:00Z').getTime());
    expect(s.tone).toBe('warn');
  });

  /**
   * Ticket đã kết thúc KHÔNG đếm ngược nữa: để nó tiếp tục "quá hạn" là biến bảng thành một
   * biển đỏ vô nghĩa và người ta sẽ ngừng nhìn màu.
   */
  it.each(['RESOLVED', 'CLOSED', 'REJECTED'] as const)('trạng thái %s -> done, không đỏ', (st) => {
    const s = slaStateOf(mk({ status: st, slaResolveDueAt: '2020-01-01T00:00:00Z' }), NOW);
    expect(s.tone).toBe('done');
    expect(s.overdue).toBe(false);
  });

  it('mốc hỏng không làm vỡ', () => {
    expect(() => slaStateOf(mk({ slaResolveDueAt: 'rác' }), NOW)).not.toThrow();
    expect(slaStateOf(mk({ slaResolveDueAt: 'rác' }), NOW).text).toBe('—');
  });

  /** Đếm ngược là HIỆU hai mốc nên phải độc lập múi giờ tiến trình. */
  it('độc lập múi giờ tiến trình', () => {
    const old = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      const a = slaStateOf(mk(), NOW);
      process.env.TZ = 'Asia/Ho_Chi_Minh';
      const b = slaStateOf(mk(), NOW);
      expect(a).toEqual(b);
    } finally {
      process.env.TZ = old;
    }
  });
});

describe('humanizeMs', () => {
  it.each([
    [30_000, 'dưới 1 phút'],
    [12 * 60_000, '12 phút'],
    [5 * 3600_000, '5 giờ'],
    [5 * 3600_000 + 30 * 60_000, '5 giờ 30 phút'],
    [2 * 86400_000 + 3 * 3600_000, '2 ngày 3 giờ'],
    [2 * 86400_000, '2 ngày'],
  ])('%i ms -> %s', (ms, expected) => {
    expect(humanizeMs(ms)).toBe(expected);
  });
});

describe('bảng chuyển trạng thái — MIRROR backend', () => {
  /** Lệch bảng này là admin bấm nút rồi ăn 400 mà không hiểu vì sao (bẫy §13.2). */
  it('CLOSED là trạng thái cuối', () => {
    expect(TICKET_ALLOWED_TRANSITIONS.CLOSED).toEqual([]);
  });

  it('OPEN không nhảy thẳng sang CLOSED', () => {
    expect(TICKET_ALLOWED_TRANSITIONS.OPEN).not.toContain('CLOSED');
  });

  it('mọi trạng thái đều có nhãn tiếng Việt', () => {
    for (const st of Object.keys(TICKET_ALLOWED_TRANSITIONS)) {
      expect(TICKET_STATUS_LABEL[st as keyof typeof TICKET_STATUS_LABEL]).toBeTruthy();
    }
  });
});
