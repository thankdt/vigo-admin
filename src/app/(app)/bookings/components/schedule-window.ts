// Hiển thị khung giờ đón của chuyến hẹn giờ.
//
// Chuyến hẹn giờ đời mới có CẢ HAI mốc [scheduledFromTime, scheduledToTime];
// `scheduledTime` chỉ là bản mirror của mốc đầu để client cũ đọc được một mốc.
// Chỗ hiển thị nào chỉ đọc `scheduledTime` là đang giấu mất mốc cuối.
//
// Giờ luôn quy về giờ VN (UTC+7), không phụ thuộc timezone trình duyệt admin.
const VN_OFFSET_MS = 7 * 3600_000;

function partsVn(iso: string | null | undefined): { time: string; date: string; ms: number } | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms + VN_OFFSET_MS);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return {
    ms,
    time: `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`,
    date: `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
  };
}

/**
 * Trả về chuỗi khung giờ đón, hoặc null nếu chuyến không phải chuyến hẹn giờ.
 *
 * - Có khung, cùng ngày VN:  `08:00 → 09:30 — 17/08/2026`
 * - Có khung, khác ngày VN:  `23:30 17/08/2026 → 00:30 18/08/2026`
 * - Chuyến cũ (chỉ 1 mốc):   `08:00 — 17/08/2026`
 */
export function formatScheduleWindow(
  fromIso: string | null | undefined,
  toIso?: string | null,
): string | null {
  const from = partsVn(fromIso);
  if (!from) return null;
  const to = partsVn(toIso);

  // Mốc cuối thiếu / hỏng / không muộn hơn mốc đầu (rows cũ mirror y hệt mốc đầu)
  // → hiển thị như chuyến 1 mốc thay vì vẽ một khoảng rỗng.
  if (!to || to.ms <= from.ms) return `${from.time} — ${from.date}`;

  if (to.date === from.date) return `${from.time} → ${to.time} — ${from.date}`;
  return `${from.time} ${from.date} → ${to.time} ${to.date}`;
}
