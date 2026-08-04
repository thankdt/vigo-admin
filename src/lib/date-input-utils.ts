import { format } from 'date-fns';

/**
 * Helpers bridging a `Date`-typed react-hook-form field and native
 * `<input type="date">` / `<input type="datetime-local">` controls.
 *
 * ⚠️ TZ: business dates in Vigo are Vietnam-local (see CLAUDE.md). These helpers
 * are browser-TZ-independent for the CREATE round-trip: `parseDateInput` parses
 * the calendar day as LOCAL midnight (not UTC), so `dateInputValue(parseDateInput(s)) === s`
 * in ANY browser timezone. Plain `new Date('2026-07-18')` would parse as UTC
 * midnight and shift the day back in negative-UTC zones — the `'T00:00:00'`
 * suffix defeats that.
 */

/** Date → `'yyyy-MM-dd'` for `<input type="date">`; '' when empty. */
export function dateInputValue(date: Date | null | undefined): string {
  return date ? format(date, 'yyyy-MM-dd') : '';
}

/** `<input type="date">` value → local-midnight Date; undefined when empty. */
export function parseDateInput(value: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

/** Date → `'yyyy-MM-ddTHH:mm'` for `<input type="datetime-local">`; '' when empty. */
export function dateTimeInputValue(date: Date | null | undefined): string {
  return date ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
}

/** `<input type="datetime-local">` value → local Date; undefined when empty. */
export function parseDateTimeInput(value: string): Date | undefined {
  return value ? new Date(value) : undefined;
}

/**
 * Cặp helper GHIM CỨNG giờ Việt Nam cho `<input type="datetime-local">`.
 *
 * Khác `parseDateTimeInput`/`dateTimeInputValue` ở trên: hai hàm kia đọc/ghi
 * theo đồng hồ MÁY ADMIN. Chỗ nào nhãn ghi "giờ VN" mà lại dùng chúng thì admin
 * ngồi máy set UTC+9 nhập 09:00 sẽ thành 07:00 VN — lệch 2h, im lặng, và AWS bắn
 * sai giờ. Dùng cặp này ở những form mà mốc thời gian là giờ VN theo nghiệp vụ
 * (CLAUDE.md), bất kể máy admin đang ở múi nào.
 */
const VN_OFFSET = '+07:00';

/** `'yyyy-MM-ddTHH:mm'` (hiểu là giờ VN) → Date; undefined khi rỗng. */
export function parseVnDateTimeInput(value: string): Date | undefined {
  if (!value) return undefined;
  // `datetime-local` có thể kèm giây (`HH:mm:ss`) ở một số trình duyệt.
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const parsed = new Date(`${withSeconds}.000${VN_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Date → `'yyyy-MM-ddTHH:mm'` biểu diễn theo giờ VN; '' khi rỗng. */
export function vnDateTimeInputValue(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  // `sv-SE` cho ra đúng dạng `YYYY-MM-DD HH:mm:ss` — chỉ cần đổi dấu cách thành 'T'.
  const vn = date.toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  return vn.slice(0, 16).replace(' ', 'T');
}
