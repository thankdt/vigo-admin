import { describe, expect, it } from 'vitest';
import { cancelAlertSignal, cancelledByLabel, leakageSignal } from './penalty-labels';

/**
 * Ô "Dấu hiệu" là thứ người soát dựa vào để quyết định TRỪ TIỀN của tài xế, nên nó
 * không được để lọt mã kỹ thuật (LOW / HIGH / rule A / "(thử)") ra ngoài.
 */
describe('leakageSignal', () => {
  it('không nhả mã kỹ thuật ra nhãn', () => {
    for (const v of ['PICKUP_DROPOFF_UNEXPLAINED', 'PICKUP_ONLY', 'WENT_DARK']) {
      const s = leakageSignal(v)!;
      expect(s).not.toBeNull();
      expect(s.label).not.toMatch(/HIGH|LOW|PICKUP|DARK|_/);
      expect(s.hint.length).toBeGreaterThan(30); // có giải thích thật, không phải nhãn lặp lại
    }
  });

  it('nói thẳng dấu hiệu mạnh nhất là chở khách ngoài app', () => {
    const s = leakageSignal('PICKUP_DROPOFF_UNEXPLAINED')!;
    expect(s.label).toMatch(/ngoài app/i);
    expect(s.hint).toMatch(/điểm đón/);
    expect(s.hint).toMatch(/điểm trả/);
  });

  it('phân biệt rõ dấu hiệu yếu, không để admin phạt oan', () => {
    expect(leakageSignal('PICKUP_ONLY')!.hint).toMatch(/yếu|cần hỏi khách/i);
    expect(leakageSignal('WENT_DARK')!.hint).toMatch(/không chứng minh/i);
  });

  it('verdict lạ hoặc rỗng → không hiện gì', () => {
    expect(leakageSignal(null)).toBeNull();
    expect(leakageSignal('SOMETHING_NEW')).toBeNull();
  });
});

describe('cancelAlertSignal', () => {
  const base = { rule: 'A', action: 'SUSPEND', ratePct: null, shadow: false, reason: null };

  it('rule A nói đúng bản chất: khách huỷ ngay sau khi tài nhận', () => {
    const s = cancelAlertSignal(base)!;
    expect(s.label).not.toMatch(/rule|A\b/i);
    expect(s.label).toMatch(/ngay sau khi tài nhận/i);
    expect(s.hint).toMatch(/ngoài ứng dụng/i);
  });

  it('rule B/C kèm luôn tỉ lệ để khỏi phải mở màn khác', () => {
    expect(cancelAlertSignal({ ...base, rule: 'B', ratePct: 62 })!.label).toContain('62%');
    expect(cancelAlertSignal({ ...base, rule: 'C', ratePct: 35 })!.label).toContain('35%');
  });

  it('thiếu tỉ lệ thì không hiện "null%"', () => {
    expect(cancelAlertSignal({ ...base, rule: 'B', ratePct: null })!.label).not.toMatch(/null|undefined|%/);
  });

  // "(thử)" trước đây là mã shadow — admin đọc không hiểu đã khoá hay chưa.
  it('nói rõ hệ thống ĐÃ làm gì, thay cho chữ "(thử)"', () => {
    expect(cancelAlertSignal({ ...base, shadow: true })!.note).toMatch(/CHƯA khoá/);
    expect(cancelAlertSignal({ ...base, action: 'BAN' })!.note).toMatch(/khoá tài khoản/);
    expect(cancelAlertSignal({ ...base, action: 'SUSPEND' })!.note).toMatch(/tạm khoá/);
    expect(cancelAlertSignal({ ...base, action: 'NONE' })!.note).toMatch(/chỉ theo dõi/);
  });

  it('shadow thắng action: mới ghi nhận thì chưa khoá gì cả', () => {
    expect(cancelAlertSignal({ ...base, action: 'BAN', shadow: true })!.note).toMatch(/CHƯA khoá/);
  });

  // `reason` do rule engine sinh, có số liệu thật — quý hơn câu chữ viết tay.
  it('nối lý do kèm số liệu thật vào tooltip', () => {
    const s = cancelAlertSignal({
      ...base,
      reason: 'Rule A: khách huỷ 45 giây sau khi tài nhận (nghi câu kéo)',
    })!;
    expect(s.hint).toContain('45 giây');
  });

  it('không có rule → không hiện gì', () => {
    expect(cancelAlertSignal({ ...base, rule: null })).toBeNull();
    expect(cancelAlertSignal({ ...base, rule: 'Z' })).toBeNull();
  });
});

describe('cancelledByLabel', () => {
  it('dịch vai trò sang tiếng Việt, không rỗng khi thiếu dữ liệu', () => {
    expect(cancelledByLabel('CUSTOMER')).toBe('Khách');
    expect(cancelledByLabel('ADMIN')).toBe('Admin');
    expect(cancelledByLabel(null)).toBe('Không rõ');
  });
});
