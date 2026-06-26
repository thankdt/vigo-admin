import { describe, it, expect } from 'vitest';
import { validateWindow, toIso } from './schedule-utils';

const NOW = Date.parse('2026-06-26T03:00:00.000Z'); // fixed "now" for determinism
// Build a `datetime-local` string (LOCAL wall-clock, no tz suffix) for NOW+mins —
// matches how the real <input> emits values and how validateWindow parses them
// (new Date(localStr) is interpreted in the runtime tz). Using a UTC slice here
// would mismatch by the tz offset and make future times look past.
const pad = (n: number) => String(n).padStart(2, '0');
const dtLocal = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const future = (mins: number) => dtLocal(NOW + mins * 60_000);

describe('validateWindow', () => {
  it('accepts a valid future window (to after from)', () => {
    expect(validateWindow(future(30), future(60), NOW)).toEqual({ ok: true });
  });

  it('rejects when from or to is missing', () => {
    expect(validateWindow('', future(60), NOW)).toMatchObject({ ok: false });
    expect(validateWindow(future(30), '', NOW)).toMatchObject({ ok: false });
  });

  it('rejects an unparseable date', () => {
    expect(validateWindow('not-a-date', future(60), NOW)).toMatchObject({ ok: false, error: expect.stringContaining('không hợp lệ') });
  });

  it('rejects a from-time in the past (beyond the 60s slack)', () => {
    expect(validateWindow(future(-5), future(60), NOW)).toMatchObject({ ok: false, error: expect.stringContaining('đã qua') });
  });

  it('accepts a from-time within the 60s past slack', () => {
    // 30s in the past → still ok (clock-skew slack)
    const justBefore = dtLocal(NOW - 30_000);
    expect(validateWindow(justBefore, future(60), NOW)).toEqual({ ok: true });
  });

  it('rejects when to <= from', () => {
    expect(validateWindow(future(60), future(60), NOW)).toMatchObject({ ok: false, error: expect.stringContaining('sau giờ bắt đầu') }); // equal
    expect(validateWindow(future(60), future(30), NOW)).toMatchObject({ ok: false, error: expect.stringContaining('sau giờ bắt đầu') }); // to before from
  });
});

describe('toIso', () => {
  it('converts a datetime-local string to an ISO instant', () => {
    // No tz suffix → parsed in local tz; assert it round-trips to a valid ISO Z string.
    const iso = toIso('2026-06-26T10:30');
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(iso).getTime()).toBe(new Date('2026-06-26T10:30').getTime());
  });
});
