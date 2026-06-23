import { describe, it, expect } from 'vitest';
import { expandHtxRow, HTX_LEAF_COLS, type HtxFinancials } from './htx-recon-shared';

// The sample row from the spec: giá cước trước VAT = 250.000, VAT = 20.000.
const SAMPLE: HtxFinancials = {
  grossRevenue: 270000, // 8 + 9
  totalVat: 20000, // 9
  htxCommission: 12500, // 16 = 8×5%
  htxVatRemit: 16000, // 17 = 9×80%
  htxTotalReceived: 31500, // 19 = 16+17+18
  vigoCommission: 37500, // 20 = 8×15%
  vigoVatRemit: 4000, // 21 = 9×20%
};

describe('expandHtxRow', () => {
  it('derives every reconciliation column from the 7 API fields (matches the spec sample)', () => {
    const r = expandHtxRow(SAMPLE);
    expect(r.priceBeforeVat).toBe(250000); // 8
    expect(r.vat).toBe(20000); // 9
    expect(r.customerTotal).toBe(270000); // 10
    expect(r.driverIncome).toBe(200000); // 11 = 8×80%
    expect(r.platformFee).toBe(50000); // 12 = 8×20%
    expect(r.driverPit).toBe(3000); // 13 = 11×1.5%
    expect(r.driverDeductTotal).toBe(53000); // 14 = 12+13
    expect(r.driverNet).toBe(197000); // 15 = 8−14
    expect(r.htxFee).toBe(12500); // 16
    expect(r.htxVat).toBe(16000); // 17
    expect(r.htxPit).toBe(3000); // 18 = 13
    expect(r.htxTotal).toBe(31500); // 19
    expect(r.vigoFee).toBe(37500); // 20
    expect(r.vigoVat).toBe(4000); // 21
    expect(r.vigoTotal).toBe(41500); // 22 = 20+21
  });

  it('balances: customer total = driver net + HTX total + VIGO total', () => {
    const r = expandHtxRow(SAMPLE);
    expect(r.driverNet + r.htxTotal + r.vigoTotal).toBe(r.customerTotal);
  });

  it('balances for an arbitrary (aggregated) row too', () => {
    // Two sample trips summed — the linear identities must still tie out.
    const agg: HtxFinancials = {
      grossRevenue: 270000 * 2,
      totalVat: 20000 * 2,
      htxCommission: 12500 * 2,
      htxVatRemit: 16000 * 2,
      htxTotalReceived: 31500 * 2,
      vigoCommission: 37500 * 2,
      vigoVatRemit: 4000 * 2,
    };
    const r = expandHtxRow(agg);
    expect(r.driverNet + r.htxTotal + r.vigoTotal).toBe(r.customerTotal);
    expect(r.priceBeforeVat).toBe(500000);
    expect(r.driverNet).toBe(394000);
  });
});

describe('HTX_LEAF_COLS', () => {
  it('lists the 15 leaf columns in spec order with the right groups', () => {
    expect(HTX_LEAF_COLS.map((c) => c.key)).toEqual([
      'priceBeforeVat', 'vat', 'customerTotal',
      'driverIncome', 'platformFee', 'driverPit', 'driverDeductTotal', 'driverNet',
      'htxFee', 'htxVat', 'htxPit', 'htxTotal',
      'vigoFee', 'vigoVat', 'vigoTotal',
    ]);
    // First three are ungrouped; the rest carry their section group.
    expect(HTX_LEAF_COLS.slice(0, 3).every((c) => !c.group)).toBe(true);
    expect(HTX_LEAF_COLS.filter((c) => c.group === 'Tài xế')).toHaveLength(5);
    expect(HTX_LEAF_COLS.filter((c) => c.group === 'HTX, ĐVCCX')).toHaveLength(4);
    expect(HTX_LEAF_COLS.filter((c) => c.group === 'VIGO')).toHaveLength(3);
  });
});
