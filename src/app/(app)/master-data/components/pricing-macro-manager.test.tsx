import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MacroMatchCombo, MacroMatchRankingRow, MacroMatchResponse } from '@/lib/api';
import { buildApiError } from '@/lib/api-error';
import type { PricingMacroRule, ProvinceOption, SpecialZone, WardOption } from '@/lib/types';

// `toast` PHẢI là cùng một hàm qua mọi lần render: loadData() phụ thuộc vào nó, nếu mỗi lần một hàm mới
// thì effect nạp dữ liệu chạy lại vô hạn.
const toastMock = vi.fn();
const getRules = vi.fn();
const searchRules = vi.fn();
const matchRules = vi.fn();
const getProvinces = vi.fn();
const getWards = vi.fn();
const getZones = vi.fn();
const createRule = vi.fn();
const updateRule = vi.fn();
const deleteRule = vi.fn();
const bulkDelete = vi.fn();
const bandWarnings = vi.fn();

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/lib/api', async (importOriginal) => {
  // Phân loại lỗi «máy chủ chưa có route mới» dùng bản THẬT: test máy chủ cũ phải đi đúng đường của trang.
  const actual = await importOriginal<typeof import('@/lib/api')>();
  // Mock trả mảng cho gọn; bọc lại thành trang { items, total, page, limit } như backend.
  const asPage = (r: unknown) => (Array.isArray(r) ? { items: r, total: r.length, page: 1, limit: 50 } : r);
  return {
    isMacroSearchUnsupported: actual.isMacroSearchUnsupported,
    getPricingMacroRulesPage: async (...a: unknown[]) => asPage(await getRules(...a)),
    searchPricingMacroRules: async (...a: unknown[]) => asPage(await searchRules(...a)),
    matchPricingMacroRules: (...a: unknown[]) => matchRules(...a),
    getPricingMacroProvinces: (...a: unknown[]) => getProvinces(...a),
    getPricingMacroWards: (...a: unknown[]) => getWards(...a),
    getSpecialZones: (...a: unknown[]) => getZones(...a),
    createPricingMacroRule: (...a: unknown[]) => createRule(...a),
    updatePricingMacroRule: (...a: unknown[]) => updateRule(...a),
    deletePricingMacroRule: (...a: unknown[]) => deleteRule(...a),
    bulkDeletePricingMacroRules: (...a: unknown[]) => bulkDelete(...a),
    getPricingMacroBandWarnings: (...a: unknown[]) => bandWarnings(...a),
  };
});

// Select của Radix (ô Dịch vụ / Loại xe / Trạng thái) cần mấy API con trỏ mà jsdom không có (như macro-search-bar.test.tsx).
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!window.PointerEvent) (window as any).PointerEvent = MouseEvent;
});
// Hộp thoại tạo hàng loạt có test riêng (macro-bulk-dialog.test.tsx). Ở đây chỉ kiểm manager mở nó đúng
// lúc và nạp lại danh sách khi nó báo xong.
vi.mock('./macro-bulk-dialog', () => ({
  MacroBulkDialog: ({ open, onDone }: { open: boolean; onDone: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Tạo hàng loạt (giả)">
        <button type="button" onClick={onDone}>
          giả-lập-xong
        </button>
      </div>
    ) : null,
}));

// Combobox = Popover(modal) + cmdk. Bật nó BÊN TRONG Dialog của Radix thì jsdom đệ quy vô hạn
// ("Maximum call stack size exceeded" — hai FocusScope tranh nhau; trình duyệt thật không bị), cùng lý do với
// MultiSelectComboBox ở macro-bulk-dialog.test.tsx. Ở đây thay bằng <select> thô: test này kiểm cách form nối
// ô chọn với dữ liệu (mã, mục "tất cả", khoá/mở). Việc lọc gõ không dấu của Combobox thật có test riêng ở
// src/components/ui/combobox.test.tsx. Nút "bấm lại" mô phỏng đúng hợp đồng thật: bấm lại mục đang chọn → undefined.
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({
    id,
    ariaLabel,
    options,
    selectedValue,
    onSelect,
    placeholder,
    disabled,
  }: {
    id?: string;
    ariaLabel?: string;
    options: { value: string; label: string }[];
    selectedValue?: string;
    onSelect: (v: string | undefined) => void;
    placeholder: string;
    disabled?: boolean;
  }) => (
    <span>
      <select
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        value={selectedValue ?? ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        {selectedValue === undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="button" aria-label={`bấm lại ${id ?? ariaLabel}`} onClick={() => onSelect(undefined)} />
    </span>
  ),
}));

import { PricingMacroManager } from './pricing-macro-manager';

const PROVINCES = [
  { code: '01', name: 'Hà Nội' },
  { code: '33', name: 'Hưng Yên' },
];

function rule(over: Partial<PricingMacroRule> & { id: number }): PricingMacroRule {
  return {
    name: `Quy tắc ${over.id}`,
    isActive: true,
    priority: 0,
    serviceType: 'ALL',
    vehicleType: 'ALL',
    originProvinceCode: '01',
    originWardCode: null,
    destProvinceCode: '33',
    destWardCode: null,
    adjustmentType: 'DELTA_AMOUNT',
    adjustmentValue: 30000,
    applyPerSeat: true,
    note: null,
    ...over,
  };
}

const ONE_WAY = rule({ id: 1, name: 'Một chiều HN-HY' });
const TWO_WAY = rule({ id: 2, name: 'Hai chiều HN-HY', isBidirectional: true });
const CANONICAL = rule({
  id: 3,
  name: 'Tạo từ API',
  serviceType: 'RIDE',
  vehicleType: 'CAR_4',
  isBidirectional: true,
});

// Luật không còn tên trên giao diện: tên ở fixture chỉ để test gọi tắt; dòng được tìm theo id.
const NAME_ID: Record<string, number> = { 'Một chiều HN-HY': 1, 'Hai chiều HN-HY': 2, 'Tạo từ API': 3, 'Sàn cũ': 20, 'Giao hàng': 7, 'Luật toàn quốc': 50, 'Có xã': 40 };

async function setup(rules: PricingMacroRule[] = [ONE_WAY, TWO_WAY, CANONICAL]) {
  getRules.mockResolvedValue(rules);
  render(<PricingMacroManager />);
  // Chờ nạp xong: dòng đầu xuất hiện.
  if (rules.length) await screen.findByTestId(`rule-row-${rules[0].id}`);
  return { user: userEvent.setup() };
}

function rowOf(name: string): HTMLElement {
  return screen.getByTestId(`rule-row-${NAME_ID[name]}`);
}

const pageOf = (items: PricingMacroRule[], total: number, page = 1, limit = 50) => ({ items, total, page, limit });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const qBox = () => screen.getByRole('textbox', { name: 'Ghi chú hoặc mã quy tắc' });
const ruleRows = () => screen.queryAllByTestId(/^rule-row-/);
/**
 * Đợi KẾT QUẢ của lượt nạp mới: các dòng `shown` có mặt VÀ các dòng `gone` đã biến mất. Chỉ đợi «dòng cũ biến mất» là
 * chưa đủ — lúc đang tải bảng chỉ có vòng xoay nên điều kiện đó đúng cả TRƯỚC khi kết quả về.
 */
const waitForResult = ({ shown, gone = [] }: { shown: number[]; gone?: number[] }) =>
  waitFor(() => {
    for (const id of gone) expect(screen.queryByTestId(`rule-row-${id}`)).not.toBeInTheDocument();
    for (const id of shown) expect(screen.getByTestId(`rule-row-${id}`)).toBeInTheDocument();
  });

describe('PricingMacroManager — danh sách', () => {
  beforeEach(() => {
    toastMock.mockReset();
    getRules.mockReset();
    searchRules.mockReset();
    matchRules.mockReset();
    getProvinces.mockReset().mockResolvedValue(PROVINCES);
    getWards.mockReset().mockResolvedValue([]);
    createRule.mockReset();
    updateRule.mockReset();
    deleteRule.mockReset();
    bulkDelete.mockReset();
    bandWarnings.mockReset().mockResolvedValue({ band: {}, warnings: [] });
  });

  it('chỉ luật hai chiều mới có nhãn "2 chiều"; dịch vụ/xe dạng chuẩn hiển thị tiếng Việt', async () => {
    await setup();
    expect(within(rowOf('Một chiều HN-HY')).queryByText('2 chiều')).not.toBeInTheDocument();
    expect(within(rowOf('Hai chiều HN-HY')).getByText('2 chiều')).toBeInTheDocument();

    expect(within(rowOf('Một chiều HN-HY')).getByText('+30.000 đ/ghế')).toBeInTheDocument();

    const canon = within(rowOf('Tạo từ API'));
    expect(canon.getByText('Bao xe')).toBeInTheDocument(); // RIDE
    expect(canon.getByText('Xe 4 chỗ')).toBeInTheDocument(); // CAR_4
    expect(canon.getByText('+30.000 đ')).toBeInTheDocument(); // Bao xe không hiện /ghế
    expect(canon.queryByText('RIDE')).not.toBeInTheDocument();
  });

  it('chưa chọn dòng nào thì không có nút xoá hàng loạt; chọn 2 dòng thì hiện "Xoá đã chọn (2)"', async () => {
    const { user } = await setup();
    expect(screen.queryByRole('button', { name: /Xoá đã chọn/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #3\b/ }));
    expect(screen.getByRole('button', { name: 'Xoá đã chọn (2)' })).toBeInTheDocument();

    // bỏ chọn một dòng → giảm còn 1
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/ }));
    expect(screen.getByRole('button', { name: 'Xoá đã chọn (1)' })).toBeInTheDocument();
  });

  it('không còn 3 ô tìm cũ lẫn ô AI; lọc bằng thanh «Tìm quy tắc» gọi server; "chọn tất cả" chỉ chọn dòng của trang đang xem', async () => {
    const { user } = await setup();
    expect(screen.queryByLabelText('Tìm điểm đón')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tìm điểm đi')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tìm ghi chú')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tìm kiếm thông minh bằng AI')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tìm với AI' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Gemini/)).not.toBeInTheDocument();

    searchRules.mockResolvedValue(pageOf([TWO_WAY], 1));
    await user.type(qBox(), 'hưng yên');
    await waitFor(() => expect(searchRules).toHaveBeenCalledWith({ q: 'hưng yên', page: 1, limit: 50 }));
    await waitForResult({ shown: [2], gone: [1] });

    await user.click(screen.getByRole('checkbox', { name: 'Chọn tất cả quy tắc ở trang này' }));
    expect(screen.getByRole('button', { name: 'Xoá đã chọn (1)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xoá đã chọn (1)' }));
    await user.click(await screen.findByRole('button', { name: 'Xoá 1 quy tắc' }));
    await waitFor(() => expect(bulkDelete).toHaveBeenCalledTimes(1));
    expect(bulkDelete).toHaveBeenCalledWith([2]); // chỉ dòng đang hiện, không phải cả 3
  });

  it('hộp xác nhận xoá liệt kê "Đón → Trả" từng quy tắc đã chọn xuyên trang và báo dòng không ở trang đang xem (vẫn bị xoá)', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #2\b/ }));

    // sang kết quả tìm khác: hai dòng đã chọn không còn ở trang đang xem, chọn thêm dòng đang hiện
    searchRules.mockResolvedValue(pageOf([CANONICAL], 1));
    await user.type(qBox(), 'api');
    await waitForResult({ shown: [3], gone: [1, 2] });
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #3\b/ }));
    expect(screen.getByRole('button', { name: 'Xoá đã chọn (3)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xoá đã chọn (3)' }));
    const list = await screen.findByTestId('bulk-delete-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(list).toHaveTextContent('Hà Nội → Hưng Yên'); // một chiều (#1)
    expect(list).toHaveTextContent('Hà Nội ↔ Hưng Yên'); // hai chiều (#2, #3)
    expect(within(list).getByRole('alert')).toHaveTextContent('2 quy tắc không nằm ở trang đang xem');
  });

  it('xoá hàng loạt: xác nhận → gọi API đúng id, báo kết quả, nạp lại và bỏ vùng chọn', async () => {
    const { user } = await setup();
    bulkDelete.mockResolvedValue({ deleted: [1, 3], missing: [] });

    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #3\b/ }));
    await user.click(screen.getByRole('button', { name: 'Xoá đã chọn (2)' }));

    // hộp xác nhận: chưa gọi API cho tới khi bấm xác nhận
    expect(bulkDelete).not.toHaveBeenCalled();
    getRules.mockResolvedValue([TWO_WAY]); // sau khi xoá, danh sách còn 1 dòng
    await user.click(await screen.findByRole('button', { name: 'Xoá 2 quy tắc' }));

    await waitFor(() => expect(bulkDelete).toHaveBeenCalledTimes(1));
    expect(bulkDelete.mock.calls[0][0].slice().sort()).toEqual([1, 3]);
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Đã xoá 2 quy tắc' })),
    );
    await waitFor(() => expect(screen.queryByTestId('rule-row-1')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Xoá đã chọn/ })).not.toBeInTheDocument();
    expect(getRules).toHaveBeenCalledTimes(2); // lần nạp đầu + nạp lại
  });

  it('sửa giá hàng loạt: đặt cùng kiểu + giá trị cho mọi dòng đã chọn, báo kết quả, nạp lại và bỏ vùng chọn', async () => {
    const { user } = await setup();
    updateRule.mockResolvedValue({});
    expect(screen.queryByRole('button', { name: /Sửa giá đã chọn/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #3\b/ }));
    await user.click(screen.getByRole('button', { name: 'Sửa giá đã chọn (2)' }));

    const apply = await screen.findByRole('button', { name: 'Áp dụng cho 2 quy tắc' });
    expect(apply).toBeDisabled(); // chưa nhập giá trị
    await user.type(screen.getByLabelText('Giá trị chung'), '50000');
    expect(updateRule).not.toHaveBeenCalled();
    await user.click(apply);

    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(2));
    expect(updateRule).toHaveBeenCalledWith(1, { adjustmentType: 'DELTA_AMOUNT', adjustmentValue: 50000 });
    expect(updateRule).toHaveBeenCalledWith(3, { adjustmentType: 'DELTA_AMOUNT', adjustmentValue: 50000 });
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Đã sửa 2 quy tắc' })),
    );
    await waitFor(() => expect(screen.queryByRole('button', { name: /Sửa giá đã chọn/ })).not.toBeInTheDocument());
    expect(getRules).toHaveBeenCalledTimes(2);
  });

  it('sửa giá hàng loạt: giá trị ngoài biên bị chặn ngay trong hộp thoại', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/ }));
    await user.click(screen.getByRole('button', { name: 'Sửa giá đã chọn (1)' }));
    await user.type(await screen.findByLabelText('Giá trị chung'), '1.5'); // tiền cộng/trừ phải nguyên đồng
    expect(await screen.findByRole('alert')).toHaveTextContent('số nguyên');
    expect(screen.getByRole('button', { name: 'Áp dụng cho 1 quy tắc' })).toBeDisabled();
  });

  it('sửa giá hàng loạt: một luật lỗi → báo X/N, giữ lại dòng lỗi được chọn để thử lại, hộp thoại vẫn mở', async () => {
    const { user } = await setup();
    updateRule.mockImplementation(async (id: number) => {
      if (id === 3) throw new Error('Giá vượt biên');
      return {};
    });
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #3\b/ }));
    await user.click(screen.getByRole('button', { name: 'Sửa giá đã chọn (2)' }));
    await user.type(await screen.findByLabelText('Giá trị chung'), '10000');
    await user.click(screen.getByRole('button', { name: 'Áp dụng cho 2 quy tắc' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Đã sửa 1/2 quy tắc', variant: 'destructive' }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Áp dụng cho 1 quy tắc' })).toBeInTheDocument();
    // checkbox nằm sau lớp modal (aria-hidden) nên phải tìm với hidden: true
    expect(screen.getByRole('checkbox', { name: /^Chọn quy tắc #3\b/, hidden: true })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/, hidden: true })).not.toBeChecked();
  });

  it('sửa giá hàng loạt: xem trước cũ → mới, cảnh báo trộn theo ghế/theo chuyến và luật sàn/trần', async () => {
    const carpool = rule({ id: 1, name: 'Ghép A', serviceType: 'CARPOOL' });
    const wholeCar = rule({ id: 2, name: 'Bao B', serviceType: 'CONVENIENT' });
    const legacy = rule({ id: 3, name: 'Sàn C', serviceType: 'CONVENIENT', adjustmentType: 'MIN_FLOOR' });
    const { user } = await setup([carpool, wholeCar, legacy]);
    await user.click(screen.getByRole('checkbox', { name: 'Chọn tất cả quy tắc ở trang này' }));
    await user.click(screen.getByRole('button', { name: 'Sửa giá đã chọn (3)' }));
    await user.type(await screen.findByLabelText('Giá trị chung'), '50000');

    const list = screen.getByTestId('bulk-edit-list');
    expect(list).toHaveTextContent('+30.000 đ/ghế → +50.000 đ/ghế'); // Ghép A
    expect(list).toHaveTextContent('+30.000 đ → +50.000 đ'); // Bao B (theo chuyến)
    expect(list).toHaveTextContent('Sàn: 30.000 đ → +50.000 đ');
    expect(list).toHaveTextContent('trộn 1 quy tắc tính THEO GHẾ');
    expect(list).toHaveTextContent('1 quy tắc đang là kiểu sàn/trần');
    expect(within(list).queryByText(/không nằm ở trang đang xem/)).not.toBeInTheDocument();
  });

  it('danh sách trong hộp xác nhận rút gọn sau 8 tên, ghi số còn lại; không có cảnh báo ẩn khi mọi dòng đang hiện', async () => {
    const many = Array.from({ length: 12 }, (_, i) => rule({ id: i + 1, name: `Luật ${i + 1}` }));
    const { user } = await setup(many);
    await user.click(screen.getByRole('checkbox', { name: 'Chọn tất cả quy tắc ở trang này' }));
    await user.click(screen.getByRole('button', { name: 'Xoá đã chọn (12)' }));
    const list = await screen.findByTestId('bulk-delete-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(8);
    expect(list).toHaveTextContent('… và 4 quy tắc khác.');
    expect(within(list).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('xoá hàng loạt: báo cả số quy tắc "không còn tồn tại" (đã bị người khác xoá)', async () => {
    const { user } = await setup();
    bulkDelete.mockResolvedValue({ deleted: [1], missing: [3] });
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #3\b/ }));
    await user.click(screen.getByRole('button', { name: 'Xoá đã chọn (2)' }));
    await user.click(await screen.findByRole('button', { name: 'Xoá 2 quy tắc' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Đã xoá 1 quy tắc', description: '1 quy tắc không còn tồn tại.' }),
      ),
    );
  });

  it('xoá hàng loạt lỗi: báo lỗi đỏ và GIỮ vùng chọn để bấm thử lại', async () => {
    const { user } = await setup();
    bulkDelete.mockRejectedValue(new Error('Mất kết nối'));
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/ }));
    await user.click(screen.getByRole('button', { name: 'Xoá đã chọn (1)' }));
    await user.click(await screen.findByRole('button', { name: 'Xoá 1 quy tắc' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Lỗi xoá hàng loạt', variant: 'destructive' }),
      ),
    );
    // dòng vẫn còn trong danh sách (nạp lại trả cùng dữ liệu) nên vẫn đang được chọn
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xoá đã chọn (1)' })).toBeInTheDocument());
  });

  it('chọn hơn 500 quy tắc: gọi API theo từng lô ≤ 500 (backend từ chối > 500 id)', async () => {
    const many = Array.from({ length: 501 }, (_, i) => rule({ id: i + 1, name: `R${i + 1}` }));
    const { user } = await setup(many);
    bulkDelete.mockImplementation(async (ids: number[]) => ({ deleted: ids, missing: [] }));

    await user.click(screen.getByRole('checkbox', { name: 'Chọn tất cả quy tắc ở trang này' }));
    await user.click(screen.getByRole('button', { name: 'Xoá đã chọn (501)' }));
    await user.click(await screen.findByRole('button', { name: 'Xoá 501 quy tắc' }));

    await waitFor(() => expect(bulkDelete).toHaveBeenCalledTimes(2), { timeout: 10_000 });
    const sizes = bulkDelete.mock.calls.map((c) => c[0].length).sort((a, b) => b - a);
    expect(sizes).toEqual([500, 1]);
    const all = bulkDelete.mock.calls.flatMap((c) => c[0] as number[]);
    expect(new Set(all).size).toBe(501); // không mất, không trùng
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Đã xoá 501 quy tắc' })),
    );
  }, 60_000);

  it('bật/tắt nhanh chỉ gửi {isActive} (cập nhật nhẹ, không kích hoạt kiểm tra lại giá trị cũ)', async () => {
    const { user } = await setup();
    updateRule.mockResolvedValue({ ...ONE_WAY, isActive: false });
    await user.click(within(rowOf('Một chiều HN-HY')).getByRole('button', { name: 'Bật' }));
    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    expect(updateRule).toHaveBeenCalledWith(1, { isActive: false });
  });

  it('"Thêm quy tắc" mở hộp thoại nhiều xã; không còn nút "Tạo hàng loạt"; hộp thoại báo xong thì nạp lại danh sách', async () => {
    const { user } = await setup();
    expect(screen.queryByRole('button', { name: /Tạo hàng loạt/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Tạo hàng loạt/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Thêm quy tắc/ }));
    const dlg = await screen.findByRole('dialog', { name: /Tạo hàng loạt/ });
    expect(getRules).toHaveBeenCalledTimes(1);
    await user.click(within(dlg).getByRole('button', { name: 'giả-lập-xong' }));
    await waitFor(() => expect(getRules).toHaveBeenCalledTimes(2));
  });
});

describe('PricingMacroManager — tạo/sửa một quy tắc', () => {
  beforeEach(() => {
    toastMock.mockReset();
    getRules.mockReset();
    getProvinces.mockReset().mockResolvedValue(PROVINCES);
    getWards.mockReset().mockResolvedValue([]);
    createRule.mockReset();
    updateRule.mockReset();
    deleteRule.mockReset();
    bulkDelete.mockReset();
    searchRules.mockReset();
    matchRules.mockReset();
    bandWarnings.mockReset().mockResolvedValue({ band: {}, warnings: [] });
  });

  // Tạo mới đi qua hộp thoại nhiều xã (macro-bulk-dialog.test.tsx); form một luật chỉ còn để SỬA.
  async function openCreate(user: ReturnType<typeof userEvent.setup>, _label: string, target = 'Một chiều HN-HY') {
    await user.click(screen.getByRole('button', { name: new RegExp(`^Sửa quy tắc #${NAME_ID[target]}\\b`) }));
    const dlg = await screen.findByRole('dialog', { name: /Chỉnh sửa quy tắc macro/ });
    return dlg;
  }

  it('bỏ tích "cả chiều ngược" → gửi isBidirectional=false (luật một chiều có chủ ý)', async () => {
    const { user } = await setup([ONE_WAY, TWO_WAY]);
    updateRule.mockResolvedValue({ ...ONE_WAY, id: 11, isBidirectional: false });
    const dlg = await openCreate(user, 'Luật một chiều', 'Hai chiều HN-HY');
    await user.click(within(dlg).getByRole('checkbox', { name: /Áp dụng cả chiều ngược/ }));

    await user.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));
    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    expect(updateRule.mock.calls[0][1]).toMatchObject({ isBidirectional: false });
    expect(updateRule.mock.calls[0][1]).not.toHaveProperty('name'); // tên không còn nhập/gửi
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('backend CŨ bỏ qua isBidirectional: cảnh báo đỏ, KHÔNG báo "thành công" như thể đã hai chiều', async () => {
    const { user } = await setup([ONE_WAY, TWO_WAY]);
    // Backend cũ: whitelist cắt field lạ, luật trả về không có isBidirectional.
    updateRule.mockResolvedValue({ ...ONE_WAY, id: 12 });
    const dlg = await openCreate(user, 'Luật hai chiều', 'Hai chiều HN-HY');
    await user.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Máy chủ chưa hỗ trợ quy tắc hai chiều',
          variant: 'destructive',
        }),
      ),
    );
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Cập nhật quy tắc macro thành công' }));
  });

  it('chủ động bỏ hai chiều thì backend cũ KHÔNG bị cảnh báo oan', async () => {
    const { user } = await setup([ONE_WAY, TWO_WAY]);
    updateRule.mockResolvedValue({ ...ONE_WAY, id: 13 }); // không có isBidirectional
    const dlg = await openCreate(user, 'Luật thường', 'Hai chiều HN-HY');
    await user.click(within(dlg).getByRole('checkbox', { name: /Áp dụng cả chiều ngược/ }));
    await user.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));
    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('form quy tắc KHÔNG có ô "nhân theo số ghế"; kiểu điều chỉnh mặc định là cộng/trừ tiền', async () => {
    const { user } = await setup([ONE_WAY]);
    const dlg = await openCreate(user, 'Luật kiểm lựa chọn');
    expect(within(dlg).queryByText(/Áp dụng nhân theo số ghế/)).not.toBeInTheDocument();
    expect(within(dlg).queryByRole('checkbox', { name: /số ghế/i })).not.toBeInTheDocument();
    const triggers = within(dlg).getAllByRole('combobox').map((t) => t.textContent ?? '');
    expect(triggers.some((t) => /Cộng\/Trừ tiền/.test(t))).toBe(true);
    expect(within(dlg).queryByText(/sàn|trần/i)).not.toBeInTheDocument();
  });

  it('mã nguồn form KHÔNG đưa Giá sàn/Giá trần thành lựa chọn tĩnh (chỉ hiện có điều kiện cho luật cũ)', () => {
    // Radix Select không mở được ổn định trong jsdom ⇒ gác bằng nguồn: không còn SelectItem cố định cho 2 loại này.
    const src = readFileSync(
      resolve(__dirname, 'pricing-macro-manager.tsx'),
      'utf-8',
    );
    expect(src).not.toMatch(/<SelectItem value="MIN_FLOOR"/);
    expect(src).not.toMatch(/<SelectItem value="MAX_CEILING"/);
    expect(src).toMatch(/isLegacyAdjustmentType\(formData\.adjustmentType\)/);
  });

  it('lưu xong có cảnh báo của backend: toast nêu số cảnh báo + nội dung (không chặn, không đỏ)', async () => {
    const { user } = await setup([ONE_WAY]);
    updateRule.mockResolvedValue({
      ...ONE_WAY,
      id: 14,
      isBidirectional: true,
      warnings: [
        { code: 'XUNG_DOT_CUNG_CAP', ruleId: 1, message: 'Chồng phạm vi với "Một chiều HN-HY" nhưng khác mức.' },
        { code: 'PHAN_TRAM_NGOAI_BANG', ruleId: null, message: 'Luật % lọt ngoài băng chặn.' },
      ],
    });
    const dlg = await openCreate(user, 'Luật có cảnh báo');
    await user.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Cập nhật quy tắc macro thành công',
          description: expect.stringContaining('Có 2 cảnh báo'),
        }),
      ),
    );
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('GET band-warnings có cảnh báo → hiện khung vàng; không có → không hiện', async () => {
    bandWarnings.mockResolvedValue({
      band: { minRatio: 0.2, maxRatio: 3, minAbsolute: 20000, maxAbsolute: 300000 },
      warnings: [{ code: 'PHAN_TRAM_NGOAI_BANG', ruleId: 5, message: 'Luật #5 (+150%) lọt ngoài băng.' }],
    });
    await setup([ONE_WAY]);
    const box = await screen.findByTestId('band-warnings');
    expect(box).toHaveTextContent('1 quy tắc % đang bật có thể làm báo giá bị từ chối');
    expect(box).toHaveTextContent('Luật #5 (+150%) lọt ngoài băng.');
  });

  it('band-warnings lỗi (backend cũ / thiếu quyền) → bỏ qua, danh sách vẫn hiện, không toast lỗi', async () => {
    bandWarnings.mockRejectedValue(new Error('403'));
    await setup([ONE_WAY]);
    expect(screen.queryByTestId('band-warnings')).not.toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('luật CŨ kiểu giá sàn: hiện "ngừng áp dụng" ở bảng; mở sửa thì có ghi chú đổi/xoá', async () => {
    const floor = rule({ id: 20, name: 'Sàn cũ', adjustmentType: 'MIN_FLOOR', adjustmentValue: 150000 });
    const { user } = await setup([floor]);
    expect(within(rowOf('Sàn cũ')).getByText('ngừng áp dụng')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Sửa quy tắc #20\b/ }));
    const dlg = await screen.findByRole('dialog', { name: /Chỉnh sửa quy tắc macro/ });
    expect(within(dlg).getByRole('note')).toHaveTextContent('không còn được áp dụng vào giá');
  });

  it('giá trị ngoài biên bị chặn ở client: không gọi API, báo lý do', async () => {
    const { user } = await setup([ONE_WAY]);
    const dlg = await openCreate(user, 'Luật quá tay');
    const value = within(dlg).getByPlaceholderText(/Ví dụ: -20000/);
    fireEvent.change(value, { target: { value: '3000000' } }); // > ±2.000.000
    // submit thẳng form (bỏ qua ràng buộc min/max gốc của trình duyệt) để chạm đúng lớp kiểm tra trong code
    const form = dlg.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Giá trị chưa hợp lệ', variant: 'destructive' }),
      ),
    );
    expect(updateRule).not.toHaveBeenCalled();
  });

  it('sửa luật hai chiều: hộp "cả chiều ngược" đã tích; lưu giữ nguyên isBidirectional=true', async () => {
    const { user } = await setup([ONE_WAY, TWO_WAY]);
    updateRule.mockResolvedValue({ ...TWO_WAY });
    await user.click(screen.getByRole('button', { name: /^Sửa quy tắc #2\b/ }));
    const dlg = await screen.findByRole('dialog', { name: /Chỉnh sửa quy tắc macro/ });
    expect(within(dlg).getByRole('checkbox', { name: /Áp dụng cả chiều ngược/ })).toBeChecked();

    await user.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));
    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    expect(updateRule.mock.calls[0][0]).toBe(2);
    expect(updateRule.mock.calls[0][1]).toMatchObject({ isBidirectional: true });
    expect(toastMock).toHaveBeenCalledWith({ title: 'Cập nhật quy tắc macro thành công' });
  });

  it('sửa luật tạo từ API (RIDE/CAR_4): form quy về CONVENIENT/4SEATS thay vì để ô chọn trống', async () => {
    const { user } = await setup([CANONICAL]);
    updateRule.mockResolvedValue({ ...CANONICAL });
    await user.click(screen.getByRole('button', { name: /^Sửa quy tắc #3\b/ }));
    const dlg = await screen.findByRole('dialog', { name: /Chỉnh sửa quy tắc macro/ });
    await user.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));

    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    expect(updateRule.mock.calls[0][1]).toMatchObject({
      serviceType: 'CONVENIENT',
      vehicleType: '4SEATS',
    });
  });

  it('sửa luật dịch vụ/xe LẠ (DELIVERY, CAR_16): hiện "Khác: …" và lưu GIỮ NGUYÊN, không nới thành ALL', async () => {
    const odd = rule({ id: 7, name: 'Giao hàng', serviceType: 'DELIVERY', vehicleType: 'CAR_16' });
    const { user } = await setup([odd]);
    updateRule.mockResolvedValue({ ...odd });
    await user.click(screen.getByRole('button', { name: /^Sửa quy tắc #7\b/ }));
    const dlg = await screen.findByRole('dialog', { name: /Chỉnh sửa quy tắc macro/ });
    // ô chọn (Radix trigger) thật sự HIỂN THỊ giá trị lạ, không để trống
    const triggers = within(dlg).getAllByRole('combobox').map((t) => t.textContent);
    expect(triggers).toContain('Khác: DELIVERY');
    expect(triggers).toContain('Khác: CAR_16');

    await user.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));
    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    expect(updateRule.mock.calls[0][1]).toMatchObject({ serviceType: 'DELIVERY', vehicleType: 'CAR_16' });
  });

  it('xoá một quy tắc: chỉ gọi API sau khi xác nhận', async () => {
    const { user } = await setup([ONE_WAY, TWO_WAY]);
    deleteRule.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: /^Xoá quy tắc #2\b/ }));
    expect(deleteRule).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Xoá quy tắc' }));
    await waitFor(() => expect(deleteRule).toHaveBeenCalledWith(2));
  });
});

describe('PricingMacroManager — ô chọn tỉnh / xã (Combobox có ô tìm)', () => {
  const HN_WARDS = [
    { code: '00001', name: 'Sơn Đồng', provinceCode: '01' },
    { code: '00002', name: 'Cầu Giấy', provinceCode: '01' },
    { code: '00003', name: 'Hoàng Mai', provinceCode: '01' },
  ];

  beforeEach(() => {
    toastMock.mockReset();
    getRules.mockReset();
    getProvinces.mockReset().mockResolvedValue(PROVINCES);
    getWards.mockReset().mockImplementation(async (code: string) => (code === '01' ? HN_WARDS : []));
    getZones.mockReset().mockResolvedValue([]);
    updateRule.mockReset();
    deleteRule.mockReset();
    bulkDelete.mockReset();
    searchRules.mockReset();
    matchRules.mockReset();
    bandWarnings.mockReset().mockResolvedValue({ band: {}, warnings: [] });
  });

  async function openForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /^Sửa quy tắc #50\b/ }));
    return await screen.findByRole('dialog', { name: /Chỉnh sửa quy tắc macro/ });
  }

  const ANYWHERE = rule({ id: 50, name: 'Luật toàn quốc', originProvinceCode: null, destProvinceCode: null });

  type Slot = 'origin-province' | 'origin-ward' | 'dest-province' | 'dest-ward';
  const slot = (dlg: HTMLElement, id: Slot) => dlg.querySelector(`#macro-${id}`) as HTMLSelectElement;
  const shown = (el: HTMLSelectElement) => el.selectedOptions[0]?.textContent;
  const optionLabels = (el: HTMLSelectElement) => Array.from(el.options).map((o) => o.textContent);

  it('ban đầu: "Toàn quốc (Bất kỳ)" ở ô tỉnh; ô xã bị khoá, nhắc "Chọn tỉnh trước"', async () => {
    const { user } = await setup([ANYWHERE]);
    const dlg = await openForm(user);
    for (const side of ['origin', 'dest'] as const) {
      const prov = slot(dlg, `${side}-province`);
      expect(shown(prov)).toBe('Toàn quốc (Bất kỳ)');
      expect(optionLabels(prov)).toEqual(['Toàn quốc (Bất kỳ)', 'Hà Nội', 'Hưng Yên']); // "tất cả" đứng đầu
      const ward = slot(dlg, `${side}-ward`);
      expect(ward).toBeDisabled();
      expect(shown(ward)).toBe('Chọn tỉnh trước');
    }
  });

  it('chọn tỉnh nạp xã của tỉnh đó, mở khoá ô xã (mục "Toàn bộ tỉnh" đứng đầu); chọn xã rồi lưu đúng mã', async () => {
    const { user } = await setup([ANYWHERE]);
    updateRule.mockResolvedValue({ ...ANYWHERE });
    const dlg = await openForm(user);

    await user.selectOptions(slot(dlg, 'origin-province'), '01');
    await waitFor(() => expect(getWards).toHaveBeenCalledWith('01'));
    await waitFor(() => expect(slot(dlg, 'origin-ward')).toBeEnabled());
    expect(optionLabels(slot(dlg, 'origin-ward'))).toEqual(['Toàn bộ tỉnh (Mọi xã)', 'Sơn Đồng', 'Cầu Giấy', 'Hoàng Mai']);
    expect(shown(slot(dlg, 'origin-ward'))).toBe('Toàn bộ tỉnh (Mọi xã)');

    await user.selectOptions(slot(dlg, 'origin-ward'), '00001');
    expect(shown(slot(dlg, 'origin-ward'))).toBe('Sơn Đồng');

    await user.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));
    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    expect(updateRule.mock.calls[0][1]).toMatchObject({
      originProvinceCode: '01',
      originWardCode: '00001',
      destProvinceCode: null,
      destWardCode: null,
    });
  });

  it('điểm đặc biệt đang bật của tỉnh hiện trong ô xã (đứng trước xã); chọn rồi lưu gửi ZONE:<mã>; vùng tắt/tỉnh khác không hiện', async () => {
    getZones.mockResolvedValue([
      { code: 'NOIBAI', name: 'Sân bay Nội Bài', provinceCode: '01', provinceName: 'Hà Nội', kind: 'AIRPORT', active: true },
      { code: 'OLD', name: 'Vùng tắt', provinceCode: '01', provinceName: 'Hà Nội', kind: 'AIRPORT', active: false },
      { code: 'HY1', name: 'Vùng Hưng Yên', provinceCode: '33', provinceName: 'Hưng Yên', kind: 'AIRPORT', active: true },
    ]);
    const { user } = await setup([ANYWHERE]);
    updateRule.mockResolvedValue({ ...ANYWHERE });
    const dlg = await openForm(user);
    await user.selectOptions(slot(dlg, 'origin-province'), '01');
    await waitFor(() => expect(slot(dlg, 'origin-ward')).toBeEnabled());
    await waitFor(() =>
      expect(optionLabels(slot(dlg, 'origin-ward'))).toEqual([
        'Toàn bộ tỉnh (Mọi xã)',
        'Sân bay Nội Bài (điểm đặc biệt)',
        'Sơn Đồng',
        'Cầu Giấy',
        'Hoàng Mai',
      ]),
    );
    await user.selectOptions(slot(dlg, 'origin-ward'), 'ZONE:NOIBAI');
    await user.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));
    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    expect(updateRule.mock.calls[0][1]).toMatchObject({ originProvinceCode: '01', originWardCode: 'ZONE:NOIBAI' });
  });

  it('"Toàn bộ tỉnh" trả xã về rỗng; "Toàn quốc" xoá cả tỉnh lẫn xã và khoá lại ô xã', async () => {
    const { user } = await setup([ANYWHERE]);
    updateRule.mockResolvedValue({ ...ANYWHERE });
    const dlg = await openForm(user);

    await user.selectOptions(slot(dlg, 'dest-province'), '01');
    await waitFor(() => expect(slot(dlg, 'dest-ward')).toBeEnabled());
    await user.selectOptions(slot(dlg, 'dest-ward'), '00002');
    expect(shown(slot(dlg, 'dest-ward'))).toBe('Cầu Giấy');

    await user.selectOptions(slot(dlg, 'dest-ward'), '__ALL__');
    expect(shown(slot(dlg, 'dest-ward'))).toBe('Toàn bộ tỉnh (Mọi xã)');

    await user.selectOptions(slot(dlg, 'dest-ward'), '00003');
    await user.selectOptions(slot(dlg, 'dest-province'), '__ALL__');
    expect(shown(slot(dlg, 'dest-province'))).toBe('Toàn quốc (Bất kỳ)');
    expect(slot(dlg, 'dest-ward')).toBeDisabled();
    expect(shown(slot(dlg, 'dest-ward'))).toBe('Chọn tỉnh trước');

    await user.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));
    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    expect(updateRule.mock.calls[0][1]).toMatchObject({ destProvinceCode: null, destWardCode: null });
  });

  it('bấm lại tỉnh / xã đang chọn (Combobox trả undefined) thì giữ nguyên, không đặt lại về "tất cả"', async () => {
    const { user } = await setup([ANYWHERE]);
    const dlg = await openForm(user);

    await user.selectOptions(slot(dlg, 'origin-province'), '01');
    await waitFor(() => expect(slot(dlg, 'origin-ward')).toBeEnabled());
    await user.selectOptions(slot(dlg, 'origin-ward'), '00003');

    await user.click(screen.getByRole('button', { name: 'bấm lại macro-origin-ward' }));
    await user.click(screen.getByRole('button', { name: 'bấm lại macro-origin-province' }));
    expect(shown(slot(dlg, 'origin-province'))).toBe('Hà Nội');
    expect(shown(slot(dlg, 'origin-ward'))).toBe('Hoàng Mai');
    expect(getWards).toHaveBeenCalledTimes(1);
  });

  it('sửa luật có sẵn: tỉnh và xã hiện đúng tên (xã chưa nạp xong thì hiện mã, không để ô trống)', async () => {
    const withWard = rule({ id: 40, name: 'Có xã', originProvinceCode: '01', originWardCode: '00002' });
    const { user } = await setup([withWard]);
    await user.click(screen.getByRole('button', { name: /^Sửa quy tắc #40\b/ }));
    const dlg = await screen.findByRole('dialog', { name: /Chỉnh sửa quy tắc macro/ });
    expect(shown(slot(dlg, 'origin-province'))).toBe('Hà Nội');
    expect(shown(slot(dlg, 'dest-province'))).toBe('Hưng Yên');
    await waitFor(() => expect(shown(slot(dlg, 'origin-ward'))).toBe('Cầu Giấy'));
  });
});

describe('PricingMacroManager — bỏ tên quy tắc + phân trang', () => {
  beforeEach(() => {
    toastMock.mockReset();
    getRules.mockReset();
    getProvinces.mockReset().mockResolvedValue(PROVINCES);
    getWards.mockReset().mockResolvedValue([]);
    updateRule.mockReset();
    deleteRule.mockReset();
    bulkDelete.mockReset();
    searchRules.mockReset();
    matchRules.mockReset();
    bandWarnings.mockReset().mockResolvedValue({ band: {}, warnings: [] });
  });

  it('không còn cột/ô "Tên quy tắc"; dòng hiện điểm đón/trả (tên xã nếu có) + nhãn 2 chiều + ghi chú', async () => {
    const r = rule({
      id: 9,
      name: 'tên cũ không hiển thị',
      isBidirectional: true,
      originWardCode: '13285',
      originWardName: 'Phường Phủ Lý',
      destWardCode: 'ZONE:NOIBAI',
      destWardName: 'Sân bay Nội Bài',
      note: 'Dịp lễ',
    });
    getRules.mockResolvedValue(pageOf([r], 1));
    render(<PricingMacroManager />);
    const row = await screen.findByTestId('rule-row-9');
    expect(screen.queryByRole('columnheader', { name: /Tên quy tắc/ })).not.toBeInTheDocument();
    expect(within(row).queryByText('tên cũ không hiển thị')).not.toBeInTheDocument();
    expect(within(row).getByText('Phường Phủ Lý')).toBeInTheDocument();
    expect(within(row).getByText('Sân bay Nội Bài')).toBeInTheDocument();
    expect(within(row).getByText('2 chiều')).toBeInTheDocument();
    expect(within(row).getByText('Dịp lễ')).toBeInTheDocument();
    // nhãn truy cập dùng "Đón ↔ Trả", có mã luật
    expect(
      screen.getByRole('button', { name: 'Sửa quy tắc #9 Phường Phủ Lý (Hà Nội) ↔ Sân bay Nội Bài (Hưng Yên)' }),
    ).toBeInTheDocument();
  });

  it('backend cũ không trả tên xã ⇒ hiện mã, không vỡ', async () => {
    getRules.mockResolvedValue(pageOf([rule({ id: 8, originWardCode: '13285' })], 1));
    render(<PricingMacroManager />);
    expect(within(await screen.findByTestId('rule-row-8')).getByText('Xã #13285')).toBeInTheDocument();
  });

  it('form sửa không có ô tên và không gửi tên (backend giữ nguyên tên cũ)', async () => {
    const { user } = await setup([ONE_WAY]);
    updateRule.mockResolvedValue({ ...ONE_WAY });
    await user.click(screen.getByRole('button', { name: /^Sửa quy tắc #1\b/ }));
    const dlg = await screen.findByRole('dialog', { name: /Chỉnh sửa quy tắc macro/ });
    expect(within(dlg).queryByText(/Tên quy tắc/)).not.toBeInTheDocument();
    await user.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));
    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    expect(updateRule.mock.calls[0][1]).not.toHaveProperty('name');
  });

  it('mặc định 50 dòng/trang; thanh phân trang cho biết khoảng đang xem và tổng', async () => {
    getRules.mockResolvedValue(pageOf([ONE_WAY, TWO_WAY], 120));
    render(<PricingMacroManager />);
    await screen.findByTestId('rule-row-1');
    expect(getRules).toHaveBeenCalledWith({ page: 1, limit: 50 });
    expect(screen.getByTestId('rules-pager')).toHaveTextContent('Hiển thị 1–2 / 120 quy tắc');
    expect(screen.getByTestId('rules-pager')).toHaveTextContent('Trang 1 / 3');
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
  });

  it('chọn số dòng/trang: gọi lại với limit mới và về trang 1', async () => {
    getRules.mockResolvedValue(pageOf([ONE_WAY], 120));
    render(<PricingMacroManager />);
    await screen.findByTestId('rule-row-1');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(getRules).toHaveBeenLastCalledWith({ page: 2, limit: 50 }));
    await user.selectOptions(screen.getByLabelText('Số dòng mỗi trang'), '100');
    await waitFor(() => expect(getRules).toHaveBeenLastCalledWith({ page: 1, limit: 100 }));
    expect(screen.getByTestId('rules-pager')).toHaveTextContent('Trang 1 / 2');
  });

  it('Trang sau/Trước đổi trang; ở trang cuối nút Sau bị khoá', async () => {
    getRules.mockImplementation(async (p: { page: number }) =>
      pageOf([rule({ id: 100 + p.page })], 120, p.page),
    );
    render(<PricingMacroManager />);
    const user = userEvent.setup();
    await screen.findByTestId('rule-row-101');
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByTestId('rule-row-102');
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByTestId('rule-row-103');
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Trang trước' }));
    await screen.findByTestId('rule-row-102');
  });

  it('vùng chọn được GIỮ khi sang trang khác (xoá hàng loạt gồm cả dòng trang trước)', async () => {
    getRules.mockImplementation(async (p: { page: number }) =>
      pageOf([rule({ id: p.page === 1 ? 1 : 2 })], 100, p.page),
    );
    render(<PricingMacroManager />);
    const user = userEvent.setup();
    await screen.findByTestId('rule-row-1');
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/ }));
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByTestId('rule-row-2');
    await user.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #2\b/ }));
    bulkDelete.mockResolvedValue({ deleted: [1, 2], missing: [] });
    await user.click(screen.getByRole('button', { name: 'Xoá đã chọn (2)' }));
    await user.click(await screen.findByRole('button', { name: 'Xoá 2 quy tắc' }));
    await waitFor(() => expect(bulkDelete).toHaveBeenCalledTimes(1));
    expect(bulkDelete.mock.calls[0][0].slice().sort()).toEqual([1, 2]);
  });

  it('xoá hết dòng của trang cuối ⇒ tự lùi về trang cuối còn dữ liệu (không kẹt ở trang trống)', async () => {
    getRules.mockImplementation(async (p: { page: number }) =>
      p.page === 2 ? pageOf([], 50, 2) : pageOf([rule({ id: 1 })], 50, 1),
    );
    render(<PricingMacroManager />);
    const user = userEvent.setup();
    await screen.findByTestId('rule-row-1');
    // giả lập đang ở trang 2 mà server báo trống nhưng tổng còn 50 ⇒ lùi về trang 1
    getRules.mockImplementation(async (p: { page: number }) =>
      p.page === 2 ? pageOf([], 50, 2, 50) : pageOf([rule({ id: 1 })], 50, 1, 50),
    );
    await user.selectOptions(screen.getByLabelText('Số dòng mỗi trang'), '20');
    await waitFor(() => expect(getRules).toHaveBeenCalledWith({ page: 1, limit: 20 }));
    expect(await screen.findByTestId('rule-row-1')).toBeInTheDocument();
  });

  it('kết quả của yêu cầu CŨ không đè lên yêu cầu mới (danh sách treo → gõ tìm; tìm A treo → tìm B)', async () => {
    let releaseList: (v: unknown) => void = () => {};
    let releaseA: (v: unknown) => void = () => {};
    getRules.mockImplementationOnce(() => new Promise((r) => (releaseList = r))); // lần nạp đầu: treo
    searchRules.mockImplementation(async (p: { q?: string }) => {
      if (p.q === 'a') return new Promise((r) => (releaseA = r)); // tìm «a»: treo
      return pageOf([TWO_WAY], 1);
    });
    render(<PricingMacroManager />);
    const user = userEvent.setup();
    await user.type(qBox(), 'a');
    await waitFor(() => expect(searchRules).toHaveBeenCalledWith({ q: 'a', page: 1, limit: 50 }));
    await user.type(qBox(), 'b');
    await screen.findByTestId('rule-row-2'); // tìm «ab» về trước
    releaseList(pageOf([ONE_WAY], 1)); // danh sách thường về muộn
    releaseA(pageOf([CANONICAL], 1)); // tìm «a» về muộn
    await sleep(30);
    expect(screen.queryByTestId('rule-row-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rule-row-3')).not.toBeInTheDocument();
    expect(screen.getByTestId('rule-row-2')).toBeInTheDocument();
  });

  it('lọc mà không có kết quả ⇒ «Không có quy tắc nào khớp bộ lọc.»; không lọc mà trống ⇒ câu cũ', async () => {
    getRules.mockResolvedValue(pageOf([], 0));
    searchRules.mockResolvedValue(pageOf([], 0));
    render(<PricingMacroManager />);
    const user = userEvent.setup();
    expect(
      await screen.findByText('Chưa có quy tắc macro nào. Bấm "Thêm quy tắc" để bắt đầu cấu hình.'),
    ).toBeInTheDocument();
    await user.type(qBox(), 'zzz');
    expect(await screen.findByText('Không có quy tắc nào khớp bộ lọc.')).toBeInTheDocument();
    expect(screen.queryByText(/Chưa có quy tắc macro nào/)).not.toBeInTheDocument();
  });
});

// ───────── Thanh «Tìm quy tắc»: lọc theo mã + «quy tắc đang áp» ─────────

// Cùng bộ dữ liệu với macro-place-picker.test.tsx / ward-quick-add.test.tsx: «dai tu» = Đại Từ (chắc chắn), «cau giay» =
// Cầu Giấy, «thai nguyen» = Cả tỉnh Thái Nguyên, «Dong Anh» = chỉ có dòng «Tìm theo chữ», «san bay noi bai» = điểm đặc biệt.
const PICK_PROVINCES: ProvinceOption[] = [
  { code: '01', name: 'Hà Nội' },
  { code: '15', name: 'Lào Cai' },
  { code: '19', name: 'Thái Nguyên' },
  { code: '20', name: 'Lạng Sơn' },
  { code: '92', name: 'Cần Thơ' },
];
const PICK_WARDS: WardOption[] = [
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
const PICK_ZONES: SpecialZone[] = [
  { code: 'NOIBAI', name: 'Sân bay Nội Bài', provinceCode: '01', provinceName: 'Hà Nội', kind: 'AIRPORT', active: true },
];
const DAI_TU = { originProvinceCode: '19', originWardCode: '19001' };
const CAU_GIAY = { destProvinceCode: '01', destWardCode: '01002' };

// Luật Đại Từ → Cầu Giấy: 13 thắng ở ghép/7, 12 thắng ở bao xe/4, 5 (cấp tỉnh) thua vì kém cụ thể; 77 khớp bộ lọc nhưng
// KHÔNG có trong bảng xếp hạng nào.
const TN_HN: Partial<PricingMacroRule> = {
  originProvinceCode: '19',
  originWardCode: '19001',
  originWardName: 'Đại Từ',
  destProvinceCode: '01',
  destWardCode: '01002',
  destWardName: 'Cầu Giấy',
};
const R13 = rule({ ...TN_HN, id: 13, priority: 1 });
const R12 = rule({ ...TN_HN, id: 12, priority: 1, adjustmentValue: 15000 });
const R5 = rule({ id: 5, priority: 9, originProvinceCode: '19', destProvinceCode: '01', adjustmentType: 'PERCENTAGE', adjustmentValue: 5 });
const R77 = rule({ id: 77, originProvinceCode: '19', destProvinceCode: '01', serviceType: 'RIDE' });

const rank = (ruleId: number, verdict: MacroMatchRankingRow['verdict']): MacroMatchRankingRow => ({
  ruleId,
  verdict,
  orientation: 'FORWARD',
  specificity: { wardEnds: 2, provinceEnds: 0, serviceExact: 0, vehicleExact: 0 },
  score: 1,
});
const combo = (
  serviceType: MacroMatchCombo['serviceType'],
  vehicleType: MacroMatchCombo['vehicleType'],
  winnerRuleId: number | null,
  ranking: MacroMatchRankingRow[] = [],
): MacroMatchCombo => ({
  serviceType,
  vehicleType,
  winnerRuleId,
  orientation: winnerRuleId === null ? null : 'FORWARD',
  score: winnerRuleId === null ? null : 1,
  ranking,
  truncated: false,
});
const matchOf = (combos: MacroMatchCombo[], rules: PricingMacroRule[] = [R13, R12, R5]): MacroMatchResponse => ({
  origin: { provinceCode: '19', wardCode: '19001', zoneCode: null },
  dest: { provinceCode: '01', wardCode: '01002', zoneCode: null },
  combos,
  rules,
  warnings: [],
});
// Tổ hợp ĐẦU (ghép/4) không có luật thắng ⇒ tổ hợp chọn sẵn phải là ghép/7 (tổ hợp đầu tiên CÓ luật thắng).
const MATCH = matchOf([
  combo('CARPOOL', 'CAR_4', null),
  combo('CARPOOL', 'CAR_7', 13, [rank(13, 'WINNER'), rank(12, 'LOSES_ID'), rank(5, 'LOSES_SPECIFICITY')]),
  combo('RIDE', 'CAR_4', 12, [rank(12, 'WINNER'), rank(13, 'LOSES_PRIORITY')]),
  combo('RIDE', 'CAR_7', null),
]);

// Máy chủ CŨ: `GET …/search` rơi vào route `:id` ⇒ 400 «numeric string» (đã đo ở FE1).
const UNSUPPORTED = (path = 'GET /pricing/macro-rules/search') =>
  buildApiError({
    httpStatus: 400,
    path,
    body: { success: false, error: { code: 'Bad Request', message: 'Validation failed (numeric string is expected)' } },
  });
const UNSUPPORTED_TEXT =
  'Máy chủ chưa hỗ trợ tìm kiếm mới (cần cập nhật backend). Danh sách bên dưới KHÔNG được lọc theo ô tìm — đừng dựa vào nó.';

type UE = ReturnType<typeof userEvent.setup>;
type Side = 'Điểm đón' | 'Điểm đến';
const ue = () => userEvent.setup({ pointerEventsCheck: 0 });
const placeBox = (side: Side) =>
  screen.getByRole('combobox', { name: `${side}: tìm phường/xã, tỉnh hoặc điểm đặc biệt` });
const placeHint = (side: Side) => screen.getByTestId(`place-picker-hint-${side}`);
const panel = () => screen.getByTestId('macro-match-panel');
const comboButton = (label: string) => within(panel()).getByRole('button', { name: new RegExp(`^${label}`) });
const winnerBadgeOf = (id: number) => within(screen.getByTestId(`rule-row-${id}`)).queryByText('ĐANG ÁP');

async function choose(u: UE, name: 'Dịch vụ' | 'Loại xe' | 'Trạng thái', option: string) {
  await u.click(screen.getByRole('combobox', { name }));
  await u.click(await screen.findByRole('option', { name: option }));
}

/** Chọn một điểm bằng ô chọn điểm THẬT (của FE1): gõ rồi bấm đúng dòng gợi ý. */
async function pickPlace(u: UE, side: Side, text: string, option: string) {
  await u.type(placeBox(side), text);
  await u.click(await screen.findByRole('option', { name: option }));
  await screen.findByTestId(`place-picker-chip-${side}`);
}

async function renderManager() {
  render(<PricingMacroManager />);
  await screen.findByTestId('rule-row-1');
  return ue();
}

describe('PricingMacroManager — thanh «Tìm quy tắc» (thay ô AI)', () => {
  beforeEach(() => {
    toastMock.mockReset();
    getRules.mockReset().mockResolvedValue(pageOf([ONE_WAY, TWO_WAY, CANONICAL], 3));
    searchRules.mockReset().mockResolvedValue(pageOf([], 0));
    matchRules.mockReset().mockResolvedValue(MATCH);
    getProvinces.mockReset().mockResolvedValue(PICK_PROVINCES);
    // Không mã tỉnh = ô chọn điểm nạp MỌI xã; có mã = form sửa nạp xã của một tỉnh.
    getWards.mockReset().mockImplementation(async (code?: string) => (code ? [] : PICK_WARDS));
    getZones.mockReset().mockResolvedValue(PICK_ZONES);
    updateRule.mockReset();
    deleteRule.mockReset();
    bulkDelete.mockReset();
    bandWarnings.mockReset().mockResolvedValue({ band: {}, warnings: [] });
  });
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('mặc định: gọi danh sách thường y như trước, KHÔNG gọi tìm kiếm / tra «đang áp»; chưa có khung «đang áp», chưa báo gì', async () => {
    await renderManager();
    expect(getRules).toHaveBeenCalledTimes(1);
    expect(getRules).toHaveBeenCalledWith({ page: 1, limit: 50 });
    await sleep(50);
    expect(searchRules).not.toHaveBeenCalled();
    expect(matchRules).not.toHaveBeenCalled();
    expect(qBox()).toHaveValue('');
    expect(screen.queryByTestId('macro-match-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('macro-search-unsupported')).not.toBeInTheDocument();
    expect(screen.queryByText('ĐANG ÁP')).not.toBeInTheDocument();
  });

  it('gõ ô ghi chú/mã: đợi ngừng gõ ~300 ms rồi gọi tìm kiếm MỘT lần (q đã cắt, trang 1)', async () => {
    searchRules.mockResolvedValue(pageOf([TWO_WAY], 1));
    const u = await renderManager();
    await u.type(qBox(), ' dịp lễ ');
    expect(searchRules).not.toHaveBeenCalled(); // vừa gõ xong: chưa gọi
    await waitFor(() => expect(searchRules).toHaveBeenCalledTimes(1));
    expect(searchRules).toHaveBeenCalledWith({ q: 'dịp lễ', page: 1, limit: 50 });
    await waitForResult({ shown: [2], gone: [1, 3] });
    await sleep(400);
    expect(searchRules).toHaveBeenCalledTimes(1);
    expect(getRules).toHaveBeenCalledTimes(1);
  });

  it('đang ở trang 2: đổi bộ lọc ⇒ về trang 1; sang trang khi đang lọc ⇒ GIỮ bộ lọc', async () => {
    getRules.mockResolvedValue(pageOf([ONE_WAY], 120));
    searchRules.mockImplementation(async (p: { page: number }) => pageOf([rule({ id: 200 + p.page })], 120, p.page));
    const u = await renderManager();
    await u.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(getRules).toHaveBeenLastCalledWith({ page: 2, limit: 50 }));
    await waitFor(() => expect(screen.getByTestId('rules-pager')).toHaveTextContent('Trang 2 / 3'));

    await u.type(qBox(), 'lễ');
    await waitFor(() => expect(searchRules).toHaveBeenCalledTimes(1));
    expect(searchRules).toHaveBeenCalledWith({ q: 'lễ', page: 1, limit: 50 });
    await screen.findByTestId('rule-row-201');
    expect(screen.getByTestId('rules-pager')).toHaveTextContent('Trang 1 / 3');

    await u.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByTestId('rule-row-202');
    expect(searchRules).toHaveBeenLastCalledWith({ q: 'lễ', page: 2, limit: 50 });

    // ô chọn áp NGAY: cũng về trang 1 và giữ chữ đang lọc
    await choose(u, 'Dịch vụ', 'Bao xe');
    expect(searchRules).toHaveBeenLastCalledWith({ q: 'lễ', serviceType: 'RIDE', page: 1, limit: 50 });
    await screen.findByTestId('rule-row-201');
    expect(getRules).toHaveBeenCalledTimes(2); // đổi bộ lọc không kéo theo lượt nạp danh sách thường nào
  });

  it('Dịch vụ / Loại xe / Trạng thái: gọi tìm kiếm NGAY (không đợi) với đúng tham số', async () => {
    const u = await renderManager();
    await choose(u, 'Dịch vụ', 'Bao xe');
    expect(searchRules).toHaveBeenLastCalledWith({ serviceType: 'RIDE', page: 1, limit: 50 });
    await choose(u, 'Loại xe', 'Xe 7 chỗ');
    expect(searchRules).toHaveBeenLastCalledWith({ serviceType: 'RIDE', vehicleType: 'CAR_7', page: 1, limit: 50 });
    await choose(u, 'Trạng thái', 'Đang tắt');
    expect(searchRules).toHaveBeenLastCalledWith({
      serviceType: 'RIDE',
      vehicleType: 'CAR_7',
      isActive: false,
      page: 1,
      limit: 50,
    });
    expect(searchRules).toHaveBeenCalledTimes(3);
    expect(matchRules).not.toHaveBeenCalled();
    expect(screen.queryByTestId('macro-match-panel')).not.toBeInTheDocument();
  });

  it('chọn điểm đón cụ thể bằng ô chọn điểm THẬT ⇒ gửi mã tỉnh + mã xã (+ cover); khung nhắc chọn đủ hai đầu, chưa tra', async () => {
    const u = await renderManager();
    await pickPlace(u, 'Điểm đón', 'dai tu', 'Đại Từ, Thái Nguyên');
    expect(searchRules).toHaveBeenLastCalledWith({ ...DAI_TU, cover: true, page: 1, limit: 50 });
    expect(panel()).toHaveTextContent('Chọn cả điểm đón và điểm đến để xem quy tắc đang áp dụng.');
    expect(matchRules).not.toHaveBeenCalled();
    expect(getWards).toHaveBeenCalledTimes(1);
    expect(getWards).toHaveBeenCalledWith(); // một lần, MỌI xã
  });

  it('đủ hai đầu cụ thể ⇒ gọi CẢ tìm kiếm lẫn tra «đang áp»; dòng thắng tô xanh + «ĐANG ÁP» cạnh mã; dòng thua có nhãn lý do', async () => {
    searchRules.mockResolvedValue(pageOf([R13, R12, R5, R77], 4));
    const u = await renderManager();
    await pickPlace(u, 'Điểm đón', 'dai tu', 'Đại Từ, Thái Nguyên');
    await pickPlace(u, 'Điểm đến', 'cau giay', 'Cầu Giấy, Hà Nội');
    expect(searchRules).toHaveBeenLastCalledWith({ ...DAI_TU, ...CAU_GIAY, cover: true, page: 1, limit: 50 });
    expect(matchRules).toHaveBeenCalledTimes(1);
    expect(matchRules).toHaveBeenCalledWith({ ...DAI_TU, ...CAU_GIAY });

    // tổ hợp chọn sẵn = tổ hợp ĐẦU TIÊN có luật thắng (ghép/7), không phải tổ hợp 0
    await waitFor(() => expect(comboButton('Ghép xe · Xe 7 chỗ')).toHaveAttribute('aria-pressed', 'true'));
    expect(comboButton('Ghép xe · Xe 4 chỗ')).toHaveAttribute('aria-pressed', 'false');
    await waitForResult({ shown: [13, 12, 5, 77] });
    const winner = screen.getByTestId('rule-row-13');
    expect(winner).toHaveClass('bg-emerald-50/70');
    const badge = within(winner).getByText('ĐANG ÁP');
    expect(within(winner).getByText('#13').parentElement).toContainElement(badge); // nằm cạnh mã quy tắc
    expect(within(winner).queryByText('Đang áp dụng')).not.toBeInTheDocument(); // không thêm nhãn xám «thắng»
    expect(screen.getAllByText('ĐANG ÁP')).toHaveLength(1);

    const r12 = screen.getByTestId('rule-row-12');
    expect(r12).not.toHaveClass('bg-emerald-50/70');
    expect(within(r12).getByText('Thua: mã nhỏ hơn')).toBeInTheDocument();
    expect(within(screen.getByTestId('rule-row-5')).getByText('Thua: kém cụ thể hơn')).toBeInTheDocument();
    const outside = screen.getByTestId('rule-row-77');
    expect(outside).not.toHaveClass('bg-emerald-50/70');
    expect(within(outside).queryByText(/^Thua|ĐANG ÁP|Đang áp dụng|Không áp dụng/)).not.toBeInTheDocument();
  });

  it('bấm tổ hợp khác ⇒ dòng tô xanh và nhãn lý do chuyển theo ĐÚNG tổ hợp đó (không gọi lại máy chủ)', async () => {
    searchRules.mockResolvedValue(pageOf([R13, R12, R5, R77], 4));
    const u = await renderManager();
    await pickPlace(u, 'Điểm đón', 'dai tu', 'Đại Từ, Thái Nguyên');
    await pickPlace(u, 'Điểm đến', 'cau giay', 'Cầu Giấy, Hà Nội');
    await waitFor(() => expect(winnerBadgeOf(13)).toBeInTheDocument());

    await u.click(comboButton('Bao xe · Xe 4 chỗ'));
    expect(comboButton('Bao xe · Xe 4 chỗ')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('rule-row-12')).toHaveClass('bg-emerald-50/70');
    expect(winnerBadgeOf(12)).toBeInTheDocument();
    expect(screen.getByTestId('rule-row-13')).not.toHaveClass('bg-emerald-50/70');
    expect(winnerBadgeOf(13)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('rule-row-13')).getByText('Thua: ưu tiên thấp hơn')).toBeInTheDocument();
    expect(within(screen.getByTestId('rule-row-5')).queryByText(/^Thua/)).not.toBeInTheDocument(); // không có trong tổ hợp này

    // tổ hợp không có quy tắc nào: không dòng nào được tô
    await u.click(comboButton('Bao xe · Xe 7 chỗ'));
    expect(screen.queryByText('ĐANG ÁP')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Thua/)).not.toBeInTheDocument();
    expect(matchRules).toHaveBeenCalledTimes(1);
  });

  it('một đầu theo chữ ⇒ khung báo chưa biết chính xác xã nào, KHÔNG gọi tra «đang áp»; tìm kiếm gửi chữ cho đầu đó', async () => {
    const u = await renderManager();
    await pickPlace(u, 'Điểm đón', 'Dong Anh', 'Tìm theo chữ «Dong Anh» (gồm tên huyện/tỉnh cũ)');
    await pickPlace(u, 'Điểm đến', 'cau giay', 'Cầu Giấy, Hà Nội');
    expect(searchRules).toHaveBeenLastCalledWith({ originSearch: 'Dong Anh', ...CAU_GIAY, cover: true, page: 1, limit: 50 });
    expect(panel()).toHaveTextContent('Đã chọn theo chữ nên chưa biết chính xác xã nào');
    await sleep(50);
    expect(matchRules).not.toHaveBeenCalled();
    expect(screen.queryByText('ĐANG ÁP')).not.toBeInTheDocument();
  });

  it('một đầu «Cả tỉnh» ⇒ khung nhắc quy tắc cấp xã không được xét nhưng VẪN tra và hiện kết quả', async () => {
    matchRules.mockResolvedValue(
      matchOf(
        [
          combo('CARPOOL', 'CAR_4', 5, [rank(5, 'WINNER')]),
          combo('CARPOOL', 'CAR_7', 5, [rank(5, 'WINNER')]),
          combo('RIDE', 'CAR_4', 77, [rank(77, 'WINNER'), rank(5, 'LOSES_SPECIFICITY')]),
          combo('RIDE', 'CAR_7', 5, [rank(5, 'WINNER')]),
        ],
        [R5, R77],
      ),
    );
    searchRules.mockResolvedValue(pageOf([R5, R77], 2));
    const u = await renderManager();
    await pickPlace(u, 'Điểm đón', 'thai nguyen', 'Cả tỉnh Thái Nguyên');
    await pickPlace(u, 'Điểm đến', 'cau giay', 'Cầu Giấy, Hà Nội');
    expect(searchRules).toHaveBeenLastCalledWith({ originProvinceCode: '19', ...CAU_GIAY, cover: true, page: 1, limit: 50 });
    expect(matchRules).toHaveBeenCalledWith({ originProvinceCode: '19', ...CAU_GIAY });
    expect(panel()).toHaveTextContent('Bạn chọn cả tỉnh nên quy tắc cấp xã không được xét');
    await waitFor(() => expect(comboButton('Ghép xe · Xe 4 chỗ')).toHaveAttribute('aria-pressed', 'true'));
    await waitForResult({ shown: [5, 77] });
    expect(winnerBadgeOf(5)).toBeInTheDocument();
    expect(screen.getByTestId('rule-row-5')).toHaveClass('bg-emerald-50/70');
  });

  it('máy chủ CŨ (400 «numeric string»): báo đỏ phía trên bảng, bảng KHÔNG còn dòng nào (không bao giờ hiện danh sách không lọc)', async () => {
    searchRules.mockRejectedValue(UNSUPPORTED());
    const u = await renderManager();
    expect(ruleRows()).toHaveLength(3);
    await choose(u, 'Dịch vụ', 'Bao xe');
    expect(await screen.findByTestId('macro-search-unsupported')).toHaveTextContent(UNSUPPORTED_TEXT);
    expect(ruleRows()).toHaveLength(0);
    expect(screen.queryByText('Không có quy tắc nào khớp bộ lọc.')).not.toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();

    // «Xoá lọc» ⇒ về danh sách thường (máy chủ cũ vẫn có), hết báo
    await u.click(screen.getByRole('button', { name: 'Xoá lọc' }));
    await screen.findByTestId('rule-row-1');
    expect(screen.queryByTestId('macro-search-unsupported')).not.toBeInTheDocument();
  });

  it('máy chủ CŨ với tra «đang áp»: khung báo cùng câu đỏ, không dòng nào được tô', async () => {
    searchRules.mockResolvedValue(pageOf([R13, R12], 2));
    matchRules.mockRejectedValue(UNSUPPORTED('GET /pricing/macro-rules/match'));
    const u = await renderManager();
    await pickPlace(u, 'Điểm đón', 'dai tu', 'Đại Từ, Thái Nguyên');
    await pickPlace(u, 'Điểm đến', 'cau giay', 'Cầu Giấy, Hà Nội');
    expect(await screen.findByTestId('macro-match-error')).toHaveTextContent(UNSUPPORTED_TEXT);
    await screen.findByTestId('rule-row-13');
    expect(screen.queryByText('ĐANG ÁP')).not.toBeInTheDocument();
  });

  it('lỗi tìm kiếm khác: toast «Lỗi tìm kiếm» kèm câu lỗi; không để lại dòng của danh sách trước', async () => {
    searchRules.mockRejectedValue(new Error('Máy chủ đang gặp sự cố'));
    const u = await renderManager();
    await choose(u, 'Dịch vụ', 'Bao xe');
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Lỗi tìm kiếm',
        description: 'Máy chủ đang gặp sự cố',
        variant: 'destructive',
      }),
    );
    expect(await screen.findByText('Không tải được kết quả tìm kiếm — bấm «Làm mới» để thử lại.')).toBeInTheDocument();
    expect(screen.queryByTestId('macro-search-unsupported')).not.toBeInTheDocument();
    expect(ruleRows()).toHaveLength(0);
  });

  it('lỗi khác khi tra «đang áp»: khung ghi rõ lỗi, không dòng nào được tô, không toast', async () => {
    searchRules.mockResolvedValue(pageOf([R13, R12], 2));
    matchRules.mockRejectedValue(new Error('Hết thời gian chờ'));
    const u = await renderManager();
    await pickPlace(u, 'Điểm đón', 'dai tu', 'Đại Từ, Thái Nguyên');
    await pickPlace(u, 'Điểm đến', 'cau giay', 'Cầu Giấy, Hà Nội');
    expect(await screen.findByTestId('macro-match-error')).toHaveTextContent(
      'Không tra được quy tắc đang áp dụng: Hết thời gian chờ',
    );
    await waitForResult({ shown: [13, 12] });
    expect(screen.queryByText('ĐANG ÁP')).not.toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('liên kết sâu ?ruleId=12: lần nạp ĐẦU đã là tìm kiếm q «#12», ô ghi chú/mã hiện #12; «Xoá lọc» về danh sách thường', async () => {
    window.history.pushState({}, '', '/master-data?ruleId=12');
    searchRules.mockResolvedValue(pageOf([R12], 1));
    render(<PricingMacroManager />);
    await screen.findByTestId('rule-row-12');
    expect(searchRules).toHaveBeenCalledTimes(1);
    expect(searchRules).toHaveBeenCalledWith({ q: '#12', page: 1, limit: 50 });
    expect(getRules).not.toHaveBeenCalled();
    expect(qBox()).toHaveValue('#12');
    expect(screen.queryByRole('button', { name: 'Bỏ lọc quy tắc' })).not.toBeInTheDocument(); // chip cũ đã bỏ

    const u = ue();
    await u.click(screen.getByRole('button', { name: 'Xoá lọc' }));
    await screen.findByTestId('rule-row-1');
    expect(getRules).toHaveBeenCalledTimes(1);
    expect(getRules).toHaveBeenCalledWith({ page: 1, limit: 50 });
    expect(qBox()).toHaveValue('');
    await sleep(400);
    expect(searchRules).toHaveBeenCalledTimes(1); // «Xoá lọc» áp ngay, không có lượt tìm «#12» thừa
    expect(getRules).toHaveBeenCalledTimes(1);
  });

  it('?ruleId= không phải số ⇒ bỏ qua, danh sách thường', async () => {
    window.history.pushState({}, '', '/master-data?ruleId=12abc');
    await renderManager();
    expect(getRules).toHaveBeenCalledWith({ page: 1, limit: 50 });
    expect(searchRules).not.toHaveBeenCalled();
    expect(qBox()).toHaveValue('');
  });

  it('kết quả tra «đang áp» CŨ về muộn không đè kết quả của cặp điểm mới', async () => {
    let releaseOld: (v: unknown) => void = () => {};
    matchRules.mockImplementation((p: { destWardCode?: string }) =>
      p.destWardCode === '01002'
        ? new Promise((r) => (releaseOld = r))
        : Promise.resolve(
            matchOf([
              combo('CARPOOL', 'CAR_4', 12, [rank(12, 'WINNER'), rank(13, 'LOSES_ID')]),
              combo('CARPOOL', 'CAR_7', null),
              combo('RIDE', 'CAR_4', null),
              combo('RIDE', 'CAR_7', null),
            ]),
          ),
    );
    searchRules.mockResolvedValue(pageOf([R13, R12], 2));
    const u = await renderManager();
    await pickPlace(u, 'Điểm đón', 'dai tu', 'Đại Từ, Thái Nguyên');
    await pickPlace(u, 'Điểm đến', 'cau giay', 'Cầu Giấy, Hà Nội'); // tra lần 1: treo
    await u.click(screen.getByRole('button', { name: 'Bỏ Điểm đến' }));
    await pickPlace(u, 'Điểm đến', 'noi bai', 'Nội Bài, Hà Nội'); // tra lần 2: về ngay
    await waitFor(() => expect(winnerBadgeOf(12)).toBeInTheDocument());
    expect(matchRules).toHaveBeenLastCalledWith({ ...DAI_TU, destProvinceCode: '01', destWardCode: '01003' });

    releaseOld(MATCH); // lần 1 (13 thắng ở ghép/7) về muộn
    await sleep(30);
    expect(winnerBadgeOf(12)).toBeInTheDocument();
    expect(winnerBadgeOf(13)).not.toBeInTheDocument();
    expect(comboButton('Ghép xe · Xe 4 chỗ')).toHaveAttribute('aria-pressed', 'true');
  });

  it('xoá một quy tắc khi đang lọc ⇒ nạp lại ĐÚNG bộ lọc đang có và tra lại «đang áp» (quy tắc có thể đã đổi)', async () => {
    searchRules.mockResolvedValue(pageOf([R13, R12], 2));
    deleteRule.mockResolvedValue(undefined);
    const u = await renderManager();
    await pickPlace(u, 'Điểm đón', 'dai tu', 'Đại Từ, Thái Nguyên');
    await pickPlace(u, 'Điểm đến', 'cau giay', 'Cầu Giấy, Hà Nội');
    await choose(u, 'Dịch vụ', 'Bao xe');
    await screen.findByTestId('rule-row-12');
    await waitFor(() => expect(winnerBadgeOf(13)).toBeInTheDocument());
    expect(matchRules).toHaveBeenCalledTimes(1); // đổi dịch vụ không tra lại (4 tổ hợp đã đủ)
    const before = searchRules.mock.calls.length;

    await u.click(screen.getByRole('button', { name: /^Xoá quy tắc #12\b/ }));
    await u.click(await screen.findByRole('button', { name: 'Xoá quy tắc' }));
    await waitFor(() => expect(deleteRule).toHaveBeenCalledWith(12));
    await waitFor(() => expect(searchRules.mock.calls.length).toBe(before + 1));
    expect(searchRules).toHaveBeenLastCalledWith({
      ...DAI_TU,
      ...CAU_GIAY,
      serviceType: 'RIDE',
      cover: true,
      page: 1,
      limit: 50,
    });
    await waitFor(() => expect(matchRules).toHaveBeenCalledTimes(2));
    expect(getRules).toHaveBeenCalledTimes(1);
  });

  it('lưu sửa một quy tắc khi đang lọc ⇒ nạp lại ĐÚNG bộ lọc đang có', async () => {
    searchRules.mockResolvedValue(pageOf([TWO_WAY], 1));
    updateRule.mockResolvedValue({ ...TWO_WAY });
    const u = await renderManager();
    await u.type(qBox(), '#2');
    await waitForResult({ shown: [2], gone: [1, 3] });
    expect(searchRules).toHaveBeenCalledTimes(1);

    await u.click(screen.getByRole('button', { name: /^Sửa quy tắc #2\b/ }));
    const dlg = await screen.findByRole('dialog', { name: /Chỉnh sửa quy tắc macro/ });
    await u.click(within(dlg).getByRole('button', { name: 'Lưu quy tắc' }));
    await waitFor(() => expect(updateRule).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(searchRules).toHaveBeenCalledTimes(2));
    expect(searchRules).toHaveBeenLastCalledWith({ q: '#2', page: 1, limit: 50 });
    expect(getRules).toHaveBeenCalledTimes(1);
  });

  it('vùng chọn được GIỮ khi đổi bộ lọc (xoá hàng loạt gồm cả dòng của danh sách trước)', async () => {
    searchRules.mockResolvedValue(pageOf([rule({ id: 9 })], 1));
    bulkDelete.mockResolvedValue({ deleted: [1, 9], missing: [] });
    const u = await renderManager();
    await u.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #1\b/ }));
    await choose(u, 'Dịch vụ', 'Bao xe');
    await screen.findByTestId('rule-row-9');
    expect(screen.queryByTestId('rule-row-1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá đã chọn (1)' })).toBeInTheDocument();

    await u.click(screen.getByRole('checkbox', { name: /^Chọn quy tắc #9\b/ }));
    await u.click(screen.getByRole('button', { name: 'Xoá đã chọn (2)' }));
    await u.click(await screen.findByRole('button', { name: 'Xoá 2 quy tắc' }));
    await waitFor(() => expect(bulkDelete).toHaveBeenCalledTimes(1));
    expect(bulkDelete.mock.calls[0][0].slice().sort((a: number, b: number) => a - b)).toEqual([1, 9]);
  });

  describe('trạng thái điểm đặc biệt tới ô chọn điểm (zonesStatus)', () => {
    it('ĐANG tải ⇒ ô chọn điểm báo đang tải và KHÔNG tô sẵn dòng nào (Enter không tự chọn)', async () => {
      getZones.mockReturnValue(new Promise(() => {}));
      const u = await renderManager();
      await u.type(placeBox('Điểm đón'), 'dai tu');
      const option = await screen.findByRole('option', { name: 'Đại Từ, Thái Nguyên' });
      expect(placeHint('Điểm đón')).toHaveTextContent('Đang tải điểm đặc biệt (sân bay…)…');
      await sleep(30);
      expect(option).toHaveAttribute('aria-selected', 'false');
      await u.keyboard('{Enter}');
      expect(screen.queryByTestId('place-picker-chip-Điểm đón')).not.toBeInTheDocument();
    });

    it('LỖI ⇒ trang vẫn chạy; ô chọn điểm báo lỗi và KHÔNG tô sẵn dòng nào', async () => {
      getZones.mockRejectedValue(new Error('500'));
      const u = await renderManager();
      expect(ruleRows()).toHaveLength(3);
      await u.type(placeBox('Điểm đón'), 'dai tu');
      const option = await screen.findByRole('option', { name: 'Đại Từ, Thái Nguyên' });
      await waitFor(() => expect(placeHint('Điểm đón')).toHaveTextContent('Không tải được điểm đặc biệt (sân bay…)'));
      expect(option).toHaveAttribute('aria-selected', 'false');
      expect(toastMock).not.toHaveBeenCalled();
    });

    it('ĐÃ tải ⇒ tô sẵn dòng chắc chắn (Enter chọn được) và tìm được sân bay (ZONE:<mã>)', async () => {
      const u = await renderManager();
      await u.type(placeBox('Điểm đón'), 'dai tu');
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Đại Từ, Thái Nguyên' })).toHaveAttribute('aria-selected', 'true'),
      );
      expect(placeHint('Điểm đón')).not.toHaveTextContent(/điểm đặc biệt \(sân bay/);
      await u.keyboard('{Enter}');
      expect(searchRules).toHaveBeenLastCalledWith({ ...DAI_TU, cover: true, page: 1, limit: 50 });

      await u.type(placeBox('Điểm đến'), 'san bay noi bai');
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Sân bay Nội Bài, Hà Nội · điểm đặc biệt' })).toHaveAttribute(
          'aria-selected',
          'true',
        ),
      );
      await u.keyboard('{Enter}');
      expect(searchRules).toHaveBeenLastCalledWith({
        ...DAI_TU,
        destProvinceCode: '01',
        destWardCode: 'ZONE:NOIBAI',
        cover: true,
        page: 1,
        limit: 50,
      });
      expect(matchRules).toHaveBeenLastCalledWith({ ...DAI_TU, destProvinceCode: '01', destWardCode: 'ZONE:NOIBAI' });
    });
  });

  it('StrictMode (effect chạy hai lần): liên kết sâu, điểm đặc biệt «đã tải» (Enter tự chọn) và tô dòng thắng vẫn đúng', async () => {
    window.history.pushState({}, '', '/master-data?ruleId=12');
    searchRules.mockResolvedValue(pageOf([R13, R12, R5], 3));
    render(<PricingMacroManager />, { reactStrictMode: true });
    await screen.findByTestId('rule-row-13');
    expect(getRules).not.toHaveBeenCalled();
    expect(searchRules).toHaveBeenLastCalledWith({ q: '#12', page: 1, limit: 50 });
    expect(qBox()).toHaveValue('#12');

    const u = ue();
    await u.type(placeBox('Điểm đón'), 'dai tu');
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Đại Từ, Thái Nguyên' })).toHaveAttribute('aria-selected', 'true'),
    );
    await u.keyboard('{Enter}');
    await pickPlace(u, 'Điểm đến', 'cau giay', 'Cầu Giấy, Hà Nội');
    await waitFor(() => expect(winnerBadgeOf(13)).toBeInTheDocument());
    expect(searchRules).toHaveBeenLastCalledWith({ q: '#12', ...DAI_TU, ...CAU_GIAY, cover: true, page: 1, limit: 50 });
  });
});
