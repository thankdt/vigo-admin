import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateBookingDialog } from './create-booking-dialog';

vi.mock('@/lib/api', () => ({
  createAdminBooking: vi.fn(),
  createAgentBooking: vi.fn(),
  getAvailableDrivers: vi.fn().mockResolvedValue([]),
  lookupCustomerByPhone: vi.fn(),
  estimateTripPrice: vi.fn(),
  getVouchers: vi.fn().mockResolvedValue([]),
}));

// Polyfill jsdom cho Radix Select (@radix-ui/react-select) — jsdom không
// implement Pointer Events / scrollIntoView, Radix gọi các API này khi mở
// dropdown nên userEvent.click trên SelectTrigger sẽ throw nếu thiếu. Chưa
// có test nào trong repo lái 1 Select trước task này nên chưa ai cần thêm
// polyfill này — đây là lần đầu, scope trong file test này (không sửa
// vitest.setup.ts global, tránh ảnh hưởng test khác).
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!window.PointerEvent) {
    window.PointerEvent = MouseEvent as any;
  }
});

async function openDialog() {
  const user = userEvent.setup();
  render(<CreateBookingDialog onSuccess={() => {}} />);
  await user.click(screen.getByRole('button', { name: /tạo chuyến/i }));
  return user;
}

describe('CreateBookingDialog — chọn Loại xe cho CARPOOL (auto-switch bao xe)', () => {
  it('CARPOOL (mặc định khi mở dialog) hiện select "Loại xe", không có dấu * bắt buộc (fix chính của gap)', async () => {
    // serviceType mặc định trong component là 'CARPOOL' (create-booking-dialog.tsx,
    // useState ban đầu) — mount xong là đã ở trạng thái CARPOOL, không cần lái
    // Select "Loại dịch vụ" để tới đây. Lý do CHỌN cách này thay vì lái UI qua
    // Select (như 2 case bên dưới): xem giải thích ở khối it.skip — mở dropdown
    // Radix Select khi nó nằm trong 1 Radix Dialog modal=true bị crash cứng
    // trong môi trường jsdom/vitest hiện tại của repo, đã verify kỹ (xem ghi
    // chú), không liên quan gì tới trạng thái CARPOOL này (case này không đụng
    // tới dropdown nên không bị ảnh hưởng, vẫn là 1 assertion thật, không giả).
    await openDialog();
    expect(screen.getByText('Loại xe')).toBeInTheDocument();
    const label = screen.getByText('Loại xe').closest('label')!;
    expect(within(label).queryByText('*')).not.toBeInTheDocument();
  });

  // ⚠️ BLOCKED — KHÔNG phải thiếu polyfill, đã verify kỹ trước khi tắt 2 case này.
  //
  // 2 case dưới (RIDE bắt buộc *, DELIVERY vẫn hiện Ghi chú — regression) đòi
  // hỏi đổi serviceType từ CARPOOL (mặc định) sang RIDE/DELIVERY, và cách duy
  // nhất để đổi là lái UI qua Select "Loại dịch vụ" — component không expose
  // serviceType như prop controlled nên không có cách khác trong file thật mà
  // KHÔNG sửa create-booking-dialog.tsx (ngoài phạm vi task này).
  //
  // Mở dropdown Select "Loại dịch vụ" — Select này (shadcn select.tsx, dùng
  // position="popper" mặc định → @radix-ui/react-popper → @floating-ui/dom)
  // nằm lồng trong Radix Dialog với modal=true (mặc định, đúng hành vi thật
  // của dialog) — TỔ HỢP NÀY CRASH CỨNG process vitest (RangeError: Maximum
  // call stack size exceeded, lặp vô hạn qua jsdom reportException/console
  // error) khi mở dropdown, KHÔNG PHÂN BIỆT cách tương tác (userEvent.click,
  // fireEvent.click, hay mở bằng keyboard {Enter} — cả 3 đều crash y hệt).
  //
  // Đã verify bằng 1 repro tối giản (Dialog + Select, không có phần nào khác
  // của CreateBookingDialog) để loại trừ lỗi do cách viết test:
  //   - Select KHÔNG lồng trong Dialog → chạy OK.
  //   - Select lồng trong Dialog modal={false} → chạy OK.
  //   - Select lồng trong Dialog modal={true} (= hành vi thật của app) → crash,
  //     bất kể cách mở dropdown.
  // Đã thử đủ các polyfill jsdom chuẩn cho tổ hợp Radix Dialog+Select mà vẫn
  // crash: hasPointerCapture, releasePointerCapture, scrollIntoView,
  // PointerEvent, getBoundingClientRect, document.elementFromPoint, và
  // ResizeObserver (thêm cả ở module-import time, không chỉ beforeAll, vì
  // @radix-ui/react-popper/@floating-ui/dom có kiểm tra ResizeObserver ngay
  // lúc import module — không phải thiếu polyfill kiểu thông thường).
  //
  // Đề xuất (chọn 1, cần người quyết — không tự ý sửa create-booking-dialog.tsx):
  //   1) Verify RIDE/DELIVERY bằng tay qua dev server (npm run dev) — nhanh,
  //      không cần đổi code. RIDE/DELIVERY test coverage tạm dừng ở đây.
  //   2) Thêm 1 seam tối thiểu, additive-only cho testability (vd optional
  //      prop debug/test-only để set serviceType ban đầu) — cần chốt & review
  //      riêng vì đụng logic component (ngoài phạm vi "KHÔNG sửa logic" của
  //      task này).
  //   3) Đầu tư thời gian riêng để tìm fix jsdom/Radix sâu hơn (khả năng thấp
  //      trong thời gian hợp lý — đã thử các polyfill chuẩn không ăn).
  it.skip('RIDE vẫn hiện Loại xe và bắt buộc (*) — BLOCKED: mở Select trong Dialog modal crash vitest, xem comment phía trên', () => {});

  it.skip('DELIVERY không hiện Loại xe — vẫn hiện Ghi chú (regression) — BLOCKED: mở Select trong Dialog modal crash vitest, xem comment phía trên', () => {});
});
