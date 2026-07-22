import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  adminListAssignableUsers: vi.fn(),
  adminListRoles: vi.fn(),
  adminSetUserRoles: vi.fn(async () => {}),
  adminSetUserOverrides: vi.fn(async () => {}),
  adminSetUserSuper: vi.fn(async () => {}),
}));
// Stable toast fn: the real useToast returns a module-stable toast, so load()'s
// useCallback([toast]) stays stable. A fresh fn per render would re-fire the mount
// effect in a loop and pin loading=true.
vi.mock('@/hooks/use-toast', () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

import { UserAssignment } from './user-assignment';
import {
  adminListAssignableUsers, adminListRoles, adminSetUserRoles, adminSetUserOverrides, adminSetUserSuper,
} from '@/lib/api';

const USERS = [
  { id: 'u1', fullName: 'An', phone: '0900', isSuperAdmin: false, roleIds: ['r1'], overrides: [] },
  { id: 'seed', fullName: 'Root', phone: '9111111174', isSuperAdmin: true, roleIds: [], overrides: [] },
];
const ROLES = [
  { id: 'r1', key: 'ops', name: 'Vận hành', description: '', isSystem: false, functions: ['bookings', 'finance'] },
  { id: 'r2', key: 'fin', name: 'Tài chính', description: '', isSystem: false, functions: ['finance', 'invoices'] },
];

describe('UserAssignment', () => {
  beforeEach(() => {
    vi.mocked(adminListAssignableUsers).mockResolvedValue(structuredClone(USERS));
    vi.mocked(adminListRoles).mockResolvedValue(structuredClone(ROLES));
    vi.mocked(adminSetUserRoles).mockClear();
    vi.mocked(adminSetUserOverrides).mockClear();
    vi.mocked(adminSetUserSuper).mockClear();
  });

  it('shows effective preview from the selected roles, with REVOKE winning', async () => {
    render(<UserAssignment />);
    fireEvent.click(await screen.findByText('An'));

    // u1 has role r1 => bookings, finance
    const preview = () => screen.getByTestId('effective-preview');
    await waitFor(() => expect(within(preview()).getByText('bookings')).toBeInTheDocument());
    expect(within(preview()).getByText('finance')).toBeInTheDocument();

    // REVOKE finance -> disappears from effective
    fireEvent.click(screen.getByLabelText('Tài chính: Thu'));
    await waitFor(() => expect(within(preview()).queryByText('finance')).not.toBeInTheDocument());
    expect(within(preview()).getByText('bookings')).toBeInTheDocument();
  });

  it('save persists roles + overrides with the right payloads', async () => {
    render(<UserAssignment />);
    fireEvent.click(await screen.findByText('An'));

    // add role r2, revoke finance
    fireEvent.click(screen.getByLabelText('Tài chính')); // role r2 checkbox (label "Tài chính")
    fireEvent.click(screen.getByLabelText('Tài chính: Thu')); // override REVOKE finance
    fireEvent.click(screen.getByRole('button', { name: /Lưu vai trò & ngoại lệ/ }));

    await waitFor(() => expect(adminSetUserRoles).toHaveBeenCalledTimes(1));
    const [uid, roleIds] = vi.mocked(adminSetUserRoles).mock.calls[0];
    expect(uid).toBe('u1');
    expect(roleIds).toEqual(expect.arrayContaining(['r1', 'r2']));
    expect(adminSetUserOverrides).toHaveBeenCalledWith('u1', [{ functionKey: 'finance', effect: 'REVOKE' }]);
  });

  it('locks the super toggle for the seed account', async () => {
    render(<UserAssignment />);
    fireEvent.click(await screen.findByText('Root'));

    const sw = await screen.findByRole('switch', { name: 'Super admin' });
    expect(sw).toBeDisabled();
    expect(adminSetUserSuper).not.toHaveBeenCalled();
  });
});
