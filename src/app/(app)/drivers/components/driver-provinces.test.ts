import { describe, it, expect } from 'vitest';
import { ApiError } from '@/lib/api-error';
import type { AdminUnit } from '@/lib/types';
import {
  buildProvinceSelection,
  currentProvinceCodes,
  driverLacksProvince,
  provinceCodeOf,
  provinceFilterUnsupported,
  provinceOptionLabel,
  provinceSaveErrorMessage,
  provincesFromCodes,
  selectableProvinces,
} from './driver-provinces';

const catalog: AdminUnit[] = [
  { id: 101, name: 'Nội đô Hà Nội', level: 'PROVINCE', gisCode: '01' },
  { id: 102, name: 'Hải Phòng', level: 'PROVINCE', gisCode: '31', oldProvinces: ['Hải Dương', 'Hải Phòng'] },
  { id: 103, name: 'Quảng Ninh', level: 'PROVINCE', gisCode: '22' },
  { id: 104, name: 'Không mã', level: 'PROVINCE' },
];

describe('provinceCodeOf / currentProvinceCodes', () => {
  it('ưu tiên gisCode của chính tỉnh', () => {
    expect(provinceCodeOf({ id: 999, name: 'x', gisCode: '31' }, catalog)).toBe('31');
  });

  it('backend cũ không có gisCode: dò qua id trong danh mục', () => {
    expect(provinceCodeOf({ id: 103, name: 'Quảng Ninh' }, catalog)).toBe('22');
  });

  it('không dò được thì null, và bị bỏ khỏi tập mã (không gửi mã rác)', () => {
    expect(provinceCodeOf({ id: 555, name: 'Lạ' }, catalog)).toBeNull();
    expect(
      currentProvinceCodes(
        [{ id: 101, name: 'a', gisCode: '01' }, { id: 555, name: 'Lạ' }, { id: 101, name: 'a', gisCode: '01' }],
        catalog,
      ),
    ).toEqual(['01']);
  });

  it('provinces undefined (backend cũ) → rỗng, không ném', () => {
    expect(currentProvinceCodes(undefined, catalog)).toEqual([]);
  });
});

describe('selectableProvinces', () => {
  it('chỉ giữ mục có gisCode', () => {
    expect(selectableProvinces(catalog).map((p) => p.gisCode)).toEqual(['01', '31', '22']);
  });
});

describe('buildProvinceSelection', () => {
  it('trả provinceCodes (khoá chính) kèm provinceIds tương ứng cho ảnh backend cũ', () => {
    expect(buildProvinceSelection(['22', '01'], catalog)).toEqual({
      provinceCodes: ['01', '22'],
      provinceIds: [101, 103],
    });
  });

  it('mã không có trong danh mục bị bỏ', () => {
    expect(buildProvinceSelection(['99'], catalog)).toEqual({ provinceCodes: [], provinceIds: [] });
  });

  it('chọn rỗng = hai mảng RỖNG (không phải undefined) để backend hiểu là "gỡ hết", không phải VAL_003', () => {
    const sel = buildProvinceSelection([], catalog);
    expect(Array.isArray(sel.provinceCodes)).toBe(true);
    expect(Array.isArray(sel.provinceIds)).toBe(true);
  });
});

describe('provincesFromCodes', () => {
  it('dựng lại tỉnh để hiện ngay sau khi lưu, kèm gisCode', () => {
    expect(provincesFromCodes(['31'], catalog)).toEqual([{ id: 102, name: 'Hải Phòng', gisCode: '31' }]);
  });
});

describe('provinceOptionLabel', () => {
  it('kèm tỉnh cũ đã sáp nhập khi tên không nhắc tới chúng', () => {
    expect(provinceOptionLabel(catalog[1])).toBe('Hải Phòng (gồm Hải Dương, Hải Phòng)');
  });

  it('không kèm khi tên đã chứa mọi tỉnh cũ', () => {
    expect(provinceOptionLabel({ name: 'Hà Nội', oldProvinces: ['Hà Nội'] })).toBe('Hà Nội');
    expect(provinceOptionLabel({ name: 'Quảng Ninh' })).toBe('Quảng Ninh');
  });
});

describe('driverLacksProvince', () => {
  it('đã duyệt + provinces rỗng → cảnh báo (bool và chuỗi đều là đã duyệt)', () => {
    expect(driverLacksProvince({ isApproved: true, provinces: [] })).toBe(true);
    expect(driverLacksProvince({ isApproved: 'true', provinces: [] })).toBe(true);
  });

  it('có tỉnh → không cảnh báo', () => {
    expect(driverLacksProvince({ isApproved: true, provinces: [{ id: 1, name: 'a' }] })).toBe(false);
  });

  it('chưa duyệt / bị từ chối → không cảnh báo (chưa tới bước bật Sẵn sàng)', () => {
    expect(driverLacksProvince({ isApproved: false, provinces: [] })).toBe(false);
    expect(driverLacksProvince({ isApproved: 'pending', provinces: [] })).toBe(false);
    expect(driverLacksProvince({ isApproved: false, rejectionReason: 'sai', provinces: [] })).toBe(false);
  });

  it('provinces vắng (backend cũ) hoặc driver null → không kết luận, không cảnh báo', () => {
    expect(driverLacksProvince({ isApproved: true })).toBe(false);
    expect(driverLacksProvince(null)).toBe(false);
    expect(driverLacksProvince(undefined)).toBe(false);
  });
});

describe('provinceFilterUnsupported', () => {
  it('không gửi lọc → không cảnh báo', () => {
    expect(provinceFilterUnsupported(undefined, {})).toBe(false);
  });

  it('backend echo đúng mã → hỗ trợ', () => {
    expect(provinceFilterUnsupported('31', { provinceCode: '31' })).toBe(false);
  });

  it('backend cũ không echo → báo chưa lọc', () => {
    expect(provinceFilterUnsupported('31', {})).toBe(true);
    expect(provinceFilterUnsupported('31', undefined)).toBe(true);
  });
});

describe('provinceSaveErrorMessage', () => {
  it('VAL_003 có câu tiếng Việt riêng', () => {
    const err = new ApiError({
      message: 'Vui lòng điền đầy đủ thông tin bắt buộc.',
      code: 'VAL_003',
      httpStatus: 400,
      path: 'PUT /drivers/admin/d1/provinces',
    });
    expect(provinceSaveErrorMessage(err)).toBe('Danh sách tỉnh chưa được gửi lên. Chọn lại tỉnh rồi bấm Lưu.');
  });

  it('mã khác dùng câu đã bóc của ApiError', () => {
    const err = new ApiError({ message: 'Bạn không có quyền.', code: 'AUTH_003', httpStatus: 403, path: 'x' });
    expect(provinceSaveErrorMessage(err)).toBe('Bạn không có quyền.');
  });

  it('giá trị lạ không ném', () => {
    expect(provinceSaveErrorMessage('boom')).toBe('Vui lòng thử lại.');
  });
});
