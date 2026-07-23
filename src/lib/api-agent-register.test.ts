import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendRegistrationOtp,
  registerAccount,
  applyAgent,
  agentCanSelfWithdraw,
  API_BASE_URL,
} from './api';

// Self-service đại lý: đăng ký (mirror app khách) + ứng tuyển + cổng an toàn tiền cho việc tự rút.
describe('agent self-service registration + withdrawal gate', () => {
  let fetchMock: any;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('sendRegistrationOtp POSTs {phone} to /auth/send-registration-otp and unwraps data', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { message: 'OTP sent' } }) });

    const res = await sendRegistrationOtp('0900000000');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/auth/send-registration-otp`);
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ phone: '0900000000' });
    expect(res.message).toBe('OTP sent');
  });

  it('registerAccount POSTs role USER + fields, and stores tokens on success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { access_token: 'AAA', refresh_token: 'RRR', user: { id: 'u1' } } }),
    });

    const tokens = await registerAccount({ phone: '0900000000', pass: 'secret1', fullName: 'Nguyễn Văn A', otp: '123456' });

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/auth/register`);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ phone: '0900000000', pass: 'secret1', fullName: 'Nguyễn Văn A', otp: '123456', role: 'USER' });
    expect(tokens.access_token).toBe('AAA');
    expect(localStorage.getItem('access_token')).toBe('AAA');
    expect(localStorage.getItem('refresh_token')).toBe('RRR');
  });

  it('registerAccount surfaces the backend error message and stores no token on failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'OTP không đúng' } }),
    });

    await expect(registerAccount({ phone: '0900000000', pass: 'secret1', otp: '000000' })).rejects.toThrow('OTP không đúng');
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('applyAgent POSTs {note} to /agent/apply (authenticated)', async () => {
    localStorage.setItem('access_token', 'tok');
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: { status: 'PENDING', commissionPercent: null } }) });

    const res = await applyAgent('từ cổng');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/agent/apply`);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ note: 'từ cổng' });
    expect(res.status).toBe('PENDING');
  });

  it('agentCanSelfWithdraw: only USER_REFERRAL (customer-agent) may self-withdraw; DRIVER_MAIN may not', () => {
    expect(agentCanSelfWithdraw('USER_REFERRAL')).toBe(true);
    expect(agentCanSelfWithdraw('DRIVER_MAIN')).toBe(false);
    expect(agentCanSelfWithdraw(undefined)).toBe(false);
  });
});
