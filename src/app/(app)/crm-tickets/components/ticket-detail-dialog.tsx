'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { useAuth } from '@/lib/auth-context';
import {
  addCrmTicketNote,
  approveCrmCompensation,
  changeCrmTicketStatus,
  getCrmCompensationLimits,
  getCrmTicket,
  proposeCrmCompensation,
  type CrmTicket,
  type CrmTicketEvent,
  type CrmTicketStatus,
  getAdminUserDetail,
  type AdminUserDetail,
} from '@/lib/api';
import { formatVnDateTime } from '../../leakage-review/leakage-labels';
import { parseVndInput } from '../parse-amount';
import {
  TICKET_ALLOWED_TRANSITIONS,
  TICKET_EVENT_LABEL,
  TICKET_STATUS_LABEL,
} from '../ticket-labels';

/**
 * Chi tiết ticket + timeline xử lý + đền bù.
 *
 * 🚨 Nút đền bù tách làm HAI theo đúng ranh giới quyền của backend (§6.4/§14.2):
 *  - "Đề xuất mức" — ai có `crm-tickets` cũng làm được, KHÔNG đụng ví;
 *  - "DUYỆT & cấp tiền" — chỉ hiện khi `can('crm-compensate')`.
 * Ẩn nút chỉ là tiện nghi; BACKEND mới là chốt chặn (trần/vụ, trần/ngày, ticket đã đóng).
 */
export function TicketDetailDialog({
  ticketId,
  onClose,
  onChanged,
}: {
  ticketId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const canCompensate = can('crm-compensate');

  const [ticket, setTicket] = React.useState<CrmTicket | null>(null);
  const [events, setEvents] = React.useState<CrmTicketEvent[]>([]);
  const [limits, setLimits] = React.useState<{ maxPerCase: number; maxPerDay: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  /** Người NHẬN tiền — phải hiện ra trước khi ai đó bấm duyệt (xem chú thích dưới). */
  const [customer, setCustomer] = React.useState<AdminUserDetail | null>(null);

  // Số tiền ĐÃ HIỂU, hiện lại cho người dùng đối chiếu. `Number('500.000')` = 500 nên
  // không bao giờ dùng thẳng giá trị thô của ô nhập.
  const parsedAmount = parseVndInput(amount);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getCrmTicket(ticketId);
        if (cancelled) return;
        setTicket(res.ticket);
        setEvents(res.events);
      } catch (e) {
        if (!cancelled) toastApiError(e, 'Không tải được ticket');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId, reloadKey]);

  /**
   * Nạp thông tin KHÁCH NHẬN TIỀN.
   *
   * 🚨 Không có bước này thì người bấm "DUYỆT & cấp tiền" không nhìn thấy tiền đi cho ai.
   * Ghép với form tạo ticket (gõ tay `customerUserId`), một UUID dán nhầm sẽ đi trọn
   * đường: ticket trông bình thường, người duyệt đọc mô tả thấy hợp lý, bấm duyệt — và
   * tiền vào ví một khách không liên quan. UUID không tồn tại thì FK chặn, nhưng UUID của
   * một khách THẬT khác thì không có gì chặn.
   */
  React.useEffect(() => {
    if (!ticket?.customerUserId) return;
    let cancelled = false;
    getAdminUserDetail(ticket.customerUserId)
      .then((u) => !cancelled && setCustomer(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ticket?.customerUserId]);

  // Trần chỉ để HIỆN cho người duyệt biết trước — không dùng để tự chặn ở FE.
  React.useEffect(() => {
    if (!canCompensate) return;
    let cancelled = false;
    getCrmCompensationLimits()
      .then((l) => !cancelled && setLimits(l))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canCompensate]);

  const run = async (fn: () => Promise<unknown>, errTitle: string) => {
    setBusy(true);
    try {
      await fn();
      setReloadKey((k) => k + 1);
      onChanged();
    } catch (e) {
      toastApiError(e, errTitle);
    } finally {
      setBusy(false);
    }
  };

  // 🚨 Nút chuyển trạng thái suy từ status của CHÍNH ticket này (mirror bảng của backend),
  // KHÔNG từ bộ lọc đang chọn ngoài danh sách — đúng bẫy §13.2.
  const nextStatuses: CrmTicketStatus[] = ticket
    ? TICKET_ALLOWED_TRANSITIONS[ticket.status] ?? []
    : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {loading ? 'Đang tải…' : `Ticket ${ticket?.code ?? ''}`}
          </DialogTitle>
          <DialogDescription>{ticket?.title}</DialogDescription>
        </DialogHeader>

        {loading || !ticket ? (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        ) : (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{TICKET_STATUS_LABEL[ticket.status]}</Badge>
              <span className="text-xs text-muted-foreground">
                Hạn đóng: {formatVnDateTime(ticket.slaResolveDueAt)}
              </span>
              {Number(ticket.compensationAmount) > 0 ? (
                <Badge>
                  Đã đền {Number(ticket.compensationAmount).toLocaleString('vi-VN')}đ
                </Badge>
              ) : null}
            </div>

            {ticket.description ? (
              <p className="whitespace-pre-wrap text-muted-foreground">{ticket.description}</p>
            ) : null}

            <div className="space-y-2">
              <Label>Chuyển trạng thái</Label>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Ticket đã đóng — không chuyển trạng thái được nữa.
                  </span>
                ) : (
                  nextStatuses.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => changeCrmTicketStatus(ticket.id, s, note.trim() || undefined),
                          'Không đổi được trạng thái',
                        )
                      }
                    >
                      {TICKET_STATUS_LABEL[s]}
                    </Button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tk-note">Ghi chú xử lý</Label>
              <Textarea
                id="tk-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button
                size="sm"
                disabled={busy || !note.trim()}
                onClick={() =>
                  run(async () => {
                    await addCrmTicketNote(ticket.id, note.trim());
                    setNote('');
                  }, 'Không ghi được ghi chú')
                }
              >
                Ghi nhận
              </Button>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label htmlFor="tk-amount">Đền bù</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="tk-amount"
                  className="w-[180px]"
                  inputMode="numeric"
                  placeholder="Số tiền (đ)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !parsedAmount}
                  onClick={() =>
                    run(async () => {
                      await proposeCrmCompensation(ticket.id, parsedAmount!, note.trim() || undefined);
                      setAmount('');
                    }, 'Không đề xuất được')
                  }
                >
                  Đề xuất mức
                </Button>
                {/* Chỉ người có quyền tiền thật mới thấy nút DUYỆT. BE vẫn là chốt cuối. */}
                {canCompensate ? (
                  <Button
                    size="sm"
                    disabled={busy || !parsedAmount}
                    onClick={() => setConfirmApprove(true)}
                  >
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    DUYỆT &amp; cấp tiền
                  </Button>
                ) : null}
              </div>

              {/* Hiện lại con số ĐÃ HIỂU: gõ "500.000" mà không có dòng này thì không ai
                  biết hệ thống đọc ra 500 hay 500.000. */}
              {amount.trim() ? (
                <p className="text-xs" data-testid="crm-parsed-amount">
                  {parsedAmount
                    ? `Sẽ cấp: ${parsedAmount.toLocaleString('vi-VN')}đ`
                    : 'Số tiền không hợp lệ'}
                </p>
              ) : null}

              {/* Người NHẬN tiền — đặt ngay cạnh ô số tiền, không bắt người duyệt đi tìm. */}
              <p className="text-xs text-muted-foreground" data-testid="crm-compensate-recipient">
                Người nhận:{' '}
                {customer
                  ? `${customer.fullName ?? 'Không rõ tên'} · ${customer.phone ?? '—'}`
                  : 'đang tải…'}
              </p>
              {/*
                Bước xác nhận NGAY TRONG dialog, không dùng modal lồng modal.
                Radix đánh dấu mọi thứ NGOÀI Dialog modal là inert, nên một AlertDialog đặt
                cạnh Dialog sẽ hiện ra mà bấm KHÔNG ăn — còn lồng nó vào trong thì jsdom
                crash (repo đã dính đúng họ lỗi này với Dialog+Select). Khối inline cho cùng
                hiệu quả: người duyệt vẫn phải đọc lại số tiền + tên người nhận rồi bấm lần hai.
              */}
              {confirmApprove ? (
                <div
                  data-testid="crm-approve-confirm"
                  className="space-y-2 rounded-md border border-destructive/50 bg-destructive/5 p-3"
                >
                  <p className="text-sm">
                    Cấp <b>{(parsedAmount ?? 0).toLocaleString('vi-VN')}đ</b> vào ví của{' '}
                    <b>{customer?.fullName ?? 'khách này'}</b>
                    {customer?.phone ? ` (${customer.phone})` : ''} cho ticket {ticket.code}.
                    Thao tác này KHÔNG hoàn tác được.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !parsedAmount}
                      onClick={() => {
                        setConfirmApprove(false);
                        void run(async () => {
                          await approveCrmCompensation(
                            ticket.id,
                            parsedAmount!,
                            note.trim() || undefined,
                          );
                          setAmount('');
                        }, 'Không duyệt được đền bù');
                      }}
                    >
                      Cấp tiền
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmApprove(false)}
                    >
                      Huỷ
                    </Button>
                  </div>
                </div>
              ) : null}
              {canCompensate && limits ? (
                <p className="text-xs text-muted-foreground">
                  Trần: {limits.maxPerCase.toLocaleString('vi-VN')}đ/vụ ·{' '}
                  {limits.maxPerDay.toLocaleString('vi-VN')}đ/ngày. Vượt trần sẽ bị chặn.
                </p>
              ) : null}
              {!canCompensate ? (
                <p className="text-xs text-muted-foreground">
                  Bạn chỉ đề xuất được mức; người có quyền duyệt đền bù sẽ quyết định.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Lịch sử xử lý</Label>
              <ol className="space-y-2 border-l-2 border-muted pl-4">
                {events.map((e) => (
                  <li key={e.id} data-testid="crm-ticket-event">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{TICKET_EVENT_LABEL[e.type] ?? e.type}</span>
                      {e.amount ? (
                        <span>{Number(e.amount).toLocaleString('vi-VN')}đ</span>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {formatVnDateTime(e.createdAt)}
                      </span>
                    </div>
                    {e.note ? (
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground">{e.note}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
