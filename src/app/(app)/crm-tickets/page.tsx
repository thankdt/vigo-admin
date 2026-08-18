'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toastApiError } from '@/hooks/use-api-error-toast';
import { useToast } from '@/hooks/use-toast';
import {
  createCrmTicket,
  getCrmTicketCategories,
  getCrmTickets,
  type CrmTicket,
  type CrmTicketCategoryDef,
} from '@/lib/api';
import { formatVnDateTime } from '../leakage-review/leakage-labels';
import {
  TICKET_STATUS_LABEL,
  slaStateOf,
  type SlaState,
} from './ticket-labels';
import { TicketDetailDialog } from './components/ticket-detail-dialog';

const TONE_CLASS: Record<SlaState['tone'], string> = {
  danger: 'bg-red-100 text-red-800 hover:bg-red-100',
  warn: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  ok: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  done: 'bg-muted text-muted-foreground hover:bg-muted',
};

/**
 * Ticket khiếu nại khách (CRM GĐ3).
 *
 * Nguồn khiếu nại là NHÓM ZALO — không có webhook cho group chat, nên đường vào DUY NHẤT là
 * NHẬP TAY. Vì vậy nút "Tạo ticket" là chức năng chính của màn này, không phải phụ trợ.
 *
 * Sắp theo SLA gần hết hạn TRƯỚC (backend làm) — đó là thứ tự việc cần làm, không phải thứ
 * tự tạo.
 */
export default function CrmTicketsPage() {
  const { toast } = useToast();

  const [rows, setRows] = React.useState<CrmTicket[]>([]);
  const [categories, setCategories] = React.useState<CrmTicketCategoryDef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [status, setStatus] = React.useState<string>('');
  const [category, setCategory] = React.useState<string>('');
  const [overdue, setOverdue] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  // Mốc "bây giờ" chốt MỘT lần mỗi lần nạp: nếu tính lại theo Date.now() ở mỗi lần render
  // thì hai dòng cạnh nhau có thể lệch nhau vài giây và bảng nhấp nháy.
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const [list, cats] = await Promise.all([
          getCrmTickets({
            limit: 50,
            ...(status && { status }),
            ...(category && { category }),
            ...(overdue && { overdue: true }),
          }),
          getCrmTicketCategories(),
        ]);
        if (cancelled) return;
        setRows(list.data);
        setCategories(cats);
        setNow(Date.now());
      } catch (e) {
        if (cancelled) return;
        setFailed(true);
        toastApiError(e, 'Không tải được danh sách ticket');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, category, overdue, reloadKey]);

  const labelOf = (code: string) => categories.find((c) => c.code === code)?.label ?? code;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ticket khách hàng</h1>
          <p className="text-sm text-muted-foreground">
            Khiếu nại của khách. Nguồn chính là nhóm Zalo nên ticket được nhập tay.
          </p>
        </div>
        <CreateTicketDialog
          categories={categories}
          onCreated={() => {
            toast({ title: 'Đã tạo ticket' });
            setReloadKey((k) => k + 1);
          }}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bộ lọc</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={status || 'ALL'} onValueChange={(v) => setStatus(v === 'ALL' ? '' : v)}>
            <SelectTrigger className="h-9 w-[180px]" aria-label="Lọc trạng thái">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Mọi trạng thái</SelectItem>
              {Object.entries(TICKET_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={category || 'ALL'}
            onValueChange={(v) => setCategory(v === 'ALL' ? '' : v)}
          >
            <SelectTrigger className="h-9 w-[220px]" aria-label="Lọc loại">
              <SelectValue placeholder="Loại khiếu nại" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Mọi loại</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Switch id="crm-ticket-overdue" checked={overdue} onCheckedChange={setOverdue} />
            <Label htmlFor="crm-ticket-overdue" className="cursor-pointer text-sm font-normal">
              Chỉ quá hạn
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : failed ? (
            <p className="text-sm text-destructive">Không tải được danh sách ticket.</p>
          ) : rows.length === 0 ? (
            // Rỗng ≠ lỗi: hai chữ khác nhau, nếu không admin không biết nên chờ hay nên báo.
            <p className="text-sm text-muted-foreground">Chưa có ticket nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã</TableHead>
                  <TableHead>Tiêu đề</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Đền bù</TableHead>
                  <TableHead>Tạo lúc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  // 🚨 SLA suy từ CHÍNH DÒNG (§13.2), không từ bộ lọc đang chọn.
                  const sla = slaStateOf(t, now);
                  return (
                    <TableRow
                      key={t.id}
                      data-testid="crm-ticket-row"
                      className="cursor-pointer"
                      onClick={() => setOpenId(t.id)}
                    >
                      <TableCell className="font-mono text-xs">{t.code}</TableCell>
                      <TableCell className="max-w-[280px] truncate">{t.title}</TableCell>
                      <TableCell className="text-sm">{labelOf(t.category)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{TICKET_STATUS_LABEL[t.status]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={TONE_CLASS[sla.tone]}>{sla.text}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {Number(t.compensationAmount) > 0
                          ? `${Number(t.compensationAmount).toLocaleString('vi-VN')}đ`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs">{formatVnDateTime(t.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {openId ? (
        <TicketDetailDialog
          ticketId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
    </div>
  );
}

/** Nhập tay — đường vào DUY NHẤT của ticket (nguồn là nhóm Zalo, không có webhook). */
function CreateTicketDialog({
  categories,
  onCreated,
}: {
  categories: CrmTicketCategoryDef[];
  onCreated: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [customerUserId, setCustomerUserId] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');

  const submit = async () => {
    if (!customerUserId.trim() || !category || !title.trim()) return;
    setBusy(true);
    try {
      await createCrmTicket({
        customerUserId: customerUserId.trim(),
        category,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setOpen(false);
      setCustomerUserId('');
      setCategory('');
      setTitle('');
      setDescription('');
      onCreated();
    } catch (e) {
      toastApiError(e, 'Không tạo được ticket');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Tạo ticket</Button>;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tạo ticket (nhập tay từ nhóm Zalo)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tk-customer">ID khách</Label>
            <Input
              id="tk-customer"
              value={customerUserId}
              onChange={(e) => setCustomerUserId(e.target.value)}
              placeholder="user id của khách"
            />
          </div>
          <div className="space-y-1">
            <Label>Loại khiếu nại</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9" aria-label="Chọn loại khiếu nại">
                <SelectValue placeholder="Chọn loại…" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label} · phản hồi {c.respondHours}h / đóng {c.resolveHours}h
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-title">Tiêu đề</Label>
          <Input id="tk-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tk-desc">Mô tả</Label>
          <Textarea
            id="tk-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Lưu ticket
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Huỷ
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
