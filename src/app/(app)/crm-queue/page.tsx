'use client';

import * as React from 'react';
import { Loader2, PhoneCall, PhoneOff, PhoneIncoming, Eye } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { getBookings, getCustomerCallReasons, recordBookingCustomerCall } from '@/lib/api';
import type { Booking, CustomerCallStatus } from '@/lib/types';
import { formatVnDateTime } from '../leakage-review/leakage-labels';
import { BookingDetail } from '../bookings/components/booking-detail';
import {
  QUEUE_TAB_LABEL,
  QUEUE_TAB_ORDER,
  formatWaited,
  paramsForTab,
  rowIsBeforePhase,
  waitedSince,
  type QueueTab,
} from './queue-tabs';

const PAGE_SIZE = 20;
// 5 cột cố định + cột "Người giữ việc" chỉ có ở tab "Việc của tôi".
const BASE_COLS = 5;

/**
 * Hàng đợi CSKH — mỗi dòng là MỘT VIỆC, không phải một chuyến.
 *
 * Giá trị của màn này nằm ở THAO TÁC NGAY TRÊN DÒNG. Nếu chỉ "bấm dòng mở dialog" thì
 * nó không nhanh hơn cách cũ ở trang Chuyến đi, và cả việc tách màn thành vô nghĩa.
 * `BookingDetail` vẫn mở được qua nút "Chi tiết" khi CSKH cần ngữ cảnh đầy đủ.
 *
 * KHÔNG có tạo chuyến, đổi trạng thái, điều tài — quyền `crm-queue` cố ý không cho
 * làm những việc đó (backend gate any-of với 'bookings' trên đúng 5 route đọc/ghi gọi).
 */
export default function CrmQueuePage() {
  const { me, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = React.useState<QueueTab>('before');
  const [page, setPage] = React.useState(1);
  const [rows, setRows] = React.useState<Booking[]>([]);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [reasons, setReasons] = React.useState<string[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  // Phân biệt "hết việc" với "không tải được" — hai thứ này trông giống hệt nhau
  // trên một bảng rỗng, mà hành động của CSKH thì khác hẳn.
  const [loadFailed, setLoadFailed] = React.useState(false);

  // Đồng hồ cho cột "Đã chờ". Chốt một mốc mỗi lần tải thay vì gọi Date.now() trong
  // lúc render: các dòng phải cùng một mốc, và render không được phụ thuộc thời điểm.
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  // Chống request cũ về sau ghi đè danh sách của bộ lọc hiện tại.
  const reqIdRef = React.useRef(0);

  const load = React.useCallback(async () => {
    // Tab "Việc của tôi" lọc theo id admin đang đăng nhập. Gọi khi chưa có `me` sẽ
    // thành `claimedBy: undefined` -> backend bỏ lọc -> trả TOÀN BỘ chuyến.
    if (!me?.id) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await getBookings({ page, limit: PAGE_SIZE, ...paramsForTab(tab, me.id) });
      if (reqId !== reqIdRef.current) return;
      // Xử lý nốt dòng cuối của trang cuối làm tổng trang co lại. Không kẹp thì `page` treo
      // ở số cũ, request sau trả rỗng -> bảng báo "hết việc" (sai) MÀ khối phân trang bị ẩn
      // vì totalPages===1 -> không còn nút Trước để quay lại. Chỉ thoát được bằng F5.
      if (page > res.totalPages) {
        setPage(Math.max(1, res.totalPages));
        return; // effect chạy lại với page đã kẹp
      }
      setRows(res.data);
      setTotalPages(res.totalPages);
      setTotal(res.total);
      setNowMs(Date.now());
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      // Dọn bảng: giữ lại 20 dòng của tab TRƯỚC dưới header của tab MỚI là hiện dữ liệu
      // sai kèm nhãn cột sai, tệ hơn hẳn bảng rỗng.
      setRows([]);
      setTotal(0);
      setLoadFailed(true);
      toastApiError(err, 'Không tải được hàng đợi');
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [tab, page, me?.id]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Danh mục lý do do ops sửa trong Cài đặt — tải một lần, hỏng thì để rỗng chứ không
  // chặn cả màn: ghi cuộc gọi vẫn được vì `reason` không bắt buộc.
  React.useEffect(() => {
    getCustomerCallReasons()
      .then(setReasons)
      .catch(() => setReasons([]));
  }, []);

  const changeTab = (next: QueueTab) => {
    setTab(next);
    setPage(1);
  };

  const record = async (
    booking: Booking,
    status: CustomerCallStatus,
    extra?: { reason?: string; note?: string },
  ) => {
    setBusyId(booking.id);
    try {
      await recordBookingCustomerCall(booking.id, {
        status,
        ...(extra?.reason ? { reason: extra.reason } : {}),
        ...(extra?.note?.trim() ? { note: extra.note.trim() } : {}),
      });
      toast({ title: status === 'CLAIMED' ? 'Đã nhận việc gọi' : 'Đã ghi kết quả gọi' });
      // Tải lại để dòng vừa xử lý rời khỏi tab — đó là tín hiệu "việc đã xong".
      await load();
    } catch (err) {
      toastApiError(err, 'Không ghi được cuộc gọi');
    } finally {
      setBusyId(null);
    }
  };

  // Chỉ tab "Việc của tôi" mới có người giữ việc: 3 tab kia lọc `uncalled` nên theo đúng
  // định nghĩa bộ lọc, không dòng nào có người giữ — cột đó sẽ luôn là gạch ngang.
  const showOwnerCol = tab === 'mine';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hàng đợi CSKH"
        description="Việc gọi khách, tách khỏi trang Chuyến đi. Mỗi dòng là một việc: nhận gọi, ghi kết quả, xong là dòng rời khỏi tab."
      />

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onValueChange={(v) => changeTab(v as QueueTab)}>
            <TabsList>
              {QUEUE_TAB_ORDER.map((k) => (
                <TabsTrigger key={k} value={k}>
                  {QUEUE_TAB_LABEL[k]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="text-sm text-muted-foreground">
            {loading ? 'Đang tải…' : `${total.toLocaleString('vi-VN')} việc`}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Khách</TableHead>
              <TableHead>Tuyến</TableHead>
              <TableHead>Giờ đón / hoàn thành</TableHead>
              <TableHead>Đã chờ</TableHead>
              {showOwnerCol && <TableHead>Người giữ việc</TableHead>}
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {authLoading || loading ? (
              <TableRow>
                <TableCell colSpan={BASE_COLS + (showOwnerCol ? 1 : 0)} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={BASE_COLS + (showOwnerCol ? 1 : 0)} className="h-24 text-center text-muted-foreground">
                    {loadFailed
                    ? 'Không tải được danh sách — xem thông báo lỗi rồi thử lại.'
                    : 'Không còn việc nào trong tab này.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((b) => {
                // Pha theo DÒNG, không theo tab — tab "Việc của tôi" chứa lẫn cả hai pha.
                const isBefore = rowIsBeforePhase(b);
                const owner = isBefore ? b.callBeforeBy : b.callAfterBy;
                const claimed = (isBefore ? b.callBeforeStatus : b.callAfterStatus) === 'CLAIMED';
                const busy = busyId === b.id;
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <p className="font-medium">{b.customer?.fullName || '—'}</p>
                      <p className="text-xs text-muted-foreground">{b.customer?.phone || '—'}</p>
                    </TableCell>
                    <TableCell className="text-sm">{b.route?.name || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatVnDateTime(isBefore ? b.scheduledTime : b.completedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatWaited(waitedSince(b), nowMs)}
                    </TableCell>
                    {showOwnerCol && (
                      <TableCell className="whitespace-nowrap text-sm">
                        {owner?.fullName ? (
                          <Badge variant="secondary">{owner.fullName}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!claimed && (
                          <Button size="sm" disabled={busy} onClick={() => record(b, 'CLAIMED')}>
                            {busy ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <PhoneIncoming className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Nhận gọi
                          </Button>
                        )}
                        {claimed && (
                          <>
                            <ResultButton
                              label="Đã gọi được"
                              icon={<PhoneCall className="mr-1.5 h-3.5 w-3.5" />}
                              reasons={reasons}
                              disabled={busy}
                              onSubmit={(reason, note) => record(b, 'CALLED', { reason, note })}
                            />
                            <ResultButton
                              label="Không liên lạc được"
                              variant="outline"
                              icon={<PhoneOff className="mr-1.5 h-3.5 w-3.5" />}
                              reasons={reasons}
                              disabled={busy}
                              onSubmit={(reason, note) => record(b, 'UNREACHED', { reason, note })}
                            />
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailId(b.id)}
                          aria-label="Xem chi tiết chuyến"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {(totalPages > 1 || page > 1) && (
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted-foreground">
              Trang {page}/{totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trước
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </Button>
          </div>
        )}
      </Card>

      {detailId && (
        <BookingDetail
          bookingId={detailId}
          onClose={() => setDetailId(null)}
          onCallRecorded={load}
        />
      )}
    </div>
  );
}

/**
 * Nút ghi kết quả gọi + popover chọn lý do và ghi chú. Cả hai KHÔNG bắt buộc — bắt
 * buộc lý do sẽ khiến CSKH chọn bừa cho xong, dữ liệu thống kê thành rác.
 */
function ResultButton({
  label,
  icon,
  reasons,
  disabled,
  variant = 'default',
  onSubmit,
}: {
  label: string;
  icon: React.ReactNode;
  reasons: string[];
  disabled?: boolean;
  variant?: 'default' | 'outline';
  onSubmit: (reason?: string, note?: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<string>('');
  const [note, setNote] = React.useState('');

  const submit = () => {
    onSubmit(reason || undefined, note || undefined);
    setOpen(false);
    setReason('');
    setNote('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={variant} disabled={disabled}>
          {icon}
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Lý do (tuỳ chọn)</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn lý do" />
            </SelectTrigger>
            <SelectContent>
              {reasons.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ghi chú nội bộ (tuỳ chọn)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú…" />
        </div>
        <Button size="sm" className="w-full" onClick={submit}>
          Lưu {label.toLowerCase()}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
