import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import InvoicesPage from './page';
import type { AdminInvoiceRow } from '@/lib/api';

const userEvent = userEventLib.setup({ pointerEventsCheck: 0 });

const getAdminInvoices = vi.fn();
const getTransportCompanyList = vi.fn();
const getAdminContractPdfBlob = vi.fn();
const reopenAdminInvoice = vi.fn();
const downloadXlsx = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getAdminInvoices: (...a: any[]) => getAdminInvoices(...a),
    getTransportCompanyList: (...a: any[]) => getTransportCompanyList(...a),
    getAdminContractPdfBlob: (...a: any[]) => getAdminContractPdfBlob(...a),
    reopenAdminInvoice: (...a: any[]) => reopenAdminInvoice(...a),
  };
});

vi.mock('@/lib/csv', () => ({
  downloadXlsx: (...a: any[]) => downloadXlsx(...a),
}));

/** Quyền do test đặt — mặc định CHỈ có `invoices` (không có `invoice-reopen`). */
const { authFunctions } = vi.hoisted(() => ({ authFunctions: { current: ['invoices'] } }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    me: {
      id: 'admin-1',
      fullName: 'Kế toán',
      phone: '0900',
      isSuperAdmin: false,
      functions: authFunctions.current,
    },
    loading: false,
    can: (f: string) => authFunctions.current.includes(f),
    refresh: vi.fn(),
  }),
}));

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

const mkRow = (over: Partial<AdminInvoiceRow> = {}): AdminInvoiceRow => ({
  id: 'trip-1',
  tripDate: '2026-10-27T05:00:00.000Z',
  bookingCode: 'VGO-261027-120000',
  contractNo: 'HD-2026-1027-120000',
  pickupAddress: 'Số 1 Tràng Tiền',
  dropoffAddress: 'Sân bay Nội Bài',
  totalWithVat: 194400,
  vat: 14400,
  vehiclePlate: '30A-123.45',
  transportCompanyName: 'HTX Thăng Long',
  customerName: 'Nguyễn Văn A',
  vatInfo: null,
  invoice: null,
  ...over,
});

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!window.PointerEvent) (window as any).PointerEvent = MouseEvent;
});

beforeEach(() => {
  authFunctions.current = ['invoices'];
  getAdminInvoices.mockReset();
  getTransportCompanyList.mockReset();
  getAdminContractPdfBlob.mockReset();
  reopenAdminInvoice.mockReset();
  downloadXlsx.mockReset();
  toast.mockReset();

  getTransportCompanyList.mockResolvedValue([]);
  downloadXlsx.mockResolvedValue(undefined);
});

describe('InvoicesPage — HĐĐT MISA, C4 Excel export & mở lại hoá đơn (S6)', () => {
  it('hiển thị đầy đủ trạng thái HĐĐT MISA: ISSUED (số HĐ, ký hiệu, mã tra cứu), FAILED_PERMANENT (mã lỗi), SKIPPED (lý do) và chưa tạo HĐĐT', async () => {
    const rows: AdminInvoiceRow[] = [
      mkRow({
        id: 't-issued',
        invoice: {
          id: 'inv-issued',
          status: 'ISSUED',
          skipReason: null,
          invNo: '00000292',
          invSeries: '1C26TYY',
          lookupCode: 'TRA-CUU-292',
          lookupUrl: 'https://www.meinvoice.vn/tra-cuu',
          issuedAt: '2026-10-27T05:10:00.000Z',
          invDate: '2026-10-27',
          attempts: 1,
          lastErrorCode: null,
          lastError: null,
          nextAttemptAt: null,
        },
      }),
      mkRow({
        id: 't-failed',
        bookingCode: 'VGO-261027-120001',
        invoice: {
          id: 'inv-failed',
          status: 'FAILED_PERMANENT',
          skipReason: null,
          invNo: null,
          lookupCode: null,
          lookupUrl: null,
          issuedAt: null,
          invDate: '2026-10-27',
          attempts: 2,
          lastErrorCode: 'TAX_CODE_NEEDS_NAME_ADDRESS',
          lastError: 'Có MST nhưng thiếu tên hoặc địa chỉ đơn vị',
          nextAttemptAt: null,
        },
      }),
      mkRow({
        id: 't-skipped',
        bookingCode: 'VGO-261027-120002',
        invoice: {
          id: 'inv-skipped',
          status: 'SKIPPED',
          skipReason: 'CRM_ACCOUNT',
          invNo: null,
          lookupCode: null,
          lookupUrl: null,
          issuedAt: null,
          invDate: '2026-10-27',
          attempts: 0,
          lastErrorCode: null,
          lastError: null,
          nextAttemptAt: null,
        },
      }),
      mkRow({
        id: 't-none',
        bookingCode: 'VGO-261027-120003',
        invoice: null,
      }),
    ];

    getAdminInvoices.mockResolvedValue({
      data: rows,
      meta: { page: 1, limit: 10, total: 4, totalPages: 1 },
    });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('einvoice-status-t-issued')).toHaveTextContent('Đã phát hành');
    });

    expect(screen.getByTestId('einvoice-invno-t-issued')).toHaveTextContent('#00000292');
    expect(screen.getByTestId('einvoice-cell-t-issued')).toHaveTextContent('1C26TYY');
    const link = screen.getByRole('link', { name: /TRA-CUU-292/ });
    expect(link).toHaveAttribute('href', 'https://www.meinvoice.vn/tra-cuu');

    expect(screen.getByTestId('einvoice-status-t-failed')).toHaveTextContent('Lỗi cần xử lý');
    expect(screen.getByTestId('einvoice-error-t-failed')).toHaveTextContent(
      'TAX_CODE_NEEDS_NAME_ADDRESS',
    );
    expect(screen.getByTestId('einvoice-error-t-failed')).toHaveTextContent(
      'Có MST nhưng thiếu tên hoặc địa chỉ đơn vị',
    );

    expect(screen.getByTestId('einvoice-status-t-skipped')).toHaveTextContent('Bỏ qua tự động');
    expect(screen.getByTestId('einvoice-skip-t-skipped')).toHaveTextContent('CRM_ACCOUNT');

    expect(screen.getByTestId('einvoice-status-t-none')).toHaveTextContent('Chưa tạo HĐĐT');
  });

  it('KHÔNG có quyền invoice-reopen: ẩn hoàn toàn nút Mở lại HĐ kể cả khi dòng đang FAILED_PERMANENT', async () => {
    authFunctions.current = ['invoices'];
    getAdminInvoices.mockResolvedValue({
      data: [
        mkRow({
          id: 't-failed',
          invoice: {
            id: 'inv-failed',
            status: 'FAILED_PERMANENT',
            skipReason: null,
            invNo: null,
            lookupCode: null,
            lookupUrl: null,
            issuedAt: null,
            invDate: '2026-10-27',
            attempts: 1,
            lastErrorCode: 'MISSING_PLATE',
            lastError: 'Thiếu biển số xe',
            nextAttemptAt: null,
          },
        }),
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('einvoice-status-t-failed')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('reopen-invoice-btn-inv-failed')).not.toBeInTheDocument();
  });

  it('CÓ quyền invoice-reopen: chỉ hiện nút Mở lại HĐ cho dòng kẹt (FAILED/SKIPPED), kiểm lý do 5–300 ký tự + checkbox xác nhận chưa xuất tay trước khi gọi POST /admin/invoices/:id/reopen', async () => {
    authFunctions.current = ['invoices', 'invoice-reopen'];
    getAdminInvoices.mockResolvedValue({
      data: [
        mkRow({
          id: 't-issued',
          invoice: {
            id: 'inv-issued',
            status: 'ISSUED',
            skipReason: null,
            invNo: '00000001',
            lookupCode: 'LC-1',
            lookupUrl: null,
            issuedAt: '2026-10-27T05:10:00.000Z',
            invDate: '2026-10-27',
            attempts: 1,
            lastErrorCode: null,
            lastError: null,
            nextAttemptAt: null,
          },
        }),
        mkRow({
          id: 't-failed',
          bookingCode: 'VGO-261027-999999',
          invoice: {
            id: 'inv-failed',
            status: 'FAILED_PERMANENT',
            skipReason: null,
            invNo: null,
            lookupCode: null,
            lookupUrl: null,
            issuedAt: null,
            invDate: '2026-10-27',
            attempts: 1,
            lastErrorCode: 'MISSING_PLATE',
            lastError: 'Thiếu biển số xe',
            nextAttemptAt: null,
          },
        }),
      ],
      meta: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });
    reopenAdminInvoice.mockResolvedValue({ id: 'inv-failed', status: 'PENDING' });

    render(<InvoicesPage />);

    const reopenBtn = await screen.findByTestId('reopen-invoice-btn-inv-failed');
    expect(screen.queryByTestId('reopen-invoice-btn-inv-issued')).not.toBeInTheDocument();

    await userEvent.click(reopenBtn);

    const submitBtn = await screen.findByTestId('reopen-invoice-submit');
    expect(submitBtn).toBeDisabled();

    const reasonInput = screen.getByLabelText(/Lý do mở lại hoá đơn/);
    const confirmCheckbox = screen.getByRole('checkbox');

    // Lý do 4 ký tự sau trim + đã tick checkbox => vẫn khoá nút
    await userEvent.type(reasonInput, '  abcd  ');
    await userEvent.click(confirmCheckbox);
    expect(submitBtn).toBeDisabled();

    // Đủ ≥ 5 ký tự sau trim nhưng bỏ tick checkbox => vẫn khoá nút
    await userEvent.clear(reasonInput);
    await userEvent.type(reasonInput, '  Đã bổ sung biển số xe cho tài xế  ');
    await userEvent.click(confirmCheckbox);
    expect(submitBtn).toBeDisabled();

    // Đủ lý do + đã tick xác nhận => mở khoá và gửi đúng payload đã trim
    await userEvent.click(confirmCheckbox);
    expect(submitBtn).not.toBeDisabled();
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(reopenAdminInvoice).toHaveBeenCalledWith('inv-failed', {
        reason: 'Đã bổ sung biển số xe cho tài xế',
        confirmNotIssuedManually: true,
      });
    });
  });

  it('C4: Xuất Excel loại bỏ các chuyến đã ISSUED hoặc đang xử lý (PENDING/SUBMITTING/SUBMITTED/FAILED_RETRYABLE), chỉ xuất chuyến cần nhập tay', async () => {
    const rows: AdminInvoiceRow[] = [
      mkRow({
        id: 't-issued',
        vehiclePlate: '29A-111.11',
        invoice: {
          id: 'inv-issued',
          status: 'ISSUED',
          skipReason: null,
          invNo: '00000001',
          lookupCode: 'LC-1',
          lookupUrl: null,
          issuedAt: '2026-10-27T05:10:00.000Z',
          invDate: '2026-10-27',
          attempts: 1,
          lastErrorCode: null,
          lastError: null,
          nextAttemptAt: null,
        },
      }),
      mkRow({
        id: 't-pending',
        vehiclePlate: '29A-222.22',
        invoice: {
          id: 'inv-pending',
          status: 'PENDING',
          skipReason: null,
          invNo: null,
          lookupCode: null,
          lookupUrl: null,
          issuedAt: null,
          invDate: '2026-10-27',
          attempts: 0,
          lastErrorCode: null,
          lastError: null,
          nextAttemptAt: null,
        },
      }),
      mkRow({
        id: 't-retryable',
        vehiclePlate: '29A-333.33',
        invoice: {
          id: 'inv-retryable',
          status: 'FAILED_RETRYABLE',
          skipReason: null,
          invNo: null,
          lookupCode: null,
          lookupUrl: null,
          issuedAt: null,
          invDate: '2026-10-27',
          attempts: 1,
          lastErrorCode: 'NET_TimeoutError',
          lastError: null,
          nextAttemptAt: '2026-10-27T05:15:00.000Z',
        },
      }),
      mkRow({
        id: 't-manual',
        vehiclePlate: '30A-999.99',
        invoice: null,
      }),
    ];

    getAdminInvoices.mockResolvedValue({
      data: rows,
      meta: { page: 1, limit: 10, total: 4, totalPages: 1 },
    });

    render(<InvoicesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('einvoice-status-t-issued')).toBeInTheDocument();
    });

    // PENDING hiện mô tả chi tiết; FAILED_RETRYABLE khi lastError=null vẫn hiện fallback detail
    expect(screen.getByTestId('einvoice-cell-t-pending')).toHaveTextContent(
      'Đang xếp hàng chờ worker phát hành',
    );
    expect(screen.getByTestId('einvoice-error-t-retryable')).toHaveTextContent(
      'Hệ thống sẽ tự động thử lại',
    );

    const exportBtn = screen.getByRole('button', { name: /Xuất Excel/ });
    await userEvent.click(exportBtn);

    await waitFor(() => {
      expect(downloadXlsx).toHaveBeenCalledTimes(1);
    });

    const [, , aoa] = downloadXlsx.mock.calls[0];
    expect(aoa).toHaveLength(1);
    expect(aoa[0][4]).toBe('30A-999.99');
  });

  it('C4 nhiều trang: trang 1 toàn chuyến ISSUED/FAILED_RETRYABLE, trang 2 có chuyến null + FAILED_PERMANENT => gộp đủ các trang rồi mới lọc và xuất đúng chuyến trang 2', async () => {
    const page1Rows: AdminInvoiceRow[] = [
      mkRow({
        id: 'p1-issued',
        vehiclePlate: '29A-100.01',
        invoice: {
          id: 'inv-p1-issued',
          status: 'ISSUED',
          skipReason: null,
          invNo: '00000101',
          lookupCode: 'LC-101',
          lookupUrl: null,
          issuedAt: '2026-10-27T05:10:00.000Z',
          invDate: '2026-10-27',
          attempts: 1,
          lastErrorCode: null,
          lastError: null,
          nextAttemptAt: null,
        },
      }),
      mkRow({
        id: 'p1-retryable',
        vehiclePlate: '29A-100.02',
        invoice: {
          id: 'inv-p1-retryable',
          status: 'FAILED_RETRYABLE',
          skipReason: null,
          invNo: null,
          lookupCode: null,
          lookupUrl: null,
          issuedAt: null,
          invDate: '2026-10-27',
          attempts: 2,
          lastErrorCode: 'NET_TimeoutError',
          lastError: 'MISA timeout',
          nextAttemptAt: '2026-10-27T05:20:00.000Z',
        },
      }),
    ];
    const page2Rows: AdminInvoiceRow[] = [
      mkRow({
        id: 'p2-null',
        vehiclePlate: '30A-200.01',
        invoice: null,
      }),
      mkRow({
        id: 'p2-failed-perm',
        vehiclePlate: '30A-200.02',
        invoice: {
          id: 'inv-p2-perm',
          status: 'FAILED_PERMANENT',
          skipReason: null,
          invNo: null,
          lookupCode: null,
          lookupUrl: null,
          issuedAt: null,
          invDate: '2026-10-27',
          attempts: 6,
          lastErrorCode: 'DEADLINE_PASSED',
          lastError: 'Quá hạn tự động',
          nextAttemptAt: null,
        },
      }),
    ];

    getAdminInvoices.mockImplementation(async (params: { page?: number; limit?: number }) => {
      if (params?.limit === 1000 && params?.page === 1) {
        return { data: page1Rows, meta: { page: 1, limit: 1000, total: 4, totalPages: 2 } };
      }
      if (params?.limit === 1000 && params?.page === 2) {
        return { data: page2Rows, meta: { page: 2, limit: 1000, total: 4, totalPages: 2 } };
      }
      return { data: page1Rows, meta: { page: 1, limit: 10, total: 4, totalPages: 1 } };
    });

    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('einvoice-status-p1-issued')).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /Xuất Excel/ });
    await userEvent.click(exportBtn);

    await waitFor(() => {
      expect(downloadXlsx).toHaveBeenCalledTimes(1);
    });

    const [, , aoa] = downloadXlsx.mock.calls[0];
    expect(aoa).toHaveLength(2);
    expect(aoa.map((r: unknown[]) => r[4])).toEqual(['30A-200.01', '30A-200.02']);
  });

  it('C4: khi TẤT CẢ chuyến trong bộ lọc đều đã ISSUED hoặc đang xử lý trên MISA, bấm Xuất Excel KHÔNG tải file rỗng mà báo toast rõ ràng', async () => {
    getAdminInvoices.mockResolvedValue({
      data: [
        mkRow({
          id: 't-issued',
          invoice: {
            id: 'inv-issued',
            status: 'ISSUED',
            skipReason: null,
            invNo: '00000001',
            lookupCode: 'LC-1',
            lookupUrl: null,
            issuedAt: '2026-10-27T05:10:00.000Z',
            invDate: '2026-10-27',
            attempts: 1,
            lastErrorCode: null,
            lastError: null,
            nextAttemptAt: null,
          },
        }),
        mkRow({
          id: 't-submitting',
          invoice: {
            id: 'inv-submitting',
            status: 'SUBMITTING',
            skipReason: null,
            invNo: null,
            lookupCode: null,
            lookupUrl: null,
            issuedAt: null,
            invDate: '2026-10-27',
            attempts: 1,
            lastErrorCode: null,
            lastError: null,
            nextAttemptAt: null,
          },
        }),
      ],
      meta: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });

    render(<InvoicesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('einvoice-status-t-issued')).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /Xuất Excel/ });
    await userEvent.click(exportBtn);

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Không có chuyến cần xuất Excel tay',
        }),
      );
    });
    expect(downloadXlsx).not.toHaveBeenCalled();
  });
});
