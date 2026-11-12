import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateBookingDialog, isValidVatTaxCode, isValidVatEmailOrEmpty } from './create-booking-dialog';
import { createAgentBooking } from '@/lib/api';

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

describe('CreateBookingDialog — Tự cấu hình giá cước (tối thiểu 150k, đã bao gồm thuế)', () => {
  it('hiển thị công tắc "Tự cấu hình giá cước" và khi bật hiển thị ô nhập với mức tối thiểu 150.000₫', async () => {
    const user = userEvent.setup();
    render(<CreateBookingDialog onSuccess={() => {}} mode="agent" open={true} />);

    // Kiểm tra có công tắc tự cấu hình giá cước
    const toggle = screen.getByLabelText(/Tự cấu hình giá cước/i);
    expect(toggle).toBeInTheDocument();
    expect(toggle).not.toBeChecked();

    // Bật công tắc
    await user.click(toggle);
    expect(toggle).toBeChecked();

    // Hiện ô nhập giá cước và nhãn "Đã bao gồm thuế VAT"
    expect(screen.getByLabelText(/Giá cước thoả thuận/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Đã bao gồm thuế VAT/i).length).toBeGreaterThan(0);

    const priceInput = screen.getByLabelText(/Giá cước thoả thuận/i);
    expect(priceInput).toHaveValue('150.000');
  });

  it('cảnh báo lỗi khi người dùng nhập giá < 150.000₫', async () => {
    const user = userEvent.setup();
    render(<CreateBookingDialog onSuccess={() => {}} mode="agent" open={true} />);

    const toggle = screen.getByLabelText(/Tự cấu hình giá cước/i);
    await user.click(toggle);

    const priceInput = screen.getByLabelText(/Giá cước thoả thuận/i);
    await user.clear(priceInput);
    await user.type(priceInput, '100000');

    expect(
      screen.getByText(/Giá cước tự cấu hình tối thiểu là 150.000₫/i),
    ).toBeInTheDocument();
  });

  it('chọn nút gợi ý nhanh cập nhật đúng giá cước', async () => {
    const user = userEvent.setup();
    render(<CreateBookingDialog onSuccess={() => {}} mode="agent" open={true} />);

    const toggle = screen.getByLabelText(/Tự cấu hình giá cước/i);
    await user.click(toggle);

    const button200k = screen.getByRole('button', { name: '200.000₫' });
    await user.click(button200k);

    const priceInput = screen.getByLabelText(/Giá cước thoả thuận/i);
    expect(priceInput).toHaveValue('200.000');
    expect(
      screen.queryByText(/Giá cước tự cấu hình tối thiểu là 150.000₫/i),
    ).not.toBeInTheDocument();
  });
});

describe('CreateBookingDialog — Cổng đặt hộ đặt tên khách hàng (người đi) cho hợp đồng', () => {
  it('cho phép nhập thẳng tên người đi trên cổng đặt hộ và đồng bộ ngay vào Khách 1 (trên HĐ)', async () => {
    const user = userEvent.setup();
    render(<CreateBookingDialog onSuccess={() => {}} mode="agent" open={true} />);

    const nameInput = screen.getByLabelText(/Tên khách hàng \(người đi\)/i);
    expect(nameInput).toBeInTheDocument();
    expect(nameInput).not.toBeDisabled();

    await user.type(nameInput, 'Nguyễn Văn Nam');

    expect(nameInput).toHaveValue('Nguyễn Văn Nam');
    expect(screen.getByText('Khách 1 (trên HĐ)')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Văn Nam')).toBeInTheDocument();
  });
});

describe('CreateBookingDialog — Xuất hoá đơn VAT cho khách trên cổng đặt hộ', () => {
  it('kiểm định dạng MST & email khớp chuẩn MISA backend', () => {
    expect(isValidVatTaxCode('0101234567')).toBe(true);
    expect(isValidVatTaxCode('0101234567-001')).toBe(true);
    expect(isValidVatTaxCode('001200012345')).toBe(true);
    expect(isValidVatTaxCode('12345')).toBe(false);
    expect(isValidVatTaxCode('0101234567-01')).toBe(false);
    expect(isValidVatEmailOrEmpty('')).toBe(true);
    expect(isValidVatEmailOrEmpty('ketoan@vigo.vn')).toBe(true);
    expect(isValidVatEmailOrEmpty('a@b.vn; c@d.vn')).toBe(false);
  });

  it('bật công tắc Xuất hoá đơn VAT và gửi vatInfo lên createAgentBooking khi tạo chuyến đặt hộ', async () => {
    const user = userEvent.setup();
    vi.mocked(createAgentBooking).mockResolvedValueOnce({ id: 'b-vat-1' } as any);

    const futureFrom = new Date(Date.now() + 60 * 60_000);
    const futureTo = new Date(Date.now() + 90 * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    render(
      <CreateBookingDialog
        onSuccess={() => {}}
        mode="agent"
        open={true}
        initial={{
          sourceBookingId: 'src-1',
          customerPhone: '0909123456',
          customerName: 'Nguyễn Văn A',
          pickup: { address: 'Sân bay Nội Bài', lat: 21.2187, long: 105.8047 },
          dropoff: { address: '1 Trần Phú, Hà Nội', lat: 21.0278, long: 105.8342 },
          missingCoords: [],
          serviceType: 'RIDE',
          vehicleType: 'CAR_4',
          coPassengers: [],
          companionPhone: '',
          note: '',
          isScheduled: true,
          scheduledFrom: fmt(futureFrom),
          scheduledTo: fmt(futureTo),
          promotionId: null,
          vatInfo: null,
        }}
      />,
    );

    const vatToggle = screen.getByLabelText(/Xuất hoá đơn VAT cho khách/i);
    expect(vatToggle).not.toBeChecked();

    await user.click(vatToggle);
    expect(vatToggle).toBeChecked();

    await user.type(screen.getByLabelText(/Tên công ty \/ Đơn vị/i), 'Công ty TNHH MTV ViGo');
    const taxInput = screen.getByLabelText(/Mã số thuế \(MST\)/i);
    await user.type(taxInput, '123');
    expect(screen.getByText(/MST không hợp lệ/i)).toBeInTheDocument();

    await user.clear(taxInput);
    await user.type(taxInput, '0101234567');
    expect(screen.queryByText(/MST không hợp lệ/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Email nhận hoá đơn/i), 'ketoan@vigo.vn');
    await user.type(screen.getByLabelText(/Địa chỉ công ty/i), 'Số 1 Trần Phú, Ba Đình, Hà Nội');

    await user.click(screen.getByRole('button', { name: /^Tạo chuyến$/i }));

    expect(createAgentBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        customerPhone: '0909123456',
        customerName: 'Nguyễn Văn A',
        vatInfo: {
          companyName: 'Công ty TNHH MTV ViGo',
          taxCode: '0101234567',
          companyAddress: 'Số 1 Trần Phú, Ba Đình, Hà Nội',
          invoiceEmail: 'ketoan@vigo.vn',
        },
      }),
    );
  });
});

