import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';
import { buildXlsxBlob } from './csv';

// Proves the export is a REAL .xlsx (opens in proper columns in any Excel locale —
// the old comma-CSV broke on Vietnamese Excel) and that numbers stay numeric.
describe('buildXlsxBlob', () => {
  it('writes header + rows into separate cells, numbers stay numeric', async () => {
    const blob = await buildXlsxBlob(
      ['Tên', 'Số tiền'],
      [
        ['Anh A', 100000],
        ['Anh B', 250000],
      ],
      'Test',
    );
    const buf = Buffer.from(await blob.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];

    assert.equal(wb.SheetNames[0], 'Test');
    assert.equal(ws['A1'].v, 'Tên');
    assert.equal(ws['B1'].v, 'Số tiền');
    assert.equal(ws['A2'].v, 'Anh A');
    assert.equal(ws['B2'].v, 100000);
    assert.equal(ws['B2'].t, 'n'); // 'n' = numeric cell → Excel can sum/sort it
    assert.equal(ws['B3'].v, 250000);
  });

  it('caps the sheet name at 31 chars (Excel hard limit)', async () => {
    const blob = await buildXlsxBlob(['A'], [['1']], 'x'.repeat(40));
    const buf = Buffer.from(await blob.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    assert.equal(wb.SheetNames[0].length, 31);
  });
});
