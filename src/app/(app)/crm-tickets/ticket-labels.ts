import type { CrmTicket, CrmTicketEventType, CrmTicketStatus } from '@/lib/api';

/**
 * Logic THUẦN của màn ticket — không import React, không import component.
 *
 * (Nhưng test hàm thuần KHÔNG thay được test cấp trang: bài học §13.3 — `/crm-queue` ship
 * với 17 ca hàm thuần mà cả 4 finding vẫn lọt vì `page.tsx` không có test nào.)
 */

export const TICKET_STATUS_LABEL: Record<CrmTicketStatus, string> = {
  OPEN: 'Mới',
  IN_PROGRESS: 'Đang xử lý',
  RESOLVED: 'Đã xử lý',
  CLOSED: 'Đã đóng',
  REJECTED: 'Từ chối',
};

/** Trạng thái CÒN VIỆC — khớp `OPEN_STATUSES` của backend. */
export const TICKET_OPEN_STATUSES: CrmTicketStatus[] = ['OPEN', 'IN_PROGRESS'];

export const TICKET_EVENT_LABEL: Record<CrmTicketEventType, string> = {
  CREATED: 'Tạo ticket',
  STATUS_CHANGE: 'Đổi trạng thái',
  ASSIGN: 'Giao việc',
  NOTE: 'Ghi chú',
  COMPENSATION_PROPOSED: 'Đề xuất đền bù',
  COMPENSATION_APPROVED: 'DUYỆT đền bù',
  COMPENSATION_REJECTED: 'Từ chối đền bù',
};

/**
 * Chuyển trạng thái hợp lệ — MIRROR `ALLOWED_TRANSITIONS` của backend.
 *
 * 🚨 FE soi gương quy tắc của BE, KHÔNG tự suy: đây đúng hình dạng bẫy §13.2 đã gây lỗi
 * CHẶN ở GĐ1 (FE suy pha theo TAB trong khi BE suy theo dữ liệu của DÒNG). Lệch bảng này là
 * admin bấm nút rồi ăn 400 mà không hiểu vì sao.
 */
export const TICKET_ALLOWED_TRANSITIONS: Record<CrmTicketStatus, CrmTicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  REJECTED: ['IN_PROGRESS'],
  CLOSED: [],
};

export type SlaState = {
  /** Số mili giây còn lại; ÂM = đã quá hạn. */
  remainingMs: number;
  overdue: boolean;
  /** 'danger' = quá hạn, 'warn' = còn dưới 25% thời lượng, 'ok' = còn nhiều, 'done' = xong. */
  tone: 'danger' | 'warn' | 'ok' | 'done';
  text: string;
};

/**
 * Trạng thái SLA của MỘT ticket, suy từ chính DÒNG đó (§13.2) — không từ tab đang chọn.
 *
 * Đếm ngược là HIỆU hai mốc nên độc lập múi giờ hoàn toàn. Riêng MỐC hiển thị thì phải qua
 * `formatVnDateTime` (chỗ khác), đó mới là chỗ dính múi giờ.
 *
 * Ticket đã kết thúc (RESOLVED/CLOSED/REJECTED) KHÔNG còn đếm ngược: để nó tiếp tục "quá
 * hạn" là biến bảng thành một biển đỏ vô nghĩa và người ta sẽ ngừng nhìn màu.
 */
export function slaStateOf(ticket: Pick<CrmTicket, 'status' | 'slaResolveDueAt' | 'createdAt'>, nowMs: number): SlaState {
  if (!TICKET_OPEN_STATUSES.includes(ticket.status)) {
    return { remainingMs: 0, overdue: false, tone: 'done', text: '—' };
  }

  const due = new Date(ticket.slaResolveDueAt).getTime();
  const created = new Date(ticket.createdAt).getTime();
  if (Number.isNaN(due)) return { remainingMs: 0, overdue: false, tone: 'ok', text: '—' };

  const remainingMs = due - nowMs;
  if (remainingMs < 0) {
    return {
      remainingMs,
      overdue: true,
      tone: 'danger',
      text: `Quá hạn ${humanizeMs(-remainingMs)}`,
    };
  }

  const total = Number.isNaN(created) ? 0 : due - created;
  const tone: SlaState['tone'] = total > 0 && remainingMs < total * 0.25 ? 'warn' : 'ok';
  return { remainingMs, overdue: false, tone, text: `Còn ${humanizeMs(remainingMs)}` };
}

/**
 * SLA PHẢN HỒI — mốc thứ hai, tách hẳn khỏi SLA đóng.
 *
 * 🚨 Vì sao phải có (thêm 2026-08-18): danh mục cấu hình HAI mốc (`respondHours` và
 * `resolveHours`), backend tính và lưu cả `slaRespondDueAt` lẫn `firstRespondedAt`, và ô
 * tạo ticket HỨA THẲNG với người dùng "phản hồi {respondHours}h / đóng {resolveHours}h" —
 * nhưng không màn hình nào hiện mốc phản hồi. Ticket NO_SHOW_DRIVER phải phản hồi trong 1h
 * và đóng trong 8h: suốt 7 giờ 59 phút dòng đó vẫn XANH theo đồng hồ 8h, trong khi hạn
 * phản hồi đã vỡ từ 7 tiếng trước và không ai nhìn thấy. Đó là cái nửa SLA mà khách cảm
 * nhận được ngay.
 *
 * Đã phản hồi thì mốc này ĐÓNG BĂNG (tone 'done') — không đếm ngược tiếp, cùng lý do với
 * ticket đã kết thúc: biển đỏ vô nghĩa thì người ta ngừng nhìn màu.
 */
export function slaRespondStateOf(
  ticket: Pick<CrmTicket, 'status' | 'slaRespondDueAt' | 'firstRespondedAt' | 'createdAt'>,
  nowMs: number,
): SlaState {
  if (ticket.firstRespondedAt) {
    return { remainingMs: 0, overdue: false, tone: 'done', text: 'Đã phản hồi' };
  }
  if (!TICKET_OPEN_STATUSES.includes(ticket.status)) {
    // Đóng mà chưa từng phản hồi: không đếm ngược nữa, nhưng cũng đừng khoe "đã phản hồi".
    return { remainingMs: 0, overdue: false, tone: 'done', text: '—' };
  }

  const due = new Date(ticket.slaRespondDueAt).getTime();
  if (Number.isNaN(due)) return { remainingMs: 0, overdue: false, tone: 'ok', text: '—' };

  const remainingMs = due - nowMs;
  if (remainingMs < 0) {
    return { remainingMs, overdue: true, tone: 'danger', text: `Trễ ${humanizeMs(-remainingMs)}` };
  }
  const created = new Date(ticket.createdAt).getTime();
  const total = Number.isNaN(created) ? 0 : due - created;
  const tone: SlaState['tone'] = total > 0 && remainingMs < total * 0.25 ? 'warn' : 'ok';
  return { remainingMs, overdue: false, tone, text: `Còn ${humanizeMs(remainingMs)}` };
}

/** "2 ngày 3 giờ" / "5 giờ" / "12 phút" — đủ để quyết định, không cần giây. */
export function humanizeMs(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return 'dưới 1 phút';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days} ngày ${hours} giờ` : `${days} ngày`;
  if (hours > 0) return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
  return `${minutes} phút`;
}
