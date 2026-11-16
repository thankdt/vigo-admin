import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './dialog';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from './sheet';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { Combobox } from './combobox';
import { MultiSelectComboBox } from './multi-select-combobox';

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

  it('MultiSelectComboBox và Popover bên trong SheetContent không làm đóng Sheet hoặc mất focus khi bấm vào danh sách portaled', async () => {
    const user = userEvent.setup();
    function SheetHarness() {
      const [open, setOpen] = React.useState(true);
      const [vals, setVals] = React.useState<string[]>([]);
      return (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent>
            <SheetTitle>Chi tiết tài xế</SheetTitle>
            <SheetDescription>Phân công tỉnh</SheetDescription>
            <MultiSelectComboBox
              options={[
                { label: 'Miền Bắc', options: [{ value: '01', label: 'Phường Trung Tâm' }] },
                { label: 'Miền Nam', options: [{ value: '79', label: 'Phường Trung Tâm' }] },
              ]}
              selectedValues={vals}
              onSelectedValuesChange={setVals}
              placeholder="Chọn tỉnh"
              searchPlaceholder="Tìm tỉnh..."
              noResultsText="Không có"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Ghi chú nhanh</Button>
              </PopoverTrigger>
              <PopoverContent>
                <Button type="button">Lưu ghi chú</Button>
              </PopoverContent>
            </Popover>
          </SheetContent>
        </Sheet>
      );
    }

    render(<SheetHarness />);
    await user.click(screen.getByRole('combobox'));
    const input = await screen.findByPlaceholderText('Tìm tỉnh...');
    await user.click(input);
    expect(input).toHaveFocus();
    await user.keyboard('trung tam');
    const matches = screen.getAllByText('Phường Trung Tâm');
    expect(matches).toHaveLength(2);
    await user.click(matches[1]);
    // Chọn đúng mục thứ 2 mà không làm trùng khoá nhóm hay đóng Sheet
    await user.keyboard('{Escape}');
    expect(screen.getByText('Chi tiết tài xế')).toBeTruthy();

    // Mở Popover không-modal bên trong Sheet rồi bấm nút trong PopoverContent -> Sheet vẫn mở
    await user.click(screen.getByRole('button', { name: 'Ghi chú nhanh' }));
    await user.click(await screen.findByRole('button', { name: 'Lưu ghi chú' }));
    expect(screen.getByText('Chi tiết tài xế')).toBeTruthy();
  });
});
