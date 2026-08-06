import { describe, it, expect } from 'vitest';
import {
  COLLECTING_LABEL,
  NO_RATING_LABEL,
  formatOpsRate,
  formatDisplayStars,
  formatScore,
  distributionTotal,
  distributionPercent,
} from './driver-reputation-format';

/**
 * Test ĐỐI KHÁNG — viết theo HÀNH VI ĐÚNG PHẢI CÓ (spec), không theo code.
 *
 * Bất biến quan trọng nhất: **phân biệt được `0` với `null`**, theo CẢ HAI chiều.
 *  - null/undefined/thiếu field → "Đang thu thập", KHÔNG BAO GIỜ "0%".
 *  - CÓ dữ liệu (kể cả `0`) → phải hiện con số. Gắn nhãn "Đang thu thập" lên
 *    một chỉ số ĐANG CÓ số là nói dối theo chiều ngược lại: admin tưởng hệ
 *    thống chưa đo được trong khi nó đã đo và ra 0%.
 */

describe('SPEC 4 — thiếu field (backend cũ) xử lý như null, không như 0', () => {
  it('undefined → "Đang thu thập", không "0%"', () => {
    expect(formatOpsRate(undefined, 'accept')).toBe(COLLECTING_LABEL);
    expect(formatOpsRate(undefined, 'accept')).not.toContain('0');
  });

  it('ops thiếu hẳn → cả 3 chỉ số "Đang thu thập"', () => {
    const rep = { ops: undefined } as { ops?: { acceptRate?: number | null } };
    expect(formatOpsRate(rep.ops?.acceptRate, 'accept')).toBe(COLLECTING_LABEL);
  });

  it('score thiếu → "—", KHÔNG phải "0"', () => {
    expect(formatScore(undefined)).toBe('—');
    expect(formatScore(undefined)).not.toBe('0');
  });
});

describe('SPEC 3 — giá trị vô nghĩa không được vẽ ra', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'formatOpsRate(%s) → "Đang thu thập" (không "NaN%%"/"Infinity%%")',
    (v) => {
      expect(formatOpsRate(v, 'accept')).toBe(COLLECTING_LABEL);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'formatDisplayStars(%s) → "Chưa có đánh giá"',
    (v) => {
      expect(formatDisplayStars(v)).toBe(NO_RATING_LABEL);
    },
  );

  it('sao > 5 bị kẹp về "5.0" — thang sao là 1..5', () => {
    expect(formatDisplayStars(7.2)).toBe('5.0');
  });

  it('formatScore(Infinity) → "—", không "100"', () => {
    expect(formatScore(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('SPEC 6 — JSON lỏng lẻo: số dạng chuỗi vẫn là DỮ LIỆU, không phải "chưa có"', () => {
  it('"0.87" → "87%", KHÔNG được gắn nhãn "Đang thu thập"', () => {
    // Chỉ số này CÓ dữ liệu. Nói "Đang thu thập" là báo sai tình trạng đo đạc
    // và xoá mất phân biệt 0 / null theo chiều ngược lại.
    expect(formatOpsRate('0.87' as unknown as number, 'accept')).toBe('87%');
  });

  it('"0" → "0%" (0 thật, không phải chưa có dữ liệu)', () => {
    expect(formatOpsRate('0' as unknown as number, 'completion')).toBe('0%');
  });

  it('chuỗi rỗng KHÔNG phải số 0 → "Đang thu thập"', () => {
    // Number('') === 0. Ép kiểu ngây thơ ở đây biến "không có gì" thành "0%" —
    // đúng cái luật 1 cấm.
    expect(formatOpsRate('' as unknown as number, 'accept')).toBe(COLLECTING_LABEL);
    expect(formatOpsRate('   ' as unknown as number, 'accept')).toBe(COLLECTING_LABEL);
  });

  it('chuỗi rác → "Đang thu thập", không "NaN%"', () => {
    expect(formatOpsRate('abc' as unknown as number, 'accept')).toBe(COLLECTING_LABEL);
  });

  it('sao dạng chuỗi "4.8" → "4.8"', () => {
    expect(formatDisplayStars('4.8' as unknown as number)).toBe('4.8');
  });

  it('sao là chuỗi rỗng → "Chưa có đánh giá"', () => {
    expect(formatDisplayStars('' as unknown as number)).toBe(NO_RATING_LABEL);
  });

  it('score dạng chuỗi "72" → "72", không "—"', () => {
    expect(formatScore('72' as unknown as number)).toBe('72');
  });

  it('phân bố có giá trị dạng chuỗi vẫn tính được tổng', () => {
    // Nếu bỏ qua, khối phân bố hiện "Chưa có đánh giá nào" trong khi ngay bên
    // trên đang ghi "Số đánh giá: 10" — hai con số cãi nhau trên cùng màn hình.
    const dist = { '5': '6', '4': '4' } as unknown as Record<string, number>;
    expect(distributionTotal(dist)).toBe(10);
    expect(distributionPercent(dist, 5)).toBe(60);
  });
});

describe('SPEC 5 — mâu thuẫn collecting vs giá trị: collecting thắng', () => {
  it('collecting: ["accept"] + acceptRate 0.5 → "Đang thu thập"', () => {
    expect(formatOpsRate(0.5, 'accept', ['accept'])).toBe(COLLECTING_LABEL);
  });

  it('collecting rỗng + giá trị 0 → "0%" (không được lẫn với chưa có)', () => {
    expect(formatOpsRate(0, 'accept', [])).toBe('0%');
  });
});

describe('SPEC 8 — không có hàm nào ở tầng format dùng để xếp hạng/chặn', () => {
  it('sao thấp vẫn format bình thường, không trả cờ ẩn/chặn', () => {
    expect(formatDisplayStars(1.1)).toBe('1.1');
    expect(formatScore(3)).toBe('3');
  });
});
