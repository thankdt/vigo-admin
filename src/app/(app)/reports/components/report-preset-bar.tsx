'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { ReportSpec } from '@/lib/api';

export type PresetSpec = Omit<ReportSpec, 'from' | 'to'>;

/**
 * Các báo cáo đã chốt với ban điều hành. Thêm báo cáo mới = thêm một mục ở đây.
 *
 * Bỏ tuyến (10/2026): trục địa lý là CẶP TỈNH (`provinceFrom` → `provinceTo`, theo mã tỉnh gis của
 * chuyến). Chiều `route` chỉ còn ở preset `legacy` bên dưới — chuyến tạo sau khi bỏ tuyến rơi hết
 * vào "(Chưa có tuyến)", nên nó chỉ có nghĩa với dữ liệu lịch sử.
 */
export const REPORT_PRESETS: Array<{
  key: string;
  label: string;
  hint: string;
  spec: PresetSpec;
  /** Dữ liệu cũ (chiều BE giữ lại chỉ để xem lịch sử): nhãn có "(cũ)", nằm cuối hàng, nút viền đứt. */
  legacy?: boolean;
}> = [
  {
    key: 'huy-theo-tinh',
    label: 'Huỷ chuyến theo cặp tỉnh',
    hint: 'Cặp tỉnh đón → trả nào bị huỷ nhiều nhất, huỷ trước hay sau khi có tài',
    spec: {
      cube: 'booking',
      dims: ['provinceFrom', 'provinceTo', 'cancelPhase'],
      measures: ['created', 'cancelled', 'cancelRatePct', 'matched', 'completed'],
      filters: {},
      limit: 300,
    },
  },
  {
    key: 'nhan-hoan-thanh',
    label: 'Tỷ lệ nhận & hoàn thành',
    hint: 'Theo loại hình, loại xe, đi ngay hay đặt trước',
    spec: {
      cube: 'booking',
      dims: ['serviceType', 'bookingKind'],
      measures: ['created', 'matched', 'matchRatePct', 'completed', 'completeRatePct', 'completedPerMatchedPct'],
      filters: {},
      limit: 200,
    },
  },
  {
    key: 'ly-do-huy',
    label: 'Lý do huỷ',
    hint: 'Nhóm nguyên nhân và ai là người bấm huỷ',
    spec: {
      cube: 'booking',
      dims: ['cancelReasonGroup', 'cancelledByRole'],
      measures: ['created', 'cancelled', 'cancelRatePct'],
      filters: {},
      limit: 200,
    },
  },
  {
    key: 'huy-theo-tuyen-cu',
    label: 'Huỷ chuyến theo tuyến (cũ)',
    hint: 'Chỉ có số của chuyến tạo TRƯỚC khi bỏ tuyến — chuyến mới nằm hết ở "(Chưa có tuyến)". Dùng "Huỷ chuyến theo cặp tỉnh" cho số hiện hành.',
    legacy: true,
    spec: {
      cube: 'booking',
      dims: ['route', 'cancelPhase'],
      measures: ['created', 'cancelled', 'cancelRatePct', 'matched', 'completed'],
      filters: {},
      limit: 300,
    },
  },
];

export function ReportPresetBar({
  activeKey,
  onSelect,
  isLoading,
}: {
  activeKey: string;
  onSelect: (key: string) => void;
  isLoading: boolean;
}) {
  const active = REPORT_PRESETS.find((p) => p.key === activeKey);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {REPORT_PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={p.key === activeKey ? 'default' : 'outline'}
            className={p.legacy && p.key !== activeKey ? 'border-dashed text-muted-foreground' : undefined}
            disabled={isLoading}
            onClick={() => onSelect(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      {active ? <p className="text-sm text-muted-foreground">{active.hint}</p> : null}
    </div>
  );
}
