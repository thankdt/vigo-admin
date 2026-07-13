'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SystemConfig } from '@/lib/types';

// Shared grid template so the header row and every field row line up on desktop.
// Fixed 96px actions track (NOT `auto`): each row is its OWN grid container, so an
// `auto` last track would size to content (0px on clean rows, button-width on dirty
// rows) and the leading columns would resolve to different widths → columns drift.
// A fixed width makes all same-width grids resolve identical tracks. `minmax(0,…)`
// lets the flexible tracks shrink so long mono keys don't force horizontal overflow.
export const CONFIG_GRID =
  'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(180px,240px)_96px] gap-1.5 md:gap-3 md:items-center';

export function ConfigFieldRow({
  config,
  value,
  dirty,
  saving,
  onChange,
  onSave,
  onRevert,
}: {
  config: SystemConfig;
  value: string;
  dirty: boolean;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onRevert: () => void;
}) {
  return (
    <div
      className={cn(
        CONFIG_GRID,
        // Mobile: each field is a bordered card. Desktop: flatten into a table-like
        // row separated by a bottom border.
        'rounded-lg border px-3 py-3 md:rounded-none md:border-0 md:border-b md:px-2 md:py-2 md:last:border-b-0',
        dirty &&
          'bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-950/30 dark:ring-amber-800 md:ring-0',
      )}
    >
      {/* Khóa — min-w-0 + break-all so a long mono key shrinks instead of overflowing */}
      <div className="min-w-0 break-all font-mono text-sm">
        {config.key}
        {dirty && (
          <span className="ml-2 whitespace-nowrap align-middle font-sans text-xs font-medium text-amber-600 dark:text-amber-500">
            ● đã đổi
          </span>
        )}
      </div>

      {/* Mô tả */}
      <div className="min-w-0 break-words text-sm text-muted-foreground">
        {config.description}
      </div>

      {/* Giá trị — always full width so the value is visible on every screen size */}
      <div className="min-w-0">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={saving}
          className="h-8 w-full"
          aria-label={`Giá trị ${config.key}`}
        />
      </div>

      {/* Hành động — chỉ hiện khi field đã đổi */}
      <div className="flex items-center gap-1 md:justify-end">
        {dirty && (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={onRevert}
              disabled={saving}
              title="Hoàn tác ô này"
              aria-label={`Hoàn tác ${config.key}`}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onSave}
              disabled={saving}
              aria-busy={saving}
              title="Lưu ô này"
              aria-label={`Lưu ${config.key}`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
