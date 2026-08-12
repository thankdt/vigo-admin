'use client';

import * as React from 'react';
import { Copy } from 'lucide-react';
import { describeApiError } from '@/lib/api-error';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';

/**
 * Bắn toast lỗi API: câu tiếng Việt + mã lỗi + nút Sao chép chi tiết.
 *
 * Thay cho `toast({ variant: 'destructive', title, description: err.message })`
 * rải khắp 136 chỗ. Điểm khác biệt là khối mã lỗi để admin đọc/gửi cho dev —
 * trước đây admin chỉ có thể chụp màn hình một cục JSON.
 *
 *   toastApiError(err, 'Không cập nhật được tài xế');
 */
export function toastApiError(err: unknown, title: string): void {
  const view = describeApiError(err, title);

  toast({
    variant: 'destructive',
    title: view.title,
    description: view.trace ? (
      <div className="space-y-1">
        <p>{view.message}</p>
        <p className="text-xs opacity-80">
          Mã lỗi: {view.trace.code} (HTTP {view.trace.httpStatus})
        </p>
      </div>
    ) : (
      // Lỗi không phải ApiError: KHÔNG hiện khối mã lỗi, vì code/httpStatus
      // không tồn tại và sẽ in ra "undefined".
      view.message
    ),
    action: view.trace ? (
      <ToastAction
        altText="Sao chép chi tiết lỗi"
        onClick={() => {
          void copyToClipboard(view.trace!.clipboard);
        }}
      >
        <Copy className="mr-1 h-3 w-3" />
        Sao chép
      </ToastAction>
    ) : undefined,
  });
}

/**
 * `ToastAction` của Radix RENDER RA `ToastClose` — bấm nút là toast lỗi đóng
 * ngay, và `TOAST_LIMIT = 1` khiến toast tiếp theo đẩy nốt cái cũ ra. Nên khi
 * sao chép THẤT BẠI, không được bảo admin "chụp màn hình phần mã lỗi": khối đó
 * đã biến mất cùng toast gốc. Phải in lại nguyên nội dung vào toast mới.
 */
function copyFailedToast(clipboard: string): void {
  toast({
    variant: 'destructive',
    title: 'Không sao chép được — hãy chụp màn hình khung dưới',
    description: (
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2 text-[11px] leading-tight select-all">
        {clipboard}
      </pre>
    ),
  });
}

/**
 * `navigator.clipboard` chỉ có trong secure context (https hoặc localhost).
 * Admin chạy trên S3 qua https nên đường chính luôn dùng được; nhánh dự phòng
 * giữ cho môi trường test/HTTP nội bộ không vỡ.
 */
async function copyToClipboard(text: string): Promise<void> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast({ title: 'Đã sao chép chi tiết lỗi' });
  } catch {
    // Không nuốt im lặng: admin đang cần gửi đúng thông tin này cho dev.
    copyFailedToast(text);
  }
}
