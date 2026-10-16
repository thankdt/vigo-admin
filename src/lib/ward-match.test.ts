import { describe, expect, it } from 'vitest';
import { wardsToEndpoints } from './ward-match';

const wards = [{ code: '13285', name: 'Phường Phủ Lý', provinceCode: '35' }];

describe('wardsToEndpoints', () => {
  it('đổi xã sang điểm đón/trả có nhãn "Tên (Tỉnh)", bỏ mã lạ', () => {
    const e = wardsToEndpoints(['13285', 'x'], wards, new Map([['35', 'Ninh Bình']]));
    expect(e).toEqual([{ provinceCode: '35', wardCode: '13285', label: 'Phường Phủ Lý (Ninh Bình)' }]);
  });
});
