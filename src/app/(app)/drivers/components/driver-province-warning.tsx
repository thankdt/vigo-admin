import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { NO_PROVINCE_WARNING } from './driver-provinces';

/**
 * Cảnh báo tài đã duyệt nhưng 0 tỉnh hoạt động. Chỉ render khi nơi gọi đã xác định
 * `driverLacksProvince` — component không tự suy ra để dùng được cho cả ô bảng lẫn hộp thoại.
 */
export function NoProvinceWarning({ variant = 'chip' }: { variant?: 'chip' | 'alert' }) {
  if (variant === 'alert') {
    return (
      <p
        role="alert"
        className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400"
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {NO_PROVINCE_WARNING}
      </p>
    );
  }
  return (
    <span
      title={NO_PROVINCE_WARNING}
      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400"
    >
      <AlertTriangle className="h-3 w-3" />
      Chưa có tỉnh
    </span>
  );
}
