import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiError,
  API_BASE_URL,
  isMacroSearchUnsupported,
  matchPricingMacroRules,
  searchPricingMacroRules,
} from './api';
import { buildApiError } from './api-error';

/**
 * Client của hai route ĐỌC mới thay ô «Hỏi AI»: `GET /pricing/macro-rules/search` và `GET /pricing/macro-rules/match`.
 * Hợp đồng: chỉ gửi giá trị CÓ NGHĨA (bỏ undefined / chuỗi rỗng), boolean thành 'true'/'false', `cover` chỉ gửi khi bật.
 */
describe('searchPricingMacroRules / matchPricingMacroRules', () => {
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
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data }) });
  const calledUrl = () => new URL(String(fetchMock.mock.calls[0][0]));
  const params = () => [...calledUrl().searchParams.entries()];
  const init = () => fetchMock.mock.calls[0][1] ?? {};

  const PAGE = {
    items: [{ id: 8, name: 'ZONE_W', originWardName: 'Sân bay Nội Bài', destWardName: 'Châu Ninh' }],
    total: 1,
    page: 2,
    limit: 50,
  };

  it('GET /pricing/macro-rules/search: chỉ gửi giá trị có nghĩa, đúng thứ tự, boolean → chuỗi, gỡ envelope', async () => {
    ok(PAGE);
    const res = await searchPricingMacroRules({
      originProvinceCode: '01',
      originWardCode: 'ZONE:NOIBAI',
      destProvinceCode: '',
      destWardCode: undefined,
      originSearch: '   ',
      serviceType: 'RIDE',
      vehicleType: 'CAR_7',
      isActive: false,
      adjustmentType: 'FIXED_PRICE',
      q: '#12',
      cover: true,
      page: 2,
      limit: 50,
    });
    expect(`${calledUrl().origin}${calledUrl().pathname}`).toBe(`${API_BASE_URL}/pricing/macro-rules/search`);
    expect(init().method ?? 'GET').toBe('GET');
    expect(params()).toEqual([
      ['originProvinceCode', '01'],
      ['originWardCode', 'ZONE:NOIBAI'],
      ['serviceType', 'RIDE'],
      ['vehicleType', 'CAR_7'],
      ['isActive', 'false'],
      ['adjustmentType', 'FIXED_PRICE'],
      ['q', '#12'],
      ['cover', 'true'],
      ['page', '2'],
      ['limit', '50'],
    ]);
    // Ký tự đặc biệt được mã hoá đúng (':' của ZONE, '#' của mã quy tắc) chứ không cắt URL.
    expect(String(fetchMock.mock.calls[0][0])).toContain('originWardCode=ZONE%3ANOIBAI');
    expect(String(fetchMock.mock.calls[0][0])).toContain('q=%2312');
    expect(res).toEqual(PAGE);
  });

  it('chữ được cắt khoảng trắng; isActive true → "true"; cover false/thiếu thì KHÔNG gửi', async () => {
    ok(PAGE);
    await searchPricingMacroRules({ originSearch: '  Đông Anh  ', destSearch: 'huyện Tứ Kỳ', isActive: true, cover: false });
    expect(params()).toEqual([
      ['originSearch', 'Đông Anh'],
      ['destSearch', 'huyện Tứ Kỳ'],
      ['isActive', 'true'],
    ]);
  });

  it('không tham số nào: gọi đúng đường dẫn, không có dấu "?" thừa', async () => {
    ok(PAGE);
    await searchPricingMacroRules({});
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${API_BASE_URL}/pricing/macro-rules/search`);
  });

  it('số không hữu hạn (NaN) bị bỏ, số 0 vẫn gửi (máy chủ tự kẹp)', async () => {
    ok(PAGE);
    await searchPricingMacroRules({ page: Number.NaN, limit: 0 });
    expect(params()).toEqual([['limit', '0']]);
  });

  it('GET /pricing/macro-rules/match: hai tỉnh bắt buộc, xã chỉ gửi khi có; trả nguyên dữ liệu', async () => {
    const MATCH = {
      origin: { provinceCode: '01', wardCode: null, zoneCode: 'NOIBAI' },
      dest: { provinceCode: '33', wardCode: null, zoneCode: null },
      combos: [],
      rules: [],
      warnings: ['RANKING_MISMATCH'],
    };
    ok(MATCH);
    const res = await matchPricingMacroRules({ originProvinceCode: '01', originWardCode: 'ZONE:NOIBAI', destProvinceCode: '33', destWardCode: '' });
    expect(`${calledUrl().origin}${calledUrl().pathname}`).toBe(`${API_BASE_URL}/pricing/macro-rules/match`);
    expect(init().method ?? 'GET').toBe('GET');
    expect(params()).toEqual([
      ['originProvinceCode', '01'],
      ['originWardCode', 'ZONE:NOIBAI'],
      ['destProvinceCode', '33'],
    ]);
    expect(res).toEqual(MATCH);
  });

  it('máy chủ CŨ: GET …/search rơi vào route :id ⇒ 400 «numeric string» ⇒ nhận ra là «chưa hỗ trợ»', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: { code: 'Bad Request', message: 'Validation failed (numeric string is expected)' },
      }),
    });
    const err = await searchPricingMacroRules({ q: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isMacroSearchUnsupported(err)).toBe(true);
  });

  it('máy chủ không có route (404, thân HTML không phải JSON) ⇒ «chưa hỗ trợ»', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    });
    const err = await matchPricingMacroRules({ originProvinceCode: '01', destProvinceCode: '33' }).catch((e) => e);
    expect(isMacroSearchUnsupported(err)).toBe(true);
  });

  it('máy chủ MỚI từ chối tham số (400 câu tiếng Việt) ⇒ KHÔNG phải «chưa hỗ trợ»', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: { code: 'Bad Request', message: 'Mã tỉnh của điểm đón không hợp lệ: chỉ gồm chữ, số, _ hoặc -, tối đa 10 ký tự.' },
      }),
    });
    const err = await searchPricingMacroRules({ originProvinceCode: "01'" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isMacroSearchUnsupported(err)).toBe(false);
  });
});

describe('isMacroSearchUnsupported — phân biệt «máy chủ chưa có route mới» với lỗi khác', () => {
  const at = (httpStatus: number, message?: string, code = 'Bad Request') =>
    buildApiError({
      httpStatus,
      path: 'GET /pricing/macro-rules/search',
      body: message === undefined ? undefined : { success: false, error: { code, message } },
    });

  it('404 (mọi thân) ⇒ đúng', () => {
    expect(isMacroSearchUnsupported(at(404))).toBe(true);
    expect(isMacroSearchUnsupported(at(404, 'Cannot GET /pricing/macro-rules/search', 'Not Found'))).toBe(true);
  });

  it('400 «numeric string» nằm ở rawMessage (câu tiếng Anh đã bị thay bằng câu chuẩn) ⇒ đúng', () => {
    const err = at(400, 'Validation failed (numeric string is expected)');
    expect(err.message).not.toContain('numeric string'); // tiền đề: buildApiError đã thay câu hiển thị
    expect(err.rawMessage).toContain('numeric string');
    expect(isMacroSearchUnsupported(err)).toBe(true);
  });

  it('400 «numeric string» nằm ở message (mã VAL_001 giữ nguyên câu gốc) ⇒ đúng; không phân biệt hoa thường', () => {
    const err = at(400, 'Validation failed (Numeric String is expected)', 'VAL_001');
    expect(err.rawMessage).toBeUndefined();
    expect(isMacroSearchUnsupported(err)).toBe(true);
  });

  it('400 khác (tiếng Việt của máy chủ mới, hoặc tiếng Anh không liên quan) ⇒ sai', () => {
    expect(isMacroSearchUnsupported(at(400, 'Chỉ lọc điểm đón theo MỘT cách: mã (tỉnh, phường/xã) hoặc chữ — không gửi cả hai.'))).toBe(false);
    expect(isMacroSearchUnsupported(at(400, 'Validation failed (uuid is expected)'))).toBe(false);
    // Lỗi kiểu dữ liệu của máy chủ MỚI (class-validator) có chữ «string» nhưng KHÔNG phải «numeric string».
    expect(isMacroSearchUnsupported(at(400, 'originSearch must be a string', 'VAL_001'))).toBe(false);
    expect(isMacroSearchUnsupported(at(400))).toBe(false);
  });

  it('mã khác 400/404 ⇒ sai, kể cả khi câu có chữ «numeric string»', () => {
    for (const status of [0, 401, 403, 409, 422, 500, 502]) {
      expect(isMacroSearchUnsupported(at(status, 'numeric string is expected'))).toBe(false);
    }
  });

  it('không phải ApiError ⇒ sai (Error thường, chuỗi, null, undefined)', () => {
    expect(isMacroSearchUnsupported(new Error('Validation failed (numeric string is expected)'))).toBe(false);
    expect(isMacroSearchUnsupported({ httpStatus: 404 })).toBe(false);
    expect(isMacroSearchUnsupported('404')).toBe(false);
    expect(isMacroSearchUnsupported(null)).toBe(false);
    expect(isMacroSearchUnsupported(undefined)).toBe(false);
  });
});
