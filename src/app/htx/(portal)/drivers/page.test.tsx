import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HtxDriversPage from './page';
import type { HtxDriverDetail, HtxDriverRow } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  API_BASE_URL: 'https://api.example.test',
  htxListDrivers: vi.fn(),
  htxToggleDriverActive: vi.fn(),
  htxGetDriverDetail: vi.fn(),
  htxApproveDriver: vi.fn(),
  htxRejectDriver: vi.fn(),
  htxBanDriver: vi.fn(),
  htxUnbanDriver: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

import { useToast } from '@/hooks/use-toast';

import {
  htxApproveDriver,
  htxBanDriver,
  htxGetDriverDetail,
  htxListDrivers,
  htxRejectDriver,
  htxToggleDriverActive,
  htxUnbanDriver,
} from '@/lib/api';

const pendingRow: HtxDriverRow = {
  id: 'drv-pending',
  userId: 'user-1',
  fullName: 'Nguyễn Văn Chờ',
  phone: '0901111111',
  avatar: null,
  status: 'OFFLINE',
  isActive: true,
  isApproved: false,
  isSubmittedForApproval: true,
  rejectionReason: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  vehicleRegistration: { plateNumber: '29A-99999', brand: 'Toyota', model: 'Vios', seats: 4 },
  tripCount: 0,
  lifetimeIncome: 0,
  lifetimeTax: 0,
  htxApprovalStatus: 'NONE',
};

const pendingDetail: HtxDriverDetail = {
  id: 'drv-pending',
  userId: 'user-1',
  fullName: 'Nguyễn Văn Chờ',
  phone: '0901111111',
  avatar: null,
  status: 'OFFLINE',
  isActive: true,
  isApproved: false,
  isSubmittedForApproval: true,
  rejectionReason: null,
  enabledServices: ['RIDE'],
  licenseImages: ['uploads/lic-front.jpg', 'uploads/lic-back.jpg'],
  cccdImages: ['uploads/cccd-front.jpg', 'uploads/cccd-back.jpg'],
  vehicleRegistration: {
    plateNumber: '29A-99999',
    brand: 'Toyota',
    model: 'Vios',
    color: 'Trắng',
    seats: 4,
    registrationImages: ['uploads/cavet.jpg'],
  },
  htxConfirmationImage: 'uploads/htx-confirm.jpg',
  createdAt: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(htxListDrivers).mockResolvedValue({
    data: [pendingRow],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  });
  vi.mocked(htxGetDriverDetail).mockResolvedValue(pendingDetail);
  vi.mocked(htxApproveDriver).mockResolvedValue({ ...pendingDetail, isApproved: true, warnings: [] });
  vi.mocked(htxRejectDriver).mockResolvedValue({
    ...pendingDetail,
    isApproved: false,
    rejectionReason: '- Ảnh bằng lái không rõ, không đọc được',
  });
});

describe('HtxDriversPage — xem hồ sơ và duyệt / từ chối tài xế', () => {
  it('bấm vào tài xế / nút Xem hồ sơ mở hộp thoại hồ sơ đầy đủ (CCCD, GPLX, cà vẹt, ảnh HTX)', async () => {
    const user = userEvent.setup();
    render(<HtxDriversPage />);

    await screen.findByText('Nguyễn Văn Chờ');
    const table = screen.getByRole('table');
    expect(within(table).getByText('Chờ duyệt')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: /Xem hồ sơ/i }));

    await waitFor(() => expect(htxGetDriverDetail).toHaveBeenCalledWith('drv-pending'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('29A-99999')).toBeInTheDocument();
    expect(within(dialog).getByText('Toyota Vios')).toBeInTheDocument();
    expect(within(dialog).getByText('Trắng')).toBeInTheDocument();
    expect(within(dialog).getByText('4 chỗ')).toBeInTheDocument();
    expect(within(dialog).getByAltText('CCCD 1')).toBeInTheDocument();
    expect(within(dialog).getByAltText('Bằng lái 1')).toBeInTheDocument();
    expect(within(dialog).getByAltText('Đăng ký xe 1')).toBeInTheDocument();
    expect(within(dialog).getByAltText('Xác nhận HTX 1')).toBeInTheDocument();
  });

  it('bấm vào tên tài xế trong bảng cũng mở hộp thoại hồ sơ; gạt Switch hoạt động KHÔNG mở hồ sơ', async () => {
    const user = userEvent.setup();
    vi.mocked(htxToggleDriverActive).mockResolvedValue({ id: 'drv-pending', isActive: false });
    render(<HtxDriversPage />);

    await screen.findByText('Nguyễn Văn Chờ');
    await user.click(screen.getByRole('switch'));
    expect(htxToggleDriverActive).toHaveBeenCalledWith('drv-pending');
    expect(htxGetDriverDetail).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Nguyễn Văn Chờ/ }));
    await waitFor(() => expect(htxGetDriverDetail).toHaveBeenCalledWith('drv-pending'));
  });

  it('chọn Duyệt tài xế và Xác nhận duyệt gọi POST /htx/drivers/:id/approve rồi tải lại danh sách', async () => {
    const user = userEvent.setup();
    render(<HtxDriversPage />);

    await user.click(await screen.findByRole('button', { name: /Xem hồ sơ/i }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Duyệt tài xế' }));
    await user.type(within(dialog).getByPlaceholderText('Ghi chú kiểm duyệt HTX…'), 'Đã kiểm tra bản gốc');
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận duyệt' }));

    await waitFor(() =>
      expect(htxApproveDriver).toHaveBeenCalledWith('drv-pending', ['RIDE'], 'Đã kiểm tra bản gốc'),
    );
    await waitFor(() => expect(htxListDrivers).toHaveBeenCalledTimes(2));
  });

  it('chọn Từ chối, nhập lý do và xác nhận gọi POST /htx/drivers/:id/reject rồi tải lại danh sách', async () => {
    const user = userEvent.setup();
    render(<HtxDriversPage />);

    await user.click(await screen.findByRole('button', { name: /Xem hồ sơ/i }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    await user.type(
      within(dialog).getByPlaceholderText(/Ảnh bằng lái chụp thiếu góc dưới/),
      'Ảnh GPLX mờ, vui lòng chụp lại',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận từ chối' }));

    await waitFor(() =>
      expect(htxRejectDriver).toHaveBeenCalledWith('drv-pending', 'Ảnh GPLX mờ, vui lòng chụp lại', ''),
    );
    await waitFor(() => expect(htxListDrivers).toHaveBeenCalledTimes(2));
  });

  it('cảnh báo chưa chọn tỉnh khi duyệt được hiện trong toast; lỗi trùng biển số giữ hộp thoại mở', async () => {
    const user = userEvent.setup();
    const { toast } = useToast();
    vi.mocked(htxApproveDriver)
      .mockRejectedValueOnce(new Error('Biển số xe đã được một tài xế khác sử dụng trên hệ thống.'))
      .mockResolvedValueOnce({
        ...pendingDetail,
        isApproved: true,
        warnings: ['Tài xế chưa có tỉnh hoạt động nào.'],
      });

    render(<HtxDriversPage />);
    await user.click(await screen.findByRole('button', { name: /Xem hồ sơ/i }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Duyệt tài xế' }));
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận duyệt' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          title: 'Không thể duyệt tài xế',
          description: 'Biển số xe đã được một tài xế khác sử dụng trên hệ thống.',
        }),
      ),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận duyệt' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Đã duyệt tài xế',
          description: expect.stringContaining('Tài xế chưa có tỉnh hoạt động nào.'),
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('tài xế Đã từ chối hiện lý do từ chối và chỉ mở nút Duyệt tài xế; nút Xác nhận từ chối khoá khi chưa nhập lý do', async () => {
    const user = userEvent.setup();
    vi.mocked(htxListDrivers).mockResolvedValueOnce({
      data: [{ ...pendingRow, id: 'drv-rej', rejectionReason: 'Thiếu CCCD mặt sau' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(htxGetDriverDetail).mockResolvedValueOnce({
      ...pendingDetail,
      id: 'drv-rej',
      isApproved: false,
      isSubmittedForApproval: false,
      rejectionReason: 'Thiếu CCCD mặt sau',
    });

    render(<HtxDriversPage />);
    await user.click(await screen.findByRole('button', { name: /Xem hồ sơ/i }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Lý do từ chối hiện tại')).toBeInTheDocument();
    expect(within(dialog).getByText('Thiếu CCCD mặt sau')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Duyệt tài xế' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument();
  });

  it('nút Xác nhận từ chối bị khoá khi chưa chọn hoặc nhập lý do từ chối', async () => {
    const user = userEvent.setup();
    render(<HtxDriversPage />);
    await user.click(await screen.findByRole('button', { name: /Xem hồ sơ/i }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    expect(within(dialog).getByRole('button', { name: 'Xác nhận từ chối' })).toBeDisabled();
    expect(htxRejectDriver).not.toHaveBeenCalled();
  });

  it('khi detail tải xong mà vehicleRegistration là null thì không giữ lại biển số cũ của danh sách', async () => {
    const user = userEvent.setup();
    vi.mocked(htxGetDriverDetail).mockResolvedValueOnce({
      ...pendingDetail,
      vehicleRegistration: null,
    });
    render(<HtxDriversPage />);
    await user.click(await screen.findByRole('button', { name: /Xem hồ sơ/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Chưa có thông tin đăng ký xe.')).toBeInTheDocument();
    expect(within(dialog).queryByText('29A-99999')).not.toBeInTheDocument();
  });

  it('hiển thị đúng trạng thái Đã khoá / Tạm dừng / Mất kết nối và cảnh báo khi Redis presence lỗi', async () => {
    vi.mocked(htxListDrivers).mockResolvedValueOnce({
      data: [
        { ...pendingRow, id: 'd-ban', fullName: 'Tài Khoá', isBanned: true, status: 'ONLINE', isActive: true },
        { ...pendingRow, id: 'd-pause', fullName: 'Tài Tạm Dừng', isBanned: false, isActive: false, status: 'ONLINE' },
        {
          ...pendingRow,
          id: 'd-stale',
          fullName: 'Tài Mất Kết Nối',
          isBanned: false,
          isActive: true,
          status: 'ONLINE',
          presence: { hasSocket: false, hasAlive: false, hasModernFlag: true, quality: 'high', silentMinutes: 45 },
        },
      ],
      meta: { page: 1, limit: 20, total: 3, totalPages: 1, presenceUnavailable: true },
    });

    render(<HtxDriversPage />);
    await screen.findByText('Tài Khoá');
    expect(screen.getByText('Đã khoá')).toBeInTheDocument();
    expect(screen.getByText('Mất kết nối')).toBeInTheDocument();
    expect(screen.getByText(/Không kiểm tra được tín hiệu kết nối thời gian thực/)).toBeInTheDocument();
  });

  it('khoá tài khoản từ bảng phải qua hộp thoại xác nhận nhập lý do bắt buộc', async () => {
    const user = userEvent.setup();
    vi.mocked(htxBanDriver).mockResolvedValueOnce({ ...pendingDetail, isBanned: true, canUnban: true });
    render(<HtxDriversPage />);

    await screen.findByText('Nguyễn Văn Chờ');
    await user.click(screen.getByRole('button', { name: /^Khoá$/ }));
    const confirmDialog = await screen.findByRole('alertdialog');
    const confirmBtn = within(confirmDialog).getByRole('button', { name: 'Xác nhận khoá' });
    expect(confirmBtn).toBeDisabled();

    await user.type(within(confirmDialog).getByLabelText(/Lý do khoá/), 'Vi phạm nội quy');
    expect(confirmBtn).toBeEnabled();
    await user.click(confirmBtn);

    await waitFor(() => expect(htxBanDriver).toHaveBeenCalledWith('drv-pending', 'Vi phạm nội quy', ''));
    await waitFor(() => expect(htxListDrivers).toHaveBeenCalledTimes(2));
  });

  it('mở khoá tài khoản khi canUnban=true; tài khoản do admin khoá (canUnban=false) chỉ hiện Khoá bởi hệ thống & ẩn Mở khoá/Duyệt', async () => {
    const user = userEvent.setup();
    vi.mocked(htxUnbanDriver).mockResolvedValueOnce({ ...pendingDetail, isBanned: false, canUnban: false });
    vi.mocked(htxListDrivers).mockResolvedValueOnce({
      data: [
        { ...pendingRow, id: 'd-htx-ban', fullName: 'Bị HTX Khoá', isBanned: true, canUnban: true },
        { ...pendingRow, id: 'd-admin-ban', fullName: 'Bị Admin Khoá', isBanned: true, canUnban: false },
      ],
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });
    vi.mocked(htxGetDriverDetail).mockResolvedValueOnce({
      ...pendingDetail,
      id: 'd-admin-ban',
      fullName: 'Bị Admin Khoá',
      isBanned: true,
      canUnban: false,
    });

    render(<HtxDriversPage />);
    await screen.findByText('Bị HTX Khoá');
    expect(screen.getByText('Khoá bởi hệ thống')).toBeInTheDocument();

    const unlockBtn = screen.getByRole('button', { name: /Mở khoá/ });
    await user.click(unlockBtn);
    const alert = await screen.findByRole('alertdialog');
    await user.click(within(alert).getByRole('button', { name: 'Xác nhận mở khoá' }));
    await waitFor(() => expect(htxUnbanDriver).toHaveBeenCalledWith('d-htx-ban', ''));
  });

  it('hộp thoại hồ sơ tài xế bị admin khoá ẩn nút Duyệt và nút Mở khoá, hiển thị cảnh báo đỏ', async () => {
    const user = userEvent.setup();
    vi.mocked(htxListDrivers).mockResolvedValueOnce({
      data: [{ ...pendingRow, id: 'd-adm', fullName: 'Bị Admin Khoá', isBanned: true, canUnban: false }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(htxGetDriverDetail).mockResolvedValueOnce({
      ...pendingDetail,
      id: 'd-adm',
      fullName: 'Bị Admin Khoá',
      isBanned: true,
      canUnban: false,
    });

    render(<HtxDriversPage />);
    await user.click(await screen.findByRole('button', { name: /Xem hồ sơ/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/quản trị viên hoặc hệ thống khoá/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Duyệt tài xế' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Mở khoá/ })).not.toBeInTheDocument();
  });
});
