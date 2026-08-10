import { describe, it, expect } from 'vitest';
import { buildExportRows, EXPORT_HEADER } from './driver-team-export';
import type { TeamDriverRow } from './types';

const drv = (id: string): TeamDriverRow => ({
  driverId: id,
  fullName: 'Nguyễn A',
  phone: '0900000001',
  transportCompanyName: 'HTX X',
  tripsOnRoute: 5,
  tripsAllRoutes: 9,
  shareOfRoute: 0.5,
  lastCompletedAt: '2026-08-09T15:12:00.000Z',
  firstCompletedAt: null,
  isApproved: true,
  isBanned: false,
  suspendedUntil: null,
  team: null,
});

describe('buildExportRows', () => {
  it('xuất PHẲNG có cột tuyến', () => {
    const { rows } = buildExportRows([{ routeName: 'HN – HP', driver: drv('d1') }]);
    expect(EXPORT_HEADER[0]).toBe('Tuyến');
    expect(rows[0][0]).toBe('HN – HP');
  });

  it('số chuyến giữ dạng SỐ để Excel sort/sum được', () => {
    const { rows } = buildExportRows([{ routeName: 'R', driver: drv('d1') }]);
    const idx = EXPORT_HEADER.indexOf('Chuyến trên tuyến');
    expect(typeof rows[0][idx]).toBe('number');
  });

  it('SĐT giữ dạng CHUỖI — ép sang số sẽ mất số 0 đầu', () => {
    const { rows } = buildExportRows([{ routeName: 'R', driver: drv('d1') }]);
    const idx = EXPORT_HEADER.indexOf('SĐT');
    expect(rows[0][idx]).toBe('0900000001');
  });

  it('chưa chạm tới hiện "Tiềm năng", không để trống', () => {
    const { rows } = buildExportRows([{ routeName: 'R', driver: drv('d1') }]);
    const idx = EXPORT_HEADER.indexOf('Trạng thái');
    expect(rows[0][idx]).toBe('Tiềm năng');
  });

  it('ngày trống ra ô rỗng, không ra dấu gạch', () => {
    const d = { ...drv('d1'), lastCompletedAt: null };
    const { rows } = buildExportRows([{ routeName: 'R', driver: d }]);
    const idx = EXPORT_HEADER.indexOf('Chuyến gần nhất');
    expect(rows[0][idx]).toBe('');
  });

  it('vượt cap thì CẮT và báo số dòng bị cắt', () => {
    const items = Array.from({ length: 1200 }, (_, i) => ({
      routeName: 'R',
      driver: drv(`d${i}`),
    }));
    const { rows, truncated } = buildExportRows(items, 1000);
    expect(rows).toHaveLength(1000);
    expect(truncated).toBe(200);
  });

  it('trong cap thì truncated = 0', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      routeName: 'R',
      driver: drv(`d${i}`),
    }));
    expect(buildExportRows(items, 1000).truncated).toBe(0);
  });

  it('số cột mỗi dòng khớp header', () => {
    const { rows } = buildExportRows([{ routeName: 'R', driver: drv('d1') }]);
    expect(rows[0]).toHaveLength(EXPORT_HEADER.length);
  });
});
