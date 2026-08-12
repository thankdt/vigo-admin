import { describe, it, expect } from 'vitest';
import {
  REFERRAL_EVENT_LABEL,
  DRIVER_TEAM_EVENT_LABEL,
  NOTIFICATION_STATUS_LABEL,
  unknownEnumLabel,
} from './enum-labels';

/**
 * Enum thô lọt ra badge là lỗi IM LẶNG: không ai phát hiện cho tới khi admin hỏi
 * "CLAWBACK là gì?". Các test dưới đây khoá hai thứ:
 *   1. mỗi giá trị enum của backend đều có nhãn tiếng Việt
 *   2. giá trị lạ KHÔNG được in thô — phải bọc thành "Không rõ (MÃ)"
 */

// Chép từ backend: referral-event.entity.ts:11, driver-team.enums.ts:17
const REFERRAL_EVENT_TYPES = ['SIGNUP', 'TRIP', 'CLAWBACK'];
const DRIVER_TEAM_EVENT_TYPES = [
  'STAGE_CHANGE',
  'CALL',
  'NOTE',
  'ASSIGN',
  'FOLLOW_UP',
];
const NOTIFICATION_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED', 'FAILED'];

const VN_DIACRITICS =
  /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;

describe.each([
  ['REFERRAL_EVENT_LABEL', REFERRAL_EVENT_LABEL, REFERRAL_EVENT_TYPES],
  ['DRIVER_TEAM_EVENT_LABEL', DRIVER_TEAM_EVENT_LABEL, DRIVER_TEAM_EVENT_TYPES],
  ['NOTIFICATION_STATUS_LABEL', NOTIFICATION_STATUS_LABEL, NOTIFICATION_STATUSES],
])('%s', (_name, labelFn, values) => {
  it.each(values)('có nhãn tiếng Việt cho %s', (value) => {
    const label = (labelFn as (v: string) => string)(value);
    expect(label).not.toBe(value);
    expect(label).toMatch(VN_DIACRITICS);
  });

  it('giá trị lạ của backend không bị in thô lên badge', () => {
    // Backend thêm enum mới mà admin chưa cập nhật là chuyện chắc xảy ra.
    // Khi đó admin phải đọc được "chưa hỗ trợ" chứ không phải một mã lạ.
    const label = (labelFn as (v: string) => string)('SOME_NEW_ENUM');
    expect(label).toContain('Không rõ');
    // Vẫn giữ mã trong ngoặc để dev trace được.
    expect(label).toContain('SOME_NEW_ENUM');
  });
});

describe('unknownEnumLabel', () => {
  it('bọc mã lạ để admin đọc được mà dev vẫn trace được', () => {
    expect(unknownEnumLabel('FOO_BAR')).toBe('Không rõ (FOO_BAR)');
  });

  it('chịu được giá trị rỗng/null mà không in "undefined"', () => {
    for (const bad of ['', null, undefined]) {
      const label = unknownEnumLabel(bad as any);
      expect(label).not.toContain('undefined');
      expect(label).not.toContain('null');
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
