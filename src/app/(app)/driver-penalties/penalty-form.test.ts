import { describe, expect, it } from 'vitest';
import type { PenaltyPreview } from '@/lib/api';
import { buildPenaltyBody, canSubmitPenalty, isNoteRequired, type PenaltyFormState } from './penalty-form';

const OK_PREVIEW: PenaltyPreview = {
  amount: 20000,
  willOweDeposit: 0,
  blockedReason: null,
  blockedMessage: null,
};

const base: PenaltyFormState = {
  bookingId: 'b1',
  preview: OK_PREVIEW,
  reasonCode: 'OFF_PLATFORM',
  note: '',
  loading: false,
  submitting: false,
};

describe('canSubmitPenalty', () => {
  it('đủ điều kiện thì cho phạt', () => {
    expect(canSubmitPenalty(base)).toBe(true);
  });

  it('chưa chọn lý do thì không cho', () => {
    expect(canSubmitPenalty({ ...base, reasonCode: '' })).toBe(false);
  });

  it('backend chặn thì không cho, dù đã chọn lý do', () => {
    const blocked: PenaltyPreview = {
      amount: 0,
      willOweDeposit: 0,
      blockedReason: 'ALREADY_PENALIZED',
      blockedMessage: 'Chuyến này đã bị phạt rồi.',
    };
    expect(canSubmitPenalty({ ...base, preview: blocked })).toBe(false);
  });

  it('chưa có preview thì không cho — không đoán số tiền', () => {
    expect(canSubmitPenalty({ ...base, preview: null })).toBe(false);
  });

  it('đang tải hoặc đang gửi thì khoá — chặn double-submit', () => {
    expect(canSubmitPenalty({ ...base, loading: true })).toBe(false);
    expect(canSubmitPenalty({ ...base, submitting: true })).toBe(false);
  });

  it('thiếu bookingId thì không cho', () => {
    expect(canSubmitPenalty({ ...base, bookingId: null })).toBe(false);
  });

  it('lý do Khác mà ghi chú trống (kể cả toàn khoảng trắng) thì không cho', () => {
    expect(canSubmitPenalty({ ...base, reasonCode: 'OTHER', note: '' })).toBe(false);
    expect(canSubmitPenalty({ ...base, reasonCode: 'OTHER', note: '   ' })).toBe(false);
  });

  it('lý do Khác có ghi chú thì cho', () => {
    expect(canSubmitPenalty({ ...base, reasonCode: 'OTHER', note: 'chở khách quen' })).toBe(true);
  });

  // Ví sẽ âm là CẢNH BÁO, không phải điều kiện chặn: đó chính là cơ chế cưỡng chế
  // (tài xế phải nạp bù mới nhận chuyến), không phải lỗi.
  it('ví sẽ âm vẫn cho phạt', () => {
    expect(canSubmitPenalty({ ...base, preview: { ...OK_PREVIEW, willOweDeposit: 50000 } })).toBe(
      true,
    );
  });
});

describe('isNoteRequired', () => {
  it('chỉ bắt buộc với lý do Khác', () => {
    expect(isNoteRequired('OTHER')).toBe(true);
    for (const r of ['OFF_PLATFORM', 'NO_SHOW', 'FORCED_CANCEL', 'FAKE_TRIP'] as const) {
      expect(isNoteRequired(r)).toBe(false);
    }
    expect(isNoteRequired('')).toBe(false);
  });
});

describe('buildPenaltyBody', () => {
  it('bỏ hẳn ghi chú khi trống, không gửi chuỗi rỗng', () => {
    expect(buildPenaltyBody('b1', 'NO_SHOW', '   ', 'PENALTY_PAGE')).toEqual({
      bookingId: 'b1',
      reasonCode: 'NO_SHOW',
      source: 'PENALTY_PAGE',
    });
  });

  it('cắt khoảng trắng thừa của ghi chú', () => {
    expect(buildPenaltyBody('b1', 'OTHER', '  khách xác nhận  ', 'LEAKAGE_REVIEW')).toEqual({
      bookingId: 'b1',
      reasonCode: 'OTHER',
      source: 'LEAKAGE_REVIEW',
      note: 'khách xác nhận',
    });
  });

  it('nguồn phạt đi theo màn gọi dialog', () => {
    expect(buildPenaltyBody('b1', 'NO_SHOW', '', 'CANCEL_REVIEW').source).toBe('CANCEL_REVIEW');
  });
});
