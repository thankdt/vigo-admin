import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEventLib from '@testing-library/user-event';
import { VcoinAdjustDialog } from './vcoin-adjust-dialog';

// Radix Dialog để lại `pointer-events: none` trên body giữa các test trong jsdom — tắt
// phép kiểm con trỏ của user-event vì đó là rác môi trường test, không phải hành vi thật
// (cùng lý do đã áp dụng ở crm-tickets/page.test.tsx).
const userEvent = userEventLib.setup({ pointerEventsCheck: 0 });

const adminAdjustVcoin = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, adminAdjustVcoin: (...a: any[]) => adminAdjustVcoin(...a) };
});

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText('Số lượng Vcoin'), '100');
  await userEvent.type(screen.getByLabelText('Lý do (bắt buộc)'), 'Bù lỗi hệ thống');
}

describe('VcoinAdjustDialog', () => {
  beforeEach(() => {
    adminAdjustVcoin.mockReset();
    toast.mockReset();
  });

  it('sinh idempotencyKey dạng UUID mới mỗi lần mở dialog (userId đổi)', async () => {
    adminAdjustVcoin.mockResolvedValue({ rewardPoints: 100, duplicate: false });
    const onClose = vi.fn();
    const onAdjusted = vi.fn();
    const { rerender } = render(
      <VcoinAdjustDialog userId="u-1" userName="Khách A" currentRewardPoints={0} onClose={onClose} onAdjusted={onAdjusted} />,
    );
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận cộng' }));
    await waitFor(() => expect(adminAdjustVcoin).toHaveBeenCalledTimes(1));
    const firstKey = adminAdjustVcoin.mock.calls[0][1].idempotencyKey;
    expect(firstKey).toMatch(UUID_RE);

    // Đóng rồi mở lại cho MỘT KHÁCH KHÁC — phải sinh key mới.
    rerender(
      <VcoinAdjustDialog userId={null} userName="" currentRewardPoints={0} onClose={onClose} onAdjusted={onAdjusted} />,
    );
    rerender(
      <VcoinAdjustDialog userId="u-2" userName="Khách B" currentRewardPoints={0} onClose={onClose} onAdjusted={onAdjusted} />,
    );
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận cộng' }));
    await waitFor(() => expect(adminAdjustVcoin).toHaveBeenCalledTimes(2));
    const secondKey = adminAdjustVcoin.mock.calls[1][1].idempotencyKey;
    expect(secondKey).toMatch(UUID_RE);
    expect(secondKey).not.toBe(firstKey);
  });

  it('giữ NGUYÊN idempotencyKey khi bấm lại (retry) trong cùng một lần mở', async () => {
    adminAdjustVcoin.mockRejectedValueOnce(new Error('Lỗi mạng tạm thời'));
    adminAdjustVcoin.mockResolvedValueOnce({ rewardPoints: 100, duplicate: false });
    const onClose = vi.fn();
    render(
      <VcoinAdjustDialog userId="u-1" userName="Khách A" currentRewardPoints={0} onClose={onClose} onAdjusted={vi.fn()} />,
    );
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận cộng' }));
    await waitFor(() => expect(adminAdjustVcoin).toHaveBeenCalledTimes(1));

    // Retry sau khi lần đầu lỗi — dialog vẫn mở (onClose chưa được gọi khi lỗi).
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận cộng' }));
    await waitFor(() => expect(adminAdjustVcoin).toHaveBeenCalledTimes(2));

    const key1 = adminAdjustVcoin.mock.calls[0][1].idempotencyKey;
    const key2 = adminAdjustVcoin.mock.calls[1][1].idempotencyKey;
    expect(key1).toBe(key2);
  });

  it('duplicate=true báo "Thao tác đã được ghi nhận trước đó" và vẫn refetch', async () => {
    adminAdjustVcoin.mockResolvedValue({ rewardPoints: 100, duplicate: true });
    const onAdjusted = vi.fn();
    const onClose = vi.fn();
    render(
      <VcoinAdjustDialog userId="u-1" userName="Khách A" currentRewardPoints={0} onClose={onClose} onAdjusted={onAdjusted} />,
    );
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận cộng' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Thao tác đã được ghi nhận trước đó' })),
    );
    expect(onAdjusted).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('không cho bấm xác nhận khi thiếu lý do hoặc số lượng ngoài khoảng 1..1.000.000', async () => {
    render(
      <VcoinAdjustDialog userId="u-1" userName="Khách A" currentRewardPoints={0} onClose={vi.fn()} onAdjusted={vi.fn()} />,
    );
    const submit = screen.getByRole('button', { name: 'Xác nhận cộng' });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Số lượng Vcoin'), '2000000');
    await userEvent.type(screen.getByLabelText('Lý do (bắt buộc)'), 'Vượt trần');
    expect(submit).toBeDisabled();

    expect(adminAdjustVcoin).not.toHaveBeenCalled();
  });
});
