import { describe, it, expect } from 'vitest';
import { geoFilterParams, legacyRouteFilterOptions, provinceFilterOptions } from './geo-filter';

describe('geoFilterParams', () => {
  it('ALL/ALL không gửi tham số nào (màn vẫn chạy khi backend chưa có bộ lọc tỉnh)', () => {
    expect(geoFilterParams('ALL', 'ALL')).toEqual({});
  });

  it('mã tỉnh đi qua nguyên văn dưới tên provinceCode, kể cả sentinel "none"', () => {
    expect(geoFilterParams('01', 'ALL')).toEqual({ provinceCode: '01' });
    expect(geoFilterParams('none', 'ALL')).toEqual({ provinceCode: 'none' });
  });

  it('tuyến cũ là routeId SỐ; giá trị không phải số bị bỏ, không thành NaN', () => {
    expect(geoFilterParams('ALL', '12')).toEqual({ routeId: 12 });
    expect(geoFilterParams('ALL', 'abc')).toEqual({});
  });

  it('hai bộ lọc dùng đồng thời được (tỉnh + tuyến cũ cho dữ liệu lịch sử)', () => {
    expect(geoFilterParams('31', '7')).toEqual({ provinceCode: '31', routeId: 7 });
  });

  it('không còn gửi routeId="none" — chuyến mới đều không có tuyến nên sentinel đó vô nghĩa', () => {
    expect(geoFilterParams('ALL', 'none')).toEqual({});
  });
});

describe('filter options', () => {
  it('tỉnh: "Tất cả tỉnh", "Thiếu mã tỉnh", rồi từng tỉnh theo mã', () => {
    expect(provinceFilterOptions([{ code: '01', name: 'Nội đô Hà Nội' }, { code: '31', name: 'Hải Phòng' }])).toEqual([
      { value: 'ALL', label: 'Tất cả tỉnh' },
      { value: 'none', label: 'Thiếu mã tỉnh' },
      { value: '01', label: 'Nội đô Hà Nội' },
      { value: '31', label: 'Hải Phòng' },
    ]);
  });

  it('chưa tải được tỉnh thì chỉ còn hai lựa chọn cố định', () => {
    expect(provinceFilterOptions([]).map((o) => o.value)).toEqual(['ALL', 'none']);
  });

  it('tuyến cũ: nhãn nói rõ "cũ", không có mục "Chưa có tuyến"', () => {
    const o = legacyRouteFilterOptions([{ id: 3, name: 'Hà Nội - Hải Dương' }]);
    expect(o).toEqual([
      { value: 'ALL', label: 'Tất cả tuyến cũ' },
      { value: '3', label: 'Hà Nội - Hải Dương' },
    ]);
  });
});
