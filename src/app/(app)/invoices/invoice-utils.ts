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
};

export const INVOICE_EXPORT_HEADERS = [
  'Ngày đặt xe',
  'Dịch vụ',
  'Thành tiền (gồm VAT)',
  'VAT',
  'Biển số xe',
  'Tên DVVT',
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

// "Ngày đặt xe" column — date only (no time).
export const formatInvoiceDateOnly = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));

// The VAT-invoice "Dịch vụ" line. Shared by the table and the Excel export so
// they never diverge.
export const buildInvoiceServiceText = (trip: InvoiceTrip) =>
  `Cước dịch vụ vận chuyển hành khách theo hợp đồng số ${trip.contractNo}, ` +
  `hành trình: ${trip.pickupAddress} - ${trip.dropoffAddress} ` +
  `ngày ${formatInvoiceTripDate(trip.tripDate)} ` +
  `Biển số xe: ${trip.vehiclePlate}`;

export function buildInvoiceExportRows(trips: InvoiceTrip[]): InvoiceExportRow[] {
  return trips.map((trip) => ({
    tripDate: formatInvoiceDateOnly(trip.tripDate),
    service: buildInvoiceServiceText(trip),
    totalWithVat: trip.totalWithVat,
    vat: trip.vat,
    vehiclePlate: trip.vehiclePlate,
    transportCompanyName: trip.transportCompanyName,
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
  ]);
}

export function getInvoiceExportFileName(range: InvoiceDateRange) {
  const from = range.from || 'tu-dau';
  const to = range.to || 'den-nay';

  return `hoa-don-${from}-${to}.xlsx`;
}
