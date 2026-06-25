import { describe, it, expect } from 'vitest';
import { expandHtxRow, HTX_LEAF_COLS, buildHtxExportHeader, type HtxFinancials } from './htx-recon-shared';

// The sample row from the spec: giá cước trước VAT = 250.000, VAT = 20.000.
// platformFeeGross = 60.000 with km = 10.000 → phí nền tảng thực thu = 50.000
// (= htxCommission + vigoCommission), so gross − km ties to the net platform fee.
const SAMPLE: HtxFinancials = {
  grossRevenue: 270000, // 8 + 9
  totalVat: 20000, // 9
  htxCommission: 12500, // 16 = 8×5%
  htxVatRemit: 16000, // 17 = 9×80%
  htxTotalReceived: 31500, // 19 = 16+17+18
  vigoCommission: 37500, // 20 = 8×15%
  vigoVatRemit: 4000, // 21 = 9×20%
  platformFeeGross: 60000, // hoa hồng trước KM
  km: 10000, // khuyến mãi nền tảng tài trợ
};

describe('expandHtxRow', () => {
  it('derives every reconciliation column from the 7 API fields (matches the spec sample)', () => {
    const r = expandHtxRow(SAMPLE);
    expect(r.priceBeforeVat).toBe(250000); // 8
    expect(r.platformCommission).toBe(50000); // hoa hồng nền tảng thực thu = platformFee
    expect(r.dvvtFare).toBe(200000); // giá cước DVVT = 8 − commission
    expect(r.platformCommission + r.dvvtFare).toBe(r.priceBeforeVat); // tách khớp lại
    expect(r.vat).toBe(20000); // 9
    expect(r.customerTotal).toBe(270000); // 10
    expect(r.driverIncome).toBe(200000); // 11 = 8×80%
    expect(r.platformFeeGross).toBe(60000); // hoa hồng trước KM
    expect(r.km).toBe(10000); // khuyến mãi nền tảng tài trợ
    expect(r.platformFeeGross - r.km).toBe(r.platformFee); // gộp − KM = thực thu
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
      platformFeeGross: 60000 * 2,
      km: 10000 * 2,
    };
    const r = expandHtxRow(agg);
    expect(r.driverNet + r.htxTotal + r.vigoTotal).toBe(r.customerTotal);
    expect(r.priceBeforeVat).toBe(500000);
    expect(r.driverNet).toBe(394000);
  });
});

describe('HTX_LEAF_COLS', () => {
  it('lists the 19 leaf columns in spec order with the right groups', () => {
    expect(HTX_LEAF_COLS.map((c) => c.key)).toEqual([
      'priceBeforeVat', 'platformCommission', 'dvvtFare', 'vat', 'customerTotal',
      'driverIncome', 'platformFeeGross', 'km', 'platformFee', 'driverPit', 'driverDeductTotal', 'driverNet',
      'htxFee', 'htxVat', 'htxPit', 'htxTotal',
      'vigoFee', 'vigoVat', 'vigoTotal',
    ]);
    // First five are ungrouped; the rest carry their section group.
    expect(HTX_LEAF_COLS.filter((c) => !c.group)).toHaveLength(5);
    expect(HTX_LEAF_COLS.filter((c) => c.group === 'Tài xế')).toHaveLength(7);
    expect(HTX_LEAF_COLS.filter((c) => c.group === 'HTX, ĐVCCX')).toHaveLength(4);
    expect(HTX_LEAF_COLS.filter((c) => c.group === 'VIGO')).toHaveLength(3);
  });
});

describe('buildHtxExportHeader', () => {
  // Summary: 3 entity cols + 5 base cols → grouped section starts at col 8, total 22.
  const { headerRows, merges } = buildHtxExportHeader(['STT', 'TÊN HTX/ĐVCCX', 'Hình thức TT']);

  it('produces a 4-row header of consistent width', () => {
    expect(headerRows).toHaveLength(4);
    for (const row of headerRows) expect(row).toHaveLength(22);
  });

  it('places the group labels at the right offsets (S=8)', () => {
    const [r0, r1, r2, r3] = headerRows;
    expect(r0[0]).toBe('STT');
    expect(r0[3]).toBe('Giá cước trước VAT');
    expect(r0[4]).toBe('Commission nền tảng');
    expect(r0[5]).toBe('Giá cước DVVT');
    expect(r0[7]).toBe('Tổng khách trả cho tài xế');
    expect(r0[8]).toBe('Phân bổ doanh, VAT, Thuế TNCN và các khoản phí');
    expect(r1[8]).toBe('Tài xế');
    expect(r1[15]).toBe('HTX, ĐVCCX');
    expect(r1[19]).toBe('VIGO');
    expect(r2[8]).toBe('Thu nhập tài xế');
    expect(r2[9]).toBe('Các khoản thu tài xế');
    expect(r2[14]).toBe('Tổng tiền tài xế thực nhận');
    expect(r3[9]).toBe('Phí nền tảng (gộp)');
    expect(r3[10]).toBe('Khuyến mãi (nền tảng tài trợ)');
    expect(r3[11]).toBe('Phí nền tảng (thực thu)');
    expect(r3[12]).toBe('Thuế TNCN');
    expect(r3[13]).toBe('Tổng thu tài xế');
  });

  it('merges the parent group + sub-group bands', () => {
    const has = (s: [number, number], e: [number, number]) =>
      merges.some((m) => m.s.r === s[0] && m.s.c === s[1] && m.e.r === e[0] && m.e.c === e[1]);
    expect(has([0, 8], [0, 21])).toBe(true); // Phân bổ over 14 cols
    expect(has([1, 8], [1, 14])).toBe(true); // Tài xế (7)
    expect(has([1, 15], [1, 18])).toBe(true); // HTX (4)
    expect(has([1, 19], [1, 21])).toBe(true); // VIGO (3)
    expect(has([2, 9], [2, 13])).toBe(true); // Các khoản thu tài xế (5)
    expect(has([0, 0], [3, 0])).toBe(true); // STT spans all 4 header rows
  });

  it('shifts the grouped section when there are more leading columns (detail = 8 entity)', () => {
    const { headerRows: hr } = buildHtxExportHeader(['STT', 'Mã chuyến', 'Ngày giờ', 'Tài xế', 'SĐT', 'Biển số xe', 'TÊN HTX/ĐVCCX', 'Hình thức TT']);
    expect(hr[0]).toHaveLength(27); // 8 entity + 5 base + 14 grouped
    expect(hr[0][13]).toBe('Phân bổ doanh, VAT, Thuế TNCN và các khoản phí'); // S = 13
    expect(hr[1][13]).toBe('Tài xế');
  });
});
