import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getSurvivingProvinces = vi.fn();
const getRoutes = vi.fn();
vi.mock('@/lib/api', () => ({
  getSurvivingProvinces: (...a: unknown[]) => getSurvivingProvinces(...a),
  getRoutes: (...a: unknown[]) => getRoutes(...a),
}));

import { DriversFilterBar, EMPTY_FILTERS, hasAnyFilter } from './drivers-filter-bar';

beforeEach(() => {
  getSurvivingProvinces.mockReset();
  getRoutes.mockReset();
  getSurvivingProvinces.mockResolvedValue([
    { id: 1, name: 'Hải Phòng', level: 'PROVINCE', gisCode: '31' },
  ]);
});

describe('DriversFilterBar — lọc theo tỉnh thay cho tuyến', () => {
  it('nạp danh mục tỉnh, KHÔNG gọi danh sách tuyến, nhãn là "Tất cả tỉnh"', async () => {
    render(<DriversFilterBar value={EMPTY_FILTERS} onChange={() => {}} />);
    await waitFor(() => expect(getSurvivingProvinces).toHaveBeenCalledTimes(1));
    expect(getRoutes).not.toHaveBeenCalled();
    expect(screen.getByText('Tất cả tỉnh')).toBeInTheDocument();
    expect(screen.queryByText('Tất cả tuyến')).not.toBeInTheDocument();
  });

  it('danh mục lỗi thì ô lọc vẫn render (các bộ lọc khác dùng được)', async () => {
    getSurvivingProvinces.mockRejectedValue(new Error('boom'));
    render(<DriversFilterBar value={EMPTY_FILTERS} onChange={() => {}} />);
    await waitFor(() => expect(getSurvivingProvinces).toHaveBeenCalled());
    expect(screen.getByPlaceholderText('Tên tài xế...')).toBeInTheDocument();
  });

  it('chọn một tỉnh gọi onChange với provinceCode là MÃ GIS (không phải id tỉnh cũ)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DriversFilterBar value={EMPTY_FILTERS} onChange={onChange} />);

    await user.click(screen.getAllByRole('combobox').find((el) => el.textContent === 'Tất cả tỉnh')!);
    await user.click(await screen.findByRole('option', { name: 'Hải Phòng' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, provinceCode: '31' });
  });

  it('hasAnyFilter tính provinceCode', () => {
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
    expect(hasAnyFilter({ ...EMPTY_FILTERS, provinceCode: '31' })).toBe(true);
  });
});
