import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAdminInvoices,
  reopenAdminInvoice,
  API_BASE_URL,
} from './api';

describe('invoices & MISA e-invoice API clients', () => {
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

  const ok = (data: unknown) =>
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data }) });
  const url = () => String(fetchMock.mock.calls[0][0]);
  const init = () => fetchMock.mock.calls[0][1] ?? {};

  it('getAdminInvoices: GET /bookings/admin/invoices kèm trạng thái invoice MISA', async () => {
    const payload = {
      data: [
        {
          id: 'b-1',
          tripDate: '2026-10-27T03:15:00.000Z',
          bookingCode: 'VGO-261026-202048',
          contractNo: 'HD-2026-1026-202048',
          pickupAddress: 'Số 1 Tràng Tiền',
          dropoffAddress: 'Sân bay Nội Bài',
          totalWithVat: 194400,
          vat: 14400,
          vehiclePlate: '30A-123.45',
          transportCompanyName: 'HTX A',
          invoice: {
            id: 'inv-1',
            status: 'ISSUED',
            skipReason: null,
            invNo: '00000123',
            lookupCode: 'TRA-CUU-1',
            lookupUrl: 'https://www.meinvoice.vn/tra-cuu',
            issuedAt: '2026-10-27T03:20:00.000Z',
            invDate: '2026-10-27',
            attempts: 1,
            lastErrorCode: null,
            lastError: null,
            nextAttemptAt: null,
          },
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    ok(payload);

    const res = await getAdminInvoices({ page: 1, limit: 20, from: '2026-10-01' });
    expect(url()).toBe(`${API_BASE_URL}/bookings/admin/invoices?page=1&limit=20&from=2026-10-01`);
    expect(res.data[0].invoice?.status).toBe('ISSUED');
    expect(res.data[0].invoice?.invNo).toBe('00000123');
  });

  it('reopenAdminInvoice: POST /admin/invoices/:id/reopen với reason đã trim và confirmNotIssuedManually', async () => {
    ok({ id: 'inv-123', status: 'PENDING' });

    const res = await reopenAdminInvoice('inv-123', {
      reason: '  Khách gửi lại MST đúng  ',
      confirmNotIssuedManually: true,
    });

    expect(url()).toBe(`${API_BASE_URL}/admin/invoices/inv-123/reopen`);
    expect(init().method).toBe('POST');
    expect(JSON.parse(init().body)).toEqual({
      reason: 'Khách gửi lại MST đúng',
      confirmNotIssuedManually: true,
    });
    expect(res).toEqual({ id: 'inv-123', status: 'PENDING' });
  });
});
