import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from './dropdown-menu';

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  (window.HTMLElement.prototype as any).hasPointerCapture = vi.fn();
  (window.HTMLElement.prototype as any).releasePointerCapture = vi.fn();
});

function renderMenu(onSelect = vi.fn()) {
  return render(
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button">Mở menu</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => onSelect('copy')}>Copy pass</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect('cancel')}>Đã hủy</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={false} onSelect={() => onSelect('check')}>
          Đánh dấu
        </DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value="a">
          <DropdownMenuRadioItem value="a" onSelect={() => onSelect('radio')}>
            Lựa chọn A
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe('DropdownMenu touch scroll guard', () => {
  it('KHÔNG mở menu khi chạm touch pointerDown (lúc bắt đầu vuốt), nhưng vẫn mở khi hoàn tất chạm thật (click)', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Mở menu' });

    // Bắt đầu vuốt từ nút trigger -> chỉ có pointerDown (touch), không có click
    fireEvent.pointerDown(trigger, { pointerType: 'touch', button: 0 });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Nếu trình duyệt hủy chạm do cuộn (pointerCancel) -> vẫn đóng
    fireEvent.pointerCancel(trigger, { pointerType: 'touch' });
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Nếu ngón tay trượt > 10px trên chính nút trigger rồi mới nhả -> không mở menu
    fireEvent.pointerDown(trigger, { pointerType: 'touch', button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(trigger, { pointerType: 'touch', clientX: 10, clientY: 28 });
    fireEvent.pointerUp(trigger, { pointerType: 'touch', button: 0, clientX: 10, clientY: 28 });
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Chạm thật: pointerDown (touch) -> pointerUp (touch) -> click -> mở menu
    fireEvent.pointerDown(trigger, { pointerType: 'touch', button: 0 });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.pointerUp(trigger, { pointerType: 'touch', button: 0 });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('vẫn mở menu tức thì bằng chuột (mouse) và bàn phím không bị double-toggle', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Mở menu' });

    await user.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();

    // Đóng rồi mở lại bằng bàn phím Enter
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });

  it('KHÔNG chọn nhầm mục khi thả ngón tay (touch pointerUp) sau khi vuốt ngang qua menu đang mở; chỉ chọn khi tap thật (click)', async () => {
    const onSelect = vi.fn();
    renderMenu(onSelect);
    const trigger = screen.getByRole('button', { name: 'Mở menu' });

    // Mở menu bằng chạm thật
    fireEvent.pointerDown(trigger, { pointerType: 'touch', button: 0 });
    fireEvent.pointerUp(trigger, { pointerType: 'touch', button: 0 });
    fireEvent.click(trigger);

    const cancelItem = await screen.findByRole('menuitem', { name: 'Đã hủy' });
    const checkboxItem = screen.getByRole('menuitemcheckbox', { name: 'Đánh dấu' });
    const radioItem = screen.getByRole('menuitemradio', { name: 'Lựa chọn A' });

    // Thả ngón tay (pointerUp touch) mà không pointerDown/click vào item (giống vuốt từ trên xuống rồi nhả)
    fireEvent.pointerUp(cancelItem, { pointerType: 'touch', button: 0 });
    fireEvent.pointerUp(checkboxItem, { pointerType: 'touch', button: 0 });
    fireEvent.pointerUp(radioItem, { pointerType: 'touch', button: 0 });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Tap thật vào item -> chọn bình thường
    fireEvent.pointerDown(cancelItem, { pointerType: 'touch', button: 0 });
    fireEvent.pointerUp(cancelItem, { pointerType: 'touch', button: 0 });
    fireEvent.click(cancelItem);
    expect(onSelect).toHaveBeenCalledWith('cancel');
  });

  it('vẫn giữ cơ chế kéo-thả bằng chuột trên desktop (mouse pointerUp chọn được mục)', async () => {
    const onSelect = vi.fn();
    renderMenu(onSelect);
    const trigger = screen.getByRole('button', { name: 'Mở menu' });

    fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0 });
    const copyItem = await screen.findByRole('menuitem', { name: 'Copy pass' });

    fireEvent.pointerUp(copyItem, { pointerType: 'mouse', button: 0 });
    expect(onSelect).toHaveBeenCalledWith('copy');
  });
});
