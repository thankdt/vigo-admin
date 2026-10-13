import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bulkCreatePricingMacroRules,
  bulkDeletePricingMacroRules,
  createPricingMacroRule,
  API_BASE_URL,
} from './api';

/** Client macro hàng loạt: đúng đường dẫn, method, body và gỡ envelope. */
describe('pricing macro bulk API clients', () => {
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

  it('bulkCreatePricingMacroRules: POST /pricing/macro-rules/bulk, gửi nguyên payload, gỡ envelope', async () => {
    ok({ created: [{ id: 1, name: 'x' }], skipped: [{ reason: 'TRUNG_KHOA' }] });
    const payload = {
      namePrefix: 'HN-HY',
      adjustmentType: 'DELTA_AMOUNT' as const,
      adjustmentValue: 30000,
      isBidirectional: true,
      origins: [{ provinceCode: '01', wardCode: '00160' }],
      dests: [{ provinceCode: '33' }],
    };
    const res = await bulkCreatePricingMacroRules(payload);
    expect(url()).toBe(`${API_BASE_URL}/pricing/macro-rules/bulk`);
    expect(init().method).toBe('POST');
    expect(JSON.parse(init().body)).toEqual(payload);
    expect(res.created).toHaveLength(1);
    expect(res.skipped[0].reason).toBe('TRUNG_KHOA');
  });

  it('bulkDeletePricingMacroRules: POST /pricing/macro-rules/bulk-delete body {ids}', async () => {
    ok({ deleted: [1, 2], missing: [3] });
    const res = await bulkDeletePricingMacroRules([1, 2, 3]);
    expect(url()).toBe(`${API_BASE_URL}/pricing/macro-rules/bulk-delete`);
    expect(init().method).toBe('POST');
    expect(JSON.parse(init().body)).toEqual({ ids: [1, 2, 3] });
    expect(res).toEqual({ deleted: [1, 2], missing: [3] });
  });

  it('createPricingMacroRule gửi isBidirectional khi được truyền (field mới, additive)', async () => {
    ok({ id: 9, isBidirectional: true });
    const res = await createPricingMacroRule({ name: 'a', isBidirectional: true });
    expect(JSON.parse(init().body)).toMatchObject({ isBidirectional: true });
    expect(res.isBidirectional).toBe(true);
  });
});
