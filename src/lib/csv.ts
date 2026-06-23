// Tabular export → real .xlsx (SheetJS). The old comma-CSV broke on Vietnamese
// Excel, which splits rows on ';' not ',', so everything landed in one column.
// A real .xlsx opens in proper columns in any locale and keeps numbers numeric
// (sortable/summable). xlsx is lazy-imported so its bundle loads only on export.

// Pure: build the .xlsx file bytes from a header + rows matrix. No DOM — unit-testable.
export async function buildXlsxBlob(
  header: string[],
  rows: Array<Array<string | number>>,
  sheetName = 'Data',
): Promise<Blob> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel caps sheet names at 31
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// Build the workbook + trigger a client-side download.
export async function downloadXlsx(
  filename: string,
  header: string[],
  rows: Array<Array<string | number>>,
  sheetName = 'Data',
) {
  const blob = await buildXlsxBlob(header, rows, sheetName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// SheetJS merge range: inclusive start/end cell, 0-indexed {row, col}.
export type XlsxMerge = { s: { r: number; c: number }; e: { r: number; c: number } };

// Like buildXlsxBlob but supports a MULTI-ROW header with merged cells, so a
// grouped on-screen header (parent group spanning several columns) survives the
// export instead of collapsing to a single flat row.
export async function buildXlsxBlobGrouped(
  headerRows: Array<Array<string | number>>,
  merges: XlsxMerge[],
  rows: Array<Array<string | number>>,
  sheetName = 'Data',
): Promise<Blob> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...rows]);
  if (merges.length) (ws as any)['!merges'] = merges;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function downloadXlsxGrouped(
  filename: string,
  headerRows: Array<Array<string | number>>,
  merges: XlsxMerge[],
  rows: Array<Array<string | number>>,
  sheetName = 'Data',
) {
  const blob = await buildXlsxBlobGrouped(headerRows, merges, rows, sheetName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
