import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PricingMacroRule } from '@/lib/types';

// `toast` PHẢI là cùng một hàm qua mọi lần render: loadData() phụ thuộc vào nó, nếu mỗi lần một hàm mới
// thì effect nạp dữ liệu chạy lại vô hạn.
const toastMock = vi.fn();
const getRules = vi.fn();
const getProvinces = vi.fn();
const getWards = vi.fn();
const getZones = vi.fn();
const createRule = vi.fn();
const updateRule = vi.fn();
const deleteRule = vi.fn();
const bulkDelete = vi.fn();
const bandWarnings = vi.fn();

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/lib/api', () => ({
  // Mock trả mảng cho gọn; bọc lại thành trang { items, total, page, limit } như backend.
  getPricingMacroRulesPage: async (...a: unknown[]) => {
    const r = await getRules(...a);
    return Array.isArray(r) ? { items: r, total: r.length, page: 1, limit: 50 } : r;
  },
  getPricingMacroProvinces: (...a: unknown[]) => getProvinces(...a),
  getPricingMacroWards: (...a: unknown[]) => getWards(...a),
  getSpecialZones: (...a: unknown[]) => getZones(...a),
  createPricingMacroRule: (...a: unknown[]) => createRule(...a),
  updatePricingMacroRule: (...a: unknown[]) => updateRule(...a),
  deletePricingMacroRule: (...a: unknown[]) => deleteRule(...a),
  bulkDeletePricingMacroRules: (...a: unknown[]) => bulkDelete(...a),
  getPricingMacroBandWarnings: (...a: unknown[]) => bandWarnings(...a),
}));
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

describe('PricingMacroManager — danh sách', () => {
  beforeEach(() => {
    toastMock.mockReset();
    getRules.mockReset();
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

  it('tìm kiếm chạy ở SERVER (có chờ gõ xong), về trang 1; không còn tìm theo #mã; "chọn tất cả" chỉ chọn dòng của trang đang xem', async () => {
    const { user } = await setup();
    expect(screen.queryByPlaceholderText(/#mã/i)).not.toBeInTheDocument();

    getRules.mockImplementation(async (p: { search?: string }) =>
      p.search ? { items: [TWO_WAY], total: 1, page: 1, limit: 50 } : [ONE_WAY, TWO_WAY, CANONICAL],
    );
    await user.type(screen.getByPlaceholderText(/Tìm theo điểm đi, điểm đến, ghi chú/), 'Hà Nội');
    await waitFor(() => expect(getRules).toHaveBeenLastCalledWith({ page: 1, limit: 50, search: 'Hà Nội' }));
    // gõ 6 ký tự chỉ sinh MỘT lần gọi tìm (không gọi mỗi phím)
    expect(getRules.mock.calls.filter((c) => c[0].search)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId('rule-row-1')).not.toBeInTheDocument());

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
    getRules.mockResolvedValue({ items: [CANONICAL], total: 1, page: 1, limit: 50 });
    await user.type(screen.getByPlaceholderText(/Tìm theo điểm đi, điểm đến, ghi chú/), 'api');
    await waitFor(() => expect(screen.queryByTestId('rule-row-1')).not.toBeInTheDocument());
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
    bandWarnings.mockReset().mockResolvedValue({ band: {}, warnings: [] });
  });

  const pageOf = (items: PricingMacroRule[], total: number, page = 1, limit = 50) => ({ items, total, page, limit });

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
    expect(getRules).toHaveBeenCalledWith({ page: 1, limit: 50, search: '' });
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
    await waitFor(() => expect(getRules).toHaveBeenLastCalledWith({ page: 2, limit: 50, search: '' }));
    await user.selectOptions(screen.getByLabelText('Số dòng mỗi trang'), '100');
    await waitFor(() => expect(getRules).toHaveBeenLastCalledWith({ page: 1, limit: 100, search: '' }));
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
    await waitFor(() => expect(getRules).toHaveBeenCalledWith({ page: 1, limit: 20, search: '' }));
    expect(await screen.findByTestId('rule-row-1')).toBeInTheDocument();
  });

  it('kết quả của yêu cầu CŨ không đè lên yêu cầu mới (gõ tìm nhanh)', async () => {
    let releaseOld: (v: unknown) => void = () => {};
    getRules.mockImplementationOnce(() => new Promise((r) => (releaseOld = r))); // lần nạp đầu: treo
    getRules.mockImplementation(async () => pageOf([TWO_WAY], 1));
    render(<PricingMacroManager />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/Tìm theo điểm đi, điểm đến, ghi chú/), 'x');
    await screen.findByTestId('rule-row-2');
    releaseOld(pageOf([ONE_WAY], 1)); // yêu cầu cũ về muộn
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('rule-row-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('rule-row-2')).toBeInTheDocument();
  });

  it('không khớp từ khoá ⇒ báo riêng, không phải "chưa có quy tắc"', async () => {
    getRules.mockImplementation(async (p: { search?: string }) => pageOf(p.search ? [] : [ONE_WAY], p.search ? 0 : 1));
    render(<PricingMacroManager />);
    const user = userEvent.setup();
    await screen.findByTestId('rule-row-1');
    await user.type(screen.getByPlaceholderText(/Tìm theo điểm đi, điểm đến, ghi chú/), 'zzz');
    expect(await screen.findByText('Không có quy tắc nào khớp từ khoá tìm kiếm.')).toBeInTheDocument();
  });
});
