import { describe, it, expect } from 'vitest';
import { voucherCampaignSchema } from './retention-campaign';

/**
 * Validate form chiến dịch tặng mã. Đây là cấu hình DÍNH TIỀN: một giá trị vô lý lọt
 * xuống DB sẽ tặng ra hàng loạt mã sai ngay lập tức, và không có bước duyệt nào ở
 * giữa. Backend cũng chặn (VoucherCampaignService) — lớp ở đây là để admin biết ngay
 * tại ô nhập, thay vì bấm Lưu rồi mới thấy toast đỏ.
 */

const valid = {
  isActive: true,
  discountType: 'FIXED' as const,
  discountValue: 20000,
  maxDiscount: null,
  minOrderValue: 0,
  validDays: 14,
  serviceTypes: [],
  maxGrantsPerUser: null,
  maxGrantsPerUserWindowDays: null,
  maxTotalGrants: null,
  minNotifyGapMinutes: 60,
  popupGrantedTitle: 'VIGO TẶNG BẠN',
  popupGrantedBody: 'Giảm {{gia_tri}} — dùng trước {{han_dung}}.',
  popupReminderTitle: 'CÒN ƯU ĐÃI',
  popupReminderBody: 'Giảm {{gia_tri}}.',
  pushTitle: 'Vigo tặng bạn ưu đãi!',
  pushBody: 'Giảm {{gia_tri}}.',
};

/** Lỗi ở đúng field nào — để test không xanh nhầm vì một lỗi khác. */
function errorPaths(input: unknown): string[] {
  const res = voucherCampaignSchema.safeParse(input);
  return res.success ? [] : res.error.issues.map((i) => i.path.join('.'));
}

describe('voucherCampaignSchema', () => {
  it('cấu hình hợp lệ thì qua', () => {
    expect(voucherCampaignSchema.safeParse(valid).success).toBe(true);
  });

  it('hạn dùng phải > 0 ngày', () => {
    expect(errorPaths({ ...valid, validDays: 0 })).toContain('validDays');
    expect(errorPaths({ ...valid, validDays: -3 })).toContain('validDays');
  });

  it('hạn dùng phải là số nguyên', () => {
    expect(errorPaths({ ...valid, validDays: 1.5 })).toContain('validDays');
  });

  it('giá trị giảm phải > 0', () => {
    expect(errorPaths({ ...valid, discountValue: 0 })).toContain('discountValue');
  });

  // Giảm theo % không trần = mức giảm trôi theo giá chuyến, tức ký một tờ séc trắng.
  it('kiểu % BẮT BUỘC có giảm tối đa', () => {
    const paths = errorPaths({
      ...valid, discountType: 'PERCENTAGE', discountValue: 20, maxDiscount: null,
    });
    expect(paths).toContain('maxDiscount');
  });

  it('kiểu % có giảm tối đa thì qua', () => {
    const res = voucherCampaignSchema.safeParse({
      ...valid, discountType: 'PERCENTAGE', discountValue: 20, maxDiscount: 30000,
    });
    expect(res.success).toBe(true);
  });

  it('kiểu % không được vượt 100', () => {
    const paths = errorPaths({
      ...valid, discountType: 'PERCENTAGE', discountValue: 150, maxDiscount: 30000,
    });
    expect(paths).toContain('discountValue');
  });

  it('kiểu FIXED không đòi giảm tối đa', () => {
    expect(voucherCampaignSchema.safeParse({ ...valid, maxDiscount: null }).success).toBe(true);
  });

  // Ô số để trống nghĩa là "TẮT TRẦN", không phải 0. `z.coerce.number()('')` cho ra 0,
  // mà 0 lại trượt `.positive()` — bẫy này đã làm hỏng nút Lưu ở form voucher cũ.
  it('ô trần để trống → null (tắt trần), không phải 0 hay lỗi', () => {
    const res = voucherCampaignSchema.safeParse({
      ...valid, maxGrantsPerUser: '', maxTotalGrants: '', maxGrantsPerUserWindowDays: '',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.maxGrantsPerUser).toBeNull();
      expect(res.data.maxTotalGrants).toBeNull();
      expect(res.data.maxGrantsPerUserWindowDays).toBeNull();
    }
  });

  it('ô giảm tối đa để trống → null, không phải 0', () => {
    const res = voucherCampaignSchema.safeParse({ ...valid, maxDiscount: '' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.maxDiscount).toBeNull();
  });

  it('trần đặt giá trị thì phải là số nguyên dương', () => {
    expect(errorPaths({ ...valid, maxTotalGrants: 0 })).toContain('maxTotalGrants');
    expect(errorPaths({ ...valid, maxGrantsPerUser: -1 })).toContain('maxGrantsPerUser');
  });

  // 0 = báo mọi lần, hợp lệ. Chỉ số âm mới sai.
  it('khoảng cách báo chấp nhận 0 nhưng không chấp nhận số âm', () => {
    expect(voucherCampaignSchema.safeParse({ ...valid, minNotifyGapMinutes: 0 }).success).toBe(true);
    expect(errorPaths({ ...valid, minNotifyGapMinutes: -5 })).toContain('minNotifyGapMinutes');
  });

  it('câu chữ không được để trống — popup rỗng là popup vô nghĩa', () => {
    expect(errorPaths({ ...valid, popupGrantedTitle: '' })).toContain('popupGrantedTitle');
    expect(errorPaths({ ...valid, pushBody: '' })).toContain('pushBody');
  });

  it('chuỗi số từ <input type="number"> vẫn ép được về number', () => {
    const res = voucherCampaignSchema.safeParse({
      ...valid, discountValue: '25000', validDays: '7', minOrderValue: '50000',
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.discountValue).toBe(25000);
      expect(res.data.validDays).toBe(7);
    }
  });
});
