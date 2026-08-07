import { describe, it, expect } from 'vitest';
import {
  buildRankingQuery,
  buildRecentRatingsQuery,
  DEFAULT_MIN_RATINGS,
  MAX_PAGE_LIMIT,
} from './driver-reputation-query';

/** Đọc 1 tham số ra khỏi query string (null = không gửi tham số đó). */
const get = (qs: string, key: string) => new URLSearchParams(qs).get(key);

describe('buildRankingQuery — minRatings là bộ lọc CHỐNG 11.7k dòng rỗng', () => {
  it('mặc định (không truyền gì) vẫn LUÔN gửi minRatings', () => {
    // Quên tham số này = admin mở trang thấy 11.735 dòng không có đánh giá.
    expect(get(buildRankingQuery(), 'minRatings')).toBe(String(DEFAULT_MIN_RATINGS));
    expect(DEFAULT_MIN_RATINGS).toBe(1);
  });

  it('minRatings = 0 GIỮ NGUYÊN 0 (tick "hiện cả tài chưa có đánh giá")', () => {
    // Cái bẫy: `0 || 1` ra 1 — checkbox bấm xong danh sách y như cũ.
    expect(get(buildRankingQuery({ minRatings: 0 }), 'minRatings')).toBe('0');
  });

  it('minRatings âm / NaN / Infinity → rơi về mặc định, KHÔNG gửi rác', () => {
    for (const bad of [-1, -0.5, NaN, Infinity, -Infinity]) {
      expect(get(buildRankingQuery({ minRatings: bad }), 'minRatings')).toBe(
        String(DEFAULT_MIN_RATINGS),
      );
    }
  });

  it('minRatings undefined/null → mặc định (khác hẳn 0)', () => {
    expect(get(buildRankingQuery({ minRatings: undefined }), 'minRatings')).toBe('1');
    expect(get(buildRankingQuery({ minRatings: null }), 'minRatings')).toBe('1');
  });

  it('minRatings > 5 vẫn gửi nguyên (ngưỡng do admin chọn, không kẹp)', () => {
    expect(get(buildRankingQuery({ minRatings: 20 }), 'minRatings')).toBe('20');
  });
});

describe('buildRankingQuery — q', () => {
  it('cắt khoảng trắng và gửi nguyên văn', () => {
    expect(get(buildRankingQuery({ q: '  Nguyễn Văn A ' }), 'q')).toBe('Nguyễn Văn A');
  });

  it('chuỗi rỗng / toàn khoảng trắng / undefined → KHÔNG gửi q', () => {
    expect(get(buildRankingQuery({ q: '' }), 'q')).toBeNull();
    expect(get(buildRankingQuery({ q: '   ' }), 'q')).toBeNull();
    expect(get(buildRankingQuery({}), 'q')).toBeNull();
  });

  it('encode ký tự đặc biệt (SĐT dạng +84…) thay vì làm hỏng URL', () => {
    const qs = buildRankingQuery({ q: '+84901234567' });
    expect(qs).toContain('q=%2B84901234567');
    expect(get(qs, 'q')).toBe('+84901234567'); // decode lại đúng
  });
});

describe('buildRankingQuery — limit/offset', () => {
  it('limit thường gửi nguyên', () => {
    expect(get(buildRankingQuery({ limit: 20 }), 'limit')).toBe('20');
  });

  it('limit vượt trần bị kẹp về 100 (backend cũng kẹp — khớp cho khỏi lệch trang)', () => {
    expect(get(buildRankingQuery({ limit: 5000 }), 'limit')).toBe(String(MAX_PAGE_LIMIT));
  });

  it('limit 0 / âm / NaN → KHÔNG gửi (để backend dùng mặc định của nó)', () => {
    expect(get(buildRankingQuery({ limit: 0 }), 'limit')).toBeNull();
    expect(get(buildRankingQuery({ limit: -10 }), 'limit')).toBeNull();
    expect(get(buildRankingQuery({ limit: NaN }), 'limit')).toBeNull();
  });

  it('offset 0 → không gửi; offset > 0 → gửi', () => {
    expect(get(buildRankingQuery({ offset: 0 }), 'offset')).toBeNull();
    expect(get(buildRankingQuery({ offset: 40 }), 'offset')).toBe('40');
  });

  it('offset âm / NaN → không gửi (tránh backend nuốt thành 0 kèm URL rác)', () => {
    expect(get(buildRankingQuery({ offset: -20 }), 'offset')).toBeNull();
    expect(get(buildRankingQuery({ offset: NaN }), 'offset')).toBeNull();
  });

  it('số lẻ bị làm tròn XUỐNG thành số nguyên', () => {
    expect(get(buildRankingQuery({ limit: 20.9, offset: 40.7 }), 'limit')).toBe('20');
    expect(get(buildRankingQuery({ limit: 20.9, offset: 40.7 }), 'offset')).toBe('40');
  });
});

describe('buildRecentRatingsQuery — maxStars là bộ lọc admin cần nhất', () => {
  it('maxStars 3 (nút "chỉ xem ≤ 3 sao")', () => {
    expect(get(buildRecentRatingsQuery({ maxStars: 3 }), 'maxStars')).toBe('3');
  });

  it('không truyền / null → KHÔNG lọc', () => {
    expect(get(buildRecentRatingsQuery(), 'maxStars')).toBeNull();
    expect(get(buildRecentRatingsQuery({ maxStars: null }), 'maxStars')).toBeNull();
  });

  it('0 / âm / >5 / NaN → BỎ HẲN tham số, không kẹp thành 1 hay 5', () => {
    // Kẹp sẽ lọc SAI âm thầm: chọn "0" mà nhận danh sách 1 sao.
    for (const bad of [0, -3, 6, 99, NaN, Infinity]) {
      expect(get(buildRecentRatingsQuery({ maxStars: bad }), 'maxStars')).toBeNull();
    }
  });

  it('biên 1 và 5 vẫn hợp lệ', () => {
    expect(get(buildRecentRatingsQuery({ maxStars: 1 }), 'maxStars')).toBe('1');
    expect(get(buildRecentRatingsQuery({ maxStars: 5 }), 'maxStars')).toBe('5');
  });

  it('KHÔNG tự gắn minRatings (khác endpoint xếp hạng)', () => {
    expect(get(buildRecentRatingsQuery({ limit: 20 }), 'minRatings')).toBeNull();
  });

  it('limit/offset xử lý giống bảng xếp hạng', () => {
    const qs = buildRecentRatingsQuery({ limit: 500, offset: 60 });
    expect(get(qs, 'limit')).toBe(String(MAX_PAGE_LIMIT));
    expect(get(qs, 'offset')).toBe('60');
    expect(get(buildRecentRatingsQuery({ offset: 0 }), 'offset')).toBeNull();
  });
});
