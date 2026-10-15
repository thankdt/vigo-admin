import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminUnit, Driver } from '@/lib/types';

/**
 * Luồng "Sửa tỉnh" trong hộp thoại chi tiết tài xế (drivers-table.tsx).
 *
 * PUT /drivers/admin/:id/provinces THAY CẢ tập tỉnh của tài, nên mã tỉnh nạp cho tài A mà lọt
 * sang hộp thoại của tài B rồi bấm Lưu là ghi đè im lặng vùng hoạt động của B. Ba đường làm lọt:
 *  1. đóng hộp thoại khi đang sửa mà state sửa không bị reset;
 *  2. bấm "Sửa" (đang nạp danh mục tỉnh) rồi đóng / sang tài khác — kết quả nạp về muộn ghi vào
 *     tài mới (danh mục nạp bằng `await` TRƯỚC khi gọi setEditingProvinces, dùng `viewDriver` là
 *     bản chụp của tài lúc bấm);
 *  3. đóng hộp thoại bằng nút KHÔNG đi qua onOpenChange (khoá, tạm khoá, "Đưa lại Chờ duyệt"…).
 *
 * Cùng cơ chế với các trình sửa khác của hộp thoại (dịch vụ, tên, xe, form từ chối): nhóm test
 * thứ ba kiểm chúng cũng bị bỏ khi đổi tài, và nhóm cuối kiểm lưu tại chỗ cùng một tài (id giữ
 * nguyên) KHÔNG làm mất ô đang sửa.
 */

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));

// `toast` PHẢI ổn định: fetchDrivers phụ thuộc nó, đổi identity mỗi lần render là nạp lại vô tận.
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

vi.mock('@/lib/api', () => ({
  getDrivers: vi.fn(),
  getSurvivingProvinces: vi.fn(),
  updateDriverProvinces: vi.fn(),
  updateDriverServices: vi.fn(),
  updateDriverProfile: vi.fn(),
  rejectDriver: vi.fn(),
}));

// MultiSelectComboBox = Popover(modal) + cmdk. Lồng trong Dialog của Radix, hai FocusScope tranh nhau
// trong jsdom và lặp vô hạn (không xảy ra ở trình duyệt thật; xem macro-bulk-dialog.test.tsx). Thay bằng
// danh sách checkbox: test này kiểm trạng thái sửa tỉnh của bảng, không kiểm cmdk.
vi.mock('@/components/ui/multi-select-combobox', () => ({
  MultiSelectComboBox: ({
    options,
    selectedValues,
    onSelectedValuesChange,
  }: {
    options: { value: string; label: string }[];
    selectedValues: string[];
    onSelectedValuesChange: (v: string[]) => void;
  }) => (
    <fieldset aria-label="Chọn tỉnh">
      {options.map((o) => (
        <label key={o.value}>
          <input
            type="checkbox"
            aria-label={`Chọn ${o.label}`}
            checked={selectedValues.includes(o.value)}
            onChange={() =>
              onSelectedValuesChange(
                selectedValues.includes(o.value)
                  ? selectedValues.filter((v) => v !== o.value)
                  : [...selectedValues, o.value],
              )
            }
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  ),
}));

// Các khối con tự gọi API lúc mount — không liên quan tới luồng sửa tỉnh.
vi.mock('./driver-note-select', () => ({ DriverNoteSelect: () => null }));
vi.mock('./driver-reputation-section', () => ({ DriverReputationSection: () => null }));
vi.mock('./driver-detail-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./driver-detail-dialog')>()),
  ApprovalTimeline: () => null,
  DriverCallTimeline: () => null,
}));

import {
  getDrivers,
  getSurvivingProvinces,
  rejectDriver,
  updateDriverProfile,
  updateDriverProvinces,
  updateDriverServices,
} from '@/lib/api';
import { DriversTable } from './drivers-table';

const CATALOG: AdminUnit[] = [
  { id: 101, name: 'Nội đô Hà Nội', level: 'PROVINCE', gisCode: '01' },
  { id: 102, name: 'Hải Phòng', level: 'PROVINCE', gisCode: '31' },
  { id: 103, name: 'Quảng Ninh', level: 'PROVINCE', gisCode: '22' },
];

const driverA = {
  id: 'drv-a',
  name: 'Tài xế A',
  phone: '0900000001',
  isApproved: true,
  provinces: [{ id: 101, name: 'Nội đô Hà Nội', gisCode: '01' }],
  enabledServices: ['RIDE'],
  vehicleRegistration: { plateNumber: '30A-111.11', brand: 'Toyota', model: 'Vios', color: 'Trắng', seats: 5 },
} as Driver;

const driverB = {
  id: 'drv-b',
  name: 'Tài xế B',
  phone: '0900000002',
  isApproved: true,
  provinces: [{ id: 102, name: 'Hải Phòng', gisCode: '31' }],
  enabledServices: ['CARPOOL'],
  vehicleRegistration: { plateNumber: '51B-222.22', brand: 'Kia', model: 'Carens', color: 'Đen', seats: 7 },
} as Driver;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Khối (tiêu đề h4 + nội dung) của hộp thoại chi tiết đang mở, tìm theo tiêu đề. */
const sectionOf = (heading: string) => screen.getByText(heading).closest('.border-t') as HTMLElement;

const provincesSection = () => sectionOf('Khu vực hoạt động (Tỉnh)');
const servicesSection = () => sectionOf('Dịch vụ được phép');
const vehicleSection = () => sectionOf('Đăng ký xe');

const saveButton = () => within(provincesSection()).queryByRole('button', { name: 'Lưu' });
const editButton = () => within(provincesSection()).getByRole('button', { name: 'Sửa' });

/**
 * Đợi tới khi khối tỉnh hết "đang nạp" (nút Sửa hoặc Lưu bấm được), RỒI mới cho test khẳng định
 * chế độ nào đang hiện — để lỗi báo "đang ở chế độ sửa" chứ không phải "không thấy nút Sửa".
 */
async function settled() {
  await waitFor(() =>
    expect(within(provincesSection()).getByRole('button', { name: /^(Sửa|Lưu)$/ })).toBeEnabled(),
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function openDriver(user: User, name: string) {
  await user.click(await screen.findByText(name, {}, { timeout: 3000 }));
  await screen.findByRole('dialog');
}

async function closeDetailDialog(user: User) {
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

/**
 * Đóng hộp thoại chi tiết bằng nút gọi setViewDriver(null) THẲNG (không qua onOpenChange):
 * "Khoá tài khoản (vĩnh viễn)" rồi Huỷ hộp xác nhận khoá — tài vẫn chưa bị khoá.
 */
async function closeViaBanButton(user: User) {
  await user.click(screen.getByRole('button', { name: /Khoá tài khoản \(vĩnh viễn\)/ }));
  await user.click(await screen.findByRole('button', { name: 'Huỷ' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
}

/** Bấm "Sửa" ở khối tỉnh và đợi tới khi vào chế độ sửa (có nút Lưu). */
async function startEditing(user: User) {
  await user.click(editButton());
  await waitFor(() => expect(saveButton()).toBeInTheDocument());
}

const toggleProvince = (user: User, label: string) =>
  user.click(within(provincesSection()).getByRole('checkbox', { name: `Chọn ${label}` }));

beforeEach(() => {
  // reset (không chỉ clear): hàng đợi `...Once` của test trước không được rơi sang test sau.
  vi.resetAllMocks();
  vi.mocked(getDrivers).mockResolvedValue({ data: [driverA, driverB], meta: { total: 2, limit: 20 } } as never);
  vi.mocked(getSurvivingProvinces).mockResolvedValue(CATALOG);
  vi.mocked(updateDriverProvinces).mockResolvedValue({} as never);
  vi.mocked(updateDriverServices).mockResolvedValue({} as never);
  vi.mocked(updateDriverProfile).mockResolvedValue({} as never);
  vi.mocked(rejectDriver).mockResolvedValue({} as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DriversTable — sửa tỉnh không rò trạng thái sang tài khác', () => {
  it('đóng hộp thoại khi đang sửa → mở tài khác ở chế độ XEM, và Lưu chỉ gửi tỉnh của chính tài đó', async () => {
    const user = userEvent.setup();
    render(<DriversTable />);

    await openDriver(user, 'Tài xế A');
    await startEditing(user);

    await closeDetailDialog(user);
    await openDriver(user, 'Tài xế B');

    // B hiện chế độ xem: có nút Sửa, KHÔNG có Lưu, và thấy tỉnh của B (không phải của A).
    expect(saveButton()).not.toBeInTheDocument();
    expect(editButton()).toBeEnabled();
    expect(within(provincesSection()).getByText('Hải Phòng')).toBeInTheDocument();

    // Vào sửa rồi Lưu: PUT tới B với đúng tỉnh của B.
    await startEditing(user);
    await user.click(saveButton()!);
    await waitFor(() => expect(updateDriverProvinces).toHaveBeenCalledTimes(1));
    expect(updateDriverProvinces).toHaveBeenCalledWith('drv-b', {
      provinceCodes: ['31'],
      provinceIds: [102],
    });
  });

  it('bấm Sửa (đang nạp danh mục) rồi đóng và mở tài khác → kết quả nạp về muộn bị bỏ', async () => {
    const user = userEvent.setup();
    const catalog = deferred<AdminUnit[]>();
    // Lần 1: ô lọc tỉnh nạp lúc mount. Lần 2: "Sửa" của bảng — treo cho tới khi test cho về.
    vi.mocked(getSurvivingProvinces)
      .mockResolvedValueOnce(CATALOG)
      .mockImplementationOnce(() => catalog.promise);
    render(<DriversTable />);

    await openDriver(user, 'Tài xế A');
    await user.click(editButton());
    await waitFor(() => expect(getSurvivingProvinces).toHaveBeenCalledTimes(2));

    await closeDetailDialog(user);
    await openDriver(user, 'Tài xế B');

    catalog.resolve(CATALOG);
    await settled();

    expect(saveButton()).not.toBeInTheDocument();
    expect(within(provincesSection()).getByText('Hải Phòng')).toBeInTheDocument();
    expect(updateDriverProvinces).not.toHaveBeenCalled();
  });

  it('bấm Sửa (đang nạp) rồi đóng hộp thoại → nạp xong không tự bật chế độ sửa khi mở lại', async () => {
    const user = userEvent.setup();
    const catalog = deferred<AdminUnit[]>();
    vi.mocked(getSurvivingProvinces)
      .mockResolvedValueOnce(CATALOG)
      .mockImplementationOnce(() => catalog.promise);
    render(<DriversTable />);

    await openDriver(user, 'Tài xế A');
    await user.click(editButton());
    await waitFor(() => expect(getSurvivingProvinces).toHaveBeenCalledTimes(2));
    await closeDetailDialog(user);

    // Danh mục về khi hộp thoại đã đóng.
    catalog.resolve(CATALOG);
    await catalog.promise;

    await openDriver(user, 'Tài xế A');
    await settled();
    expect(saveButton()).not.toBeInTheDocument();
  });

  it('đóng hộp thoại bằng nút không qua onOpenChange (Khoá tài khoản → Huỷ) → tài khác ở chế độ xem', async () => {
    const user = userEvent.setup();
    render(<DriversTable />);

    await openDriver(user, 'Tài xế A');
    await startEditing(user);

    // Nút này gọi setViewDriver(null) thẳng, KHÔNG đi qua onOpenChange của hộp thoại.
    await closeViaBanButton(user);

    await openDriver(user, 'Tài xế B');

    expect(saveButton()).not.toBeInTheDocument();
    expect(editButton()).toBeEnabled();
    expect(updateDriverProvinces).not.toHaveBeenCalled();
  });
});

describe('DriversTable — Lưu tỉnh', () => {
  it('gửi đúng tập mã (provinceCodes) kèm provinceIds tương ứng, đúng một lần', async () => {
    const user = userEvent.setup();
    render(<DriversTable />);

    await openDriver(user, 'Tài xế B');
    await startEditing(user);
    await toggleProvince(user, 'Quảng Ninh');
    await user.click(saveButton()!);

    await waitFor(() => expect(updateDriverProvinces).toHaveBeenCalledTimes(1));
    expect(updateDriverProvinces).toHaveBeenCalledWith('drv-b', {
      provinceCodes: ['31', '22'],
      provinceIds: [102, 103],
    });
  });

  it('gỡ hết tỉnh: huỷ hộp xác nhận thì KHÔNG ghi; đồng ý thì gửi hai mảng rỗng', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<DriversTable />);

    await openDriver(user, 'Tài xế B');
    await startEditing(user);
    await toggleProvince(user, 'Hải Phòng');
    await user.click(saveButton()!);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(updateDriverProvinces).not.toHaveBeenCalled();
    expect(saveButton()).toBeInTheDocument(); // vẫn ở chế độ sửa

    confirm.mockReturnValue(true);
    await user.click(saveButton()!);
    await waitFor(() => expect(updateDriverProvinces).toHaveBeenCalledTimes(1));
    expect(updateDriverProvinces).toHaveBeenCalledWith('drv-b', { provinceCodes: [], provinceIds: [] });
  });

  it('nạp danh mục tỉnh lỗi → báo lỗi và KHÔNG vào chế độ sửa (Lưu sẽ gỡ hết tỉnh của tài)', async () => {
    const user = userEvent.setup();
    vi.mocked(getSurvivingProvinces)
      .mockResolvedValueOnce(CATALOG)
      .mockRejectedValueOnce(new Error('mất mạng'));
    render(<DriversTable />);

    await openDriver(user, 'Tài xế B');
    await user.click(editButton());

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Không tải được danh sách tỉnh', description: 'mất mạng' }),
      ),
    );
    await settled();
    expect(saveButton()).not.toBeInTheDocument();
  });
});

describe('DriversTable — các trình sửa khác của hộp thoại cũng không rò sang tài khác', () => {
  // Cả bốn test đóng hộp thoại bằng nút gọi setViewDriver(null) thẳng (không qua onOpenChange) —
  // đường duy nhất mà ô sửa dở còn sống sót khi chưa có reset theo id tài.

  it('đang sửa dịch vụ → tài khác ở chế độ xem, và Lưu chỉ gửi dịch vụ của chính tài đó', async () => {
    const user = userEvent.setup();
    render(<DriversTable />);

    await openDriver(user, 'Tài xế A');
    await user.click(within(servicesSection()).getByRole('button', { name: 'Sửa' }));
    await user.click(within(servicesSection()).getByRole('checkbox', { name: 'Giao hàng' })); // A: RIDE + DELIVERY
    expect(within(servicesSection()).getByRole('button', { name: 'Lưu' })).toBeInTheDocument();

    await closeViaBanButton(user);
    await openDriver(user, 'Tài xế B');

    expect(within(servicesSection()).queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    expect(within(servicesSection()).getByText('Đi chung')).toBeInTheDocument(); // dịch vụ của B

    await user.click(within(servicesSection()).getByRole('button', { name: 'Sửa' }));
    await user.click(within(servicesSection()).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(updateDriverServices).toHaveBeenCalledTimes(1));
    expect(updateDriverServices).toHaveBeenCalledWith('drv-b', ['CARPOOL']);
  });

  it('đang sửa tên → tài khác không còn ô sửa tên (không mang tên gõ dở), và Lưu chỉ gửi tên của chính tài đó', async () => {
    const user = userEvent.setup();
    render(<DriversTable />);

    await openDriver(user, 'Tài xế A');
    await user.click(screen.getByRole('button', { name: 'Sửa tên' }));
    const draftA = screen.getByDisplayValue('Tài xế A');
    await user.clear(draftA);
    await user.type(draftA, 'Tên A gõ dở');

    await closeViaBanButton(user);
    await openDriver(user, 'Tài xế B');

    expect(screen.queryByDisplayValue('Tên A gõ dở')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tài xế B' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sửa tên' }));
    const draftB = screen.getByDisplayValue('Tài xế B'); // nạp lại từ B, không phải bản nháp của A
    await user.clear(draftB);
    await user.type(draftB, 'Tên B mới');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(updateDriverProfile).toHaveBeenCalledTimes(1));
    expect(updateDriverProfile).toHaveBeenCalledWith('drv-b', { fullName: 'Tên B mới' });
  });

  it('đang sửa xe → tài khác không còn ô sửa xe (không mang biển số gõ dở), và Lưu chỉ gửi trường của chính tài đó', async () => {
    const user = userEvent.setup();
    render(<DriversTable />);

    await openDriver(user, 'Tài xế A');
    await user.click(within(vehicleSection()).getByRole('button', { name: 'Sửa' }));
    const plateA = within(vehicleSection()).getByDisplayValue('30A-111.11');
    await user.clear(plateA);
    await user.type(plateA, '99X-999.99');

    await closeViaBanButton(user);
    await openDriver(user, 'Tài xế B');

    expect(screen.queryByDisplayValue('99X-999.99')).not.toBeInTheDocument();
    expect(within(vehicleSection()).queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    expect(within(vehicleSection()).getByText('51B-222.22')).toBeInTheDocument();

    await user.click(within(vehicleSection()).getByRole('button', { name: 'Sửa' }));
    const plateB = within(vehicleSection()).getByDisplayValue('51B-222.22');
    await user.clear(plateB);
    await user.type(plateB, '51B-333.33');
    await user.click(within(vehicleSection()).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(updateDriverProfile).toHaveBeenCalledTimes(1));
    // Chỉ trường ĐỔI, và là giá trị của B — không có hãng/dòng/màu/ghế của A.
    expect(updateDriverProfile).toHaveBeenCalledWith('drv-b', {
      vehicleRegistration: { plateNumber: '51B-333.33' },
    });
  });

  it('đang mở form Từ chối (đã gõ ghi chú) → tài khác về lại nút Từ chối, form trống, chưa từ chối ai', async () => {
    const user = userEvent.setup();
    render(<DriversTable />);

    await openDriver(user, 'Tài xế A');
    await user.click(screen.getByRole('button', { name: 'Từ chối' }));
    await user.type(screen.getByPlaceholderText('Ghi chú cho admin…'), 'Ghi chú của A');

    // Khi form đang mở, nút Khoá bị ẩn; "Nạp / trừ tiền" cũng gọi setViewDriver(null) thẳng.
    await user.click(screen.getByRole('button', { name: /Nạp \/ trừ tiền/ }));
    await screen.findByText('Nạp / trừ tiền tài xế');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openDriver(user, 'Tài xế B');

    expect(screen.queryByRole('button', { name: 'Xác nhận từ chối' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Ghi chú cho admin…')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(screen.getByPlaceholderText('Ghi chú cho admin…')).toHaveValue('');
    expect(rejectDriver).not.toHaveBeenCalled();
  });
});

describe('DriversTable — lưu tại chỗ cùng một tài không làm mất ô đang sửa', () => {
  it('lưu tên (viewDriver đổi object, giữ id) khi đang sửa tỉnh và dịch vụ → hai ô kia vẫn mở và lưu được', async () => {
    const user = userEvent.setup();
    // Đúng dạng backend trả: hồ sơ của CHÍNH tài đó (cùng id), được trộn vào viewDriver.
    vi.mocked(updateDriverProfile).mockResolvedValue({ id: 'drv-a', name: 'Tên mới của A' } as never);
    render(<DriversTable />);

    await openDriver(user, 'Tài xế A');
    await startEditing(user);
    await toggleProvince(user, 'Quảng Ninh'); // tỉnh đang chọn: 01 + 22
    await user.click(within(servicesSection()).getByRole('button', { name: 'Sửa' }));
    await user.click(within(servicesSection()).getByRole('checkbox', { name: 'Giao hàng' })); // RIDE + DELIVERY

    await user.click(screen.getByRole('button', { name: 'Sửa tên' }));
    const draft = screen.getByDisplayValue('Tài xế A');
    await user.clear(draft);
    await user.type(draft, 'Tên mới của A{Enter}');

    await waitFor(() =>
      expect(updateDriverProfile).toHaveBeenCalledWith('drv-a', { fullName: 'Tên mới của A' }),
    );
    expect(await screen.findByRole('heading', { name: 'Tên mới của A' })).toBeInTheDocument();

    // Hai ô sửa còn lại KHÔNG bị đóng, và giữ nguyên phần đã chọn.
    expect(saveButton()).toBeInTheDocument();
    expect(within(provincesSection()).getByRole('checkbox', { name: 'Chọn Quảng Ninh' })).toBeChecked();
    expect(within(servicesSection()).getByRole('button', { name: 'Lưu' })).toBeInTheDocument();
    expect(within(servicesSection()).getByRole('checkbox', { name: 'Giao hàng' })).toBeChecked();

    // Và vẫn lưu được, tới đúng tài A.
    await user.click(saveButton()!);
    await waitFor(() => expect(updateDriverProvinces).toHaveBeenCalledTimes(1));
    expect(updateDriverProvinces).toHaveBeenCalledWith('drv-a', {
      provinceCodes: ['01', '22'],
      provinceIds: [101, 103],
    });
    await user.click(within(servicesSection()).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(updateDriverServices).toHaveBeenCalledTimes(1));
    expect(updateDriverServices).toHaveBeenCalledWith('drv-a', ['RIDE', 'DELIVERY']);
  });
});
