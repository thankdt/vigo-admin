import { describe, it, expect } from 'vitest';
import { compareVi, sortByNameVi } from './vi-sort';

describe('compareVi — thứ tự tiếng Việt', () => {
  it('đ đứng ngay sau d, không dồn xuống cuối bảng chữ cái', () => {
    expect(compareVi('Dân Tiến', 'Đại Từ')).toBeLessThan(0);
    expect(compareVi('Đại Từ', 'Điềm Thuỵ')).toBeLessThan(0);
    expect(compareVi('Đức Xuân', 'Ea Kar')).toBeLessThan(0);
    expect(compareVi('Đức Xuân', 'Yên Bình')).toBeLessThan(0);
  });

  it('nguyên âm có dấu đứng sau nguyên âm gốc: a < ă < â', () => {
    expect(compareVi('Ba Bể', 'Bắc Kạn')).toBeLessThan(0);
    expect(compareVi('Bắc Kạn', 'Bân')).toBeLessThan(0);
  });

  it('ă, â là CHỮ CÁI RIÊNG (khác tiếng Anh chỉ coi là «a» có dấu): «Ăn» đứng SAU «Ap» dù "n" < "p"', () => {
    // Phép thử phân biệt locale: sắp kiểu tiếng Anh sẽ cho «Ăn» < «Ap» (so "a" = "a" rồi "n" < "p").
    expect(compareVi('Ăn', 'Ap')).toBeGreaterThan(0);
    expect(compareVi('Ân', 'Ăp')).toBeGreaterThan(0);
    expect(compareVi('Ap', 'Ăn')).toBeLessThan(0);
  });
});

describe('sortByNameVi', () => {
  // Thứ tự máy chủ thật (C.UTF-8): chữ có dấu đặc biệt dồn về cuối. Hàm (không phải hằng) để mỗi test nhận
  // mảng MỚI — nếu dùng chung, một test lỡ sắp tại chỗ sẽ làm test "không sửa đầu vào" so với bản đã sắp.
  const fromServer = () => [
    { code: '1', name: 'An Khánh' },
    { code: '2', name: 'Dân Tiến' },
    { code: '3', name: 'Yên Trạch' },
    { code: '4', name: 'Điềm Thuỵ' },
    { code: '5', name: 'Đại Phúc' },
    { code: '6', name: 'Đại Từ' },
    { code: '7', name: 'Đức Xuân' },
  ];

  it('đưa Đ về đúng chỗ (sau D, trước E…Y), không còn nằm cuối', () => {
    const names = sortByNameVi(fromServer()).map((w) => w.name);
    expect(names).toEqual(['An Khánh', 'Dân Tiến', 'Đại Phúc', 'Đại Từ', 'Điềm Thuỵ', 'Đức Xuân', 'Yên Trạch']);
  });

  it('không sửa mảng đầu vào', () => {
    const input = fromServer();
    sortByNameVi(input);
    expect(input).toEqual(fromServer());
  });

  it('trùng tên (khác tỉnh) thì xếp theo mã để thứ tự ổn định', () => {
    const out = sortByNameVi([
      { code: '20', name: 'Phú Bình' },
      { code: '10', name: 'Phú Bình' },
    ]);
    expect(out.map((w) => w.code)).toEqual(['10', '20']);
  });

  it('dòng null/không phải object bị bỏ, KHÔNG ném (một dòng hỏng không được làm hỏng cả lời gọi API)', () => {
    const out = sortByNameVi([null, { code: '2', name: 'Đại Từ' }, undefined, { code: '1', name: 'An Khánh' }, 7] as unknown as { name: string; code: string }[]);
    expect(out.map((w) => w.name)).toEqual(['An Khánh', 'Đại Từ']);
  });

  it('không phải mảng (API trả lỗi/null) thì trả nguyên, không ném', () => {
    expect(sortByNameVi(null as unknown as { name: string; code: string }[])).toBeNull();
    expect(sortByNameVi(undefined as unknown as { name: string; code: string }[])).toBeUndefined();
    expect(sortByNameVi([])).toEqual([]);
  });
});
