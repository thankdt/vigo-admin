'use client';

import * as React from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { revealCrmCustomerPhone, type CrmAccessSurface } from '@/lib/api';

/**
 * Ô hiển thị SĐT khách ở hai bề mặt TRA CỨU TUỲ Ý của admin (`/users` danh bạ và
 * `/users/detail`) — spec §11 rủi ro #8, user chốt 2026-08-17.
 *
 * BACKEND mới là chỗ che (`users/admin/list` + `users/admin/:id` trả chuỗi đã che cho
 * `role === 'USER'`). Component này KHÔNG tự che: che ở FE thì số vẫn nằm trong response,
 * mở DevTools là đọc được — biện pháp hình thức.
 *
 * 🚨 Nút "Hiện số" chỉ mọc khi chuỗi ĐANG BỊ CHE (có dấu `*`). Nhờ vậy dòng của tài xế /
 * chủ HTX / admin — backend cố ý KHÔNG che vì `/roles`, gán chủ HTX và tuyển đại lý cần số
 * thật — không mọc một cái nút chẳng làm gì.
 *
 * Số đã mở CHỈ sống trong phiên xem hiện tại: không lưu, không cache, điều hướng lại là che
 * lại. Mỗi lần mở ghi một dòng `REVEAL_PHONE` vào `crm_customer_access_log`.
 *
 * Đây là chốt TRUY VẾT ĐƯỢC, không phải chốt CHẶN ĐƯỢC.
 */
export function PhoneCell({
  userId,
  phone,
  surface,
}: {
  userId: string;
  phone: string | null | undefined;
  surface: CrmAccessSurface;
}) {
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Đổi sang người khác (bảng dùng lại dòng) thì phải che lại.
  React.useEffect(() => {
    setRevealed(null);
  }, [userId]);

  const shown = revealed ?? phone ?? '—';
  const isMasked = !revealed && typeof phone === 'string' && phone.includes('*');

  const handleReveal = async () => {
    setBusy(true);
    try {
      const res = await revealCrmCustomerPhone(userId, surface);
      setRevealed(res.phone ?? '—');
    } catch (e) {
      // KHÔNG nuốt lỗi và KHÔNG hiện số: thà admin biết là chưa mở được còn hơn tưởng
      // rằng số đang hiện là số thật.
      toastApiError(e, 'Không mở được số điện thoại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{shown}</span>
      {isMasked ? (
        <button
          type="button"
          aria-label="Hiện số"
          title="Hiện số đầy đủ (có ghi vết)"
          disabled={busy}
          /**
           * 🚨 `stopPropagation` BẮT BUỘC: nút này nằm trong <TableCell> của một
           * <TableRow onClick={...openUserDetail}>. Không chặn thì bấm "Hiện số" sẽ nổi
           * bọt lên hàng -> điều hướng sang trang chi tiết -> component huỷ TRƯỚC khi số
           * kịp hiện. Request `reveal-phone` vẫn bay đi và backend vẫn ghi một dòng
           * REVEAL_PHONE. Kết quả: người dùng KHÔNG thấy số, tưởng nút hỏng, bấm lại ở
           * trang chi tiết -> 2 dòng audit cho 1 lần thật sự cần số, làm nhiễu đúng cái
           * nhật ký dựng ra để truy vết ai đã xem SĐT khách.
           */
          onClick={(e) => {
            e.stopPropagation();
            void handleReveal();
          }}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </span>
  );
}
