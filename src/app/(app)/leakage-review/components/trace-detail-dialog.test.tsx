import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TraceDetailDialog } from './trace-detail-dialog';
import type { LeakageTraceRow } from '@/lib/types';

const trace: LeakageTraceRow = {
  id: 't1',
  watchId: 'w1',
  bookingId: 'b1',
  driverEntityId: 'de1',
  customerId: 'cu1',
  eventAt: '2026-07-15T02:00:00Z', // 09:00 VN — the incident
  createdAt: '2026-07-15T05:00:00Z', // 12:00 VN — detection (window close)
  verdict: 'PICKUP_DROPOFF_UNEXPLAINED',
  confidence: 'HIGH',
  status: 'NEW',
  evidence: {
    nearPickupAt: '2026-07-15T02:10:00Z',
    nearPickupServing: false,
    nearDropoffAt: '2026-07-15T02:50:00Z',
    nearDropoffServing: false,
    wentDark: false,
    watchType: 'IMMEDIATE',
    pickupHit: { ts: '2026-07-15T02:10:00Z', lat: 21, lng: 105.8, distanceM: 120, servingAtHit: false },
  },
  driver: { userId: 'du1', fullName: 'Tài A', phone: '0900000001' },
  customer: { userId: 'cu1', fullName: 'Khách B', phone: '0900000002' },
  booking: {
    id: 'b1',
    pickupAddress: { address: 'Hà Nội' },
    dropoffAddress: { address: 'Hưng Yên' },
    cancelledAt: '2026-07-15T02:00:00Z',
    cancelReason: 'Tài xế nhờ hủy',
    scheduledTime: null,
  },
};

describe('TraceDetailDialog', () => {
  it('shows the verdict, both parties and the evidence timeline', () => {
    render(<TraceDetailDialog trace={trace} onOpenChange={vi.fn()} onUpdateStatus={vi.fn()} />);
    expect(screen.getByText('Đi đón→đến, không giải thích được')).toBeInTheDocument();
    expect(screen.getByText(/Tài A/)).toBeInTheDocument();
    expect(screen.getByText(/Khách B/)).toBeInTheDocument();
    expect(screen.getByText(/Tài xế nhờ hủy/)).toBeInTheDocument();
    // evidence coords surfaced
    expect(screen.getByText(/120m/)).toBeInTheDocument();
  });

  it('leads with the incident time (eventAt), and shows detection time separately', () => {
    render(<TraceDetailDialog trace={trace} onOpenChange={vi.fn()} onUpdateStatus={vi.fn()} />);
    expect(screen.getByText(/09:00 15\/07\/2026/)).toBeInTheDocument(); // eventAt, VN
    expect(screen.getByText(/12:00 15\/07\/2026/)).toBeInTheDocument(); // createdAt, VN
  });

  it('deep-links the driver to the real detail route (/users/detail?id=, not /drivers/{id} which 404s)', () => {
    render(<TraceDetailDialog trace={trace} onOpenChange={vi.fn()} onUpdateStatus={vi.fn()} />);
    expect(screen.getByRole('link', { name: /Tài A/ })).toHaveAttribute('href', '/users/detail?id=du1');
  });

  it('renders a dash instead of a broken link when the driver is missing', () => {
    render(<TraceDetailDialog trace={{ ...trace, driver: null }} onOpenChange={vi.fn()} onUpdateStatus={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /Tài A/ })).not.toBeInTheDocument();
  });

  it('confirming fraud calls onUpdateStatus once with CONFIRMED', async () => {
    const onUpdateStatus = vi.fn().mockResolvedValue(undefined);
    render(<TraceDetailDialog trace={trace} onOpenChange={vi.fn()} onUpdateStatus={onUpdateStatus} />);
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận gian lận' }));
    expect(onUpdateStatus).toHaveBeenCalledTimes(1);
    expect(onUpdateStatus).toHaveBeenCalledWith('t1', 'CONFIRMED');
  });

  it('renders nothing when there is no trace', () => {
    const { container } = render(<TraceDetailDialog trace={null} onOpenChange={vi.fn()} onUpdateStatus={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
