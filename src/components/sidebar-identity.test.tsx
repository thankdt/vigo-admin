import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarIdentity } from './sidebar-identity';

describe('SidebarIdentity', () => {
  it('renders the dynamic name + phone from /admin/me (not hardcoded admin@vigo.com)', () => {
    render(<SidebarIdentity fullName="Nguyễn Văn A" phone="0912345678" onLogout={() => {}} />);
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.getByText('0912345678')).toBeInTheDocument();
    expect(screen.queryByText('admin@vigo.com')).not.toBeInTheDocument();
  });

  it('falls back to "Quản trị viên" when name is missing', () => {
    render(<SidebarIdentity fullName={null} phone={null} onLogout={() => {}} />);
    expect(screen.getByText('Quản trị viên')).toBeInTheDocument();
  });

  it('calls onLogout when the logout button is clicked', () => {
    const onLogout = vi.fn();
    render(<SidebarIdentity fullName="A" phone="0900" onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/ }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
