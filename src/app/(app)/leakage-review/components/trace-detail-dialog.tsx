'use client';

import * as React from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import type { LeakageTraceRow, LeakageTraceStatus } from '@/lib/types';
import { VERDICT_LABEL, addressText, describeEvidence, formatVnDateTime, verdictBadgeClass } from '../leakage-labels';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm break-words">{children}</div>
    </div>
  );
}

/** Detail + adjudication for one trace — dialog GIỮA màn hình khổ to (đồng bộ
 *  chi tiết tài xế bên Tỉ lệ huỷ/Quản lý tài xế; trước là side-sheet 512px chật).
 *  `onUpdateStatus` is injected so this (the only mutating UI here) is testable
 *  without any fetch mocking. */
export function TraceDetailDialog({
  trace,
  onOpenChange,
  onUpdateStatus,
}: {
  trace: LeakageTraceRow | null;
  onOpenChange: (open: boolean) => void;
  onUpdateStatus: (id: string, status: LeakageTraceStatus) => Promise<void> | void;
}) {
  const [saving, setSaving] = React.useState<LeakageTraceStatus | null>(null);

  if (!trace) return null;

  const lines = describeEvidence(trace.evidence);
  const act = async (status: LeakageTraceStatus) => {
    setSaving(status);
    try {
      await onUpdateStatus(trace.id, status);
    } finally {
      setSaving(null);
    }
  };

  const person = (p: LeakageTraceRow['driver']) =>
    p ? `${p.fullName || 'Không tên'} · ${p.phone || 'Không SĐT'}` : '—';

  return (
    <Dialog open={!!trace} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Badge className={verdictBadgeClass(trace.verdict)}>{VERDICT_LABEL[trace.verdict] ?? trace.verdict}</Badge>
          </DialogTitle>
          <DialogDescription>
            Chuyến bị khách huỷ sau khi tài xế đã nhận. Xem bằng chứng rồi kết luận.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Thời điểm huỷ (xảy ra)">{formatVnDateTime(trace.eventAt)}</Field>
            <Field label="Phát hiện lúc (đóng cửa sổ canh)">{formatVnDateTime(trace.createdAt)}</Field>
            <Field label="Tài xế">
              {trace.driver ? (
                // /users/detail?id=<User.id> is the real detail route: drivers/ has
                // only a list page (detail is a dialog), so /drivers/{id} would 404.
                // Next normalizes the trailing slash per next.config — matches the
                // existing precedent in users/components/user-table.tsx.
                <Link
                  href={`/users/detail?id=${trace.driver.userId}`}
                  className="text-primary underline underline-offset-2"
                >
                  {person(trace.driver)}
                </Link>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Khách">{person(trace.customer)}</Field>
            <Field label="Điểm đón">{addressText(trace.booking?.pickupAddress)}</Field>
            <Field label="Điểm đến">{addressText(trace.booking?.dropoffAddress)}</Field>
            <Field label="Lý do huỷ khách khai">{trace.booking?.cancelReason || '—'}</Field>
            <Field label="Loại canh">
              {trace.evidence?.watchType === 'SCHEDULED_DEFERRED' ? 'Chuyến hẹn giờ' : 'Tức thì'}
            </Field>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Bằng chứng theo dõi</p>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có dữ liệu theo dõi.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-4 text-sm">
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
            <p className="pt-1 text-xs text-muted-foreground">
              Lưu ý: đây là tín hiệu để con người xem xét, không phải bằng chứng tuyệt đối. Hệ thống
              không tự động phạt.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" disabled={!!saving} onClick={() => act('REVIEWED')}>
            {saving === 'REVIEWED' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Đã xem
          </Button>
          <Button variant="ghost" disabled={!!saving} onClick={() => act('DISMISSED')}>
            {saving === 'DISMISSED' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Bỏ qua
          </Button>
          <Button variant="destructive" disabled={!!saving} onClick={() => act('CONFIRMED')}>
            {saving === 'CONFIRMED' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Xác nhận gian lận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
