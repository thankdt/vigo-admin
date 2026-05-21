import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriverIssueBadges } from './driver-issue-badges';

describe('DriverIssueBadges', () => {
  it('renders nothing when issues is empty or undefined', () => {
    const { container: c1 } = render(<DriverIssueBadges issues={[]} />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(<DriverIssueBadges issues={undefined} />);
    expect(c2.firstChild).toBeNull();
  });

  it('renders all badges when there are 2 or fewer', () => {
    render(<DriverIssueBadges issues={['missing_license', 'invalid_plate']} />);
    expect(screen.getByText('Thiếu số bằng lái')).toBeInTheDocument();
    expect(screen.getByText('Biển số sai định dạng')).toBeInTheDocument();
  });

  it('shows first 2 badges and a +N overflow chip when more than 2', () => {
    render(
      <DriverIssueBadges
        issues={['missing_license', 'invalid_plate', 'missing_cccd_images', 'missing_name']}
      />,
    );
    expect(screen.getByText('Thiếu số bằng lái')).toBeInTheDocument();
    expect(screen.getByText('Biển số sai định dạng')).toBeInTheDocument();
    expect(screen.queryByText('Thiếu ảnh CCCD')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('falls back to the raw code when label is unknown', () => {
    render(<DriverIssueBadges issues={['weird_unknown_code']} />);
    expect(screen.getByText('weird_unknown_code')).toBeInTheDocument();
  });
});
