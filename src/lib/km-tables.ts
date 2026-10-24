// Bảng giá theo km (ghép / bao xe 4–5 chỗ / bao xe 7 chỗ) — MIRROR của vigo-backend
// `pricing/gia-theo-km-config.ts` + `gia-theo-km.util.ts`. Backend là nơi quyết định cuối (kiểm lại
// khi lưu); ở đây kiểm sớm để báo lỗi tại chỗ và để xem thử giá. Đổi rule bên này PHẢI đổi cả BE.

export const KM_TABLES_KEY = 'PRICING_KM_TABLES';

export type KmTableType = 'GHEP' | 'CAR_4' | 'CAR_7';
export const KM_TABLE_TYPES: readonly KmTableType[] = ['GHEP', 'CAR_4', 'CAR_7'];
export const KM_TABLE_LABEL: Record<KmTableType, string> = {
  GHEP: 'Ghép (giá một ghế)',
  CAR_4: 'Bao xe 4–5 chỗ (giá cả xe)',
  CAR_7: 'Bao xe 7 chỗ (giá cả xe)',
};

export type KmPoint = { km: number; price: number };
export type KmTable = { points: KmPoint[]; tailPerKm: number };
export type KmTables = Record<KmTableType, KmTable>;
export type KmTablesResponse = {
  version: number;
  /** `default` = chưa chỉnh lần nào; `invalid` = bản lưu hỏng, backend đang dùng mặc định. */
  source: 'default' | 'db' | 'invalid';
  reason?: string;
  tables: KmTables;
};

export const KM_MAX_POINTS = 20;
export const KM_MAX_KM = 5_000;
export const KM_MAX_PRICE = 50_000_000;
export const KM_MAX_TAIL_PER_KM = 1_000_000;

/** Kiểm một bảng; trả danh sách lỗi (rỗng = hợp lệ). */
export function validateKmTable(t: KmTable): string[] {
  const errs: string[] = [];
  const p = t.points;
  if (p.length < 2 || p.length > KM_MAX_POINTS) errs.push(`Cần từ 2 đến ${KM_MAX_POINTS} mốc`);
  p.forEach((m, i) => {
    const n = i + 1;
    if (!Number.isFinite(m.km) || m.km <= 0 || m.km > KM_MAX_KM) {
      errs.push(`Mốc ${n}: số km phải lớn hơn 0 và không quá ${KM_MAX_KM}`);
    }
    if (!Number.isInteger(m.price) || m.price <= 0 || m.price > KM_MAX_PRICE) {
      errs.push(`Mốc ${n}: giá phải là số nguyên đồng lớn hơn 0 và không quá ${KM_MAX_PRICE.toLocaleString('vi-VN')}`);
    }
    if (i > 0) {
      if (m.km <= p[i - 1].km) errs.push(`Mốc ${n}: số km phải lớn hơn mốc ${n - 1}`);
      if (m.price < p[i - 1].price) errs.push(`Mốc ${n}: giá không được thấp hơn mốc ${n - 1}`);
    }
  });
  if (!Number.isFinite(t.tailPerKm) || t.tailPerKm < 0 || t.tailPerKm > KM_MAX_TAIL_PER_KM) {
    errs.push(`Đơn giá/km sau mốc cuối phải từ 0 đến ${KM_MAX_TAIL_PER_KM.toLocaleString('vi-VN')}`);
  }
  return errs;
}

function rawOne(km: number, t: KmTable): number {
  const p = t.points;
  if (km <= p[0].km) return p[0].price;
  for (let i = 1; i < p.length; i++) {
    if (km <= p[i].km) {
      const a = p[i - 1];
      const b = p[i];
      // Dạng chia dốc TRƯỚC rồi nhân — giống BE để cùng số đến từng đồng.
      return a.price + (km - a.km) * ((b.price - a.price) / (b.km - a.km));
    }
  }
  const last = p[p.length - 1];
  return last.price + (km - last.km) * t.tailPerKm;
}

/** Giá khách trả (đã làm tròn nghìn, ghép bị chặn trần bởi CAR_4) — để xem thử trước khi lưu. */
export function previewKmPrice(km: number, type: KmTableType, tables: KmTables): number {
  let g = rawOne(km, tables[type]);
  if (type === 'GHEP') g = Math.min(g, rawOne(km, tables.CAR_4));
  return Math.round(g / 1000) * 1000;
}

/** Những km mà trần CAR_4 đang kéo giá ghép xuống thấp hơn bảng ghép tự nó (để cảnh báo). */
export function ghepBiTranKeoXuong(tables: KmTables): number[] {
  const out: number[] = [];
  for (const m of tables.GHEP.points) {
    if (rawOne(m.km, tables.CAR_4) < m.price) out.push(m.km);
  }
  return out;
}

export function serializeKmTables(version: number, tables: KmTables): string {
  return JSON.stringify({ version, tables });
}

/**
 * Xếp mốc theo km tăng dần (ổn định). Dùng khi admin nhập xong km của một dòng mới thêm để dòng đó tự
 * vào đúng chỗ ở giữa; các mốc khác giữ nguyên số. Dòng km chưa hợp lệ (NaN) để nguyên chỗ.
 */
export function sortPointsByKm(table: KmTable): KmTable {
  if (table.points.some((p) => !Number.isFinite(p.km))) return table;
  const points = table.points.map((p, i) => ({ p, i })).sort((a, b) => a.p.km - b.p.km || a.i - b.i).map((x) => x.p);
  return points.every((p, i) => p === table.points[i]) ? table : { ...table, points };
}
