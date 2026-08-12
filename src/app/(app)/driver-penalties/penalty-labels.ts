import type {
  PenaltyReasonCode,
  PenaltySource,
  PenaltyStatus,
} from '@/lib/api';

export const REASON_LABEL: Record<PenaltyReasonCode, string> = {
  OFF_PLATFORM: 'Chở khách ngoài app',
  NO_SHOW: 'Bùng khách, không đến đón',
  FORCED_CANCEL: 'Ép khách huỷ chuyến',
  FAKE_TRIP: 'Chuyến khống / gian lận',
  OTHER: 'Khác',
};

/** Thứ tự hiện trong dropdown — "Khác" luôn cuối. */
export const REASON_ORDER: PenaltyReasonCode[] = [
  'OFF_PLATFORM',
  'NO_SHOW',
  'FORCED_CANCEL',
  'FAKE_TRIP',
  'OTHER',
];

export const SOURCE_LABEL: Record<PenaltySource, string> = {
  PENALTY_PAGE: 'Trang phạt',
  CANCEL_REVIEW: 'Soát tỉ lệ huỷ',
  LEAKAGE_REVIEW: 'Soát rò rỉ',
};

/** Ai huỷ chuyến — giá trị từ `booking.cancelledByRole`. */
export const CANCELLED_BY_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  CUSTOMER: 'Khách',
  DRIVER: 'Tài xế',
  SYSTEM: 'Hệ thống',
};

export function cancelledByLabel(role: string | null): string {
  if (!role) return 'Không rõ';
  return CANCELLED_BY_LABEL[role] ?? role;
}

/** `hover:` bắt buộc — Badge cva ship sẵn hover:bg-primary, tailwind-merge không strip. */
export function penaltyStatusBadge(status: PenaltyStatus | null): {
  label: string;
  className: string;
} {
  if (status === 'ACTIVE') {
    return {
      label: 'Đã phạt',
      className:
        'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/50 dark:text-red-400 dark:hover:bg-red-900/50',
    };
  }
  if (status === 'REVERSED') {
    return {
      label: 'Đã huỷ phạt',
      className:
        'bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800/60',
    };
  }
  return {
    label: 'Chưa phạt',
    className:
      'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-900/50',
  };
}

/**
 * Dấu hiệu nghi vấn — viết cho NGƯỜI SOÁT đọc, không phải cho kỹ thuật.
 *
 * Trước đây badge hiện "Nghi rò rỉ LOW" / "Cảnh báo huỷ A (thử)": admin không thể
 * biết LOW nghĩa là gì, rule A khác B ra sao, hay "(thử)" là đã khoá hay chưa. Mà đây
 * là thông tin người ta dựa vào để quyết định TRỪ TIỀN của tài xế.
 *
 * Mỗi dấu hiệu nay gồm: nhãn nói THẲNG hệ thống thấy gì, và tooltip giải thích cơ sở.
 */
export type PenaltySignal = {
  label: string;
  /** Hiện khi rê chuột — giải thích vì sao hệ thống gắn cờ. */
  hint: string;
  className: string;
  /** Dòng phụ nhỏ dưới badge (vd hệ thống đã khoá hay mới chỉ ghi nhận). */
  note?: string;
};

const RED =
  'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/50 dark:text-red-400 dark:hover:bg-red-900/50';
const AMBER =
  'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-900/50';
const SLATE =
  'bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800/60';

/**
 * Cờ rò rỉ: hệ thống bám GPS tài xế SAU khi khách huỷ, xem họ có tự chở khách đó
 * ngoài ứng dụng không. Mức độ nằm ở chính kết luận, nên không hiện HIGH/LOW nữa.
 */
export function leakageSignal(verdict: string | null): PenaltySignal | null {
  switch (verdict) {
    case 'PICKUP_DROPOFF_UNEXPLAINED':
      return {
        label: 'Nghi chở khách ngoài app',
        hint:
          'Sau khi khách huỷ, GPS cho thấy tài xế vẫn đi từ điểm đón tới điểm trả của chính chuyến đó, ' +
          'trong lúc không nhận chuyến nào trên app. Đây là dấu hiệu mạnh nhất.',
        className: RED,
      };
    case 'PICKUP_ONLY':
      return {
        label: 'Có ghé điểm đón',
        hint:
          'Sau khi khách huỷ, tài xế vẫn ghé gần điểm đón nhưng hệ thống KHÔNG thấy họ tới điểm trả. ' +
          'Dấu hiệu yếu — cần hỏi khách trước khi kết luận.',
        className: AMBER,
      };
    case 'WENT_DARK':
      return {
        label: 'Tắt định vị sau khi huỷ',
        hint:
          'Tài xế mất tín hiệu định vị ngay sau khi khách huỷ nên hệ thống không bám được. ' +
          'Không chứng minh được gì, chỉ là điểm đáng chú ý.',
        className: SLATE,
      };
    default:
      return null;
  }
}

/**
 * Cờ tỉ lệ huỷ: rule A là dấu hiệu câu kéo (khách huỷ ngay sau khi tài nhận), rule
 * B/C là theo tỉ lệ huỷ tích luỹ. `shadow = true` nghĩa là hệ thống mới GHI NHẬN chứ
 * chưa thi hành khoá — phải nói rõ, nếu không admin tưởng tài xế đã bị xử lý rồi.
 */
export function cancelAlertSignal(a: {
  rule: string | null;
  action: string | null;
  ratePct: number | null;
  shadow: boolean | null;
  reason: string | null;
}): PenaltySignal | null {
  if (!a.rule) return null;

  const pct = a.ratePct != null ? ` ${a.ratePct}%` : '';
  const base: Record<string, { label: string; hint: string; className: string }> = {
    A: {
      label: 'Khách huỷ ngay sau khi tài nhận',
      hint:
        'Khách bấm huỷ chỉ ít phút sau khi tài xế nhận chuyến — kiểu huỷ thường gặp khi tài xế ' +
        'gọi khách ra ngoài ứng dụng rồi nhờ huỷ.',
      className: RED,
    },
    B: {
      label: `Tỉ lệ huỷ cao${pct}`,
      hint: 'Tỉ lệ chuyến bị khách huỷ của tài xế này vượt ngưỡng khoá của hệ thống.',
      className: RED,
    },
    C: {
      label: `Tỉ lệ huỷ đáng theo dõi${pct}`,
      hint: 'Tỉ lệ huỷ chạm ngưỡng theo dõi — chưa tới mức khoá, nhưng nên để mắt.',
      className: AMBER,
    },
  };

  const b = base[a.rule];
  if (!b) return null;

  const note = a.shadow
    ? 'hệ thống mới ghi nhận, CHƯA khoá'
    : a.action === 'BAN'
      ? 'hệ thống đã khoá tài khoản'
      : a.action === 'SUSPEND'
        ? 'hệ thống đã tạm khoá nhận chuyến'
        : 'hệ thống chỉ theo dõi, chưa khoá';

  // `reason` do chính rule engine sinh ra, kèm số liệu thật (vd "khách huỷ 45 giây
  // sau khi tài nhận") — quý hơn mọi câu tôi tự viết, nên nối vào tooltip.
  return {
    ...b,
    note,
    hint: a.reason ? `${b.hint}\n\nChi tiết: ${a.reason}` : b.hint,
  };
}

export function formatVnd(n: number | null | undefined): string {
  return `${Number(n ?? 0).toLocaleString('vi-VN')}đ`;
}
