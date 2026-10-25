import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toastMock = vi.fn();
const bulkCreate = vi.fn();
const getWards = vi.fn();
const getZones = vi.fn();

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

// MultiSelectComboBox = Popover(modal) + cmdk. Lồng trong Dialog của Radix, hai FocusScope tranh nhau
// trong jsdom và vòng lặp vô hạn (không có trong trình duyệt thật). Thay bằng danh sách checkbox đơn giản:
// test này kiểm logic của hộp thoại (đếm, payload, kết quả), không kiểm cmdk — cmdk đã có test riêng.
vi.mock('@/components/ui/multi-select-combobox', () => ({
  MultiSelectComboBox: ({
    options,
    selectedValues,
    onSelectedValuesChange,
    placeholder,
    disabled,
  }: {
    options: { value: string; label: string }[];
    selectedValues: string[];
    onSelectedValuesChange: (v: string[]) => void;
    placeholder: string;
    disabled?: boolean;
  }) => (
    <fieldset disabled={disabled} aria-label="Chọn phường/xã">
      <legend>{placeholder}</legend>
      {options.map((o) => (
        <label key={o.value}>
          <input
            type="checkbox"
            aria-label={`Chọn ${o.label}`}
            checked={selectedValues.includes(o.value)}
            onChange={() =>
              onSelectedValuesChange(
                selectedValues.includes(o.value)
                  ? selectedValues.filter((v) => v !== o.value)
                  : [...selectedValues, o.value],
              )
            }
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  ),
}));
// Combobox (ô chọn tỉnh) cũng là Popover(modal) + cmdk nên mắc cùng lỗi lồng trong Dialog như trên. Thay bằng
// <select> thô: test này kiểm hộp thoại (mã tỉnh, "— Chọn tỉnh —" = bỏ chọn, nạp phường), còn việc lọc gõ không
// dấu của Combobox thật có test riêng ở src/components/ui/combobox.test.tsx. Nút "bấm lại" mô phỏng đúng hợp
// đồng thật: bấm lại mục đang chọn → onSelect(undefined).
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({
    ariaLabel,
    options,
    selectedValue,
    onSelect,
    placeholder,
    disabled,
  }: {
    ariaLabel?: string;
    options: { value: string; label: string }[];
    selectedValue?: string;
    onSelect: (v: string | undefined) => void;
    placeholder: string;
    disabled?: boolean;
  }) => (
    <span>
      <select
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
      <button type="button" aria-label={`bấm lại ${ariaLabel}`} onClick={() => onSelect(undefined)} />
    </span>
  ),
}));
vi.mock('@/lib/api', () => ({
  bulkCreatePricingMacroRules: (...a: unknown[]) => bulkCreate(...a),
  getPricingMacroWards: (...a: unknown[]) => getWards(...a),
  getSpecialZones: (...a: unknown[]) => getZones(...a),
}));

import { MacroBulkDialog } from './macro-bulk-dialog';

const PROVINCES = [
  { code: '01', name: 'Hà Nội' },
  { code: '33', name: 'Hưng Yên' },
];
const ZONES = [
  { code: 'NOIBAI', name: 'Sân bay Nội Bài', provinceCode: '01', provinceName: 'Hà Nội', kind: 'AIRPORT', active: true },
  { code: 'OLD', name: 'Vùng đã tắt', provinceCode: '01', provinceName: 'Hà Nội', kind: 'AIRPORT', active: false },
];
const HN_WARDS = [
  { code: '00160', name: 'Nghĩa Đô', provinceCode: '01' },
  { code: '00166', name: 'Cầu Giấy', provinceCode: '01' },
  { code: '00070', name: 'Hoàn Kiếm', provinceCode: '01' },
];

function manyWards(province: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({ code: `${province}${String(i).padStart(3, '0')}`, name: `Phường ${i}`, provinceCode: province }));
}

function setup(onDone = vi.fn()) {
  const onOpenChange = vi.fn();
  render(<MacroBulkDialog open onOpenChange={onOpenChange} provinces={PROVINCES} onDone={onDone} />);
  return { onDone, onOpenChange, user: userEvent.setup() };
}

async function pickProvince(user: ReturnType<typeof userEvent.setup>, side: 'Điểm đón' | 'Điểm trả', code: string) {
  await user.selectOptions(screen.getByLabelText(`${side}: tỉnh/thành`), code);
}

async function addWholeProvince(user: ReturnType<typeof userEvent.setup>, side: 'Điểm đón' | 'Điểm trả', code: string) {
  await pickProvince(user, side, code);
  await user.click(await screen.findByRole('button', { name: `${side}: Thêm cả tỉnh` }));
}

describe('MacroBulkDialog', () => {
  beforeEach(() => {
    toastMock.mockReset();
    bulkCreate.mockReset();
    getWards.mockReset();
    getZones.mockReset();
    getZones.mockResolvedValue(ZONES);
    getWards.mockImplementation(async (code: string) => (code === '01' ? HN_WARDS : manyWards(code, 3)));
  });

  it('ban đầu: chưa chọn điểm nào nên nút Tạo bị khoá và đếm báo phải chọn', () => {
    setup();
    expect(screen.getByTestId('bulk-count')).toHaveTextContent('Chọn ít nhất một điểm đón hoặc một điểm trả.');
    expect(screen.getByRole('button', { name: /^Tạo/ })).toBeDisabled();
  });

  it('chọn phường của Hà Nội + cả tỉnh Hưng Yên → đếm đúng, gửi đúng payload, hiện kết quả và gọi onDone', async () => {
    const { user, onDone } = setup();
    bulkCreate.mockResolvedValue({
      created: [
        { id: 1, name: 'HN-HY: Nghĩa Đô ↔ Hưng Yên', isBidirectional: true },
        { id: 2, name: 'HN-HY: Cầu Giấy ↔ Hưng Yên', isBidirectional: true },
      ],
      skipped: [
        {
          origin: { provinceCode: '01', wardCode: '00070' },
          dest: { provinceCode: '33' },
          reason: 'TRUNG_KHOA',
          message: 'x',
          blockedBy: { id: 11, name: 'Có sẵn', isActive: true, isBidirectional: false, adjustmentType: 'DELTA_AMOUNT', adjustmentValue: 70000 },
        },
      ],
    });

    // Điểm đón: Hà Nội, chọn 2 phường
    await pickProvince(user, 'Điểm đón', '01');
    await waitFor(() => expect(getWards).toHaveBeenCalledWith('01'));
    await user.click(await screen.findByLabelText('Chọn Nghĩa Đô'));
    await user.click(await screen.findByLabelText('Chọn Cầu Giấy'));
    await user.click(await screen.findByRole('button', { name: 'Điểm đón: Thêm 2 phường/xã' }));
    expect(screen.getByLabelText('Điểm đón: bỏ Nghĩa Đô (Hà Nội)')).toBeInTheDocument();
    expect(screen.getByLabelText('Điểm đón: bỏ Cầu Giấy (Hà Nội)')).toBeInTheDocument();

    // Điểm trả: cả tỉnh Hưng Yên
    await pickProvince(user, 'Điểm trả', '33');
    await user.click(await screen.findByRole('button', { name: 'Điểm trả: Thêm cả tỉnh' }));
    expect(screen.getByLabelText('Điểm trả: bỏ Cả tỉnh Hưng Yên')).toBeInTheDocument();

    // Mặc định HAI chiều (spec §5); bỏ tích thì thành một chiều, tích lại thì về hai chiều.
    const twoWay = screen.getByRole('checkbox', { name: /Áp dụng cả chiều ngược/ });
    expect(twoWay).toBeChecked();
    expect(screen.getByTestId('bulk-count')).toHaveTextContent('Sẽ tạo tối đa 2 quy tắc (mỗi quy tắc áp dụng cả hai chiều)');
    await user.click(twoWay);
    expect(screen.getByTestId('bulk-count')).toHaveTextContent('Sẽ tạo tối đa 2 quy tắc (chỉ chiều đón → trả)');
    await user.click(twoWay);
    expect(screen.getByTestId('bulk-count')).toHaveTextContent('Sẽ tạo tối đa 2 quy tắc (mỗi quy tắc áp dụng cả hai chiều)');

    await user.type(screen.getByLabelText(/^Giá trị/), '30000');
    const submit = screen.getByRole('button', { name: /^Tạo 2 quy tắc/ });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    expect(bulkCreate.mock.calls[0][0]).toEqual({
      isActive: true,
      priority: 0,
      serviceType: 'ALL',
      vehicleType: 'ALL',
      adjustmentType: 'DELTA_AMOUNT',
      adjustmentValue: 30000,
      applyPerSeat: true,
      isBidirectional: true,
      note: null,
      origins: [
        { provinceCode: '01', wardCode: '00160' },
        { provinceCode: '01', wardCode: '00166' },
      ],
      dests: [{ provinceCode: '33' }],
    });

    const result = await screen.findByTestId('bulk-result');
    expect(result).toHaveTextContent('Đã tạo 2 quy tắc · bỏ qua 1 tổ hợp');
    // Ô Hoàn Kiếm không nằm trong danh sách admin đã chọn nên nhãn rơi về mã (không bịa tên).
    expect(result).toHaveTextContent('Phường/xã 00070 → Cả tỉnh Hưng Yên');
    expect(result).toHaveTextContent('đã có quy tắc #11 "Có sẵn" (đang bật)');
    expect(within(result).queryByRole('alert')).not.toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('backend cũ bỏ qua hai chiều: các quy tắc tạo ra không có isBidirectional → cảnh báo đỏ', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({ created: [{ id: 1, name: 'a' }], skipped: [] });

    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    // Hai chiều là mặc định ⇒ không cần tích; backend cũ cắt field nên luật tạo ra không có isBidirectional.
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('chưa hỗ trợ quy tắc hai chiều');
  });

  it('mặc định HAI chiều: gửi isBidirectional=true, applyPerSeat=true; backend xác nhận thì KHÔNG cảnh báo', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({ created: [{ id: 1, name: 'a', isBidirectional: true }], skipped: [] });

    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));

    await screen.findByTestId('bulk-result');
    expect(bulkCreate.mock.calls[0][0]).toMatchObject({ isBidirectional: true, applyPerSeat: true });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('bỏ tích hai chiều → gửi isBidirectional=false và KHÔNG cảnh báo oan khi backend không trả field đó', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({ created: [{ id: 1, name: 'a' }], skipped: [] });

    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await user.click(screen.getByRole('checkbox', { name: /Áp dụng cả chiều ngược/ }));
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));

    await screen.findByTestId('bulk-result');
    expect(bulkCreate.mock.calls[0][0]).toMatchObject({ isBidirectional: false });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('không còn Giá sàn/Giá trần (backend từ chối) và ô "Nhân theo số ghế"; có thêm Ghi đè giá cố định', () => {
    setup();
    const select = screen.getByLabelText('Kiểu điều chỉnh') as HTMLSelectElement;
    const options = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['DELTA_AMOUNT', 'PERCENTAGE', 'FIXED_PRICE']);
    expect(screen.queryByRole('checkbox', { name: /Nhân theo số ghế/ })).not.toBeInTheDocument();
  });

  it('backend trả warnings: hộp kết quả liệt kê cảnh báo (vàng, không phải lỗi đỏ) và toast nêu số cảnh báo', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({
      created: [{ id: 1, name: 'a', isBidirectional: true }],
      skipped: [],
      warnings: [
        { code: 'XUNG_DOT_CUNG_CAP', ruleId: 9, message: 'Chồng phạm vi với quy tắc #9 nhưng khác mức.' },
        { code: 'RUT_GON', ruleId: null, message: 'Còn 3 cảnh báo khác.' },
      ],
    });
    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));

    const box = await screen.findByTestId('bulk-warnings');
    expect(box).toHaveTextContent('Chồng phạm vi với quy tắc #9 nhưng khác mức.');
    expect(box).toHaveTextContent('Còn 3 cảnh báo khác.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('2 cảnh báo') }),
    );
  });

  it('không còn ô tiền tố tên; yêu cầu gửi KHÔNG kèm namePrefix', async () => {
    setup();
    expect(screen.queryByLabelText(/Tiền tố tên quy tắc/)).not.toBeInTheDocument();
  });

  it('vượt 500 tổ hợp: báo lỗi và khoá nút Tạo', async () => {
    getWards.mockImplementation(async (code: string) => manyWards(code, 30));
    const { user } = setup();

    for (const [side, code] of [['Điểm đón', '01'], ['Điểm trả', '33']] as const) {
      await pickProvince(user, side, code);
      await waitFor(() => expect(getWards).toHaveBeenCalledWith(code));
      await user.click(await screen.findByRole('button', { name: `${side}: Chọn tất cả phường/xã (30)` }));
      await user.click(await screen.findByRole('button', { name: `${side}: Thêm 30 phường/xã` }));
    }
    // 30 × 30 = 900 > 500
    expect(screen.getByTestId('bulk-count')).toHaveTextContent('tối đa 500 quy tắc (đang chọn 900)');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    expect(screen.getByRole('button', { name: /^Tạo/ })).toBeDisabled();
  });

  it('giá trị ngoài biên (PERCENT 250) hiện lỗi và khoá nút Tạo; trong biên thì mở khoá', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.selectOptions(screen.getByLabelText('Kiểu điều chỉnh'), 'PERCENTAGE');
    await user.type(screen.getByLabelText(/^Giá trị/), '250');

    expect(screen.getByText(/Phần trăm phải từ -80% đến 200%/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tạo/ })).toBeDisabled();

    const input = screen.getByLabelText(/^Giá trị/);
    await user.clear(input);
    await user.type(input, '15');
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeEnabled();
  });

  it('lỗi từ máy chủ: toast đỏ, vẫn ở màn nhập (không mất dữ liệu), không gọi onDone', async () => {
    const { user, onDone } = setup();
    bulkCreate.mockRejectedValue(new Error('Mã tỉnh/thành không có trong dữ liệu ranh giới: 35.'));

    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(toastMock.mock.calls[0][0]).toMatchObject({ variant: 'destructive', title: 'Lỗi tạo hàng loạt' });
    expect(screen.queryByTestId('bulk-result')).not.toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('MỘT BÊN TRỐNG = MỌI NƠI: cảnh báo rõ, khoá nút Tạo tới khi tích xác nhận, rồi gửi origins/dests rỗng', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({ created: [{ id: 1, name: 'a', isBidirectional: false }], skipped: [] });

    // chỉ chọn cả tỉnh Hưng Yên bên TRẢ, bên ĐÓN để trống
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');

    const any = screen.getByTestId('bulk-any');
    expect(any).toHaveTextContent('MỌI ĐIỂM ĐÓN');
    expect(any).toHaveTextContent('toàn quốc');
    expect(any).toHaveTextContent('đến các điểm trả đã chọn từ BẤT KỲ đâu');
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /Tôi hiểu và muốn áp dụng cho MỌI điểm đón/ }));
    const submit = screen.getByRole('button', { name: /^Tạo 1 quy tắc/ });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    expect(bulkCreate.mock.calls[0][0]).toMatchObject({ origins: [], dests: [{ provinceCode: '33' }] });
  });

  it('xác nhận "mọi nơi" bị THU HỒI khi đổi danh sách điểm (phải xác nhận lại)', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    const ack = screen.getByRole('checkbox', { name: /Tôi hiểu và muốn áp dụng cho MỌI điểm đón/ });
    await user.click(ack);
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeEnabled();

    // thêm một điểm ĐÓN rồi bỏ đi → bên đón lại trống; xác nhận cũ không còn hiệu lực
    await addWholeProvince(user, 'Điểm đón', '01');
    expect(screen.queryByTestId('bulk-any')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Điểm đón: bỏ Cả tỉnh Hà Nội'));
    expect(screen.getByRole('checkbox', { name: /Tôi hiểu và muốn áp dụng cho MỌI điểm đón/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeDisabled();
  });

  it('sau khi tạo xong và bấm "Tạo thêm", xác nhận "mọi nơi" phải được tích lại', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({ created: [{ id: 1, name: 'a', isBidirectional: false }], skipped: [] });
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await user.click(screen.getByRole('checkbox', { name: /Tôi hiểu và muốn áp dụng cho MỌI điểm đón/ }));
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));
    await screen.findByTestId('bulk-result');

    await user.click(screen.getByRole('button', { name: 'Tạo thêm' }));
    // danh sách giữ nguyên (còn "Cả tỉnh Hưng Yên"), nhưng xác nhận cũ không còn hiệu lực
    expect(screen.getByRole('checkbox', { name: /Tôi hiểu và muốn áp dụng cho MỌI điểm đón/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeDisabled();
  });

  it('đổi hướng (hai chiều ↔ một chiều) làm đổi phạm vi ⇒ xác nhận "mọi nơi" đã tích phải bị thu hồi', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    const ack = screen.getByRole('checkbox', { name: /Tôi hiểu và muốn áp dụng cho MỌI điểm đón/ });
    await user.click(ack);
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: /Áp dụng cả chiều ngược/ }));
    expect(screen.getByRole('checkbox', { name: /Tôi hiểu và muốn áp dụng cho MỌI điểm đón/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeDisabled();
    // và tích lại thì tạo được
    await user.click(screen.getByRole('checkbox', { name: /Tôi hiểu và muốn áp dụng cho MỌI điểm đón/ }));
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeEnabled();
  });

  it('bỏ chip cuối / "Xoá danh sách" KHÔNG bị báo nhầm là lựa chọn đang chờ (không gợi ý nới thành cả tỉnh)', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm trả', '33');
    await pickProvince(user, 'Điểm đón', '01');
    await waitFor(() => expect(getWards).toHaveBeenCalledWith('01'));
    await user.click(await screen.findByLabelText('Chọn Nghĩa Đô'));
    await user.click(await screen.findByRole('button', { name: 'Điểm đón: Thêm 1 phường/xã' }));
    expect(screen.queryByTestId('bulk-pending')).not.toBeInTheDocument();

    // bỏ chip: ô tỉnh vẫn giữ Hà Nội nhưng đó không phải lựa chọn đang chờ
    await user.click(screen.getByLabelText('Điểm đón: bỏ Nghĩa Đô (Hà Nội)'));
    expect(screen.queryByTestId('bulk-pending')).not.toBeInTheDocument();
    // bên đón trống → chỉ còn yêu cầu xác nhận "mọi nơi"
    expect(screen.getByTestId('bulk-any')).toHaveTextContent('MỌI ĐIỂM ĐÓN');

    // "Xoá danh sách" cũng vậy
    await user.click(await screen.findByLabelText('Chọn Cầu Giấy'));
    await user.click(screen.getByRole('button', { name: 'Điểm đón: Thêm 1 phường/xã' }));
    await user.click(screen.getByRole('button', { name: 'Điểm đón: Xoá danh sách' }));
    expect(screen.queryByTestId('bulk-pending')).not.toBeInTheDocument();
  });

  it('chọn phường/tỉnh mà CHƯA bấm "Thêm": cảnh báo, khoá nút Tạo; bấm Thêm thì hết', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await addWholeProvince(user, 'Điểm trả', '33');

    // Điểm đón: chọn tỉnh + 2 phường nhưng KHÔNG bấm Thêm
    await pickProvince(user, 'Điểm đón', '01');
    await waitFor(() => expect(getWards).toHaveBeenCalledWith('01'));
    await user.click(await screen.findByLabelText('Chọn Nghĩa Đô'));
    await user.click(await screen.findByLabelText('Chọn Cầu Giấy'));

    const pending = screen.getByTestId('bulk-pending');
    expect(pending).toHaveTextContent('Điểm đón: đã chọn 2 phường/xã của Hà Nội');
    expect(pending).toHaveTextContent('KHÔNG được tạo');
    expect(screen.getByRole('button', { name: /^Tạo/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Điểm đón: Thêm 2 phường/xã' }));
    expect(screen.queryByTestId('bulk-pending')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tạo 2 quy tắc/ })).toBeEnabled();
  });

  it('cả hai bên đã có điểm nhưng còn phường chọn dở chưa Thêm → vẫn khoá (không bị bỏ rơi lặng lẽ)', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await addWholeProvince(user, 'Điểm trả', '33');
    // đón: thêm Nghĩa Đô trước, rồi chọn thêm Cầu Giấy nhưng quên bấm Thêm
    await pickProvince(user, 'Điểm đón', '01');
    await waitFor(() => expect(getWards).toHaveBeenCalledWith('01'));
    await user.click(await screen.findByLabelText('Chọn Nghĩa Đô'));
    await user.click(await screen.findByRole('button', { name: 'Điểm đón: Thêm 1 phường/xã' }));
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeEnabled();

    await user.click(await screen.findByLabelText('Chọn Cầu Giấy'));
    // không có cảnh báo "bên trống": chỉ còn cảnh báo lựa chọn chờ — và nút Tạo PHẢI khoá vì nó
    expect(screen.queryByTestId('bulk-any')).not.toBeInTheDocument();
    expect(screen.getByTestId('bulk-pending')).toHaveTextContent('đã chọn 1 phường/xã của Hà Nội');
    expect(screen.getByRole('button', { name: /^Tạo/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Điểm đón: Thêm 1 phường/xã' }));
    expect(screen.getByRole('button', { name: /^Tạo 2 quy tắc/ })).toBeEnabled();
  });

  it('đã chọn tỉnh nhưng chưa Thêm (danh sách chưa có điểm nào của tỉnh đó) → chờ; chọn lại "— Chọn tỉnh —" thì hết', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await addWholeProvince(user, 'Điểm trả', '33');
    await pickProvince(user, 'Điểm đón', '01'); // chỉ chọn tỉnh

    expect(screen.getByTestId('bulk-pending')).toHaveTextContent('đã chọn tỉnh Hà Nội nhưng chưa bấm «Thêm cả tỉnh»');
    expect(screen.getByRole('button', { name: /^Tạo/ })).toBeDisabled();

    await pickProvince(user, 'Điểm đón', ''); // bỏ chọn → không còn chờ
    expect(screen.queryByTestId('bulk-pending')).not.toBeInTheDocument();
  });

  it('ô tỉnh: "— Chọn tỉnh —" đứng đầu rồi tới các tỉnh; chọn tỉnh nạp phường của đúng tỉnh đó', async () => {
    const { user } = setup();
    const box = screen.getByLabelText('Điểm đón: tỉnh/thành') as HTMLSelectElement;
    expect(Array.from(box.options).map((o) => o.textContent)).toEqual(['— Chọn tỉnh —', 'Hà Nội', 'Hưng Yên']);
    expect(box.value).toBe('');

    await pickProvince(user, 'Điểm đón', '33');
    await waitFor(() => expect(getWards).toHaveBeenCalledWith('33'));
    expect(box.value).toBe('33');
    expect(screen.getByRole('button', { name: 'Điểm đón: Thêm cả tỉnh' })).toBeEnabled();
  });

  it('bấm lại tỉnh đang chọn (Combobox trả undefined) thì giữ tỉnh và phường đã chọn, không nạp lại', async () => {
    const { user } = setup();
    await pickProvince(user, 'Điểm đón', '01');
    await waitFor(() => expect(getWards).toHaveBeenCalledWith('01'));
    await user.click(await screen.findByLabelText('Chọn Nghĩa Đô'));

    await user.click(screen.getByRole('button', { name: 'bấm lại Điểm đón: tỉnh/thành' }));
    expect((screen.getByLabelText('Điểm đón: tỉnh/thành') as HTMLSelectElement).value).toBe('01');
    expect(screen.getByLabelText('Chọn Nghĩa Đô')).toBeChecked();
    expect(getWards).toHaveBeenCalledTimes(1);
  });

  it('sau khi đã Thêm, ô tỉnh còn giữ nguyên KHÔNG bị coi là đang chờ', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    expect(screen.queryByTestId('bulk-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bulk-any')).not.toBeInTheDocument();
  });

  it('tóm tắt trước khi tạo nêu số quy tắc, hai bên, hướng, mức điều chỉnh và trạng thái bật', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '30000');

    const sum = screen.getByTestId('bulk-summary');
    expect(sum).toHaveTextContent('1 quy tắc');
    expect(sum).toHaveTextContent('Đón: Cả tỉnh Hà Nội ↔ Trả: Cả tỉnh Hưng Yên');
    expect(sum).toHaveTextContent('hai chiều');
    expect(sum).toHaveTextContent('+30.000 đ/ghế');
    expect(sum).toHaveTextContent('BẬT ngay');

    await user.click(screen.getByRole('checkbox', { name: /Áp dụng cả chiều ngược/ }));
    await user.click(screen.getByRole('checkbox', { name: /Kích hoạt ngay/ }));
    expect(sum).toHaveTextContent('Đón: Cả tỉnh Hà Nội → Trả: Cả tỉnh Hưng Yên');
    expect(sum).toHaveTextContent('chỉ chiều đón → trả');
    expect(sum).toHaveTextContent('tạo ở trạng thái tắt');
  });

  it('đang gửi: nút Huỷ bị khoá và Esc không đóng hộp thoại (kẻo kết quả về đè lên form mở lại)', async () => {
    const { user, onOpenChange } = setup();
    let release!: (v: unknown) => void;
    bulkCreate.mockImplementation(() => new Promise((res) => { release = res; }));
    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));

    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();

    release({ created: [{ id: 1, name: 'a', isBidirectional: false }], skipped: [] });
    await screen.findByTestId('bulk-result');
    // xong rồi thì đóng được bình thường
    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ô giá trị PHẦN TRĂM cho số lẻ (step 0.01), loại tiền chỉ nguyên (step 1)', async () => {
    const { user } = setup();
    const input = screen.getByLabelText(/^Giá trị/);
    expect(input).toHaveAttribute('step', '1');
    await user.selectOptions(screen.getByLabelText('Kiểu điều chỉnh'), 'PERCENTAGE');
    expect(input).toHaveAttribute('step', '0.01');
    await user.type(input, '2.5');
    expect(screen.queryByText(/Phần trăm phải từ/)).not.toBeInTheDocument();
  });

  it('toast kết quả nêu cả hai lý do bỏ qua (trùng khoá hoặc lặp trong yêu cầu)', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({
      created: [],
      skipped: [
        { origin: { provinceCode: '01' }, dest: { provinceCode: '33' }, reason: 'TRUNG_TRONG_YEU_CAU', message: 'm', blockedBy: { id: null, name: 'n', isActive: true, isBidirectional: false, adjustmentType: 'DELTA_AMOUNT', adjustmentValue: 1 } },
      ],
    });
    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));

    await screen.findByTestId('bulk-result');
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('hoặc lặp trong yêu cầu') }),
    );
  });

  it('đổi tỉnh nhanh: chỉ nhận danh sách phường của lần chọn MỚI NHẤT (không lẫn phường tỉnh cũ)', async () => {
    let releaseHn!: (v: unknown) => void;
    getWards.mockImplementation((code: string) =>
      code === '01' ? new Promise((res) => { releaseHn = res; }) : Promise.resolve(manyWards(code, 2)),
    );
    const { user } = setup();
    await pickProvince(user, 'Điểm đón', '01'); // chậm
    await pickProvince(user, 'Điểm đón', '33'); // nhanh, mới hơn
    await waitFor(() => expect(getWards).toHaveBeenCalledWith('33'));
    releaseHn(HN_WARDS); // phản hồi CŨ về muộn
    await screen.findByRole('button', { name: 'Điểm đón: Chọn tất cả phường/xã (2)' });
    expect(screen.queryByRole('button', { name: 'Điểm đón: Chọn tất cả phường/xã (3)' })).not.toBeInTheDocument();
  });
});

describe('MacroBulkDialog — điểm đặc biệt', () => {
  beforeEach(() => {
    bulkCreate.mockReset();
    getWards.mockReset();
    getWards.mockImplementation(async (code: string) => (code === '01' ? HN_WARDS : manyWards(code, 3)));
    getZones.mockReset();
    getZones.mockResolvedValue(ZONES);
  });

  it('chỉ liệt kê điểm đặc biệt ĐANG BẬT; chọn sân bay + cả tỉnh Hưng Yên → payload có ZONE:NOIBAI kèm tỉnh vùng', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({ created: [{ id: 1, name: '', isBidirectional: true }], skipped: [] });
    const select = await screen.findByLabelText('Điểm trả: điểm đặc biệt');
    expect(within(select).queryByText('Vùng đã tắt')).not.toBeInTheDocument();
    await user.selectOptions(select, 'NOIBAI');
    await user.click(screen.getByRole('button', { name: 'Điểm trả: Thêm điểm đặc biệt' }));
    expect(screen.getByLabelText('Điểm trả: bỏ Sân bay Nội Bài (điểm đặc biệt)')).toBeInTheDocument();
    await addWholeProvince(user, 'Điểm đón', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '50000');
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    const p = bulkCreate.mock.calls[0][0];
    expect(p.origins).toEqual([{ provinceCode: '33' }]);
    expect(p.dests).toEqual([{ provinceCode: '01', wardCode: 'ZONE:NOIBAI' }]);
  });

  it('không cảnh báo đồng giá khi vùng ↔ tỉnh KHÁC; cảnh báo khi ↔ điểm cùng tỉnh vùng hoặc ↔ mọi nơi', async () => {
    const { user } = setup();
    const zoneSel = await screen.findByLabelText('Điểm trả: điểm đặc biệt');
    await user.selectOptions(zoneSel, 'NOIBAI');
    await user.click(screen.getByRole('button', { name: 'Điểm trả: Thêm điểm đặc biệt' }));
    // bên đón trống ⇒ mọi nơi ⇒ cảnh báo
    expect(screen.getByTestId('bulk-zone-warning')).toHaveTextContent('Sân bay Nội Bài');
    await addWholeProvince(user, 'Điểm đón', '33');
    expect(screen.queryByTestId('bulk-zone-warning')).not.toBeInTheDocument();
    await addWholeProvince(user, 'Điểm đón', '01');
    expect(screen.getByTestId('bulk-zone-warning')).toHaveTextContent('cùng tỉnh với vùng');
  });

  it('chọn tỉnh của vùng mà chưa bấm «Thêm cả tỉnh» vẫn bị báo dù đã có điểm đặc biệt cùng mã tỉnh', async () => {
    const { user } = setup();
    const zoneSel = await screen.findByLabelText('Điểm trả: điểm đặc biệt');
    await user.selectOptions(zoneSel, 'NOIBAI');
    await user.click(screen.getByRole('button', { name: 'Điểm trả: Thêm điểm đặc biệt' }));
    await pickProvince(user, 'Điểm trả', '01');
    expect(await screen.findByTestId('bulk-pending')).toHaveTextContent('chưa bấm «Thêm cả tỉnh»');
  });

  it('lỗi tải điểm đặc biệt: ẩn nhóm này, tạo theo tỉnh/xã vẫn dùng được', async () => {
    getZones.mockRejectedValue(new Error('x'));
    const { user } = setup();
    await waitFor(() => expect(getZones).toHaveBeenCalled());
    expect(screen.queryByLabelText('Điểm trả: điểm đặc biệt')).not.toBeInTheDocument();
    await addWholeProvince(user, 'Điểm đón', '33');
    expect(screen.getByLabelText('Điểm đón: bỏ Cả tỉnh Hưng Yên')).toBeInTheDocument();
  });
});

// Ô «Tìm nhanh» là ô nhập THƯỜNG + danh sách ARIA trong trang (không Popover/cmdk) nên chạy thật được ở đây, kể cả
// trong Dialog; chỉ Combobox/MultiSelectComboBox (ô chọn tỉnh/phường cũ) còn bị mock ở đầu file.
describe('MacroBulkDialog — ô «Tìm nhanh» (gõ tên là thêm, tìm xuyên tỉnh)', () => {
  const ALL_WARDS = [
    ...HN_WARDS,
    { code: '33010', name: 'Phố Hiến', provinceCode: '33' },
    { code: '33020', name: 'Nghĩa Đô', provinceCode: '33' }, // trùng tên với Nghĩa Đô của Hà Nội
  ];
  const quick = (side: 'Điểm đón' | 'Điểm trả') =>
    screen.getByRole('combobox', { name: `${side}: tìm nhanh phường/xã hoặc tỉnh` });
  const noArgCalls = () => getWards.mock.calls.filter((c) => c.length === 0);

  beforeEach(() => {
    toastMock.mockReset();
    bulkCreate.mockReset();
    getWards.mockReset();
    getWards.mockImplementation(async (code?: string) =>
      code ? (code === '01' ? HN_WARDS : manyWards(code, 3)) : ALL_WARDS,
    );
    getZones.mockReset();
    getZones.mockResolvedValue(ZONES);
  });

  it('mở hộp thoại KHÔNG tự focus vào ô tìm (tránh bật bàn phím ảo) và chưa nạp danh sách xã', async () => {
    setup();
    await waitFor(() => expect(getZones).toHaveBeenCalled());
    expect(quick('Điểm đón')).not.toHaveFocus();
    expect(quick('Điểm trả')).not.toHaveFocus();
    expect(screen.getByRole('dialog')).toHaveFocus();
    expect(getWards).not.toHaveBeenCalled();
  });

  it('danh sách mọi xã nạp MỘT lần ở lần focus đầu tiên, dùng chung cho cả hai bên', async () => {
    const { user } = setup();
    await user.click(quick('Điểm đón'));
    await waitFor(() => expect(noArgCalls()).toHaveLength(1));
    await user.click(quick('Điểm trả'));
    await user.type(quick('Điểm trả'), 'cau giay');
    await screen.findByRole('option', { name: /Cầu Giấy/ });
    expect(noArgCalls()).toHaveLength(1);
  });

  it('gõ không dấu rồi chọn: thành điểm trả, payload gửi đúng mã tỉnh + mã xã', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({ created: [{ id: 1, name: '', isBidirectional: true }], skipped: [] });
    await addWholeProvince(user, 'Điểm đón', '33');
    await user.type(quick('Điểm trả'), 'cau giay');
    await user.click(await screen.findByRole('option', { name: /Cầu Giấy/ }));
    expect(screen.getByLabelText('Điểm trả: bỏ Cầu Giấy (Hà Nội)')).toBeInTheDocument();
    expect(quick('Điểm trả')).toHaveValue('');
    expect(screen.queryByTestId('bulk-pending')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Giá trị/), '30000');
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    expect(bulkCreate.mock.calls[0][0]).toMatchObject({
      origins: [{ provinceCode: '33' }],
      dests: [{ provinceCode: '01', wardCode: '00166' }],
    });
  });

  it('hai xã trùng tên ở hai tỉnh: chọn đúng xã của tỉnh đã bấm (mã xã + mã tỉnh)', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({ created: [{ id: 1, name: '', isBidirectional: true }], skipped: [] });
    await addWholeProvince(user, 'Điểm đón', '01');
    await user.type(quick('Điểm trả'), 'nghia do');
    const options = await screen.findAllByRole('option', { name: /Nghĩa Đô/ });
    expect(options.map((o) => o.textContent)).toEqual(['Nghĩa ĐôHà Nội', 'Nghĩa ĐôHưng Yên']);
    await user.click(options[1]);
    expect(screen.getByLabelText('Điểm trả: bỏ Nghĩa Đô (Hưng Yên)')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Giá trị/), '1000');
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    expect(bulkCreate.mock.calls[0][0].dests).toEqual([{ provinceCode: '33', wardCode: '33020' }]);
  });

  it('«Cả tỉnh» chọn được từ ô tìm', async () => {
    const { user } = setup();
    await user.type(quick('Điểm đón'), 'hung yen');
    await user.click(await screen.findByRole('option', { name: /Cả tỉnh Hưng Yên/ }));
    expect(screen.getByLabelText('Điểm đón: bỏ Cả tỉnh Hưng Yên')).toBeInTheDocument();
  });

  it('sân bay (điểm đặc biệt) tìm được từ ô này: payload có ZONE:NOIBAI kèm tỉnh vùng', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({ created: [{ id: 1, name: '', isBidirectional: true }], skipped: [] });
    await addWholeProvince(user, 'Điểm đón', '33');
    await user.type(quick('Điểm trả'), 'noi bai');
    // Phải khoanh vùng danh sách kết quả: <select> điểm đặc biệt (mock) cũng có <option> cùng tên.
    const list = await screen.findByRole('listbox', { name: 'Điểm trả: kết quả tìm nhanh' });
    await user.click(within(list).getByRole('option', { name: /Sân bay Nội Bài/ }));
    await user.type(screen.getByLabelText(/^Giá trị/), '1000');
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));
    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    expect(bulkCreate.mock.calls[0][0].dests).toEqual([{ provinceCode: '01', wardCode: 'ZONE:NOIBAI' }]);
  });

  it('gõ dở mà chưa chọn kết quả: báo chờ và KHOÁ nút Tạo (không để bên đó lặng lẽ thành mọi nơi); xoá ô thì hết', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm đón', '33');
    await addWholeProvince(user, 'Điểm trả', '01');
    await user.type(screen.getByLabelText(/^Giá trị/), '30000');
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeEnabled();

    await user.type(quick('Điểm đón'), 'cau');
    const pending = await screen.findByTestId('bulk-pending');
    expect(pending).toHaveTextContent('Điểm đón: đang gõ ở ô «Tìm nhanh» mà chưa chọn kết quả nào');
    expect(pending).toHaveTextContent('Lựa chọn chưa được thêm vào danh sách sẽ KHÔNG được tạo thành quy tắc');
    // Câu này nằm trong vùng thông báo (aria-live): không được lặp chữ đang gõ (đổi theo từng phím làm trình đọc màn hình
    // bị ngắt) và cũng không được là role=alert (hiện ngay từ phím đầu tiên, đọc xen ngang sẽ át kết quả đang đọc).
    expect(pending).not.toHaveTextContent('cau');
    expect(pending).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Điểm đón: xoá ô tìm nhanh' }));
    expect(screen.queryByTestId('bulk-pending')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeEnabled();
  });

  it('chữ gõ dở và tỉnh đã chọn chưa «Thêm» cùng một bên: báo cái trước, xử lý xong thì hiện cái còn lại', async () => {
    const { user } = setup();
    await pickProvince(user, 'Điểm trả', '01');
    await user.type(quick('Điểm trả'), 'dai');
    expect(await screen.findByTestId('bulk-pending')).toHaveTextContent('đã chọn tỉnh Hà Nội nhưng chưa bấm «Thêm cả tỉnh»');
    await user.click(screen.getByRole('button', { name: 'Điểm trả: Thêm cả tỉnh' }));
    expect(await screen.findByTestId('bulk-pending')).toHaveTextContent('Điểm trả: đang gõ ở ô «Tìm nhanh»');
  });

  it('Esc trong ô tìm đang có chữ chỉ xoá chữ (không mất điểm đã chọn); Esc lần nữa khi ô trống mới đóng hộp thoại', async () => {
    const { user, onOpenChange } = setup();
    await addWholeProvince(user, 'Điểm đón', '33');
    await user.type(quick('Điểm trả'), 'dai');
    await user.keyboard('{Escape}');
    expect(quick('Điểm trả')).toHaveValue('');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Điểm đón: bỏ Cả tỉnh Hưng Yên')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Enter trong ô tìm thêm kết quả CHẮC CHẮN (nguyên tên, duy nhất) và KHÔNG gửi form tạo quy tắc (dù form đã hợp lệ)', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm đón', '33');
    await addWholeProvince(user, 'Điểm trả', '01');
    await user.type(screen.getByLabelText(/^Giá trị/), '30000');
    await user.type(quick('Điểm trả'), 'hoan kiem{Enter}');
    expect(screen.getByLabelText('Điểm trả: bỏ Hoàn Kiếm (Hà Nội)')).toBeInTheDocument();
    // THÊM vào danh sách chứ không thay cả danh sách: chip «Cả tỉnh Hà Nội» đã có từ trước vẫn còn.
    expect(screen.getByLabelText('Điểm trả: bỏ Cả tỉnh Hà Nội')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-count')).toHaveTextContent('Sẽ tạo tối đa 2 quy tắc');
    expect(bulkCreate).not.toHaveBeenCalled();
  });

  it('thêm trùng với xã đã thêm bằng ô tỉnh/xã: không nhân đôi và báo đã có', async () => {
    const { user } = setup();
    await pickProvince(user, 'Điểm trả', '01');
    await waitFor(() => expect(getWards).toHaveBeenCalledWith('01'));
    await user.click(await screen.findByLabelText('Chọn Cầu Giấy'));
    await user.click(await screen.findByRole('button', { name: 'Điểm trả: Thêm 1 phường/xã' }));
    await user.type(quick('Điểm trả'), 'cau giay');
    const opt = await screen.findByRole('option', { name: /Cầu Giấy/ });
    expect(opt).toHaveTextContent('đã thêm');
    await user.click(opt);
    expect(screen.getAllByLabelText('Điểm trả: bỏ Cầu Giấy (Hà Nội)')).toHaveLength(1);
    expect(screen.getByText('«Cầu Giấy (Hà Nội)» đã có trong danh sách.')).toBeInTheDocument();
  });

  it('nạp danh sách xã lỗi: báo ngay ở ô tìm, cách chọn khác vẫn dùng được, focus lại thì thử lại', async () => {
    getWards.mockReset();
    getWards.mockRejectedValueOnce(new Error('Mất kết nối'));
    getWards.mockImplementation(async (code?: string) => (code ? manyWards(code, 3) : ALL_WARDS));
    const { user } = setup();
    await user.click(quick('Điểm trả'));
    await user.type(quick('Điểm trả'), 'cau giay');
    const box = await screen.findByTestId('quick-add-Điểm trả');
    expect(await within(box).findByTestId('quick-add-wards-error-Điểm trả')).toHaveTextContent(
      'Không tải được danh sách phường/xã (Mất kết nối)',
    );
    // Điểm đón cũng dùng chung danh sách xã nên cũng báo (mỗi ô một khối, không chồng lên nhau).
    expect(screen.getByTestId('quick-add-wards-error-Điểm đón')).toBeInTheDocument();

    await addWholeProvince(user, 'Điểm đón', '33'); // ô tỉnh/xã cũ không bị ảnh hưởng
    expect(screen.getByLabelText('Điểm đón: bỏ Cả tỉnh Hưng Yên')).toBeInTheDocument();

    await user.click(screen.getByLabelText(/^Giá trị/)); // rời ô tìm
    await user.click(quick('Điểm trả')); // focus lại ⇒ thử lại
    expect(await screen.findByRole('option', { name: /Cầu Giấy/ })).toBeInTheDocument();
    expect(noArgCalls()).toHaveLength(2);
  });

  it('focus cả hai ô trong lúc danh sách xã còn đang nạp: chỉ gọi API MỘT lần, về là cả hai dùng được', async () => {
    let release!: (w: unknown) => void;
    getWards.mockImplementation((code?: string) =>
      code
        ? Promise.resolve(manyWards(code, 3))
        : new Promise((res) => {
            release = res;
          }),
    );
    const { user } = setup();
    await user.click(quick('Điểm đón'));
    await user.click(quick('Điểm trả'));
    expect(noArgCalls()).toHaveLength(1);

    await user.type(quick('Điểm trả'), 'cau giay');
    const hint = await screen.findByTestId('quick-add-hint-Điểm trả');
    expect(hint).toHaveTextContent('Đang tải danh sách phường/xã');
    expect(hint).not.toHaveTextContent('Không có kết quả');

    await act(async () => release(ALL_WARDS));
    expect(await screen.findByRole('option', { name: /Cầu Giấy/ })).toBeInTheDocument();
    expect(noArgCalls()).toHaveLength(1);
  });

  it('điểm đặc biệt về SAU danh sách xã vẫn tìm thấy (chỉ mục dựng lại khi danh sách điểm đặc biệt đổi)', async () => {
    let releaseZones!: (z: unknown) => void;
    getZones.mockImplementation(
      () =>
        new Promise((res) => {
          releaseZones = res;
        }),
    );
    const { user } = setup();
    await user.click(quick('Điểm trả'));
    await user.type(quick('Điểm trả'), 'noi bai');
    // Xã đã về nhưng sân bay thì chưa: chưa có kết quả, và KHÔNG được kết luận «Không có kết quả» khi dữ liệu còn thiếu.
    const hint = screen.getByTestId('quick-add-hint-Điểm trả');
    await waitFor(() => expect(hint).toHaveTextContent('Đang tải điểm đặc biệt'));
    expect(hint).not.toHaveTextContent('Không có kết quả');

    await act(async () => releaseZones(ZONES));
    const list = await screen.findByRole('listbox', { name: 'Điểm trả: kết quả tìm nhanh' });
    const airport = within(list).getByRole('option', { name: /Sân bay Nội Bài/ });
    // Dữ liệu đủ rồi, sân bay là kết quả duy nhất khớp nguyên tên (bí danh «Nội Bài») ⇒ được tô sẵn.
    expect(airport).toHaveAttribute('aria-selected', 'true');
  });

  it('điểm đặc biệt CHƯA về: kết quả khớp nguyên tên duy nhất vẫn không được tô/Enter không thêm (sân bay cùng tên có thể sắp về); về xong thì tô', async () => {
    let releaseZones!: (z: unknown) => void;
    getZones.mockImplementation(
      () =>
        new Promise((res) => {
          releaseZones = res;
        }),
    );
    const { user } = setup();
    await user.type(quick('Điểm trả'), 'hoan kiem');
    const list = await screen.findByRole('listbox', { name: 'Điểm trả: kết quả tìm nhanh' });
    await waitFor(() => expect(screen.getByTestId('quick-add-hint-Điểm trả')).toHaveTextContent('Đang tải điểm đặc biệt'));
    expect(within(list).getAllByRole('option').map((o) => o.getAttribute('aria-selected'))).toEqual(['false']);
    await user.keyboard('{Enter}');
    expect(screen.queryByLabelText(/^Điểm trả: bỏ Hoàn Kiếm/)).not.toBeInTheDocument();
    expect(quick('Điểm trả')).toHaveValue('hoan kiem');

    await act(async () => releaseZones(ZONES));
    await waitFor(() =>
      expect(within(screen.getByRole('listbox', { name: 'Điểm trả: kết quả tìm nhanh' })).getByRole('option', { name: /Hoàn Kiếm/ })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Điểm trả: bỏ Hoàn Kiếm (Hà Nội)')).toBeInTheDocument();
  });

  it('CẢ HAI bên (Điểm đón và Điểm trả) đều chờ điểm đặc biệt về mới tự chọn; về xong thì cả hai tô sẵn', async () => {
    let releaseZones!: (z: unknown) => void;
    getZones.mockImplementation(
      () =>
        new Promise((res) => {
          releaseZones = res;
        }),
    );
    const { user } = setup();
    const selected = (side: 'Điểm đón' | 'Điểm trả') =>
      within(screen.getByRole('listbox', { name: `${side}: kết quả tìm nhanh` }))
        .getAllByRole('option')
        .map((o) => o.getAttribute('aria-selected'));
    await user.type(quick('Điểm đón'), 'hoan kiem');
    await user.type(quick('Điểm trả'), 'hoan kiem');
    await waitFor(() => expect(screen.getByTestId('quick-add-hint-Điểm đón')).toHaveTextContent('Đang tải điểm đặc biệt'));
    expect(screen.getByTestId('quick-add-hint-Điểm trả')).toHaveTextContent('Đang tải điểm đặc biệt');
    expect(selected('Điểm đón')).toEqual(['false']);
    expect(selected('Điểm trả')).toEqual(['false']);

    await act(async () => releaseZones(ZONES));
    await waitFor(() => expect(selected('Điểm đón')).toEqual(['true']));
    expect(selected('Điểm trả')).toEqual(['true']);
  });

  it('lỗi tải điểm đặc biệt: ô tìm báo rõ, Enter không tự chọn, bấm dòng vẫn thêm được', async () => {
    getZones.mockRejectedValue(new Error('x'));
    const { user } = setup();
    await user.type(quick('Điểm trả'), 'hoan kiem');
    expect(await screen.findByTestId('quick-add-zones-error-Điểm trả')).toHaveTextContent('Không tải được điểm đặc biệt');
    const list = screen.getByRole('listbox', { name: 'Điểm trả: kết quả tìm nhanh' });
    expect(within(list).getAllByRole('option').map((o) => o.getAttribute('aria-selected'))).toEqual(['false']);
    await user.keyboard('{Enter}');
    expect(screen.queryByLabelText(/^Điểm trả: bỏ Hoàn Kiếm/)).not.toBeInTheDocument();
    await user.click(within(list).getByRole('option', { name: /Hoàn Kiếm/ }));
    expect(screen.getByLabelText('Điểm trả: bỏ Hoàn Kiếm (Hà Nội)')).toBeInTheDocument();
  });

  it('nút «Thử tải lại» ở khối báo lỗi: nạp lại danh sách xã, khối lỗi biến mất, tìm được ngay', async () => {
    getWards.mockReset();
    getWards.mockRejectedValueOnce(new Error('Mất kết nối'));
    getWards.mockImplementation(async (code?: string) => (code ? manyWards(code, 3) : ALL_WARDS));
    const { user } = setup();
    await user.click(quick('Điểm trả'));
    const retry = await within(await screen.findByTestId('quick-add-wards-error-Điểm trả')).findByRole('button', { name: 'Thử tải lại' });
    await user.click(retry);
    await waitFor(() => expect(noArgCalls()).toHaveLength(2));
    await waitFor(() => expect(screen.queryByTestId('quick-add-wards-error-Điểm trả')).not.toBeInTheDocument());
    expect(screen.queryByTestId('quick-add-wards-error-Điểm đón')).not.toBeInTheDocument();
    expect(quick('Điểm trả')).toHaveFocus();
    await user.type(quick('Điểm trả'), 'cau giay');
    expect(await screen.findByRole('option', { name: /Cầu Giấy/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('máy có CHUỘT (pointer: fine): mở hộp thoại là focus thẳng ô «Tìm nhanh» của Điểm đón (và nạp danh sách xã)', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === '(pointer: fine)', media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      setup();
      await waitFor(() => expect(quick('Điểm đón')).toHaveFocus());
      await waitFor(() => expect(noArgCalls()).toHaveLength(1));
      expect(screen.getByRole('dialog')).not.toHaveFocus();
    } finally {
      window.matchMedia = original;
    }
  });

  it('hai xã trùng tên: Enter KHÔNG thêm gì (kẻo thêm nhầm tỉnh); ↓ rồi Enter thêm đúng dòng đầu', async () => {
    const { user } = setup();
    await user.type(quick('Điểm trả'), 'nghia do');
    const list = await screen.findByRole('listbox', { name: 'Điểm trả: kết quả tìm nhanh' });
    expect(within(list).getAllByRole('option').map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'false']);
    await user.keyboard('{Enter}');
    expect(screen.queryByLabelText(/^Điểm trả: bỏ Nghĩa Đô/)).not.toBeInTheDocument();
    expect(quick('Điểm trả')).toHaveValue('nghia do');
    expect(screen.getByTestId('bulk-pending')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByLabelText('Điểm trả: bỏ Nghĩa Đô (Hà Nội)')).toBeInTheDocument();
  });

  it('danh sách xã trả về RỖNG (backend nuốt lỗi DB): coi là lỗi, báo rõ, và lần focus sau thử lại (không cache)', async () => {
    getWards.mockReset();
    getWards.mockResolvedValueOnce([]);
    getWards.mockImplementation(async (code?: string) => (code ? manyWards(code, 3) : ALL_WARDS));
    const { user } = setup();
    await user.click(quick('Điểm trả'));
    const box = await screen.findByTestId('quick-add-Điểm trả');
    expect(await within(box).findByTestId('quick-add-wards-error-Điểm trả')).toHaveTextContent('danh sách rỗng');
    await user.type(quick('Điểm trả'), 'cau giay');
    expect(screen.getByTestId('quick-add-hint-Điểm trả')).not.toHaveTextContent('Không có kết quả');

    await user.click(screen.getByLabelText(/^Giá trị/));
    await user.click(quick('Điểm trả'));
    expect(await screen.findByRole('option', { name: /Cầu Giấy/ })).toBeInTheDocument();
    expect(noArgCalls()).toHaveLength(2);
  });

  it('hai bên cùng gõ dở: nêu bên Điểm đón trước; xoá một bên thì bên kia VẪN chặn nút Tạo', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm đón', '33');
    await addWholeProvince(user, 'Điểm trả', '01');
    await user.type(screen.getByLabelText(/^Giá trị/), '30000');
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeEnabled();

    await user.type(quick('Điểm trả'), 'cau');
    await user.type(quick('Điểm đón'), 'hoan');
    expect(screen.getByTestId('bulk-pending')).toHaveTextContent('Điểm đón: đang gõ ở ô «Tìm nhanh»');
    await user.click(screen.getByRole('button', { name: 'Điểm đón: xoá ô tìm nhanh' }));
    expect(screen.getByTestId('bulk-pending')).toHaveTextContent('Điểm trả: đang gõ ở ô «Tìm nhanh»');
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Điểm trả: xoá ô tìm nhanh' }));
    expect(screen.queryByTestId('bulk-pending')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeEnabled();
  });

  it('mới gõ 1 ký tự (chưa đủ để tìm) vẫn chặn nút Tạo', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm đón', '33');
    await addWholeProvince(user, 'Điểm trả', '01');
    await user.type(screen.getByLabelText(/^Giá trị/), '30000');
    await user.type(quick('Điểm trả'), 'd');
    expect(screen.getByTestId('bulk-pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeDisabled();
  });
});

