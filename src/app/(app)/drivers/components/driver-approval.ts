// Canonical driver approval-status rule, shared so callers don't hand-roll it.
//
// Backend stores `isApproved` as a boolean, but list payloads have shipped it as
// BOTH boolean and string ('true'/'false'/'pending'/'-') over time. A pending
// driver and a rejected driver BOTH have `isApproved=false`; the only signal that
// separates them is `rejectionReason` (set = rejected). Hand-rolling `=== 'true'`
// breaks when the value comes back as boolean (an approved driver then shows
// "Chờ duyệt"), which is exactly the bug this centralization prevents.

export type DriverApprovalStatus = 'approved' | 'rejected' | 'pending';

type ApprovalInput = { isApproved?: unknown; rejectionReason?: string | null } | null | undefined;

export function getDriverApprovalStatus(driver: ApprovalInput): DriverApprovalStatus {
  const v = driver?.isApproved;
  if (v === true || v === 'true') return 'approved';
  if (typeof driver?.rejectionReason === 'string' && driver.rejectionReason.trim().length > 0) return 'rejected';
  return 'pending';
}

const APPROVAL_LABEL: Record<DriverApprovalStatus, string> = {
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  pending: 'Chờ duyệt',
};

/** Vietnamese label for the driver's approval state (for export / plain text). */
export function driverApprovalLabel(driver: ApprovalInput): string {
  return APPROVAL_LABEL[getDriverApprovalStatus(driver)];
}
