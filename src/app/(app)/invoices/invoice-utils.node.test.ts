import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INVOICE_EXPORT_HEADERS,
  buildInvoiceExportAoa,
  buildInvoiceExportRows,
  buildInvoiceServiceText,
  filterInvoiceTrips,
  formatInvoiceCurrency,
  formatInvoiceDateOnly,
  getInvoiceExportFileName,
  getInvoiceTotalAmount,
  getInvoiceTotalPages,
  paginateInvoiceTrips,
  type InvoiceTrip,
} from './invoice-utils';

const trips: InvoiceTrip[] = [
  {
    id: 'older',
    tripDate: '2026-05-01T00:00:00+07:00',
    bookingCode: 'VGO-260501-001',
    contractNo: 'HD-2026-0501-001',
    pickupAddress: 'A',
    dropoffAddress: 'B',
    totalWithVat: 100000,
    vat: 8000,
    vehiclePlate: '29A-111.11',
    transportCompanyName: 'HTX A',
  },
  {
    id: 'middle',
    tripDate: '2026-05-15T12:30:00+07:00',
    bookingCode: 'VGO-260515-001',
    contractNo: 'HD-2026-0515-001',
    pickupAddress: 'C',
    dropoffAddress: 'D',
    totalWithVat: 200000,
    vat: 16000,
    vehiclePlate: '30A-222.22',
    transportCompanyName: 'HTX B',
  },
  {
    id: 'newer',
    tripDate: '2026-06-01T23:59:59+07:00',
    bookingCode: 'VGO-260601-001',
    contractNo: 'HD-2026-0601-001',
    pickupAddress: 'E',
    dropoffAddress: 'F',
    totalWithVat: 300000,
    vat: 24000,
    vehiclePlate: '31A-333.33',
    transportCompanyName: 'HTX C',
  },
];

describe('invoice utils', () => {
  it('filters trips by an inclusive date range and sorts newest first', () => {
    const result = filterInvoiceTrips(trips, { from: '2026-05-01', to: '2026-05-31' });

    assert.deepEqual(
      result.map((trip) => trip.id),
      ['middle', 'older'],
    );
  });

  it('supports open-ended date ranges', () => {
    const result = filterInvoiceTrips(trips, { from: '2026-05-15', to: '' });

    assert.deepEqual(
      result.map((trip) => trip.id),
      ['newer', 'middle'],
    );
  });

  it('paginates filtered trips without mutating item order', () => {
    const result = paginateInvoiceTrips(trips, 2, 1);

    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'middle');
  });

  it('calculates total pages with at least one page', () => {
    assert.equal(getInvoiceTotalPages(0, 10), 1);
    assert.equal(getInvoiceTotalPages(21, 10), 3);
  });

  it('calculates and formats total invoice amount', () => {
    assert.equal(getInvoiceTotalAmount(trips), 600000);
    assert.equal(formatInvoiceCurrency(600000), '600.000 ₫');
  });

  it('builds export rows with the new invoice columns (Khách lẻ when no VAT)', () => {
    assert.deepEqual(buildInvoiceExportRows([trips[1]]), [
      {
        tripDate: formatInvoiceDateOnly(trips[1].tripDate),
        service: buildInvoiceServiceText(trips[1]),
        totalWithVat: 200000,
        vat: 16000,
        vehiclePlate: '30A-222.22',
        transportCompanyName: 'HTX B',
        invoiceCompanyName: 'Khách lẻ',
        invoiceTaxCode: '',
        invoiceCompanyAddress: '',
      },
    ]);
  });

  it('export row uses VAT company/MST/address when present', () => {
    const withVat: InvoiceTrip = {
      ...trips[1],
      vatInfo: {
        companyName: 'CTY ABC',
        taxCode: '0101234567',
        companyAddress: 'Hà Nội',
      },
    };
    const [row] = buildInvoiceExportRows([withVat]);
    assert.equal(row.invoiceCompanyName, 'CTY ABC');
    assert.equal(row.invoiceTaxCode, '0101234567');
    assert.equal(row.invoiceCompanyAddress, 'Hà Nội');
  });

  it('builds the .xlsx matrix: column order + raw numeric money columns', () => {
    const aoa = buildInvoiceExportAoa([trips[0]]);
    assert.equal(aoa.length, 1);
    const [row] = aoa;
    // One cell per header, in order.
    assert.equal(row.length, INVOICE_EXPORT_HEADERS.length);
    assert.equal(row[0], formatInvoiceDateOnly(trips[0].tripDate));
    assert.equal(row[1], buildInvoiceServiceText(trips[0]));
    // Money stays a real number (not a formatted string) so Excel can sum/sort it.
    assert.equal(row[2], 100000);
    assert.equal(typeof row[2], 'number');
    assert.equal(row[3], 8000);
    assert.equal(typeof row[3], 'number');
    assert.equal(row[4], '29A-111.11');
    assert.equal(row[5], 'HTX A');
    // VAT columns — Khách lẻ khi không có thông tin xuất hoá đơn.
    assert.equal(row[6], 'Khách lẻ');
    assert.equal(row[7], '');
    assert.equal(row[8], '');
  });

  it('builds an .xlsx export file name from the active date range', () => {
    assert.equal(
      getInvoiceExportFileName({ from: '2026-05-01', to: '2026-05-31' }),
      'hoa-don-2026-05-01-2026-05-31.xlsx',
    );
  });
});
