'use client';

import * as React from 'react';
import { Check, Loader2, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { endpointKey, type MacroEndpoint } from '@/lib/macro-bulk';
import {
  WARD_SEARCH_MIN_CHARS,
  pendingQuickSearch,
  searchTargets,
  type SearchTarget,
} from '@/lib/ward-search';

/** Trạng thái nạp danh sách MỌI xã (một lần, dùng chung cho cả hai bên đón/trả). */
export type WardsStatus = 'idle' | 'loading' | 'ready' | 'error';
/** Trạng thái nạp danh sách điểm đặc biệt (sân bay…), nạp khi mở hộp thoại. */
export type ZonesStatus = 'loading' | 'ready' | 'error';

/**
 * Esc đang bấm trong vùng «Tìm nhanh» mà ô CÓ CHỮ? Hộp thoại cha dùng để không đóng cả hộp thoại (mất hết điểm đã
 * chọn): Esc ở đây chỉ xoá chữ, bấm Esc lần nữa (ô trống) mới đóng. Radix bắt Esc ở giai đoạn capture trên `document`
 * nên vùng này không tự chặn được — chỉ `onEscapeKeyDown` của DialogContent làm được, nhận ra vùng qua `data-quick-add`.
 */
export function isQuickAddEscape(e: { target: EventTarget | null }): boolean {
  const t = e.target;
  if (!(t instanceof Element)) return false;
  const input = t.closest('[data-quick-add]')?.querySelector<HTMLInputElement>('input[data-quick-add-input]');
  return !!input && input.value !== '';
}

/** Người gõ đơn vị cũ («huyện/quận/thị xã/thành phố …»): ô này không tìm theo đơn vị cũ, chỉ cho họ biết chỗ khác. */
const OLD_UNIT_QUERY = /^\s*(huyện|huyen|quận|quan|thị xã|thi xa|thành phố|thanh pho|tp)\s/i;

/**
 * Ô «Tìm nhanh» cho một bên (điểm đón hoặc điểm trả): gõ tên xã/phường/tỉnh (không dấu cũng được), kết quả hiện
 * NGAY bên dưới, bấm một dòng hoặc ↑↓ + Enter là THÊM THẲNG vào danh sách — không còn bước «Thêm».
 *
 * AN TOÀN (thêm nhầm = luật giá gắn nhầm vùng):
 *  - Enter chỉ tự thêm dòng đầu khi nó thắng RÕ (`outcome.confident`) VÀ dữ liệu tìm kiếm đã tải ĐỦ (xã + điểm đặc
 *    biệt). Chưa đủ thì «Láng» mới chỉ thấy «Cả tỉnh Lạng Sơn», «noi bai» mới chỉ thấy xã Nội Bài: tự chọn lúc đó là
 *    chọn sai. Còn hoà (cùng tên ở nhiều tỉnh, xã ↔ sân bay…) thì không dòng nào được tô sẵn và Enter không làm gì
 *    cho tới khi người dùng chọn dòng (↓ hoặc bấm). Rê chuột chỉ để NHÌN, không đổi dòng mà Enter sẽ thêm.
 *  - Dòng đang tô và thứ Enter sẽ thêm LUÔN LÀ MỘT: nhãn đầy đủ hiện ngay dưới ô («Enter để thêm «Đại Từ (Thái Nguyên)»»).
 *  - Chữ gõ mà chưa chọn kết quả được báo lên cha (`onPendingChange`) để chặn nút Tạo — nếu không, bên đó âm thầm
 *    thành «MỌI NƠI».
 *
 * Tự dựng ô nhập + danh sách ARIA (không dùng cmdk/Popover): cmdk tự giữ dòng được chọn cũ khi danh sách đổi, bắt Enter
 * của mọi phần tử con (kể cả nút ×) và Home/End, không gắn aria-activedescendant; Popover(modal) lồng trong Dialog từng
 * làm ô tìm mất focus.
 */
export function WardQuickAdd({
  title,
  index,
  wardsStatus,
  wardsError,
  zonesStatus,
  items,
  onNeedWards,
  onAdd,
  onPendingChange,
}: {
  /** "Điểm đón" | "Điểm trả" — chỉ dùng cho nhãn truy cập. */
  title: string;
  index: SearchTarget[];
  wardsStatus: WardsStatus;
  wardsError: string | null;
  zonesStatus: ZonesStatus;
  /** Danh sách đã chọn của bên này (để đánh dấu «đã thêm»). */
  items: MacroEndpoint[];
  /** Gọi khi ô được focus (và khi bấm «Thử tải lại»): cha nạp danh sách xã nếu chưa có (phải idempotent). */
  onNeedWards: () => void;
  onAdd: (endpoint: MacroEndpoint) => void;
  onPendingChange: (pending: string | null) => void;
}) {
  const [query, setQuery] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);
  // Dòng người dùng chủ động chọn bằng ↑↓ — chỉ có hiệu lực cho ĐÚNG danh sách kết quả lúc đó: đổi chữ gõ hoặc chỉ mục
  // (xã nạp xong, điểm đặc biệt về) là `outcome` mới nên lựa chọn cũ tự mất, không có dòng "kẹt" ngoài ý muốn.
  const [nav, setNav] = React.useState<{ outcome: unknown; key: string } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const trimmed = query.trim();

  const outcome = React.useMemo(() => searchTargets(index, query), [index, query]);
  const results = outcome.results;
  const addedKeys = React.useMemo(() => new Set(items.map(endpointKey)), [items]);

  // Chỉ mục thiếu xã hoặc điểm đặc biệt thì "thắng rõ" chưa đáng tin (xem ghi chú đầu hàm): không tự chọn.
  const indexComplete = wardsStatus === 'ready' && zonesStatus === 'ready';
  const navKey = nav && nav.outcome === outcome ? nav.key : null;
  const activeIndex = navKey ? results.findIndex((r) => r.key === navKey) : outcome.confident && indexComplete ? 0 : -1;
  const active = activeIndex >= 0 ? results[activeIndex] : null;
  const listOpen = trimmed !== '' && results.length > 0;
  const optionId = (i: number) => `${listId}-o${i}`;

  const pending = pendingQuickSearch(query);
  React.useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  React.useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${listId}-o${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, listId]);

  const pick = (t: SearchTarget) => {
    const already = addedKeys.has(endpointKey(t.endpoint));
    if (!already) onAdd(t.endpoint);
    setNotice(already ? `«${t.endpoint.label}» đã có trong danh sách.` : `Đã thêm «${t.endpoint.label}».`);
    setQuery('');
    inputRef.current?.focus();
  };

  const clear = () => {
    setQuery('');
    setNotice(null);
    inputRef.current?.focus();
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Đang gõ dấu kiểu IME (Telex/VNI): Enter/phím mũi tên thuộc về bộ gõ.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!listOpen) return;
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const next = activeIndex < 0 ? (dir === 1 ? 0 : results.length - 1) : (activeIndex + dir + results.length) % results.length;
      setNav({ outcome, key: results[next].key });
    } else if (e.key === 'Enter') {
      // Không bao giờ để Enter gửi form «Tạo quy tắc» từ ô này, dù có chọn được dòng hay không.
      e.preventDefault();
      if (active) pick(active);
    }
  };

  const wardsLoading = wardsStatus === 'idle' || wardsStatus === 'loading';
  const hidden = outcome.total - results.length;
  const noResults = trimmed !== '' && !outcome.tooShort && results.length === 0;

  let summary: string | null = null;
  if (trimmed !== '') {
    if (outcome.tooShort) summary = `Gõ ít nhất ${WARD_SEARCH_MIN_CHARS} ký tự để tìm.`;
    else if (active) summary = `Enter để thêm «${active.endpoint.label}».`;
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
    }
  }

  return (
    <div
      className="space-y-1"
      data-quick-add=""
      data-testid={`quick-add-${title}`}
      onKeyDown={(e) => {
        // Esc ở ô, nút × hay danh sách: xoá chữ (hộp thoại cha đã được báo để không đóng — xem `isQuickAddEscape`).
        if (e.key === 'Escape' && query) {
          e.preventDefault();
          clear();
        }
      }}
    >
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={`${title}: tìm nhanh phường/xã hoặc tỉnh`}
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          aria-activedescendant={listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          data-quick-add-input=""
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setNotice(null);
          }}
          onFocus={onNeedWards}
          onKeyDown={onInputKeyDown}
          placeholder="Tìm nhanh: gõ tên xã, phường hoặc tỉnh"
          title="Gõ không dấu cũng được, ví dụ: dai tu"
          // 16px trên máy cảm ứng: dưới mức đó iOS Safari tự phóng to trang mỗi lần focus.
          className="h-8 w-full rounded-md border border-input bg-white pl-7 pr-8 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:text-xs [@media(pointer:coarse)]:text-base"
        />
        {query && (
          <button
            type="button"
            aria-label={`${title}: xoá ô tìm nhanh`}
            className="absolute right-1 top-1 rounded p-1 text-slate-400 hover:text-slate-700"
            onClick={clear}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {listOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${title}: kết quả tìm nhanh`}
          // Bấm vào danh sách (kể cả thanh cuộn) không được làm ô mất focus.
          onMouseDown={(e) => e.preventDefault()}
          className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-sm"
        >
          {results.map((t, i) => {
            const added = addedKeys.has(endpointKey(t.endpoint));
            const isActive = i === activeIndex;
            return (
              <li
                key={t.key}
                id={optionId(i)}
                role="option"
                aria-selected={isActive}
                aria-label={`${t.title}${t.subtitle ? `, ${t.subtitle}` : ''}${added ? ', đã thêm' : ''}`}
                onClick={() => pick(t)}
                className={cn(
                  'flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-xs',
                  // Rê chuột chỉ tô nền nhẹ để nhìn; dòng mà Enter sẽ thêm chỉ đổi bằng ↑↓ hoặc bấm (nền đặc, dễ phân biệt).
                  isActive ? 'bg-indigo-600 text-white' : 'text-slate-800 hover:bg-slate-100',
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{t.title}</span>
                  {t.subtitle && (
                    <span className={cn('ml-1.5', isActive ? 'text-indigo-100' : 'text-slate-500')}>{t.subtitle}</span>
                  )}
                </span>
                {added ? (
                  <span className={cn('flex shrink-0 items-center gap-0.5 text-[11px]', isActive ? 'text-indigo-100' : 'text-emerald-700')}>
                    <Check aria-hidden className="h-3 w-3" />
                    đã thêm
                  </span>
                ) : (
                  <Plus aria-hidden className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-indigo-100' : 'text-slate-400')} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div
        role="status"
        aria-live="polite"
        className="space-y-0.5 text-[11px] text-slate-600"
        data-testid={`quick-add-hint-${title}`}
      >
        {summary && <div>{summary}</div>}
        {hidden > 0 && <div className="text-slate-500">Còn {hidden} kết quả nữa — gõ thêm để thu hẹp.</div>}
        {noResults && indexComplete && (
          <div>
            Không có kết quả cho «{trimmed}». Thử gõ ngắn hơn, hoặc chọn theo tỉnh ở dưới.
            {OLD_UNIT_QUERY.test(trimmed + ' ') && ' Muốn chọn theo đơn vị cũ (huyện/quận/thị xã…)? Dùng «Theo tỉnh cũ / huyện cũ» ở dưới.'}
          </div>
        )}
        {trimmed !== '' && wardsLoading && (
          <div className="flex items-center gap-1 text-slate-500">
            <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> Đang tải danh sách phường/xã…
          </div>
        )}
        {trimmed !== '' && zonesStatus === 'loading' && (
          <div className="flex items-center gap-1 text-slate-500">
            <Loader2 aria-hidden className="h-3 w-3 animate-spin" /> Đang tải điểm đặc biệt (sân bay…)…
          </div>
        )}
        {trimmed !== '' && zonesStatus === 'error' && (
          <div className="text-red-600" data-testid={`quick-add-zones-error-${title}`}>
            Không tải được điểm đặc biệt (sân bay…) nên kết quả có thể thiếu sân bay và Enter không tự chọn — hãy bấm một
            dòng (đóng rồi mở lại hộp thoại để thử tải lại).
          </div>
        )}
      </div>

      {wardsStatus === 'error' && (
        <div role="status" className="text-[11px] text-red-600" data-testid={`quick-add-wards-error-${title}`}>
          Không tải được danh sách phường/xã{wardsError ? ` (${wardsError})` : ''} — chỉ tìm được tỉnh và điểm đặc biệt, Enter
          không tự chọn; có thể chọn xã theo tỉnh ở dưới.{' '}
          <button
            type="button"
            className="font-medium underline underline-offset-2 hover:text-red-800"
            onClick={() => {
              onNeedWards();
              inputRef.current?.focus();
            }}
          >
            Thử tải lại
          </button>
        </div>
      )}

      <div role="status" aria-live="polite" className="min-h-4 text-[11px] text-emerald-700">
        {notice}
      </div>
    </div>
  );
}
