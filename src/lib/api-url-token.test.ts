import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAgentMe } from './api';

// Bảo mật: token KHÔNG được nhận qua URL (?token= / ?sso_token=). Nếu nhận, kẻ xấu gửi link
// chứa token của họ là nạn nhân bị đăng nhập vào tài khoản kẻ xấu (login CSRF). SSO thật của
// app khách/tài xế ghi token thẳng vào localStorage của webview, không đi qua URL.
describe('fetchWithAuth — không nhận token từ URL', () => {
  let fetchMock: any;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'ACTIVE' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it.each(['token', 'sso_token'])('bỏ qua ?%s= khi chưa đăng nhập', async (param) => {
    window.history.replaceState({}, '', `/agent-portal/dashboard/?${param}=attacker-token`);

    await getAgentMe();

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.has('Authorization')).toBe(false);
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('vẫn dùng token trong localStorage, kể cả khi URL có ?token=', async () => {
    localStorage.setItem('access_token', 'mine');
    window.history.replaceState({}, '', '/agent-portal/dashboard/?token=attacker-token');

    await getAgentMe();

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer mine');
    expect(localStorage.getItem('access_token')).toBe('mine');
  });
});
