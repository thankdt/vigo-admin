'use client';

import * as React from 'react';
import type { ReportResult } from '@/lib/api';

function formatValue(v: number | null, unit?: string): string {
  if (v == null) return '—';
  if (unit === 'pct') return `${v.toFixed(1)}%`;
  if (unit === 'vnd') return v.toLocaleString('vi-VN');
  if (unit === 'minute') return `${v.toFixed(1)} phút`;
  return v.toLocaleString('vi-VN');
}

export type ReportResultRow = ReportResult['rows'][number];

export function ReportTable({
  result,
  onRowClick,
}: {
  result: ReportResult;
  onRowClick: (row: ReportResultRow) => void;
}) {
  const dimCols = result.columns.filter((c) => c.type === 'dim');
  const measureCols = result.columns.filter((c) => c.type === 'measure');

  return (
    <div className="rounded-md border">
      {result.rows.length > 0 ? (
        <p className="border-b bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          Bấm một dòng để xem TOÀN BỘ chuyến của dòng đó — không lọc riêng theo từng cột số.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {dimCols.map((c) => (
                <th key={c.key} className="px-3 py-2 text-left font-medium">{c.label}</th>
              ))}
              {measureCols.map((c) => (
                <th key={c.key} className="px-3 py-2 text-right font-medium">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr
                key={i}
                className="cursor-pointer border-t hover:bg-muted/40"
                onClick={() => onRowClick(row)}
                title="Bấm để xem TOÀN BỘ chuyến của dòng này (không lọc theo từng cột số)"
              >
                {dimCols.map((c) => (
                  <td key={c.key} className="px-3 py-2">{row.dims[c.key]}</td>
                ))}
                {measureCols.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-right tabular-nums">
                    {formatValue(row.measures[c.key], c.unit)}
                  </td>
                ))}
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={result.columns.length} className="px-3 py-8 text-center text-muted-foreground">
                  Không có dữ liệu trong khoảng đã chọn.
                </td>
              </tr>
            ) : null}
          </tbody>
          {result.rows.length > 0 ? (
            <tfoot className="border-t-2 bg-muted/30 font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={dimCols.length}>Tổng</td>
                {measureCols.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-right tabular-nums">
                    {formatValue(result.totals[c.key], c.unit)}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
