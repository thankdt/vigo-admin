import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CrmInsightsPage from './page';

const getCrmRetention = vi.fn();
const getCrmCallReasons = vi.fn();
const getCrmCsat = vi.fn();
const getCrmTripFrequency = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getCrmRetention: (...a: any[]) => getCrmRetention(...a),
    getCrmCallReasons: (...a: any[]) => getCrmCallReasons(...a),
    getCrmCsat: (...a: any[]) => getCrmCsat(...a),
    getCrmTripFrequency: (...a: any[]) => getCrmTripFrequency(...a),
  };
});

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

beforeEach(() => {
  vi.clearAllMocks();
  getCrmRetention.mockResolvedValue([
    { cohortMonth: '2026-07', customers: 100, returned: 15, returned3Plus: 3 },
  ]);
  getCrmCallReasons.mockResolvedValue([{ reason: 'Khách đổi ý', outcome: 'CALLED', n: 12 }]);
  getCrmCsat.mockResolvedValue({ rows: [], total: 0, average: null });
  getCrmTripFrequency.mockResolvedValue([
    { bucket: '1', customers: 105 },
    { bucket: '2', customers: 17 },
  ]);
});

describe('/crm-insights', () => {
  /** Câu trả lời trực tiếp cho §14.4: bao nhiêu người quay lại chuyến thứ hai. */
  it('cohort hiện tỉ lệ quay lại tính đúng', async () => {
    render(<CrmInsightsPage />);
    const row = await screen.findByTestId('crm-retention-row');
    expect(row).toHaveTextContent('2026-07');
    expect(row).toHaveTextContent('15%'); // 15/100
  });

  it('phân bố tần suất hiện số khách theo nhóm', async () => {
    render(<CrmInsightsPage />);
    const box = await screen.findByTestId('crm-freq');
    expect(box).toHaveTextContent('105');
    expect(box).toHaveTextContent('17');
  });

  /**
   * 🚨 CSAT rỗng là SỰ THẬT (§14.4: bảng đánh giá gần như không ai dùng), không phải lỗi.
   * Phải nói thẳng + nói việc cần làm; hiện bảng trống thì người đọc kết luận "báo cáo hỏng".
   */
  it('CSAT rỗng nói rõ là do khách không đánh giá, KHÔNG hiện 0 sao', async () => {
    render(<CrmInsightsPage />);
    const empty = await screen.findByTestId('crm-csat-empty');
    expect(empty).toHaveTextContent(/không phải lỗi số liệu/i);
    expect(screen.queryByTestId('crm-csat')).toBeNull();
  });

  it('có đánh giá thì hiện trung bình sao', async () => {
    getCrmCsat.mockResolvedValue({ rows: [{ stars: 5, n: 4 }], total: 4, average: 4.5 });
    render(<CrmInsightsPage />);
    expect(await screen.findByTestId('crm-csat')).toHaveTextContent('4.50');
  });

  /**
   * 🚨 MỘT endpoint hỏng KHÔNG được xoá trắng ba khối còn lại: bốn khối là bốn câu hỏi độc
   * lập. `Promise.all` biến một lỗi cục bộ thành "cả màn hình hỏng" và người dùng mất luôn
   * số liệu đang chạy tốt.
   */
  it('một endpoint hỏng: báo lỗi NHƯNG các khối khác vẫn hiện', async () => {
    getCrmRetention.mockRejectedValueOnce(new Error('toang'));
    render(<CrmInsightsPage />);
    expect(await screen.findByText(/Một phần số liệu không tải được/)).toBeInTheDocument();
    // Khối "khách quay lại" nuôi bằng getCrmTripFrequency — endpoint đó vẫn tốt.
    expect(await screen.findByTestId('crm-freq')).toBeInTheDocument();
  });

  /** Khoảng ngày mặc định phải là NGÀY VN, độc lập múi giờ máy admin (CLAUDE.md). */
  it('khoảng ngày mặc định tính theo giờ VN, độc lập TZ trình duyệt', async () => {
    const old = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      render(<CrmInsightsPage />);
      const to = (await screen.findByLabelText('Đến ngày')) as HTMLInputElement;
      const expected = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
      expect(to.value).toBe(expected);
    } finally {
      process.env.TZ = old;
    }
  });
});

describe('/crm-insights — bảng cohort không được nói dối', () => {
  /**
   * 🚨 Tháng đang chạy dở LUÔN bị cắt cụt: khách đi chuyến đầu ngày 17 thì gần như chắc chắn
   * chưa kịp quay lại vào ngày 18 ⇒ tỉ lệ ~0–3%. Không đánh dấu thì người đọc kết luận "giữ
   * chân sập" và đi ra quyết định (đổ tiền khuyến mại, đổi chiến dịch) trên artefact của lịch.
   */
  it('đánh dấu tháng VN hiện tại là "chưa đủ kỳ quan sát"', async () => {
    const thisMonthVn = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
    getCrmRetention.mockResolvedValue([
      { cohortMonth: '2026-07', customers: 100, returned: 15, returned3Plus: 3 },
      { cohortMonth: thisMonthVn, customers: 40, returned: 1, returned3Plus: 0 },
    ]);
    render(<CrmInsightsPage />);
    const rows = await screen.findAllByTestId('crm-retention-row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('chưa đủ kỳ quan sát');
    // Tháng đã đóng thì KHÔNG được dán nhãn — dán tất là nhãn mất nghĩa.
    expect(rows[0]).not.toHaveTextContent('chưa đủ kỳ quan sát');
  });

  /**
   * Khoảng ngày CHỌN cohort, còn cột "quay lại" đếm TOÀN THỜI GIAN. Card ngay trên có chữ
   * "(toàn thời gian)" còn card này thì không — tương phản đó khiến người đọc tin là trong-kỳ.
   */
  it('nói rõ cột quay lại là toàn thời gian, không phải trong kỳ', async () => {
    render(<CrmInsightsPage />);
    await screen.findAllByTestId('crm-retention-row');
    expect(screen.getByText(/mọi thời điểm/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Quay lại.*toàn thời gian/ })).toBeInTheDocument();
  });
});
