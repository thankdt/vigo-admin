import { describe, it, expect } from 'vitest';
import { DRIVER_EXPORT_HEADER, driverExportRows } from './driver-export';
import type { Driver } from '@/lib/types';

const base = (over: Partial<Driver> = {}): Driver => ({ id: 'd1', isApproved: 'true', ...over } as Driver);

describe('driverExportRows', () => {
  it('builds a row aligned with the header (full driver)', () => {
    const rows = driverExportRows([
      base({
        name: 'Nguyễn Văn A',
        phone: '0901234567',
        vehicleRegistration: { plateNumber: '29A-12345', brand: 'Toyota', model: 'Vios', color: 'Đen', seats: 4 },
        routes: [{ id: 1, name: 'Hà Nội — Thái Nguyên' }],
        isApproved: 'true',
        status: 'ONLINE',
        createdAt: '2026-06-26T01:00:00.000Z', // +7h → 08:00 26/06 VN
      }),
    ]);
    expect(rows[0]).toHaveLength(DRIVER_EXPORT_HEADER.length);
    expect(rows[0]).toEqual([
      1, 'Nguyễn Văn A', '0901234567', '29A-12345', 'Toyota Vios (4 chỗ)',
      'Hà Nội — Thái Nguyên', 'Đã duyệt', 'Online', '26/06/2026',
    ]);
  });

  it('falls back through user.* and vehicle.* when primary fields are absent', () => {
    const [row] = driverExportRows([
      base({
        name: undefined,
        user: { id: 'u1', fullName: 'Trần B', phone: '0988888888' },
        vehicle: { id: 2, plateNumber: '30F-99999', model: 'Innova' },
        fixedRoute: { id: 9, name: 'Tuyến lẻ' },
        isApproved: 'pending',
        status: 'OFFLINE',
      }),
    ]);
    expect(row[1]).toBe('Trần B'); // user.fullName
    expect(row[2]).toBe('0988888888'); // user.phone
    expect(row[3]).toBe('30F-99999'); // vehicle.plateNumber
    expect(row[4]).toBe('Innova'); // model only, no brand/seats
    expect(row[5]).toBe('Tuyến lẻ'); // fixedRoute fallback
    expect(row[6]).toBe('Chờ duyệt');
    expect(row[7]).toBe('Offline');
  });

  it('maps approval + online states; tolerates missing optional fields', () => {
    const rows = driverExportRows([
      // isApproved=false WITH a rejectionReason → rejected (see driver-approval rule)
      base({ isApproved: 'false', rejectionReason: 'Thiếu giấy tờ', status: 'BUSY' } as any),
      base({ id: 'd2', isApproved: true }),
    ]);
    expect(rows[0][6]).toBe('Từ chối');
    expect(rows[0][7]).toBe('Bận');
    expect(rows[0][8]).toBe(''); // no createdAt → empty
    expect(rows[1][6]).toBe('Đã duyệt'); // boolean true
    expect(rows[1][0]).toBe(2); // STT increments
    expect(rows[0][4]).toBe(''); // no vehicle → empty loại xe
  });

  it('returns an empty array for no drivers', () => {
    expect(driverExportRows([])).toEqual([]);
  });
});
