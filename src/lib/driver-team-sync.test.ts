import { describe, it, expect } from 'vitest';
import { countUniqueByStage, patchDriverAcrossGroups } from './driver-team-sync';
import type { TeamDriverRow, TeamMemberState } from './types';

const row = (driverId: string, stage: any = null): TeamDriverRow => ({
  driverId,
  fullName: 'A',
  phone: '09',
  transportCompanyName: null,
  tripsInProvince: 1,
  tripsAll: 1,
  shareOfProvince: 1,
  lastCompletedAt: null,
  firstCompletedAt: null,
  isApproved: true,
  isBanned: false,
  suspendedUntil: null,
  team: stage
    ? ({
        stage,
        assignedProvinceCodes: [],
        ownerAdminUserId: null,
        ownerAdminName: null,
        nextFollowUpAt: null,
        note: null,
        stageChangedAt: null,
      } as TeamMemberState)
    : null,
});

const joined: TeamMemberState = {
  stage: 'JOINED',
  assignedProvinceCodes: ['31'],
  ownerAdminUserId: null,
  ownerAdminName: null,
  nextFollowUpAt: null,
  note: null,
  stageChangedAt: null,
};

describe('patchDriverAcrossGroups', () => {
  it('cập nhật tài ở MỌI nhóm đang mở, không chỉ nhóm vừa bấm', () => {
    const groups = { '31': [row('d1'), row('d2')], '22': [row('d1')] };

    const out = patchDriverAcrossGroups(groups, 'd1', joined);

    expect(out['31'][0].team?.stage).toBe('JOINED');
    expect(out['22'][0].team?.stage).toBe('JOINED');
  });

  it('không đụng tài khác', () => {
    const groups = { '31': [row('d1'), row('d2', 'CONTACTED')] };
    const out = patchDriverAcrossGroups(groups, 'd1', joined);
    expect(out['31'][1].team?.stage).toBe('CONTACTED');
  });

  it('giữ nguyên số liệu chuyến của từng nhóm — chỉ phần team thay đổi', () => {
    const groups = {
      '31': [{ ...row('d1'), tripsInProvince: 40 }],
      '22': [{ ...row('d1'), tripsInProvince: 3 }],
    };
    const out = patchDriverAcrossGroups(groups, 'd1', joined);
    expect(out['31'][0].tripsInProvince).toBe(40);
    expect(out['22'][0].tripsInProvince).toBe(3);
  });

  it('trả object MỚI (không mutate) để React thấy thay đổi', () => {
    const groups = { '31': [row('d1')] };
    const out = patchDriverAcrossGroups(groups, 'd1', joined);
    expect(out).not.toBe(groups);
    expect(groups['31'][0].team).toBeNull();
  });

  it('tài "Tiềm năng" (team null) cũng được cập nhật', () => {
    const groups = { '31': [row('d1')] };
    const out = patchDriverAcrossGroups(groups, 'd1', joined);
    expect(out['31'][0].team?.stage).toBe('JOINED');
  });
});

describe('countUniqueByStage', () => {
  it('tài xuất hiện ở 3 nhóm chỉ đếm 1 lần', () => {
    const groups = {
      '31': [row('d1', 'JOINED')],
      '22': [row('d1', 'JOINED')],
      '15': [row('d1', 'JOINED'), row('d2', 'JOINED')],
    };
    expect(countUniqueByStage(groups, 'JOINED')).toBe(2);
  });
});
