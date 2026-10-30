'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { serviceLabel, vehicleLabel } from '@/lib/macro-bulk';
import { EMPTY_FILTERS, hasActiveFilters, type MacroSearchFilters } from '@/lib/macro-search';
import type { SearchTarget } from '@/lib/ward-search';
import { cn } from '@/lib/utils';
import { MacroPlacePicker } from './macro-place-picker';
import type { WardsStatus, ZonesStatus } from './ward-quick-add';

/** Giá trị "tất cả" của các ô chọn: Select của Radix không nhận chuỗi rỗng làm giá trị một mục. */
const ALL = '__all__';

const SERVICE_VALUES = ['CARPOOL', 'RIDE'] as const;
const VEHICLE_VALUES = ['CAR_4', 'CAR_7'] as const;
const ACTIVE_VALUES = ['true', 'false'] as const;

/** Giá trị ô chọn → giá trị bộ lọc: "tất cả" hoặc giá trị lạ ⇒ ''. */
function fromSelect<T extends string>(v: string, allowed: readonly T[]): T | '' {
  return (allowed as readonly string[]).includes(v) ? (v as T) : '';
}

const TRIGGER = 'h-9 w-[calc(50%-0.25rem)] text-xs sm:w-40';

export type MacroSearchBarProps = {
  value: MacroSearchFilters;
  onChange: (next: MacroSearchFilters) => void;
  index: SearchTarget[];
  wardsStatus: WardsStatus;
  wardsError: string | null;
  zonesStatus: ZonesStatus;
  onNeedWards: () => void;
};

/**
 * Thanh «Tìm quy tắc» (thay ô «Hỏi AI»), điều khiển hoàn toàn từ `value`: hai ô chọn điểm, dịch vụ, loại xe, bật/tắt,
 * ghi chú hoặc #mã, «gồm cả quy tắc cấp tỉnh / mọi nơi», «Xoá lọc». Mỗi thay đổi phát `onChange` NGAY (kể cả từng phím
 * của ô ghi chú) — trang tự debounce ô ghi chú trước khi gọi máy chủ.
 */
export function MacroSearchBar({ value, onChange, index, wardsStatus, wardsError, zonesStatus, onNeedWards }: MacroSearchBarProps) {
  // «Xoá lọc» dựng lại hai ô chọn điểm để bỏ cả chữ đang gõ dở (chưa chọn) trong ô.
  const [resetKey, setResetKey] = React.useState(0);
  const coverId = React.useId();
  const set = <K extends keyof MacroSearchFilters>(key: K, v: MacroSearchFilters[K]) => onChange({ ...value, [key]: v });
  const hasExactPlace = value.origin?.kind === 'place' || value.dest?.kind === 'place';
  const placeProps = { index, wardsStatus, wardsError, zonesStatus, onNeedWards };

  return (
    <div className="space-y-2" data-testid="macro-search-bar">
      <div className="flex flex-wrap items-start gap-2" data-testid="macro-search-bar-row">
        <div className="w-full min-w-0 sm:w-72" data-search-cell="">
          <MacroPlacePicker
            key={`origin-${resetKey}`}
            label="Điểm đón"
            idPrefix="macro-search-origin"
            value={value.origin}
            onChange={(origin) => set('origin', origin)}
            {...placeProps}
          />
        </div>
        <div className="w-full min-w-0 sm:w-72" data-search-cell="">
          <MacroPlacePicker
            key={`dest-${resetKey}`}
            label="Điểm đến"
            idPrefix="macro-search-dest"
            value={value.dest}
            onChange={(dest) => set('dest', dest)}
            {...placeProps}
          />
        </div>

        <Select
          value={value.serviceType || ALL}
          onValueChange={(v) => set('serviceType', fromSelect(v, SERVICE_VALUES))}
        >
          <SelectTrigger aria-label="Dịch vụ" title="Gồm cả quy tắc áp cho mọi dịch vụ" className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">
              Tất cả dịch vụ
            </SelectItem>
            {SERVICE_VALUES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {serviceLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.vehicleType || ALL}
          onValueChange={(v) => set('vehicleType', fromSelect(v, VEHICLE_VALUES))}
        >
          <SelectTrigger aria-label="Loại xe" title="Gồm cả quy tắc áp cho mọi loại xe" className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">
              Tất cả loại xe
            </SelectItem>
            {VEHICLE_VALUES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {vehicleLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.isActive || ALL} onValueChange={(v) => set('isActive', fromSelect(v, ACTIVE_VALUES))}>
          <SelectTrigger aria-label="Trạng thái" className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL} className="text-xs">
              Tất cả trạng thái
            </SelectItem>
            <SelectItem value="true" className="text-xs">
              Đang bật
            </SelectItem>
            <SelectItem value="false" className="text-xs">
              Đang tắt
            </SelectItem>
          </SelectContent>
        </Select>

        <div className="relative w-full min-w-0 sm:w-56" data-search-cell="">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            aria-label="Ghi chú hoặc mã quy tắc"
            placeholder="Ghi chú hoặc mã quy tắc (vd #123)"
            value={value.q}
            onChange={(e) => set('q', e.target.value)}
            autoComplete="off"
            // 16px trên máy cảm ứng (iOS Safari tự phóng to khi chữ nhỏ hơn).
            className="h-9 pl-8 text-base sm:text-xs md:text-xs [@media(pointer:coarse)]:text-base"
          />
        </div>

        {hasActiveFilters(value) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              setResetKey((k) => k + 1);
              onChange({ ...EMPTY_FILTERS });
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Xoá lọc
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Checkbox
          id={coverId}
          checked={value.cover}
          disabled={!hasExactPlace}
          onCheckedChange={(c) => set('cover', c === true)}
        />
        <Label htmlFor={coverId} className={cn('text-xs font-normal', hasExactPlace ? 'cursor-pointer' : 'text-slate-400')}>
          Gồm cả quy tắc cấp tỉnh / mọi nơi áp cho điểm đã chọn
        </Label>
        <span className="text-[11px] text-slate-500">
          {hasExactPlace
            ? '(tắt: chỉ quy tắc gắn đúng điểm đã chọn)'
            : 'Chọn một điểm cụ thể ở ô Điểm đón / Điểm đến (không phải «Tìm theo chữ») để dùng tuỳ chọn này.'}
        </span>
      </div>
    </div>
  );
}
