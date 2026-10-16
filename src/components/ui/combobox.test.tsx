import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox } from './combobox';

const PROVINCES = [
  { value: '__ALL__', label: 'Toàn quốc (Bất kỳ)' },
  { value: '01', label: 'Hà Nội' },
  { value: '33', label: 'Hưng Yên' },
  { value: '48', label: 'Đà Nẵng' },
];

const WARDS = [
  { value: '__ALL__', label: 'Toàn bộ tỉnh (Mọi xã)' },
  { value: '00001', label: 'Sơn Đồng' },
  { value: '00002', label: 'Cầu Giấy' },
  { value: '00003', label: 'Hoàng Mai' },
];

function Harness({
  options,
  initial,
  onSelect,
  disabled,
}: {
  options: { value: string; label: string }[];
  initial?: string;
  onSelect?: (v: string | undefined) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = React.useState<string | undefined>(initial);
  return (
    <Combobox
      id="pick"
      ariaLabel="Chọn thử"
      options={options}
      selectedValue={value}
      onSelect={(v) => {
        onSelect?.(v);
        setValue(v);
      }}
      placeholder="Chọn..."
      searchPlaceholder="Tìm..."
      noResultsText="Không tìm thấy"
      disabled={disabled}
    />
  );
}

describe('Combobox — tìm không dấu trong danh sách tỉnh / xã', () => {
  it('gõ "ha noi" (không dấu) chỉ còn Hà Nội; gõ "da nang" ra Đà Nẵng', async () => {
    const user = userEvent.setup();
    render(<Harness options={PROVINCES} />);
    await user.click(screen.getByRole('combobox', { name: 'Chọn thử' }));
    expect(await screen.findAllByRole('option')).toHaveLength(4);

    await user.type(screen.getByPlaceholderText('Tìm...'), 'ha noi');
    const left = screen.getAllByRole('option').map((o) => o.textContent);
    expect(left).toContain('Hà Nội');
    expect(left).not.toContain('Hưng Yên');
    expect(left).not.toContain('Đà Nẵng');

    await user.clear(screen.getByPlaceholderText('Tìm...'));
    await user.type(screen.getByPlaceholderText('Tìm...'), 'da nang');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Đà Nẵng']);
  });

  it('xã: gõ "son dong" khớp "Sơn Đồng"; không có gì khớp thì hiện câu "không tìm thấy"', async () => {
    const user = userEvent.setup();
    render(<Harness options={WARDS} />);
    await user.click(screen.getByRole('combobox', { name: 'Chọn thử' }));

    await user.type(screen.getByPlaceholderText('Tìm...'), 'son dong');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Sơn Đồng']);

    await user.clear(screen.getByPlaceholderText('Tìm...'));
    await user.type(screen.getByPlaceholderText('Tìm...'), 'zzzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Không tìm thấy')).toBeInTheDocument();
  });

  it('chọn mục: gọi onSelect với đúng mã và nút hiện nhãn của mục; mục "tất cả" đứng đầu', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness options={PROVINCES} onSelect={onSelect} />);
    expect(screen.getByRole('combobox', { name: 'Chọn thử' })).toHaveTextContent('Chọn...');

    await user.click(screen.getByRole('combobox', { name: 'Chọn thử' }));
    const opts = await screen.findAllByRole('option');
    expect(opts[0]).toHaveTextContent('Toàn quốc (Bất kỳ)');

    await user.click(screen.getByRole('option', { name: 'Hưng Yên' }));
    expect(onSelect).toHaveBeenLastCalledWith('33');
    expect(screen.getByRole('combobox', { name: 'Chọn thử' })).toHaveTextContent('Hưng Yên');
  });

  it('mục "tất cả" chọn được như mục thường (mã __ALL__)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness options={WARDS} initial="00001" onSelect={onSelect} />);
    await user.click(screen.getByRole('combobox', { name: 'Chọn thử' }));
    await user.click(await screen.findByRole('option', { name: 'Toàn bộ tỉnh (Mọi xã)' }));
    expect(onSelect).toHaveBeenLastCalledWith('__ALL__');
  });

  it('bấm lại mục đang chọn trả undefined (nơi gọi phải bỏ qua nếu không muốn bỏ chọn)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness options={PROVINCES} initial="01" onSelect={onSelect} />);
    await user.click(screen.getByRole('combobox', { name: 'Chọn thử' }));
    await user.click(await screen.findByRole('option', { name: 'Hà Nội' }));
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });

  it('id và ariaLabel đi vào nút; disabled thì không mở được', async () => {
    const user = userEvent.setup();
    render(<Harness options={WARDS} disabled />);
    const trigger = screen.getByRole('combobox', { name: 'Chọn thử' });
    expect(trigger).toHaveAttribute('id', 'pick');
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});
