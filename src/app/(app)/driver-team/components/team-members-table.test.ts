import { describe, it, expect } from 'vitest';
import { sortMembersByJoinDate } from './team-members-table';
import { commissionRateLabel } from '@/lib/driver-team-labels';
import { buildMemberExportRows, MEMBER_EXPORT_HEADER } from '@/lib/driver-team-export';
import type { TeamMemberRow } from '@/lib/types';

const member = (o: Partial<TeamMemberRow> = {}): TeamMemberRow => ({
  driverId: 'd1',
  fullName: 'Nguyễn A',
  phone: '0900000001',
  stage: 'JOINED',
  commissionRate: null,
  ownerAdminUserId: null,
  ownerName: null,
  assignedRouteIds: [],
  assignedRouteNames: [],
  nextFollowUpAt: null,
  stageChangedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  completedTripsInRange: 0,
  lastCompletedAt: null,
  ...o,
});

describe('sortMembersByJoinDate', () => {
  it('tài chưa chạy chuyến nào ⇒ cột "Chuyến trong kỳ" hiện 0, KHÔNG ẩn dòng', () => {
    const rows = [member({ driverId: 'd1', completedTripsInRange: 0 })];
    const sorted = sortMembersByJoinDate(rows);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].completedTripsInRange).toBe(0);
  });

  it('sắp xếp mặc định: người vào team gần nhất lên đầu', () => {
    const older = member({
      driverId: 'older',
      stageChangedAt: '2026-01-01T00:00:00.000Z',
    });
    const newer = member({
      driverId: 'newer',
      stageChangedAt: '2026-06-01T00:00:00.000Z',
    });
    const sorted = sortMembersByJoinDate([older, newer]);
    expect(sorted[0].driverId).toBe('newer');
    expect(sorted[1].driverId).toBe('older');
  });

  it('chưa từng đổi stage (stageChangedAt null) ⇒ dùng createdAt để xếp', () => {
    const older = member({ driverId: 'older', stageChangedAt: null, createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = member({ driverId: 'newer', stageChangedAt: null, createdAt: '2026-06-01T00:00:00.000Z' });
    const sorted = sortMembersByJoinDate([older, newer]);
    expect(sorted[0].driverId).toBe('newer');
  });

  it('không đổi mảng gốc (thuần, không mutate)', () => {
    const rows = [member({ driverId: 'a' }), member({ driverId: 'b' })];
    const copy = [...rows];
    sortMembersByJoinDate(rows);
    expect(rows).toEqual(copy);
  });
});

describe('commissionRateLabel — null vs 0 PHẢI khác nhau', () => {
  it('null ⇒ "Mức chung", không cảnh báo', () => {
    expect(commissionRateLabel(null)).toEqual({ text: 'Mức chung', warn: false });
  });

  it('undefined ⇒ cũng "Mức chung"', () => {
    expect(commissionRateLabel(undefined)).toEqual({ text: 'Mức chung', warn: false });
  });

  it('0 ⇒ "0%" kèm cờ cảnh báo — KHÔNG được lẫn với "Mức chung"', () => {
    expect(commissionRateLabel(0)).toEqual({ text: '0%', warn: true });
  });

  it('mức riêng dương ⇒ hiện % thường, không cảnh báo', () => {
    expect(commissionRateLabel(0.1)).toEqual({ text: '10%', warn: false });
    expect(commissionRateLabel(0.15)).toEqual({ text: '15%', warn: false });
  });
});

describe('buildMemberExportRows', () => {
  it('xuất Excel có cột % hoa hồng', () => {
    expect(MEMBER_EXPORT_HEADER).toContain('% hoa hồng');
  });

  it('null ⇒ "Mức chung" trong file xuất', () => {
    const { rows } = buildMemberExportRows([member({ commissionRate: null })]);
    const idx = MEMBER_EXPORT_HEADER.indexOf('% hoa hồng');
    expect(rows[0][idx]).toBe('Mức chung');
  });

  it('0 ⇒ "0%" trong file xuất, không lẫn với "Mức chung"', () => {
    const { rows } = buildMemberExportRows([member({ commissionRate: 0 })]);
    const idx = MEMBER_EXPORT_HEADER.indexOf('% hoa hồng');
    expect(rows[0][idx]).toBe('0%');
  });

  it('vượt cap thì CẮT và báo số dòng bị cắt', () => {
    const rows = Array.from({ length: 1200 }, (_, i) => member({ driverId: `d${i}` }));
    const { rows: kept, truncated } = buildMemberExportRows(rows, 1000);
    expect(kept).toHaveLength(1000);
    expect(truncated).toBe(200);
  });

  it('số cột mỗi dòng khớp header', () => {
    const { rows } = buildMemberExportRows([member()]);
    expect(rows[0]).toHaveLength(MEMBER_EXPORT_HEADER.length);
  });
});
