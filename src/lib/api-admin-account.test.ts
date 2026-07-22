import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updateAdminUser, changeOwnPassword, API_BASE_URL } from './api';

// Contract for the admin-account client: super edits another admin (name/password
// reset), and self change-password. Stub fetch; real integration verified on DEV.
describe('admin-account API client', () => {
  let fetchMock: any;

  beforeEach(() => {
    localStorage.setItem('access_token', 'tok');
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { success: true } }) });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('updateAdminUser PATCHes /users/admin/:id with fullName + password', async () => {
    await updateAdminUser('a1', { fullName: 'New', password: 'secret123' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/users/admin/a1`);
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ fullName: 'New', password: 'secret123' });
  });

  it('changeOwnPassword POSTs /auth/change-password with current + new', async () => {
    await changeOwnPassword('old-pass', 'newpass123');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/auth/change-password`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ currentPassword: 'old-pass', newPassword: 'newpass123' });
  });
});
