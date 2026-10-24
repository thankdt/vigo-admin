import { describe, it, expect } from 'vitest';
import { ghepBiTranKeoXuong, previewKmPrice, validateKmTable, type KmTables } from './km-tables';

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
