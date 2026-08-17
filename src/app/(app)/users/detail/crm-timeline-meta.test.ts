import { describe, it, expect } from 'vitest';
import type { CrmTimelineItem, CrmTimelineKind } from '@/lib/api';
import { BOOKING_CALL_STATUS_LABEL } from '@/lib/cskh-call-labels';
import { TIMELINE_KIND_LABEL, TIMELINE_KIND_ORDER, metaForItem } from './crm-timeline-meta';

const mk = (over: Partial<CrmTimelineItem>): CrmTimelineItem => ({
  id: 'x',
  kind: 'NOTE',
  occurredAt: '2026-08-14T02:00:00Z',
  title: null,
  detail: null,
  meta: null,
  byAdminUserId: null,
  byAdminName: null,
  ...over,
});

describe('crm-timeline-meta', () => {
  it('mỗi kind có nhãn tiếng Việt riêng, không trùng nhau', () => {
    const labels = TIMELINE_KIND_ORDER.map((k) => TIMELINE_KIND_LABEL[k]);
    expect(new Set(labels).size).toBe(labels.length);
    for (const l of labels) expect(l.length).toBeGreaterThan(0);
  });

  it('phủ đủ MỌI kind backend có thể trả', () => {
    const kinds: CrmTimelineKind[] = [
      'CALL',
      'TRIP_CREATED',
      'TRIP_COMPLETED',
      'RATING',
      'NOTE',
      'NOTIFICATION',
    ];
    for (const k of kinds) expect(TIMELINE_KIND_ORDER).toContain(k);
  });

  /**
   * Nhãn cuộc gọi phải lấy từ NGUỒN DUY NHẤT `BOOKING_CALL_STATUS_LABEL` — chép tay bản
   * thứ hai chính là lý do `src/lib/cskh-call-labels.ts` ra đời.
   */
  it('CALL lấy nhãn theo meta.status của CHÍNH DÒNG, đúng nguồn nhãn chung', () => {
    expect(metaForItem(mk({ kind: 'CALL', meta: { status: 'CALLED' } })).label).toBe(
      BOOKING_CALL_STATUS_LABEL.CALLED,
    );
    expect(metaForItem(mk({ kind: 'CALL', meta: { status: 'UNREACHED' } })).label).toBe(
      BOOKING_CALL_STATUS_LABEL.UNREACHED,
    );
    expect(metaForItem(mk({ kind: 'CALL', meta: { status: 'CLAIMED' } })).label).toBe(
      BOOKING_CALL_STATUS_LABEL.CLAIMED,
    );
  });

  it('CALL thiếu/lạ meta.status thì rơi về nhãn chung, KHÔNG ném', () => {
    expect(metaForItem(mk({ kind: 'CALL', meta: null })).label).toBe(TIMELINE_KIND_LABEL.CALL);
    expect(metaForItem(mk({ kind: 'CALL', meta: { status: 'RÁC' } })).label).toBe(
      TIMELINE_KIND_LABEL.CALL,
    );
  });

  it('RATING hiện số sao', () => {
    expect(metaForItem(mk({ kind: 'RATING', meta: { stars: 5 } })).label).toContain('5');
    expect(metaForItem(mk({ kind: 'RATING', meta: { stars: 1 } })).tone).toBe('danger');
  });

  it('RATING thiếu sao thì vẫn ra nhãn, không ra "NaN★"', () => {
    const label = metaForItem(mk({ kind: 'RATING', meta: null })).label;
    expect(label).toBe(TIMELINE_KIND_LABEL.RATING);
    expect(label).not.toContain('NaN');
  });

  it('các kind hệ thống dùng nhãn cố định', () => {
    expect(metaForItem(mk({ kind: 'TRIP_CREATED' })).label).toBe(TIMELINE_KIND_LABEL.TRIP_CREATED);
    expect(metaForItem(mk({ kind: 'TRIP_COMPLETED' })).label).toBe(
      TIMELINE_KIND_LABEL.TRIP_COMPLETED,
    );
    expect(metaForItem(mk({ kind: 'NOTIFICATION' })).label).toBe(TIMELINE_KIND_LABEL.NOTIFICATION);
  });

  // Backend thêm kind mới mà FE chưa cập nhật -> không được vỡ, phải có nhãn dự phòng.
  it('kind lạ (BE thêm mới) không làm vỡ, có nhãn dự phòng', () => {
    const out = metaForItem(mk({ kind: 'KIND_MOI' as CrmTimelineKind }));
    expect(out.label.length).toBeGreaterThan(0);
  });
});
