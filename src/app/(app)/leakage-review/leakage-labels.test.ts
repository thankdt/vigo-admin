import { describe, it, expect } from 'vitest';
import {
  VERDICT_LABEL,
  STATUS_LABEL,
  verdictBadgeClass,
  statusBadgeVariant,
  formatVnDateTime,
  describeEvidence,
  addressText,
} from './leakage-labels';

describe('leakage-labels', () => {
  it('labels verdicts/statuses in Vietnamese (no raw enum leaks)', () => {
    expect(VERDICT_LABEL.PICKUP_DROPOFF_UNEXPLAINED).toBe('Đi đón→đến, không giải thích được');
    expect(VERDICT_LABEL.PICKUP_ONLY).toBe('Chỉ ghé gần điểm đón');
    expect(VERDICT_LABEL.WENT_DARK).toBe('Mất định vị sau khi huỷ');
    expect(STATUS_LABEL.NEW).toBe('Mới');
    expect(STATUS_LABEL.CONFIRMED).toBe('Đã xác nhận gian lận');
  });

  it('badge colour encodes severity and always ships a dark: variant', () => {
    expect(verdictBadgeClass('PICKUP_DROPOFF_UNEXPLAINED')).toContain('dark:');
    expect(verdictBadgeClass('PICKUP_ONLY')).toContain('dark:');
    expect(verdictBadgeClass('WENT_DARK')).toContain('dark:');
    // HIGH must not look like LOW
    expect(verdictBadgeClass('PICKUP_DROPOFF_UNEXPLAINED')).not.toBe(verdictBadgeClass('PICKUP_ONLY'));
  });

  it('pins a hover background — Badge default cva ships hover:bg-primary/80 which tailwind-merge will NOT strip', () => {
    // Without this, hovering a row flips every badge to primary and HIGH looks like LOW.
    (['PICKUP_DROPOFF_UNEXPLAINED', 'PICKUP_ONLY', 'WENT_DARK'] as const).forEach((v) => {
      expect(verdictBadgeClass(v)).toMatch(/(^|\s)hover:bg-/);
      expect(verdictBadgeClass(v)).toMatch(/dark:hover:bg-/);
    });
  });

  it('maps trace status to a badge variant', () => {
    expect(statusBadgeVariant('CONFIRMED')).toBe('destructive');
    expect(statusBadgeVariant('DISMISSED')).toBe('outline');
    expect(statusBadgeVariant('NEW')).toBe('default');
  });

  it('formats VN time, tolerating null', () => {
    expect(formatVnDateTime(null)).toBe('—');
    expect(formatVnDateTime(undefined)).toBe('—');
    // 02:00Z === 09:00 VN (UTC+7)
    expect(formatVnDateTime('2026-07-15T02:00:00Z')).toContain('09:00');
    expect(formatVnDateTime('2026-07-15T02:00:00Z')).toContain('15/07/2026');
  });

  it('formatVnDateTime is browser-timezone independent (explicit VN zone)', () => {
    // 2026-07-14T18:30:00Z is 2026-07-15 01:30 VN — the VN date must roll over
    expect(formatVnDateTime('2026-07-14T18:30:00Z')).toContain('15/07/2026');
  });

  it('describeEvidence explains the serving tags in plain Vietnamese, incl. coords', () => {
    const lines = describeEvidence({
      nearPickupAt: '2026-07-15T02:00:00Z',
      nearPickupServing: false,
      nearDropoffAt: '2026-07-15T02:40:00Z',
      nearDropoffServing: false,
      wentDark: false,
      pickupHit: { ts: '2026-07-15T02:00:00Z', lat: 21, lng: 105.8, distanceM: 120, servingAtHit: false },
    });
    const all = lines.join(' | ');
    expect(all).toContain('không chở khách nào của hệ thống');
    expect(all).toContain('120m');
    expect(all).toContain('09:00');
  });

  it('describeEvidence marks a hit that WAS serving as explained', () => {
    const lines = describeEvidence({ nearPickupAt: '2026-07-15T02:00:00Z', nearPickupServing: true });
    expect(lines.join(' | ')).toContain('đang chở khách của hệ thống');
  });

  it('qualifies the distance with the GPS staleness bound (backend refuses to claim exact age)', () => {
    const lines = describeEvidence({
      nearPickupAt: '2026-07-15T02:00:00Z',
      nearPickupServing: false,
      pickupHit: { ts: '2026-07-15T02:00:00Z', lat: 21, lng: 105.8, distanceM: 120, servingAtHit: false, maxSampleAgeSec: 180 },
    });
    expect(lines.join(' | ')).toContain('mẫu GPS có thể cũ tới 180s');
  });

  it('unknown serving state is NOT reported as suspicious', () => {
    const lines = describeEvidence({ nearPickupAt: '2026-07-15T02:00:00Z', nearPickupServing: null });
    expect(lines.join(' | ')).toContain('không rõ');
    expect(lines.join(' | ')).not.toContain('đáng ngờ');
  });

  it('describeEvidence reports went-dark and tolerates empty/null evidence', () => {
    expect(describeEvidence({ wentDark: true }).join(' ')).toContain('Mất tín hiệu');
    expect(describeEvidence(null)).toEqual([]);
    expect(describeEvidence(undefined)).toEqual([]);
  });

  it('addressText falls back through address shapes and never throws', () => {
    expect(addressText({ address: 'Hà Nội' })).toBe('Hà Nội');
    expect(addressText({ name: 'Bến xe Gia Lâm' })).toBe('Bến xe Gia Lâm');
    expect(addressText(null)).toBe('—');
    expect(addressText({})).toBe('—');
    expect(addressText('Hưng Yên')).toBe('Hưng Yên');
  });
});
