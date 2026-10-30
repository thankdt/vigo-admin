import * as React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import type { MacroEndpoint } from '@/lib/macro-bulk';
import { EMPTY_FILTERS, type MacroSearchFilters } from '@/lib/macro-search';
import { buildSearchIndex } from '@/lib/ward-search';
import type { ProvinceOption, SpecialZone, WardOption } from '@/lib/types';
import { MacroSearchBar } from './macro-search-bar';

// Select của Radix cần mấy API con trỏ mà jsdom không có (cùng cách với crm-segments/page.test.tsx).
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!window.PointerEvent) (window as any).PointerEvent = MouseEvent;
});

const PROVINCES: ProvinceOption[] = [
  { code: '01', name: 'Hà Nội' },
  { code: '19', name: 'Thái Nguyên' },
];
const WARDS: WardOption[] = [
  { code: '19001', name: 'Đại Từ', provinceCode: '19' },
  { code: '01002', name: 'Cầu Giấy', provinceCode: '01' },
  { code: '01003', name: 'Nội Bài', provinceCode: '01' },
];
const ZONES: SpecialZone[] = [
  { code: 'NOIBAI', name: 'Sân bay Nội Bài', provinceCode: '01', provinceName: 'Hà Nội', kind: 'AIRPORT', active: true },
];
const DAI_TU: MacroEndpoint = { provinceCode: '19', wardCode: '19001', label: 'Đại Từ (Thái Nguyên)' };
const CAU_GIAY: MacroEndpoint = { provinceCode: '01', wardCode: '01002', label: 'Cầu Giấy (Hà Nội)' };

function Harness({ initial = EMPTY_FILTERS, onChange }: { initial?: MacroSearchFilters; onChange?: (next: MacroSearchFilters) => void }) {
  const [value, setValue] = React.useState<MacroSearchFilters>(initial);
  const index = React.useMemo(() => buildSearchIndex({ provinces: PROVINCES, wards: WARDS, zones: ZONES }), []);
  return (
    <MacroSearchBar
      value={value}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
      index={index}
      wardsStatus="ready"
      wardsError={null}
      zonesStatus="ready"
      onNeedWards={() => {}}
    />
  );
}

const setup = () => userEventLib.setup({ pointerEventsCheck: 0 });
const originInput = () => screen.getByRole('combobox', { name: 'Điểm đón: tìm phường/xã, tỉnh hoặc điểm đặc biệt' });
const destInput = () => screen.getByRole('combobox', { name: 'Điểm đến: tìm phường/xã, tỉnh hoặc điểm đặc biệt' });
const select = (name: 'Dịch vụ' | 'Loại xe' | 'Trạng thái') => screen.getByRole('combobox', { name });
const qInput = () => screen.getByRole('textbox', { name: 'Ghi chú hoặc mã quy tắc' });
const cover = () => screen.getByRole('checkbox', { name: 'Gồm cả quy tắc cấp tỉnh / mọi nơi áp cho điểm đã chọn' });
const clearAll = () => screen.queryByRole('button', { name: 'Xoá lọc' });
const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[fn.mock.calls.length - 1][0] as MacroSearchFilters;

async function choose(user: ReturnType<typeof setup>, name: 'Dịch vụ' | 'Loại xe' | 'Trạng thái', option: string) {
  await user.click(select(name));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('MacroSearchBar — đủ ô lọc, bộ lọc rỗng', () => {
  it('2 ô điểm, 3 ô chọn, ô ghi chú/mã, ô «gồm cấp tỉnh/mọi nơi»; chưa lọc gì thì KHÔNG có «Xoá lọc»', () => {
    render(<Harness />);
    expect(originInput()).toBeInTheDocument();
    expect(destInput()).toBeInTheDocument();
    expect(select('Dịch vụ')).toHaveTextContent('Tất cả dịch vụ');
    expect(select('Loại xe')).toHaveTextContent('Tất cả loại xe');
    expect(select('Trạng thái')).toHaveTextContent('Tất cả trạng thái');
    expect(qInput()).toHaveAttribute('placeholder', 'Ghi chú hoặc mã quy tắc (vd #123)');
    expect(qInput()).toHaveValue('');
    expect(cover()).toBeChecked();
    expect(cover()).toBeDisabled();
    expect(clearAll()).not.toBeInTheDocument();
  });

  it('hiện đúng giá trị đang lọc (điều khiển hoàn toàn từ value)', () => {
    render(
      <Harness
        initial={{
          ...EMPTY_FILTERS,
          origin: { kind: 'place', endpoint: DAI_TU },
          dest: { kind: 'text', text: 'Đông Anh' },
          serviceType: 'RIDE',
          vehicleType: 'CAR_7',
          isActive: 'false',
          q: '#12',
          cover: false,
        }}
      />,
    );
    expect(screen.getByTestId('place-picker-chip-Điểm đón')).toHaveTextContent('Đại Từ (Thái Nguyên)');
    expect(screen.getByTestId('place-picker-chip-Điểm đến')).toHaveTextContent('Chữ: Đông Anh (gồm tên cũ)');
    expect(select('Dịch vụ')).toHaveTextContent('Bao xe');
    expect(select('Loại xe')).toHaveTextContent('Xe 7 chỗ');
    expect(select('Trạng thái')).toHaveTextContent('Đang tắt');
    expect(qInput()).toHaveValue('#12');
    expect(cover()).not.toBeChecked();
    expect(cover()).toBeEnabled();
    expect(clearAll()).toBeInTheDocument();
  });
});

describe('MacroSearchBar — mỗi ô phát đúng giá trị mới, giữ nguyên các ô khác', () => {
  it('điểm đón chọn bằng Enter (điểm), điểm đến chọn dòng «Tìm theo chữ» (chữ)', async () => {
    const user = setup();
    const onChange = vi.fn();
    render(<Harness initial={{ ...EMPTY_FILTERS, serviceType: 'CARPOOL' }} onChange={onChange} />);
    await user.type(originInput(), 'dai tu{Enter}');
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, serviceType: 'CARPOOL', origin: { kind: 'place', endpoint: DAI_TU } });
    await user.type(destInput(), 'Đông Anh');
    await user.click(screen.getByRole('option', { name: 'Tìm theo chữ «Đông Anh» (gồm tên huyện/tỉnh cũ)' }));
    expect(last(onChange)).toEqual({
      ...EMPTY_FILTERS,
      serviceType: 'CARPOOL',
      origin: { kind: 'place', endpoint: DAI_TU },
      dest: { kind: 'text', text: 'Đông Anh' },
    });
  });

  it('bỏ chip điểm đón ⇒ origin null, các ô khác giữ nguyên', async () => {
    const user = setup();
    const onChange = vi.fn();
    render(<Harness initial={{ ...EMPTY_FILTERS, origin: { kind: 'place', endpoint: DAI_TU }, q: 'abc' }} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Bỏ Điểm đón' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, q: 'abc' });
  });

  it('Dịch vụ: Ghép xe ⇒ CARPOOL, Bao xe ⇒ RIDE, Tất cả dịch vụ ⇒ ""', async () => {
    const user = setup();
    const onChange = vi.fn();
    render(<Harness initial={{ ...EMPTY_FILTERS, q: 'x' }} onChange={onChange} />);
    await choose(user, 'Dịch vụ', 'Ghép xe');
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, q: 'x', serviceType: 'CARPOOL' });
    await choose(user, 'Dịch vụ', 'Bao xe');
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, q: 'x', serviceType: 'RIDE' });
    await choose(user, 'Dịch vụ', 'Tất cả dịch vụ');
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, q: 'x', serviceType: '' });
  });

  it('Loại xe: Xe 4 chỗ ⇒ CAR_4, Xe 7 chỗ ⇒ CAR_7, Tất cả loại xe ⇒ ""', async () => {
    const user = setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await choose(user, 'Loại xe', 'Xe 4 chỗ');
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, vehicleType: 'CAR_4' });
    await choose(user, 'Loại xe', 'Xe 7 chỗ');
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, vehicleType: 'CAR_7' });
    await choose(user, 'Loại xe', 'Tất cả loại xe');
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, vehicleType: '' });
  });

  it('Trạng thái: Đang bật ⇒ "true", Đang tắt ⇒ "false", Tất cả trạng thái ⇒ ""', async () => {
    const user = setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await choose(user, 'Trạng thái', 'Đang bật');
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, isActive: 'true' });
    await choose(user, 'Trạng thái', 'Đang tắt');
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, isActive: 'false' });
    await choose(user, 'Trạng thái', 'Tất cả trạng thái');
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, isActive: '' });
  });

  it('ô ghi chú/mã phát MỖI lần gõ (trang tự debounce), giữ nguyên chữ — không cắt khoảng trắng khi đang gõ', async () => {
    const user = setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(qInput(), '#1 ');
    expect(onChange.mock.calls.map((c) => (c[0] as MacroSearchFilters).q)).toEqual(['#', '#1', '#1 ']);
    expect(last(onChange)).toEqual({ ...EMPTY_FILTERS, q: '#1 ' });
  });

  it('«gồm cấp tỉnh/mọi nơi»: tắt khi chưa có điểm cụ thể (kể cả khi chỉ có chữ); có điểm thì bật/tắt được', async () => {
    const user = setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(cover()).toBeDisabled();
    expect(screen.getByText(/Chọn một điểm cụ thể/)).toBeInTheDocument();

    await user.type(originInput(), 'Đông Anh');
    await user.click(screen.getByRole('option', { name: 'Tìm theo chữ «Đông Anh» (gồm tên huyện/tỉnh cũ)' }));
    expect(cover()).toBeDisabled();

    await user.type(destInput(), 'cau giay{Enter}');
    expect(last(onChange).dest).toEqual({ kind: 'place', endpoint: CAU_GIAY });
    expect(cover()).toBeEnabled();
    expect(screen.queryByText(/Chọn một điểm cụ thể/)).not.toBeInTheDocument();
    // chú thích đúng cho CẢ điểm cụ thể lẫn «Cả tỉnh» (tắt: chọn cả tỉnh vẫn thấy mọi quy tắc cấp xã của tỉnh đó)
    expect(
      screen.getByText(
        'Bật: gồm cả quy tắc cấp tỉnh / mọi nơi áp cho điểm đã chọn. Tắt: chỉ quy tắc gắn đúng điểm đã chọn (chọn cả tỉnh thì vẫn thấy mọi quy tắc cấp xã của tỉnh đó).',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('(tắt: chỉ quy tắc gắn đúng điểm đã chọn)')).not.toBeInTheDocument();
    onChange.mockClear();
    await user.click(cover());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(last(onChange).cover).toBe(false);
    expect(cover()).not.toBeChecked();
    await user.click(cover());
    expect(last(onChange).cover).toBe(true);
  });
});

describe('MacroSearchBar — «Xoá lọc»', () => {
  it('chỉ hiện khi đang lọc; bấm ⇒ về bộ lọc rỗng (cover bật lại) và xoá cả chữ gõ dở trong ô điểm', async () => {
    const user = setup();
    const onChange = vi.fn();
    render(
      <Harness
        initial={{ ...EMPTY_FILTERS, origin: { kind: 'place', endpoint: DAI_TU }, isActive: 'true', q: '#9', cover: false }}
        onChange={onChange}
      />,
    );
    await user.type(destInput(), 'phu');
    expect(destInput()).toHaveValue('phu');
    await user.click(clearAll()!);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(last(onChange)).toEqual(EMPTY_FILTERS);
    expect(clearAll()).not.toBeInTheDocument();
    expect(destInput()).toHaveValue('');
    expect(originInput()).toHaveValue('');
    expect(qInput()).toHaveValue('');
    expect(cover()).toBeChecked();
  });

  it('chỉ có khoảng trắng ở ô ghi chú thì chưa tính là đang lọc', () => {
    render(<Harness initial={{ ...EMPTY_FILTERS, q: '   ' }} />);
    expect(clearAll()).not.toBeInTheDocument();
  });

  it('CHƯA lọc gì nhưng ô điểm có chữ gõ dở (chưa chọn) ⇒ vẫn hiện «Xoá lọc»; bấm ⇒ dựng lại ô, mất chữ, hết dòng vàng', async () => {
    const user = setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(clearAll()).not.toBeInTheDocument();
    await user.type(originInput(), 'huyen Soc Son');
    await user.type(destInput(), 'phu');
    await user.click(qInput()); // rời hai ô điểm
    expect(onChange).not.toHaveBeenCalled(); // chữ gõ dở KHÔNG phải bộ lọc
    expect(screen.getByTestId('place-picker-pending-Điểm đón')).toHaveTextContent('chưa được chọn');
    expect(screen.getByTestId('place-picker-pending-Điểm đến')).toHaveTextContent('chưa được chọn');
    expect(clearAll()).toBeInTheDocument();

    await user.click(clearAll()!);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(last(onChange)).toEqual(EMPTY_FILTERS);
    expect(originInput()).toHaveValue('');
    expect(destInput()).toHaveValue('');
    expect(screen.getByTestId('place-picker-pending-Điểm đón')).toBeEmptyDOMElement();
    expect(screen.getByTestId('place-picker-pending-Điểm đến')).toBeEmptyDOMElement();
    expect(clearAll()).not.toBeInTheDocument();
  });

  it('chỉ MỘT ô điểm gõ dở cũng đủ; xoá chữ bằng tay ⇒ «Xoá lọc» ẩn lại', async () => {
    const user = setup();
    render(<Harness />);
    await user.type(destInput(), 'phu');
    expect(clearAll()).toBeInTheDocument();
    await user.clear(destInput());
    expect(clearAll()).not.toBeInTheDocument();
  });
});

describe('MacroSearchBar — ô ghi chú/mã', () => {
  it('giới hạn 200 ký tự (trần `q` của máy chủ)', () => {
    render(<Harness />);
    expect(qInput()).toHaveAttribute('maxLength', '200');
  });
});

describe('MacroSearchBar — bố cục màn hẹp', () => {
  it('hàng ô lọc tự xuống dòng; ô điểm và ô ghi chú rộng hết màn hình nhỏ', () => {
    render(<Harness />);
    const row = screen.getByTestId('macro-search-bar-row');
    expect(row.className).toContain('flex-wrap');
    for (const el of [originInput(), destInput(), qInput()]) {
      expect(el.closest('[data-search-cell]')?.className).toContain('w-full');
    }
  });
});
