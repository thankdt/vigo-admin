import { isValidVnPhoneOrEmpty, normalizeVnPhone, sameVnPhone } from '@/lib/phone';
import type { Booking } from '@/lib/types';

/**
 * Tài khoản đặt chuyến HIỆN TẠI — chỉ khi SĐT của nó khác SĐT lưu trên chuyến.
 *
 * `senderInfo` là bản chụp tên/SĐT tài khoản LÚC ĐẶT; khách được đổi SĐT/tên sau đó.
 * Bảng chuyến hiện bản chụp, còn ô tìm kiếm khớp cả tài khoản hiện tại — thiếu dòng
 * này thì admin tìm số A mà thấy số B, tưởng lọc sai.
 *
 * Chỉ so SĐT (đã chuẩn hoá +84/khoảng trắng): khác tên cùng số không gây nhầm khi tìm
 * theo số, hiện ra chỉ thêm nhiễu. SĐT tài khoản không hợp lệ (SOCIAL-…) → không hiện.
 */
export function currentAccountIfDiffers(
  b: Pick<Booking, 'senderInfo' | 'customer'>,
): { name: string; phone: string } | null {
  const snapshotPhone = b.senderInfo?.phone;
  const accountPhone = b.customer?.phone;
  if (!snapshotPhone || !accountPhone) return null;
  if (!normalizeVnPhone(accountPhone) || !isValidVnPhoneOrEmpty(accountPhone)) return null;
  if (sameVnPhone(snapshotPhone, accountPhone)) return null;
  return {
    name: b.customer?.fullName?.trim() || '(không tên)',
    phone: accountPhone,
  };
}
