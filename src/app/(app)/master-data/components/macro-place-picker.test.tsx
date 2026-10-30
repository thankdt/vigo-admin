import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MacroEndpoint } from '@/lib/macro-bulk';
import type { MacroPlaceFilter } from '@/lib/macro-search';
import { buildSearchIndex } from '@/lib/ward-search';
import type { ProvinceOption, SpecialZone, WardOption } from '@/lib/types';
import type { WardsStatus, ZonesStatus } from './ward-quick-add';

// Chỉ phần «với useMacroPlaceIndex thật» dùng API (nạp mọi xã); ô chọn điểm không tự gọi API nào.
const getWards = vi.fn();
vi.mock('@/lib/api', () => ({
  getPricingMacroWards: (...a: unknown[]) => getWards(...a),
}));

import { useMacroPlaceIndex } from '@/lib/use-macro-place-index';
import { MacroPlacePicker } from './macro-place-picker';

// Cùng bộ dữ liệu với ward-quick-add.test.tsx (ô «Tìm nhanh» của hộp thoại tạo hàng loạt): hai ô dùng chung bộ tìm.
const PROVINCES: ProvinceOption[] = [
  { code: '01', name: 'Hà Nội' },
  { code: '15', name: 'Lào Cai' },
  { code: '19', name: 'Thái Nguyên' },
  { code: '20', name: 'Lạng Sơn' },
  { code: '92', name: 'Cần Thơ' },
];
const WARDS: WardOption[] = [
  { code: '19001', name: 'Đại Từ', provinceCode: '19' },
  { code: '19002', name: 'Đại Phúc', provinceCode: '19' },
  { code: '19003', name: 'Phú Bình', provinceCode: '19' },
  { code: '19004', name: 'Phú Lương', provinceCode: '19' },
  { code: '01001', name: 'Phú Bình', provinceCode: '01' },
  { code: '01002', name: 'Cầu Giấy', provinceCode: '01' },
  { code: '01003', name: 'Nội Bài', provinceCode: '01' },
  { code: '01004', name: 'Láng', provinceCode: '01' },
  { code: '01005', name: 'Thanh Xuân', provinceCode: '01' },
  { code: '92001', name: 'Thạnh Xuân', provinceCode: '92' },
  { code: '15001', name: 'Lào Cai', provinceCode: '15' },
];
const ZONES: SpecialZone[] = [
  { code: 'NOIBAI', name: 'Sân bay Nội Bài', provinceCode: '01', provinceName: 'Hà Nội', kind: 'AIRPORT', active: true },
];

const DAI_TU: MacroEndpoint = { provinceCode: '19', wardCode: '19001', label: 'Đại Từ (Thái Nguyên)' };
const PHU_BINH_HN: MacroEndpoint = { provinceCode: '01', wardCode: '01001', label: 'Phú Bình (Hà Nội)' };
const PHU_BINH_TN: MacroEndpoint = { provinceCode: '19', wardCode: '19003', label: 'Phú Bình (Thái Nguyên)' };
const noop = () => {};

function Harness({
  wards = WARDS,
  provinces = PROVINCES,
  status = 'ready',
  error = null,
  zonesStatus = 'ready',
  initial = null,
  onChange,
  onNeed,
  onSubmit,
  idPrefix,
  onPendingChange,
}: {
  wards?: WardOption[];
  provinces?: ProvinceOption[];
  status?: WardsStatus;
  error?: string | null;
  zonesStatus?: ZonesStatus;
  initial?: MacroPlaceFilter | null;
  onChange?: (v: MacroPlaceFilter | null) => void;
  onNeed?: () => void;
  onSubmit?: () => void;
  idPrefix?: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [value, setValue] = React.useState<MacroPlaceFilter | null>(initial);
  const index = React.useMemo(() => buildSearchIndex({ provinces, wards, zones: ZONES }), [provinces, wards]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <MacroPlacePicker
        label="Điểm đón"
        value={value}
        onChange={(v) => {
          onChange?.(v);
          setValue(v);
        }}
        index={index}
        wardsStatus={status}
        wardsError={error}
        zonesStatus={zonesStatus}
        onNeedWards={onNeed ?? noop}
        idPrefix={idPrefix}
        onPendingChange={onPendingChange}
      />
      <button type="submit">Lọc</button>
      <button type="button">ô khác</button>
    </form>
  );
}

const input = () => screen.getByRole('combobox', { name: 'Điểm đón: tìm phường/xã, tỉnh hoặc điểm đặc biệt' });
const queryInput = () => screen.queryByRole('combobox', { name: 'Điểm đón: tìm phường/xã, tỉnh hoặc điểm đặc biệt' });
const listbox = () => screen.getByRole('listbox', { name: 'Điểm đón: gợi ý' });
const options = () => within(listbox()).getAllByRole('option');
const optionNames = () => options().map((o) => o.getAttribute('aria-label'));
const highlighted = () =>
  options()
    .filter((o) => o.getAttribute('aria-selected') === 'true')
    .map((o) => o.getAttribute('aria-label'));
const hint = () => screen.getByTestId('place-picker-hint-Điểm đón');
const chip = () => screen.getByTestId('place-picker-chip-Điểm đón');
const clearChip = () => screen.getByRole('button', { name: 'Bỏ Điểm đón' });
const textRow = (t: string) => `Tìm theo chữ «${t}» (gồm tên huyện/tỉnh cũ)`;
const pendingLine = () => screen.getByTestId('place-picker-pending-Điểm đón');
const PENDING_TEXT =
  'Chữ gõ ở ô Điểm đón chưa được chọn — danh sách CHƯA lọc theo điểm này. Chọn một dòng gợi ý hoặc «Tìm theo chữ».';

beforeEach(() => {
  getWards.mockReset();
});

describe('MacroPlacePicker — gõ rõ ràng thì Enter/bấm là chọn', () => {
  it('chưa gõ: không danh sách, không chip; gợi ý trống', () => {
    render(<Harness />);
    expect(input()).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByTestId('place-picker-chip-Điểm đón')).not.toBeInTheDocument();
    expect(hint()).toBeEmptyDOMElement();
  });

  it('"dai tu": dòng xã rồi dòng «Tìm theo chữ» ở CUỐI; dòng xã được tô sẵn; Enter chọn ĐIỂM, hiện chip, focus vào CHIP (không vào nút bỏ)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), 'dai tu');
    expect(optionNames()).toEqual(['Đại Từ, Thái Nguyên', textRow('dai tu')]);
    expect(highlighted()).toEqual(['Đại Từ, Thái Nguyên']);
    expect(hint()).toHaveTextContent('Enter để chọn «Đại Từ (Thái Nguyên)».');
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(input()).toHaveAttribute('aria-controls', listbox().id);
    expect(input()).toHaveAttribute('aria-activedescendant', options()[0].id);

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ kind: 'place', endpoint: DAI_TU });
    expect(chip()).toHaveTextContent('Đại Từ (Thái Nguyên)');
    expect(queryInput()).not.toBeInTheDocument();
    expect(chip()).toHaveFocus();
    expect(clearChip()).not.toHaveFocus();
    expect(chip()).toHaveAccessibleName('Điểm đón: Đại Từ (Thái Nguyên)');

    // Enter lần hai (gõ đúp / giữ phím) KHÔNG bỏ lựa chọn vừa chọn
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(chip()).toHaveTextContent('Đại Từ (Thái Nguyên)');
  });

  it('bấm chọn một dòng (chuột) cũng đưa focus vào chip, không vào nút bỏ', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'phu binh');
    await user.click(screen.getByRole('option', { name: 'Phú Bình, Hà Nội' }));
    expect(chip()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(chip()).toHaveTextContent('Phú Bình (Hà Nội)');
  });

  it('bấm vào một dòng: chọn đúng dòng được bấm (kể cả khi đang hoà, không phải dòng đầu)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), 'phu binh');
    await user.click(options()[1]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ kind: 'place', endpoint: PHU_BINH_TN });
  });

  it('«Cả tỉnh» và điểm đặc biệt chọn được (cùng dạng điểm với hộp thoại tạo hàng loạt)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), 'thai nguyen{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'place', endpoint: { provinceCode: '19', label: 'Cả tỉnh Thái Nguyên' } });
    await user.click(clearChip());
    await user.type(input(), 'san bay noi bai{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'place',
      endpoint: { provinceCode: '01', wardCode: 'ZONE:NOIBAI', label: 'Sân bay Nội Bài (điểm đặc biệt)' },
    });
  });

  it('Enter không bao giờ gửi form bao quanh (có chọn hay không)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.type(input(), 'phu binh{Enter}');
    await user.clear(input());
    await user.type(input(), 'd{Enter}');
    await user.clear(input());
    await user.type(input(), 'dai tu{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('MacroPlacePicker — mơ hồ thì KHÔNG tự chọn', () => {
  it('"phu binh" (hai xã cùng tên): không dòng nào được tô, Enter KHÔNG chọn gì, chữ giữ nguyên', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), 'phu binh');
    expect(optionNames()).toEqual(['Phú Bình, Hà Nội', 'Phú Bình, Thái Nguyên', textRow('phu binh')]);
    expect(highlighted()).toEqual([]);
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(hint()).toHaveTextContent('Có 2 nơi cùng tên «Phú Bình» — xem kỹ tên tỉnh');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue('phu binh');
  });

  it('↓ tô dòng đầu, ↓↓ tới dòng «Tìm theo chữ», ↓ nữa vòng về đầu; ↑ từ chưa chọn = dòng cuối; Enter chọn dòng đang tô', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), 'phu binh');
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toEqual(['Phú Bình, Hà Nội']);
    expect(hint()).toHaveTextContent('Enter để chọn «Phú Bình (Hà Nội)».');
    expect(input()).toHaveAttribute('aria-activedescendant', options()[0].id);
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toEqual(['Phú Bình, Thái Nguyên']);
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toEqual([textRow('phu binh')]);
    expect(hint()).toHaveTextContent('Enter để tìm theo chữ «phu binh» (gồm tên huyện/tỉnh cũ).');
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toEqual(['Phú Bình, Hà Nội']);
    await user.keyboard('{ArrowUp}');
    expect(highlighted()).toEqual([textRow('phu binh')]);
    await user.keyboard('{ArrowUp}{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ kind: 'place', endpoint: PHU_BINH_TN });

    await user.click(clearChip());
    await user.type(input(), 'phu binh{ArrowUp}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'text', text: 'phu binh' }); // ↑ từ chưa chọn = dòng cuối = dòng chữ
    await user.click(clearChip());
    await user.type(input(), 'phu binh{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'place', endpoint: PHU_BINH_HN });
  });

  it('rê chuột chỉ để NHÌN: không tô dòng, không đổi thứ Enter sẽ chọn', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), 'phu binh');
    await user.hover(options()[1]);
    expect(highlighted()).toEqual([]);
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowDown}');
    await user.hover(options()[2]);
    expect(highlighted()).toEqual(['Phú Bình, Hà Nội']);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith({ kind: 'place', endpoint: PHU_BINH_HN });
  });

  it('chọn bằng ↓ rồi gõ thêm: lựa chọn cũ KHÔNG theo sang danh sách mới', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), 'phu');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(highlighted()).toHaveLength(1);
    await user.type(input(), ' binh');
    expect(highlighted()).toEqual([]);
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('«noi bai»: sân bay và xã cùng tên ⇒ không tô sẵn; ↓ Enter chọn đúng sân bay', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), 'noi bai');
    expect(optionNames().slice(0, 2)).toEqual(['Sân bay Nội Bài, Hà Nội · điểm đặc biệt', 'Nội Bài, Hà Nội']);
    expect(highlighted()).toEqual([]);
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith({
      kind: 'place',
      endpoint: { provinceCode: '01', wardCode: 'ZONE:NOIBAI', label: 'Sân bay Nội Bài (điểm đặc biệt)' },
    });
  });
});

describe('MacroPlacePicker — dòng «Tìm theo chữ (gồm tên huyện/tỉnh cũ)»', () => {
  it('bấm dòng chữ ⇒ onChange({kind:"text"}) với chữ ĐÃ CẮT; chip «Chữ: … (gồm tên cũ)»', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), '  Đông Anh  ');
    expect(optionNames()).toEqual([textRow('Đông Anh')]);
    await user.click(screen.getByRole('option', { name: textRow('Đông Anh') }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ kind: 'text', text: 'Đông Anh' });
    expect(chip()).toHaveTextContent('Chữ: Đông Anh (gồm tên cũ)');
  });

  it('không có điểm nào khớp: chỉ còn dòng chữ, KHÔNG tô sẵn, Enter không làm gì; ↓ Enter mới chọn', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), 'huyện Sóc Sơn');
    expect(optionNames()).toEqual([textRow('huyện Sóc Sơn')]);
    expect(highlighted()).toEqual([]);
    expect(hint()).toHaveTextContent('Không có phường/xã, tỉnh hay điểm đặc biệt nào khớp «huyện Sóc Sơn»');
    expect(hint()).toHaveTextContent('«Tìm theo chữ»');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith({ kind: 'text', text: 'huyện Sóc Sơn' });
  });

  it('mới 1 ký tự: không danh sách, không dòng chữ; nhắc gõ ít nhất 2 ký tự', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'd');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(hint()).toHaveTextContent('Gõ ít nhất 2 ký tự để tìm.');
  });

  it('ô nhập giới hạn 100 ký tự (trần của máy chủ cho tìm theo chữ)', () => {
    render(<Harness />);
    expect(input()).toHaveAttribute('maxLength', '100');
  });
});

describe('MacroPlacePicker — dữ liệu tìm kiếm chưa đủ thì KHÔNG tô sẵn', () => {
  it('đang nạp xã: «thai nguyen» khớp mạnh duy nhất vẫn không tô, Enter không chọn; nạp xong ⇒ tô theo kết quả MỚI', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<Harness wards={[]} status="loading" onChange={onChange} />);
    await user.type(input(), 'thai nguyen');
    expect(optionNames()).toEqual(['Cả tỉnh Thái Nguyên', textRow('thai nguyen')]);
    expect(highlighted()).toEqual([]);
    expect(hint()).toHaveTextContent('Dữ liệu tìm kiếm chưa tải đủ nên Enter chưa tự chọn');
    expect(hint()).toHaveTextContent('Đang tải danh sách phường/xã');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();

    await user.clear(input());
    await user.type(input(), 'lang');
    expect(optionNames()).toEqual(['Cả tỉnh Lạng Sơn', textRow('lang')]);
    expect(highlighted()).toEqual([]);
    rerender(<Harness wards={WARDS} status="ready" onChange={onChange} />);
    expect(highlighted()).toEqual(['Láng, Hà Nội']);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith({ kind: 'place', endpoint: { provinceCode: '01', wardCode: '01004', label: 'Láng (Hà Nội)' } });
  });

  it('chưa đủ dữ liệu mà người dùng CHỦ ĐỘNG chọn (↓ rồi Enter) thì vẫn chọn được', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness wards={[]} status="loading" onChange={onChange} />);
    await user.type(input(), 'thai nguyen{ArrowDown}');
    expect(highlighted()).toEqual(['Cả tỉnh Thái Nguyên']);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith({ kind: 'place', endpoint: { provinceCode: '19', label: 'Cả tỉnh Thái Nguyên' } });
  });

  it('điểm đặc biệt đang nạp: «dai tu» không tô sẵn; về xong thì tô', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness zonesStatus="loading" />);
    await user.type(input(), 'dai tu');
    expect(highlighted()).toEqual([]);
    expect(hint()).toHaveTextContent('Đang tải điểm đặc biệt');
    rerender(<Harness zonesStatus="ready" />);
    expect(highlighted()).toEqual(['Đại Từ, Thái Nguyên']);
    expect(hint()).not.toHaveTextContent('Đang tải điểm đặc biệt');
  });

  it('lỗi tải điểm đặc biệt: báo rõ, không tô sẵn, vẫn bấm chọn được', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness zonesStatus="error" onChange={onChange} />);
    await user.type(input(), 'dai tu');
    expect(hint()).toHaveTextContent('Không tải được điểm đặc biệt');
    expect(highlighted()).toEqual([]);
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('option', { name: /Đại Từ/ }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'place', endpoint: DAI_TU });
  });

  it('chỉ mục CHƯA có tỉnh nào (danh sách tỉnh chưa về / lỗi): không tô sẵn (có thể thiếu dòng «Cả tỉnh» trùng tên)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness provinces={[]} onChange={onChange} />);
    await user.type(input(), 'dai tu');
    expect(options()).toHaveLength(2);
    expect(highlighted()).toEqual([]);
    expect(hint()).toHaveTextContent('Chưa tải được danh sách tỉnh');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('đang nạp xã: không báo «không có kết quả» (kết quả chưa đáng tin)', async () => {
    const user = userEvent.setup();
    render(<Harness wards={[]} status="loading" />);
    await user.type(input(), 'zzzz');
    expect(hint()).not.toHaveTextContent('Không có phường/xã');
    expect(hint()).toHaveTextContent('Đang tải danh sách phường/xã');
  });
});

describe('MacroPlacePicker — trạng thái nạp xã', () => {
  it('focus: chỉ báo cha nạp khi xã CHƯA nạp (idle) hoặc đã LỖI; đang nạp/đã có thì không', async () => {
    const user = userEvent.setup();
    const onNeed = vi.fn();
    const { rerender } = render(<Harness status="ready" onNeed={onNeed} />);
    await user.click(input());
    expect(onNeed).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'ô khác' }));

    rerender(<Harness status="loading" onNeed={onNeed} />);
    await user.click(input());
    expect(onNeed).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'ô khác' }));

    rerender(<Harness status="idle" onNeed={onNeed} />);
    await user.click(input());
    expect(onNeed).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'ô khác' }));

    rerender(<Harness status="error" error="x" onNeed={onNeed} />);
    await user.click(input());
    expect(onNeed).toHaveBeenCalledTimes(2);
  });

  it('lỗi nạp xã: khối lỗi (kèm lý do) chỉ hiện khi đang ở ô; «Thử tải lại» gọi cha nạp lại và trả focus về ô', async () => {
    const user = userEvent.setup();
    const onNeed = vi.fn();
    render(<Harness wards={[]} status="error" error="Mất kết nối" onNeed={onNeed} />);
    expect(screen.queryByTestId('place-picker-wards-error-Điểm đón')).not.toBeInTheDocument();
    await user.click(input());
    const box = screen.getByTestId('place-picker-wards-error-Điểm đón');
    expect(box).toHaveTextContent('Không tải được danh sách phường/xã (Mất kết nối)');
    expect(box).toHaveTextContent('Enter không tự chọn');
    onNeed.mockClear();
    await user.click(screen.getByRole('button', { name: 'Thử tải lại' }));
    expect(onNeed).toHaveBeenCalledTimes(1);
    expect(input()).toHaveFocus();
  });

  it('lỗi không có lý do thì không in ngoặc rỗng', async () => {
    const user = userEvent.setup();
    render(<Harness wards={[]} status="error" error={null} />);
    await user.click(input());
    expect(screen.getByTestId('place-picker-wards-error-Điểm đón')).toHaveTextContent(/^Không tải được danh sách phường\/xã — /);
  });

  it('quá nhiều kết quả: 30 dòng + dòng chữ, báo «Còn 70 kết quả nữa», không tô sẵn', async () => {
    const user = userEvent.setup();
    const many: WardOption[] = Array.from({ length: 100 }, (_, i) => ({
      code: `9${String(i).padStart(4, '0')}`,
      name: `Phường ${i}`,
      provinceCode: '01',
    }));
    render(<Harness wards={many} />);
    await user.type(input(), 'phuong');
    expect(options()).toHaveLength(31);
    expect(optionNames()[30]).toBe(textRow('phuong'));
    expect(hint()).toHaveTextContent('Còn 70 kết quả nữa — gõ thêm để thu hẹp.');
    expect(highlighted()).toEqual([]);
  });
});

describe('MacroPlacePicker — bàn phím, focus và chip', () => {
  it('Esc xoá chữ và giữ focus ở ô; ô trống thì Esc không làm gì', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'dai{Escape}');
    expect(input()).toHaveValue('');
    expect(input()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(input()).toHaveValue('');
  });

  it('nút × xoá chữ đang gõ, trả focus về ô', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'phu');
    await user.click(screen.getByRole('button', { name: 'Điểm đón: xoá chữ đang gõ' }));
    expect(input()).toHaveValue('');
    expect(input()).toHaveFocus();
  });

  it('rời ô thì đóng danh sách (không che bảng), quay lại thì mở lại với chữ cũ', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'dai tu');
    expect(listbox()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ô khác' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    // chữ gõ dở vẫn còn mà chưa chọn ⇒ dòng vàng cố định báo danh sách CHƯA lọc
    expect(pendingLine()).toHaveTextContent(PENDING_TEXT);
    await user.click(input());
    expect(highlighted()).toEqual(['Đại Từ, Thái Nguyên']);
  });

  it('đang gõ dấu bằng bộ gõ (IME): Enter/↓ thuộc bộ gõ, không chọn', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(input(), 'dai tu');
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input(), { key: 'ArrowDown', isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(input()).toHaveValue('dai tu');
  });

  it('bấm vào danh sách không làm ô mất focus (mousedown bị chặn)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'phu binh');
    const ev = createEvent.mouseDown(listbox());
    fireEvent(listbox(), ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Home/End/← KHÔNG bị chặn (con trỏ vẫn sửa chữ được)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'phu');
    for (const key of ['Home', 'End', 'ArrowLeft']) {
      const ev = createEvent.keyDown(input(), { key });
      fireEvent(input(), ev);
      expect(ev.defaultPrevented).toBe(false);
    }
  });

  it('chip điểm: KHÔNG có ô nhập; bấm «Bỏ Điểm đón» ⇒ onChange(null), ô nhập hiện lại (trống) và có focus', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={{ kind: 'place', endpoint: DAI_TU }} onChange={onChange} />);
    expect(chip()).toHaveTextContent('Điểm đón:');
    expect(chip()).toHaveTextContent('Đại Từ (Thái Nguyên)');
    expect(queryInput()).not.toBeInTheDocument();
    await user.click(clearChip());
    expect(onChange).toHaveBeenCalledWith(null);
    expect(input()).toHaveValue('');
    expect(input()).toHaveFocus();
  });

  it('chip chữ: «Chữ: <chữ> (gồm tên cũ)»', () => {
    render(<Harness initial={{ kind: 'text', text: 'Đông Anh' }} />);
    expect(chip()).toHaveTextContent('Chữ: Đông Anh (gồm tên cũ)');
    expect(clearChip()).toBeInTheDocument();
  });

  it('idPrefix: id danh sách và dòng theo tiền tố; aria-activedescendant trỏ đúng', async () => {
    const user = userEvent.setup();
    render(<Harness idPrefix="loc-don" />);
    await user.type(input(), 'dai tu');
    expect(listbox()).toHaveAttribute('id', 'loc-don-list');
    expect(options()[0]).toHaveAttribute('id', 'loc-don-o0');
    expect(input()).toHaveAttribute('aria-activedescendant', 'loc-don-o0');
  });

  it('không dùng role=alert (đọc xen ngang mỗi phím)', async () => {
    const user = userEvent.setup();
    render(<Harness wards={[]} status="error" error="x" zonesStatus="error" />);
    await user.type(input(), 'noi bai');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('MacroPlacePicker — chữ gõ dở CHƯA chọn: báo cố định + báo cha', () => {
  it('gõ mà chưa chọn ⇒ dòng vàng HIỆN (không sr-only) cả khi đã rời ô; không nhắc lại chữ đã gõ; báo cha true', async () => {
    const user = userEvent.setup();
    const onPending = vi.fn();
    render(<Harness onPendingChange={onPending} />);
    expect(pendingLine()).toBeEmptyDOMElement();
    expect(onPending).toHaveBeenLastCalledWith(false);

    await user.type(input(), 'huyen Soc Son');
    expect(pendingLine()).toHaveTextContent(PENDING_TEXT);
    expect(onPending).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'ô khác' })); // rời ô
    const line = pendingLine();
    expect(line).toHaveTextContent(PENDING_TEXT);
    expect(line.className).not.toContain('sr-only');
    expect(line.className).toContain('amber');
    expect(line).not.toHaveTextContent('Soc Son'); // vùng đọc to: không đọc lại chữ gõ
    expect(line).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-describedby', expect.stringContaining(line.id));
  });

  it('chọn một dòng / xoá chữ (× hoặc Esc) ⇒ hết dòng vàng, báo cha false; chỉ khoảng trắng thì không tính', async () => {
    const user = userEvent.setup();
    const onPending = vi.fn();
    render(<Harness onPendingChange={onPending} />);
    await user.type(input(), 'dai tu');
    expect(onPending).toHaveBeenLastCalledWith(true);
    await user.keyboard('{Enter}');
    expect(screen.queryByTestId('place-picker-pending-Điểm đón')).not.toBeInTheDocument(); // chip: không còn chữ gõ
    expect(onPending).toHaveBeenLastCalledWith(false);

    await user.click(clearChip());
    await user.type(input(), 'phu');
    expect(pendingLine()).toHaveTextContent(PENDING_TEXT);
    await user.click(screen.getByRole('button', { name: 'Điểm đón: xoá chữ đang gõ' }));
    expect(pendingLine()).toBeEmptyDOMElement();
    expect(onPending).toHaveBeenLastCalledWith(false);

    await user.type(input(), 'phu{Escape}');
    expect(pendingLine()).toBeEmptyDOMElement();
    await user.type(input(), '   ');
    expect(pendingLine()).toBeEmptyDOMElement();
    expect(onPending).toHaveBeenLastCalledWith(false);
  });
});

describe('MacroPlacePicker + useMacroPlaceIndex thật', () => {
  function HookHarness({ onChange }: { onChange?: (v: MacroPlaceFilter | null) => void }) {
    const place = useMacroPlaceIndex({ provinces: PROVINCES, zones: ZONES });
    const [value, setValue] = React.useState<MacroPlaceFilter | null>(null);
    return (
      <>
        <MacroPlacePicker
          label="Điểm đón"
          value={value}
          onChange={(v) => {
            onChange?.(v);
            setValue(v);
          }}
          index={place.index}
          wardsStatus={place.wardsStatus}
          wardsError={place.wardsError}
          zonesStatus="ready"
          onNeedWards={place.ensureLoaded}
        />
        <button type="button">ô khác</button>
      </>
    );
  }

  it('focus lần đầu nạp xã MỘT lần (focus lại không nạp nữa); đang nạp thì không tô sẵn; nạp xong thì tô', async () => {
    let resolve!: (w: WardOption[]) => void;
    getWards.mockReturnValue(new Promise<WardOption[]>((r) => (resolve = r)));
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<HookHarness onChange={onChange} />);
    await user.type(input(), 'lang');
    expect(getWards).toHaveBeenCalledTimes(1);
    expect(highlighted()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'ô khác' }));
    await user.click(input());
    expect(getWards).toHaveBeenCalledTimes(1);
    await act(async () => resolve(WARDS));
    expect(highlighted()).toEqual(['Láng, Hà Nội']);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith({ kind: 'place', endpoint: { provinceCode: '01', wardCode: '01004', label: 'Láng (Hà Nội)' } });
    await user.click(clearChip());
    expect(getWards).toHaveBeenCalledTimes(1);
  });

  it('nạp lỗi ⇒ «Thử tải lại» gọi lại API và nạp được', async () => {
    getWards.mockRejectedValueOnce(new Error('Mất kết nối')).mockResolvedValueOnce(WARDS);
    const user = userEvent.setup();
    render(<HookHarness />);
    await user.click(input());
    expect(await screen.findByTestId('place-picker-wards-error-Điểm đón')).toHaveTextContent('Mất kết nối');
    await user.click(screen.getByRole('button', { name: 'Thử tải lại' }));
    expect(getWards).toHaveBeenCalledTimes(2);
    await user.type(input(), 'dai tu');
    expect(highlighted()).toEqual(['Đại Từ, Thái Nguyên']);
    expect(screen.queryByTestId('place-picker-wards-error-Điểm đón')).not.toBeInTheDocument();
  });
});
