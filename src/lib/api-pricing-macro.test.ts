import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bulkCreatePricingMacroRules,
  bulkDeletePricingMacroRules,
  createPricingMacroRule,
  getPricingMacroProvinces,
  getPricingMacroWards,
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

  // Máy chủ sắp theo mã ký tự (DB C.UTF-8): Đ/Ô/Ơ/Ư dồn xuống cuối. Client sắp lại theo tiếng Việt.
  describe('danh sách tỉnh/xã chọn cho quy tắc macro: sắp theo tiếng Việt', () => {
    const SERVER_ORDER_WARDS = [
      { code: '19010', name: 'An Khánh', provinceCode: '19' },
      { code: '19020', name: 'Dân Tiến', provinceCode: '19' },
      { code: '19030', name: 'Yên Trạch', provinceCode: '19' },
      { code: '19040', name: 'Điềm Thuỵ', provinceCode: '19' },
      { code: '19050', name: 'Đại Từ', provinceCode: '19' },
      { code: '19060', name: 'Đức Xuân', provinceCode: '19' },
    ];

    it('getPricingMacroWards(mã tỉnh): đúng đường dẫn, Đ về sau D chứ không còn dồn cuối', async () => {
      ok(SERVER_ORDER_WARDS);
      const res = await getPricingMacroWards('19');
      expect(url()).toBe(`${API_BASE_URL}/pricing/macro-rules/wards?provinceCode=19`);
      expect(res.map((w) => w.name)).toEqual(['An Khánh', 'Dân Tiến', 'Đại Từ', 'Điềm Thuỵ', 'Đức Xuân', 'Yên Trạch']);
      // giữ nguyên dữ liệu từng dòng (chỉ đổi thứ tự)
      expect(res.find((w) => w.name === 'Đại Từ')).toEqual({ code: '19050', name: 'Đại Từ', provinceCode: '19' });
    });

    it('getPricingMacroWards() không tham số: lấy mọi xã (không ?provinceCode), cũng đã sắp', async () => {
      ok(SERVER_ORDER_WARDS);
      const res = await getPricingMacroWards();
      expect(url()).toBe(`${API_BASE_URL}/pricing/macro-rules/wards`);
      expect(res[0].name).toBe('An Khánh');
      expect(res[res.length - 1].name).toBe('Yên Trạch');
    });

    it('getPricingMacroProvinces: Đà Nẵng/Đắk Lắk/Đồng Nai không còn nằm sau Yên Bái', async () => {
      ok([
        { code: '01', name: 'Hà Nội' },
        { code: '15', name: 'Yên Bái' },
        { code: '48', name: 'Đà Nẵng' },
        { code: '66', name: 'Đắk Lắk' },
        { code: '75', name: 'Đồng Nai' },
        { code: '19', name: 'Thái Nguyên' },
      ]);
      const res = await getPricingMacroProvinces();
      expect(url()).toBe(`${API_BASE_URL}/pricing/macro-rules/provinces`);
      expect(res.map((p) => p.name)).toEqual(['Đà Nẵng', 'Đắk Lắk', 'Đồng Nai', 'Hà Nội', 'Thái Nguyên', 'Yên Bái']);
    });

    it('phản hồi rỗng/không phải mảng thì không ném (màn gọi vẫn dùng `|| []`)', async () => {
      ok(null);
      await expect(getPricingMacroWards('19')).resolves.toBeNull();
      ok([]);
      await expect(getPricingMacroProvinces()).resolves.toEqual([]);
    });
  });
});
