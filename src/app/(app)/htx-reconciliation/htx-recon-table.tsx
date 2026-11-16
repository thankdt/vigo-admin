'use client';

import * as React from 'react';
import { TableCell, TableHead, TableRow } from '@/components/ui/table';
import { HTX_LEAF_COLS, type ExpandedHtx } from './htx-recon-shared';

const fmt = (v: number) => new Intl.NumberFormat('vi-VN').format(v ?? 0);

const thNum = 'text-right whitespace-nowrap align-bottom';
const thGrp = 'text-center whitespace-nowrap';

// Columns that start a new visual section get a left border (mirrors the
// grouped header so body cells line up under their group).
const LEFT_BORDER = new Set<keyof ExpandedHtx>(['htxFareBeforeVat', 'driverIncome', 'htxFee', 'vigoFee']);

const BASE_COLS = HTX_LEAF_COLS.filter((c) => c.group === null);
const GROUPED_COUNT = HTX_LEAF_COLS.length - BASE_COLS.length;

/**
 * Row-1 TAIL of the 4-row reconciliation header: the ungrouped financial
 * columns (rowSpan 4) + the wide "Phân bổ…" group cell spanning the grouped
 * leaves. Place it right after each page's own leading <TableHead rowSpan={4}>
 * cells.
 */
export function HtxHeadTailRow1() {
  return (
    <>
      {BASE_COLS.map((c, i) => (
        <TableHead key={c.key} rowSpan={4} className={`${thNum}${i === 0 ? ' border-l' : ''}`}>
          {c.label}
        </TableHead>
      ))}
      <TableHead colSpan={GROUPED_COUNT} className={`${thGrp} border-l`}>
        Phân bổ doanh, VAT, Thuế TNCN và các khoản phí
      </TableHead>
    </>
  );
}

/** Header rows 2–4 (groups → sub-group → leaves). Shared by both pages. */
export function HtxHeadLowerRows() {
  return (
    <>
      <TableRow>
        <TableHead colSpan={7} className={`${thGrp} border-l`}>Tài xế</TableHead>
        <TableHead colSpan={4} className={`${thGrp} border-l`}>HTX, ĐVCCX</TableHead>
        <TableHead colSpan={3} className={`${thGrp} border-l`}>VIGO</TableHead>
      </TableRow>
      <TableRow>
        <TableHead rowSpan={2} className={`${thNum} border-l`}>Thu nhập tài xế</TableHead>
        <TableHead rowSpan={2} className={thNum}>Phí nền tảng (gộp)</TableHead>
        <TableHead rowSpan={2} className={thNum}>Khuyến mãi (nền tảng tài trợ)</TableHead>
        <TableHead colSpan={3} className={thGrp}>Các khoản thu tài xế</TableHead>
        <TableHead rowSpan={2} className={thNum}>Tổng tiền tài xế thực nhận</TableHead>
        <TableHead rowSpan={2} className={`${thNum} border-l`}>Phí Hỗ trợ phát triển kinh doanh</TableHead>
        <TableHead rowSpan={2} className={thNum}>VAT thu hộ HTX, ĐVCCX</TableHead>
        <TableHead rowSpan={2} className={thNum}>Thuế TNCN nộp hộ tài xế</TableHead>
        <TableHead rowSpan={2} className={thNum}>Tổng tiền HTX, ĐVCCX nhận</TableHead>
        <TableHead rowSpan={2} className={`${thNum} border-l`}>Phí nền tảng APP đặt xe VIGO</TableHead>
        <TableHead rowSpan={2} className={thNum}>VAT phí nền tảng VIGO</TableHead>
        <TableHead rowSpan={2} className={thNum}>Tổng tiền VIGO nhận</TableHead>
      </TableRow>
      <TableRow>
        <TableHead className={thNum}>Phí nền tảng (thực thu)</TableHead>
        <TableHead className={thNum}>Thuế TNCN</TableHead>
        <TableHead className={thNum}>Tổng thu tài xế</TableHead>
      </TableRow>
    </>
  );
}

/** The 17 financial body cells for one expanded row (trip / HTX / TOTAL). */
export function HtxLeafCells({ row }: { row: ExpandedHtx }) {
  return (
    <>
      {HTX_LEAF_COLS.map((c) => (
        <TableCell
          key={c.key}
          className={[
            'text-right tabular-nums whitespace-nowrap',
            LEFT_BORDER.has(c.key) ? 'border-l' : '',
            c.highlight ? 'font-semibold text-purple-700 dark:text-purple-400' : '',
          ].join(' ')}
        >
          {fmt(row[c.key])}
        </TableCell>
      ))}
    </>
  );
}

/**
 * Zero-horizontal-scroll financial summary + expandable 19-metric breakdown
 * used inside mobile / iPad / tablet cards (`< xl`) on both HTX recon pages.
 */
export function HtxMobileFinancialBlock({
  row,
  defaultExpanded = false,
}: {
  row: ExpandedHtx;
  defaultExpanded?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
        <div className="rounded-md bg-muted/50 p-2">
          <div className="text-muted-foreground">Tổng khách trả</div>
          <div className="mt-0.5 font-semibold tabular-nums text-sm">{fmt(row.customerTotal)} đ</div>
        </div>
        <div className="rounded-md bg-purple-50/70 dark:bg-purple-950/30 p-2">
          <div className="text-muted-foreground">Tài xế thực nhận</div>
          <div className="mt-0.5 font-semibold tabular-nums text-sm text-purple-700 dark:text-purple-400">
            {fmt(row.driverNet)} đ
          </div>
        </div>
        <div className="rounded-md bg-purple-50/70 dark:bg-purple-950/30 p-2">
          <div className="text-muted-foreground">HTX nhận</div>
          <div className="mt-0.5 font-semibold tabular-nums text-sm text-purple-700 dark:text-purple-400">
            {fmt(row.htxTotal)} đ
          </div>
        </div>
        <div className="rounded-md bg-purple-50/70 dark:bg-purple-950/30 p-2">
          <div className="text-muted-foreground">VIGO nhận</div>
          <div className="mt-0.5 font-semibold tabular-nums text-sm text-purple-700 dark:text-purple-400">
            {fmt(row.vigoTotal)} đ
          </div>
        </div>
      </div>
      <details
        open={defaultExpanded || undefined}
        className="rounded-md border bg-background/60 px-2.5 py-1.5 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <summary className="cursor-pointer select-none font-medium text-muted-foreground hover:text-foreground">
          Chi tiết phân bổ thuế &amp; phí
        </summary>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 border-t pt-2">
          {HTX_LEAF_COLS.map((c) => (
            <div key={c.key} className="flex items-baseline justify-between gap-2 py-0.5">
              <dt className="text-muted-foreground min-w-0 break-words">
                {c.group ? `${c.group}: ${c.label}` : c.label}
              </dt>
              <dd
                className={`shrink-0 tabular-nums ${
                  c.highlight ? 'font-semibold text-purple-700 dark:text-purple-400' : 'font-medium'
                }`}
              >
                {fmt(row[c.key])} đ
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
