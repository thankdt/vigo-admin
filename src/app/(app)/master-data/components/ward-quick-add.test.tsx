import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { addEndpoints, type MacroEndpoint } from '@/lib/macro-bulk';
import { buildSearchIndex } from '@/lib/ward-search';
import type { ProvinceOption, SpecialZone, WardOption } from '@/lib/types';
import { WardQuickAdd, isQuickAddEscape, type WardsStatus, type ZonesStatus } from './ward-quick-add';

// Ô «Tìm nhanh» là ô nhập thường + danh sách ARIA tự dựng (không cmdk/Popover) nên chạy THẬT trong jsdom, kể cả khi
// nằm trong Dialog của Radix (nơi Combobox kiểu Popover buộc phải mock — xem macro-bulk-dialog.test).

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
const PHU_BINH_TN: MacroEndpoint = { provinceCode: '19', wardCode: '19003', label: 'Phú Bình (Thái Nguyên)' };

function Harness({
  wards = WARDS,
  status = 'ready',
  error = null,
  zonesStatus = 'ready',
  initialItems = [],
  onAdd,
  onPending,
  onNeed,
  onSubmit,
}: {
  wards?: WardOption[];
  status?: WardsStatus;
  error?: string | null;
  zonesStatus?: ZonesStatus;
  initialItems?: MacroEndpoint[];
  onAdd?: (e: MacroEndpoint) => void;
  onPending?: (p: string | null) => void;
  onNeed?: () => void;
  onSubmit?: () => void;
}) {
  const [items, setItems] = React.useState<MacroEndpoint[]>(initialItems);
  const index = React.useMemo(() => buildSearchIndex({ provinces: PROVINCES, wards, zones: ZONES }), [wards]);
  const noop = React.useCallback(() => {}, []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <WardQuickAdd
        title="Điểm trả"
        index={index}
        wardsStatus={status}
        wardsError={error}
        zonesStatus={zonesStatus}
        items={items}
        onNeedWards={onNeed ?? noop}
        onAdd={(e) => {
          onAdd?.(e);
          setItems((prev) => addEndpoints(prev, [e]));
        }}
        onPendingChange={onPending ?? noop}
      />
      <button type="submit">Tạo</button>
    </form>
  );
}

const input = () => screen.getByRole('combobox', { name: 'Điểm trả: tìm nhanh phường/xã hoặc tỉnh' });
const listbox = () => screen.getByRole('listbox', { name: 'Điểm trả: kết quả tìm nhanh' });
const options = () => within(listbox()).getAllByRole('option');
const optionNames = () => options().map((o) => o.getAttribute('aria-label'));
const highlighted = () => options().filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.getAttribute('aria-label'));
const hint = () => screen.getByTestId('quick-add-hint-Điểm trả');
const clearBtn = () => screen.getByRole('button', { name: 'Điểm trả: xoá ô tìm nhanh' });

describe('WardQuickAdd — gõ rõ ràng thì Enter/bấm là thêm', () => {
  it('focus vào ô thì báo cha nạp danh sách xã; chưa gõ gì thì không có danh sách và vùng gợi ý trống', async () => {
    const user = userEvent.setup();
    const onNeed = vi.fn();
    render(<Harness onNeed={onNeed} />);
    expect(onNeed).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(hint()).toBeEmptyDOMElement();
    await user.click(input());
    expect(onNeed).toHaveBeenCalled();
  });

  it('gõ "dai tu" (không dấu): ra Đại Từ, dòng đó được TÔ sẵn, hiện đúng nhãn Enter sẽ thêm, aria-activedescendant trỏ đúng dòng', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'dai tu');
    expect(optionNames()).toEqual(['Đại Từ, Thái Nguyên']);
    expect(highlighted()).toEqual(['Đại Từ, Thái Nguyên']);
    expect(hint()).toHaveTextContent('Enter để thêm «Đại Từ (Thái Nguyên)».');
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(input()).toHaveAttribute('aria-controls', listbox().id);
    expect(input()).toHaveAttribute('aria-activedescendant', options()[0].id);
  });

  it('bấm vào dòng: thêm thẳng, ô được xoá và còn focus, báo «Đã thêm»', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'dai tu');
    await user.click(screen.getByRole('option', { name: /Đại Từ/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(DAI_TU);
    expect(input()).toHaveValue('');
    expect(input()).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(screen.getByText('Đã thêm «Đại Từ (Thái Nguyên)».')).toBeInTheDocument();
  });

  it('Enter thêm dòng đang tô khi chắc chắn, và KHÔNG gửi form bao quanh', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onSubmit = vi.fn();
    render(<Harness onAdd={onAdd} onSubmit={onSubmit} />);
    await user.type(input(), 'dai tu{Enter}');
    expect(onAdd).toHaveBeenCalledWith(DAI_TU);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter khi ô trống / không có kết quả / mới 1 ký tự: không thêm gì và không gửi form', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onSubmit = vi.fn();
    render(<Harness onAdd={onAdd} onSubmit={onSubmit} />);
    await user.click(input());
    await user.keyboard('{Enter}');
    await user.type(input(), 'zzzz{Enter}');
    await user.clear(input());
    await user.type(input(), 'd{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('thêm liên tiếp nhiều xã: mỗi lần gõ — Enter, ô tự xoá để gõ tiếp', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'dai tu{Enter}');
    await user.type(input(), 'cau giay{Enter}');
    expect(onAdd.mock.calls.map((c) => c[0].label)).toEqual(['Đại Từ (Thái Nguyên)', 'Cầu Giấy (Hà Nội)']);
  });

  it('«Cả tỉnh» và điểm đặc biệt chọn được từ ô này', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'thai nguyen{Enter}');
    expect(onAdd).toHaveBeenLastCalledWith({ provinceCode: '19', label: 'Cả tỉnh Thái Nguyên' });
    await user.type(input(), 'san bay noi bai{Enter}');
    expect(onAdd).toHaveBeenLastCalledWith({ provinceCode: '01', wardCode: 'ZONE:NOIBAI', label: 'Sân bay Nội Bài (điểm đặc biệt)' });
  });

  it('xã đã có trong danh sách hiện «đã thêm»; chọn lại không thêm trùng và báo rõ', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness initialItems={[DAI_TU]} onAdd={onAdd} />);
    await user.type(input(), 'dai tu');
    const opt = screen.getByRole('option', { name: /Đại Từ/ });
    expect(within(opt).getByText('đã thêm')).toBeInTheDocument();
    expect(opt).toHaveAttribute('aria-label', 'Đại Từ, Thái Nguyên, đã thêm');
    await user.click(opt);
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText('«Đại Từ (Thái Nguyên)» đã có trong danh sách.')).toBeInTheDocument();
    expect(input()).toHaveValue('');
  });
});

describe('WardQuickAdd — mơ hồ thì KHÔNG tự chọn, phải chọn rõ ràng', () => {
  it('"phu binh" (hai xã cùng tên): không dòng nào được tô, báo cùng tên, Enter không thêm gì', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onSubmit = vi.fn();
    render(<Harness onAdd={onAdd} onSubmit={onSubmit} />);
    await user.type(input(), 'phu binh');
    expect(optionNames()).toEqual(['Phú Bình, Hà Nội', 'Phú Bình, Thái Nguyên']);
    expect(highlighted()).toEqual([]);
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(hint()).toHaveTextContent('Có 2 nơi cùng tên «Phú Bình» — xem kỹ tên tỉnh rồi chọn một dòng');
    expect(hint()).not.toHaveTextContent('Cả tỉnh'); // không có dòng «Cả tỉnh» nào trong số hoà ⇒ không nhắc loại
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input()).toHaveValue('phu binh');
  });

  it('↓ rồi Enter chọn dòng ĐẦU (↓ đầu tiên tô dòng 1, không nhảy sang dòng 2); ↓ nữa sang dòng 2; ↑ từ chưa chọn nhảy xuống dòng cuối', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'phu binh');
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toEqual(['Phú Bình, Hà Nội']);
    expect(hint()).toHaveTextContent('Enter để thêm «Phú Bình (Hà Nội)».');
    expect(input()).toHaveAttribute('aria-activedescendant', options()[0].id);
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toEqual(['Phú Bình, Thái Nguyên']);
    await user.keyboard('{ArrowDown}'); // vòng lại dòng đầu
    expect(highlighted()).toEqual(['Phú Bình, Hà Nội']);
    await user.keyboard('{ArrowUp}'); // vòng xuống dòng cuối
    expect(highlighted()).toEqual(['Phú Bình, Thái Nguyên']);
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(PHU_BINH_TN);

    await user.type(input(), 'phu binh{ArrowUp}{Enter}');
    expect(onAdd).toHaveBeenLastCalledWith(PHU_BINH_TN); // ↑ từ trạng thái chưa chọn = dòng cuối
    await user.type(input(), 'phu binh{ArrowDown}{Enter}');
    expect(onAdd).toHaveBeenLastCalledWith({ provinceCode: '01', wardCode: '01001', label: 'Phú Bình (Hà Nội)' }); // ↓ từ chưa chọn = dòng ĐẦU
  });

  it('rê chuột chỉ để NHÌN: không tô dòng, không đổi thứ Enter sẽ thêm (kẻo con trỏ nằm sẵn trên danh sách làm Enter thêm nhầm)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'phu binh'); // hoà: không dòng nào được tô
    await user.hover(options()[1]);
    expect(highlighted()).toEqual([]);
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();

    await user.keyboard('{ArrowDown}'); // chọn dòng 1 bằng phím
    await user.hover(options()[1]); // chuột rê sang dòng 2
    expect(highlighted()).toEqual(['Phú Bình, Hà Nội']);
    expect(hint()).toHaveTextContent('Enter để thêm «Phú Bình (Hà Nội)».');
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith({ provinceCode: '01', wardCode: '01001', label: 'Phú Bình (Hà Nội)' });
  });

  it('bấm vào một dòng khi đang hoà: thêm đúng dòng được bấm (không phải dòng đầu)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'phu binh');
    await user.click(options()[1]);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(PHU_BINH_TN);
  });

  it('gõ thêm tên tỉnh thì hết mơ hồ: "phu binh thai nguyen" tô sẵn đúng xã và Enter thêm được', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'phu binh thai nguyen{Enter}');
    expect(onAdd).toHaveBeenCalledWith(PHU_BINH_TN);
  });

  it('chọn bằng ↓ rồi gõ thêm: lựa chọn cũ KHÔNG theo sang danh sách mới (quay về mặc định)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'phu');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(highlighted()).toHaveLength(1);
    await user.type(input(), ' binh');
    expect(highlighted()).toEqual([]); // "phu binh" lại hoà ⇒ không tô sẵn
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('«Lào Cai» (xã trùng tên tỉnh): hai dòng (xã trước, cả tỉnh sau), không tô sẵn, nhắc phân biệt loại; «phường Lào Cai» thì chỉ xã và tô sẵn', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'Lào Cai');
    // Hoà thì cái HẸP hơn lên trước: ↓ đầu tiên không được rơi vào «Cả tỉnh».
    expect(options().map((o) => o.getAttribute('aria-label'))).toEqual(['Lào Cai, Lào Cai', 'Cả tỉnh Lào Cai']);
    expect(highlighted()).toEqual([]);
    expect(hint()).toHaveTextContent('Có 2 nơi cùng tên «Lào Cai»');
    expect(hint()).toHaveTextContent('«Cả tỉnh …» là CẢ TỈNH, không riêng phường/xã');
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}');
    expect(hint()).toHaveTextContent('Enter để thêm «Lào Cai (Lào Cai)».');
    await user.clear(input());
    await user.type(input(), 'phường Lào Cai{Enter}');
    expect(onAdd).toHaveBeenCalledWith({ provinceCode: '15', wardCode: '15001', label: 'Lào Cai (Lào Cai)' });
  });

  it('«Thanh Xuân» (có dấu) tô sẵn xã Hà Nội, không phải «Thạnh Xuân» Cần Thơ; không dấu thì hoà', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'Thanh Xuân{Enter}');
    expect(onAdd).toHaveBeenLastCalledWith({ provinceCode: '01', wardCode: '01005', label: 'Thanh Xuân (Hà Nội)' });
    await user.type(input(), 'thanh xuan{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1); // hoà ⇒ Enter không làm gì
    expect(highlighted()).toEqual([]);
  });

  it('«noi bai»: sân bay đứng trước xã, không tô sẵn, Enter không thêm; chọn bằng ↓ thì thêm đúng sân bay', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'noi bai');
    expect(optionNames().slice(0, 2)).toEqual(['Sân bay Nội Bài, Hà Nội · điểm đặc biệt', 'Nội Bài, Hà Nội']);
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onAdd).toHaveBeenCalledWith({ provinceCode: '01', wardCode: 'ZONE:NOIBAI', label: 'Sân bay Nội Bài (điểm đặc biệt)' });
  });
});

describe('WardQuickAdd — dòng được tô luôn khớp với thứ Enter sẽ thêm (không "kẹt" dòng cũ)', () => {
  it('xã nạp xong khi chữ gõ không đổi: dòng tô và Enter theo kết quả MỚI ("lang": «Cả tỉnh Lạng Sơn» → «Láng»)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { rerender } = render(<Harness wards={[]} status="loading" onAdd={onAdd} />);
    await user.type(input(), 'lang');
    // Chưa có xã: chỉ thấy «Cả tỉnh Lạng Sơn» — KHÔNG được tô sẵn, kẻo Enter chọn cả tỉnh trong khi người gõ muốn «Láng».
    expect(optionNames()).toEqual(['Cả tỉnh Lạng Sơn']);
    expect(highlighted()).toEqual([]);
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    rerender(<Harness wards={WARDS} status="ready" onAdd={onAdd} />);
    expect(highlighted()).toEqual(['Láng, Hà Nội']);
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith({ provinceCode: '01', wardCode: '01004', label: 'Láng (Hà Nội)' });
  });

  it('xã nạp xong làm kết quả thành hoà: Enter không thêm gì', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { rerender } = render(<Harness wards={[]} status="loading" onAdd={onAdd} />);
    await user.type(input(), 'noi bai');
    expect(highlighted()).toEqual([]); // đang nạp ⇒ chưa tự chọn
    rerender(<Harness wards={WARDS} status="ready" onAdd={onAdd} />);
    expect(highlighted()).toEqual([]); // nay có cả xã «Nội Bài» và sân bay ⇒ hoà
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('lựa chọn bằng ↓ cũng mất khi danh sách đổi do nạp xong (không giữ dòng của danh sách cũ)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness wards={[]} status="loading" />);
    await user.type(input(), 'noi');
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toHaveLength(1);
    rerender(<Harness wards={WARDS} status="ready" />);
    expect(highlighted()).toEqual([]);
  });
});

describe('WardQuickAdd — dữ liệu tìm kiếm chưa tải đủ thì KHÔNG tự chọn bằng Enter', () => {
  it('đang nạp xã: chỉ có một kết quả khớp mạnh vẫn không được tô; nói rõ lý do; Enter không thêm', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onSubmit = vi.fn();
    render(<Harness wards={[]} status="loading" onAdd={onAdd} onSubmit={onSubmit} />);
    await user.type(input(), 'thai nguyen');
    expect(optionNames()).toEqual(['Cả tỉnh Thái Nguyên']);
    expect(highlighted()).toEqual([]);
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(hint()).toHaveTextContent('Dữ liệu tìm kiếm chưa tải đủ nên Enter chưa tự chọn');
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('chưa tải đủ mà người dùng CHỦ ĐỘNG chọn (↓ rồi Enter, hoặc bấm) thì vẫn thêm được', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness wards={[]} status="loading" onAdd={onAdd} />);
    await user.type(input(), 'thai nguyen');
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toEqual(['Cả tỉnh Thái Nguyên']);
    expect(hint()).toHaveTextContent('Enter để thêm «Cả tỉnh Thái Nguyên».');
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledWith({ provinceCode: '19', label: 'Cả tỉnh Thái Nguyên' });
    await user.type(input(), 'lao cai');
    await user.click(screen.getByRole('option', { name: /Cả tỉnh Lào Cai/ }));
    expect(onAdd).toHaveBeenLastCalledWith({ provinceCode: '15', label: 'Cả tỉnh Lào Cai' });
  });

  it('điểm đặc biệt đang nạp: kết quả khớp mạnh duy nhất vẫn không được tô sẵn (sân bay cùng tên có thể chưa về); về xong thì tô', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { rerender } = render(<Harness zonesStatus="loading" onAdd={onAdd} />);
    await user.type(input(), 'dai tu');
    expect(optionNames()).toEqual(['Đại Từ, Thái Nguyên']);
    expect(highlighted()).toEqual([]);
    expect(hint()).toHaveTextContent('Đang tải điểm đặc biệt');
    expect(hint()).toHaveTextContent('Dữ liệu tìm kiếm chưa tải đủ nên Enter chưa tự chọn');
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    rerender(<Harness zonesStatus="ready" onAdd={onAdd} />);
    expect(highlighted()).toEqual(['Đại Từ, Thái Nguyên']);
    expect(hint()).not.toHaveTextContent('Đang tải điểm đặc biệt');
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledWith(DAI_TU);
  });

  it('lỗi tải điểm đặc biệt: báo rõ, không tự chọn bằng Enter, vẫn chọn được bằng tay', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness zonesStatus="error" onAdd={onAdd} />);
    await user.type(input(), 'dai tu'); // một kết quả khớp mạnh duy nhất…
    expect(screen.getByTestId('quick-add-zones-error-Điểm trả')).toHaveTextContent('Không tải được điểm đặc biệt');
    expect(highlighted()).toEqual([]); // …nhưng thiếu sân bay trong chỉ mục ⇒ không tự chọn
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    await user.click(screen.getByRole('option', { name: /Đại Từ/ }));
    expect(onAdd).toHaveBeenCalledWith(DAI_TU);
  });

  it('chưa gõ gì thì không hiện thông báo tải/lỗi điểm đặc biệt (không làm ồn ô trống)', () => {
    render(<Harness zonesStatus="error" />);
    expect(screen.queryByTestId('quick-add-zones-error-Điểm trả')).not.toBeInTheDocument();
    expect(hint()).toBeEmptyDOMElement();
  });

  it('không có chỗ nào dùng role=alert (thông báo đọc xen ngang mỗi lần gõ phím)', async () => {
    const user = userEvent.setup();
    render(<Harness wards={[]} status="error" error="Mất kết nối" zonesStatus="error" />);
    await user.type(input(), 'noi bai');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('WardQuickAdd — bàn phím và nút ×', () => {
  it('Tab tới nút × rồi Enter: XOÁ ô, tuyệt đối không thêm dòng đang tô', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'dai tu');
    expect(highlighted()).toHaveLength(1);
    await user.tab();
    expect(clearBtn()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
    expect(input()).toHaveValue('');
    expect(input()).toHaveFocus();
  });

  it('Esc trong ô hoặc trên nút ×: xoá chữ và trả focus về ô; ô trống thì Esc không làm gì', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'dai{Escape}');
    expect(input()).toHaveValue('');
    expect(input()).toHaveFocus();

    await user.type(input(), 'dai');
    await user.tab();
    expect(clearBtn()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(input()).toHaveValue('');
    expect(input()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(input()).toHaveValue('');
  });

  it('Home/End KHÔNG bị chặn (con trỏ vẫn về đầu/cuối ô để sửa chữ)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'phu');
    for (const key of ['Home', 'End', 'ArrowLeft']) {
      const ev = createEvent.keyDown(input(), { key });
      fireEvent(input(), ev);
      expect(ev.defaultPrevented).toBe(false);
    }
  });

  it('đang gõ dấu bằng bộ gõ (IME, isComposing): Enter/↓ thuộc bộ gõ, không thêm và không chọn', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    await user.type(input(), 'dai tu');
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input(), { key: 'ArrowDown', isComposing: true });
    expect(onAdd).not.toHaveBeenCalled();
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
});

describe('isQuickAddEscape — để hộp thoại cha biết khi nào Esc chỉ nên xoá chữ', () => {
  it('đúng khi Esc ở BẤT KỲ phần tử nào trong vùng «Tìm nhanh» (ô, ×, danh sách) mà ô ĐANG CÓ CHỮ; sai ở chỗ khác', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <input aria-label="ô khác" defaultValue="có chữ" />
      </>,
    );
    const at = (target: EventTarget | null) => ({ target });
    expect(isQuickAddEscape(at(input()))).toBe(false); // ô trống ⇒ Esc đóng hộp thoại như thường
    await user.type(input(), 'phu binh');
    expect(isQuickAddEscape(at(input()))).toBe(true);
    expect(isQuickAddEscape(at(clearBtn()))).toBe(true);
    expect(isQuickAddEscape(at(listbox()))).toBe(true);
    expect(isQuickAddEscape(at(options()[0]))).toBe(true);
    expect(isQuickAddEscape(at(screen.getByLabelText('ô khác')))).toBe(false);
    expect(isQuickAddEscape(at(document.body))).toBe(false);
    expect(isQuickAddEscape(at(null))).toBe(false);
  });
});

describe('WardQuickAdd — báo lên cha khi gõ dở mà chưa chọn', () => {
  it('rỗng → null; có chữ → câu cố định (không lặp chữ đã gõ); chọn xong hoặc xoá → null lại', async () => {
    const user = userEvent.setup();
    const onPending = vi.fn();
    render(<Harness onPending={onPending} />);
    expect(onPending).toHaveBeenLastCalledWith(null);
    const msg = 'đang gõ ở ô «Tìm nhanh» mà chưa chọn kết quả nào';

    await user.type(input(), 'dai');
    expect(onPending).toHaveBeenLastCalledWith(msg);
    await user.type(input(), ' tu{Enter}');
    expect(onPending).toHaveBeenLastCalledWith(null);

    await user.type(input(), 'phu');
    expect(onPending).toHaveBeenLastCalledWith(msg);
    await user.click(clearBtn());
    expect(onPending).toHaveBeenLastCalledWith(null);
  });

  it('mới 1 ký tự (chưa đủ để tìm) vẫn tính là đang chờ; toàn khoảng trắng thì không', async () => {
    const user = userEvent.setup();
    const onPending = vi.fn();
    render(<Harness onPending={onPending} />);
    await user.type(input(), '   ');
    expect(onPending).toHaveBeenLastCalledWith(null);
    await user.clear(input());
    await user.type(input(), 'd');
    expect(onPending).toHaveBeenLastCalledWith('đang gõ ở ô «Tìm nhanh» mà chưa chọn kết quả nào');
  });

  it('gõ dở rồi chọn bằng bấm chuột cũng gỡ trạng thái chờ', async () => {
    const user = userEvent.setup();
    const onPending = vi.fn();
    render(<Harness onPending={onPending} />);
    await user.type(input(), 'dai');
    await user.click(screen.getByRole('option', { name: /Đại Từ/ }));
    expect(onPending).toHaveBeenLastCalledWith(null);
  });
});

describe('WardQuickAdd — gợi ý theo trạng thái', () => {
  it('mới gõ 1 ký tự: nhắc gõ ít nhất 2 ký tự (không nói "gõ thêm 2")', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'd');
    expect(hint()).toHaveTextContent('Gõ ít nhất 2 ký tự để tìm.');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('danh sách đã nạp mà không có gì khớp: nói rõ và chỉ hướng khác', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'zzzz');
    expect(hint()).toHaveTextContent('Không có kết quả cho «zzzz»');
    expect(hint()).toHaveTextContent('chọn theo tỉnh ở dưới');
  });

  it('gõ «huyện/quận/thị xã/thành phố …» (đơn vị cũ): chỉ sang ô «Theo tỉnh cũ / huyện cũ»', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), 'huyện Sóc Sơn');
    expect(hint()).toHaveTextContent('Dùng «Theo tỉnh cũ / huyện cũ» ở dưới');
    await user.clear(input());
    await user.type(input(), 'thành phố Sóc Sơn');
    expect(hint()).toHaveTextContent('Dùng «Theo tỉnh cũ / huyện cũ» ở dưới');
    await user.clear(input());
    await user.type(input(), 'tp soc son');
    expect(hint()).toHaveTextContent('Dùng «Theo tỉnh cũ / huyện cũ» ở dưới');
  });

  it('đang nạp xã hay đang lỗi: KHÔNG báo «không có kết quả»/chỉ sang đơn vị cũ (kết quả chưa đáng tin)', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness wards={[]} status="loading" />);
    await user.type(input(), 'huyện Sóc Sơn');
    expect(hint()).not.toHaveTextContent('Không có kết quả');
    rerender(<Harness wards={[]} status="error" error="x" />);
    expect(hint()).not.toHaveTextContent('Không có kết quả');
  });

  it('đang nạp xã: KHÔNG báo "không có kết quả" (sai), chỉ báo đang tải; tỉnh vẫn tìm được', async () => {
    const user = userEvent.setup();
    render(<Harness wards={[]} status="loading" />);
    await user.type(input(), 'dai tu');
    expect(hint()).toHaveTextContent('Đang tải danh sách phường/xã');
    expect(hint()).not.toHaveTextContent('Không có kết quả');

    await user.clear(input());
    await user.type(input(), 'thai nguyen');
    expect(screen.getByRole('option', { name: /Cả tỉnh Thái Nguyên/ })).toBeInTheDocument();
    expect(hint()).toHaveTextContent('Đang tải danh sách phường/xã');
  });

  it('nạp xã lỗi: MỘT khối báo lỗi cố định kèm lý do (không bật lại theo từng phím), vẫn tìm được tỉnh/điểm đặc biệt', async () => {
    const user = userEvent.setup();
    render(<Harness wards={[]} status="error" error="Mất kết nối" />);
    const box = screen.getByTestId('quick-add-wards-error-Điểm trả');
    expect(box).toHaveTextContent('Không tải được danh sách phường/xã (Mất kết nối)');
    expect(box).toHaveTextContent('Enter không tự chọn');
    await user.type(input(), 'noi bai');
    expect(screen.getByRole('option', { name: /Sân bay Nội Bài/ })).toBeInTheDocument();
    expect(screen.getByTestId('quick-add-wards-error-Điểm trả')).toBe(box); // cùng một phần tử: không bị dựng lại mỗi lần gõ
    expect(hint()).not.toHaveTextContent('Không có kết quả');
    expect(hint()).not.toHaveTextContent('Không tải được danh sách phường/xã'); // chỉ MỘT nơi báo lỗi này
  });

  it('nạp xã lỗi có nút «Thử tải lại»: bấm thì gọi cha nạp lại và trả focus về ô tìm', async () => {
    const user = userEvent.setup();
    const onNeed = vi.fn();
    const { rerender } = render(<Harness wards={[]} status="error" error="Mất kết nối" onNeed={onNeed} />);
    expect(onNeed).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Thử tải lại' }));
    expect(onNeed).toHaveBeenCalled();
    expect(input()).toHaveFocus();
    // Nạp lại thành công: khối lỗi và nút biến mất.
    rerender(<Harness wards={WARDS} status="ready" onNeed={onNeed} />);
    expect(screen.queryByTestId('quick-add-wards-error-Điểm trả')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử tải lại' })).not.toBeInTheDocument();
  });

  it('«Thử tải lại» gọi nạp NGAY cả khi ô tìm đang có focus sẵn (Safari không chuyển focus sang nút khi bấm ⇒ không có sự kiện focus nào để nạp lại)', async () => {
    const user = userEvent.setup();
    const onNeed = vi.fn();
    render(<Harness wards={[]} status="error" error="Mất kết nối" onNeed={onNeed} />);
    await user.click(input()); // focus ô tìm ⇒ onFocus ⇒ một lần gọi
    onNeed.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại' })); // chỉ click, KHÔNG đổi focus
    expect(input()).toHaveFocus();
    expect(onNeed).toHaveBeenCalledTimes(1);
  });

  it('không có lý do lỗi thì không in ngoặc rỗng', () => {
    render(<Harness wards={[]} status="error" error={null} />);
    expect(screen.getByTestId('quick-add-wards-error-Điểm trả')).toHaveTextContent(/^Không tải được danh sách phường\/xã — chỉ tìm được/);
  });

  it('quá nhiều kết quả: chỉ hiện 30 dòng và báo còn bao nhiêu; không tô sẵn dòng nào', async () => {
    const user = userEvent.setup();
    const many: WardOption[] = Array.from({ length: 100 }, (_, i) => ({ code: `9${String(i).padStart(4, '0')}`, name: `Phường ${i}`, provinceCode: '01' }));
    render(<Harness wards={many} />);
    await user.type(input(), 'phuong');
    expect(options()).toHaveLength(30);
    expect(hint()).toHaveTextContent('Còn 70 kết quả nữa — gõ thêm để thu hẹp.');
    expect(hint()).toHaveTextContent('Chưa chắc là dòng nào');
    expect(highlighted()).toEqual([]);
  });
});

describe('WardQuickAdd trong Dialog (nơi Combobox kiểu Popover từng mất focus)', () => {
  it('gõ được, thấy kết quả và chọn được ngay trong Dialog', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Thêm quy tắc</DialogTitle>
          <DialogDescription>mô tả</DialogDescription>
          <Harness onAdd={onAdd} />
        </DialogContent>
      </Dialog>,
    );
    await user.click(input());
    await user.keyboard('dai tu');
    expect(input()).toHaveValue('dai tu');
    expect(input()).toHaveFocus();
    await user.click(screen.getByRole('option', { name: /Đại Từ/ }));
    expect(onAdd).toHaveBeenCalledWith(DAI_TU);
  });
});
