import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { banDriver, unbanDriver, API_BASE_URL } from './api';

// Verifies the admin ban/unban client wrappers hit the right endpoint, method
// and body shape (backend contract), and unwrap the { data } envelope.
describe('banDriver / unbanDriver API client', () => {
  let fetchMock: any;

  beforeEach(() => {
    localStorage.setItem('access_token', 'tok');
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'd1', isBanned: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('banDriver POSTs to /drivers/admin/:id/ban with reason + trimmed note, unwraps data', async () => {
    const res = await banDriver('d1', 'gian lận cước', '  note nội bộ  ');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/drivers/admin/d1/ban`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ reason: 'gian lận cước', note: 'note nội bộ' });
    expect(res).toEqual({ id: 'd1', isBanned: true });
  });

  it('banDriver drops a blank note', async () => {
    await banDriver('d1', 'lý do', '   ');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reason: 'lý do' });
  });

  it('unbanDriver POSTs to /drivers/admin/:id/unban with note', async () => {
    await unbanDriver('d1', 'đã xác minh');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/drivers/admin/d1/unban`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ note: 'đã xác minh' });
  });

  it('unbanDriver sends an empty body object when no note', async () => {
    await unbanDriver('d1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});
  });
});
