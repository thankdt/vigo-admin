import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toastMock = vi.fn();
const listGroups = vi.fn();
const createGroup = vi.fn();
const updateGroup = vi.fn();
const deleteGroup = vi.fn();
const getProvinces = vi.fn();
const getWards = vi.fn();

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/lib/api', () => ({
  listWardGroups: (...a: unknown[]) => listGroups(...a),
  createWardGroup: (...a: unknown[]) => createGroup(...a),
  updateWardGroup: (...a: unknown[]) => updateGroup(...a),
  deleteWardGroup: (...a: unknown[]) => deleteGroup(...a),
  getPricingMacroProvinces: (...a: unknown[]) => getProvinces(...a),
  getPricingMacroWards: (...a: unknown[]) => getWards(...a),
  getWardLegacyOrigins: vi.fn().mockResolvedValue([]),
  getWardLegacyWards: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({ ariaLabel, options, selectedValue, onSelect }: any) => (
    <select aria-label={ariaLabel} value={selectedValue ?? ''} onChange={(e) => onSelect(e.target.value)}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('@/components/ui/multi-select-combobox', () => ({
  MultiSelectComboBox: () => <div />,
}));

import { WardGroupsManager } from './ward-groups-manager';

const GROUP = {
  id: 7,
  name: 'Hà Nam cũ',
  note: 'ghi chú',
  wardCodes: ['13285', '99999'],
  wardCount: 2,
  staleCodes: ['99999'],
  createdBy: null,
  createdAt: '',
  updatedAt: '',
};

beforeEach(() => {
  [toastMock, listGroups, createGroup, updateGroup, deleteGroup, getProvinces, getWards].forEach((m) => m.mockReset());
  getProvinces.mockResolvedValue([{ code: '35', name: 'Ninh Bình' }]);
  getWards.mockResolvedValue([{ code: '13285', name: 'Phường Phủ Lý', provinceCode: '35' }]);
  listGroups.mockResolvedValue([GROUP]);
});

describe('WardGroupsManager', () => {
  it('liệt kê nhóm, cảnh báo xã không còn; lời giải thích nói rõ nhóm chỉ là mẫu chọn', async () => {
    render(<WardGroupsManager />);
    expect(await screen.findByText('Hà Nam cũ')).toBeInTheDocument();
    expect(screen.getByText('1 xã không còn')).toBeInTheDocument();
    expect(screen.getByText(/KHÔNG đổi các quy tắc đã tạo/)).toBeInTheDocument();
  });

  it('sửa nhóm: bỏ xã không còn khỏi danh sách và KHÔNG gửi lại trong PUT', async () => {
    const user = userEvent.setup();
    updateGroup.mockResolvedValue(GROUP);
    render(<WardGroupsManager />);
    await user.click(await screen.findByRole('button', { name: 'Sửa nhóm Hà Nam cũ' }));
    const dlg = await screen.findByRole('dialog', { name: 'Sửa nhóm xã' });
    await within(dlg).findByText(/Phường Phủ Lý/);
    expect(within(dlg).getByRole('note')).toHaveTextContent('1 xã');
    await user.click(within(dlg).getByRole('button', { name: 'Lưu nhóm' }));
    await waitFor(() => expect(updateGroup).toHaveBeenCalledTimes(1));
    expect(updateGroup).toHaveBeenCalledWith(7, { name: 'Hà Nam cũ', note: 'ghi chú', wardCodes: ['13285'] });
  });

  it('tạo nhóm: chưa có xã thì khoá nút Lưu', async () => {
    const user = userEvent.setup();
    listGroups.mockResolvedValue([]);
    render(<WardGroupsManager />);
    await user.click(await screen.findByRole('button', { name: /Thêm nhóm xã/ }));
    const dlg = await screen.findByRole('dialog', { name: 'Thêm nhóm xã' });
    await user.type(within(dlg).getByLabelText('Tên nhóm'), 'Nhóm mới');
    expect(within(dlg).getByRole('button', { name: 'Lưu nhóm' })).toBeDisabled();
    expect(createGroup).not.toHaveBeenCalled();
  });

  it('xoá nhóm: chỉ gọi API sau khi xác nhận, và nói luật đã tạo không bị ảnh hưởng', async () => {
    const user = userEvent.setup();
    deleteGroup.mockResolvedValue(undefined);
    render(<WardGroupsManager />);
    await user.click(await screen.findByRole('button', { name: 'Xoá nhóm Hà Nam cũ' }));
    expect(deleteGroup).not.toHaveBeenCalled();
    expect(await screen.findByText(/KHÔNG bị ảnh hưởng/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xoá nhóm' }));
    await waitFor(() => expect(deleteGroup).toHaveBeenCalledWith(7));
  });
});
