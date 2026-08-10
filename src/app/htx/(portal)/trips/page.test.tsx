import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HtxTripsPage from './page';
import type { HtxOwnerTripRow } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  htxListTrips: vi.fn(),
}));

// `load` phụ thuộc `toast`; toast thật tạo hàm mới mỗi render → useCallback đổi liên tục
// → vòng lặp fetch. Mock giữ tham chiếu ổn định (xem roles/components/user-assignment.test.tsx).
vi.mock('@/hooks/use-toast', () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

import { htxListTrips } from '@/lib/api';

const completedTrip: HtxOwnerTripRow = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  status: 'COMPLETED',
  serviceType: 'RIDE',
  isVinow: false,
  createdAt: '2026-07-23T01:00:00.000Z',
  acceptedAt: '2026-07-23T01:05:00.000Z',
  completedAt: '2026-07-23T02:00:00.000Z',
  cancelledAt: null,
  eventAt: '2026-07-23T02:00:00.000Z',
  pickup: '12 Ngô Quyền, Hoàn Kiếm',
  dropoff: 'Sân bay Nội Bài',
  distanceKm: 28.4,
  customerName: 'Nguyễn Thị Khách',
  driver: { id: 'drv-1', name: 'Trần Văn Tài', phone: '0900000001', plate: '29A-12345' },
  price: 250000,
  finalPrice: 270000,
  cancelledByRole: null,
  cancelReason: null,
};

const cancelledByCustomer: HtxOwnerTripRow = {
  ...completedTrip,
  id: 'bbbbbbbb-1111-2222-3333-444444444444',
  status: 'CANCELLED',
  completedAt: null,
  cancelledAt: '2026-07-23T03:00:00.000Z',
  eventAt: '2026-07-23T03:00:00.000Z',
  finalPrice: null,
  cancelledByRole: 'CUSTOMER',
  cancelReason: 'khách bận đột xuất',
};

// Admin huỷ: backend đã bỏ text (ô cancelReason dùng chung với ghi chú nội bộ).
const cancelledByAdmin: HtxOwnerTripRow = {
  ...cancelledByCustomer,
  id: 'cccccccc-1111-2222-3333-444444444444',
  cancelledByRole: 'ADMIN',
  cancelReason: null,
};

const listOf = (rows: HtxOwnerTripRow[]) => ({
  data: rows,
  meta: { page: 1, limit: 20, total: rows.length, totalPages: 1 },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(htxListTrips).mockResolvedValue(listOf([completedTrip]));
});

/** Query trong bảng, không dính nhãn tab trùng chữ ("Hoàn thành" / "Đã huỷ"). */
const table = () => within(screen.getByRole('table'));

describe('HtxTripsPage', () => {
  it('hiện điểm đón, điểm trả, tài xế và tiền của chuyến hoàn thành', async () => {
    render(<HtxTripsPage />);

    expect(await screen.findByText(/12 Ngô Quyền, Hoàn Kiếm/)).toBeInTheDocument();
    expect(screen.getByText(/Sân bay Nội Bài/)).toBeInTheDocument();
    expect(screen.getByText('Trần Văn Tài')).toBeInTheDocument();
    expect(screen.getByText('29A-12345')).toBeInTheDocument();
    expect(screen.getByText('Nguyễn Thị Khách')).toBeInTheDocument();
    expect(table().getByText('Hoàn thành')).toBeInTheDocument();
    expect(table().getByText('250.000 ₫')).toBeInTheDocument();
    expect(table().getByText('270.000 ₫')).toBeInTheDocument();
  });

  it('hiện mã chuyến ĐẦY ĐỦ, liền một chuỗi, không cắt 8 ký tự', async () => {
    render(<HtxTripsPage />);

    // Cột "Mã chuyến" phải khớp mặt chữ với cột cùng tên ở bảng/Excel đối soát admin
    // (htx-reconciliation/detail dùng nguyên bookingId). Cắt ngắn ⇒ HTX không tra được.
    expect(await table().findByText('aaaaaaaa-1111-2222-3333-444444444444')).toBeInTheDocument();
    expect(table().getByRole('columnheader', { name: 'Mã chuyến' })).toBeInTheDocument();
    // Bản cũ hiện "#aaaaaaaa" dưới ô Thời gian — hai mã cùng nghĩa khác mặt chữ gây cãi lúc đối soát.
    expect(screen.queryByText('#aaaaaaaa')).not.toBeInTheDocument();
  });

  it('mặc định hỏi chuyến hoàn thành trong 30 ngày gần nhất', async () => {
    render(<HtxTripsPage />);

    await waitFor(() => expect(htxListTrips).toHaveBeenCalled());
    const args = vi.mocked(htxListTrips).mock.calls[0][0]!;
    expect(args.status).toBe('completed');
    expect(args.page).toBe(1);
    expect(args.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('chuyến huỷ: hiện ai huỷ kèm lý do', async () => {
    vi.mocked(htxListTrips).mockResolvedValue(listOf([cancelledByCustomer]));
    render(<HtxTripsPage />);

    expect(await screen.findByText('Khách huỷ · khách bận đột xuất')).toBeInTheDocument();
    expect(table().getByText('Đã huỷ')).toBeInTheDocument();
  });

  it('admin huỷ: chỉ hiện nhãn, không có chỗ nào rò ghi chú nội bộ', async () => {
    vi.mocked(htxListTrips).mockResolvedValue(listOf([cancelledByAdmin]));
    const { container } = render(<HtxTripsPage />);

    expect(await screen.findByText('Quản trị viên huỷ')).toBeInTheDocument();
    expect(container.textContent).not.toContain('·');
  });

  it('không hiển thị số điện thoại khách ở bất kỳ đâu trên trang', async () => {
    // Dữ liệu bẩn cố tình: nếu ai đó thêm field SĐT khách vào row, test này phải đỏ.
    vi.mocked(htxListTrips).mockResolvedValue(
      listOf([{ ...completedTrip, customerPhone: '0987654321' } as unknown as HtxOwnerTripRow]),
    );
    const { container } = render(<HtxTripsPage />);

    await screen.findByText('Nguyễn Thị Khách');
    expect(container.textContent).not.toContain('0987654321');
  });

  it('đổi tab sang "Đã huỷ" thì gọi lại API với status=cancelled và về trang 1', async () => {
    render(<HtxTripsPage />);
    await screen.findByText('Trần Văn Tài');

    await userEvent.click(screen.getByRole('tab', { name: 'Đã huỷ' }));

    await waitFor(() =>
      expect(htxListTrips).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'cancelled', page: 1 })),
    );
  });

  it('không có chuyến nào → hiện trạng thái rỗng', async () => {
    vi.mocked(htxListTrips).mockResolvedValue(listOf([]));
    render(<HtxTripsPage />);

    expect(await screen.findByText('Không có chuyến nào trong khoảng đã chọn.')).toBeInTheDocument();
  });

  it('chuyến huỷ chưa có giá cuối → hiện gạch ngang, không hiện 0đ', async () => {
    vi.mocked(htxListTrips).mockResolvedValue(listOf([cancelledByCustomer]));
    render(<HtxTripsPage />);

    await screen.findByText('Khách huỷ · khách bận đột xuất');
    expect(screen.queryByText('0 ₫')).not.toBeInTheDocument();
  });
});
