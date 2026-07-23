import type { AgentBooking } from '@/lib/api';

/**
 * Quyết định hiển thị hoa hồng của MỘT đơn đặt hộ trên cổng đại lý — thuần, không side-effect, để
 * cả trang "Đơn của tôi" và mục "Hoa hồng theo chuyến" (trang Ví) dùng chung + test được.
 *
 * Nguồn số liệu (từ backend `/agent/bookings`, xem booking.service.ts `listForAgent`):
 *  - `agentCommissionAmount` > 0 : số THẬT đã cộng (đơn hoàn thành có hoa hồng) → tone 'earned'.
 *  - `agentCommissionEstimate` > 0: "dự kiến" cho đơn còn đang chạy (khách thật, ≥ mức tối thiểu) → 'estimate'.
 *  - còn lại = 0 : đơn không phát sinh hoa hồng → tone 'zero' + lý do ngắn suy từ trạng thái.
 *
 * Vì FE KHÔNG phân biệt được self-deal vs dưới-mức-tối-thiểu (backend trả 0 cho cả hai — xem
 * agent-commission.service.ts `estimateFor`), lý do cho đơn đang chạy gộp cả hai khả năng, không bịa số.
 */
export type CommissionTone = 'earned' | 'estimate' | 'zero';

export type AgentCommissionDisplay = {
  tone: CommissionTone;
  amount: number; // số tiền để hiển thị (0 khi không phát sinh)
  label: string; // "Hoa hồng" | "Hoa hồng dự kiến"
  reason?: string; // chỉ có ở tone 'zero' — vì sao = 0
};

// Trạng thái kết thúc mà không thể phát sinh hoa hồng.
const CANCELLED = 'CANCELLED';
const DELIVERY_FAILED = 'DELIVERY_FAILED';
const COMPLETED = 'COMPLETED';

export function agentCommissionDisplay(
  b: Pick<AgentBooking, 'status' | 'agentCommissionAmount' | 'agentCommissionEstimate'>,
): AgentCommissionDisplay {
  // 1) Đã chốt số thật (đơn hoàn thành, có hoa hồng > 0).
  if (b.agentCommissionAmount != null && b.agentCommissionAmount > 0) {
    return { tone: 'earned', amount: b.agentCommissionAmount, label: 'Hoa hồng' };
  }
  // 2) Đang chạy, có dự kiến > 0.
  if ((b.agentCommissionEstimate ?? 0) > 0) {
    return { tone: 'estimate', amount: b.agentCommissionEstimate as number, label: 'Hoa hồng dự kiến' };
  }
  // 3) Không phát sinh hoa hồng (0) — hiện rõ 0₫ kèm lý do theo trạng thái.
  const status = (b.status ?? '').toUpperCase();
  if (status === CANCELLED) {
    return { tone: 'zero', amount: 0, label: 'Hoa hồng', reason: 'đơn đã huỷ' };
  }
  if (status === DELIVERY_FAILED) {
    return { tone: 'zero', amount: 0, label: 'Hoa hồng', reason: 'giao không thành công' };
  }
  if (status === COMPLETED) {
    // Hoàn thành nhưng không cộng: đặt cho chính mình / dưới mức tối thiểu / hết hạn mức tháng.
    return { tone: 'zero', amount: 0, label: 'Hoa hồng', reason: 'không phát sinh (đặt cho chính bạn, dưới mức tối thiểu hoặc hết hạn mức tháng)' };
  }
  // Đang chạy mà dự kiến = 0: chỉ có thể do đặt cho chính mình hoặc cước dưới mức tối thiểu.
  return { tone: 'zero', amount: 0, label: 'Hoa hồng dự kiến', reason: 'đặt cho chính bạn hoặc dưới mức tối thiểu' };
}
