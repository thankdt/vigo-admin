// Shared model for the HTX reconciliation tables (summary + detail).
//
// The backend already computes the authoritative money split per trip
// (commission, VAT remit, PIT) and returns 7 financial fields per row. Every
// column in the reconciliation spec is a linear combination of those 7, so we
// derive them here — no backend change, and it stays correct for per-HTX
// commission rates / discounts (the percentages in the spec are the standard
// 20%/5%/1.5%/8% case). Used identically for per-trip rows, per-HTX summary
// rows, and the TOTAL row (the identities are linear, so sums tie out).

/** The 7 financial fields the API returns on every recon row (trip or HTX). */
export type HtxFinancials = {
  grossRevenue: number; // what the customer paid (incl. VAT)
  totalVat: number;
  htxCommission: number;
  htxVatRemit: number;
  htxTotalReceived: number;
  vigoCommission: number;
  vigoVatRemit: number;
};

export type ExpandedHtx = {
  priceBeforeVat: number; // 8
  vat: number; // 9
  customerTotal: number; // 10 = 8+9
  driverIncome: number; // 11 = 8 − platformFee
  platformFee: number; // 12 = htxCommission + vigoCommission
  driverPit: number; // 13 = htxTotalReceived − htxCommission − htxVatRemit
  driverDeductTotal: number; // 14 = platformFee + driverPit
  driverNet: number; // 15 = 8 − 14
  htxFee: number; // 16
  htxVat: number; // 17
  htxPit: number; // 18 = driverPit
  htxTotal: number; // 19
  vigoFee: number; // 20
  vigoVat: number; // 21
  vigoTotal: number; // 22 = vigoFee + vigoVat
};

export function expandHtxRow(f: HtxFinancials): ExpandedHtx {
  const priceBeforeVat = f.grossRevenue - f.totalVat;
  const platformFee = f.htxCommission + f.vigoCommission;
  const driverPit = f.htxTotalReceived - f.htxCommission - f.htxVatRemit;
  const driverDeductTotal = platformFee + driverPit;
  return {
    priceBeforeVat,
    vat: f.totalVat,
    customerTotal: f.grossRevenue,
    driverIncome: priceBeforeVat - platformFee,
    platformFee,
    driverPit,
    driverDeductTotal,
    driverNet: priceBeforeVat - driverDeductTotal,
    htxFee: f.htxCommission,
    htxVat: f.htxVatRemit,
    htxPit: driverPit,
    htxTotal: f.htxTotalReceived,
    vigoFee: f.vigoCommission,
    vigoVat: f.vigoVatRemit,
    vigoTotal: f.vigoCommission + f.vigoVatRemit,
  };
}

export type HtxGroup = 'Tài xế' | 'HTX, ĐVCCX' | 'VIGO';

export type HtxLeafCol = {
  key: keyof ExpandedHtx;
  label: string;
  group: HtxGroup | null; // null = ungrouped leading financial column
  highlight?: boolean; // the "tổng … nhận" totals get emphasised
};

/** The 15 leaf columns, in spec order. Drives table bodies + xlsx export. */
export const HTX_LEAF_COLS: HtxLeafCol[] = [
  { key: 'priceBeforeVat', label: 'Giá cước trước VAT', group: null },
  { key: 'vat', label: 'VAT', group: null },
  { key: 'customerTotal', label: 'Tổng khách trả cho tài xế', group: null },
  { key: 'driverIncome', label: 'Thu nhập tài xế', group: 'Tài xế' },
  { key: 'platformFee', label: 'Phí nền tảng', group: 'Tài xế' },
  { key: 'driverPit', label: 'Thuế TNCN', group: 'Tài xế' },
  { key: 'driverDeductTotal', label: 'Tổng thu tài xế', group: 'Tài xế' },
  { key: 'driverNet', label: 'Tổng tiền tài xế thực nhận', group: 'Tài xế', highlight: true },
  { key: 'htxFee', label: 'Phí Hỗ trợ phát triển kinh doanh', group: 'HTX, ĐVCCX' },
  { key: 'htxVat', label: 'VAT thu hộ HTX, ĐVCCX', group: 'HTX, ĐVCCX' },
  { key: 'htxPit', label: 'Thuế TNCN nộp hộ tài xế', group: 'HTX, ĐVCCX' },
  { key: 'htxTotal', label: 'Tổng tiền HTX, ĐVCCX nhận', group: 'HTX, ĐVCCX', highlight: true },
  { key: 'vigoFee', label: 'Phí nền tảng APP đặt xe VIGO', group: 'VIGO' },
  { key: 'vigoVat', label: 'VAT phí nền tảng VIGO', group: 'VIGO' },
  { key: 'vigoTotal', label: 'Tổng tiền VIGO nhận', group: 'VIGO', highlight: true },
];

/** Flat xlsx header label for a leaf column (group-prefixed for clarity). */
export const leafExportLabel = (c: HtxLeafCol) => (c.group ? `${c.group} — ${c.label}` : c.label);

/** Payment method is always cash for HTX reconciliation. */
export const HTX_PAYMENT_LABEL = 'Tiền mặt';

type XlsxMerge = { s: { r: number; c: number }; e: { r: number; c: number } };

/**
 * Build the MULTI-ROW xlsx header (matrix + merge ranges) that mirrors the
 * on-screen grouped header, so the export carries the same layers instead of a
 * single flat row. Layout (4 header rows):
 *   r0: [entity… | base… spanning all 4 rows] + "Phân bổ…" over the 12 grouped cols
 *   r1: Tài xế (5) | HTX, ĐVCCX (4) | VIGO (3)
 *   r2: Thu nhập tài xế | "Các khoản thu tài xế" (3) | Tổng tiền tài xế thực nhận | HTX leaves | VIGO leaves
 *   r3: Phí nền tảng | Thuế TNCN | Tổng thu tài xế   (under "Các khoản thu tài xế")
 *
 * `entityLabels` are the non-financial leading columns (STT, HTX name, …). The
 * 3 base financial columns (Giá cước trước VAT / VAT / Tổng khách trả) are
 * appended automatically; together they form the full-height standalone block.
 * Body rows must be: [...entity values, ...all 15 HTX_LEAF_COLS values].
 */
export function buildHtxExportHeader(entityLabels: string[]): {
  headerRows: string[][];
  merges: XlsxMerge[];
} {
  const base = HTX_LEAF_COLS.slice(0, 3); // priceBeforeVat, vat, customerTotal
  const grouped = HTX_LEAF_COLS.slice(3); // 12 grouped leaves
  const standalone = [...entityLabels, ...base.map((c) => c.label)];
  const S = standalone.length; // grouped section starts at this column
  const total = S + grouped.length;

  const mk = () => Array<string>(total).fill('');
  const r0 = mk();
  const r1 = mk();
  const r2 = mk();
  const r3 = mk();

  standalone.forEach((l, i) => (r0[i] = l));
  r0[S] = 'Phân bổ doanh, VAT, Thuế TNCN và các khoản phí';

  r1[S] = 'Tài xế';
  r1[S + 5] = 'HTX, ĐVCCX';
  r1[S + 9] = 'VIGO';

  // Tài xế: leaf0 standalone, leaves 1-3 under "Các khoản thu tài xế", leaf4 standalone
  r2[S + 0] = grouped[0].label; // Thu nhập tài xế
  r2[S + 1] = 'Các khoản thu tài xế';
  r2[S + 4] = grouped[4].label; // Tổng tiền tài xế thực nhận
  r3[S + 1] = grouped[1].label; // Phí nền tảng
  r3[S + 2] = grouped[2].label; // Thuế TNCN
  r3[S + 3] = grouped[3].label; // Tổng thu tài xế
  // HTX (5-8) + VIGO (9-11): each leaf is a single column titled on r2
  for (let i = 5; i < 12; i++) r2[S + i] = grouped[i].label;

  const merges: XlsxMerge[] = [];
  // Standalone columns span all 4 header rows.
  for (let c = 0; c < S; c++) merges.push({ s: { r: 0, c }, e: { r: 3, c } });
  // "Phân bổ…" over the 12 grouped cols.
  merges.push({ s: { r: 0, c: S }, e: { r: 0, c: total - 1 } });
  // Group bands on r1.
  merges.push({ s: { r: 1, c: S }, e: { r: 1, c: S + 4 } }); // Tài xế
  merges.push({ s: { r: 1, c: S + 5 }, e: { r: 1, c: S + 8 } }); // HTX
  merges.push({ s: { r: 1, c: S + 9 }, e: { r: 1, c: S + 11 } }); // VIGO
  // Tài xế sub-row.
  merges.push({ s: { r: 2, c: S + 0 }, e: { r: 3, c: S + 0 } }); // Thu nhập (full height)
  merges.push({ s: { r: 2, c: S + 1 }, e: { r: 2, c: S + 3 } }); // Các khoản thu (3 wide)
  merges.push({ s: { r: 2, c: S + 4 }, e: { r: 3, c: S + 4 } }); // Tổng tiền tài xế thực nhận
  // HTX + VIGO leaves span r2:r3.
  for (let i = 5; i < 12; i++) merges.push({ s: { r: 2, c: S + i }, e: { r: 3, c: S + i } });

  return { headerRows: [r0, r1, r2, r3], merges };
}
