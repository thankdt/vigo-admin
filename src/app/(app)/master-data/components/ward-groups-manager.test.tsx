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

  it('nạp xã của nhóm trả rỗng (backend nuốt lỗi) ⇒ khoá Lưu, không để PUT ghi đè nhóm', async () => {
    const user = userEvent.setup();
    getWards.mockResolvedValue([]);
    render(<WardGroupsManager />);
    await user.click(await screen.findByRole('button', { name: 'Sửa nhóm Hà Nam cũ' }));
    const dlg = await screen.findByRole('dialog', { name: 'Sửa nhóm xã' });
    await within(dlg).findByRole('alert');
    expect(within(dlg).getByRole('button', { name: 'Lưu nhóm' })).toBeDisabled();
    expect(updateGroup).not.toHaveBeenCalled();
  });

  it('đang nạp xã của nhóm thì chưa cho Lưu', async () => {
    const user = userEvent.setup();
    getWards.mockReturnValue(new Promise(() => {}));
    render(<WardGroupsManager />);
    await user.click(await screen.findByRole('button', { name: 'Sửa nhóm Hà Nam cũ' }));
    const dlg = await screen.findByRole('dialog', { name: 'Sửa nhóm xã' });
    expect(within(dlg).getByRole('button', { name: 'Lưu nhóm' })).toBeDisabled();
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

  it('tìm kiếm không dấu và sắp xếp A → Z / Số xã trên bảng nhóm xã', async () => {
    const user = userEvent.setup();
    listGroups.mockResolvedValue([
      { ...GROUP, id: 1, name: 'Yên Bái cũ', note: 'miền núi', wardCount: 5, staleCodes: [] },
      { ...GROUP, id: 2, name: 'Đông Anh cũ', note: 'cửa ngõ', wardCount: 12, staleCodes: [] },
      { ...GROUP, id: 3, name: 'Duy Tiên cũ', note: 'khu công nghiệp', wardCount: 3, staleCodes: [] },
      { ...GROUP, id: 4, name: 'Hà Nam cũ', note: 'phía nam', wardCount: 8, staleCodes: [] },
    ]);
    render(<WardGroupsManager />);
    await screen.findByText('Yên Bái cũ');

    const groupNamesInDom = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.querySelector('td')?.textContent?.trim());

    // Chọn sắp xếp Tên nhóm: A → Z (Đông Anh đứng sau Duy Tiên, trước Hà Nam và Yên Bái)
    await user.selectOptions(screen.getByLabelText('Sắp xếp nhóm xã'), 'name:ASC');
    expect(groupNamesInDom()).toEqual(['Duy Tiên cũ', 'Đông Anh cũ', 'Hà Nam cũ', 'Yên Bái cũ']);

    // Bấm tiêu đề cột "Số xã": lần 1 Nhiều → Ít (12, 8, 5, 3), lần 2 Ít → Nhiều (3, 5, 8, 12)
    const countHeader = screen.getByRole('button', { name: /^Số xã/ });
    await user.click(countHeader);
    expect(groupNamesInDom()).toEqual(['Đông Anh cũ', 'Hà Nam cũ', 'Yên Bái cũ', 'Duy Tiên cũ']);

    await user.click(countHeader);
    expect(groupNamesInDom()).toEqual(['Duy Tiên cũ', 'Yên Bái cũ', 'Hà Nam cũ', 'Đông Anh cũ']);

    // Lọc không dấu theo tên/ghi chú
    await user.type(screen.getByLabelText('Tìm nhóm xã'), 'dong anh');
    expect(groupNamesInDom()).toEqual(['Đông Anh cũ']);
  });
});
