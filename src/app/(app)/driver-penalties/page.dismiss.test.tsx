import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from '@/components/ui/toaster';
import DriverPenaltiesPage from './page';
import { buildApiError } from '@/lib/api-error';
import type { PenaltyQueueRow } from '@/lib/api';

/**
 * Nút "Không phạt" + tab "Đã bỏ qua".
 *
 * Điều đắt nhất được khoá ở đây: chuyến KHÔNG thu được đồng nào (`collectibleAmount = 0`)
 * vẫn phải BỎ QUA ĐƯỢC. Đó chính là nhóm chuyến người soát cần dọn khỏi hàng đợi nhất,
 * mà nút "Phạt" thì đang disabled đúng ở nhóm đó — copy điều kiện disabled của nút Phạt
 * sang nút này là biến tính năng thành vô dụng, im lặng.
 */

const getPenaltyQueue = vi.fn();
const listPenalties = vi.fn();
const dismissPenaltyBooking = vi.fn();
const restorePenaltyDismissal = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getPenaltyQueue: (...a: any[]) => getPenaltyQueue(...a),
    listPenalties: (...a: any[]) => listPenalties(...a),
    dismissPenaltyBooking: (...a: any[]) => dismissPenaltyBooking(...a),
    restorePenaltyDismissal: (...a: any[]) => restorePenaltyDismissal(...a),
  };
});

const emptyHistory = { data: [], meta: { totalPages: 1, totals: { count: 0, amount: 0 } } };

const queueRow = (over: Partial<PenaltyQueueRow> = {}): PenaltyQueueRow => ({
  bookingId: 'b1',
  cancelledAt: '2026-09-01T03:00:00.000Z',
  cancelReason: 'khách bận',
  cancelledByRole: 'CUSTOMER',
  pickupAddress: 'A',
  dropoffAddress: 'B',
  driverEntityId: 'de1',
  driverName: 'Tài A',
  driverPhone: '0900000001',
  leakageVerdict: null,
  leakageConfidence: null,
  cancelAlertRule: null,
  cancelAlertAction: null,
  cancelAlertRatePct: null,
  cancelAlertShadow: null,
  cancelAlertReason: null,
  penaltyId: null,
  penaltyStatus: null,
  penaltyAmount: null,
  dismissalId: null,
  dismissNote: null,
  dismissedAt: null,
  dismissedByName: null,
  collectibleAmount: 20000,
  ...over,
});

const queueOf = (...rows: PenaltyQueueRow[]) => ({ data: rows, meta: { totalPages: 1 } });

beforeEach(() => {
  getPenaltyQueue.mockReset().mockResolvedValue(queueOf(queueRow()));
  listPenalties.mockReset().mockResolvedValue(emptyHistory);
  dismissPenaltyBooking.mockReset().mockResolvedValue({});
  restorePenaltyDismissal.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <>
      <Toaster />
      <DriverPenaltiesPage />
    </>,
  );
}

const clickDismiss = async () =>
  userEvent.click(await screen.findByRole('button', { name: /không phạt/i }));

describe('DriverPenaltiesPage — nút "Không phạt"', () => {
  it('bấm → hỏi lý do → gọi API kèm lý do', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('khách tự huỷ, tài không lỗi');
    renderPage();

    await clickDismiss();

    await waitFor(() =>
      expect(dismissPenaltyBooking).toHaveBeenCalledWith('b1', 'khách tự huỷ, tài không lỗi'),
    );
  });

  it('bấm OK mà không gõ gì → vẫn bỏ qua, note để trống', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('');
    renderPage();

    await clickDismiss();

    await waitFor(() => expect(dismissPenaltyBooking).toHaveBeenCalledWith('b1', undefined));
  });

  it('bấm Huỷ ở hộp thoại → KHÔNG gọi API', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    renderPage();

    await clickDismiss();

    await waitFor(() => expect(window.prompt).toHaveBeenCalled());
    expect(dismissPenaltyBooking).not.toHaveBeenCalled();
  });

  it('chuyến KHÔNG thu được đồng nào vẫn bỏ qua được (nút Phạt disabled, nút này thì không)', async () => {
    getPenaltyQueue.mockResolvedValue(queueOf(queueRow({ collectibleAmount: 0 })));
    vi.spyOn(window, 'prompt').mockReturnValue('');
    renderPage();

    expect(await screen.findByRole('button', { name: /^phạt$/i })).toBeDisabled();
    const btn = await screen.findByRole('button', { name: /không phạt/i });
    expect(btn).toBeEnabled();

    await userEvent.click(btn);
    await waitFor(() => expect(dismissPenaltyBooking).toHaveBeenCalled());
  });

  it('chuyến ĐÃ bị phạt → nút bị khoá', async () => {
    getPenaltyQueue.mockResolvedValue(
      queueOf(queueRow({ penaltyStatus: 'ACTIVE', penaltyId: 'p1', penaltyAmount: 20000 })),
    );
    renderPage();

    expect(await screen.findByRole('button', { name: /không phạt/i })).toBeDisabled();
  });

  it('lỗi API → toast kèm câu backend và mã lỗi', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('');
    dismissPenaltyBooking.mockRejectedValue(
      buildApiError({
        body: { error: { code: 'PEN_020', message: 'Chuyến này đã được đánh dấu Không phạt rồi.' } },
        httpStatus: 409,
        path: 'POST /admin/driver-penalties/dismiss',
      }),
    );
    renderPage();

    await clickDismiss();

    await screen.findByText('Chuyến này đã được đánh dấu Không phạt rồi.', undefined, {
      timeout: 3000,
    });
    expect(screen.getByText(/Mã lỗi: PEN_020 \(HTTP 409\)/)).toBeInTheDocument();
  });
});

describe('DriverPenaltiesPage — tab "Đã bỏ qua"', () => {
  const dismissedRow = queueRow({
    dismissalId: 'dm1',
    dismissNote: 'khách tự huỷ',
    dismissedAt: '2026-09-02T03:00:00.000Z',
    dismissedByName: 'Soát viên A',
  });

  it('gọi hàng đợi với state=dismissed', async () => {
    renderPage();
    await waitFor(() => expect(getPenaltyQueue).toHaveBeenCalled());

    await userEvent.click(await screen.findByRole('tab', { name: 'Đã bỏ qua' }));

    await waitFor(
      () =>
        expect(getPenaltyQueue).toHaveBeenLastCalledWith(
          expect.objectContaining({ state: 'dismissed' }),
        ),
      { timeout: 3000 },
    );
  });

  it('hiện ai bỏ qua + lý do, và nút Khôi phục gọi đúng API', async () => {
    getPenaltyQueue.mockResolvedValue(queueOf(dismissedRow));
    renderPage();

    await userEvent.click(await screen.findByRole('tab', { name: 'Đã bỏ qua' }));

    expect(await screen.findByText(/Soát viên A/, undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/khách tự huỷ/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /khôi phục/i }));
    await waitFor(() => expect(restorePenaltyDismissal).toHaveBeenCalledWith('b1'));
  });

  it('tab "Tất cả": dòng đã bỏ qua đeo badge và KHÔNG cho bỏ qua lần nữa', async () => {
    getPenaltyQueue.mockResolvedValue(queueOf(dismissedRow));
    renderPage();

    await userEvent.click(await screen.findByRole('tab', { name: 'Tất cả chuyến huỷ' }));

    const btn = await screen.findByRole('button', { name: /không phạt/i }, { timeout: 3000 });
    expect(btn).toBeDisabled();
    // "Đã bỏ qua" cũng là nhãn tab — chỉ tính lần xuất hiện NGOÀI thanh tab mới là badge.
    const badges = screen
      .getAllByText('Đã bỏ qua')
      .filter((el) => !el.closest('[role="tab"]'));
    expect(badges).toHaveLength(1);
  });
});
