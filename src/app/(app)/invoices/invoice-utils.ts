export type InvoiceTrip = {
  id: string;
  tripDate: string;
  bookingCode: string;
  contractNo: string;
  pickupAddress: string;
  dropoffAddress: string;
  totalWithVat: number;
  vehiclePlate: string;
};

export type InvoiceDateRange = {
  from: string;
  to: string;
};

export type InvoiceExportRow = {
  tripDate: string;
  bookingCode: string;
  contractNo: string;
  pickupAddress: string;
  dropoffAddress: string;
  totalWithVat: number;
  vehiclePlate: string;
};

const INVOICE_EXPORT_HEADERS = [
  'Ngày tháng',
  'Mã chuyến đi',
  'Số hợp đồng',
  'Điểm đi',
  'Điểm đến',
  'Tổng tiền gồm VAT',
  'Biển số xe',
];

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
  }).format(new Date(value));

function escapeExcelCell(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildInvoiceExportRows(trips: InvoiceTrip[]): InvoiceExportRow[] {
  return trips.map((trip) => ({
    tripDate: formatInvoiceTripDate(trip.tripDate),
    bookingCode: trip.bookingCode,
    contractNo: trip.contractNo,
    pickupAddress: trip.pickupAddress,
    dropoffAddress: trip.dropoffAddress,
    totalWithVat: trip.totalWithVat,
    vehiclePlate: trip.vehiclePlate,
  }));
}

export function buildInvoiceExcelDocument(trips: InvoiceTrip[]) {
  const rows = buildInvoiceExportRows(trips);
  const headerHtml = INVOICE_EXPORT_HEADERS.map((header) => `<th>${escapeExcelCell(header)}</th>`).join('');
  const bodyHtml = rows
    .map(
      (row) => `
        <tr>
          <td class="text">${escapeExcelCell(row.tripDate)}</td>
          <td class="text">${escapeExcelCell(row.bookingCode)}</td>
          <td class="text">${escapeExcelCell(row.contractNo)}</td>
          <td class="text">${escapeExcelCell(row.pickupAddress)}</td>
          <td class="text">${escapeExcelCell(row.dropoffAddress)}</td>
          <td class="number">${row.totalWithVat}</td>
          <td class="text">${escapeExcelCell(row.vehiclePlate)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          table { border-collapse: collapse; }
          th, td { border: 1px solid #d9d9d9; padding: 6px 8px; }
          th { background: #f2f2f2; font-weight: 700; }
          .text { mso-number-format: "\\@"; }
          .number { mso-number-format: "0"; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>${headerHtml}</tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </body>
    </html>
  `.trim();
}

export function getInvoiceExportFileName(range: InvoiceDateRange) {
  const from = range.from || 'tu-dau';
  const to = range.to || 'den-nay';

  return `hoa-don-${from}-${to}.xls`;
}
