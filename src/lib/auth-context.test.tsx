import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { makeCan, AuthProvider, useAuth } from './auth-context';
import type { AdminMe } from './types';

vi.mock('@/lib/api', () => ({ getAdminMe: vi.fn() }));
import { getAdminMe } from '@/lib/api';

describe('makeCan()', () => {
  it('super can everything (even functions not listed)', () => {
    const can = makeCan({ id: 'u', fullName: null, phone: '', isSuperAdmin: true, functions: [] });
    expect(can('finance')).toBe(true);
    expect(can('anything')).toBe(true);
  });

  it('normal admin can only listed functions', () => {
    const can = makeCan({ id: 'u', fullName: null, phone: '', isSuperAdmin: false, functions: ['users'] });
    expect(can('users')).toBe(true);
    expect(can('finance')).toBe(false);
  });

  it('null me can nothing', () => {
    const can = makeCan(null);
    expect(can('users')).toBe(false);
  });
});

function Probe() {
  const { me, loading, can } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="name">{me?.fullName ?? 'none'}</span>
      <span data-testid="can-finance">{String(can('finance'))}</span>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.mocked(getAdminMe).mockReset();
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it('fetches /admin/me when a token exists and exposes can()', async () => {
    const me: AdminMe = { id: 'u1', fullName: 'Bình', phone: '0900', isSuperAdmin: false, functions: ['finance'] };
    vi.mocked(getAdminMe).mockResolvedValue(me);
    localStorage.setItem('access_token', 'tok');

    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('name').textContent).toBe('Bình');
    expect(screen.getByTestId('can-finance').textContent).toBe('true');
    expect(getAdminMe).toHaveBeenCalledTimes(1);
  });

  it('does NOT call the API and stays logged-out when no token', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(getAdminMe).not.toHaveBeenCalled();
    expect(screen.getByTestId('name').textContent).toBe('none');
  });

  it('leaves me null when the fetch fails (guard handles redirect)', async () => {
    vi.mocked(getAdminMe).mockRejectedValue(new Error('401'));
    localStorage.setItem('access_token', 'tok');

    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('name').textContent).toBe('none');
  });
});
