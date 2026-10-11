import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DriverCsNoteEditor } from './drivers-table';
import { updateDriverCsStatus } from '@/lib/api';

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  updateDriverCsStatus: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

beforeEach(() => vi.mocked(updateDriverCsStatus).mockReset());

describe('DriverCsNoteEditor', () => {
  it('nút Lưu bị khoá khi chưa sửa, sửa xong gọi API với nội dung đã trim', async () => {
    vi.mocked(updateDriverCsStatus).mockResolvedValue({ csNote: 'gọi trước' } as any);
    const onSaved = vi.fn();
    render(<DriverCsNoteEditor driverId="d1" initial="" onSaved={onSaved} />);

    const btn = screen.getByRole('button', { name: /lưu ghi chú/i });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/ghi chú về tài xế/i), { target: { value: '  gọi trước  ' } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('gọi trước'));
    expect(updateDriverCsStatus).toHaveBeenCalledWith('d1', { csNote: 'gọi trước' });
  });

  it('xoá hết nội dung → gửi chuỗi rỗng, báo null', async () => {
    vi.mocked(updateDriverCsStatus).mockResolvedValue({} as any);
    const onSaved = vi.fn();
    render(<DriverCsNoteEditor driverId="d1" initial="cũ" onSaved={onSaved} />);

    fireEvent.change(screen.getByPlaceholderText(/ghi chú về tài xế/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu ghi chú/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(null));
    expect(updateDriverCsStatus).toHaveBeenCalledWith('d1', { csNote: '' });
  });
});
