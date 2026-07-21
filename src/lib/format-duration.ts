/** Mirror of backend `src/common/format-duration.util.ts` (formatDurationVi) —
 *  keep the two in lockstep, same boundary table covered in format-duration.test.ts. */
export function formatDurationVi(sec: number | null): string {
  if (sec == null) return '—';
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} giây`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} phút ${r} giây` : `${m} phút`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h} giờ ${m} phút` : `${h} giờ`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return h ? `${d} ngày ${h} giờ` : `${d} ngày`;
}
