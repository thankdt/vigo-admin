import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MultiSelectComboBox } from './multi-select-combobox';

describe('MultiSelectComboBox', () => {
  it('renders every item when multiple share the same label across groups', async () => {
    // Real scenario: "Huyện Châu Thành" exists in ~11 ĐBSCL provinces.
    // Regression for cmdk dedup-by-value behavior — items with identical `value`
    // collide in cmdk's internal store and disappear from the dropdown.
    const user = userEvent.setup();
    const options = [
      { label: 'Tiền Giang', options: [{ value: '1', label: 'Huyện Châu Thành' }] },
      { label: 'Long An', options: [{ value: '2', label: 'Huyện Châu Thành' }] },
      { label: 'Bến Tre', options: [{ value: '3', label: 'Huyện Châu Thành' }] },
    ];

    render(
      <MultiSelectComboBox
        options={options}
        selectedValues={[]}
        onSelectedValuesChange={() => {}}
        placeholder="Chọn huyện..."
        searchPlaceholder="Tìm..."
        noResultsText="Không tìm thấy"
      />
    );

    await user.click(screen.getByRole('combobox'));

    const items = await screen.findAllByRole('option');
    expect(items).toHaveLength(3);
  });

  it('selects each duplicate-labeled item by its own value', async () => {
    const user = userEvent.setup();
    const selected: string[][] = [];
    const options = [
      { label: 'Tiền Giang', options: [{ value: '1', label: 'Huyện Châu Thành' }] },
      { label: 'Long An', options: [{ value: '2', label: 'Huyện Châu Thành' }] },
    ];

    render(
      <MultiSelectComboBox
        options={options}
        selectedValues={[]}
        onSelectedValuesChange={(v) => selected.push(v)}
        placeholder="Chọn huyện..."
        searchPlaceholder="Tìm..."
        noResultsText="Không tìm thấy"
      />
    );

    await user.click(screen.getByRole('combobox'));
    const items = await screen.findAllByRole('option');
    await user.click(items[1]);

    expect(selected.at(-1)).toEqual(['2']);
  });

  it('gõ không dấu vẫn tìm ra mục có dấu ("son dong" → "Sơn Đồng", "ha noi" → "Hà Nội")', async () => {
    const user = userEvent.setup();
    const options = [
      { value: '1', label: 'Sơn Đồng' },
      { value: '2', label: 'Cầu Giấy' },
      { value: '3', label: 'Hà Nội' },
    ];

    render(
      <MultiSelectComboBox
        options={options}
        selectedValues={[]}
        onSelectedValuesChange={() => {}}
        placeholder="Chọn..."
        searchPlaceholder="Tìm..."
        noResultsText="Không tìm thấy"
      />
    );

    await user.click(screen.getByRole('combobox'));
    await user.type(await screen.findByPlaceholderText('Tìm...'), 'son dong');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Sơn Đồng']);

    await user.clear(screen.getByPlaceholderText('Tìm...'));
    await user.type(screen.getByPlaceholderText('Tìm...'), 'ha noi');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Hà Nội']);
  });
});
