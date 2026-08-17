'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ExternalLink, Loader2, Save, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SystemConfig } from '@/lib/types';
import { MAP_STYLE_KEY_RE, normalizeConfigValue, validateConfigValue } from './config-value-validate';
import { boolToConfigValue, isBooleanConfigValue, parseBooleanConfigValue } from './config-boolean';

// URL bản đồ được trả qua endpoint PUBLIC `GET /master-data/app/config`, nên khoá
// nhúng trong query string coi như đã công khai. Cảnh báo để người vận hành không
// dán nhầm khoá bí mật vào đây.
const API_KEY_IN_URL_RE = /(apikey|api_key)=/i;

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
  // Chỉ key *_MAP_STYLE_URL mới có validate/hint/mở-thử. Mọi row khác giữ nguyên
  // hành vi cũ — `isMapStyle` false ⇒ không render thêm gì, layout không đổi.
  const isMapStyle = MAP_STYLE_KEY_RE.test(config.key);
  // Cờ bật/tắt ⇒ nút gạt thay ô gõ (gõ "true"/"false" bằng bàn phím tiếng Việt rất
  // dễ ra chuỗi sai mà backend đọc thành TẮT). Nhận diện theo `config.value` —
  // snapshot SERVER, không phải `value` đang sửa — để ô không nhảy qua lại giữa
  // nút gạt và ô text trong lúc thao tác. `!isMapStyle` chỉ là chốt phòng thân:
  // URL bản đồ giữ nguyên ô text kể cả khi ai đó lỡ ghi "false" vào.
  const isBoolean = !isMapStyle && isBooleanConfigValue(config.value);
  const checked = parseBooleanConfigValue(value);
  const error = isMapStyle ? validateConfigValue(config.key, value) : null;
  const isEmpty = isMapStyle && value.trim() === '';
  const canOpen = isMapStyle && !error && !isEmpty;
  const hasApiKey = isMapStyle && API_KEY_IN_URL_RE.test(value);
  const errorId = `${config.key}-error`;

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
        {isBoolean ? (
          // Gạt CHỈ ghi vào state `edits` — vẫn phải bấm Lưu (nút của row hoặc
          // "Lưu tất cả") mới gọi API, y hệt khi gõ text.
          <div className="flex h-8 items-center gap-2">
            <Switch
              checked={checked}
              onCheckedChange={(on) => onChange(boolToConfigValue(on))}
              disabled={saving}
              aria-label={`Bật/tắt ${config.key}`}
            />
            {/* Nhãn chữ để đọc trạng thái không phải đoán theo màu. */}
            <span
              className={cn(
                'text-sm font-medium',
                checked ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {checked ? 'Bật' : 'Tắt'}
            </span>
          </div>
        ) : (
          // aria-invalid dùng undefined (không phải false) để ~150 row config khác
          // giữ nguyên DOM như trước thay đổi này.
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={saving}
            className={cn(
              'h-8 w-full',
              error && 'border-destructive focus-visible:ring-destructive',
            )}
            aria-label={`Giá trị ${config.key}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        )}
        {error && (
          // Không dùng role="alert": message đổi theo TỪNG phím gõ, screen reader
          // sẽ đọc liên tục. aria-describedby ở trên đã đủ để đọc khi focus vào ô.
          <p id={errorId} className="mt-1 break-words text-xs text-destructive">
            {error}
          </p>
        )}
        {isEmpty && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
            Để trống: app sẽ dùng bản đồ mặc định cài sẵn.
          </p>
        )}
        {canOpen && (
          <a
            // href dùng chuỗi đã chuẩn hoá — value có thể còn space đầu/cuối (hợp
            // lệ, backend tự trim) và ta không muốn nhét khoảng trắng vào href.
            href={normalizeConfigValue(config.key, value)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
          >
            <ExternalLink className="h-3 w-3" />
            Mở thử
          </a>
        )}
        {hasApiKey && (
          <p className="mt-1 break-words text-xs text-muted-foreground">
            URL này được trả qua endpoint công khai — coi như khoá đã công khai.
          </p>
        )}
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
              disabled={saving || !!error}
              aria-busy={saving}
              title={error ? 'Giá trị không hợp lệ — sửa trước khi lưu' : 'Lưu ô này'}
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
