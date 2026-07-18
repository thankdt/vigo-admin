import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { suspendDriver, unsuspendDriver, API_BASE_URL } from './api';

// Verifies the admin temp trip-suspension client wrappers hit the right endpoint,
// method and body shape (durationMinutes preset vs explicit until ISO).
describe('suspendDriver / unsuspendDriver API client', () => {
  let fetchMock: any;

  beforeEach(() => {
    localStorage.setItem('access_token', 'tok');
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'd1', suspendedUntil: '2026-07-15T10:00:00.000Z' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('suspendDriver with durationMinutes POSTs { reason, durationMinutes }', async () => {
    const res = await suspendDriver('d1', { durationMinutes: 180, reason: 'đi trễ' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/drivers/admin/d1/suspend`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ reason: 'đi trễ', durationMinutes: 180 });
    expect(res).toEqual({ id: 'd1', suspendedUntil: '2026-07-15T10:00:00.000Z' });
  });

  it('suspendDriver with explicit until POSTs { reason, until } (no durationMinutes)', async () => {
    await suspendDriver('d1', { until: '2026-07-16T14:30:00+07:00', reason: 'xác minh' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      reason: 'xác minh',
      until: '2026-07-16T14:30:00+07:00',
    });
  });

  it('suspendDriver prefers durationMinutes when both are somehow present', async () => {
    await suspendDriver('d1', { durationMinutes: 60, until: '2026-07-16T14:30:00+07:00', reason: 'x' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ reason: 'x', durationMinutes: 60 });
    expect(body.until).toBeUndefined();
  });

  it('unsuspendDriver POSTs to /unsuspend with note', async () => {
    await unsuspendDriver('d1', 'gỡ sớm');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/drivers/admin/d1/unsuspend`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ note: 'gỡ sớm' });
  });
});
