import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EINVOICE_AUTO_HANDLED_STATUSES,
  INVOICE_EXPORT_HEADERS,
  buildInvoiceExportAoa,
  buildInvoiceExportRows,
  buildInvoiceServiceText,
  describeEInvoiceStatus,
  describeSkipReason,
  filterInvoiceTrips,
  formatInvoiceCurrency,
  formatInvoiceDateOnly,
  getInvoiceExportFileName,
  getInvoiceTotalAmount,
  getInvoiceTotalPages,
  isExcludedFromManualInvoiceExport,
  isInvoiceReopenable,
  paginateInvoiceTrips,
  partitionInvoiceTripsForExport,
  safeExternalHttpsUrl,
  validateReopenInvoiceInput,
  type InvoiceEInvoiceState,
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

const mkInvoice = (over: Partial<InvoiceEInvoiceState> = {}): InvoiceEInvoiceState => ({
  id: 'inv-1',
  status: 'ISSUED',
  skipReason: null,
  invNo: '00000123',
  invSeries: '1C26TYY',
  lookupCode: 'TRA-CUU-1',
  lookupUrl: 'https://www.meinvoice.vn/tra-cuu',
  issuedAt: '2026-10-27T03:20:00.000Z',
  invDate: '2026-10-27',
  attempts: 1,
  lastErrorCode: null,
  lastError: null,
  nextAttemptAt: null,
  ...over,
});

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
        invoiceEmail: '',
      },
    ]);
  });

  it('export row uses VAT company/MST/address/email when present', () => {
    const withVat: InvoiceTrip = {
      ...trips[1],
      vatInfo: {
        companyName: 'CTY ABC',
        taxCode: '0101234567',
        companyAddress: 'Hà Nội',
        invoiceEmail: 'ketoan@abc.vn',
      },
    };
    const [row] = buildInvoiceExportRows([withVat]);
    assert.equal(row.invoiceCompanyName, 'CTY ABC');
    assert.equal(row.invoiceTaxCode, '0101234567');
    assert.equal(row.invoiceCompanyAddress, 'Hà Nội');
    assert.equal(row.invoiceEmail, 'ketoan@abc.vn');
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
    assert.equal(row[9], '');
  });

  it('builds an .xlsx export file name from the active date range', () => {
    assert.equal(
      getInvoiceExportFileName({ from: '2026-05-01', to: '2026-05-31' }),
      'hoa-don-2026-05-01-2026-05-31.xlsx',
    );
  });

  it('C4: excludes ISSUED and in-flight (PENDING/SUBMITTING/SUBMITTED/FAILED_RETRYABLE) MISA invoices from Excel export while keeping null/FAILED_PERMANENT/SKIPPED', () => {
    for (const status of EINVOICE_AUTO_HANDLED_STATUSES) {
      assert.equal(
        isExcludedFromManualInvoiceExport({ invoice: mkInvoice({ status }) }),
        true,
        `${status} must be excluded from manual Excel export`,
      );
    }
    assert.equal(
      isExcludedFromManualInvoiceExport({ invoice: mkInvoice({ status: 'FAILED_RETRYABLE' }) }),
      true,
      'FAILED_RETRYABLE is still automatically retried by worker and must be excluded from manual Excel export',
    );
    assert.equal(isExcludedFromManualInvoiceExport({ invoice: null }), false);
    assert.equal(isExcludedFromManualInvoiceExport({ invoice: undefined }), false);
    for (const status of ['FAILED_PERMANENT', 'SKIPPED'] as const) {
      assert.equal(
        isExcludedFromManualInvoiceExport({ invoice: mkInvoice({ status }) }),
        false,
        `${status} must remain in manual Excel export`,
      );
    }

    const mixed: InvoiceTrip[] = [
      { ...trips[0], id: 't-null', invoice: null },
      { ...trips[0], id: 't-issued', invoice: mkInvoice({ status: 'ISSUED' }) },
      { ...trips[0], id: 't-pending', invoice: mkInvoice({ status: 'PENDING' }) },
      { ...trips[0], id: 't-submitting', invoice: mkInvoice({ status: 'SUBMITTING' }) },
      { ...trips[0], id: 't-submitted', invoice: mkInvoice({ status: 'SUBMITTED' }) },
      { ...trips[0], id: 't-retryable', invoice: mkInvoice({ status: 'FAILED_RETRYABLE' }) },
      { ...trips[1], id: 't-failed-perm', invoice: mkInvoice({ status: 'FAILED_PERMANENT' }) },
      { ...trips[2], id: 't-skipped', invoice: mkInvoice({ status: 'SKIPPED' }) },
    ];

    const part = partitionInvoiceTripsForExport(mixed);
    assert.deepEqual(
      part.exportable.map((t) => t.id),
      ['t-null', 't-failed-perm', 't-skipped'],
    );
    assert.equal(part.excludedIssuedCount, 1);
    assert.equal(part.excludedInFlightCount, 4);
    assert.equal(part.excludedCount, 5);

    const exported = buildInvoiceExportRows(mixed);
    assert.equal(exported.length, 3);
    assert.equal(buildInvoiceExportAoa(mixed).length, 3);
  });

  it('isInvoiceReopenable allows only FAILED_RETRYABLE, FAILED_PERMANENT, and SKIPPED', () => {
    assert.equal(isInvoiceReopenable(null), false);
    assert.equal(isInvoiceReopenable(undefined), false);
    for (const status of ['PENDING', 'SUBMITTING', 'SUBMITTED', 'ISSUED'] as const) {
      assert.equal(isInvoiceReopenable(mkInvoice({ status })), false);
    }
    for (const status of ['FAILED_RETRYABLE', 'FAILED_PERMANENT', 'SKIPPED'] as const) {
      assert.equal(isInvoiceReopenable(mkInvoice({ status })), true);
    }
  });

  it('validateReopenInvoiceInput enforces trimmed reason length 5..300 and confirmNotIssuedManually === true', () => {
    assert.equal(validateReopenInvoiceInput('', true).valid, false);
    assert.equal(validateReopenInvoiceInput('   abcd   ', true).valid, false);
    assert.equal(validateReopenInvoiceInput('a'.repeat(301), true).valid, false);
    assert.equal(validateReopenInvoiceInput('Lý do hợp lệ', false).valid, false);

    const okMin = validateReopenInvoiceInput('  abcde  ', true);
    assert.equal(okMin.valid, true);
    assert.equal(okMin.trimmedReason, 'abcde');
    assert.equal(okMin.error, null);

    const okMax = validateReopenInvoiceInput('x'.repeat(300), true);
    assert.equal(okMax.valid, true);
  });

  it('describeEInvoiceStatus and describeSkipReason format all MISA statuses and skip reasons', () => {
    assert.equal(describeEInvoiceStatus(null).tone, 'none');
    assert.equal(describeEInvoiceStatus(mkInvoice({ status: 'ISSUED' })).code, '#00000123');
    assert.equal(
      describeEInvoiceStatus(
        mkInvoice({
          status: 'FAILED_PERMANENT',
          lastErrorCode: 'DEADLINE_PASSED',
          lastError: 'Quá hạn tự động',
        }),
      ).code,
      'DEADLINE_PASSED',
    );
    assert.match(describeSkipReason('CRM_ACCOUNT'), /CRM_ACCOUNT/);
  });

  it('safeExternalHttpsUrl accepts only valid https:// URLs', () => {
    assert.equal(
      safeExternalHttpsUrl('https://www.meinvoice.vn/tra-cuu'),
      'https://www.meinvoice.vn/tra-cuu',
    );
    assert.equal(safeExternalHttpsUrl('http://www.meinvoice.vn/tra-cuu'), null);
    assert.equal(safeExternalHttpsUrl('javascript:alert(1)'), null);
    assert.equal(safeExternalHttpsUrl(null), null);
  });
});
