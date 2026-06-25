'use client';

import * as React from 'react';
import { TableCell, TableHead, TableRow } from '@/components/ui/table';
import { HTX_LEAF_COLS, type ExpandedHtx } from './htx-recon-shared';

const fmt = (v: number) => new Intl.NumberFormat('vi-VN').format(v ?? 0);

const thNum = 'text-right whitespace-nowrap align-bottom';
const thGrp = 'text-center whitespace-nowrap';

// Columns that start a new visual section get a left border (mirrors the
// grouped header so body cells line up under their group).
const LEFT_BORDER = new Set<keyof ExpandedHtx>(['priceBeforeVat', 'driverIncome', 'htxFee', 'vigoFee']);

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
        <TableHead colSpan={5} className={thGrp}>Các khoản thu tài xế</TableHead>
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
        <TableHead className={thNum}>Phí nền tảng (gộp)</TableHead>
        <TableHead className={thNum}>Khuyến mãi (nền tảng tài trợ)</TableHead>
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
