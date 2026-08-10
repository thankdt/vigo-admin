import { describe, it, expect, vi } from 'vitest';
import { applyBulk } from './driver-team-bulk';

describe('applyBulk', () => {
  it('trả kèm team THẬT từ backend, không phải giá trị FE tự ghép', async () => {
    const patch = vi.fn().mockResolvedValue({ stage: 'JOINED', ownerAdminName: 'Chị B' });
    const out = await applyBulk(['d1', 'd2'], { stage: 'JOINED' }, patch as any);
    expect(patch).toHaveBeenCalledTimes(2);
    expect(out.ok).toEqual([
      { driverId: 'd1', team: { stage: 'JOINED', ownerAdminName: 'Chị B' } },
      { driverId: 'd2', team: { stage: 'JOINED', ownerAdminName: 'Chị B' } },
    ]);
    expect(out.failed).toEqual([]);
  });

  it('tài "Tiềm năng" (chưa có team) VẪN nằm trong ok — đây là ca dùng nhiều nhất', async () => {
    const patch = vi.fn().mockResolvedValue({ stage: 'CONTACTED' });
    const out = await applyBulk(['d1'], { stage: 'CONTACTED' }, patch as any);
    expect(out.ok).toHaveLength(1);
    expect(out.ok[0].team.stage).toBe('CONTACTED');
  });

  it('một dòng lỗi KHÔNG chặn các dòng còn lại, và nêu ĐÍCH DANH dòng lỗi', async () => {
    const patch = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('403 Forbidden'))
      .mockResolvedValueOnce({});

    const out = await applyBulk(['d1', 'd2', 'd3'], { stage: 'JOINED' }, patch as any);

    expect(out.ok.map((o) => o.driverId)).toEqual(['d1', 'd3']);
    expect(out.failed).toEqual([{ driverId: 'd2', message: '403 Forbidden' }]);
  });

  it('vượt trần 50 thì CẮT và báo phần bị bỏ, không âm thầm chạy hết', async () => {
    const patch = vi.fn().mockResolvedValue({});
    const ids = Array.from({ length: 70 }, (_, i) => `d${i}`);

    const out = await applyBulk(ids, { stage: 'JOINED' }, patch as any, 50);

    expect(patch).toHaveBeenCalledTimes(50);
    expect(out.skipped).toHaveLength(20);
  });

  it('danh sách rỗng → không gọi API lần nào', async () => {
    const patch = vi.fn();
    const out = await applyBulk([], { stage: 'JOINED' }, patch as any);
    expect(patch).not.toHaveBeenCalled();
    expect(out.ok).toEqual([]);
  });

  it('chạy TUẦN TỰ, không song song', async () => {
    const order: string[] = [];
    const patch = vi.fn(async (id: string) => {
      order.push(`start-${id}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end-${id}`);
      return {} as any;
    });

    await applyBulk(['d1', 'd2'], { stage: 'JOINED' }, patch as any);

    expect(order).toEqual(['start-d1', 'end-d1', 'start-d2', 'end-d2']);
  });
});
