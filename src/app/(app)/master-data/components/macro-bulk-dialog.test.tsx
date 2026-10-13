import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toastMock = vi.fn();
const bulkCreate = vi.fn();
const getWards = vi.fn();

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
vi.mock('@/lib/api', () => ({
  bulkCreatePricingMacroRules: (...a: unknown[]) => bulkCreate(...a),
  getPricingMacroWards: (...a: unknown[]) => getWards(...a),
}));

import { MacroBulkDialog } from './macro-bulk-dialog';

const PROVINCES = [
  { code: '01', name: 'Hà Nội' },
  { code: '33', name: 'Hưng Yên' },
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

    // Mặc định MỘT chiều; tích "cả chiều ngược" thì đổi sang hai chiều.
    const twoWay = screen.getByRole('checkbox', { name: /Áp dụng cả chiều ngược/ });
    expect(twoWay).not.toBeChecked();
    expect(screen.getByTestId('bulk-count')).toHaveTextContent('Sẽ tạo tối đa 2 quy tắc (chỉ chiều đón → trả)');
    await user.click(twoWay);
    expect(screen.getByTestId('bulk-count')).toHaveTextContent('Sẽ tạo tối đa 2 quy tắc (mỗi quy tắc áp dụng cả hai chiều)');

    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'HN-HY');
    await user.type(screen.getByLabelText(/^Giá trị/), '30000');
    const submit = screen.getByRole('button', { name: /^Tạo 2 quy tắc/ });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(bulkCreate).toHaveBeenCalledTimes(1));
    expect(bulkCreate.mock.calls[0][0]).toEqual({
      namePrefix: 'HN-HY',
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
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await user.click(screen.getByRole('checkbox', { name: /Áp dụng cả chiều ngược/ }));
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('chưa hỗ trợ quy tắc hai chiều');
  });

  it('mặc định MỘT chiều: gửi isBidirectional=false và KHÔNG cảnh báo oan khi backend không trả field đó', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({ created: [{ id: 1, name: 'a' }], skipped: [] });

    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));

    await screen.findByTestId('bulk-result');
    expect(bulkCreate.mock.calls[0][0]).toMatchObject({ isBidirectional: false });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tiền tố quá dài: báo ngay dưới ô nhập và khoá nút Tạo', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    fireEvent.change(screen.getByLabelText(/Tiền tố tên quy tắc/), { target: { value: 'A'.repeat(61) } });

    expect(screen.getByText(/Tiền tố tối đa 60 ký tự/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tạo/ })).toBeDisabled();
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
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    expect(screen.getByRole('button', { name: /^Tạo/ })).toBeDisabled();
  });

  it('giá trị ngoài biên (PERCENT 250) hiện lỗi và khoá nút Tạo; trong biên thì mở khoá', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
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
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(toastMock.mock.calls[0][0]).toMatchObject({ variant: 'destructive', title: 'Lỗi tạo hàng loạt' });
    expect(screen.queryByTestId('bulk-result')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Tiền tố tên quy tắc/)).toHaveValue('X');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('MỘT BÊN TRỐNG = MỌI NƠI: cảnh báo rõ, khoá nút Tạo tới khi tích xác nhận, rồi gửi origins/dests rỗng', async () => {
    const { user } = setup();
    bulkCreate.mockResolvedValue({ created: [{ id: 1, name: 'a', isBidirectional: false }], skipped: [] });

    // chỉ chọn cả tỉnh Hưng Yên bên TRẢ, bên ĐÓN để trống
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
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
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
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
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await user.click(screen.getByRole('checkbox', { name: /Tôi hiểu và muốn áp dụng cho MỌI điểm đón/ }));
    await user.click(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ }));
    await screen.findByTestId('bulk-result');

    await user.click(screen.getByRole('button', { name: 'Tạo thêm' }));
    // danh sách giữ nguyên (còn "Cả tỉnh Hưng Yên"), nhưng xác nhận cũ không còn hiệu lực
    expect(screen.getByRole('checkbox', { name: /Tôi hiểu và muốn áp dụng cho MỌI điểm đón/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /^Tạo 1 quy tắc/ })).toBeDisabled();
  });

  it('bật "hai chiều" làm phạm vi rộng gấp đôi ⇒ xác nhận "mọi nơi" đã tích phải bị thu hồi', async () => {
    const { user } = setup();
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
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
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
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
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
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
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
    await user.type(screen.getByLabelText(/^Giá trị/), '10000');
    await addWholeProvince(user, 'Điểm trả', '33');
    await pickProvince(user, 'Điểm đón', '01'); // chỉ chọn tỉnh

    expect(screen.getByTestId('bulk-pending')).toHaveTextContent('đã chọn tỉnh Hà Nội nhưng chưa bấm «Thêm cả tỉnh»');
    expect(screen.getByRole('button', { name: /^Tạo/ })).toBeDisabled();

    await pickProvince(user, 'Điểm đón', ''); // bỏ chọn → không còn chờ
    expect(screen.queryByTestId('bulk-pending')).not.toBeInTheDocument();
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
    expect(sum).toHaveTextContent('Đón: Cả tỉnh Hà Nội → Trả: Cả tỉnh Hưng Yên');
    expect(sum).toHaveTextContent('chỉ chiều đón → trả');
    expect(sum).toHaveTextContent('+30.000 đ/ghế');
    expect(sum).toHaveTextContent('BẬT ngay');

    await user.click(screen.getByRole('checkbox', { name: /Áp dụng cả chiều ngược/ }));
    await user.click(screen.getByRole('checkbox', { name: /Kích hoạt ngay/ }));
    expect(sum).toHaveTextContent('Đón: Cả tỉnh Hà Nội ↔ Trả: Cả tỉnh Hưng Yên');
    expect(sum).toHaveTextContent('hai chiều');
    expect(sum).toHaveTextContent('tạo ở trạng thái tắt');
  });

  it('đang gửi: nút Huỷ bị khoá và Esc không đóng hộp thoại (kẻo kết quả về đè lên form mở lại)', async () => {
    const { user, onOpenChange } = setup();
    let release!: (v: unknown) => void;
    bulkCreate.mockImplementation(() => new Promise((res) => { release = res; }));
    await addWholeProvince(user, 'Điểm đón', '01');
    await addWholeProvince(user, 'Điểm trả', '33');
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
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
    await user.type(screen.getByLabelText(/Tiền tố tên quy tắc/), 'X');
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
