import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Driver } from '@/lib/types';

const getDrivers = vi.fn();
const setDriverHiddenTripLock = vi.fn();
const getSurvivingProvinces = vi.fn();

vi.mock('@/lib/api', () => ({
  getDrivers: (...a: unknown[]) => getDrivers(...a),
  approveDriver: vi.fn(),
  rejectDriver: vi.fn(),
  assignTransportCompany: vi.fn(),
  getTransportCompanyList: vi.fn(async () => []),
  updateDriverServices: vi.fn(),
  updateDriverProfile: vi.fn(),
  moveDriverBackToPending: vi.fn(),
  getSurvivingProvinces: (...a: unknown[]) => getSurvivingProvinces(...a),
  updateDriverProvinces: vi.fn(),
  getPresignedUrl: vi.fn(),
  uploadToS3: vi.fn(),
  banDriver: vi.fn(),
  unbanDriver: vi.fn(),
  suspendDriver: vi.fn(),
  unsuspendDriver: vi.fn(),
  setDriverHiddenTripLock: (...a: unknown[]) => setDriverHiddenTripLock(...a),
  updateDriverCsStatus: vi.fn(),
  adminAdjustDriverWallet: vi.fn(),
  getDriverApprovalHistory: vi.fn(async () => []),
  getDriverCallHistory: vi.fn(async () => []),
  recordDriverCall: vi.fn(),
  getDriverReputation: vi.fn(async () => null),
  getDriverRatings: vi.fn(async () => ({ items: [], total: 0 })),
  getDriverNotePresets: vi.fn(async () => []),
  createDriverNotePreset: vi.fn(),
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', fullName: 'Admin', role: 'ADMIN', functions: ['drivers'] },
    can: () => true,
    hasFunction: () => true,
  }),
}));

import { DriversTable } from './drivers-table';
import { DriversFilterBar, EMPTY_FILTERS, hasAnyFilter } from './drivers-filter-bar';

const makeDriver = (overrides: Partial<Driver> = {}): Driver =>
  ({
    id: 'drv-1',
    name: 'Nguyễn Văn A',
    phone: '0901234567',
    isApproved: true,
    status: 'ONLINE',
    isBanned: false,
    suspendedUntil: null,
    tripReceiveHidden: false,
    tripReceiveHiddenAt: null,
    user: { id: 'user-1', fullName: 'Nguyễn Văn A', phone: '0901234567' },
    provinces: [{ id: 1, name: 'Hà Nội', gisCode: '01' }],
    wallets: { deposit: 500000, main: 0 },
    ...overrides,
  }) as Driver;

beforeEach(() => {
  getDrivers.mockReset();
  setDriverHiddenTripLock.mockReset();
  getSurvivingProvinces.mockReset();
  toast.mockReset();

  getSurvivingProvinces.mockResolvedValue([
    { id: 1, name: 'Hà Nội', level: 'PROVINCE', gisCode: '01' },
  ]);
});

describe('DriversTable — nút & hộp thoại khoá ẩn nhận chuyến', () => {
  it('hiện nút Khoá ẩn nhận chuyến trực tiếp ở phần tài xế và mở hộp thoại xác nhận', async () => {
    const user = userEvent.setup();
    const driver = makeDriver({ tripReceiveHidden: false });
    getDrivers.mockResolvedValue({ data: [driver], meta: { total: 1, limit: 20 } });
    setDriverHiddenTripLock.mockResolvedValue({ ...driver, tripReceiveHidden: true });

    render(<DriversTable />);

    const lockBtn = await screen.findByRole('button', { name: /Khoá ẩn nhận chuyến/i });
    expect(lockBtn).toBeInTheDocument();
    expect(setDriverHiddenTripLock).not.toHaveBeenCalled();

    // Bấm nút ở phần tài xế → mở hộp thoại xác nhận (KHÔNG tự mở dialog chi tiết hay gọi API ngay)
    await user.click(lockBtn);

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/Tài xế vẫn dùng app bình thường/i)).toBeInTheDocument();
    expect(setDriverHiddenTripLock).not.toHaveBeenCalled();

    // Bấm Huỷ → đóng dialog, không gọi API
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(setDriverHiddenTripLock).not.toHaveBeenCalled();

    // Mở lại, nhập ghi chú nội bộ và xác nhận
    await user.click(screen.getByRole('button', { name: /Khoá ẩn nhận chuyến/i }));
    const noteBox = await screen.findByPlaceholderText(/Ghi chú nội bộ cho admin/i);
    await user.type(noteBox, 'nghi vấn huỷ ngoài app');
    await user.click(screen.getByRole('button', { name: 'Xác nhận khoá ẩn' }));

    await waitFor(() =>
      expect(setDriverHiddenTripLock).toHaveBeenCalledWith('drv-1', true, 'nghi vấn huỷ ngoài app'),
    );
  });

  it('hiện badge Đang khoá ẩn chuyến và cho phép xác nhận mở khoá ẩn', async () => {
    const user = userEvent.setup();
    const driver = makeDriver({
      tripReceiveHidden: true,
      tripReceiveHiddenAt: '2026-11-18T05:00:00.000Z',
    });
    getDrivers.mockResolvedValue({ data: [driver], meta: { total: 1, limit: 20 } });
    setDriverHiddenTripLock.mockResolvedValue({ ...driver, tripReceiveHidden: false });

    render(<DriversTable />);

    expect(await screen.findByText('Đang khoá ẩn chuyến')).toBeInTheDocument();
    const unlockBtn = screen.getByRole('button', { name: /Mở khoá ẩn chuyến/i });
    await user.click(unlockBtn);

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/xuất hiện lại trong danh sách gán tay/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xác nhận mở khoá ẩn' }));

    await waitFor(() =>
      expect(setDriverHiddenTripLock).toHaveBeenCalledWith('drv-1', false, ''),
    );
  });

  it('DriversFilterBar cho phép lọc theo trạng thái khoá ẩn nhận chuyến', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<DriversFilterBar value={EMPTY_FILTERS} onChange={onChange} />);
    await waitFor(() => expect(getSurvivingProvinces).toHaveBeenCalled());

    const combo = screen
      .getAllByRole('combobox')
      .find((el) => el.textContent?.includes('Khoá ẩn chuyến: tất cả'));
    expect(combo).toBeTruthy();

    await user.click(combo!);
    await user.click(await screen.findByRole('option', { name: 'Đang khoá ẩn chuyến' }));

    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_FILTERS,
      tripReceiveHidden: 'true',
    });
    expect(hasAnyFilter({ ...EMPTY_FILTERS, tripReceiveHidden: 'true' })).toBe(true);
  });
});
