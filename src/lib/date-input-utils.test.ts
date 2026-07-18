import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  dateInputValue,
  parseDateInput,
  dateTimeInputValue,
  parseDateTimeInput,
} from './date-input-utils';

// Pin a NON-UTC zone for these tests. Under UTC the `'T00:00:00'` local-midnight
// guard is invisible (UTC midnight == local midnight), so a UTC run would give
// false assurance. America/New_York is UTC-4/-5. Save/restore so we don't leak
// the mutated TZ into sibling suites if a worker is reused. Node re-reads
// process.env.TZ (tzset) on the next Date operation, so no imports touch Date
// before beforeAll runs.
describe('date-input-utils (TZ pinned to America/New_York)', () => {
  const prevTZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'America/New_York'; });
  afterAll(() => { process.env.TZ = prevTZ; });

  it('parses a date input as LOCAL midnight, not UTC', () => {
    const d = parseDateInput('2026-07-18')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July
    expect(d.getDate()).toBe(18);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    // In a negative-UTC zone, local midnight is NOT the UTC-midnight instant.
    expect(d.toISOString()).not.toBe('2026-07-18T00:00:00.000Z');
  });

  it('round-trips date <-> input value without off-by-one', () => {
    expect(dateInputValue(parseDateInput('2026-07-18'))).toBe('2026-07-18');
    expect(dateInputValue(parseDateInput('2026-01-01'))).toBe('2026-01-01');
    expect(dateInputValue(parseDateInput('2026-12-31'))).toBe('2026-12-31');
  });

  it('demonstrates the bug the local-midnight guard prevents', () => {
    // Plain `new Date('YYYY-MM-DD')` = UTC midnight; formatted LOCAL it shifts back a day.
    const naive = new Date('2026-07-18');
    expect(dateInputValue(naive)).toBe('2026-07-17'); // <- what we avoid
  });

  it('round-trips datetime <-> input value preserving wall-clock time', () => {
    const d = parseDateTimeInput('2026-07-18T14:30')!;
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
    expect(dateTimeInputValue(d)).toBe('2026-07-18T14:30');
  });

  it('treats empty / nullish as empty', () => {
    expect(dateInputValue(null)).toBe('');
    expect(dateInputValue(undefined)).toBe('');
    expect(dateTimeInputValue(null)).toBe('');
    expect(parseDateInput('')).toBeUndefined();
    expect(parseDateTimeInput('')).toBeUndefined();
  });
});
