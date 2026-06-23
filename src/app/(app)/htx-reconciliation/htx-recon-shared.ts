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
