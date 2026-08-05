import { describe, it, expect } from 'vitest';
import {
  validateConfigValue,
  normalizeConfigValue,
  MAP_STYLE_KEY_RE,
  MAP_STYLE_ALLOWED_HOSTS,
} from './config-value-validate';

// Bảng case này PHẢI khớp `config-value-validate.spec.ts` bên vigo-backend.
// Lệch = admin chặn cái backend cho phép (hoặc ngược lại).
const KEY = 'CUSTOMER_APP_MAP_STYLE_URL';

describe('validateConfigValue — key *_MAP_STYLE_URL', () => {
  it('nhận chuỗi rỗng (= xoá cấu hình, app về bản đồ mặc định)', () => {
    expect(validateConfigValue(KEY, '')).toBeNull();
    expect(validateConfigValue(KEY, '   ')).toBeNull();
  });

  it('nhận https + host trong allowlist', () => {
    expect(
      validateConfigValue(KEY, 'https://maps.vietmap.vn/api/maps/raster/styles.json?apikey=abc'),
    ).toBeNull();
    expect(
      validateConfigValue(KEY, 'https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=x'),
    ).toBeNull();
    // subdomain của vigogroup.vn
    expect(validateConfigValue(KEY, 'https://tiles.vigogroup.vn/styles.json')).toBeNull();
    // bằng đúng host gốc
    expect(validateConfigValue(KEY, 'https://vigogroup.vn/styles.json')).toBeNull();
  });

  it('từ chối http (không phải https)', () => {
    const msg = validateConfigValue(KEY, 'http://maps.vietmap.vn/styles.json');
    expect(msg).toBeTruthy();
    expect(msg).toContain('https://');
  });

  it('từ chối khoảng trắng Ở GIỮA', () => {
    expect(validateConfigValue(KEY, 'https://maps.vietmap.vn/a b.json')).toContain('khoảng trắng');
    expect(validateConfigValue(KEY, 'https://maps.vietmap.vn/a\tb.json')).toContain('khoảng trắng');
  });

  // Backend CỐ Ý nhận rồi trim (spec BE: "trim khoảng trắng đầu/cuối trước khi
  // ghi"). Admin phải nhận y hệt, nếu không sẽ chặn cứng ca copy-paste thường gặp
  // nhất trong khi backend chấp nhận.
  it('NHẬN khoảng trắng đầu/cuối (backend tự trim khi ghi)', () => {
    expect(validateConfigValue(KEY, '  https://maps.vietmap.vn/s.json  ')).toBeNull();
    expect(validateConfigValue(KEY, 'https://maps.vietmap.vn/s.json\n')).toBeNull();
  });

  it('từ chối URL dài hơn 2048 ký tự', () => {
    const long = 'https://maps.vietmap.vn/s.json?q=' + 'a'.repeat(2100);
    expect(long.length).toBeGreaterThan(2048);
    expect(validateConfigValue(KEY, long)).toContain('quá dài');
  });

  it('từ chối scheme lạ (javascript:, mapbox://)', () => {
    expect(validateConfigValue(KEY, 'javascript:alert(1)')).toBeTruthy();
    // mapbox:// cần token SDK riêng — ngoài phạm vi, phải bị từ chối
    expect(validateConfigValue(KEY, 'mapbox://styles/mapbox/streets-v12')).toBeTruthy();
  });

  it('từ chối chuỗi không parse được thành URL', () => {
    expect(validateConfigValue(KEY, 'khong-phai-url')).toBeTruthy();
    expect(validateConfigValue(KEY, '//maps.vietmap.vn/s.json')).toBeTruthy();
    // thiếu scheme — host đúng nhưng vẫn không parse được
    expect(validateConfigValue(KEY, 'maps.vietmap.vn/s.json')).toBeTruthy();
  });

  it('từ chối userinfo trỏ host thật nhưng authority là host khác', () => {
    expect(validateConfigValue(KEY, 'https://maps.vietmap.vn@evil.example/s.json')).toContain(
      'không được phép',
    );
  });

  it('từ chối host ngoài allowlist', () => {
    expect(validateConfigValue(KEY, 'https://evil.example/s.json')).toContain('không được phép');
  });

  it('từ chối host chỉ TRÔNG GIỐNG allowlist (suffix attack)', () => {
    expect(validateConfigValue(KEY, 'https://vigogroup.vn.evil.com/s.json')).toContain(
      'không được phép',
    );
    expect(validateConfigValue(KEY, 'https://notvigogroup.vn/s.json')).toContain('không được phép');
    expect(validateConfigValue(KEY, 'https://maps.vietmap.vn.evil.com/s.json')).toContain(
      'không được phép',
    );
  });

  it('message host LIỆT KÊ đủ các host được phép', () => {
    const msg = validateConfigValue(KEY, 'https://evil.example/s.json')!;
    for (const h of MAP_STYLE_ALLOWED_HOSTS) expect(msg).toContain(h);
  });

  it('so sánh host không phân biệt hoa/thường', () => {
    expect(validateConfigValue(KEY, 'https://MAPS.VIETMAP.VN/styles.json')).toBeNull();
  });

  it('áp cho cả key app tài xế', () => {
    expect(validateConfigValue('DRIVER_APP_MAP_STYLE_URL', 'http://x.vn/s.json')).toBeTruthy();
    expect(validateConfigValue('DRIVER_APP_MAP_STYLE_URL', '')).toBeNull();
  });
});

describe('validateConfigValue — key KHÁC không bị áp luật', () => {
  it('CUSTOMER_APP_UPDATE_URL nhận deep link market://', () => {
    expect(validateConfigValue('CUSTOMER_APP_UPDATE_URL', 'market://details?id=x')).toBeNull();
  });

  it('DRIVER_APP_UPDATE_URL nhận itms-apps://', () => {
    expect(
      validateConfigValue('DRIVER_APP_UPDATE_URL', 'itms-apps://apps.apple.com/app/id123'),
    ).toBeNull();
  });

  it('KOL_SHARE_BASE_URL để rỗng vẫn hợp lệ và không bị áp allowlist', () => {
    expect(validateConfigValue('KOL_SHARE_BASE_URL', '')).toBeNull();
    expect(validateConfigValue('KOL_SHARE_BASE_URL', 'http://vigo.page.link/abc')).toBeNull();
  });

  it('key thường (không phải URL) luôn hợp lệ', () => {
    expect(validateConfigValue('PRICING_BASE_FARE', 'không phải url')).toBeNull();
    expect(validateConfigValue('HOTLINE', '1900 1234')).toBeNull();
  });
});

// Mirror của giá trị backend TRẢ VỀ từ assertValidConfigValue và ghi xuống DB.
// Lệch = snapshot local của admin khác DB cho tới lần refetch.
describe('normalizeConfigValue', () => {
  it('trim với key *_MAP_STYLE_URL', () => {
    expect(normalizeConfigValue(KEY, '  https://maps.vietmap.vn/s.json  ')).toBe(
      'https://maps.vietmap.vn/s.json',
    );
    expect(normalizeConfigValue(KEY, '   ')).toBe('');
    expect(normalizeConfigValue('DRIVER_APP_MAP_STYLE_URL', 'https://vigogroup.vn/s.json\n')).toBe(
      'https://vigogroup.vn/s.json',
    );
  });

  it('KHÔNG đụng key khác — ~150 config còn lại giữ nguyên chuỗi thô', () => {
    expect(normalizeConfigValue('HOTLINE', ' 1900 1234 ')).toBe(' 1900 1234 ');
    expect(normalizeConfigValue('CUSTOMER_APP_UPDATE_URL', 'market://details?id=x ')).toBe(
      'market://details?id=x ',
    );
  });
});

describe('MAP_STYLE_KEY_RE — gate phải hẹp', () => {
  it('chỉ khớp *_MAP_STYLE_URL', () => {
    expect(MAP_STYLE_KEY_RE.test('CUSTOMER_APP_MAP_STYLE_URL')).toBe(true);
    expect(MAP_STYLE_KEY_RE.test('DRIVER_APP_MAP_STYLE_URL')).toBe(true);
    expect(MAP_STYLE_KEY_RE.test('CUSTOMER_APP_UPDATE_URL')).toBe(false);
    expect(MAP_STYLE_KEY_RE.test('DRIVER_APP_UPDATE_URL')).toBe(false);
    expect(MAP_STYLE_KEY_RE.test('KOL_SHARE_BASE_URL')).toBe(false);
    expect(MAP_STYLE_KEY_RE.test('MAP_STYLE_URL_BACKUP')).toBe(false);
  });
});
