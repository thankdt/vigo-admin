import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AdminRole } from '@/lib/types';

vi.mock('@/lib/api', () => ({ adminCreateRole: vi.fn(async () => ({})), adminUpdateRole: vi.fn(async () => ({})) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { RoleEditor } from './role-editor';
import { adminCreateRole, adminUpdateRole } from '@/lib/api';

describe('RoleEditor', () => {
  beforeEach(() => {
    vi.mocked(adminCreateRole).mockClear();
    vi.mocked(adminUpdateRole).mockClear();
  });

  it('renders the function catalog grouped (menu + settings)', () => {
    render(<RoleEditor onCancel={() => {}} onSaved={() => {}} />);
    expect(screen.getByText('Chức năng (menu)')).toBeInTheDocument();
    expect(screen.getByText('Cài đặt hệ thống')).toBeInTheDocument();
    // a known menu label + a known settings label
    expect(screen.getByText('Tài chính')).toBeInTheDocument();
    expect(screen.getByText('Giá & Hoa hồng')).toBeInTheDocument();
  });

  it('create: POSTs {key: slug(name), name, functions} with the ticked functions', async () => {
    const onSaved = vi.fn();
    render(<RoleEditor onCancel={() => {}} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('Tên vai trò'), { target: { value: 'Vận hành' } });
    fireEvent.click(screen.getByLabelText('Chuyến đi')); // bookings
    fireEvent.click(screen.getByRole('button', { name: /Lưu vai trò/ }));

    await waitFor(() => expect(adminCreateRole).toHaveBeenCalledTimes(1));
    expect(adminCreateRole).toHaveBeenCalledWith({
      key: 'van-hanh',
      name: 'Vận hành',
      description: '',
      functions: ['bookings'],
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('edit: pre-checks existing functions and PATCHes the role id', async () => {
    const role: AdminRole = {
      id: 'r1', key: 'fin', name: 'Tài chính', description: 'x', isSystem: false, functions: ['finance'],
    };
    render(<RoleEditor role={role} onCancel={() => {}} onSaved={() => {}} />);

    expect(screen.getByLabelText('Hoá đơn')).not.toBeChecked();
    // 'finance' pre-checked -> add 'invoices' too
    fireEvent.click(screen.getByLabelText('Hoá đơn')); // invoices
    fireEvent.click(screen.getByRole('button', { name: /Lưu vai trò/ }));

    await waitFor(() => expect(adminUpdateRole).toHaveBeenCalledTimes(1));
    const [id, body] = vi.mocked(adminUpdateRole).mock.calls[0];
    expect(id).toBe('r1');
    expect(body.functions).toEqual(expect.arrayContaining(['finance', 'invoices']));
    expect(adminCreateRole).not.toHaveBeenCalled();
  });

  it('disables save when name is empty', () => {
    render(<RoleEditor onCancel={() => {}} onSaved={() => {}} />);
    expect(screen.getByRole('button', { name: /Lưu vai trò/ })).toBeDisabled();
  });

  it('does NOT create a role whose name slugifies to an empty key', async () => {
    const onSaved = vi.fn();
    render(<RoleEditor onCancel={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Tên vai trò'), { target: { value: '@@@' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu vai trò/ }));

    // no API call, stays open
    await waitFor(() => expect(adminCreateRole).not.toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
  });
});
