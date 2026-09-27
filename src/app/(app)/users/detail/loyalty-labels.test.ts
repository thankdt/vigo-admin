import { describe, it, expect } from 'vitest';
import {
  tierLabel,
  loyaltyHistoryTypeLabel,
  pointKindLabel,
  voucherStateLabel,
  voucherStateVariant,
} from './loyalty-labels';

describe('tierLabel', () => {
  it('dịch 4 hạng sang tiếng Việt', () => {
    expect(tierLabel('MEMBER')).toBe('Thành viên');
    expect(tierLabel('SILVER')).toBe('Bạc');
    expect(tierLabel('GOLD')).toBe('Vàng');
    expect(tierLabel('DIAMOND')).toBe('Kim cương');
  });

  it('key lạ hiện nguyên văn, không throw', () => {
    expect(tierLabel('PLATINUM')).toBe('PLATINUM');
  });

  it('null/undefined -> gạch ngang', () => {
    expect(tierLabel(null)).toBe('—');
    expect(tierLabel(undefined)).toBe('—');
  });
});

describe('loyaltyHistoryTypeLabel', () => {
  it('dịch đủ 4 loại ghi trong loyalty_history (kể cả EXPIRE)', () => {
    expect(loyaltyHistoryTypeLabel('EARN')).toBe('Cộng');
    expect(loyaltyHistoryTypeLabel('REDEEM')).toBe('Đổi voucher');
    expect(loyaltyHistoryTypeLabel('ADJUST')).toBe('Điều chỉnh');
    expect(loyaltyHistoryTypeLabel('EXPIRE')).toBe('Hết hạn');
  });

  it('key lạ hiện nguyên văn', () => {
    expect(loyaltyHistoryTypeLabel('WEIRD')).toBe('WEIRD');
  });
});

describe('pointKindLabel', () => {
  it('REWARD -> Vcoin, TIER -> Điểm hạng', () => {
    expect(pointKindLabel('REWARD')).toBe('Vcoin');
    expect(pointKindLabel('TIER')).toBe('Điểm hạng');
  });
});

describe('voucherStateLabel / voucherStateVariant', () => {
  it('dịch đủ 6 trạng thái voucher', () => {
    expect(voucherStateLabel('GIFT')).toBe('Voucher tặng');
    expect(voucherStateLabel('FREE')).toBe('Chưa dùng');
    expect(voucherStateLabel('HELD')).toBe('Đang giữ cho chuyến');
    expect(voucherStateLabel('USED')).toBe('Đã dùng');
    expect(voucherStateLabel('BURNED')).toBe('Đã huỷ (chuyến bị huỷ sau hoàn thành)');
    expect(voucherStateLabel('EXPIRED')).toBe('Hết hạn');
  });

  it('mỗi trạng thái có một biến thể badge hợp lệ', () => {
    const variants = ['default', 'secondary', 'destructive', 'outline'];
    for (const s of ['GIFT', 'FREE', 'HELD', 'USED', 'BURNED', 'EXPIRED']) {
      expect(variants).toContain(voucherStateVariant(s));
    }
  });

  it('key lạ vẫn trả biến thể mặc định, không throw', () => {
    expect(voucherStateVariant('WEIRD')).toBe('outline');
    expect(voucherStateLabel('WEIRD')).toBe('WEIRD');
  });
});
