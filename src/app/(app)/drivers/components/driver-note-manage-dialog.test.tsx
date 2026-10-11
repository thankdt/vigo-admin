import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DriverNoteManageDialog } from './driver-note-manage-dialog';
import {
  createDriverNotePreset, deleteDriverNotePreset, getDriverNotePresets, renameDriverNotePreset,
} from '@/lib/api';
import { resetDriverNotePresetsCache } from './driver-note-presets-cache';

vi.mock('@/lib/api', () => ({
  getDriverNotePresets: vi.fn(),
  createDriverNotePreset: vi.fn(),
  renameDriverNotePreset: vi.fn(),
  deleteDriverNotePreset: vi.fn(),
}));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const PRESETS = [
  { id: 'a', label: 'Chuyên chạy ghép', sortOrder: 10 },
  { id: 'b', label: 'Chưa chạy ghép bao giờ', sortOrder: 20 },
];

beforeEach(() => {
  resetDriverNotePresetsCache();
  toast.mockReset();
  vi.mocked(getDriverNotePresets).mockReset().mockResolvedValue(PRESETS);
  vi.mocked(createDriverNotePreset).mockReset();
  vi.mocked(renameDriverNotePreset).mockReset();
  vi.mocked(deleteDriverNotePreset).mockReset();
});

const open = async (onChanged = vi.fn()) => {
  render(<DriverNoteManageDialog open onOpenChange={() => {}} onChanged={onChanged} />);
  await screen.findByDisplayValue('Chuyên chạy ghép');
  return onChanged;
};

describe('DriverNoteManageDialog', () => {
  it('hiển thị các mục hiện có', async () => {
    await open();
    expect(screen.getByDisplayValue('Chưa chạy ghép bao giờ')).toBeInTheDocument();
  });

  it('xoá mục → gọi API và mục biến mất', async () => {
    vi.mocked(deleteDriverNotePreset).mockResolvedValue(undefined);
    const onChanged = await open();
    fireEvent.click(screen.getAllByRole('button', { name: /^xoá$/i })[0]);
    await waitFor(() => expect(deleteDriverNotePreset).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(screen.queryByDisplayValue('Chuyên chạy ghép')).not.toBeInTheDocument());
    expect(onChanged).toHaveBeenCalled();
  });

  it('xoá bị từ chối (409) → toast destructive, mục vẫn còn', async () => {
    vi.mocked(deleteDriverNotePreset).mockRejectedValue(new Error('Đang có 2 tài xế dùng ghi chú này'));
    await open();
    fireEvent.click(screen.getAllByRole('button', { name: /^xoá$/i })[0]);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', description: 'Đang có 2 tài xế dùng ghi chú này' }),
      ),
    );
    expect(screen.getByDisplayValue('Chuyên chạy ghép')).toBeInTheDocument();
  });

  it('sửa tên rồi Lưu → renameDriverNotePreset(id, tên mới)', async () => {
    vi.mocked(renameDriverNotePreset).mockResolvedValue({ id: 'a', label: 'Tên mới', sortOrder: 10 });
    await open();
    const input = screen.getByDisplayValue('Chuyên chạy ghép');
    const save = screen.getAllByRole('button', { name: /^lưu$/i })[0];
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Tên mới' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(renameDriverNotePreset).toHaveBeenCalledWith('a', 'Tên mới'));
  });

  it('thêm mục mới → createDriverNotePreset("X")', async () => {
    vi.mocked(createDriverNotePreset).mockResolvedValue({ id: 'c', label: 'X', sortOrder: 30 });
    await open();
    fireEvent.change(screen.getByPlaceholderText(/ghi chú mới/i), { target: { value: ' X ' } });
    fireEvent.click(screen.getByRole('button', { name: /^thêm$/i }));
    await waitFor(() => expect(createDriverNotePreset).toHaveBeenCalledWith('X'));
    expect(await screen.findByDisplayValue('X')).toBeInTheDocument();
  });
});
