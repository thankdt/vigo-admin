import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import CrmCampaignsPage from './page';

const userEvent = userEventLib.setup({ pointerEventsCheck: 0 });

const getCrmCampaigns = vi.fn();
const getCrmSegments = vi.fn();
const createCrmCampaign = vi.fn();
const sendCrmCampaign = vi.fn();
const getCrmCampaignStats = vi.fn();
const previewCrmSegment = vi.fn();

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getCrmCampaigns: (...a: any[]) => getCrmCampaigns(...a),
    getCrmSegments: (...a: any[]) => getCrmSegments(...a),
    createCrmCampaign: (...a: any[]) => createCrmCampaign(...a),
    sendCrmCampaign: (...a: any[]) => sendCrmCampaign(...a),
    getCrmCampaignStats: (...a: any[]) => getCrmCampaignStats(...a),
    previewCrmSegment: (...a: any[]) => previewCrmSegment(...a),
  };
});

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

const mkCampaign = (over: any = {}) => ({
  id: 'c1',
  name: 'Kéo khách quay lại',
  segmentId: 's1',
  channel: 'PUSH',
  znsTemplateId: null,
  pushTitle: 'Chào bạn',
  pushBody: 'Nội dung',
  status: 'DRAFT',
  attributionDays: 7,
  scheduledAt: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-08-18T02:00:00Z',
  ...over,
});

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!window.PointerEvent) (window as any).PointerEvent = MouseEvent;
});

beforeEach(() => {
  vi.clearAllMocks();
  document.body.style.pointerEvents = '';
  getCrmCampaigns.mockResolvedValue([mkCampaign()]);
  getCrmSegments.mockResolvedValue([
    { id: 's1', name: 'Khách mới chưa quay lại', description: null, ruleJson: { all: [] }, isBuiltin: true, createdAt: '2026-08-18T02:00:00Z' },
  ]);
  previewCrmSegment.mockResolvedValue({ total: 120, sample: [] });
  createCrmCampaign.mockResolvedValue(mkCampaign());
  sendCrmCampaign.mockResolvedValue({ total: 120, sent: 80, failed: 2, skipped: 38 });
  getCrmCampaignStats.mockResolvedValue({
    campaign: mkCampaign({ status: 'SENT' }),
    breakdown: [
      { deliveryStatus: 'SENT', skipReason: null, n: 80 },
      { deliveryStatus: 'SKIPPED', skipReason: 'OPTED_OUT', n: 10 },
      { deliveryStatus: 'SKIPPED', skipReason: 'RATE_LIMITED', n: 28 },
      { deliveryStatus: 'FAILED', skipReason: null, n: 2 },
    ],
    attributedCustomers: 9,
    attributedRevenue: 2700000,
  });
});

describe('/crm-campaigns — gửi ra ngoài', () => {
  it('hiện chiến dịch kèm trạng thái và kênh', async () => {
    render(<CrmCampaignsPage />);
    const rows = await screen.findAllByTestId('crm-campaign-row');
    expect(rows[0]).toHaveTextContent('Kéo khách quay lại');
    expect(rows[0]).toHaveTextContent('Nháp');
    expect(rows[0]).toHaveTextContent('PUSH');
  });

  /**
   * 🚨 Gửi tin cho khách thật KHÔNG hoàn tác được — một cú click không được đủ để bắn đi.
   */
  it('bấm Gửi mở bước xác nhận, CHƯA gọi API', async () => {
    render(<CrmCampaignsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Gửi' }));
    expect(sendCrmCampaign).not.toHaveBeenCalled();
    expect(await screen.findByTestId('crm-send-confirm')).toHaveTextContent(
      /không hoàn tác được/i,
    );
  });

  it('xác nhận rồi mới gửi thật', async () => {
    render(<CrmCampaignsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Gửi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận gửi' }));
    await waitFor(() => expect(sendCrmCampaign).toHaveBeenCalledWith('c1'));
  });

  it('huỷ ở bước xác nhận thì KHÔNG gửi', async () => {
    render(<CrmCampaignsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Gửi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(sendCrmCampaign).not.toHaveBeenCalled();
  });

  it('chiến dịch ĐÃ GỬI không còn nút Gửi', async () => {
    getCrmCampaigns.mockResolvedValue([mkCampaign({ status: 'SENT' })]);
    render(<CrmCampaignsPage />);
    await screen.findAllByTestId('crm-campaign-row');
    expect(screen.queryByRole('button', { name: 'Gửi' })).toBeNull();
  });
});

describe('/crm-campaigns — kết quả nói rõ ai bị bỏ qua', () => {
  /**
   * 🚨 Nếu màn chỉ hiện "đã gửi 80/120" mà không nói 38 người kia đi đâu, người vận hành sẽ
   * tưởng hệ thống lỗi rồi đi gửi lại tay — đúng thứ hai chốt chặn §6.6 sinh ra để ngăn.
   */
  it('hiện lý do bỏ qua thành CHỮ, không phải mã trần', async () => {
    render(<CrmCampaignsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Kết quả' }));
    const box = await screen.findByTestId('crm-campaign-stats');
    expect(box).toHaveTextContent('Khách đã yêu cầu ngừng nhận');
    expect(box).toHaveTextContent('Đã nhận đủ số tin cho phép trong tuần');
    expect(box).not.toHaveTextContent('OPTED_OUT');
  });

  it('hiện số khách phát sinh chuyến trong cửa sổ quy đổi', async () => {
    render(<CrmCampaignsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Kết quả' }));
    const box = await screen.findByTestId('crm-campaign-stats');
    expect(box).toHaveTextContent('9');
    expect(box).toHaveTextContent('2.700.000đ');
  });
});

describe('/crm-campaigns — tạo chiến dịch', () => {
  it('thiếu tên/tệp/nội dung thì KHÔNG lưu được', async () => {
    render(<CrmCampaignsPage />);
    expect(await screen.findByRole('button', { name: 'Lưu nháp' })).toBeDisabled();
  });

  /** Đếm tệp phải nói rõ số thực nhận sẽ NHỎ HƠN — nếu không người ta hứa nhầm với sếp. */
  it('đếm tệp hiện số khách và cảnh báo số thực nhận nhỏ hơn', async () => {
    render(<CrmCampaignsPage />);
    await userEvent.click(await screen.findByRole('combobox', { name: /Chọn phân khúc/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Khách mới chưa quay lại/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Đếm tệp' }));
    const line = await screen.findByTestId('camp-audience');
    expect(line).toHaveTextContent('120');
    expect(line).toHaveTextContent(/NHỎ HƠN/);
  });

  it('lưu nháp gọi đúng API và KHÔNG gửi gì', async () => {
    render(<CrmCampaignsPage />);
    await userEvent.type(await screen.findByLabelText('Tên chiến dịch'), 'Tệp mới');
    await userEvent.click(screen.getByRole('combobox', { name: /Chọn phân khúc/ }));
    await userEvent.click(await screen.findByRole('option', { name: /Khách mới chưa quay lại/ }));
    await userEvent.type(screen.getByLabelText('Tiêu đề push'), 'Chào');
    await userEvent.type(screen.getByLabelText('Nội dung push'), 'Nội dung');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));

    await waitFor(() =>
      expect(createCrmCampaign).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Tệp mới', segmentId: 's1', channel: 'PUSH' }),
      ),
    );
    expect(sendCrmCampaign).not.toHaveBeenCalled();
  });
});
