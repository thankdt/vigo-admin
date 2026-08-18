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

  it('lỗi API hiện chữ lỗi', async () => {
    getCrmRetention.mockRejectedValueOnce(new Error('toang'));
    render(<CrmInsightsPage />);
    expect(await screen.findByText(/Không tải được số liệu/)).toBeInTheDocument();
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
