import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from '@/components/ui/toaster';
import DriverPenaltiesPage from './page';
import { buildApiError } from '@/lib/api-error';
import type { DriverPenaltyRow } from '@/lib/api';

/**
 * Hai đường LỖI của trang Phạt vi phạm — đúng hai chỗ từng gọi `parseApiError`, một hàm
 * đã bị xoá khỏi `@/lib/api`. Không test nào chạm tới nên lỗi lên thẳng production:
 * `ignoreBuildErrors` nuốt lỗi type, và mọi toast lỗi ở màn TIỀN THẬT này ném TypeError
 * thay vì hiện thông báo.
 *
 * Vì vậy test dựng `<Toaster />` THẬT và khẳng định trên chữ hiện ra màn hình. Mock
 * `useToast` rồi kiểm `toast` có được gọi không sẽ bỏ lọt đúng loại lỗi đó.
 */

const getPenaltyQueue = vi.fn();
const listPenalties = vi.fn();
const reversePenalty = vi.fn();

// Spread module thật rồi chỉ chặn 3 endpoint: trang này kéo theo cả FinanceFilter,
// PenaltyDialog… mỗi cái lại import thêm vài hàm api. Liệt kê tay là đỏ vặt liên miên.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getPenaltyQueue: (...a: any[]) => getPenaltyQueue(...a),
    listPenalties: (...a: any[]) => listPenalties(...a),
    reversePenalty: (...a: any[]) => reversePenalty(...a),
  };
});

const emptyQueue = { data: [], meta: { totalPages: 1 } };
const emptyHistory = { data: [], meta: { totalPages: 1, totals: { count: 0, amount: 0 } } };

const activeRow: DriverPenaltyRow = {
  id: 'p1',
  bookingId: 'b1',
  driverEntityId: 'de1',
  driverName: 'Tài A',
  driverPhone: '0900000001',
  amount: 20000,
  fromMain: 20000,
  fromDeposit: 0,
  reasonCode: 'OFF_PLATFORM',
  note: null,
  source: 'PENALTY_PAGE',
  status: 'ACTIVE',
  createdByName: 'Admin A',
  createdAt: '2026-08-01T03:00:00.000Z',
  reversedByName: null,
  reversedAt: null,
  reverseNote: null,
};

beforeEach(() => {
  getPenaltyQueue.mockReset().mockResolvedValue(emptyQueue);
  listPenalties.mockReset().mockResolvedValue(emptyHistory);
  reversePenalty.mockReset().mockResolvedValue({});
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

describe('DriverPenaltiesPage — tải danh sách lỗi', () => {
  it('hiện toast kèm câu backend và mã lỗi, không đứng hình', async () => {
    getPenaltyQueue.mockRejectedValue(
      buildApiError({
        body: { error: { code: 'PEN_007', message: 'Bạn không có quyền xem hàng đợi phạt.' } },
        httpStatus: 403,
        path: 'GET /admin/driver-penalties/queue',
      }),
    );

    renderPage();

    // Chờ CÂU chứ không chờ tiêu đề: toast giữ state ở tầng module nên toast của ca
    // trước còn đó, mà hai ca ở đây dùng chung tiêu đề "Không tải được dữ liệu" —
    // chờ tiêu đề là vớ phải toast cũ rồi khẳng định nhầm. load() debounce 300ms.
    await screen.findByText('Bạn không có quyền xem hàng đợi phạt.', undefined, { timeout: 3000 });
    expect(screen.getByText('Không tải được dữ liệu')).toBeInTheDocument();
    expect(screen.getByText(/Mã lỗi: PEN_007 \(HTTP 403\)/)).toBeInTheDocument();
  });

  it('lỗi mạng (không phải ApiError) vẫn ra câu đọc được', async () => {
    getPenaltyQueue.mockRejectedValue(new Error('Mạng chập chờn.'));

    renderPage();

    await screen.findByText('Mạng chập chờn.', undefined, { timeout: 3000 });
    expect(screen.getByText('Không tải được dữ liệu')).toBeInTheDocument();
    // Không phải ApiError thì KHÔNG có mã để hiện — hiện ra là in "undefined".
    expect(screen.queryByText(/Mã lỗi:/)).not.toBeInTheDocument();
  });
});

describe('DriverPenaltiesPage — huỷ phạt lỗi', () => {
  it('hiện toast "Huỷ phạt thất bại" kèm câu của backend', async () => {
    listPenalties.mockResolvedValue({
      data: [activeRow],
      meta: { totalPages: 1, totals: { count: 1, amount: 20000 } },
    });
    reversePenalty.mockRejectedValue(
      buildApiError({
        body: { error: { code: 'PEN_012', message: 'Vụ phạt này đã được huỷ trước đó.' } },
        httpStatus: 409,
        path: 'POST /admin/driver-penalties/p1/reverse',
      }),
    );
    // jsdom chưa cài `window.prompt` (ném "not implemented"). Trả chuỗi rỗng = admin bấm
    // OK mà không gõ lý do — khác hẳn null (bấm Huỷ), vốn sẽ thoát sớm và không gọi API.
    vi.spyOn(window, 'prompt').mockReturnValue('');

    renderPage();

    // userEvent chứ không fireEvent.click: Radix Tabs đổi tab theo `mousedown`, mà
    // `click` đơn lẻ không phát ra sự kiện đó -> tab không đổi và bảng vẫn rỗng.
    await userEvent.click(await screen.findByRole('tab', { name: 'Lịch sử phạt' }));
    await userEvent.click(await screen.findByRole('button', { name: /huỷ phạt/i }));

    await waitFor(() => expect(reversePenalty).toHaveBeenCalledWith('p1', undefined));
    await screen.findByText('Vụ phạt này đã được huỷ trước đó.', undefined, { timeout: 3000 });
    expect(screen.getByText('Huỷ phạt thất bại')).toBeInTheDocument();
    expect(screen.getByText(/Mã lỗi: PEN_012 \(HTTP 409\)/)).toBeInTheDocument();
  });

  it('bấm Huỷ ở hộp thoại lý do thì KHÔNG gọi API', async () => {
    listPenalties.mockResolvedValue({
      data: [activeRow],
      meta: { totalPages: 1, totals: { count: 1, amount: 20000 } },
    });
    // prompt trả null = bấm Huỷ. Đây là ranh giới dễ hỏng nhất của `window.prompt`:
    // gộp null với '' là mỗi lần admin đổi ý lại lỡ tay huỷ một vụ phạt thật.
    vi.spyOn(window, 'prompt').mockReturnValue(null);

    renderPage();

    // userEvent chứ không fireEvent.click: Radix Tabs đổi tab theo `mousedown`, mà
    // `click` đơn lẻ không phát ra sự kiện đó -> tab không đổi và bảng vẫn rỗng.
    await userEvent.click(await screen.findByRole('tab', { name: 'Lịch sử phạt' }));
    await userEvent.click(await screen.findByRole('button', { name: /huỷ phạt/i }));

    await waitFor(() => expect(window.prompt).toHaveBeenCalled());
    expect(reversePenalty).not.toHaveBeenCalled();
  });
});
