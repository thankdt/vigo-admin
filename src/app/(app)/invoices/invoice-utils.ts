export type InvoiceEInvoiceStatus =
  | 'PENDING'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'ISSUED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT'
  | 'SKIPPED';

export type InvoiceEInvoiceState = {
  id: string;
  status: InvoiceEInvoiceStatus | string;
  skipReason: string | null;
  invNo: string | null;
  invSeries?: string | null;
  lookupCode: string | null;
  lookupUrl: string | null;
  issuedAt: string | null;
  invDate: string;
  attempts: number;
  lastErrorCode: string | null;
  lastError: string | null;
  nextAttemptAt: string | null;
};

export type InvoiceTrip = {
  id: string;
  tripDate: string;
  bookingCode: string;
  contractNo: string;
  pickupAddress: string;
  dropoffAddress: string;
  totalWithVat: number;
  vat: number;
  vehiclePlate: string;
  transportCompanyName: string;
  vatInfo?: {
    companyName?: string | null;
    taxCode?: string | null;
    companyAddress?: string | null;
    invoiceEmail?: string | null;
  } | null;
  invoice?: InvoiceEInvoiceState | null;
};

export type InvoiceDateRange = {
  from: string;
  to: string;
};

export type InvoiceExportRow = {
  tripDate: string;
  service: string;
  totalWithVat: number;
  vat: number;
  vehiclePlate: string;
  transportCompanyName: string;
  invoiceCompanyName: string;
  invoiceTaxCode: string;
  invoiceCompanyAddress: string;
  invoiceEmail: string;
};

export const INVOICE_EXPORT_HEADERS = [
  'Ngày hoàn thành',
  'Dịch vụ',
  'Thành tiền (gồm VAT)',
  'VAT',
  'Biển số xe',
  'Tên DVVT',
  'Tên đơn vị',
  'MST',
  'Địa chỉ',
  'Email nhận hoá đơn',
];

/** Trạng thái hoá đơn "kẹt" — chỉ 3 trạng thái này được phép mở lại qua POST /admin/invoices/:id/reopen. */
export const EINVOICE_REOPENABLE_STATUSES = [
  'FAILED_RETRYABLE',
  'FAILED_PERMANENT',
  'SKIPPED',
] as const;

/**
 * Trạng thái đã phát hành hoặc đang được worker tự động xử lý/thử lại trên MISA (C4 — spec §10, runbook §4.4 & §7).
 * Các chuyến này PHẢI bị loại khỏi file Excel xuất tay để kế toán không import trùng lên MISA
 * (FAILED_RETRYABLE vẫn đang được worker tự động thử lại theo lịch 1′→5′→15′→60′×3 hoặc tra RefID).
 */
export const EINVOICE_AUTO_HANDLED_STATUSES = [
  'PENDING',
  'SUBMITTING',
  'SUBMITTED',
  'FAILED_RETRYABLE',
  'ISSUED',
] as const;

export const REOPEN_REASON_MIN_LENGTH = 5;
export const REOPEN_REASON_MAX_LENGTH = 300;

const SKIP_REASON_LABELS: Record<string, string> = {
  BOOKING_VOIDED: 'Chuyến đã huỷ/void',
  TEST_TRIP: 'Chuyến test',
  TEST_FLAG_CHANGED: 'Đổi cờ chuyến test',
  UNSUPPORTED_PAYMENT_METHOD: 'Phương thức thanh toán chưa tự xuất (xuất tay)',
  ZERO_AMOUNT: 'Chuyến 0đ',
  CRM_ACCOUNT: 'Khách doanh nghiệp CRM (xuất theo kỳ)',
  DELIVERY: 'Giao hàng (chưa tự xuất)',
};

export function describeSkipReason(skipReason: string | null | undefined): string {
  if (!skipReason) return 'Bỏ qua tự động';
  const label = SKIP_REASON_LABELS[skipReason];
  return label ? `${label} (${skipReason})` : skipReason;
}

export type EInvoiceStatusView = {
  label: string;
  tone:
    | 'none'
    | 'pending'
    | 'submitting'
    | 'submitted'
    | 'issued'
    | 'retryable'
    | 'permanent'
    | 'skipped';
  code: string | null;
  detail: string | null;
};

export function describeEInvoiceStatus(
  invoice: InvoiceEInvoiceState | null | undefined,
): EInvoiceStatusView {
  if (!invoice) {
    return {
      label: 'Chưa tạo HĐĐT',
      tone: 'none',
      code: null,
      detail: 'Chưa phát hành tự động (xuất tay nếu cần)',
    };
  }

  switch (invoice.status) {
    case 'ISSUED':
      return {
        label: 'Đã phát hành',
        tone: 'issued',
        code: invoice.invNo ? `#${invoice.invNo}` : null,
        detail: invoice.lookupCode ? `Mã tra cứu: ${invoice.lookupCode}` : null,
      };
    case 'PENDING':
      return {
        label: 'Chờ gửi MISA',
        tone: 'pending',
        code: null,
        detail: 'Đang xếp hàng chờ worker phát hành',
      };
    case 'SUBMITTING':
      return {
        label: 'Đang gửi MISA',
        tone: 'submitting',
        code: null,
        detail: 'Worker đang gọi MISA',
      };
    case 'SUBMITTED':
      return {
        label: 'Đã gửi · Chờ ký',
        tone: 'submitted',
        code: invoice.invNo ? `#${invoice.invNo}` : null,
        detail: 'MISA đã nhận, đang chờ số HĐ / mã CQT',
      };
    case 'FAILED_RETRYABLE':
      return {
        label: 'Lỗi tạm thời',
        tone: 'retryable',
        code: invoice.lastErrorCode,
        detail: invoice.lastError ?? 'Hệ thống sẽ tự động thử lại',
      };
    case 'FAILED_PERMANENT':
      return {
        label: 'Lỗi cần xử lý',
        tone: 'permanent',
        code: invoice.lastErrorCode,
        detail: invoice.lastError ?? 'Dừng tự động — cần kiểm tra hoặc xuất tay',
      };
    case 'SKIPPED':
      return {
        label: 'Bỏ qua tự động',
        tone: 'skipped',
        code: invoice.skipReason,
        detail: describeSkipReason(invoice.skipReason),
      };
    default:
      return {
        label: invoice.status || 'Không rõ',
        tone: 'none',
        code: invoice.lastErrorCode ?? invoice.skipReason,
        detail: invoice.lastError,
      };
  }
}

export function isInvoiceReopenable(
  invoice: InvoiceEInvoiceState | null | undefined,
): boolean {
  if (!invoice) return false;
  return (EINVOICE_REOPENABLE_STATUSES as readonly string[]).includes(invoice.status);
}

export function isExcludedFromManualInvoiceExport(
  trip: Pick<InvoiceTrip, 'invoice'>,
): boolean {
  const status = trip.invoice?.status;
  if (!status) return false;
  return (EINVOICE_AUTO_HANDLED_STATUSES as readonly string[]).includes(status);
}

export function partitionInvoiceTripsForExport<T extends Pick<InvoiceTrip, 'invoice'>>(
  trips: readonly T[],
): {
  exportable: T[];
  excludedCount: number;
  excludedIssuedCount: number;
  excludedInFlightCount: number;
} {
  const exportable: T[] = [];
  let excludedIssuedCount = 0;
  let excludedInFlightCount = 0;

  for (const trip of trips) {
    const status = trip.invoice?.status;
    if (status === 'ISSUED') {
      excludedIssuedCount += 1;
    } else if (isExcludedFromManualInvoiceExport(trip)) {
      excludedInFlightCount += 1;
    } else {
      exportable.push(trip);
    }
  }

  return {
    exportable,
    excludedCount: excludedIssuedCount + excludedInFlightCount,
    excludedIssuedCount,
    excludedInFlightCount,
  };
}

export function validateReopenInvoiceInput(
  reason: string,
  confirmNotIssuedManually: boolean,
): { valid: boolean; trimmedReason: string; error: string | null } {
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (trimmedReason.length === 0) {
    return {
      valid: false,
      trimmedReason,
      error: 'Vui lòng nhập lý do mở lại hoá đơn.',
    };
  }
  if (
    trimmedReason.length < REOPEN_REASON_MIN_LENGTH ||
    trimmedReason.length > REOPEN_REASON_MAX_LENGTH
  ) {
    return {
      valid: false,
      trimmedReason,
      error: `Lý do mở lại hoá đơn phải dài từ ${REOPEN_REASON_MIN_LENGTH} đến ${REOPEN_REASON_MAX_LENGTH} ký tự (không tính khoảng trắng đầu/cuối).`,
    };
  }
  if (confirmNotIssuedManually !== true) {
    return {
      valid: false,
      trimmedReason,
      error: 'Vui lòng xác nhận chuyến này CHƯA được xuất tay hoá đơn trên MISA.',
    };
  }
  return { valid: true, trimmedReason, error: null };
}

export function safeExternalHttpsUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function isTripWithinDateRange(tripDate: string, range: InvoiceDateRange) {
  const tripTime = new Date(tripDate).getTime();
  const fromTime = range.from
    ? new Date(`${range.from}T00:00:00+07:00`).getTime()
    : Number.NEGATIVE_INFINITY;
  const toTime = range.to
    ? new Date(`${range.to}T23:59:59+07:00`).getTime()
    : Number.POSITIVE_INFINITY;

  return tripTime >= fromTime && tripTime <= toTime;
}

export function filterInvoiceTrips(trips: InvoiceTrip[], range: InvoiceDateRange) {
  return [...trips]
    .filter((trip) => isTripWithinDateRange(trip.tripDate, range))
    .sort((a, b) => new Date(b.tripDate).getTime() - new Date(a.tripDate).getTime());
}

export function getInvoiceTotalAmount(trips: InvoiceTrip[]) {
  return trips.reduce((sum, trip) => sum + trip.totalWithVat, 0);
}

export function getInvoiceTotalPages(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginateInvoiceTrips(trips: InvoiceTrip[], page: number, pageSize: number) {
  const currentPage = Math.max(1, page);
  const start = (currentPage - 1) * pageSize;
  return trips.slice(start, start + pageSize);
}

export const formatInvoiceCurrency = (value: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);

export const formatInvoiceTripDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    // Cố định giờ VN — không phụ thuộc timezone trình duyệt admin.
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));

// "Ngày hoàn thành" column — date only (no time).
export const formatInvoiceDateOnly = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));

// The VAT-invoice "Dịch vụ" line. Shared by the table and the Excel export so
// they never diverge.
export const buildInvoiceServiceText = (trip: InvoiceTrip) =>
  `Cước dịch vụ vận chuyển hành khách theo hợp đồng số ${trip.contractNo}, ` +
  `hành trình: ${trip.pickupAddress} - ${trip.dropoffAddress} ` +
  `ngày ${formatInvoiceTripDate(trip.tripDate)} ` +
  `Biển số xe: ${trip.vehiclePlate}`;

export function buildInvoiceExportRows(trips: InvoiceTrip[]): InvoiceExportRow[] {
  return trips
    .filter((trip) => !isExcludedFromManualInvoiceExport(trip))
    .map((trip) => ({
      tripDate: formatInvoiceDateOnly(trip.tripDate),
      service: buildInvoiceServiceText(trip),
      totalWithVat: trip.totalWithVat,
      vat: trip.vat,
      vehiclePlate: trip.vehiclePlate,
      transportCompanyName: trip.transportCompanyName,
      // Không có thông tin VAT → "Khách lẻ" ở cột Tên đơn vị, MST/Địa chỉ để trống.
      invoiceCompanyName: trip.vatInfo?.companyName || 'Khách lẻ',
      invoiceTaxCode: trip.vatInfo?.companyName ? trip.vatInfo?.taxCode || '' : '',
      invoiceCompanyAddress: trip.vatInfo?.companyName
        ? trip.vatInfo?.companyAddress || ''
        : '',
      invoiceEmail: trip.vatInfo?.companyName
        ? trip.vatInfo?.invoiceEmail || ''
        : '',
    }));
}

// Header + rows matrix for the .xlsx export. Numbers stay numeric (no currency
// formatting) so Excel can sum/sort them; column order matches INVOICE_EXPORT_HEADERS.
export function buildInvoiceExportAoa(trips: InvoiceTrip[]): Array<Array<string | number>> {
  return buildInvoiceExportRows(trips).map((row) => [
    row.tripDate,
    row.service,
    row.totalWithVat,
    row.vat,
    row.vehiclePlate,
    row.transportCompanyName,
    row.invoiceCompanyName,
    row.invoiceTaxCode,
    row.invoiceCompanyAddress,
    row.invoiceEmail,
  ]);
}

export function getInvoiceExportFileName(range: InvoiceDateRange) {
  const from = range.from || 'tu-dau';
  const to = range.to || 'den-nay';

  return `hoa-don-${from}-${to}.xlsx`;
}
