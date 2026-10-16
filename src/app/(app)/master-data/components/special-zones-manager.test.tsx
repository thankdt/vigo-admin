import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SpecialZone, SpecialZoneFlatPrice } from '@/lib/types';

// `toast` PHẢI là cùng một hàm qua mọi lần render (effect nạp dữ liệu phụ thuộc nó).
const toastMock = vi.fn();
const getZones = vi.fn();
const getRows = vi.fn();
const getWards = vi.fn();
const upsert = vi.fn();
const del = vi.fn();
let canMasterData = true;

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ can: (fn: string) => canMasterData && fn === 'master-data' }),
}));
vi.mock('@/lib/api', () => ({
  getSpecialZones: (...a: unknown[]) => getZones(...a),
  getSpecialZoneFlatPrices: (...a: unknown[]) => getRows(...a),
  getPricingMacroWards: (...a: unknown[]) => getWards(...a),
  upsertSpecialZoneFlatPrice: (...a: unknown[]) => upsert(...a),
  deleteSpecialZoneFlatPrice: (...a: unknown[]) => del(...a),
}));

// Combobox = Popover(modal) + cmdk. Bật nó BÊN TRONG Dialog của Radix thì jsdom đệ quy vô hạn ("Maximum call
// stack size exceeded" — hai FocusScope tranh nhau; trình duyệt thật không bị), cùng lý do với MultiSelectComboBox
// ở macro-bulk-dialog.test.tsx. Thay bằng <select> thô: test này kiểm cách hộp thoại nối ô chọn với form
// (id/nhãn, mục mặc định đứng đầu, validate). Việc lọc gõ không dấu của Combobox thật có test riêng ở
// src/components/ui/combobox.test.tsx. Nút "bấm lại" mô phỏng đúng hợp đồng thật: bấm lại mục đang chọn → undefined.
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({
    id,
    ariaLabel,
    options,
    selectedValue,
    onSelect,
    placeholder,
    disabled,
  }: {
    id?: string;
    ariaLabel?: string;
    options: { value: string; label: string }[];
    selectedValue?: string;
    onSelect: (v: string | undefined) => void;
    placeholder: string;
    disabled?: boolean;
  }) => (
    <span>
      <select
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        value={selectedValue ?? ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        {selectedValue === undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="button" aria-label="bấm lại ô chọn" onClick={() => onSelect(undefined)} />
    </span>
  ),
}));

import { SpecialZonesManager } from './special-zones-manager';

const NOIBAI: SpecialZone = {
  code: 'NOIBAI',
  name: 'Sân bay Nội Bài',
  provinceCode: '01',
  provinceName: 'Hà Nội',
  kind: 'AIRPORT',
  active: true,
};

function row(over: Partial<SpecialZoneFlatPrice> & { id: number }): SpecialZoneFlatPrice {
  return {
    zoneCode: 'NOIBAI',
    wardCode: null,
    wardName: null,
    pricePerSeatGhep: null,
    priceCar4: 250000,
    priceCar7: 350000,
    note: null,
    ...over,
  };
}

const WARDS = [
  { code: '00001', name: 'Phường Ba Đình', provinceCode: '01' },
  { code: '00002', name: 'Xã Sóc Sơn', provinceCode: '01' },
  { code: '99001', name: 'Xã Lạ', provinceCode: '33' },
];

async function setup(rows: SpecialZoneFlatPrice[] = [], zones: SpecialZone[] = [NOIBAI]) {
  getZones.mockResolvedValue(zones);
  getRows.mockResolvedValue(rows);
  getWards.mockResolvedValue(WARDS);
  const user = userEvent.setup();
  render(<SpecialZonesManager />);
  await screen.findByTestId('zone-NOIBAI');
  // Thẻ vùng hiện trước khi hàng đồng giá nạp xong: chờ hết "Đang tải đồng giá" để test không chạy đua với nó.
  await waitFor(() => expect(screen.queryByText('Đang tải đồng giá...')).not.toBeInTheDocument());
  return user;
}

/** Mở hộp thoại "Thêm đồng giá" và chờ danh sách phường nạp xong. */
async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Thêm đồng giá/ }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByRole('option', { name: /Phường Ba Đình/ });
  return dialog;
}

beforeEach(() => {
  vi.clearAllMocks();
  canMasterData = true;
});

describe('SpecialZonesManager', () => {
  it('liệt kê vùng, hàng mặc định + hàng theo phường, và ghi chú mức tham chiếu 250.000 / 350.000', async () => {
    await setup([
      row({ id: 1 }),
      row({ id: 2, wardCode: '00002', wardName: 'Xã Sóc Sơn', priceCar4: 230000, priceCar7: null, pricePerSeatGhep: 90000 }),
    ]);
    expect(getRows).toHaveBeenCalledWith('NOIBAI');
    const card = screen.getByTestId('zone-NOIBAI');
    expect(within(card).getByText('Sân bay Nội Bài')).toBeInTheDocument();
    expect(within(card).getByText('Sân bay')).toBeInTheDocument();
    const def = within(card).getByTestId('flat-row-default');
    expect(def).toHaveTextContent('Cả Hà Nội (mặc định)');
    expect(def).toHaveTextContent('250.000 đ');
    expect(def).toHaveTextContent('350.000 đ');
    const ward = within(card).getByTestId('flat-row-00002');
    expect(ward).toHaveTextContent('Xã Sóc Sơn (00002)');
    expect(ward).toHaveTextContent('90.000 đ');
    const ref = screen.getByTestId('flat-price-reference');
    expect(ref).toHaveTextContent('250.000 đ');
    expect(ref).toHaveTextContent('350.000 đ');
    expect(screen.getByTestId('flat-price-semantics')).toHaveTextContent(/MỌI luật điều chỉnh khu vực \(macro\) bị bỏ qua/);
  });

  it('chưa có hàng nào: nói rõ chuyến đang tính theo bảng km', async () => {
    await setup([]);
    expect(screen.getByTestId('no-flat-rows')).toHaveTextContent(/bảng km/);
  });

  it('không có quyền master-data: không gọi API, không có nút thao tác', async () => {
    canMasterData = false;
    render(<SpecialZonesManager />);
    expect(await screen.findByText(/không có quyền/)).toBeInTheDocument();
    expect(getZones).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Thêm đồng giá/ })).not.toBeInTheDocument();
  });

  it('lỗi tải vùng: hiện lỗi + thử lại', async () => {
    getZones.mockRejectedValueOnce(new Error('Máy chủ lỗi'));
    render(<SpecialZonesManager />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ lỗi');
    getZones.mockResolvedValue([NOIBAI]);
    getRows.mockResolvedValue([]);
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByTestId('zone-NOIBAI')).toBeInTheDocument();
  });

  it('thêm hàng mặc định: kiểm lỗi, xác nhận nêu giá cũ → mới + điều khoản bỏ qua macro, rồi mới gọi API', async () => {
    const user = await setup([]);
    upsert.mockResolvedValue(row({ id: 9 }));
    await user.click(screen.getByRole('button', { name: /Thêm đồng giá/ }));
    const dialog = await screen.findByRole('dialog');

    // Không chọn nơi áp, không giá → bị chặn, KHÔNG mở xác nhận, KHÔNG gọi API.
    await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
    expect(within(dialog).getByText(/Chọn phường\/xã/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Phải nhập ít nhất một giá/)).toBeInTheDocument();
    expect(upsert).not.toHaveBeenCalled();

    await user.selectOptions(within(dialog).getByLabelText('Áp cho'), '__DEFAULT__');
    await user.type(within(dialog).getByLabelText('Bao xe 4 chỗ (đ)'), '250.000');
    await user.type(within(dialog).getByLabelText('Bao xe 7 chỗ (đ)'), '350000');
    await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Thêm đồng giá Sân bay Nội Bài — Cả Hà Nội (mặc định)');
    expect(confirm).toHaveTextContent('Bao xe 4 chỗ: không áp đồng giá → 250.000 đ');
    expect(confirm).toHaveTextContent('Bao xe 7 chỗ: không áp đồng giá → 350.000 đ');
    expect(confirm).toHaveTextContent(/macro\) bị bỏ qua/);
    expect(confirm).toHaveTextContent(/PRC_002/);
    expect(upsert).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole('button', { name: 'Xác nhận lưu' }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert).toHaveBeenCalledWith('NOIBAI', {
      wardCode: null,
      pricePerSeatGhep: null,
      priceCar4: 250000,
      priceCar7: 350000,
      note: null,
    });
    await waitFor(() => expect(getRows).toHaveBeenCalledTimes(2)); // nạp lại sau khi lưu
  });

  it('chọn phường chỉ liệt kê phường của tỉnh vùng (lọc cả phường tỉnh khác)', async () => {
    const user = await setup([]);
    await user.click(screen.getByRole('button', { name: /Thêm đồng giá/ }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(getWards).toHaveBeenCalledWith('01'));
    await within(dialog).findByRole('option', { name: /Phường Ba Đình/ });
    expect(within(dialog).queryByRole('option', { name: /Xã Lạ/ })).not.toBeInTheDocument();
  });

  it('ô "Áp cho": mục mặc định cả tỉnh đứng đầu rồi tới phường "Tên (mã)"; chưa chọn thì nhắc "— Chọn nơi áp dụng —"', async () => {
    const user = await setup([]);
    const dialog = await openCreate(user);
    const target = within(dialog).getByLabelText('Áp cho') as HTMLSelectElement;
    expect(Array.from(target.options).map((o) => o.textContent)).toEqual([
      '— Chọn nơi áp dụng —',
      'Cả Hà Nội (mặc định)',
      'Phường Ba Đình (00001)',
      'Xã Sóc Sơn (00002)',
    ]);
    expect(target.selectedOptions[0]).toHaveTextContent('— Chọn nơi áp dụng —');
    // Ô lọc riêng đã bỏ: việc tìm nằm trong chính ô chọn (Combobox có ô tìm).
    expect(within(dialog).queryByLabelText('Lọc phường/xã')).not.toBeInTheDocument();
  });

  it('chọn một phường rồi bấm lại đúng mục đó: giữ nguyên lựa chọn, vẫn lưu đúng mã phường', async () => {
    const user = await setup([]);
    upsert.mockResolvedValue(row({ id: 11, wardCode: '00002', wardName: 'Xã Sóc Sơn' }));
    const dialog = await openCreate(user);

    await user.selectOptions(within(dialog).getByLabelText('Áp cho'), '00002');
    await user.click(within(dialog).getByRole('button', { name: 'bấm lại ô chọn' }));
    expect((within(dialog).getByLabelText('Áp cho') as HTMLSelectElement).value).toBe('00002');

    await user.type(within(dialog).getByLabelText('Bao xe 4 chỗ (đ)'), '300000');
    await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xác nhận lưu' }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert.mock.calls[0][1]).toMatchObject({ wardCode: '00002', priceCar4: 300000 });
  });

  it('sửa hàng: phường cố định; cảnh báo lệch xa mức tham chiếu hiện ở hộp xác nhận', async () => {
    const user = await setup([row({ id: 1 })]);
    upsert.mockResolvedValue(row({ id: 1, priceCar4: 25000 }));
    await user.click(screen.getByRole('button', { name: /Sửa đồng giá Cả Hà Nội/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('flat-target-fixed')).toHaveTextContent('Cả Hà Nội (mặc định)');
    expect(getWards).not.toHaveBeenCalled();

    const car4 = within(dialog).getByLabelText('Bao xe 4 chỗ (đ)');
    await user.clear(car4);
    await user.type(car4, '25000'); // thiếu một số 0
    await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Cập nhật đồng giá');
    expect(confirm).toHaveTextContent('Bao xe 4 chỗ: 250.000 đ → 25.000 đ');
    expect(confirm).toHaveTextContent(/lệch xa mức tham chiếu/);
    await user.click(within(confirm).getByRole('button', { name: 'Xác nhận lưu' }));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith('NOIBAI', expect.objectContaining({ wardCode: null, priceCar4: 25000, priceCar7: 350000 })));
  });

  it('sửa mà không đổi gì: không gọi API', async () => {
    const user = await setup([row({ id: 1 })]);
    await user.click(screen.getByRole('button', { name: /Sửa đồng giá Cả Hà Nội/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
    expect(upsert).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Không có thay đổi để lưu' }));
  });

  it('lỗi từ backend khi lưu: toast lỗi, KHÔNG báo đã lưu, nạp lại hàng để giá cũ không cũ, giữ hộp thoại sửa', async () => {
    const user = await setup([row({ id: 1 })]);
    upsert.mockRejectedValue(new Error('Điểm đặc biệt đang tắt'));
    await user.click(screen.getByRole('button', { name: /Sửa đồng giá Cả Hà Nội/ }));
    const dialog = await screen.findByRole('dialog');
    const car7 = within(dialog).getByLabelText('Bao xe 7 chỗ (đ)');
    await user.clear(car7);
    await user.type(car7, '360000');
    await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xác nhận lưu' }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Lỗi lưu đồng giá', description: 'Điểm đặc biệt đang tắt', variant: 'destructive' }),
      ),
    );
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Đã lưu đồng giá' }));
    await waitFor(() => expect(getRows).toHaveBeenCalledTimes(2)); // nạp lại sau lỗi
    // Số đã gõ vẫn còn trong hộp thoại sửa (không mất công người dùng).
    expect(within(await screen.findByRole('dialog')).getByLabelText('Bao xe 7 chỗ (đ)')).toHaveValue('360000');
  });

  it('xoá hàng mặc định: xác nhận nêu giá sẽ mất và hệ quả, rồi gọi API với wardCode null', async () => {
    const user = await setup([row({ id: 1 }), row({ id: 2, wardCode: '00002', wardName: 'Xã Sóc Sơn' })]);
    del.mockResolvedValue({ success: true });
    await user.click(screen.getByRole('button', { name: /Xoá đồng giá Cả Hà Nội/ }));
    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Xoá đồng giá Sân bay Nội Bài — Cả Hà Nội (mặc định)');
    expect(confirm).toHaveTextContent('Bao xe 4 chỗ: 250.000 đ → không áp đồng giá');
    expect(confirm).toHaveTextContent(/bảng km/);
    expect(del).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Xoá đồng giá' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('NOIBAI', null));
  });

  it('xoá hàng theo phường: gửi mã phường', async () => {
    const user = await setup([row({ id: 2, wardCode: '00002', wardName: 'Xã Sóc Sơn' })]);
    del.mockResolvedValue({ success: true });
    await user.click(screen.getByRole('button', { name: /Xoá đồng giá Xã Sóc Sơn/ }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xoá đồng giá' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('NOIBAI', '00002'));
  });

  it('vùng đang tắt: không thêm/sửa được, vẫn xoá được', async () => {
    await setup([row({ id: 1 })], [{ ...NOIBAI, active: false }]);
    expect(screen.getByRole('button', { name: /Thêm đồng giá/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Sửa đồng giá/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Xoá đồng giá/ })).toBeEnabled();
    expect(screen.getByText('Đang tắt')).toBeInTheDocument();
  });

  it('sửa hàng phường mà không đổi gì: không gọi API (không chỉ hàng mặc định)', async () => {
    const user = await setup([row({ id: 2, wardCode: '00002', wardName: 'Xã Sóc Sơn', pricePerSeatGhep: 90000 })]);
    await user.click(screen.getByRole('button', { name: /Sửa đồng giá Xã Sóc Sơn/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xem lại & lưu' }));
    expect(upsert).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Không có thay đổi để lưu' }));
  });

  describe('thêm hàng mới trùng hàng có sẵn (PUT sẽ ghi đè lặng lẽ) — chặn ngay ở màn', () => {
    it('trùng phường đã có đồng giá: báo lỗi, không mở xác nhận, không gọi API', async () => {
      const user = await setup([
        row({ id: 1 }),
        row({ id: 2, wardCode: '00001', wardName: 'Phường Ba Đình', priceCar4: 230000, priceCar7: null }),
      ]);
      const dialog = await openCreate(user);
      await user.selectOptions(within(dialog).getByLabelText('Áp cho'), '00001');
      await user.type(within(dialog).getByLabelText('Bao xe 4 chỗ (đ)'), '240000');
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
      expect(within(dialog).getByText(/Phường\/xã này đã có đồng giá/)).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(upsert).not.toHaveBeenCalled();
    });

    it('trùng hàng mặc định cả tỉnh: báo lỗi, không gọi API', async () => {
      const user = await setup([row({ id: 1 })]);
      const dialog = await openCreate(user);
      await user.selectOptions(within(dialog).getByLabelText('Áp cho'), '__DEFAULT__');
      await user.type(within(dialog).getByLabelText('Bao xe 4 chỗ (đ)'), '240000');
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
      expect(within(dialog).getByText(/đã có hàng mặc định cả tỉnh/)).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(upsert).not.toHaveBeenCalled();
    });

    it('phường chưa có hàng thì thêm được (đối chứng)', async () => {
      const user = await setup([row({ id: 1 })]);
      upsert.mockResolvedValue(row({ id: 3, wardCode: '00001' }));
      const dialog = await openCreate(user);
      await user.selectOptions(within(dialog).getByLabelText('Áp cho'), '00001');
      await user.type(within(dialog).getByLabelText('Bao xe 4 chỗ (đ)'), '240000');
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
      expect(await screen.findByRole('alertdialog')).toHaveTextContent('Thêm đồng giá Sân bay Nội Bài — Phường Ba Đình (00001)');
    });
  });

  describe('giá lẻ nghìn (backend làm tròn đến nghìn lúc báo giá)', () => {
    it('từ chối ở màn, nói rõ giá sẽ bán; sửa thành số tròn nghìn thì qua và gửi đúng số đó', async () => {
      const user = await setup([]);
      upsert.mockResolvedValue(row({ id: 9 }));
      const dialog = await openCreate(user);
      await user.selectOptions(within(dialog).getByLabelText('Áp cho'), '__DEFAULT__');
      const car4 = within(dialog).getByLabelText('Bao xe 4 chỗ (đ)');
      await user.type(car4, '250400');
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));

      expect(within(dialog).getByText(/sẽ bán 250\.000 đ/)).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(upsert).not.toHaveBeenCalled();

      await user.clear(car4);
      await user.type(car4, '250000');
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
      const confirm = await screen.findByRole('alertdialog');
      expect(confirm).toHaveTextContent('Bao xe 4 chỗ: không áp đồng giá → 250.000 đ');
      await user.click(within(confirm).getByRole('button', { name: 'Xác nhận lưu' }));
      await waitFor(() =>
        expect(upsert).toHaveBeenCalledWith('NOIBAI', expect.objectContaining({ priceCar4: 250000 })),
      );
    });

    it('250.500 bị từ chối vì sẽ bán 251.000; dưới 500 đ báo sẽ thành 0 đ (PRC_002)', async () => {
      const user = await setup([]);
      const dialog = await openCreate(user);
      await user.selectOptions(within(dialog).getByLabelText('Áp cho'), '__DEFAULT__');
      await user.type(within(dialog).getByLabelText('Bao xe 4 chỗ (đ)'), '250.500');
      await user.type(within(dialog).getByLabelText('Bao xe 7 chỗ (đ)'), '400');
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
      expect(within(dialog).getByText(/sẽ bán 251\.000 đ/)).toBeInTheDocument();
      expect(within(dialog).getByText(/thành 0 đ.*PRC_002/)).toBeInTheDocument();
      expect(upsert).not.toHaveBeenCalled();
    });

    it('hàng lẻ nghìn có sẵn trong DB (ghi thẳng qua API): bảng nêu giá thực bán, sửa buộc nhập lại số tròn nghìn', async () => {
      const user = await setup([row({ id: 1, priceCar4: 250400, priceCar7: 350000 })]);
      expect(screen.getByTestId('flat-odd-default-priceCar4')).toHaveTextContent('bán 250.000 đ');
      expect(screen.queryByTestId('flat-odd-default-priceCar7')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Sửa đồng giá Cả Hà Nội/ }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
      expect(within(dialog).getByText(/sẽ bán 250\.000 đ/)).toBeInTheDocument();
      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe('chống bấm đúp khi đang lưu', () => {
    it('đang chờ backend: "Xác nhận lưu" và "Quay lại sửa" bị khoá, bấm thêm không gửi lần hai', async () => {
      const user = await setup([row({ id: 1 })]);
      let release!: (v: SpecialZoneFlatPrice) => void;
      upsert.mockImplementation(
        () =>
          new Promise<SpecialZoneFlatPrice>((resolve) => {
            release = resolve;
          }),
      );
      await user.click(screen.getByRole('button', { name: /Sửa đồng giá Cả Hà Nội/ }));
      const dialog = await screen.findByRole('dialog');
      const car7 = within(dialog).getByLabelText('Bao xe 7 chỗ (đ)');
      await user.clear(car7);
      await user.type(car7, '360000');
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));

      const confirm = await screen.findByRole('alertdialog');
      const save = within(confirm).getByRole('button', { name: 'Xác nhận lưu' });
      await user.click(save);
      await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
      expect(save).toBeDisabled();
      expect(within(confirm).getByRole('button', { name: 'Quay lại sửa' })).toBeDisabled();

      await user.click(save);
      await user.click(save);
      expect(upsert).toHaveBeenCalledTimes(1);

      release(row({ id: 1, priceCar7: 360000 }));
      await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Đã lưu đồng giá' })));
      expect(upsert).toHaveBeenCalledTimes(1);
    });

    it('đang chờ backend khi xoá: nút xoá bị khoá, bấm thêm không gửi lần hai', async () => {
      const user = await setup([row({ id: 1 })]);
      let release!: (v: { success: boolean }) => void;
      del.mockImplementation(
        () =>
          new Promise<{ success: boolean }>((resolve) => {
            release = resolve;
          }),
      );
      await user.click(screen.getByRole('button', { name: /Xoá đồng giá Cả Hà Nội/ }));
      const confirm = await screen.findByRole('alertdialog');
      const remove = within(confirm).getByRole('button', { name: 'Xoá đồng giá' });
      await user.click(remove);
      await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
      expect(remove).toBeDisabled();
      await user.click(remove);
      expect(del).toHaveBeenCalledTimes(1);
      release({ success: true });
      await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Đã xoá đồng giá' })));
    });
  });

  describe('ô để trống: rơi về hàng mặc định cả tỉnh trước, rồi mới bảng km', () => {
    it('hộp thoại sửa nói đúng nghĩa ô trống (hàng phường › hàng mặc định › bảng km), không còn "rơi thẳng về bảng km"', async () => {
      const user = await setup([]);
      const dialog = await openCreate(user);
      const desc = within(dialog).getByText(/Ô để trống = hàng này không có giá riêng cho loại đó/);
      expect(desc).toHaveTextContent(/với hàng của phường, chuyến loại đó lấy giá của hàng mặc định cả tỉnh \(nếu hàng đó có\)/);
      expect(desc).toHaveTextContent(/nếu không thì tính theo bảng km \(\+ luật macro\)/);
      expect(desc).toHaveTextContent(/với hàng mặc định, chuyến loại đó tính theo bảng km/);
      expect(desc).toHaveTextContent(/bội số của 1\.000 đ/);
    });

    it('xác nhận hàng phường: loại để trống mà hàng mặc định có giá → nêu sẽ lấy giá mặc định; không có → bảng km', async () => {
      const user = await setup([
        row({ id: 1 }), // mặc định: 4 chỗ 250.000, 7 chỗ 350.000, ghép trống
        row({ id: 2, wardCode: '00002', wardName: 'Xã Sóc Sơn', pricePerSeatGhep: 90000, priceCar4: 230000, priceCar7: null }),
      ]);
      upsert.mockResolvedValue(row({ id: 2, wardCode: '00002' }));
      await user.click(screen.getByRole('button', { name: /Sửa đồng giá Xã Sóc Sơn/ }));
      const dialog = await screen.findByRole('dialog');
      const ghep = within(dialog).getByLabelText('Ghép (1 ghế) (đ)');
      await user.clear(ghep); // ghép về trống; hàng mặc định cũng không có giá ghép
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));

      const confirm = await screen.findByRole('alertdialog');
      const fb = within(confirm).getByTestId('confirm-fallbacks');
      expect(fb).toHaveTextContent('Ghép (1 ghế): hàng mặc định cả tỉnh cũng không có giá loại này → tính theo bảng km (+ luật macro).');
      expect(fb).toHaveTextContent('Bao xe 7 chỗ: lấy giá hàng mặc định cả tỉnh 350.000 đ.');
      expect(fb).not.toHaveTextContent(/Bao xe 4 chỗ/); // loại này có giá riêng ở hàng phường
      expect(confirm).toHaveTextContent('Ghép (1 ghế): 90.000 đ → không áp đồng giá');
    });

    it('xác nhận hàng phường khi CHƯA có hàng mặc định: nói thẳng là chưa có, rơi về bảng km', async () => {
      const user = await setup([row({ id: 2, wardCode: '00002', wardName: 'Xã Sóc Sơn', priceCar4: 230000, priceCar7: 340000 })]);
      await user.click(screen.getByRole('button', { name: /Sửa đồng giá Xã Sóc Sơn/ }));
      const dialog = await screen.findByRole('dialog');
      const car7 = within(dialog).getByLabelText('Bao xe 7 chỗ (đ)');
      await user.clear(car7);
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
      const fb = within(await screen.findByRole('alertdialog')).getByTestId('confirm-fallbacks');
      expect(fb).toHaveTextContent('Bao xe 7 chỗ: chưa có hàng mặc định cả tỉnh → tính theo bảng km (+ luật macro).');
    });

    it('xác nhận hàng mặc định: loại để trống rơi về bảng km (trừ phường có hàng riêng)', async () => {
      const user = await setup([row({ id: 1, pricePerSeatGhep: null })]);
      await user.click(screen.getByRole('button', { name: /Sửa đồng giá Cả Hà Nội/ }));
      const dialog = await screen.findByRole('dialog');
      const car7 = within(dialog).getByLabelText('Bao xe 7 chỗ (đ)');
      await user.clear(car7);
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
      const fb = within(await screen.findByRole('alertdialog')).getByTestId('confirm-fallbacks');
      expect(fb).toHaveTextContent(/Bao xe 7 chỗ: cả tỉnh không có giá riêng → .*bảng km.*trừ phường có hàng riêng/);
    });

    it('đủ ba giá thì xác nhận không có khối "loại để trống"', async () => {
      const user = await setup([row({ id: 1, pricePerSeatGhep: 80000 })]);
      await user.click(screen.getByRole('button', { name: /Sửa đồng giá Cả Hà Nội/ }));
      const dialog = await screen.findByRole('dialog');
      const car4 = within(dialog).getByLabelText('Bao xe 4 chỗ (đ)');
      await user.clear(car4);
      await user.type(car4, '260000');
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
      const confirm = await screen.findByRole('alertdialog');
      expect(within(confirm).queryByTestId('confirm-fallbacks')).not.toBeInTheDocument();
    });
  });

  describe('ghi chú phạm vi và cách tra', () => {
    it('nêu: chỉ ghép/bao xe, đúng MỘT đầu trong vùng; vùng↔vùng tính theo km; giao hàng không dùng đồng giá', async () => {
      await setup([]);
      const scope = screen.getByTestId('flat-price-scope');
      expect(scope).toHaveTextContent(/chỉ áp cho chuyến GHÉP và BAO XE/);
      expect(scope).toHaveTextContent(/ĐÚNG MỘT đầu \(đón hoặc trả\) nằm trong vùng/);
      expect(scope).toHaveTextContent(/Cả hai đầu cùng nằm trong vùng đặc biệt \(vd T1 ↔ T2\)/);
      expect(scope).toHaveTextContent(/KHÔNG áp đồng giá, tính theo bảng km \(\+ luật macro\)/);
      // Giao hàng không đi qua bảng km (công thức riêng) — không được nói lẫn.
      expect(scope).toHaveTextContent(/Giao hàng không dùng đồng giá/);
      expect(scope).toHaveTextContent(/ghép đặt đủ số ghế khách của xe 4\/7 chỗ được tính như bao xe/);
    });

    it('nêu đúng thứ tự tra theo từng loại: hàng phường (nếu có giá loại đó) › hàng mặc định › bảng km', async () => {
      await setup([]);
      const lookup = screen.getByTestId('flat-price-lookup');
      expect(lookup).toHaveTextContent(/theo TỪNG loại/);
      expect(lookup).toHaveTextContent(/hàng RIÊNG của phường chứa đầu kia, nếu hàng đó CÓ giá cho loại này/);
      expect(lookup).toHaveTextContent(/hàng MẶC ĐỊNH cả tỉnh, chỉ khi đầu kia nằm trong tỉnh của vùng/);
      expect(lookup).toHaveTextContent(/bảng km \+ luật macro/);
      expect(lookup).toHaveTextContent(/Ô để trống = bỏ qua bậc đó cho đúng loại đó/);
    });

    it('mức 250.000 / 350.000 được gắn nhãn tham chiếu với nguồn gốc, không phải số đã chốt', async () => {
      await setup([]);
      const ref = screen.getByTestId('flat-price-reference');
      expect(ref).toHaveTextContent('Tham chiếu (không phải số kinh doanh đã chốt)');
      expect(ref).toHaveTextContent('mức trần bao xe của tuyến "Nội đô Hà Nội gồm sân bay" trước 15/10/2026');
      expect(ref).toHaveTextContent('CAR_4 250.000 đ / CAR_7 350.000 đ');
    });

    it('nêu bội số 1.000 đ vì backend làm tròn đến nghìn khi báo giá', async () => {
      await setup([]);
      expect(screen.getByTestId('flat-price-semantics')).toHaveTextContent(/làm tròn đến nghìn đồng khi báo giá/);
    });
  });

  describe('nạp lại sau lỗi / làm mới', () => {
    it('lưu lỗi vì hàng đã bị admin khác đổi: lần xem lại sau lấy "giá cũ" MỚI, không phải bản chụp lúc mở', async () => {
      const user = await setup([row({ id: 1 })]); // 4 chỗ 250.000, 7 chỗ 350.000
      upsert.mockRejectedValueOnce(new Error('Máy chủ bận'));
      await user.click(screen.getByRole('button', { name: /Sửa đồng giá Cả Hà Nội/ }));
      const dialog = await screen.findByRole('dialog');
      const car7 = within(dialog).getByLabelText('Bao xe 7 chỗ (đ)');
      await user.clear(car7);
      await user.type(car7, '360000');
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
      // Trong lúc đó admin khác đã đổi 7 chỗ thành 400.000.
      getRows.mockResolvedValue([row({ id: 1, priceCar7: 400000 })]);
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xác nhận lưu' }));

      await waitFor(() => expect(screen.getByTestId('flat-row-default')).toHaveTextContent('400.000 đ'));
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xem lại & lưu' }));
      const confirm = await screen.findByRole('alertdialog');
      expect(confirm).toHaveTextContent('Bao xe 7 chỗ: 400.000 đ → 360.000 đ');
      expect(confirm).not.toHaveTextContent('350.000 đ → 360.000 đ');
    });

    it('xoá gặp 404 (hàng đã bị xoá nơi khác): toast lỗi và dòng chết biến khỏi bảng', async () => {
      const user = await setup([row({ id: 1 }), row({ id: 2, wardCode: '00002', wardName: 'Xã Sóc Sơn' })]);
      del.mockRejectedValue(new Error('Điểm đặc biệt Sân bay Nội Bài chưa có đồng giá riêng cho phường/xã mã 00002.'));
      getRows.mockResolvedValue([row({ id: 1 })]);
      await user.click(screen.getByRole('button', { name: /Xoá đồng giá Xã Sóc Sơn/ }));
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xoá đồng giá' }));
      await waitFor(() =>
        expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lỗi xoá đồng giá', variant: 'destructive' })),
      );
      await waitFor(() => expect(screen.queryByTestId('flat-row-00002')).not.toBeInTheDocument());
      expect(screen.getByTestId('flat-row-default')).toBeInTheDocument();
      expect(getRows).toHaveBeenCalledTimes(2);
    });

    it('hàng bị xoá nơi khác trong lúc đang sửa: lần xem lại sau là THÊM mới, không giả vờ "cập nhật"', async () => {
      const user = await setup([row({ id: 1 })]);
      upsert.mockRejectedValueOnce(new Error('Máy chủ bận'));
      await user.click(screen.getByRole('button', { name: /Sửa đồng giá Cả Hà Nội/ }));
      const dialog = await screen.findByRole('dialog');
      const car7 = within(dialog).getByLabelText('Bao xe 7 chỗ (đ)');
      await user.clear(car7);
      await user.type(car7, '360000');
      await user.click(within(dialog).getByRole('button', { name: 'Xem lại & lưu' }));
      getRows.mockResolvedValue([]); // admin khác đã xoá hàng
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Xác nhận lưu' }));
      await waitFor(() => expect(screen.getByTestId('no-flat-rows')).toBeInTheDocument());
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Xem lại & lưu' }));
      const confirm = await screen.findByRole('alertdialog');
      expect(confirm).toHaveTextContent('Thêm đồng giá Sân bay Nội Bài — Cả Hà Nội (mặc định)');
      expect(confirm).toHaveTextContent('Bao xe 7 chỗ: không áp đồng giá → 360.000 đ');
    });

    it('"Làm mới" không gỡ thẻ vùng: hộp thoại đang mở và số chưa lưu còn nguyên', async () => {
      const user = await setup([row({ id: 1 })]);
      await user.click(screen.getByRole('button', { name: /Sửa đồng giá Cả Hà Nội/ }));
      const dialog = await screen.findByRole('dialog');
      const car7 = within(dialog).getByLabelText('Bao xe 7 chỗ (đ)');
      await user.clear(car7);
      await user.type(car7, '360000');

      // Hộp thoại modal che nút; fireEvent mô phỏng việc làm mới xảy ra khi hộp thoại đang mở.
      fireEvent.click(screen.getByRole('button', { name: /Làm mới/, hidden: true }));
      await waitFor(() => expect(getZones).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(getRows).toHaveBeenCalledTimes(2)); // thẻ vẫn nạp lại hàng đồng giá

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(within(screen.getByRole('dialog')).getByLabelText('Bao xe 7 chỗ (đ)')).toHaveValue('360000');
    });

    it('làm mới thất bại khi đã có danh sách: giữ các thẻ, hiện cảnh báo + thử lại', async () => {
      const user = await setup([row({ id: 1 })]);
      getZones.mockRejectedValueOnce(new Error('Mất kết nối'));
      await user.click(screen.getByRole('button', { name: /Làm mới/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Không làm mới được danh sách điểm đặc biệt: Mất kết nối');
      expect(screen.getByTestId('zone-NOIBAI')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Thử lại' }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });
  });

  describe('danh sách phường rỗng hoặc lỗi', () => {
    it('rỗng (backend nuốt lỗi DB trả []): hiện gợi ý + thử lại thay vì chỉ "Cả tỉnh" im lặng', async () => {
      const user = await setup([]);
      getWards.mockResolvedValueOnce([]);
      await user.click(screen.getByRole('button', { name: /Thêm đồng giá/ }));
      const hint = await screen.findByTestId('wards-empty');
      expect(hint).toHaveTextContent(/Không có phường\/xã nào của Hà Nội/);
      expect(hint).toHaveTextContent(/hàng mặc định cả tỉnh/);

      await user.click(within(hint).getByRole('button', { name: 'Thử lại' }));
      expect(await screen.findByRole('option', { name: /Phường Ba Đình/ })).toBeInTheDocument();
      expect(screen.queryByTestId('wards-empty')).not.toBeInTheDocument();
      expect(getWards).toHaveBeenCalledTimes(2);
    });

    it('rỗng thì mở lại hộp thoại sẽ nạp lại (không coi [] là đã tải)', async () => {
      const user = await setup([]);
      getWards.mockResolvedValueOnce([]);
      await user.click(screen.getByRole('button', { name: /Thêm đồng giá/ }));
      await screen.findByTestId('wards-empty');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Huỷ' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: /Thêm đồng giá/ }));
      expect(await screen.findByRole('option', { name: /Phường Ba Đình/ })).toBeInTheDocument();
      expect(getWards).toHaveBeenCalledTimes(2);
    });

    it('lỗi mạng: hiện lỗi + thử lại', async () => {
      const user = await setup([]);
      getWards.mockRejectedValueOnce(new Error('Mất kết nối'));
      await user.click(screen.getByRole('button', { name: /Thêm đồng giá/ }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Mất kết nối');
      await user.click(within(alert).getByRole('button', { name: 'Thử lại' }));
      expect(await screen.findByRole('option', { name: /Phường Ba Đình/ })).toBeInTheDocument();
    });
  });

  describe('nhãn "Áp cho"', () => {
    it('thêm mới: nhãn trỏ đúng vào ô chọn', async () => {
      const user = await setup([]);
      await user.click(screen.getByRole('button', { name: /Thêm đồng giá/ }));
      const dialog = await screen.findByRole('dialog');
      const label = dialog.querySelector('label[for="sz-target-NOIBAI"]');
      expect(label).not.toBeNull();
      expect(dialog.querySelector('#sz-target-NOIBAI')).not.toBeNull();
    });

    it('sửa hàng có sẵn: nơi áp là chữ cố định, không còn <label for> trỏ vào ô không tồn tại', async () => {
      const user = await setup([row({ id: 1 })]);
      await user.click(screen.getByRole('button', { name: /Sửa đồng giá Cả Hà Nội/ }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog.querySelector('label[for^="sz-target-"]')).toBeNull();
      expect(dialog.querySelector('[id^="sz-target-"]')).toBeNull();
      expect(within(dialog).getByText('Áp cho')).toBeInTheDocument();
      expect(within(dialog).getByTestId('flat-target-fixed')).toHaveTextContent('Cả Hà Nội (mặc định)');
    });
  });
});
