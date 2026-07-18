import type { DriverCancelStat } from '@/lib/types';

/** Màu theo ngưỡng huỷ. `hover:` bắt buộc — Badge cva default ship hover:bg-primary,
 *  tailwind-merge không strip nếu thiếu (mirror verdictBadgeClass ở leakage-labels). */
export function rateBadgeClass(pct: number): string {
  if (pct > 50) return 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/50 dark:text-red-400 dark:hover:bg-red-900/50';
  if (pct >= 30) return 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-900/50';
  return 'bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800/60';
}

export function driverStatus(s: Pick<DriverCancelStat, 'isBanned' | 'suspendedUntil'>): {
  label: string; variant: 'destructive' | 'secondary' | 'default';
} {
  if (s.isBanned) return { label: 'Đã khoá vĩnh viễn', variant: 'destructive' };
  if (s.suspendedUntil && new Date(s.suspendedUntil).getTime() > Date.now())
    return { label: 'Tạm khoá', variant: 'secondary' };
  return { label: 'Hoạt động', variant: 'default' };
}
