import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DriverCancelReviewPage from './page';
import type { DriverCancelStat } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  getDriverCancelStats: vi.fn(),
  getDriverCancelDetail: vi.fn(),
  getDriverApprovalHistory: vi.fn(),
  banDriver: vi.fn(),
  unbanDriver: vi.fn(),
  suspendDriver: vi.fn(),
  unsuspendDriver: vi.fn(),
}));

import {
  getDriverCancelStats,
  getDriverCancelDetail,
  getDriverApprovalHistory,
  banDriver,
} from '@/lib/api';

const baseStat: DriverCancelStat = {
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDriverCancelStats).mockResolvedValue([baseStat]);
  vi.mocked(getDriverCancelDetail).mockResolvedValue([]);
  vi.mocked(getDriverApprovalHistory).mockResolvedValue([]);
  vi.mocked(banDriver).mockResolvedValue({} as any);
});

describe('DriverCancelReviewPage — sheet re-sync after action', () => {
  it('updates the open sheet (status badge + Gỡ khoá button) after a ban succeeds, without closing it', async () => {
    render(<DriverCancelReviewPage />);

    // Initial list load.
    expect(await screen.findByText('Tài A')).toBeInTheDocument();

    // Open the row's detail sheet.
    await userEvent.click(screen.getByText('Tài A'));
    await waitFor(() => expect(getDriverCancelDetail).toHaveBeenCalledWith('de1', expect.any(String), expect.any(String)));

    // Sheet initially shows the driver as active, no "Gỡ khoá" button.
    expect(screen.queryByRole('button', { name: 'Gỡ khoá' })).not.toBeInTheDocument();

    // The next list reload (triggered by onDone after the ban) reflects isBanned: true.
    vi.mocked(getDriverCancelStats).mockResolvedValue([{ ...baseStat, isBanned: true }]);

    await userEvent.type(screen.getByPlaceholderText('Nhập lý do khoá / tạm khoá...'), 'Câu kéo khách');
    await userEvent.click(screen.getByRole('button', { name: /Khoá tài khoản \(vĩnh viễn\)/ }));

    await waitFor(() => expect(banDriver).toHaveBeenCalledWith('de1', 'Câu kéo khách'));

    // Sheet stays open and now reflects the post-action status: the "Gỡ khoá"
    // button appears — this is the parent's `selected` re-sync (page.tsx `load`)
    // taking effect, not a manual close/reopen.
    expect(await screen.findByRole('button', { name: 'Gỡ khoá' })).toBeInTheDocument();

    const sheetTitle = screen.getByText('Tài A · 0900000001').closest('[data-slot="sheet-header"]') ??
      screen.getByText('Tài A · 0900000001').parentElement!;
    expect(within(sheetTitle as HTMLElement).getByText('Đã khoá tài khoản (vĩnh viễn)')).toBeInTheDocument();

    // The detail sub-fetches (trips/history) must not refire from the re-sync —
    // same driverEntityId means the sheet's detail-loading effect shouldn't
    // re-key. They only fire once on open + once from the explicit
    // loadDetail() call inside `run()` after the action = twice, not more.
    expect(getDriverCancelDetail).toHaveBeenCalledTimes(2);
  });
});
