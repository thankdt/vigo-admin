'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { getCrmOptoutStatus, removeCrmOptout, setCrmOptout } from '@/lib/api';
import { formatVnDateTime } from '../../../leakage-review/leakage-labels';

/**
 * "Ngừng gửi tin chăm sóc" — ĐƯỜNG VÀO DUY NHẤT của danh sách chặn (§6.6 chốt 1).
 *
 * 🚨 Vì sao khối này là điều kiện xuất xưởng của GĐ5, không phải tiện ích: backend đã có
 * bảng `crm_message_optout` và nhánh bỏ qua `OPTED_OUT`, nhưng KHÔNG có màn hình nào ghi
 * vào bảng đó. Bảng rỗng vĩnh viễn ⇒ nhánh đó không bao giờ chạy ⇒ chốt chặn chỉ là trang
 * trí, và khách nhắn "đừng gửi nữa" vẫn tiếp tục nhận tin.
 *
 * Đặt ở hồ sơ khách chứ không ở trang chiến dịch vì đây là việc của người ĐANG nói chuyện
 * với khách: họ mở hồ sơ khách ra để trả lời, và bật ngay tại đó.
 */
export function CustomerOptoutCard({ userId }: { userId: string }) {
  const { toast } = useToast();
  const { can } = useAuth();
  const [status, setStatus] = React.useState<{
    optedOut: boolean;
    reason: string | null;
    since: string | null;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setStatus(await getCrmOptoutStatus(userId));
    } catch (e) {
      setFailed(true);
      toastApiError(e, 'Không đọc được trạng thái nhận tin');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getCrmOptoutStatus(userId);
        if (!cancelled) setStatus(res);
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toastApiError(e, 'Không đọc được trạng thái nhận tin');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /**
   * BỎ chặn cần `crm-campaigns`; BẬT chặn thì chỉ cần `users` (backend gate ANY-OF).
   * Bất đối xứng có chủ đích: tôn trọng yêu cầu của khách phải dễ, cho phép gửi lại phải khó.
   */
  const canUnblock = can('crm-campaigns');

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: done });
      setReason('');
      await load();
    } catch (e) {
      toastApiError(e, 'Không đổi được trạng thái nhận tin');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="crm-optout-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tin chăm sóc (marketing)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : failed ? (
          <p className="text-destructive">Không đọc được trạng thái nhận tin.</p>
        ) : status?.optedOut ? (
          <>
            <p className="text-destructive" data-testid="crm-optout-on">
              Khách đã yêu cầu NGỪNG nhận tin chăm sóc
              {status.since ? ` từ ${formatVnDateTime(status.since)}` : ''}.
            </p>
            {status.reason ? (
              <p className="text-xs text-muted-foreground">Lý do: {status.reason}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Chiến dịch sẽ tự bỏ qua khách này. Thông báo về chuyến đi KHÔNG bị ảnh hưởng.
            </p>
            {canUnblock ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => act(() => removeCrmOptout(userId), 'Đã cho phép gửi lại')}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Cho phép gửi lại
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Cần quyền "Chiến dịch chăm sóc" để mở lại việc gửi tin cho khách này.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-muted-foreground" data-testid="crm-optout-off">
              Khách đang nhận tin chăm sóc bình thường.
            </p>
            <Input
              placeholder="Lý do (khách nhắn gì, ở đâu) — không bắt buộc"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
            />
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() =>
                act(
                  () => setCrmOptout(userId, reason.trim() || undefined),
                  'Đã ghi nhận: ngừng gửi tin chăm sóc',
                )
              }
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Ngừng gửi tin chăm sóc
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
