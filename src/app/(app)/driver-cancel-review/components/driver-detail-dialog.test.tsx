import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DriverDetailDialog } from './driver-detail-dialog';
import type { DriverCancelStat } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  getDriverCancelDetail: vi.fn(),
  getDriverApprovalHistory: vi.fn(),
  getDriverCancelCheckHistory: vi.fn(),
  upsertDriverCancelCheck: vi.fn(),
  banDriver: vi.fn(),
  unbanDriver: vi.fn(),
  suspendDriver: vi.fn(),
  unsuspendDriver: vi.fn(),
}));

import {
  getDriverCancelDetail,
  getDriverApprovalHistory,
  getDriverCancelCheckHistory,
  upsertDriverCancelCheck,
  banDriver,
  unbanDriver,
  suspendDriver,
} from '@/lib/api';

const stat: DriverCancelStat = {
  driverEntityId: 'de1',
  driverUserId: 'du1',
  fullName: 'Tài A',
  phone: '0900000001',
  assignedTrips: 10,
  customerCancels: 4,
  ratePct: 40,
  cancelRuleAStrikes: 2,
  suspendedUntil: null,
  isBanned: false,
  depositForfeitFlagged: false,
  lastAlertReason: null,
  lastAlertAt: null,
};

const range = { from: '2026-06-19', to: '2026-07-19' };

beforeEach(() => {
  // Mocks are module-level singletons shared across every test in this file —
  // clear call counts (not just re-set resolved values) so toHaveBeenCalledTimes
  // assertions aren't polluted by earlier tests' mounts.
  vi.clearAllMocks();
  vi.mocked(getDriverCancelDetail).mockResolvedValue([
    {
      bookingId: 'b1',
      cancelledAt: '2026-07-15T02:00:00Z',
      acceptedAt: '2026-07-15T01:50:00Z',
      minutesToCancel: 10,
      secondsToCancel: 600,
      durationFromCreated: false,
      cancelReason: 'Đổi ý',
      cancelledByRole: 'CUSTOMER',
      pickupAddress: { address: 'Hà Nội' },
      dropoffAddress: { address: 'Hưng Yên' },
      isVinow: false,
    },
  ]);
  vi.mocked(getDriverApprovalHistory).mockResolvedValue([
    {
      id: 'h1',
      driverId: 'de1',
      action: 'BANNED',
      reason: 'Vi phạm nhiều lần',
      byAdminUserId: 'a1',
      byAdmin: { id: 'a1', fullName: 'Admin B' },
      createdAt: '2026-07-10T02:00:00Z',
    },
  ]);
  vi.mocked(getDriverCancelCheckHistory).mockResolvedValue([]);
  vi.mocked(upsertDriverCancelCheck).mockResolvedValue(undefined);
  vi.mocked(banDriver).mockResolvedValue({} as any);
  vi.mocked(unbanDriver).mockResolvedValue({} as any);
  vi.mocked(suspendDriver).mockResolvedValue({} as any);
});

describe('DriverDetailDialog', () => {
  it('renders nothing when there is no stat', () => {
    const { container } = render(
      <DriverDetailDialog stat={null} range={range} onOpenChange={vi.fn()} onDone={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows driver info, strike count, and deep-links to the full profile', async () => {
    render(<DriverDetailDialog stat={stat} range={range} onOpenChange={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByText(/Tài A/)).toBeInTheDocument();
    expect(screen.getByText('Số lần vi phạm')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem hồ sơ đầy đủ' })).toHaveAttribute(
      'href',
      '/users/detail?id=du1',
    );
  });

  it('fetches and renders the cancelled-trip list with the F6 note', async () => {
    render(<DriverDetailDialog stat={stat} range={range} onOpenChange={vi.fn()} onDone={vi.fn()} />);
    await waitFor(() => expect(getDriverCancelDetail).toHaveBeenCalledWith('de1', range.from, range.to));
    expect(await screen.findByText(/Hà Nội/)).toBeInTheDocument();
    expect(screen.getByText(/Huỷ sau 10 phút/)).toBeInTheDocument();
    expect(
      screen.getByText(/Danh sách mọi chuyến khách huỷ trong khoảng/),
    ).toBeInTheDocument();
  });

  it('shows seconds-precision duration with the "từ lúc đặt" note when anchored on createdAt', async () => {
    vi.mocked(getDriverCancelDetail).mockResolvedValue([
      {
        bookingId: 'b2',
        cancelledAt: '2026-07-15T02:00:00Z',
        acceptedAt: null,
        minutesToCancel: 0,
        secondsToCancel: 45,
        durationFromCreated: true,
        cancelReason: 'Đổi ý',
        cancelledByRole: 'CUSTOMER',
        pickupAddress: { address: 'Hà Nội' },
        dropoffAddress: { address: 'Hưng Yên' },
        isVinow: false,
      },
    ]);
    render(<DriverDetailDialog stat={stat} range={range} onOpenChange={vi.fn()} onDone={vi.fn()} />);
    // "45 giây" and "(từ lúc đặt)" sit in separate text nodes (the latter inside
    // its own <span> for muted styling), so RTL's default text matcher — which
    // only concatenates an element's OWN direct text-node children, not nested
    // elements — can't match a single regex spanning both. Assert separately.
    expect(await screen.findByText(/45 giây/)).toBeInTheDocument();
    expect(screen.getByText(/từ lúc đặt/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no cancelled trips', async () => {
    vi.mocked(getDriverCancelDetail).mockResolvedValue([]);
    render(<DriverDetailDialog stat={stat} range={range} onOpenChange={vi.fn()} onDone={vi.fn()} />);
    expect(await screen.findByText('Không có chuyến nào bị huỷ trong khoảng ngày.')).toBeInTheDocument();
  });

  it('fetches and translates the ban/unban history', async () => {
    render(<DriverDetailDialog stat={stat} range={range} onOpenChange={vi.fn()} onDone={vi.fn()} />);
    await waitFor(() => expect(getDriverApprovalHistory).toHaveBeenCalledWith('de1'));
    const adminName = await screen.findByText(/Admin B/);
    // "Khoá tài khoản (vĩnh viễn)" also appears as the (disabled) action button's own
    // label, so scope the query to the history row itself rather than the whole document.
    const row = adminName.closest('li')!;
    expect(within(row).getByText('Khoá tài khoản (vĩnh viễn)')).toBeInTheDocument();
  });

  it('bans the driver with the entered reason and refetches + calls onDone', async () => {
    const onDone = vi.fn();
    render(<DriverDetailDialog stat={stat} range={range} onOpenChange={vi.fn()} onDone={onDone} />);
    await waitFor(() => expect(getDriverApprovalHistory).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByPlaceholderText('Nhập lý do khoá / tạm khoá...'), 'Câu kéo khách');
    await userEvent.click(screen.getByRole('button', { name: /Khoá tài khoản \(vĩnh viễn\)/ }));

    await waitFor(() => expect(banDriver).toHaveBeenCalledWith('de1', 'Câu kéo khách'));
    expect(onDone).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getDriverApprovalHistory).toHaveBeenCalledTimes(2));
  });

  it('the ban/suspend buttons are disabled until a reason is entered', () => {
    render(<DriverDetailDialog stat={stat} range={range} onOpenChange={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Khoá tài khoản \(vĩnh viễn\)/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Tạm khoá/ })).toBeDisabled();
  });

  it('shows "Gỡ khoá" only when the driver is currently banned or suspended', () => {
    const { rerender } = render(
      <DriverDetailDialog stat={stat} range={range} onOpenChange={vi.fn()} onDone={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Gỡ khoá' })).not.toBeInTheDocument();

    rerender(
      <DriverDetailDialog
        stat={{ ...stat, isBanned: true }}
        range={range}
        onOpenChange={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Gỡ khoá' })).toBeInTheDocument();
  });

  describe('khối admin check case', () => {
    it('mặc định hiện "Chưa check" khi chưa có event nào', async () => {
      render(<DriverDetailDialog stat={stat} range={range} onOpenChange={vi.fn()} onDone={vi.fn()} />);
      await waitFor(() => expect(getDriverCancelCheckHistory).toHaveBeenCalledWith('de1'));
      expect(screen.getByText('Chưa check')).toBeInTheDocument();
    });

    it('bấm "Đã check xong" gửi CHECKED + note (trim) rồi refetch + onDone', async () => {
      const onDone = vi.fn();
      render(<DriverDetailDialog stat={stat} range={range} onOpenChange={vi.fn()} onDone={onDone} />);
      await userEvent.type(screen.getByPlaceholderText(/Note nội bộ cho admin khác/), '  đã gọi tài xế  ');
      await userEvent.click(screen.getByRole('button', { name: 'Đã check xong' }));

      await waitFor(() =>
        expect(upsertDriverCancelCheck).toHaveBeenCalledWith('de1', {
          status: 'CHECKED',
          note: 'đã gọi tài xế',
        }),
      );
      expect(onDone).toHaveBeenCalled();
      // Refetch lịch sử check sau khi lưu (lần mount + lần sau khi bấm).
      expect(vi.mocked(getDriverCancelCheckHistory).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('hiện trạng thái + note + người check từ lịch sử (event mới nhất trước)', async () => {
      vi.mocked(getDriverCancelCheckHistory).mockResolvedValue([
        { id: 'c2', status: 'CHECKED', note: 'ok, theo dõi thêm', createdAt: '2026-07-20T03:00:00Z', byAdminName: 'Admin C' },
        { id: 'c1', status: 'CHECKING', note: null, createdAt: '2026-07-19T03:00:00Z', byAdminName: 'Admin C' },
      ]);
      render(<DriverDetailDialog stat={stat} range={range} onOpenChange={vi.fn()} onDone={vi.fn()} />);

      await waitFor(() => expect(screen.getAllByText('Đã check').length).toBeGreaterThan(0));
      expect(screen.getByText('ok, theo dõi thêm')).toBeInTheDocument();
      expect(screen.getAllByText(/Admin C/).length).toBeGreaterThan(0);
    });

    it('stat có hasNewCancelsSinceCheck → hiện cảnh báo "Có huỷ mới sau check"', async () => {
      render(
        <DriverDetailDialog
          stat={{ ...stat, checkStatus: 'CHECKED', checkBy: 'Admin C', checkAt: '2026-07-20T03:00:00Z', hasNewCancelsSinceCheck: true }}
          range={range}
          onOpenChange={vi.fn()}
          onDone={vi.fn()}
        />,
      );
      expect(await screen.findByText('Có huỷ mới sau check')).toBeInTheDocument();
    });
  });
});
