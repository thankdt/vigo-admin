import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getWards = vi.fn();
const getOrigins = vi.fn();
const getLegacyWards = vi.fn();
const getGroups = vi.fn();

vi.mock('@/lib/api', () => ({
  getPricingMacroWards: (...a: unknown[]) => getWards(...a),
  getWardLegacyOrigins: (...a: unknown[]) => getOrigins(...a),
  getWardLegacyWards: (...a: unknown[]) => getLegacyWards(...a),
  listWardGroups: (...a: unknown[]) => getGroups(...a),
}));
// Combobox (Popover+cmdk) trong jsdom: thay bằng <select> thô; việc lọc gõ có test riêng ở combobox.test.tsx.
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

import { WardSourcePanel } from './ward-source-panel';

const PROVINCES = [{ code: '35', name: 'Ninh Bình' }];
const ALL_WARDS = [
  { code: '13285', name: 'Phường Phủ Lý', provinceCode: '35' },
  { code: '13291', name: 'Xã Bình Lục', provinceCode: '35' },
  { code: '13300', name: 'Phường Châu Sơn', provinceCode: '35' },
];
const part = (d: string) => ({
  legacyProvinceCode: '35',
  legacyProvinceName: 'Tỉnh Hà Nam',
  legacyDistrictCode: d,
  legacyDistrictName: `Huyện ${d}`,
  legacyWardNames: [],
  hasPartial: false,
});

beforeEach(() => {
  [getWards, getOrigins, getLegacyWards, getGroups].forEach((m) => m.mockReset());
  getWards.mockResolvedValue(ALL_WARDS);
});

function setup() {
  const onAdd = vi.fn();
  render(<WardSourcePanel title="Điểm đón" provinces={PROVINCES} onAdd={onAdd} />);
  return { onAdd, user: userEvent.setup() };
}

describe('WardSourcePanel — theo tỉnh cũ / huyện cũ', () => {
  it('xã thuần tích sẵn, xã gộp để riêng không tích; thêm đúng các xã đã tích', async () => {
    getOrigins.mockResolvedValue([
      { code: '35', name: 'Tỉnh Hà Nam', wardCount: 3, pureWardCount: 2, districts: [{ code: '347', name: 'Huyện 347', wardCount: 3, pureWardCount: 2 }] },
    ]);
    getLegacyWards.mockResolvedValue([
      { wardCode: '13285', wardName: 'Phường Phủ Lý', provinceCode: '35', provinceName: 'Ninh Bình', provinceLevel: 'PURE_PROVINCE', districtLevel: 'PURE_DISTRICT', selectable: true, parts: [part('347')] },
      { wardCode: '13291', wardName: 'Xã Bình Lục', provinceCode: '35', provinceName: 'Ninh Bình', provinceLevel: 'PURE_PROVINCE', districtLevel: 'PURE_DISTRICT', selectable: true, parts: [part('347')] },
      { wardCode: '13300', wardName: 'Phường Châu Sơn', provinceCode: '35', provinceName: 'Ninh Bình', provinceLevel: 'PURE_PROVINCE', districtLevel: 'MIXED_DISTRICT', selectable: false, parts: [part('347'), part('351')] },
    ]);
    const { onAdd, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Điểm đón: Theo tỉnh cũ / huyện cũ' }));
    const sel = await screen.findByLabelText('Điểm đón: tỉnh cũ');
    await waitFor(() => expect(sel).toBeEnabled());
    await user.selectOptions(sel, '35');
    await waitFor(() => expect(getLegacyWards).toHaveBeenCalledWith({ legacyProvinceCode: '35' }));

    const pure = await screen.findByRole('group', { name: 'Điểm đón: xã thuần' });
    expect(within(pure).getAllByRole('checkbox').every((c) => c.getAttribute('data-state') === 'checked')).toBe(true);
    const mixed = screen.getByRole('group', { name: 'Điểm đón: xã gộp' });
    expect(within(mixed).getByRole('checkbox').getAttribute('data-state')).toBe('unchecked');
    expect(mixed).toHaveTextContent('gộp từ: Huyện 347');

    await waitFor(() => expect(screen.getByRole('button', { name: /thêm 2 xã theo vùng cũ/ })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /thêm 2 xã theo vùng cũ/ }));
    expect(onAdd).toHaveBeenCalledWith([
      { provinceCode: '35', wardCode: '13285', label: 'Phường Phủ Lý (Ninh Bình)' },
      { provinceCode: '35', wardCode: '13291', label: 'Xã Bình Lục (Ninh Bình)' },
    ]);
  });

  it('chọn huyện cũ gọi API theo huyện', async () => {
    getOrigins.mockResolvedValue([
      { code: '35', name: 'Tỉnh Hà Nam', wardCount: 1, pureWardCount: 1, districts: [{ code: '347', name: 'Huyện 347', wardCount: 1, pureWardCount: 1 }] },
    ]);
    getLegacyWards.mockResolvedValue([]);
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Điểm đón: Theo tỉnh cũ / huyện cũ' }));
    const sel = await screen.findByLabelText('Điểm đón: tỉnh cũ');
    await waitFor(() => expect(sel).toBeEnabled());
    await user.selectOptions(sel, '35');
    await user.selectOptions(screen.getByLabelText('Điểm đón: huyện cũ'), '347');
    await waitFor(() => expect(getLegacyWards).toHaveBeenLastCalledWith({ legacyDistrictCode: '347' }));
  });
});

describe('WardSourcePanel — nhóm xã', () => {
  it('chỉ thêm xã còn tồn tại, bỏ staleCodes', async () => {
    getGroups.mockResolvedValue([
      { id: 1, name: 'Hà Nam cũ', note: null, wardCodes: ['13285', '99999'], wardCount: 2, staleCodes: ['99999'], createdBy: null, createdAt: '', updatedAt: '' },
    ]);
    const { onAdd, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Điểm đón: Nhóm xã' }));
    const sel = await screen.findByLabelText('Điểm đón: chọn nhóm xã');
    await waitFor(() => expect(sel).toBeEnabled());
    await user.selectOptions(sel, '1');
    expect(screen.getByText(/1 xã trong nhóm không còn/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Điểm đón: thêm nhóm xã' });
    await waitFor(() => expect(btn).toBeEnabled());
    await user.click(btn);
    expect(onAdd).toHaveBeenCalledWith([{ provinceCode: '35', wardCode: '13285', label: 'Phường Phủ Lý (Ninh Bình)' }]);
  });
});

describe('WardSourcePanel — dán danh sách', () => {
  it('khớp tên, hiện preview, chỉ thêm xã đã khớp', async () => {
    const { onAdd, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Điểm đón: Dán danh sách' }));
    await user.selectOptions(screen.getByLabelText('Điểm đón: tỉnh để khớp tên'), '35');
    await user.type(screen.getByLabelText('Điểm đón: danh sách tên hoặc mã xã'), 'phu ly{Enter}Bình Lục{Enter}Không Có Xã');
    const match = screen.getByRole('button', { name: 'Điểm đón: khớp danh sách' });
    await waitFor(() => expect(match).toBeEnabled());
    await user.click(match);
    const preview = await screen.findByTestId('paste-preview');
    expect(preview).toHaveTextContent('Tự khớp (2)');
    expect(preview).toHaveTextContent('Không khớp (1)');
    await user.click(screen.getByRole('button', { name: 'Điểm đón: thêm các xã đã khớp' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].map((e: any) => e.wardCode)).toEqual(['13285', '13291']);
  });
});
