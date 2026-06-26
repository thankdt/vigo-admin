import { describe, it, expect } from 'vitest';
import { expandHtxRow, HTX_LEAF_COLS, buildHtxExportHeader, type HtxFinancials } from './htx-recon-shared';

// The worked example from the spec sheet (cột 8…26):
//   giá cước trước VAT của khách = 240.000, VAT 8% = 19.200 → khách trả 259.200.
//   phí nền tảng GỘP = 48.000 (gồm khuyến mại 20.000) → thực thu = 28.000
//   = htxCommission 7.000 + vigoCommission 21.000.
// → cước vận tải HTX (8) = 240.000 − 48.000 = 192.000, VAT 8% (9) = 15.360;
//   phí APP trước VAT (10) = 48.000, VAT 8% (11) = 3.840.
const SAMPLE: HtxFinancials = {
  grossRevenue: 259200, // priceBeforeVat + totalVat
  totalVat: 19200, // 8% × 240.000
  htxCommission: 7000, // 20 — tỉ lệ riêng mỗi HTX (KHÔNG hardcode)
  htxVatRemit: 15360, // dùng để suy ra Thuế TNCN
  htxTotalReceived: 25540, // 7000 + 15360 + 3180
  vigoCommission: 21000, // 24
  vigoVatRemit: 3840,
  platformFeeGross: 48000, // 14 (gồm khuyến mại)
  km: 20000, // 15
};

describe('expandHtxRow', () => {
  it('derives every reconciliation column from the API fields (matches the spec sample)', () => {
    const r = expandHtxRow(SAMPLE);
    // Khối cột đầu — tách giá cước trước VAT thành cước vận tải HTX + phí APP, mỗi phần VAT 8%.
    expect(r.htxFareBeforeVat).toBe(192000); // 8 = priceBeforeVat − phí nền tảng gộp
    expect(r.htxFareVat).toBe(15360); // 9 = 8% × 8
    expect(r.appFeeBeforeVat).toBe(48000); // 10 = phí nền tảng gộp
    expect(r.appFeeVat).toBe(3840); // 11 = 8% × 10
    expect(r.customerTotal).toBe(259200); // 12 = 8+9+10+11
    // Nhóm Tài xế
    expect(r.driverIncome).toBe(212000); // 13 = 8 + 15
    expect(r.platformFeeGross).toBe(48000); // 14
    expect(r.km).toBe(20000); // 15
    expect(r.platformFee).toBe(28000); // 16 = 14 − 15
    expect(r.driverPit).toBe(3180); // 17 = 13 × 1,5%
    expect(r.driverDeductTotal).toBe(31180); // 18 = 16 + 17
    expect(r.driverNet).toBe(208820); // 19 = (8+10) − 18
    // Nhóm HTX, ĐVCCX
    expect(r.htxFee).toBe(7000); // 20
    expect(r.htxVat).toBe(15360); // 21 = 9
    expect(r.htxPit).toBe(3180); // 22 = 17
    expect(r.htxTotal).toBe(25540); // 23 = 20+21+22
    // Nhóm VIGO
    expect(r.vigoFee).toBe(21000); // 24
    expect(r.vigoVat).toBe(3840); // 25 = 11
    expect(r.vigoTotal).toBe(24840); // 26 = 24+25
  });

  it('balances: 4 cột đầu cộng lại = tổng khách trả', () => {
    const r = expandHtxRow(SAMPLE);
    expect(r.htxFareBeforeVat + r.htxFareVat + r.appFeeBeforeVat + r.appFeeVat).toBe(r.customerTotal);
  });

  it('balances: customer total = driver net + HTX total + VIGO total', () => {
    const r = expandHtxRow(SAMPLE);
    expect(r.driverNet + r.htxTotal + r.vigoTotal).toBe(r.customerTotal);
  });

  it('balances for an arbitrary (aggregated) row too', () => {
    // Two sample trips summed — the linear identities must still tie out.
    const agg: HtxFinancials = {
      grossRevenue: 259200 * 2,
      totalVat: 19200 * 2,
      htxCommission: 7000 * 2,
      htxVatRemit: 15360 * 2,
      htxTotalReceived: 25540 * 2,
      vigoCommission: 21000 * 2,
      vigoVatRemit: 3840 * 2,
      platformFeeGross: 48000 * 2,
      km: 20000 * 2,
    };
    const r = expandHtxRow(agg);
    expect(r.driverNet + r.htxTotal + r.vigoTotal).toBe(r.customerTotal);
    expect(r.htxFareBeforeVat).toBe(384000);
    expect(r.customerTotal).toBe(518400);
  });
});

describe('HTX_LEAF_COLS', () => {
  it('lists the 19 leaf columns in spec order with the right groups', () => {
    expect(HTX_LEAF_COLS.map((c) => c.key)).toEqual([
      'htxFareBeforeVat', 'htxFareVat', 'appFeeBeforeVat', 'appFeeVat', 'customerTotal',
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
    expect(r0[3]).toBe('Cước vận tải HTX trước VAT');
    expect(r0[4]).toBe('VAT cước vận tải HTX');
    expect(r0[5]).toBe('Phí APP trước VAT (phí nền tảng VIGO)');
    expect(r0[6]).toBe('VAT phí nền tảng VIGO');
    expect(r0[7]).toBe('Tổng khách trả cho tài xế');
    expect(r0[8]).toBe('Phân bổ doanh, VAT, Thuế TNCN và các khoản phí');
    expect(r1[8]).toBe('Tài xế');
    expect(r1[15]).toBe('HTX, ĐVCCX');
    expect(r1[19]).toBe('VIGO');
    expect(r2[8]).toBe('Thu nhập tài xế');
    expect(r2[9]).toBe('Phí nền tảng (gộp)');
    expect(r2[10]).toBe('Khuyến mãi (nền tảng tài trợ)');
    expect(r2[11]).toBe('Các khoản thu tài xế');
    expect(r2[14]).toBe('Tổng tiền tài xế thực nhận');
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
    expect(has([2, 9], [3, 9])).toBe(true); // Phí nền tảng (gộp) full height
    expect(has([2, 10], [3, 10])).toBe(true); // Khuyến mãi full height
    expect(has([2, 11], [2, 13])).toBe(true); // Các khoản thu tài xế (3)
    expect(has([0, 0], [3, 0])).toBe(true); // STT spans all 4 header rows
  });

  it('shifts the grouped section when there are more leading columns (detail = 8 entity)', () => {
    const { headerRows: hr } = buildHtxExportHeader(['STT', 'Mã chuyến', 'Ngày giờ', 'Tài xế', 'SĐT', 'Biển số xe', 'TÊN HTX/ĐVCCX', 'Hình thức TT']);
    expect(hr[0]).toHaveLength(27); // 8 entity + 5 base + 14 grouped
    expect(hr[0][13]).toBe('Phân bổ doanh, VAT, Thuế TNCN và các khoản phí'); // S = 13
    expect(hr[1][13]).toBe('Tài xế');
  });
});
