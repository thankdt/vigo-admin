'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2, Store, ChevronLeft, ChevronRight, Search, UserPlus, Pencil, Ban,
  CheckCircle2, Clock, Car,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  adminListAgents, adminPromoteAgent, adminUpdateAgent, adminRevokeAgent, getUsers,
  type AdminAgentRow, type AgentStatus,
} from '@/lib/api';
import type { User } from '@/lib/types';

const STATUS_LABEL: Record<AgentStatus, string> = { PENDING: 'Chờ duyệt', ACTIVE: 'Hoạt động', REVOKED: 'Đã thu hồi' };

type FormMode = 'promote' | 'edit';
type FormState = {
  userId: string;
  userLabel: string;
  mode: FormMode;
  commissionPercent: string;
  displayName: string;
  note: string;
};

export default function AgentAdminPage() {
  const { toast } = useToast();

  const [rows, setRows] = React.useState<AdminAgentRow[]>([]);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | AgentStatus>('ALL');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  const [form, setForm] = React.useState<FormState | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<AdminAgentRow | null>(null);

  // Add-by-phone flow.
  const [addOpen, setAddOpen] = React.useState(false);
  const [addPhone, setAddPhone] = React.useState('');
  const [addResults, setAddResults] = React.useState<User[]>([]);
  const [addSearching, setAddSearching] = React.useState(false);

  const loadAgents = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await adminListAgents({
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });
      const tp = result.meta.totalPages || 1;
      if (page > tp) { setPage(tp); return; }
      setRows(result.data);
      setTotalPages(tp);
      setTotal(result.meta.total);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được danh sách đại lý', description: parseErr(err.message) });
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, toast]);

  React.useEffect(() => {
    const t = setTimeout(loadAgents, 350);
    return () => clearTimeout(t);
  }, [loadAgents]);

  const loadPending = React.useCallback(async () => {
    try {
      const pending = await adminListAgents({ status: 'PENDING', limit: 1 });
      setPendingCount(pending.meta.total);
    } catch { /* non-fatal (badge only) */ }
  }, []);

  React.useEffect(() => { loadPending(); }, [loadPending]);

  const refreshAll = async () => { await Promise.all([loadAgents(), loadPending()]); };

  const openPromote = (userId: string, userLabel: string, existing?: AdminAgentRow) => {
    setForm({
      userId, userLabel, mode: 'promote',
      commissionPercent: existing?.commissionPercent != null ? String(existing.commissionPercent) : '',
      displayName: existing?.displayName ?? '',
      note: existing?.note ?? '',
    });
  };

  const openEdit = (row: AdminAgentRow) => {
    setForm({
      userId: row.userId,
      userLabel: row.userFullName || row.userPhone || row.userId.slice(0, 8),
      mode: 'edit',
      commissionPercent: row.commissionPercent != null ? String(row.commissionPercent) : '',
      displayName: row.displayName ?? '',
      note: row.note ?? '',
    });
  };

  const submitForm = async () => {
    if (!form) return;
    const pctRaw = form.commissionPercent.trim();
    let commissionPercent: number | null = null;
    if (pctRaw !== '') {
      const n = Number(pctRaw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        toast({ variant: 'destructive', title: 'Hoa hồng không hợp lệ', description: 'Nhập số từ 0 đến 100 (bỏ trống = dùng mức nhóm).' });
        return;
      }
      commissionPercent = n;
    }
    setSubmitting(true);
    try {
      if (form.mode === 'promote') {
        await adminPromoteAgent(form.userId, {
          commissionPercent,
          displayName: form.displayName.trim() || undefined,
          note: form.note.trim() || undefined,
        });
        toast({ title: 'Đã duyệt đại lý', description: `${form.userLabel} giờ là đại lý đặt hộ (đang hoạt động).` });
      } else {
        await adminUpdateAgent(form.userId, {
          commissionPercent,
          displayName: form.displayName.trim() || undefined,
          note: form.note.trim() || undefined,
        });
        toast({ title: 'Đã cập nhật', description: `Đã lưu thay đổi cho ${form.userLabel}.` });
      }
      setForm(null);
      await refreshAll();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Thao tác thất bại', description: parseErr(err.message) });
    } finally {
      setSubmitting(false);
    }
  };

  const doRevoke = async () => {
    if (!revokeTarget) return;
    setSubmitting(true);
    try {
      await adminRevokeAgent(revokeTarget.userId);
      toast({ title: 'Đã thu hồi', description: `${revokeTarget.userFullName || revokeTarget.userPhone} không còn là đại lý.` });
      setRevokeTarget(null);
      await refreshAll();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Thu hồi thất bại', description: parseErr(err.message) });
    } finally {
      setSubmitting(false);
    }
  };

  const searchUsers = async () => {
    const phone = addPhone.trim();
    if (!phone) return;
    setAddSearching(true);
    try {
      // Include DRIVER accounts — an agent may be a USER or a DRIVER.
      const res = await getUsers({ search: phone, limit: 10, includeDrivers: true });
      setAddResults(res.data);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Tìm không được', description: parseErr(err.message) });
    } finally {
      setAddSearching(false);
    }
  };

  const pickUserToPromote = async (u: User) => {
    setAddOpen(false);
    setAddPhone('');
    setAddResults([]);
    const label = (u as any).fullName || u.phone || u.id.slice(0, 8);
    try {
      // If already an agent, prefill so 'Duyệt & kích hoạt' doesn't reset their config.
      const existing = await adminListAgents({ search: u.phone || label, limit: 50 });
      const found = existing.data.find((k) => k.userId === u.id);
      openPromote(u.id, label, found);
      if (found) {
        toast({ title: 'Người này đã là đại lý', description: 'Form đã nạp cấu hình hiện tại — kiểm tra kỹ trước khi lưu.' });
      }
    } catch {
      openPromote(u.id, label);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Store className="h-6 w-6" /> Đại lý đặt hộ
          </h1>
          <p className="text-sm text-muted-foreground">
            Duyệt đơn đăng ký, gán mức hoa hồng, và thu hồi đại lý đặt hộ.
          </p>
        </div>
        <Button onClick={() => { setAddOpen(true); setAddResults([]); setAddPhone(''); }}>
          <UserPlus className="mr-2 h-4 w-4" /> Thêm đại lý
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tên hoặc SĐT..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Trạng thái</Label>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
              <SelectItem value="PENDING">Chờ duyệt{pendingCount > 0 ? ` (${pendingCount})` : ''}</SelectItem>
              <SelectItem value="ACTIVE">Hoạt động</SelectItem>
              <SelectItem value="REVOKED">Đã thu hồi</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {pendingCount > 0 && statusFilter !== 'PENDING' && (
        <button
          type="button"
          onClick={() => { setStatusFilter('PENDING'); setPage(1); }}
          className="flex w-full items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 hover:bg-amber-100"
        >
          <Clock className="h-4 w-4" />
          Có <b>{pendingCount}</b> đơn đăng ký đại lý đang chờ duyệt — bấm để xem.
        </button>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Người dùng</TableHead>
              <TableHead>Loại tài khoản</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Hoa hồng</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Không có đại lý nào khớp bộ lọc.</TableCell></TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{(r.userFullName ?? r.userPhone ?? '?').slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{r.displayName || r.userFullName || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.userPhone ?? '—'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.isDriver
                      ? <Badge variant="default" className="gap-1"><Car className="h-3 w-3" /> Tài xế</Badge>
                      : <Badge variant="secondary">Khách</Badge>}
                  </TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.commissionPercent != null
                      ? `${r.commissionPercent}%`
                      : <span className="text-muted-foreground">nhóm</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {r.status === 'PENDING' && (
                        <>
                          <Button size="sm" className="h-8" onClick={() => openPromote(r.userId, r.userFullName || r.userPhone || r.userId.slice(0, 8), r)}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Duyệt
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => setRevokeTarget(r)}>Từ chối</Button>
                        </>
                      )}
                      {r.status === 'ACTIVE' && (
                        <>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => openEdit(r)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Sửa
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => setRevokeTarget(r)}>
                            <Ban className="mr-1 h-3.5 w-3.5" /> Thu hồi
                          </Button>
                        </>
                      )}
                      {r.status === 'REVOKED' && (
                        <Button size="sm" variant="outline" className="h-8" onClick={() => openPromote(r.userId, r.userFullName || r.userPhone || r.userId.slice(0, 8), r)}>
                          Kích hoạt lại
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-muted-foreground">{total} đại lý</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Trang {page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || isLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages || isLoading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      {/* Promote / edit form */}
      <Dialog open={!!form} onOpenChange={(open) => { if (!open && !submitting) setForm(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.mode === 'edit' ? 'Sửa đại lý' : 'Duyệt / gán đại lý'}</DialogTitle>
            <DialogDescription>{form?.userLabel}</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Hoa hồng riêng (%)</Label>
                <Input
                  type="number" min={0} max={100} step="0.01"
                  placeholder="Bỏ trống = dùng mức nhóm (BOOKING_AGENT_COMMISSION_PERCENT)"
                  value={form.commissionPercent}
                  onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Tính trên cước trước VAT mỗi đơn hoàn thành.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Tên hiển thị (tuỳ chọn)</Label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Mặc định = tên tài khoản" />
              </div>
              <div className="space-y-1.5">
                <Label>Ghi chú (tuỳ chọn)</Label>
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="VD: quầy lễ tân, thoả thuận..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={submitting}>Huỷ</Button>
            <Button onClick={submitForm} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form?.mode === 'edit' ? 'Lưu' : 'Duyệt & kích hoạt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke / reject confirm */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => { if (!open && !submitting) setRevokeTarget(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{revokeTarget?.status === 'PENDING' ? 'Từ chối đơn' : 'Thu hồi đại lý'}</DialogTitle>
            <DialogDescription>
              {revokeTarget?.status === 'PENDING'
                ? `Từ chối đơn đăng ký của ${revokeTarget?.userFullName || revokeTarget?.userPhone}. Họ có thể nộp lại sau.`
                : `${revokeTarget?.userFullName || revokeTarget?.userPhone} sẽ không còn là đại lý (lịch sử hoa hồng giữ nguyên).`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={submitting}>Huỷ</Button>
            <Button variant="destructive" onClick={doRevoke} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {revokeTarget?.status === 'PENDING' ? 'Từ chối' : 'Thu hồi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add agent by phone */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) setAddOpen(false); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm đại lý theo số điện thoại</DialogTitle>
            <DialogDescription>Tìm tài khoản (khách hoặc tài xế) rồi gán làm đại lý (bỏ qua bước đơn đăng ký).</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder="Nhập SĐT hoặc tên..."
              value={addPhone}
              onChange={(e) => setAddPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') searchUsers(); }}
            />
            <Button onClick={searchUsers} disabled={addSearching || !addPhone.trim()}>
              {addSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          <div className="max-h-[45vh] overflow-y-auto divide-y">
            {addResults.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{addSearching ? 'Đang tìm...' : 'Nhập SĐT/tên rồi bấm tìm.'}</p>
            ) : addResults.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pickUserToPromote(u)}
                className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left hover:bg-muted/50"
              >
                <div>
                  <div className="font-medium">{(u as any).fullName || '—'}</div>
                  <div className="text-xs text-muted-foreground">{u.phone}</div>
                </div>
                <span className="text-xs text-primary">Chọn →</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: AgentStatus }) {
  if (status === 'ACTIVE') return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{STATUS_LABEL.ACTIVE}</Badge>;
  if (status === 'PENDING') return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{STATUS_LABEL.PENDING}</Badge>;
  return <Badge variant="destructive">{STATUS_LABEL.REVOKED}</Badge>;
}

// The API client throws Error(JSON.stringify(errorData)); surface the human sentence.
function parseErr(msg: string): string {
  try {
    const o = JSON.parse(msg);
    return o?.error?.message || o?.message || msg;
  } catch {
    return msg;
  }
}
