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
