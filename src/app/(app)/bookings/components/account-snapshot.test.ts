import { describe, it, expect } from 'vitest';
import { currentAccountIfDiffers } from './account-snapshot';
import type { Booking } from '@/lib/types';

const make = (
  senderInfo: Booking['senderInfo'],
  customer: Booking['customer'],
) => ({ senderInfo, customer }) as Pick<Booking, 'senderInfo' | 'customer'>;

const acc = (fullName: string, phone: string) => ({ id: 'c1', fullName, phone });

describe('currentAccountIfDiffers', () => {
  it('SĐT bản chụp khác SĐT tài khoản hiện tại → trả tài khoản hiện tại', () => {
    expect(
      currentAccountIfDiffers(make({ name: 'Ngọc(híp)', phone: '0375588908' }, acc('Vân anh', '0867283359'))),
    ).toEqual({ name: 'Vân anh', phone: '0867283359' });
  });

  it('cùng số, khác định dạng (+84 / khoảng trắng) → null', () => {
    expect(currentAccountIfDiffers(make({ name: 'A', phone: '+84867283359' }, acc('A', '0867283359')))).toBeNull();
    expect(currentAccountIfDiffers(make({ name: 'A', phone: '0867 283 359' }, acc('A', '0867283359')))).toBeNull();
  });

  it('cùng số, chỉ khác tên → null (tránh nhiễu)', () => {
    expect(currentAccountIfDiffers(make({ name: 'Khách lẻ', phone: '0867283359' }, acc('Vân anh', '0867283359')))).toBeNull();
  });

  it('thiếu bản chụp hoặc SĐT bản chụp rỗng → null', () => {
    expect(currentAccountIfDiffers(make(null, acc('Vân anh', '0867283359')))).toBeNull();
    expect(currentAccountIfDiffers(make(undefined, acc('Vân anh', '0867283359')))).toBeNull();
    expect(currentAccountIfDiffers(make({ name: 'A', phone: '' }, acc('Vân anh', '0867283359')))).toBeNull();
  });

  it('thiếu tài khoản (xoá mềm → null) → null', () => {
    expect(currentAccountIfDiffers(make({ name: 'A', phone: '0375588908' }, null))).toBeNull();
  });

  it('SĐT tài khoản không phải SĐT VN hợp lệ (SOCIAL-…) → null', () => {
    expect(
      currentAccountIfDiffers(make({ name: 'A', phone: '0375588908' }, acc('A', 'SOCIAL-1777335103206-205'))),
    ).toBeNull();
  });

  it('bản chụp SOCIAL-…, tài khoản đã có số thật → trả tài khoản', () => {
    expect(
      currentAccountIfDiffers(make({ name: 'A', phone: 'SOCIAL-1777335103206-205' }, acc('A', '0375588908'))),
    ).toEqual({ name: 'A', phone: '0375588908' });
  });

  it('tên tài khoản rỗng → "(không tên)"', () => {
    expect(currentAccountIfDiffers(make({ name: 'A', phone: '0375588908' }, acc('  ', '0867283359')))).toEqual({
      name: '(không tên)',
      phone: '0867283359',
    });
  });
});
