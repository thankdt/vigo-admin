import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoProvinceWarning } from './driver-province-warning';
import { NO_PROVINCE_WARNING } from './driver-provinces';

describe('NoProvinceWarning', () => {
  it('chip: nhãn ngắn, giải thích đầy đủ nằm ở title', () => {
    render(<NoProvinceWarning />);
    const chip = screen.getByText('Chưa có tỉnh');
    expect(chip.closest('span')).toHaveAttribute('title', NO_PROVINCE_WARNING);
  });

  it('alert: nêu rõ không bật được Sẵn sàng (DRV_PROVINCE_REQUIRED)', () => {
    render(<NoProvinceWarning variant="alert" />);
    expect(screen.getByRole('alert')).toHaveTextContent('DRV_PROVINCE_REQUIRED');
    expect(screen.getByRole('alert')).toHaveTextContent('không bật được Sẵn sàng');
  });
});
