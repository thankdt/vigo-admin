import { describe, it, expect } from 'vitest';
import { agentCommissionDisplay } from './agent-commission-display';

describe('agentCommissionDisplay — hiển thị hoa hồng đơn đặt hộ (kể cả 0₫ + lý do)', () => {
  it('đơn hoàn thành có hoa hồng → số thật (earned)', () => {
    const c = agentCommissionDisplay({ status: 'COMPLETED', agentCommissionAmount: 21500, agentCommissionEstimate: null });
    expect(c).toMatchObject({ tone: 'earned', amount: 21500, label: 'Hoa hồng' });
    expect(c.reason).toBeUndefined();
  });

  it('đơn đang chạy có dự kiến > 0 → estimate', () => {
    const c = agentCommissionDisplay({ status: 'ACCEPTED', agentCommissionAmount: null, agentCommissionEstimate: 22000 });
    expect(c).toMatchObject({ tone: 'estimate', amount: 22000, label: 'Hoa hồng dự kiến' });
  });

  it('đơn đang chạy nhưng dự kiến = 0 (tự đặt / dưới mức) → zero + lý do', () => {
    const c = agentCommissionDisplay({ status: 'SEARCHING', agentCommissionAmount: null, agentCommissionEstimate: null });
    expect(c.tone).toBe('zero');
    expect(c.amount).toBe(0);
    expect(c.label).toBe('Hoa hồng dự kiến');
    expect(c.reason).toContain('chính bạn');
  });

  it('đơn đã huỷ → zero với lý do "đơn đã huỷ"', () => {
    const c = agentCommissionDisplay({ status: 'CANCELLED', agentCommissionAmount: null, agentCommissionEstimate: null });
    expect(c).toMatchObject({ tone: 'zero', amount: 0, label: 'Hoa hồng', reason: 'đơn đã huỷ' });
  });

  it('giao thất bại → zero với lý do "giao không thành công"', () => {
    const c = agentCommissionDisplay({ status: 'DELIVERY_FAILED', agentCommissionAmount: null, agentCommissionEstimate: null });
    expect(c).toMatchObject({ tone: 'zero', reason: 'giao không thành công' });
  });

  it('đơn hoàn thành nhưng không phát sinh (amount null) → zero + lý do settle', () => {
    const c = agentCommissionDisplay({ status: 'COMPLETED', agentCommissionAmount: null, agentCommissionEstimate: null });
    expect(c.tone).toBe('zero');
    expect(c.label).toBe('Hoa hồng');
    expect(c.reason).toContain('không phát sinh');
  });

  it('amount = 0 (không null) vẫn coi là không phát sinh, không hiện xanh', () => {
    const c = agentCommissionDisplay({ status: 'COMPLETED', agentCommissionAmount: 0, agentCommissionEstimate: null });
    expect(c.tone).toBe('zero');
    expect(c.amount).toBe(0);
  });

  it('ưu tiên số thật hơn dự kiến khi cả hai cùng có', () => {
    const c = agentCommissionDisplay({ status: 'COMPLETED', agentCommissionAmount: 30000, agentCommissionEstimate: 99999 });
    expect(c).toMatchObject({ tone: 'earned', amount: 30000 });
  });
});
