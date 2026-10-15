import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Hai màn con có test riêng; ở đây chỉ kiểm KHUNG trang: spec "bỏ tuyến → tỉnh hoạt động" không còn tab
// Tuyến đường / Bảng giá theo tuyến, và tab mặc định là "Điều chỉnh khu vực".
vi.mock('./components/pricing-macro-manager', () => ({
  PricingMacroManager: () => <div data-testid="macro-manager">macro</div>,
}));
vi.mock('./components/admin-units-manager', () => ({
  AdminUnitsManager: () => <div data-testid="admin-units-manager">admin-units</div>,
}));

import MasterDataPage from './page';

describe('MasterDataPage — khung trang', () => {
  it('chỉ còn hai tab: "Điều chỉnh khu vực" và "Đơn vị hành chính"; không còn Tuyến đường / Bảng giá', () => {
    render(<MasterDataPage />);
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Điều chỉnh khu vực', 'Đơn vị hành chính']);
    expect(screen.queryByRole('tab', { name: 'Tuyến đường' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Bảng giá' })).not.toBeInTheDocument();
  });

  it('mặc định mở tab "Điều chỉnh khu vực" (màn cấu hình giá khu vực)', () => {
    render(<MasterDataPage />);
    expect(screen.getByRole('tab', { name: 'Điều chỉnh khu vực' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('macro-manager')).toBeInTheDocument();
  });

  it('tiêu đề trang không còn nhắc "tuyến"', () => {
    render(<MasterDataPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vùng & Giá khu vực');
    expect(screen.queryByText(/tuyến/i)).not.toBeInTheDocument();
  });
});
