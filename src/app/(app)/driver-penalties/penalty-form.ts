import type {
  PenaltyPreview,
  PenaltyReasonCode,
  PenaltySource,
} from '@/lib/api';

/**
 * Luật bật/tắt nút "Xác nhận phạt" và hình dạng body gửi lên.
 *
 * Tách khỏi component vì hai lý do: (1) đây là luật nghiệp vụ đáng test cạn kiệt —
 * nút này trừ tiền thật; (2) Radix Select không lái được ổn định trong jsdom (treo
 * ở pointer-capture), nên nếu nhốt luật trong component thì phần quan trọng nhất
 * lại là phần KHÔNG test được.
 */

export type PenaltyFormState = {
  bookingId: string | null;
  preview: PenaltyPreview | null;
  reasonCode: PenaltyReasonCode | '';
  note: string;
  loading: boolean;
  submitting: boolean;
};

/** Lý do "Khác" thì ghi chú là bắt buộc — backend cũng chặn, đây là chặn sớm cho đỡ hụt. */
export function isNoteRequired(reasonCode: PenaltyReasonCode | ''): boolean {
  return reasonCode === 'OTHER';
}

export function canSubmitPenalty(s: PenaltyFormState): boolean {
  if (!s.bookingId || !s.preview) return false;
  if (s.preview.blockedReason) return false;
  if (s.loading || s.submitting) return false;
  if (!s.reasonCode) return false;
  if (isNoteRequired(s.reasonCode) && !s.note.trim()) return false;
  return true;
}

export function buildPenaltyBody(
  bookingId: string,
  reasonCode: PenaltyReasonCode,
  note: string,
  source: PenaltySource,
): { bookingId: string; reasonCode: PenaltyReasonCode; source: PenaltySource; note?: string } {
  const trimmed = note.trim();
  // Không gửi ghi chú rỗng: backend lưu null, gửi "" chỉ tạo thêm một dạng dữ liệu nữa.
  return { bookingId, reasonCode, source, ...(trimmed && { note: trimmed }) };
}
