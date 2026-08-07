import { describe, it, expect } from 'vitest';
import {
  NO_RATING_LABEL,
  EMPTY_TEXT,
  driverNameText,
  driverPhoneText,
  ratingCountText,
  formatVnDateTime,
  lastRatingText,
  ratingStarsText,
  ratingStarsValue,
  isLowRating,
  excludeReasonText,
  notCountedLabel,
  serviceTypeText,
  formatDisplayStars,
  hasDisplayStars,
} from './reputation-labels';

/**
 * LUẬT 2 ("null KHÔNG PHẢI 0 sao") ở TẦNG BẢNG XẾP HẠNG.
 * Bảng này là nơi 11.735/11.736 tài xế có displayStars = null — sai ở đây là
 * dán nhãn "0 sao" lên gần như toàn bộ đội tài.
 */
describe('sao công khai trong bảng xếp hạng — null KHÔNG PHẢI 0', () => {
  const cases: Array<[string, number | null | undefined]> = [
    ['null (chưa đủ đánh giá)', null],
    ['undefined (backend cũ thiếu field)', undefined],
    ['0 (placeholder — khách chỉ chấm được 1..5)', 0],
    ['số âm', -1],
    ['NaN', NaN],
  ];

  for (const [label, value] of cases) {
    it(`${label} → "${NO_RATING_LABEL}", KHÔNG hiện "0.0"`, () => {
      const text = formatDisplayStars(value);
      expect(text).toBe(NO_RATING_LABEL);
      expect(text).not.toContain('0.0');
      // Cổng vẽ hàng sao phải NHẤT QUÁN với chữ — nếu không sẽ ra
      // "Chưa có đánh giá" nằm cạnh 5 ngôi sao rỗng, tức "0 sao".
      expect(hasDisplayStars(value)).toBe(false);
    });
  }

  it('có sao thật → hiện số, và cổng vẽ sao mở', () => {
    expect(formatDisplayStars(4.44)).toBe('4.4');
    expect(hasDisplayStars(4.44)).toBe(true);
  });

  it('> 5 bị kẹp về "5.0" (thang sao là 1..5)', () => {
    expect(formatDisplayStars(7.2)).toBe('5.0');
    expect(hasDisplayStars(7.2)).toBe(true);
  });
});

describe('ratingCountText — ở ĐÂY 0 là số thật, khác displayStars', () => {
  it('0 hiện "0" (đếm được: tài này chưa ai đánh giá)', () => {
    expect(ratingCountText(0)).toBe('0');
  });

  it('số thường', () => {
    expect(ratingCountText(12)).toBe('12');
  });

  it('null / undefined / NaN / âm → "—" (không bịa số 0)', () => {
    expect(ratingCountText(null)).toBe(EMPTY_TEXT);
    expect(ratingCountText(undefined)).toBe(EMPTY_TEXT);
    expect(ratingCountText(NaN)).toBe(EMPTY_TEXT);
    expect(ratingCountText(-3)).toBe(EMPTY_TEXT);
  });

  it('> 5 không bị kẹp (đây là số lượt, không phải sao)', () => {
    expect(ratingCountText(9999)).toBe('9999');
  });
});

describe('ratingStarsText — một phiếu chấm cụ thể (1..5)', () => {
  it('sao thường', () => {
    expect(ratingStarsText(3)).toBe('3★');
    expect(ratingStarsText(5)).toBe('5★');
  });

  it('null / undefined / NaN → "—", KHÔNG "NaN★"', () => {
    expect(ratingStarsText(null)).toBe(EMPTY_TEXT);
    expect(ratingStarsText(undefined)).toBe(EMPTY_TEXT);
    expect(ratingStarsText(NaN)).toBe(EMPTY_TEXT);
  });

  it('0 và số âm bị kẹp lên 1 — phiếu chấm luôn ≥1 sao', () => {
    expect(ratingStarsText(0)).toBe('1★');
    expect(ratingStarsText(-4)).toBe('1★');
  });

  it('> 5 bị kẹp về 5, không vẽ 12 sao', () => {
    expect(ratingStarsText(12)).toBe('5★');
  });
});

describe('ratingStarsValue — số sao đặc để tô màu', () => {
  it('bám 0..5 với mọi input hỏng', () => {
    expect(ratingStarsValue(null)).toBe(0);
    expect(ratingStarsValue(undefined)).toBe(0);
    expect(ratingStarsValue(NaN)).toBe(0);
    expect(ratingStarsValue(-2)).toBe(0);
    expect(ratingStarsValue(99)).toBe(5);
    expect(ratingStarsValue(4)).toBe(4);
  });
});

describe('isLowRating — CHỈ để tô màu cảnh báo', () => {
  it('≤3 sao là thấp', () => {
    expect(isLowRating(1)).toBe(true);
    expect(isLowRating(3)).toBe(true);
  });

  it('4–5 sao không thấp', () => {
    expect(isLowRating(4)).toBe(false);
    expect(isLowRating(5)).toBe(false);
  });

  it('thiếu dữ liệu KHÔNG bị coi là thấp (không vu cho tài xế)', () => {
    expect(isLowRating(null)).toBe(false);
    expect(isLowRating(undefined)).toBe(false);
    expect(isLowRating(NaN)).toBe(false);
  });
});

describe('nhãn "không tính vào điểm"', () => {
  it('isCounted = false + mã đã biết → nhãn kèm lý do tiếng Việt', () => {
    expect(notCountedLabel({ isCounted: false, excludeReason: 'SELF_AGENT' })).toBe(
      'Không tính vào điểm · Khách tự đặt hộ (đại lý tự đánh giá)',
    );
  });

  it('isCounted = false + mã LẠ → hiện nguyên mã (còn tra được)', () => {
    expect(notCountedLabel({ isCounted: false, excludeReason: 'FUTURE_CODE' })).toBe(
      'Không tính vào điểm · FUTURE_CODE',
    );
  });

  it('isCounted = false mà thiếu lý do → vẫn gắn nhãn, không nuốt luôn', () => {
    expect(notCountedLabel({ isCounted: false, excludeReason: null })).toBe('Không tính vào điểm');
    expect(notCountedLabel({ isCounted: false, excludeReason: '  ' })).toBe('Không tính vào điểm');
  });

  it('isCounted = true → KHÔNG gắn nhãn', () => {
    expect(notCountedLabel({ isCounted: true, excludeReason: null })).toBeNull();
  });

  it('isCounted thiếu (undefined/null) → KHÔNG gắn nhãn loại trừ', () => {
    // Chỉ `=== false` mới là bị loại. Suy từ falsy sẽ dán nhãn "không tính vào
    // điểm" lên đánh giá hợp lệ khi backend cũ chưa trả field.
    expect(notCountedLabel({})).toBeNull();
    expect(notCountedLabel({ isCounted: undefined })).toBeNull();
    expect(notCountedLabel({ isCounted: null })).toBeNull();
    // …kể cả khi có sẵn excludeReason lạc.
    expect(notCountedLabel({ excludeReason: 'SELF_AGENT' })).toBeNull();
  });

  it('excludeReasonText: rỗng → null', () => {
    expect(excludeReasonText(null)).toBeNull();
    expect(excludeReasonText('')).toBeNull();
    expect(excludeReasonText('   ')).toBeNull();
  });
});

describe('serviceTypeText', () => {
  it('mã đã biết → tiếng Việt', () => {
    expect(serviceTypeText('CARPOOL')).toBe('Ghép xe');
    expect(serviceTypeText('RIDE')).toBe('Bao xe');
    expect(serviceTypeText('DELIVERY')).toBe('Giao hàng');
  });

  it('mã lạ → hiện nguyên mã (còn tra được)', () => {
    expect(serviceTypeText('FUTURE_SERVICE')).toBe('FUTURE_SERVICE');
  });

  it('rỗng / null → null (nơi gọi bỏ hẳn badge, không hiện badge trống)', () => {
    expect(serviceTypeText(null)).toBeNull();
    expect(serviceTypeText(undefined)).toBeNull();
    expect(serviceTypeText('  ')).toBeNull();
  });
});

describe('tên / SĐT', () => {
  it('thiếu tên → "Không tên"', () => {
    expect(driverNameText(null)).toBe('Không tên');
    expect(driverNameText('')).toBe('Không tên');
    expect(driverNameText('   ')).toBe('Không tên');
  });

  it('thiếu SĐT → "—", không hiện "null"', () => {
    expect(driverPhoneText(null)).toBe(EMPTY_TEXT);
    expect(driverPhoneText(undefined)).toBe(EMPTY_TEXT);
    expect(driverPhoneText('')).toBe(EMPTY_TEXT);
  });

  it('có dữ liệu thì cắt khoảng trắng thừa', () => {
    expect(driverNameText('  Nguyễn Văn A  ')).toBe('Nguyễn Văn A');
    expect(driverPhoneText(' 0900000001 ')).toBe('0900000001');
  });
});

describe('thời gian — LUÔN giờ VN (+7), độc lập TZ trình duyệt', () => {
  it('mốc UTC được quy về giờ VN', () => {
    // 2026-08-01T03:00:00Z = 10:00 ngày 01/08 giờ VN.
    expect(formatVnDateTime('2026-08-01T03:00:00.000Z')).toContain('10:00');
    expect(formatVnDateTime('2026-08-01T03:00:00.000Z')).toContain('01/08/2026');
  });

  it('qua nửa đêm VN: 2026-07-31T17:30Z = 00:30 ngày 01/08 VN (không lùi ngày)', () => {
    const text = formatVnDateTime('2026-07-31T17:30:00.000Z');
    expect(text).toContain('00:30');
    expect(text).toContain('01/08/2026');
  });

  it('null / chuỗi hỏng → "—", KHÔNG "Invalid Date"', () => {
    expect(formatVnDateTime(null)).toBe(EMPTY_TEXT);
    expect(formatVnDateTime(undefined)).toBe(EMPTY_TEXT);
    expect(formatVnDateTime('rác')).toBe(EMPTY_TEXT);
    expect(formatVnDateTime('')).toBe(EMPTY_TEXT);
  });
});

describe('lastRatingText — chưa từng có đánh giá', () => {
  it('null → "Chưa có đánh giá" (không phải "—" trống nghĩa)', () => {
    expect(lastRatingText(null)).toBe(NO_RATING_LABEL);
    expect(lastRatingText(undefined)).toBe(NO_RATING_LABEL);
  });

  it('có mốc → hiện giờ VN', () => {
    expect(lastRatingText('2026-08-01T03:00:00.000Z')).toContain('01/08/2026');
  });
});
