import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriverCommitmentBadge } from './driver-commitment-badge';

/**
 * Nhãn cam kết là thứ DUY NHẤT cho admin biết tài xế mới hiện ra (nhờ luật lọc theo
 * khung giờ, 14/08/2026) đang giữ chuyến gì. Nói sai ở đây tệ hơn không nói.
 */
describe('DriverCommitmentBadge', () => {
  const base = {
    bookingId: 'b1',
    serviceType: 'RIDE',
    status: 'ACCEPTED',
    scheduledFrom: null as string | null,
    scheduledTo: null as string | null,
    confirmedPickupTime: null as string | null,
    overlapsCandidate: false,
  };

  it('không có cam kết → không hiện gì', () => {
    const { container } = render(<DriverCommitmentBadge commitments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hiện giờ đón theo GIỜ VN, không theo giờ máy', () => {
    // 03:00Z = 10:00 giờ VN.
    render(
      <DriverCommitmentBadge
        commitments={[{ ...base, scheduledFrom: '2026-08-18T03:00:00.000Z' }]}
      />,
    );
    expect(screen.getByText(/10:00 18\/08/)).toBeInTheDocument();
  });

  it('tài ĐANG CHỞ → cảnh báo đỏ kể cả khi cờ chồng giờ nói không', () => {
    render(
      <DriverCommitmentBadge
        commitments={[
          {
            ...base,
            status: 'PICKED_UP',
            overlapsCandidate: false,
            scheduledFrom: '2026-08-14T00:00:00.000Z',
          },
        ]}
      />,
    );
    const badge = screen.getByText(/đang giữ/);
    expect(badge.className).toMatch(/destructive/);
    expect(badge.textContent).toMatch(/đang chở/);
  });

  it('nhiều cam kết đều không chồng giờ → hiện cái SỚM NHẤT, không phải cái DB trả trước', () => {
    render(
      <DriverCommitmentBadge
        commitments={[
          { ...base, bookingId: 'xa', scheduledFrom: '2026-08-20T01:00:00.000Z' },
          { ...base, bookingId: 'gan', scheduledFrom: '2026-08-14T06:00:00.000Z' },
        ]}
      />,
    );
    // 06:00Z = 13:00 VN ngày 14/08 — cam kết sát giờ nhất, không được giấu sau "+1".
    expect(screen.getByText(/13:00 14\/08/)).toBeInTheDocument();
    expect(screen.getByText(/\+1/)).toBeInTheDocument();
  });

  it('không khẳng định tuyệt đối "không đụng chuyến đang tạo" khi chỉ là ước tính', () => {
    render(
      <DriverCommitmentBadge
        commitments={[{ ...base, scheduledFrom: '2026-08-20T01:00:00.000Z' }]}
      />,
    );
    const badge = screen.getByText(/đang giữ/);
    expect(badge.getAttribute('title')).toMatch(/ước tính/i);
  });
});
