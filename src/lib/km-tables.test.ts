import { describe, it, expect } from 'vitest';
import { ghepBiTranKeoXuong, sortPointsByKm, previewKmPrice, validateKmTable, type KmTable, type KmTables } from './km-tables';

const T: KmTables = {
  GHEP: { points: [{ km: 50, price: 200_000 }, { km: 100, price: 300_000 }], tailPerKm: 1_400 },
  CAR_4: { points: [{ km: 10, price: 150_000 }, { km: 50, price: 500_000 }], tailPerKm: 5_500 },
  CAR_7: { points: [{ km: 10, price: 180_000 }, { km: 50, price: 650_000 }], tailPerKm: 5_500 },
};

describe('validateKmTable', () => {
  it('bảng hợp lệ ⇒ không lỗi', () => expect(validateKmTable(T.CAR_4)).toEqual([]));
  it('km không tăng', () => {
    expect(validateKmTable({ points: [{ km: 10, price: 1000 }, { km: 10, price: 2000 }], tailPerKm: 0 })).toHaveLength(1);
  });
  it('giá giảm', () => {
    expect(validateKmTable({ points: [{ km: 10, price: 2000 }, { km: 20, price: 1000 }], tailPerKm: 0 })).toHaveLength(1);
  });
  it('dưới 2 mốc, giá lẻ, giá 0, đuôi âm', () => {
    expect(validateKmTable({ points: [{ km: 10, price: 1000 }], tailPerKm: 0 }).length).toBeGreaterThan(0);
    expect(validateKmTable({ points: [{ km: 1, price: 1000.5 }, { km: 2, price: 2000 }], tailPerKm: 0 }).length).toBeGreaterThan(0);
    expect(validateKmTable({ points: [{ km: 1, price: 0 }, { km: 2, price: 2000 }], tailPerKm: 0 }).length).toBeGreaterThan(0);
    expect(validateKmTable({ points: [{ km: 1, price: 1000 }, { km: 2, price: 2000 }], tailPerKm: -1 }).length).toBeGreaterThan(0);
  });
});

describe('previewKmPrice', () => {
  it('sàn, nội suy, đuôi, làm tròn nghìn', () => {
    expect(previewKmPrice(5, 'CAR_4', T)).toBe(150_000);
    expect(previewKmPrice(30, 'CAR_4', T)).toBe(325_000);
    expect(previewKmPrice(60, 'CAR_4', T)).toBe(555_000);
    expect(previewKmPrice(75, 'GHEP', T)).toBe(250_000);
  });
  it('trần ghép ≤ CAR_4', () => {
    expect(previewKmPrice(10, 'GHEP', T)).toBe(150_000);
  });
});

describe('ghepBiTranKeoXuong', () => {
  it('báo mốc ghép bị CAR_4 kéo xuống', () => {
    expect(ghepBiTranKeoXuong(T)).toEqual([]);
    const low: KmTables = { ...T, CAR_4: { points: [{ km: 10, price: 100_000 }, { km: 50, price: 120_000 }], tailPerKm: 0 } };
    expect(ghepBiTranKeoXuong(low)).toEqual([50, 100]);
  });
});

describe('sortPointsByKm', () => {
  it('dòng mới thêm cuối có km ở giữa ⇒ vào đúng chỗ, mốc khác giữ nguyên', () => {
    const t: KmTable = {
      points: [{ km: 10, price: 150_000 }, { km: 50, price: 500_000 }, { km: 30, price: 325_000 }],
      tailPerKm: 0,
    };
    expect(sortPointsByKm(t).points.map((p) => p.km)).toEqual([10, 30, 50]);
    expect(sortPointsByKm(t).points[2]).toEqual({ km: 50, price: 500_000 });
  });
  it('đã đúng thứ tự hoặc km chưa nhập (NaN) ⇒ không đổi', () => {
    expect(sortPointsByKm(T.CAR_4)).toBe(T.CAR_4);
    const nan: KmTable = { points: [{ km: 10, price: 1 }, { km: NaN, price: 2 }], tailPerKm: 0 };
    expect(sortPointsByKm(nan)).toBe(nan);
  });
});
