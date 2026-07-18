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
