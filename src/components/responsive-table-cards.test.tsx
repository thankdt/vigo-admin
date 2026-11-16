import * as fs from 'node:fs';
import * as path from 'node:path';
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AddressAutocomplete } from '@/app/(app)/bookings/components/address-autocomplete';
import { MacroPlacePicker } from '@/app/(app)/master-data/components/macro-place-picker';
import { buildSearchIndex } from '@/lib/ward-search';
import { BookingsTable } from '@/app/(app)/bookings/components/bookings-table';
import HtxTripsPage from '@/app/htx/(portal)/trips/page';
import HtxReconciliationPage from '@/app/(app)/htx-reconciliation/page';
import HtxDetailPage from '@/app/(app)/htx-reconciliation/detail/page';
import { TripAgreementDialog } from '@/app/agent-portal/components/trip-agreement-dialog';
import { getBookings, htxListTrips, getHtxReconciliation, getHtxTrips } from '@/lib/api';

const pushMock = vi.fn();
let mockSearchParams = new URLSearchParams('id=htx-1');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => '/bookings',
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getBookings: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 })),
    getRoutes: vi.fn(async () => []),
    getProvinceOptions: vi.fn(async () => [
      { code: '01', name: 'Nội đô Hà Nội' },
      { code: '31', name: 'Hải Phòng' },
    ]),
    htxListTrips: vi.fn(async () => ({
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
    })),
    getHtxReconciliation: vi.fn(async () => ({ data: [], totals: null })),
    getHtxTrips: vi.fn(async () => ({ htx: { id: 'htx-1', name: 'HTX Sao Việt' }, trips: [], totals: null })),
  };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('Responsive Table-to-Card System & MacBook Corner Clipping Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('id=htx-1');
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    (window.HTMLElement.prototype as any).hasPointerCapture = vi.fn();
    (window.HTMLElement.prototype as any).releasePointerCapture = vi.fn();
  });

  it('wires stackBelow="sm|md|lg|xl|2xl" to data-stack, inline-size container queries, inherited corner radii, and globals.css rules', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

    for (const [bp, mediaPx, containerMax] of [
      ['sm', 640, '519.98px'],
      ['md', 768, '679.98px'],
      ['lg', 1024, '839.98px'],
      ['xl', 1280, '919.98px'],
      ['2xl', 1280, '1099.98px'],
    ] as const) {
      const { container, unmount } = render(
        <Table stackBelow={bp}>
          <TableHeader>
            <TableRow>
              <TableHead>Cột A</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell data-label="Cột A">Giá trị A</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );

      const wrap = container.querySelector(`[data-stack-wrap="${bp}"]`)!;
      expect(wrap).not.toBeNull();
      const expectedMaxCls = bp === '2xl' ? 'max-xl:overflow-x-hidden' : `max-${bp}:overflow-x-hidden`;
      expect(wrap.className).toContain(expectedMaxCls);
      if (bp === '2xl') {
        // Must NEVER put max-2xl:overflow-x-hidden (<1536px) on wrapper when 1280px-1512px MacBooks render display:table
        expect(wrap.className).not.toContain('max-2xl:overflow-x-hidden');
      }
      expect(wrap.className).toContain('[container-type:inline-size]');
      expect(wrap.className).toContain('first:rounded-t-[inherit]');
      expect(wrap.className).toContain('last:rounded-b-[inherit]');

      const tbl = container.querySelector(`table[data-stack="${bp}"]`)!;
      expect(tbl).not.toBeNull();
      // data-label uses ::before in CSS, so DOM textContent stays pure
      expect(screen.getByRole('cell').textContent).toBe('Giá trị A');

      expect(css).toContain(`@media not all and (min-width: ${mediaPx}px)`);
      expect(css).toContain(`@container (max-width: ${containerMax})`);
      expect(css).toContain(`div[data-stack-wrap="${bp}"] {\n    overflow-x: hidden;\n  }`);
      expect(css).toContain(`table[data-stack="${bp}"] > tbody > tr > td[data-label]::before`);
      expect(css).toContain(`table[data-stack="${bp}"] > tbody > tr > td[data-card="route"]`);
      expect(css).toContain(`div[data-stack-wrap="${bp}"] > table[data-stack="${bp}"] > tbody > tr > td[data-card="route"]`);
      expect(css).toContain(`table[data-stack="${bp}"] > tbody > tr > td[data-card="menu"]`);
      expect(css).toContain(`table[data-stack="${bp}"] > tbody > tr > td[data-card="actions"]`);
      expect(css).toContain(`table[data-stack="${bp}"] > tbody > tr > td[colspan]:only-child`);
      unmount();
    }

    // Plain <Table> without stackBelow keeps horizontal scroll fallback and inherited corner radius
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Plain</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.querySelector('table')?.hasAttribute('data-stack')).toBe(false);
    expect(container.firstElementChild?.className).toContain('overflow-x-auto');
    expect(container.firstElementChild?.className).toContain('first:rounded-t-[inherit]');
    expect(container.firstElementChild?.className).not.toContain('overflow-x-hidden');
  });

  it('protects Card, DialogContent, and AlertDialogContent corners on MacBook while keeping floating pickers unclipped when open', async () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toContain('[data-dialog-scroll]::-webkit-scrollbar-track');
    expect(css).toContain('[data-alert-dialog-scroll]::-webkit-scrollbar-track');

    const { unmount } = render(
      <Card data-testid="table-card">
        <CardContent data-testid="table-card-content" className="p-0">Nội dung thẻ bảng</CardContent>
      </Card>,
    );
    const tableCardCls = screen.getByTestId('table-card').className;
    expect(tableCardCls).toContain('overflow-hidden');
    expect(tableCardCls).toContain('has-[[data-floating-open]]:overflow-visible');
    const cardContentCls = screen.getByTestId('table-card-content').className;
    expect(cardContentCls).toContain('first:rounded-t-[inherit]');
    expect(cardContentCls).toContain('last:rounded-b-[inherit]');
    unmount();

    const user = userEvent.setup();
    const { container: acContainer, unmount: unmountAc } = render(
      <Card data-testid="ac-card">
        <AddressAutocomplete value="" onSelect={() => {}} />
      </Card>,
    );
    const acRoot = acContainer.querySelector('[data-address-autocomplete]')!;
    expect(acRoot).not.toBeNull();
    // Closed idle state keeps Card clipped
    expect(acRoot.hasAttribute('data-floating-open')).toBe(false);
    await user.type(acContainer.querySelector('input')!, 'Hà Nội');
    expect(acRoot.hasAttribute('data-floating-open')).toBe(true);
    unmountAc();

    // MacroPlacePicker inside CardHeader also marks data-floating-open when opened
    const searchIdx = buildSearchIndex({
      provinces: [{ code: '01', name: 'Thành phố Hà Nội' }],
      wards: [],
      zones: [],
    });
    const { container: mpContainer, unmount: unmountMp } = render(
      <Card>
        <MacroPlacePicker
          label="Điểm đón"
          idPrefix="mp-test"
          value={null}
          onChange={() => {}}
          index={searchIdx}
          wardsStatus="ready"
          wardsError={null}
          zonesStatus="ready"
          onNeedWards={() => {}}
        />
      </Card>,
    );
    const mpRoot = mpContainer.querySelector('[data-place-picker]')!;
    expect(mpRoot.hasAttribute('data-floating-open')).toBe(false);
    await user.type(mpContainer.querySelector('input')!, 'ha');
    expect(mpRoot.hasAttribute('data-floating-open')).toBe(true);
    unmountMp();

    // DialogContent separates outer rounded overflow-hidden shell from inner scroll container (including !-important & max-* modifiers)
    const { unmount: unmountDlg } = render(
      <Dialog open>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto !p-0 max-sm:p-2 gap-0">
          <DialogHeader>
            <DialogTitle>Tạo chuyến mới</DialogTitle>
            <DialogDescription>Mô tả</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const dlg = screen.getByRole('dialog');
    expect(dlg.className).toContain('overflow-hidden');
    expect(dlg.className).not.toContain('overflow-y-auto');
    expect(dlg.className).not.toContain('!p-0');
    expect(dlg.className).not.toContain('max-sm:p-2');
    const scrollInner = dlg.querySelector('[data-dialog-scroll]')!;
    expect(scrollInner).not.toBeNull();
    expect(scrollInner.className).toContain('overflow-y-auto');
    expect(scrollInner.className).toContain('!p-0');
    expect(scrollInner.className).toContain('max-sm:p-2');
    expect(scrollInner.className).toContain('gap-0');
    unmountDlg();

    // AlertDialogContent also clips its outer rounded border cleanly
    const { unmount: unmountAlert } = render(
      <AlertDialog open>
        <AlertDialogContent className="overflow-y-auto !p-3">
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận</AlertDialogTitle>
            <AlertDialogDescription>Chi tiết xác nhận</AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>,
    );
    const alertDlg = screen.getByRole('alertdialog');
    expect(alertDlg.className).toContain('overflow-hidden');
    expect(alertDlg.className).not.toContain('overflow-y-auto');
    expect(alertDlg.className).not.toContain('!p-3');
    expect(alertDlg.querySelector('[data-alert-dialog-scroll]')?.className).toContain('!p-3');
    unmountAlert();

    // TripAgreementDialog hides [data-dialog-close] and zeroes DialogHeader right padding so mobile centered title isn't shifted left
    const { unmount: unmountTrip } = render(
      <TripAgreementDialog open onOpenChange={() => {}} />,
    );
    expect(screen.getByRole('dialog').className).toContain('[&_[data-dialog-close]]:hidden');
    expect(screen.getByRole('dialog').className).toContain('rounded-2xl');
    expect(screen.getByText('Xác nhận thoả thuận chuyến đi').parentElement?.className).toContain('pr-0');
    unmountTrip();
  });

  it('BookingsTable upgrades stackBelow from "xl" to "2xl" on 11-12 column Cancelled tabs and flattens status menu on iPad (820px)', async () => {
    const origWidth = window.innerWidth;
    const origMM = window.matchMedia;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 820 });
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      const m = query.match(/max-width:\s*(\d+)px/);
      const max = m ? Number(m[1]) : 0;
      return {
        matches: 820 <= max,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    });

    vi.mocked(getBookings).mockResolvedValue({
      data: [
        {
          id: 'bk-card-1',
          status: 'CANCELLED',
          price: 420000,
          createdAt: '2026-11-16T03:00:00.000Z',
          cancelledAt: '2026-11-16T03:10:00.000Z',
          cancelledByRole: 'CUSTOMER',
          cancelReason: 'Khách đổi lịch bay đột xuất',
          pickupProvinceCode: '01',
          dropoffProvinceCode: '31',
          pickupAddress: 'Số 145 Nguyễn Văn Cừ, Long Biên, Hà Nội',
          dropoffAddress: 'Sân bay Cát Bi, Hải An, Hải Phòng',
          customer: { id: 'c1', fullName: 'Trần Thị B', phone: '0988111222' },
          driver: { id: 'd1', fullName: 'Tài Xế C', phone: '0977333444' },
        } as any,
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    try {
      const user = userEvent.setup();
      const { container } = render(<BookingsTable />);

      await screen.findByText('Trần Thị B');
      expect(container.querySelector('table[data-stack="xl"]')).not.toBeNull();

      // Switch to tab "Đã hủy" -> upgrades to data-stack="2xl" + data-stack-sortbar="2xl" so 1280px MacBook with open/collapsed sidebar syncs cleanly
      await user.click(screen.getByRole('tab', { name: 'Đã hủy' }));
      const reasonEl = await screen.findByText('Khách đổi lịch bay đột xuất');
      expect(container.querySelector('table[data-stack="2xl"]')).not.toBeNull();
      expect(container.querySelector('[data-stack-sortbar="2xl"]')).not.toBeNull();

      const row = reasonEl.closest('tr')!;
      expect(row.querySelector('td[data-card="header"]')).toHaveTextContent('Trần Thị B');
      const journeyTd = row.querySelector('td[data-card="route"]')!;
      expect(journeyTd).toHaveTextContent('Điểm đón:');
      expect(journeyTd).toHaveTextContent('Điểm trả:');
      expect(journeyTd.className).not.toContain('max-2xl:bg-muted/40');
      expect(journeyTd.innerHTML).not.toContain('class="truncate"');
      expect(row.querySelector('td[data-label="Tài xế"]')).toHaveTextContent('Tài Xế C');
      expect(row.querySelector('td[data-label="Giá cước"]')).not.toBeNull();
      expect(row.querySelector('td[data-label="Ngày tạo"]')).not.toBeNull();
      expect(row.querySelector('td[data-label="Trạng thái"]')).not.toBeNull();
      expect(row.querySelector('td[data-label="Gọi trước HT"]')).not.toBeNull();
      expect(row.querySelector('td[data-label="Thời gian huỷ"]')).not.toBeNull();
      expect(row.querySelector('td[data-label="Người huỷ"]')).not.toBeNull();
      expect(row.querySelector('td[data-label="Lý do huỷ"]')?.getAttribute('data-card')).toBe('wide');
      expect(row.querySelector('td[data-card="menu"]')).not.toBeNull();

      // On iPad portrait (820px < 1024px), opening action menu flattens status options directly
      await user.click(within(row).getByRole('button', { name: /Mở menu/i }));
      expect(await screen.findByRole('menuitem', { name: 'Hoàn thành' })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: origWidth });
      window.matchMedia = origMM;
    }
  });

  it('BookingsTable mobile/tablet sort select dispatches server-side sortBy + order and resets to page 1', async () => {
    render(<BookingsTable />);
    await waitFor(() => expect(getBookings).toHaveBeenCalled());

    const sortSelect = screen.getByLabelText('Sắp xếp chuyến đi');
    fireEvent.change(sortSelect, { target: { value: 'price:ascending' } });

    await waitFor(() => {
      const lastArgs = vi.mocked(getBookings).mock.calls.at(-1)?.[0];
      expect(lastArgs).toMatchObject({ sortBy: 'price', order: 'ASC', page: 1 });
    });
  });

  it('HtxTripsPage marks table stackBelow="xl" with non-truncated full journey card cell', async () => {
    vi.mocked(htxListTrips).mockResolvedValueOnce({
      data: [
        {
          id: '11111111-2222-3333-4444-555555555555',
          eventAt: '2026-11-16T04:00:00.000Z',
          pickup: 'Bến xe Mỹ Đình, Nam Từ Liêm, Hà Nội',
          dropoff: 'Bến xe Thượng Lý, Hồng Bàng, Hải Phòng',
          distanceKm: 105,
          customerName: 'Lê Văn D',
          driver: { id: 'dr-1', name: 'Phạm Tài', phone: '0912345678', plate: '15A-123.45' },
          price: 300000,
          finalPrice: 280000,
          status: 'COMPLETED',
          cancelledByRole: null,
          cancelReason: null,
        } as any,
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    const { container } = render(<HtxTripsPage />);
    await screen.findByText('Phạm Tài');

    expect(container.querySelector('table[data-stack="xl"]')).not.toBeNull();
    const journeyTd = container.querySelector('td[data-card="route"][data-label="Hành trình"]')!;
    expect(journeyTd).toHaveTextContent('Bến xe Mỹ Đình');
    expect(journeyTd.className).not.toContain('max-xl:bg-muted/40');
    expect(journeyTd.innerHTML).not.toContain('truncate');
  });

  it('HtxReconciliationPage & HtxDetailPage default to zero-scroll financial cards across all screens and support toggling full matrix', async () => {
    const sampleFin = {
      bookingCount: 5,
      grossRevenue: 1080000,
      totalVat: 80000,
      htxCommission: 50000,
      htxVatRemit: 64000,
      htxTotalReceived: 126000,
      vigoCommission: 150000,
      vigoVatRemit: 16000,
      platformFeeGross: 200000,
      km: 0,
    };

    vi.mocked(getHtxReconciliation).mockResolvedValueOnce({
      data: [{ id: 'htx-1', name: 'HTX Sao Việt', tripCount: 5, ...sampleFin } as any],
      totals: sampleFin,
    });

    const user = userEvent.setup();
    const { container, unmount } = render(<HtxReconciliationPage />);

    const cardHeading = await screen.findByText(/#1 · HTX Sao Việt/);
    const compactList = container.querySelector('[data-htx-compact]') as HTMLElement;
    expect(compactList).not.toBeNull();
    // Default zero-scroll view is visible on MacBook/desktop too (no `xl:hidden` until matrix is toggled on)
    expect(compactList.className).not.toContain('xl:hidden');
    expect(container.querySelector('table')).toBeNull();
    expect(within(compactList).getAllByText('Tổng khách trả').length).toBeGreaterThanOrEqual(2);

    // Expanding <details> must NOT trigger router.push
    const detailsTriggers = within(compactList).getAllByText(/Chi tiết phân bổ thuế & phí/);
    await user.click(detailsTriggers[1]);
    expect(pushMock).not.toHaveBeenCalled();

    // Clicking the card itself navigates to detail page
    await user.click(cardHeading);
    expect(pushMock).toHaveBeenCalledWith('/htx-reconciliation/detail?id=htx-1');

    // Toggling "Bảng đầy đủ" mounts the 22-column reconciliation table
    await user.click(screen.getByRole('button', { name: /Bảng đầy đủ/i }));
    expect(container.querySelector('table')).not.toBeNull();
    unmount();

    // Detail page (per-trip cards)
    vi.mocked(getHtxTrips).mockResolvedValueOnce({
      htx: { id: 'htx-1', name: 'HTX Sao Việt' },
      bookingCount: 1,
      trips: [
        {
          bookingId: 'trip-uuid-9999',
          createdAt: '2026-11-16T02:00:00.000Z',
          completedAt: '2026-11-16T04:00:00.000Z',
          driverName: 'Nguyễn Tài Xế',
          driverPhone: '0905123456',
          plate: '30G-999.99',
          ...sampleFin,
        } as any,
      ],
      totals: sampleFin,
    });

    const detailRender = render(<HtxDetailPage />);
    const detailCompact = detailRender.container.querySelector('[data-htx-compact]') as HTMLElement;
    expect(await within(detailCompact).findByText(/#1 · Nguyễn Tài Xế/)).toBeInTheDocument();
    expect(within(detailCompact).getByText(/Mã chuyến: trip-uuid-9999/)).toBeInTheDocument();
    detailRender.unmount();

    // Empty state in compact card view
    const emptyRender = render(<HtxDetailPage />);
    const emptyCompact = emptyRender.container.querySelector('[data-htx-compact]') as HTMLElement;
    expect(await within(emptyCompact).findByText('Không có chuyến nào trong kỳ.')).toBeInTheDocument();
  });
});
