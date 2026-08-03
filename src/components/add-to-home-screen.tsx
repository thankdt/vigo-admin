'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share, Plus, X, Download } from 'lucide-react';

/**
 * Gợi ý "Thêm vào màn hình chính" cho admin.
 *
 * Hai nền tảng hoạt động KHÁC HẲN nhau:
 *
 * - **Android / Chrome desktop**: có sự kiện `beforeinstallprompt`. Bắt được nó thì
 *   nút bấm là NÚT CÀI THẬT — bấm là hệ điều hành mở hộp thoại cài.
 * - **iOS (iPhone/iPad)**: Safari KHÔNG hỗ trợ `beforeinstallprompt` và Apple chưa
 *   bao giờ mở API cài đặt. Không cách nào bấm-là-cài. Thứ duy nhất làm được là
 *   HƯỚNG DẪN người dùng bấm nút Chia sẻ → "Thêm vào MH chính". Đừng cố tìm cách
 *   khác — không có.
 *
 * Đã ở chế độ standalone (tức đã thêm rồi) thì không hiện gì.
 */

const DISMISS_KEY = 'vigo-admin-a2hs-dismissed';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // Safari iOS dùng thuộc tính riêng, không theo chuẩn display-mode.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  // iPadOS 13+ khai UA là Macintosh — phân biệt bằng maxTouchPoints.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && (window.navigator.maxTouchPoints ?? 0) > 1)
  );
}

export function AddToHomeScreen() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true); // mặc định ẩn tới khi biết chắc

  useEffect(() => {
    if (isStandalone()) return; // đã thêm rồi
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    setDismissed(false);

    if (isIos()) {
      setShowIosHint(true);
      return;
    }

    const onPrompt = (e: Event) => {
      // Chặn thanh gợi ý mặc định của Chrome để tự quyết lúc nào hiện.
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // Người dùng cài xong (kể cả qua menu trình duyệt) → dọn gợi ý.
    const onInstalled = () => {
      setInstallEvent(null);
      setDismissed(true);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function close() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice; // dù chọn gì cũng không dùng lại được event
    setInstallEvent(null);
    setDismissed(true);
  }

  if (dismissed) return null;
  if (!showIosHint && !installEvent) return null; // Android chưa bắn sự kiện

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border bg-background p-4 shadow-lg sm:inset-x-auto sm:right-4">
      <button
        type="button"
        onClick={close}
        aria-label="Đóng"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/apple-touch-icon.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 pr-4">
          <p className="text-sm font-semibold">Thêm Vigo Admin vào màn hình chính</p>

          {showIosHint ? (
            // iOS: KHÔNG có nút cài. Chỉ hướng dẫn được.
            <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-muted-foreground">
              Bấm
              <Share className="inline h-4 w-4 shrink-0" aria-label="nút Chia sẻ" />
              ở thanh dưới Safari, rồi chọn
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-foreground">
                <Plus className="h-3.5 w-3.5" />
                Thêm vào MH chính
              </span>
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Mở nhanh như một ứng dụng, không còn thanh địa chỉ.
              </p>
              <Button size="sm" className="mt-3" onClick={install}>
                <Download className="mr-2 h-4 w-4" />
                Thêm vào màn hình chính
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
