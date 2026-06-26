// Pure helpers for the admin pickup-window picker. Kept out of the dialog so the
// date/time validation (easy to get wrong) is unit-testable in isolation.

export type WindowValidation = { ok: true } | { ok: false; error: string };

/**
 * Validate a pickup-window [from, to] from raw `<input type="datetime-local">`
 * strings (no timezone suffix). `now` is injectable so tests are deterministic.
 *
 * Rules (admin: NO min-lead / max-lead cap — operators set times freely):
 *  - both present, both parseable
 *  - `from` not in the past (60s slack absorbs client/server clock skew)
 *  - `to` strictly after `from`
 */
export function validateWindow(fromStr: string, toStr: string, now: number = Date.now()): WindowValidation {
  if (!fromStr || !toStr) return { ok: false, error: 'Vui lòng chọn giờ đón (từ và đến).' };
  const f = new Date(fromStr).getTime();
  const t = new Date(toStr).getTime();
  if (Number.isNaN(f) || Number.isNaN(t)) return { ok: false, error: 'Thời gian hẹn không hợp lệ.' };
  if (f < now - 60_000) return { ok: false, error: 'Giờ đón đã qua. Vui lòng chọn thời gian trong tương lai.' };
  if (t <= f) return { ok: false, error: 'Giờ kết thúc phải sau giờ bắt đầu.' };
  return { ok: true };
}

/**
 * Convert a `datetime-local` value (local wall-clock, no tz suffix) to an ISO
 * UTC instant. `new Date(str)` parses it in the browser's timezone, so the
 * absolute instant is correct regardless of TZ; `.toISOString()` normalises it.
 */
export function toIso(str: string): string {
  return new Date(str).toISOString();
}
