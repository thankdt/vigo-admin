import { describe, it, expect } from 'vitest';
import {
  BOOKING_CALL_STATUS_LABEL,
  BOOKING_CALL_STATUS_ORDER,
  DRIVER_CALL_TYPE_LABEL,
  DRIVER_CALL_TYPE_ORDER,
  isContactOutcome,
  outcomeBadgeClass,
  outcomeLabel,
} from './cskh-call-labels';

describe('bộ nhãn mốc CSKH', () => {
  it('mọi loại của tài xế đều có nhãn, thứ tự phủ đúng bộ khoá', () => {
    expect([...DRIVER_CALL_TYPE_ORDER].sort()).toEqual(Object.keys(DRIVER_CALL_TYPE_LABEL).sort());
    for (const t of DRIVER_CALL_TYPE_ORDER) expect(DRIVER_CALL_TYPE_LABEL[t]).toBeTruthy();
  });

  it('mọi trạng thái gọi khách đều có nhãn, thứ tự phủ đúng bộ khoá', () => {
    expect([...BOOKING_CALL_STATUS_ORDER].sort()).toEqual(
      Object.keys(BOOKING_CALL_STATUS_LABEL).sort(),
    );
  });

  it('loại liên hệ đứng trước loại ghi chú trong dropdown', () => {
    expect(DRIVER_CALL_TYPE_ORDER.slice(0, 3)).toEqual(['CALLED', 'UNREACHED', 'CALLBACK']);
  });
});

describe('isContactOutcome — mirror của backend', () => {
  it('"Nhận gọi" (CLAIMED) KHÔNG phải cuộc gọi thật', () => {
    expect(isContactOutcome('BOOKING', 'CLAIMED')).toBe(false);
  });

  it('gọi khách: chỉ CALLED/UNREACHED được tính', () => {
    expect(isContactOutcome('BOOKING', 'CALLED')).toBe(true);
    expect(isContactOutcome('BOOKING', 'UNREACHED')).toBe(true);
  });

  it('gọi tài xế: CALLBACK được tính; HANDLED/REMINDER/NOTE thì không', () => {
    expect(isContactOutcome('DRIVER', 'CALLBACK')).toBe(true);
    expect(isContactOutcome('DRIVER', 'HANDLED')).toBe(false);
    expect(isContactOutcome('DRIVER', 'REMINDER')).toBe(false);
    expect(isContactOutcome('DRIVER', 'NOTE')).toBe(false);
  });

  it('CALLBACK chỉ tồn tại ở luồng tài xế — không được tính nhầm cho luồng khách', () => {
    expect(isContactOutcome('BOOKING', 'CALLBACK')).toBe(false);
  });

  it('mã lạ (backend thêm loại mới) mặc định KHÔNG tính là cuộc gọi', () => {
    expect(isContactOutcome('DRIVER', 'SOMETHING_NEW')).toBe(false);
    expect(isContactOutcome('BOOKING', 'SOMETHING_NEW')).toBe(false);
  });
});

describe('outcomeLabel', () => {
  it('cùng mã CALLED nhưng đọc theo đúng nguồn', () => {
    expect(outcomeLabel('BOOKING', 'CALLED')).toBe('Gọi được');
    expect(outcomeLabel('DRIVER', 'CALLED')).toBe('Gọi được');
  });

  it('mã chỉ có ở một nguồn thì nguồn kia trả về chính mã đó, không crash', () => {
    expect(outcomeLabel('DRIVER', 'CLAIMED')).toBe('CLAIMED');
    expect(outcomeLabel('BOOKING', 'NOTE')).toBe('NOTE');
  });

  it('mã lạ trả nguyên mã thay vì undefined', () => {
    expect(outcomeLabel('DRIVER', 'WAT')).toBe('WAT');
  });
});

describe('outcomeBadgeClass', () => {
  it('gọi được = xanh, không nghe = đỏ, mã lạ = trung tính', () => {
    expect(outcomeBadgeClass('CALLED')).toContain('emerald');
    expect(outcomeBadgeClass('UNREACHED')).toContain('red');
    expect(outcomeBadgeClass('WAT')).toContain('muted');
  });
});
