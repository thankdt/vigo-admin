import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getFeedback = vi.fn();
const updateFeedbackNote = vi.fn();
const toast = vi.fn();

vi.mock('@/lib/api', () => ({
  getFeedback: (...a: unknown[]) => getFeedback(...a),
  updateFeedbackNote: (...a: unknown[]) => updateFeedbackNote(...a),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

import FeedbackPage from './page';

describe('FeedbackPage — Ghi chú góp ý tài xế (#19)', () => {
  beforeEach(() => {
    getFeedback.mockReset();
    updateFeedbackNote.mockReset();
    toast.mockReset();
    getFeedback.mockResolvedValue({
      data: [
        {
          id: 'fb-1',
          driverId: 'drv-1',
          category: 'APP_BUG',
          content: 'Ứng dụng hay đứng hình lúc mở bản đồ',
          adminNote: null,
          createdAt: '2026-11-25T05:00:00Z',
          driver: {
            id: 'drv-1',
            userId: 'u-1',
            user: { id: 'u-1', fullName: 'Nguyễn Văn Tài', phone: '0912345678' },
          },
        },
        {
          id: 'fb-2',
          driverId: 'drv-2',
          category: 'PAYMENT',
          content: 'Hỏi về ví khuyến mại',
          adminNote: 'Đã gọi giải thích xong',
          adminNoteUpdatedAt: '2026-11-25T06:30:00Z',
          adminNoteUpdatedBy: 'adm-1',
          adminNoteUpdatedByUser: { id: 'adm-1', fullName: 'CSKH Lan' },
          createdAt: '2026-11-25T04:00:00Z',
          driver: {
            id: 'drv-2',
            userId: 'u-2',
            user: { id: 'u-2', fullName: 'Trần Văn Bình', phone: '0988777666' },
          },
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('hiển thị cột Ghi chú, ghi chú sẵn có cùng người ghi và nút thêm ghi chú', async () => {
    render(<FeedbackPage />);

    await waitFor(() => expect(screen.getByText('Nguyễn Văn Tài')).toBeInTheDocument());
    expect(screen.getByText('Ghi chú')).toBeInTheDocument();
    expect(screen.getByText('Thêm ghi chú...')).toBeInTheDocument();
    expect(screen.getByText('Đã gọi giải thích xong')).toBeInTheDocument();
    expect(screen.getByText(/CSKH Lan/)).toBeInTheDocument();
  });

  it('mở dialog, lưu ghi chú mới và cập nhật ngay lên bảng', async () => {
    const user = userEvent.setup();
    updateFeedbackNote.mockResolvedValue({
      id: 'fb-1',
      adminNote: 'Đã chuyển kỹ thuật kiểm tra',
      adminNoteUpdatedAt: '2026-11-25T07:00:00Z',
      adminNoteUpdatedBy: 'adm-2',
      adminNoteUpdatedByUser: { id: 'adm-2', fullName: 'Admin Minh' },
    });

    render(<FeedbackPage />);
    await waitFor(() => expect(screen.getByText('Thêm ghi chú...')).toBeInTheDocument());

    await user.click(screen.getByText('Thêm ghi chú...'));
    const textarea = await screen.findByPlaceholderText('Nhập ghi chú xử lý nội bộ cho góp ý này...');
    await user.type(textarea, 'Đã chuyển kỹ thuật kiểm tra');
    await user.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));

    await waitFor(() =>
      expect(updateFeedbackNote).toHaveBeenCalledWith('fb-1', 'Đã chuyển kỹ thuật kiểm tra'),
    );
    expect(await screen.findByText('Đã chuyển kỹ thuật kiểm tra')).toBeInTheDocument();
  });

  it('khoá nút Lưu khi nội dung chưa đổi và không giữ tên admin cũ nếu server trả null', async () => {
    const user = userEvent.setup();
    updateFeedbackNote.mockResolvedValue({
      id: 'fb-2',
      adminNote: 'Đã gọi giải thích xong - bổ sung',
      adminNoteUpdatedAt: '2026-11-25T08:00:00Z',
      adminNoteUpdatedBy: null,
      adminNoteUpdatedByUser: null,
    });

    render(<FeedbackPage />);
    await waitFor(() => expect(screen.getByText('Đã gọi giải thích xong')).toBeInTheDocument());

    // Mở hàng chưa có ghi chú → nút Lưu phải đang khoá để tránh gửi PATCH rỗng.
    await user.click(screen.getByText('Thêm ghi chú...'));
    expect(screen.getByRole('button', { name: 'Lưu ghi chú' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));

    // Mở hàng đã có ghi chú → cập nhật khi server trả adminNoteUpdatedByUser: null → tên cũ phải mất.
    await user.click(screen.getByText('Đã gọi giải thích xong'));
    const textarea = await screen.findByPlaceholderText('Nhập ghi chú xử lý nội bộ cho góp ý này...');
    await user.type(textarea, ' - bổ sung');
    await user.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));

    await waitFor(() =>
      expect(updateFeedbackNote).toHaveBeenCalledWith('fb-2', 'Đã gọi giải thích xong - bổ sung'),
    );
    expect(await screen.findByText('Đã gọi giải thích xong - bổ sung')).toBeInTheDocument();
    expect(screen.queryByText(/CSKH Lan/)).not.toBeInTheDocument();
  });
});
