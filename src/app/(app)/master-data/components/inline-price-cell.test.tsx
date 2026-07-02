import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlinePriceCell, parsePrice, formatPriceInput } from './inline-price-cell';

describe('parsePrice / formatPriceInput', () => {
  it('parses digit strings and vi-VN grouped strings', () => {
    expect(parsePrice('250000')).toBe(250000);
    expect(parsePrice('250.000')).toBe(250000);
    expect(parsePrice('1.234.567')).toBe(1234567);
    expect(parsePrice('0')).toBe(0);
  });

  it('returns null for empty / non-numeric input', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('   ')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
  });

  it('formats a number with vi-VN thousand separators', () => {
    expect(formatPriceInput(250000)).toBe('250.000');
    expect(formatPriceInput(0)).toBe('0');
    expect(formatPriceInput(1234567)).toBe('1.234.567');
  });
});

describe('InlinePriceCell', () => {
  it('renders the current price formatted in a textbox', () => {
    render(<InlinePriceCell value={250000} onSave={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('250.000');
  });

  it('saves the new parsed value on Enter when changed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InlinePriceCell value={250000} onSave={onSave} />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '300000');
    await user.keyboard('{Enter}');

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(300000);
  });

  it('saves on blur when changed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InlinePriceCell value={250000} onSave={onSave} />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '180000');
    await user.tab(); // blur

    expect(onSave).toHaveBeenCalledWith(180000);
  });

  it('does NOT save when the value is unchanged', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InlinePriceCell value={250000} onSave={onSave} />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '250000'); // same value, different formatting
    await user.keyboard('{Enter}');

    expect(onSave).not.toHaveBeenCalled();
  });

  it('reverts and does not save on Escape', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<InlinePriceCell value={250000} onSave={onSave} />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '999000');
    await user.keyboard('{Escape}');

    expect(onSave).not.toHaveBeenCalled();
    expect(input).toHaveValue('250.000');
  });

  it('reverts to the original value when the save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<InlinePriceCell value={250000} onSave={onSave} />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '300000');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(input).toHaveValue('250.000'));
  });

  it('does not bubble clicks to a parent row handler (stopPropagation)', async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={onRowClick}>
        <InlinePriceCell value={250000} onSave={vi.fn()} />
      </div>,
    );

    await user.click(screen.getByRole('textbox'));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
