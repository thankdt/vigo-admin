import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Hai màn con có test riêng; ở đây chỉ kiểm KHUNG trang: spec "bỏ tuyến → tỉnh hoạt động" không còn tab
// Tuyến đường / Bảng giá theo tuyến, và tab mặc định là "Điều chỉnh khu vực".
vi.mock('./components/pricing-macro-manager', () => ({
  PricingMacroManager: () => <div data-testid="macro-manager">macro</div>,
}));
vi.mock('./components/admin-units-manager', () => ({
  AdminUnitsManager: () => <div data-testid="admin-units-manager">admin-units</div>,
}));

vi.mock('./components/special-zones-manager', () => ({
  SpecialZonesManager: () => <div data-testid="special-zones-manager">special-zones</div>,
}));

import MasterDataPage from './page';

describe('MasterDataPage — khung trang', () => {
  it('ba tab: "Điều chỉnh khu vực", "Sân bay & đồng giá", "Đơn vị hành chính"; không còn Tuyến đường / Bảng giá', () => {
    render(<MasterDataPage />);
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Điều chỉnh khu vực', 'Sân bay & đồng giá', 'Đơn vị hành chính']);
    expect(screen.queryByRole('tab', { name: 'Tuyến đường' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Bảng giá' })).not.toBeInTheDocument();
  });

  it('mặc định mở tab "Điều chỉnh khu vực" (màn cấu hình giá khu vực)', () => {
    render(<MasterDataPage />);
    expect(screen.getByRole('tab', { name: 'Điều chỉnh khu vực' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('macro-manager')).toBeInTheDocument();
  });

  it('tab "Sân bay & đồng giá" hiện màn đồng giá khi được chọn', async () => {
    const user = userEvent.setup();
    render(<MasterDataPage />);
    expect(screen.queryByTestId('special-zones-manager')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Sân bay & đồng giá' }));
    expect(screen.getByTestId('special-zones-manager')).toBeInTheDocument();
  });

  it('tiêu đề trang không còn nhắc "tuyến"', () => {
    render(<MasterDataPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vùng & Giá khu vực');
    expect(screen.queryByText(/tuyến/i)).not.toBeInTheDocument();
  });

  it('mô tả trang nhắc tới đồng giá sân bay (trang không còn chỉ nói về đơn vị hành chính và giá theo phường/xã)', () => {
    render(<MasterDataPage />);
    expect(screen.getByText(/đồng giá sân bay/)).toBeInTheDocument();
  });
});
