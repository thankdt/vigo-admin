import { describe, it, expect } from 'vitest';
import {
  commissionRateWarning,
  WARNING_STANDARD_RATE,
  WARNING_EXAMPLE_HTX_RATE,
  WARNING_EXAMPLE_GROSS,
} from './commission-warning';

describe('commissionRateWarning — chiều "thấp hơn chuẩn" (VIGO chịu thiệt)', () => {
  it('tài HTX 5%, mức riêng 0% ⇒ cảnh báo nêu lỗ 50.000đ/chuyến 1 triệu', () => {
    const w = commissionRateWarning(0, { htxCommissionRate: 0.05 });
    expect(w).not.toBeNull();
    expect(w!.direction).toBe('below');
    expect(w!.message).toContain('50.000đ');
    expect(w!.message).toContain('1.000.000đ');
  });

  it('mức riêng thấp hơn chuẩn nhưng vẫn cao hơn % HTX ⇒ chỉ báo doanh thu bỏ qua, KHÔNG có lỗ tiền mặt', () => {
    // chuẩn 20%, HTX 5%, riêng 10% > 5% ⇒ forgone > 0 nhưng cashLoss = 0.
    const w = commissionRateWarning(0.1, { htxCommissionRate: 0.05 });
    expect(w).not.toBeNull();
    expect(w!.direction).toBe('below');
    expect(w!.message).toContain('100.000đ'); // forgone = (0.2-0.1)*1.000.000
    expect(w!.message).not.toContain('lỗ tiền mặt');
  });
});

describe('commissionRateWarning — chiều "cao hơn chuẩn" (tài xế chịu thiệt)', () => {
  it('mức riêng 50% (giá trị hợp lệ tới 100%) ⇒ cảnh báo tài xế bị thu thêm, nêu số cụ thể', () => {
    const w = commissionRateWarning(0.5);
    expect(w).not.toBeNull();
    expect(w!.direction).toBe('above');
    expect(w!.message).toContain('TÀI XẾ');
    // overcharge = (0.5 - 0.2) * 1.000.000 = 300.000
    expect(w!.message).toContain('300.000đ');
  });
});

describe('commissionRateWarning — không cảnh báo', () => {
  it('mức riêng = mức chuẩn ⇒ không cảnh báo', () => {
    expect(commissionRateWarning(WARNING_STANDARD_RATE)).toBeNull();
    expect(commissionRateWarning(0.3, { standardRate: 0.3 })).toBeNull();
  });

  it('rate null/undefined (chưa set, dùng mức chung) ⇒ không cảnh báo', () => {
    expect(commissionRateWarning(null)).toBeNull();
    expect(commissionRateWarning(undefined)).toBeNull();
  });
});

describe('hằng số minh hoạ', () => {
  it('khớp ví dụ chốt trong spec (P=1.000.000, R=0,2, h=0,05)', () => {
    expect(WARNING_EXAMPLE_GROSS).toBe(1_000_000);
    expect(WARNING_STANDARD_RATE).toBe(0.2);
    expect(WARNING_EXAMPLE_HTX_RATE).toBe(0.05);
  });
});
