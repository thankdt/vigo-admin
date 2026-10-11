import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// jsdom không cho stub window.location (defineProperty ném, gán href không điều hướng) →
// mock helper điều hướng để kiểm đích được gán.
vi.mock('./redirect', () => ({ redirectTo: vi.fn() }));

import { getAgentMe } from './api';
import { redirectTo } from './redirect';

const res401 = { ok: false, status: 401, json: async () => ({}) };

// 401 không cứu được → về trang login CỦA KHU VỰC đang đứng, không phải login admin.
// Trường hợp chính: webview "Đặt hộ" của app chỉ ghi access_token (không có refresh token).
describe('fetchWithAuth — 401 chuyển về trang login đúng khu vực', () => {
  let fetchMock: any;

  beforeEach(() => {
    localStorage.clear();
    vi.mocked(redirectTo).mockClear();
    fetchMock = vi.fn().mockResolvedValue(res401);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it.each([
    ['/agent-portal/dashboard/', '/agent-portal/login'],
    ['/kol-portal/dashboard/', '/kol-portal/login'],
    ['/htx/dashboard/', '/htx/login'],
    ['/bookings/', '/'],
    // Route admin trùng tiền tố '/htx' — không được đẩy sang login HTX.
    ['/htx-reconciliation/', '/'],
  ])('chỉ có access token, ở %s → %s và xoá token', async (path, expected) => {
    window.history.replaceState({}, '', path);
    localStorage.setItem('access_token', 'expired');

    // Promise không bao giờ resolve khi đang redirect → không await.
    void getAgentMe();

    await vi.waitFor(() => expect(redirectTo).toHaveBeenCalledWith(expected));
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it.each([
    ['/agent-portal/dashboard/', '/agent-portal/login'],
    ['/htx-reconciliation/', '/'],
  ])('có refresh token nhưng refresh thất bại, ở %s → %s', async (path, expected) => {
    window.history.replaceState({}, '', path);
    localStorage.setItem('access_token', 'expired');
    localStorage.setItem('refresh_token', 'revoked');
    // Lần 1: API 401; lần 2: /auth/refresh 401 (resolve hết → isRefreshing được reset).
    fetchMock.mockResolvedValueOnce(res401).mockResolvedValueOnce(res401);

    void getAgentMe();

    await vi.waitFor(() => expect(redirectTo).toHaveBeenCalledWith(expected));
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh');
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });
});
