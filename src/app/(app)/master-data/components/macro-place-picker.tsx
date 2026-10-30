'use client';

import * as React from 'react';
import { Loader2, MapPin, Search, TextSearch, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MACRO_TEXT_SEARCH_MAX, placeFilterLabel, type MacroPlaceFilter } from '@/lib/macro-search';
import { WARD_SEARCH_MIN_CHARS, searchTargets, type SearchTarget } from '@/lib/ward-search';
import type { WardsStatus, ZonesStatus } from './ward-quick-add';

type Row = { kind: 'place'; key: string; target: SearchTarget } | { kind: 'text'; key: string; text: string };

/** Khoá của dòng «Tìm theo chữ» — không trùng khoá nào của chỉ mục (`ward|…`, `province|…`, `zone|…`). */
const TEXT_ROW_KEY = 'text|';

const textRowLabel = (text: string) => `Tìm theo chữ «${text}» (gồm tên huyện/tỉnh cũ)`;

export type MacroPlacePickerProps = {
  /** "Điểm đón" | "Điểm đến" — nhãn của ô, của chip và của nút bỏ («Bỏ Điểm đón»). */
  label: string;
  value: MacroPlaceFilter | null;
  onChange: (value: MacroPlaceFilter | null) => void;
  /** Chỉ mục từ `useMacroPlaceIndex` (có thể chưa có xã khi đang nạp). */
  index: SearchTarget[];
  wardsStatus: WardsStatus;
  wardsError?: string | null;
  zonesStatus: ZonesStatus;
  /** Gọi khi ô được focus lúc xã chưa nạp / đã lỗi, và khi bấm «Thử tải lại» (phải idempotent). */
  onNeedWards: () => void;
  /** Tiền tố id cho ô / danh sách / dòng (mặc định tự sinh). */
  idPrefix?: string;
  /**
   * Báo cha khi ô có chữ gõ mà CHƯA chọn dòng nào (true) / hết (false) — như `WardQuickAdd.onPendingChange`: chữ đó
   * KHÔNG lọc gì, cha cần biết để không coi danh sách là đã lọc (vd hiện «Xoá lọc»).
   */
  onPendingChange?: (pending: boolean) => void;
};

/**
 * Ô chọn MỘT điểm (đón hoặc đến) cho thanh «Tìm quy tắc»: gõ tên xã/phường/tỉnh/điểm đặc biệt (không dấu cũng được),
 * chọn một gợi ý ⇒ lọc theo MÃ; dòng CUỐI «Tìm theo chữ «…» (gồm tên huyện/tỉnh cũ)» ⇒ lọc theo chữ, máy chủ phân
 * giải (chỉ mục ở đây chỉ biết tên đơn vị MỚI). Đã chọn thì ô thành chip có nút bỏ.
 *
 * Cùng nguyên tắc an toàn với ô «Tìm nhanh» (ward-quick-add.tsx) — lọc nhầm vùng thì admin kết luận sai về giá:
 *  - Enter chỉ chọn dòng ĐANG TÔ. Dòng chỉ được tô sẵn khi nó thắng RÕ (`outcome.confident`) VÀ dữ liệu tìm kiếm đã đủ
 *    (xã + điểm đặc biệt + danh sách tỉnh); còn lại không dòng nào được tô và Enter không làm gì cho tới khi người dùng
 *    chọn bằng ↑↓ hoặc bấm. Dòng «Tìm theo chữ» không bao giờ được tô sẵn.
 *  - Rê chuột chỉ để NHÌN, không đổi dòng mà Enter sẽ chọn. Lựa chọn bằng ↑↓ chỉ có hiệu lực cho ĐÚNG danh sách kết quả
 *    lúc đó: gõ thêm hay chỉ mục đổi (xã nạp xong) là mất.
 *  - Tự dựng ô nhập + danh sách ARIA (không dùng cmdk/Popover) — cùng lý do với ô «Tìm nhanh».
 *  - Chữ gõ mà chưa chọn dòng nào KHÔNG lọc gì: ô hiện CỐ ĐỊNH một dòng vàng (cả khi đã rời ô) và báo cha
 *    (`onPendingChange`) — nếu không, rời ô là danh sách không lọc mà không một lời báo.
 *  - Chọn xong, focus nằm ở CHIP (không phải nút bỏ): Enter lần hai (gõ đúp, giữ phím) không được bỏ lựa chọn vừa chọn.
 * Danh sách gợi ý nổi đè lên nội dung bên dưới và đóng khi focus rời ô (không che bảng).
 */
export function MacroPlacePicker({
  label,
  value,
  onChange,
  index,
  wardsStatus,
  wardsError = null,
  zonesStatus,
  onNeedWards,
  idPrefix,
  onPendingChange,
}: MacroPlacePickerProps) {
  const [query, setQuery] = React.useState('');
  // Dòng chọn bằng ↑↓, gắn với ĐÚNG kết quả tìm lúc đó (xem ghi chú đầu hàm).
  const [nav, setNav] = React.useState<{ outcome: unknown; key: string } | null>(null);
  const [focused, setFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const chipRef = React.useRef<HTMLDivElement>(null);
  const focusAfterChange = React.useRef<'input' | 'chip' | null>(null);
  const autoId = React.useId();
  const baseId = idPrefix || autoId;
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;
  const pendingId = `${baseId}-pending`;
  const optionId = (i: number) => `${baseId}-o${i}`;
  const trimmed = query.trim();
  // Có chữ mà chưa chọn: danh sách CHƯA lọc theo ô này.
  const pending = !value && trimmed !== '';

  React.useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const outcome = React.useMemo(() => searchTargets(index, query), [index, query]);
  const results = outcome.results;
  const showTextRow = trimmed.length >= WARD_SEARCH_MIN_CHARS && !outcome.tooShort;
  const rows = React.useMemo<Row[]>(() => {
    const list: Row[] = results.map((t) => ({ kind: 'place', key: t.key, target: t }));
    if (showTextRow) list.push({ kind: 'text', key: TEXT_ROW_KEY, text: trimmed });
    return list;
  }, [results, showTextRow, trimmed]);

  // Chỉ mục thiếu xã, điểm đặc biệt hoặc tỉnh thì "thắng rõ" chưa đáng tin: «Láng» khi chưa có xã chỉ thấy «Cả tỉnh
  // Lạng Sơn»; «Lào Cai» khi chưa có tỉnh chỉ thấy xã mà thiếu «Cả tỉnh Lào Cai» trùng tên.
  const hasProvinces = React.useMemo(() => index.some((t) => t.kind === 'province'), [index]);
  const indexComplete = wardsStatus === 'ready' && zonesStatus === 'ready' && hasProvinces;
  const navKey = nav && nav.outcome === outcome ? nav.key : null;
  const activeIndex =
    navKey !== null ? rows.findIndex((r) => r.key === navKey) : outcome.confident && indexComplete ? 0 : -1;
  const active = activeIndex >= 0 ? rows[activeIndex] : null;
  const listOpen = focused && trimmed !== '' && rows.length > 0;

  React.useEffect(() => {
    if (listOpen && activeIndex >= 0) {
      document.getElementById(`${baseId}-o${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [listOpen, activeIndex, baseId]);

  // Ô đổi giữa chip ↔ ô nhập do chính người dùng (chọn / bỏ): đưa focus tới chỗ hợp lý thay vì rơi về <body>.
  React.useEffect(() => {
    const target = focusAfterChange.current;
    focusAfterChange.current = null;
    if (value) setQuery(''); // giá trị đặt từ ngoài (vd «Xoá lọc» rồi liên kết sâu): không giữ chữ cũ ẩn sau chip
    // Chọn xong: focus vào CHIP (Enter ở đó không làm gì), KHÔNG vào nút bỏ — Enter thứ hai sẽ bỏ lựa chọn vừa chọn.
    if (target === 'chip') chipRef.current?.focus();
    else if (target === 'input') inputRef.current?.focus();
  }, [value]);

  const pick = (row: Row) => {
    focusAfterChange.current = 'chip';
    setQuery('');
    setNav(null);
    onChange(row.kind === 'place' ? { kind: 'place', endpoint: row.target.endpoint } : { kind: 'text', text: row.text });
  };

  const clearValue = () => {
    focusAfterChange.current = 'input';
    onChange(null);
  };

  const clearQuery = () => {
    setQuery('');
    setNav(null);
    inputRef.current?.focus();
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Đang gõ dấu kiểu IME (Telex/VNI): Enter/phím mũi tên thuộc về bộ gõ.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!listOpen) return;
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const next = activeIndex < 0 ? (dir === 1 ? 0 : rows.length - 1) : (activeIndex + dir + rows.length) % rows.length;
      setNav({ outcome, key: rows[next].key });
    } else if (e.key === 'Enter') {
      // Không bao giờ để Enter gửi form bao quanh, dù có chọn được dòng hay không.
      e.preventDefault();
      if (active) pick(active);
    }
  };

  const focusHandlers = {
    onFocus: () => setFocused(true),
    onBlur: (e: React.FocusEvent<HTMLDivElement>) => {
      // Focus chuyển sang nút bên trong ô (×, «Thử tải lại», nút bỏ chip) vẫn tính là đang ở ô.
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      setFocused(false);
    },
  };

  if (value) {
    const text = placeFilterLabel(value);
    return (
      <div className="relative" data-place-picker="" {...focusHandlers}>
        <div
          ref={chipRef}
          tabIndex={-1}
          role="group"
          aria-label={`${label}: ${text}`}
          data-testid={`place-picker-chip-${label}`}
          className="flex h-9 w-full min-w-0 items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 pl-2 pr-1 text-xs text-indigo-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {value.kind === 'place' ? (
            <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
          ) : (
            <TextSearch aria-hidden className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
          )}
          <span className="shrink-0 text-indigo-700/80">{label}:</span>
          <span className="min-w-0 flex-1 truncate font-medium" title={text}>
            {text}
          </span>
          <button
            type="button"
            aria-label={`Bỏ ${label}`}
            title={`Bỏ ${label}`}
            onClick={clearValue}
            className="shrink-0 rounded p-1 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const wardsLoading = wardsStatus === 'idle' || wardsStatus === 'loading';
  const hidden = outcome.total - results.length;
  const noPlaceResults = trimmed !== '' && !outcome.tooShort && results.length === 0;

  let summary: string | null = null;
  if (trimmed !== '') {
    if (outcome.tooShort) summary = `Gõ ít nhất ${WARD_SEARCH_MIN_CHARS} ký tự để tìm.`;
    else if (active?.kind === 'place') summary = `Enter để chọn «${active.target.endpoint.label}».`;
    else if (active?.kind === 'text') summary = `Enter để tìm theo chữ «${active.text}» (gồm tên huyện/tỉnh cũ).`;
    else if (results.length > 0) {
      if (!indexComplete) {
        summary = 'Dữ liệu tìm kiếm chưa tải đủ nên Enter chưa tự chọn — bấm một dòng để chọn, hoặc đợi tải xong.';
      } else if (outcome.tiedSameName) {
        const tiedRows = results.slice(0, outcome.tied);
        summary =
          `Có ${outcome.tied} nơi cùng tên «${results[0].title.replace(/^Cả tỉnh /, '')}» — xem kỹ tên tỉnh` +
          (tiedRows.some((r) => r.kind === 'province') ? ' và loại («Cả tỉnh …» là CẢ TỈNH, không riêng phường/xã)' : '') +
          ' rồi chọn một dòng (bấm, hoặc ↓ rồi Enter).';
      } else {
        summary = 'Chưa chắc là dòng nào — bấm một dòng, hoặc ↓ rồi Enter.';
      }
    } else if (noPlaceResults && indexComplete) {
      summary =
        `Không có phường/xã, tỉnh hay điểm đặc biệt nào khớp «${trimmed}» — chọn dòng «Tìm theo chữ» (bấm, hoặc ↓ rồi ` +
        'Enter) để máy chủ tìm cả tên huyện/tỉnh cũ.';
    }
  }

  const hints: React.ReactNode[] = [];
  if (summary) hints.push(<div key="summary">{summary}</div>);
  if (hidden > 0) {
    hints.push(
      <div key="hidden" className="text-slate-500">
        Còn {hidden} kết quả nữa — gõ thêm để thu hẹp.
      </div>,
    );
  }
  if (trimmed !== '') {
    if (wardsLoading) {
      hints.push(
        <div key="wards-loading" className="flex items-center gap-1 text-slate-500">
          <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> Đang tải danh sách phường/xã…
        </div>,
      );
    }
    if (zonesStatus === 'loading') {
      hints.push(
        <div key="zones-loading" className="flex items-center gap-1 text-slate-500">
          <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> Đang tải điểm đặc biệt (sân bay…)…
        </div>,
      );
    }
    if (zonesStatus === 'error') {
      hints.push(
        <div key="zones-error" className="text-red-600">
          Không tải được điểm đặc biệt (sân bay…) nên kết quả có thể thiếu sân bay và Enter không tự chọn — hãy bấm một
          dòng (tải lại trang để thử lại).
        </div>,
      );
    }
    if (!hasProvinces) {
      hints.push(
        <div key="no-provinces" className="text-red-600">
          Chưa tải được danh sách tỉnh nên kết quả có thể thiếu «Cả tỉnh …» và Enter không tự chọn — hãy bấm một dòng.
        </div>,
      );
    }
  }
  const showHints = focused && hints.length > 0;

  return (
    <div
      className="relative"
      data-place-picker=""
      {...focusHandlers}
      onKeyDown={(e) => {
        // Esc ở ô hoặc nút ×: xoá chữ đang gõ (giá trị đã chọn không đổi vì lúc này chưa có).
        if (e.key === 'Escape' && query) {
          e.preventDefault();
          clearQuery();
        }
      }}
    >
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={`${label}: tìm phường/xã, tỉnh hoặc điểm đặc biệt`}
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          aria-activedescendant={listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-describedby={`${hintId} ${pendingId}`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={MACRO_TEXT_SEARCH_MAX}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (wardsStatus === 'idle' || wardsStatus === 'error') onNeedWards();
          }}
          onKeyDown={onInputKeyDown}
          placeholder={`${label}: gõ tên xã, phường, tỉnh…`}
          title="Gõ không dấu cũng được, ví dụ: dai tu. Tên huyện/tỉnh cũ: chọn dòng «Tìm theo chữ»."
          // 16px trên máy cảm ứng: dưới mức đó iOS Safari tự phóng to trang mỗi lần focus.
          className="h-9 w-full rounded-md border border-input bg-white pl-8 pr-8 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-xs [@media(pointer:coarse)]:text-base"
        />
        {query && (
          <button
            type="button"
            aria-label={`${label}: xoá chữ đang gõ`}
            className="absolute right-1 top-1.5 rounded p-1 text-slate-400 hover:text-slate-700"
            onClick={clearQuery}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Bấm vào phần nổi (kể cả thanh cuộn, «Thử tải lại») không được làm ô mất focus. Neo ngay dưới Ô NHẬP (top-9 = cao
          ô nhập h-9), đè lên dòng vàng «chưa được chọn» bên dưới khi đang gõ. */}
      <div className="absolute inset-x-0 top-9 z-30 mt-1 space-y-1" onMouseDown={(e) => e.preventDefault()}>
        {listOpen && (
          <ul
            id={listId}
            role="listbox"
            aria-label={`${label}: gợi ý`}
            className="max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-md"
          >
            {rows.map((row, i) => {
              const isActive = i === activeIndex;
              if (row.kind === 'text') {
                return (
                  <li
                    key={row.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={isActive}
                    aria-label={textRowLabel(row.text)}
                    onClick={() => pick(row)}
                    className={cn(
                      'flex cursor-pointer select-none items-start gap-2 rounded px-2 py-1.5 text-xs',
                      i > 0 && 'mt-1 border-t border-slate-100',
                      isActive ? 'bg-indigo-600 text-white' : 'text-slate-800 hover:bg-slate-100',
                    )}
                  >
                    <TextSearch aria-hidden className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', isActive ? 'text-indigo-100' : 'text-slate-400')} />
                    <span className="min-w-0 flex-1 break-words">
                      Tìm theo chữ «<span className="font-medium">{row.text}</span>»{' '}
                      <span className={isActive ? 'text-indigo-100' : 'text-slate-500'}>(gồm tên huyện/tỉnh cũ)</span>
                    </span>
                  </li>
                );
              }
              const t = row.target;
              return (
                <li
                  key={row.key}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isActive}
                  aria-label={`${t.title}${t.subtitle ? `, ${t.subtitle}` : ''}`}
                  onClick={() => pick(row)}
                  className={cn(
                    'flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-xs',
                    // Rê chuột chỉ tô nền nhẹ để nhìn; dòng mà Enter sẽ chọn chỉ đổi bằng ↑↓ hoặc bấm.
                    isActive ? 'bg-indigo-600 text-white' : 'text-slate-800 hover:bg-slate-100',
                  )}
                >
                  <MapPin aria-hidden className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-indigo-100' : 'text-slate-400')} />
                  <span className="min-w-0 flex-1 truncate" title={`${t.title}${t.subtitle ? ` — ${t.subtitle}` : ''}`}>
                    <span className="font-medium">{t.title}</span>
                    {t.subtitle && (
                      <span className={cn('ml-1.5', isActive ? 'text-indigo-100' : 'text-slate-500')}>{t.subtitle}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div
          id={hintId}
          role="status"
          aria-live="polite"
          data-testid={`place-picker-hint-${label}`}
          className={
            showHints
              ? 'space-y-0.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600 shadow-md'
              : 'sr-only'
          }
        >
          {hints}
        </div>

        {focused && wardsStatus === 'error' && (
          <div
            role="status"
            data-testid={`place-picker-wards-error-${label}`}
            className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 shadow-md"
          >
            Không tải được danh sách phường/xã{wardsError ? ` (${wardsError})` : ''} — chỉ tìm được tỉnh và điểm đặc biệt,
            Enter không tự chọn; vẫn dùng được «Tìm theo chữ».{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2 hover:text-red-900"
              onClick={() => {
                onNeedWards();
                inputRef.current?.focus();
              }}
            >
              Thử tải lại
            </button>
          </div>
        )}
      </div>

      {/* CỐ ĐỊNH (cả khi đã rời ô): chữ gõ dở không lọc gì. Không nhắc lại chữ đã gõ — vùng này đọc to (aria-live). */}
      <div
        id={pendingId}
        role="status"
        data-testid={`place-picker-pending-${label}`}
        className={pending ? 'mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800' : undefined}
      >
        {pending &&
          `Chữ gõ ở ô ${label} chưa được chọn — danh sách CHƯA lọc theo điểm này. Chọn một dòng gợi ý hoặc «Tìm theo chữ».`}
      </div>
    </div>
  );
}
