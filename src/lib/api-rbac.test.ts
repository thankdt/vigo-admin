import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAdminMe,
  logout,
  adminListRoles,
  adminCreateRole,
  adminUpdateRole,
  adminDeleteRole,
  adminGetFunctions,
  adminSetUserRoles,
  adminSetUserOverrides,
  adminSetUserSuper,
  API_BASE_URL,
} from './api';
import type { AdminMe, FunctionOverride } from './types';

// Verifies the RBAC admin client: correct endpoints/methods/bodies + unwrapping the
// backend { data } envelope. Backend is coded in parallel, so these tests stub fetch
// (contract only) and stay independent — real integration is validated on DEV.
describe('RBAC admin API client', () => {
  let fetchMock: any;

  beforeEach(() => {
    localStorage.setItem('access_token', 'tok');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });

  it('getAdminMe GETs /admin/me and unwraps the data envelope', async () => {
    const me: AdminMe = { id: 'u1', fullName: 'Admin', phone: '0900', isSuperAdmin: false, functions: ['users'] };
    fetchMock.mockResolvedValue(ok(me));

    const res = await getAdminMe();

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/admin/me`);
    expect(res.functions).toEqual(['users']);
    expect(res.isSuperAdmin).toBe(false);
  });

  it('logout clears BOTH tokens and calls POST /auth/logout', async () => {
    localStorage.setItem('access_token', 'a');
    localStorage.setItem('refresh_token', 'r');
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await logout();

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/auth/logout`);
    expect(opts.method).toBe('POST');
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('logout still clears tokens when the backend call fails (best-effort)', async () => {
    localStorage.setItem('access_token', 'a');
    localStorage.setItem('refresh_token', 'r');
    fetchMock.mockRejectedValue(new Error('network'));

    await expect(logout()).resolves.toBeUndefined();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('adminListRoles GETs /admin/roles and unwraps the array', async () => {
    fetchMock.mockResolvedValue(ok([{ id: 'r1', key: 'ops', name: 'Vận hành', description: '', isSystem: false, functions: ['bookings'] }]));

    const roles = await adminListRoles();

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/admin/roles`);
    expect(roles[0].name).toBe('Vận hành');
  });

  it('adminCreateRole POSTs the role body', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'r2', key: 'fin', name: 'Tài chính', description: '', isSystem: false, functions: ['finance'] }));

    await adminCreateRole({ key: 'fin', name: 'Tài chính', functions: ['finance'] });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/admin/roles`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ key: 'fin', name: 'Tài chính', functions: ['finance'] });
  });

  it('adminUpdateRole PATCHes /admin/roles/:id', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'r2', key: 'fin', name: 'Tài chính 2', description: '', isSystem: false, functions: ['finance', 'invoices'] }));

    await adminUpdateRole('r2', { name: 'Tài chính 2', functions: ['finance', 'invoices'] });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/admin/roles/r2`);
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body).functions).toEqual(['finance', 'invoices']);
  });

  it('adminDeleteRole DELETEs /admin/roles/:id', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await adminDeleteRole('r2');

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/admin/roles/r2`);
    expect(opts.method).toBe('DELETE');
  });

  it('adminGetFunctions GETs /admin/functions', async () => {
    fetchMock.mockResolvedValue(ok([{ key: 'users', label: 'Người dùng', group: 'menu' }]));

    const cat = await adminGetFunctions();

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/admin/functions`);
    expect(cat[0].key).toBe('users');
  });

  it('adminSetUserRoles POSTs { roleIds } to /admin/users/:id/roles', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await adminSetUserRoles('u9', ['r1', 'r2']);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/admin/users/u9/roles`);
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ roleIds: ['r1', 'r2'] });
  });

  it('adminSetUserOverrides PUTs { overrides } to /admin/users/:id/overrides', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const overrides: FunctionOverride[] = [{ functionKey: 'finance', effect: 'REVOKE' }];

    await adminSetUserOverrides('u9', overrides);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/admin/users/u9/overrides`);
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ overrides });
  });

  it('adminSetUserSuper PATCHes { value } to /admin/users/:id/super', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await adminSetUserSuper('u9', true);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/admin/users/u9/super`);
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ value: true });
  });
});
