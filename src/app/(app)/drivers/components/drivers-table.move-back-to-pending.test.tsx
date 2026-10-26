import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Driver } from '@/lib/types';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

vi.mock('@/lib/api', () => ({
  getDrivers: vi.fn(),
  getDriversNeedsReviewCount: vi.fn(),
  getSurvivingProvinces: vi.fn(),
  moveDriverBackToPending: vi.fn(),
}));

vi.mock('./driver-note-select', () => ({ DriverNoteSelect: () => null }));
vi.mock('./driver-reputation-section', () => ({ DriverReputationSection: () => null }));
vi.mock('./driver-detail-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./driver-detail-dialog')>()),
  ApprovalTimeline: () => null,
  DriverCallTimeline: () => null,
}));

import {
  getDrivers,
  getDriversNeedsReviewCount,
  getSurvivingProvinces,
  moveDriverBackToPending,
} from '@/lib/api';
import { DriversTable } from './drivers-table';

const approvedDriver = {
  id: 'drv-approved',
  name: 'Tài xế Đã Duyệt',
  phone: '0900000001',
  isApproved: true,
  rejectionReason: null,
  provinces: [{ id: 101, name: 'Nội đô Hà Nội', gisCode: '01' }],
  enabledServices: ['RIDE'],
  vehicleRegistration: { plateNumber: '30A-111.11', brand: 'Toyota', model: 'Vios', color: 'Trắng', seats: 5 },
} as Driver;

const rejectedDriver = {
  id: 'drv-rejected',
  name: 'Tài xế Từ Chối',
  phone: '0900000002',
  isApproved: false,
  rejectionReason: 'Thiếu ảnh xe',
  provinces: [{ id: 102, name: 'Hải Phòng', gisCode: '31' }],
  enabledServices: ['CARPOOL'],
  vehicleRegistration: { plateNumber: '51B-222.22', brand: 'Kia', model: 'Carens', color: 'Đen', seats: 7 },
} as Driver;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getDrivers).mockResolvedValue({
    data: [approvedDriver, rejectedDriver],
    meta: { total: 2, limit: 20 },
  } as never);
  vi.mocked(getDriversNeedsReviewCount).mockResolvedValue({ count: 0 } as never);
  vi.mocked(getSurvivingProvinces).mockResolvedValue([]);
  vi.mocked(moveDriverBackToPending).mockResolvedValue({} as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DriversTable — Đưa lại Chờ duyệt cho tài xế đã duyệt và từ chối', () => {
  it('hiển thị nút "Đưa lại Chờ duyệt" ở hộp thoại chi tiết tài xế đã duyệt và gọi moveDriverBackToPending khi xác nhận', async () => {
    const user = userEvent.setup();
    render(<DriversTable />);

    await user.click(await screen.findByText('Tài xế Đã Duyệt', {}, { timeout: 3000 }));
    await screen.findByRole('dialog');

    const moveBackBtn = screen.getByRole('button', { name: /Đưa lại Chờ duyệt/ });
    expect(moveBackBtn).toBeInTheDocument();

    await user.click(moveBackBtn);

    const alertDialog = await screen.findByRole('alertdialog');
    expect(
      within(alertDialog).getByText(/sẽ chuyển từ "Đã duyệt" về "Chờ duyệt"/),
    ).toBeInTheDocument();

    await user.type(
      within(alertDialog).getByPlaceholderText('Ghi chú cho admin…'),
      'Rà soát lại hồ sơ',
    );
    await user.click(within(alertDialog).getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(moveDriverBackToPending).toHaveBeenCalledWith(
        'drv-approved',
        'Rà soát lại hồ sơ',
      ),
    );
  });

  it('hiển thị thông báo xoá lý do từ chối khi đưa tài xế đang bị từ chối về Chờ duyệt', async () => {
    const user = userEvent.setup();
    render(<DriversTable />);

    await user.click(await screen.findByText('Tài xế Từ Chối', {}, { timeout: 3000 }));
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: /Đưa lại Chờ duyệt/ }));

    const alertDialog = await screen.findByRole('alertdialog');
    expect(
      within(alertDialog).getByText(
        /sẽ chuyển từ "Từ chối" về "Chờ duyệt"\. Lý do từ chối cũ sẽ bị xoá\./,
      ),
    ).toBeInTheDocument();
  });
});
