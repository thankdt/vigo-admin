import { describe, it, expect } from 'vitest';
import { countUniqueByStage, patchDriverAcrossGroups } from './driver-team-sync';
import type { TeamDriverRow, TeamMemberState } from './types';

const row = (driverId: string, stage: any = null): TeamDriverRow => ({
  driverId,
  fullName: 'A',
  phone: '09',
  transportCompanyName: null,
  tripsOnRoute: 1,
  tripsAllRoutes: 1,
  shareOfRoute: 1,
  lastCompletedAt: null,
  firstCompletedAt: null,
  isApproved: true,
  isBanned: false,
  suspendedUntil: null,
  team: stage
    ? ({
        stage,
        assignedRouteIds: [],
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
  assignedRouteIds: [7],
  ownerAdminUserId: null,
  ownerAdminName: null,
  nextFollowUpAt: null,
  note: null,
  stageChangedAt: null,
};

describe('patchDriverAcrossGroups', () => {
  it('cập nhật tài ở MỌI nhóm đang mở, không chỉ nhóm vừa bấm', () => {
    const groups = { '7': [row('d1'), row('d2')], '12': [row('d1')] };

    const out = patchDriverAcrossGroups(groups, 'd1', joined);

    expect(out['7'][0].team?.stage).toBe('JOINED');
    expect(out['12'][0].team?.stage).toBe('JOINED');
  });

  it('không đụng tài khác', () => {
    const groups = { '7': [row('d1'), row('d2', 'CONTACTED')] };
    const out = patchDriverAcrossGroups(groups, 'd1', joined);
    expect(out['7'][1].team?.stage).toBe('CONTACTED');
  });

  it('giữ nguyên số liệu chuyến của từng nhóm — chỉ phần team thay đổi', () => {
    const groups = {
      '7': [{ ...row('d1'), tripsOnRoute: 40 }],
      '12': [{ ...row('d1'), tripsOnRoute: 3 }],
    };
    const out = patchDriverAcrossGroups(groups, 'd1', joined);
    expect(out['7'][0].tripsOnRoute).toBe(40);
    expect(out['12'][0].tripsOnRoute).toBe(3);
  });

  it('trả object MỚI (không mutate) để React thấy thay đổi', () => {
    const groups = { '7': [row('d1')] };
    const out = patchDriverAcrossGroups(groups, 'd1', joined);
    expect(out).not.toBe(groups);
    expect(groups['7'][0].team).toBeNull();
  });

  it('tài "Tiềm năng" (team null) cũng được cập nhật', () => {
    const groups = { '7': [row('d1')] };
    const out = patchDriverAcrossGroups(groups, 'd1', joined);
    expect(out['7'][0].team?.stage).toBe('JOINED');
  });
});

describe('countUniqueByStage', () => {
  it('tài xuất hiện ở 3 nhóm chỉ đếm 1 lần', () => {
    const groups = {
      '7': [row('d1', 'JOINED')],
      '12': [row('d1', 'JOINED')],
      '15': [row('d1', 'JOINED'), row('d2', 'JOINED')],
    };
    expect(countUniqueByStage(groups, 'JOINED')).toBe(2);
  });
});
