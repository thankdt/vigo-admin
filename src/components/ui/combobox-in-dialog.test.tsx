import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog';
import { Combobox } from './combobox';

// Lỗi PROD: mở Combobox trong Dialog, ô "Tìm tỉnh" không nhận focus/ký tự (focus bị Dialog kéo lại).
const OPTIONS = [
  { value: '01', label: 'Hà Nội' },
  { value: '33', label: 'Hưng Yên' },
];

function Harness() {
  const [v, setV] = React.useState<string | undefined>();
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Tạo</DialogTitle>
        <DialogDescription>mô tả</DialogDescription>
        <Combobox
          ariaLabel="Tỉnh"
          options={OPTIONS}
          selectedValue={v}
          onSelect={setV}
          placeholder="— Chọn tỉnh —"
          searchPlaceholder="Tìm tỉnh..."
          noResultsText="Không có"
        />
      </DialogContent>
    </Dialog>
  );
}

describe('Combobox trong Dialog', () => {
  it('gõ được vào ô tìm kiếm và lọc không dấu', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: 'Tỉnh' }));
    const input = await screen.findByPlaceholderText('Tìm tỉnh...');
    await user.click(input);
    expect(input).toHaveFocus();
    await user.keyboard('hung');
    expect(input).toHaveValue('hung');
    expect(screen.queryByText('Hà Nội')).toBeNull();
    expect(screen.getByText('Hưng Yên')).toBeTruthy();
  });
});
