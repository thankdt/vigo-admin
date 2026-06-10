// Quote every field + escape embedded quotes; prepend a UTF-8 BOM so Excel reads
// Vietnamese correctly. Triggers a client-side download.
const csvCell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number>>) {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
