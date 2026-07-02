'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Strip everything but digits → number; null for empty / non-numeric input. */
export function parsePrice(input: string): number | null {
  const digits = input.replace(/[^\d]/g, '');
  if (digits === '') return null;
  return Number(digits);
}

/** Format a number with vi-VN thousand separators (e.g. 250000 → "250.000"). */
export function formatPriceInput(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

/**
 * Inline-editable price field. Saves on Enter/blur when the value actually
 * changed; Escape reverts; reverts on save failure. Stops click propagation so
 * editing the price doesn't trigger the row's "open dialog" handler.
 */
export function InlinePriceCell({
  value,
  onSave,
  className,
}: {
  value: number;
  onSave: (price: number) => Promise<void>;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(() => formatPriceInput(value));
  const [saving, setSaving] = React.useState(false);
  const committingRef = React.useRef(false); // guard Enter→blur double-commit
  const cancelRef = React.useRef(false); // Escape: blur must not save

  // Re-sync when the parent updates the price (after a successful save / refresh).
  React.useEffect(() => {
    setDraft(formatPriceInput(value));
  }, [value]);

  const revert = React.useCallback(() => setDraft(formatPriceInput(value)), [value]);

  const commit = async () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      revert();
      return;
    }
    if (committingRef.current) return;
    const parsed = parsePrice(draft);
    if (parsed == null || parsed === value) {
      revert(); // invalid or unchanged → no-op
      return;
    }
    committingRef.current = true;
    setSaving(true);
    try {
      await onSave(parsed);
      // parent bumps `value` on success → effect re-syncs the draft
    } catch {
      revert();
    } finally {
      setSaving(false);
      committingRef.current = false;
    }
  };

  return (
    <div
      className={cn('relative inline-flex items-center', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        inputMode="numeric"
        value={draft}
        aria-label="Giá"
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelRef.current = true;
            revert();
            e.currentTarget.blur();
          }
        }}
        onBlur={commit}
        className="h-8 w-32 pr-8 text-right tabular-nums"
      />
      <span className="pointer-events-none absolute right-2 text-xs text-muted-foreground">
        {saving ? '' : '₫'}
      </span>
      {saving && (
        <Loader2 className="pointer-events-none absolute right-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
