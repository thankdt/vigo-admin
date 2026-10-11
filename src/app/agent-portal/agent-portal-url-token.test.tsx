import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Bảo mật cổng đại lý:
// - Token KHÔNG được nhận qua URL (?token= / ?sso_token=) — chống login CSRF. SSO của app
//   khách/tài xế ghi token thẳng vào localStorage của webview, không đi qua URL.
// - Không có ?redirect= — chống chuyển hướng ra trang ngoài sau đăng nhập.
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/agent-portal/dashboard/',
}));
vi.mock('@/lib/api', () => ({
  getAgentMe: vi.fn(),
  sendAgentLoginOtp: vi.fn(),
  agentLoginOtp: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

import { getAgentMe } from '@/lib/api';
import AgentPortalRootPage from './page';
import AgentLoginPage from './login/page';
import AgentPortalLayout from './(portal)/layout';

const setUrl = (url: string) => window.history.replaceState({}, '', url);

// Sidebar của layout gọi `matchMedia` (useIsMobile) — jsdom không có.
window.matchMedia ??= ((query: string) => ({
  matches: false, media: query, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
})) as any;

beforeEach(() => {
  localStorage.clear();
  replace.mockReset();
  vi.mocked(getAgentMe).mockReset();
});

afterEach(() => {
  localStorage.clear();
  setUrl('/');
});

describe('/agent-portal (root)', () => {
  it('không lưu ?sso_token= và đưa về trang login khi chưa đăng nhập', async () => {
    setUrl('/agent-portal/?sso_token=attacker-token');
    render(<AgentPortalRootPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/agent-portal/login'));
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('không ghi đè token đang có bằng ?token=', async () => {
    localStorage.setItem('access_token', 'mine');
    setUrl('/agent-portal/?token=attacker-token');
    render(<AgentPortalRootPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/agent-portal/dashboard'));
    expect(localStorage.getItem('access_token')).toBe('mine');
  });
});

describe('/agent-portal/login', () => {
  it('không lưu ?token= khi chưa đăng nhập và không gọi /agent/me', async () => {
    setUrl('/agent-portal/login/?token=attacker-token&ref=zalo');
    render(<AgentLoginPage />);
    // render() đã flush effect (act) — khẳng định thẳng, không cần chờ.
    expect(window.location.search).toBe('?ref=zalo');
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(getAgentMe).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    'javascript:alert(1)',
    '/agent-portal/orders',
  ])('bỏ qua ?redirect=%s — luôn về dashboard', async (target) => {
    localStorage.setItem('access_token', 'mine');
    vi.mocked(getAgentMe).mockResolvedValue({} as any);
    setUrl(`/agent-portal/login/?sso_token=attacker-token&redirect=${encodeURIComponent(target)}`);
    render(<AgentLoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith('/agent-portal/dashboard');
    expect(localStorage.getItem('access_token')).toBe('mine');
  });
});

describe('agent-portal (portal) layout', () => {
  it('không lưu ?sso_token= và đưa về login khi chưa đăng nhập', async () => {
    setUrl('/agent-portal/dashboard/?sso_token=attacker-token');
    render(<AgentPortalLayout><div /></AgentPortalLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/agent-portal/login'));
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(getAgentMe).not.toHaveBeenCalled();
  });

  it('không ghi đè token đang có, và vẫn gỡ token khỏi URL (giữ query khác + hash)', async () => {
    localStorage.setItem('access_token', 'mine');
    vi.mocked(getAgentMe).mockResolvedValue({} as any);
    setUrl('/agent-portal/dashboard/?token=a&sso_token=b&tab=x#h');
    render(<AgentPortalLayout><div /></AgentPortalLayout>);
    await waitFor(() => expect(getAgentMe).toHaveBeenCalled());
    expect(localStorage.getItem('access_token')).toBe('mine');
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe('/agent-portal/dashboard/?tab=x#h');
  });
});
