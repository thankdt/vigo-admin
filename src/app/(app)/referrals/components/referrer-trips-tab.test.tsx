import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReferrerTripsTab } from './referrer-trips-tab';
import { adminListReferrerTrips } from '@/lib/api';
import { ApiError } from '@/lib/api-error';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, adminListReferrerTrips: vi.fn() };
});

const mocked = vi.mocked(adminListReferrerTrips);

const referrer: any = {
  id: 'u1', phone: '0900000000', fullName: 'Chủ link',
  refereeCount: 3, tripCount: 2, totalReward: 50000, lifetimeTotal: 90000,
};

const row = (over: any = {}) => ({
  key: 'TRIP:b1', source: 'TRIP', orderId: 'b1b2c3d4-0000-4000-8000-000000000001',
  orderKind: 'BOOKING', bookingId: 'b1b2c3d4-0000-4000-8000-000000000001',
  amount: 20000, grossAmount: 20000, clawedBack: false, walletType: 'USER_REFERRAL',
  creditedAt: '2026-08-10T03:00:00.000Z', clawedBackAt: null,
  yearMonthVn: null, base: null, percent: null,
  counterparty: { id: 'u2', fullName: 'Khách A', phone: '0900000001' },
  booking: {
    status: 'COMPLETED', price: 150000, createdAt: '2026-08-10T02:00:00.000Z',
    completedAt: null, scheduledFromTime: null, isTestTrip: false,
    pickupAddress: 'Số 1 Trần Phú', dropoffAddress: 'Nội Bài',
  },
  ...over,
});

const reply = (rows: any[], totals: any = {}) => ({
  data: rows,
  meta: {
    page: 1, limit: 20, total: rows.length, totalPages: 1, hasNext: false, hasPrevious: false,
    totals: { trip: 0, agent: 0, kolOverride: 0, affiliate: 0, agentDriverWallet: 0, ...totals },
  },
});

/**
 * Tab "Chuyến có hoa hồng" — màn ĐỐI SOÁT, nên các khẳng định ở đây đều xoay quanh một câu
 * hỏi: người soát có bị dẫn tới con số sai hay chuyến sai không.
 */
describe('ReferrerTripsTab', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('hiện dòng kèm nguồn tiền, đối tượng và dữ liệu chuyến', async () => {
    mocked.mockResolvedValue(reply([row()], { trip: 20000, affiliate: 20000 }) as any);
    render(<ReferrerTripsTab referrer={referrer} onOpenBooking={vi.fn()} />);

    expect(await screen.findByText('Khách A')).toBeInTheDocument();
    // "Chuyến" xuất hiện cả ở tiêu đề cột lẫn badge nguồn tiền của dòng.
    expect(screen.getAllByText('Chuyến').length).toBeGreaterThan(1);
    expect(screen.getByText(/Số 1 Trần Phú/)).toBeInTheDocument();
    // Giá chuyến phải hiện để soát được, và theo định dạng VND.
    expect(screen.getByText(/150\.000/)).toBeInTheDocument();
  });

  it('bấm dòng có chuyến → mở chi tiết đúng bookingId', async () => {
    const onOpen = vi.fn();
    mocked.mockResolvedValue(reply([row()]) as any);
    render(<ReferrerTripsTab referrer={referrer} onOpenBooking={onOpen} />);

    await userEvent.click(await screen.findByText('Khách A'));
    expect(onOpen).toHaveBeenCalledWith('b1b2c3d4-0000-4000-8000-000000000001');
  });

  it('đơn bao xe không có chuyến để mở → bấm KHÔNG mở gì', async () => {
    const onOpen = vi.fn();
    mocked.mockResolvedValue(
      reply([row({ key: 'AGENT:m1', source: 'AGENT', orderKind: 'MULTI_STOP', bookingId: null, booking: null })]) as any,
    );
    render(<ReferrerTripsTab referrer={referrer} onOpenBooking={onOpen} />);

    await userEvent.click(await screen.findByText('Đơn bao xe'));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('dòng đã thu hồi: hiện số đã net VÀ số gốc, không im lặng bỏ dòng', async () => {
    mocked.mockResolvedValue(
      reply([row({ amount: 0, grossAmount: 20000, clawedBack: true, clawedBackAt: '2026-08-20T03:00:00.000Z' })]) as any,
    );
    render(<ReferrerTripsTab referrer={referrer} onOpenBooking={vi.fn()} />);

    expect(await screen.findByText(/đã thu hồi/)).toBeInTheDocument();
    expect(screen.getByText(/Thu hồi/)).toBeInTheDocument();
  });

  it('hoa hồng đặt hộ vào ví TÀI XẾ được gắn nhãn và tách khỏi tổng affiliate', async () => {
    mocked.mockResolvedValue(
      reply([row({ key: 'AGENT:b1', source: 'AGENT', walletType: 'DRIVER_MAIN' })], {
        agent: 0, agentDriverWallet: 7000, affiliate: 0,
      }) as any,
    );
    render(<ReferrerTripsTab referrer={referrer} onOpenBooking={vi.fn()} />);

    expect(await screen.findByText('Ví tài xế')).toBeInTheDocument();
    expect(screen.getByText(/KHÔNG nằm trong lũy kế affiliate/)).toBeInTheDocument();
  });

  it('khối đối soát in ra ĐẲNG THỨC, không phải một số gộp', async () => {
    mocked.mockResolvedValue(
      reply([row()], { trip: 20000, agent: 15000, kolOverride: 2000, affiliate: 37000 }) as any,
    );
    render(<ReferrerTripsTab referrer={referrer} onOpenBooking={vi.fn()} />);

    expect(await screen.findByText(/Chuyến 20\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Đặt hộ 15\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Thủ lĩnh KOL 2\.000/)).toBeInTheDocument();
    expect(screen.getByText(/37\.000/)).toBeInTheDocument();
  });

  it('nói rõ bảng này nhỏ hơn lũy kế, để không bị đọc nhầm là thiếu tiền', async () => {
    mocked.mockResolvedValue(reply([row()], { trip: 20000, affiliate: 20000 }) as any);
    render(<ReferrerTripsTab referrer={referrer} onOpenBooking={vi.fn()} />);

    expect(await screen.findByText(/chưa gồm thưởng đăng ký/)).toBeInTheDocument();
  });

  it('BE cũ trả 404 → banner inline, KHÔNG phá tab còn lại', async () => {
    mocked.mockRejectedValue(
      new ApiError({
        message: 'Not found', code: 'NOT_FOUND', httpStatus: 404,
        path: '/x', details: null, at: new Date().toISOString(),
      } as any),
    );
    render(<ReferrerTripsTab referrer={referrer} onOpenBooking={vi.fn()} />);

    expect(await screen.findByText(/Máy chủ chưa hỗ trợ danh sách chuyến/)).toBeInTheDocument();
  });

  it('rỗng → nói rõ là chưa có, không phải lỗi', async () => {
    mocked.mockResolvedValue(reply([]) as any);
    render(<ReferrerTripsTab referrer={referrer} onOpenBooking={vi.fn()} />);

    expect(await screen.findByText(/Chưa có chuyến nào phát sinh hoa hồng/)).toBeInTheDocument();
  });

  it('chỉ chọn một đầu ngày → KHÔNG gọi API, nhắc chọn đủ cặp', async () => {
    mocked.mockResolvedValue(reply([row()]) as any);
    const { container } = render(<ReferrerTripsTab referrer={referrer} onOpenBooking={vi.fn()} />);
    await screen.findByText('Khách A');
    mocked.mockClear();

    const [fromInput] = Array.from(container.querySelectorAll('input[type="date"]'));
    await userEvent.type(fromInput as HTMLInputElement, '2026-08-01');

    await waitFor(() => {
      expect(screen.getByText(/Chọn đủ cả ngày bắt đầu và ngày kết thúc/)).toBeInTheDocument();
    });
    expect(mocked).not.toHaveBeenCalled();
  });

  it('đủ cặp ngày → gửi ngày VN nguyên văn cho backend', async () => {
    mocked.mockResolvedValue(reply([row()]) as any);
    const { container } = render(<ReferrerTripsTab referrer={referrer} onOpenBooking={vi.fn()} />);
    await screen.findByText('Khách A');
    mocked.mockClear();

    const [fromInput, toInput] = Array.from(container.querySelectorAll('input[type="date"]'));
    await userEvent.type(fromInput as HTMLInputElement, '2026-08-01');
    await userEvent.type(toInput as HTMLInputElement, '2026-08-31');

    await waitFor(() => {
      expect(mocked).toHaveBeenCalledWith('u1', expect.objectContaining({
        from: '2026-08-01', to: '2026-08-31',
      }));
    });
  });
});
