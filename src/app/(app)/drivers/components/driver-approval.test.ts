import { describe, it, expect } from 'vitest';
import { getDriverApprovalStatus, driverApprovalLabel } from './driver-approval';

describe('getDriverApprovalStatus', () => {
  it('treats boolean true and string "true" as approved', () => {
    expect(getDriverApprovalStatus({ isApproved: true })).toBe('approved');
    expect(getDriverApprovalStatus({ isApproved: 'true' })).toBe('approved');
  });

  it('boolean/string false WITHOUT rejectionReason is pending (not rejected)', () => {
    expect(getDriverApprovalStatus({ isApproved: false })).toBe('pending');
    expect(getDriverApprovalStatus({ isApproved: 'false' })).toBe('pending');
  });

  it('false WITH a rejectionReason is rejected', () => {
    expect(getDriverApprovalStatus({ isApproved: false, rejectionReason: 'Thiếu giấy tờ' })).toBe('rejected');
    expect(getDriverApprovalStatus({ isApproved: 'false', rejectionReason: 'x' })).toBe('rejected');
  });

  it('ignores a blank/whitespace rejectionReason', () => {
    expect(getDriverApprovalStatus({ isApproved: false, rejectionReason: '   ' })).toBe('pending');
    expect(getDriverApprovalStatus({ isApproved: false, rejectionReason: null })).toBe('pending');
  });

  it('defaults to pending for unknown/missing values', () => {
    expect(getDriverApprovalStatus({ isApproved: 'pending' })).toBe('pending');
    expect(getDriverApprovalStatus({})).toBe('pending');
    expect(getDriverApprovalStatus(null)).toBe('pending');
  });
});

describe('driverApprovalLabel', () => {
  it('maps each state to its Vietnamese label', () => {
    expect(driverApprovalLabel({ isApproved: true })).toBe('Đã duyệt');
    expect(driverApprovalLabel({ isApproved: false, rejectionReason: 'x' })).toBe('Từ chối');
    expect(driverApprovalLabel({ isApproved: false })).toBe('Chờ duyệt');
  });
});
