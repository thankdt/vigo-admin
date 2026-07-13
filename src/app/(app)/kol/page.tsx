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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Crown,
  ChevronLeft,
  ChevronRight,
  Search,
  UserPlus,
  Pencil,
  Ban,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  adminListKols,
  adminPromoteKol,
  adminUpdateKol,
  adminRevokeKol,
  getUsers,
  type AdminKolRow,
  type KolKind,
  type KolStatus,
} from '@/lib/api';
import type { User } from '@/lib/types';

const KIND_LABEL: Record<KolKind, string> = { STANDARD: 'KOL thường', LEADER: 'Thủ lĩnh' };
const STATUS_LABEL: Record<KolStatus, string> = { PENDING: 'Chờ duyệt', ACTIVE: 'Hoạt động', REVOKED: 'Đã thu hồi' };

type FormMode = 'promote' | 'edit';
type FormState = {
  userId: string;
  userLabel: string;
  mode: FormMode;
  kind: KolKind;
  commissionPercent: string;
  leaderId: string;
  displayName: string;
  note: string;
};

export default function KolPage() {
  const { toast } = useToast();

  const [rows, setRows] = React.useState<AdminKolRow[]>([]);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | KolStatus>('ALL');
  const [kindFilter, setKindFilter] = React.useState<'ALL' | KolKind>('ALL');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  // ACTIVE leaders — for the leaderId select + resolving leader names in the table.
  const [leaders, setLeaders] = React.useState<AdminKolRow[]>([]);
  const leaderName = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const l of leaders) m.set(l.userId, l.displayName || l.userFullName || l.userPhone || l.userId.slice(0, 8));
    return m;
  }, [leaders]);

  const [form, setForm] = React.useState<FormState | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<AdminKolRow | null>(null);

  // Add-by-phone flow.
  const [addOpen, setAddOpen] = React.useState(false);
  const [addPhone, setAddPhone] = React.useState('');
  const [addResults, setAddResults] = React.useState<User[]>([]);
  const [addSearching, setAddSearching] = React.useState(false);

  const loadKols = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await adminListKols({
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        kind: kindFilter === 'ALL' ? undefined : kindFilter,
      });
      const tp = result.meta.totalPages || 1;
      // A mutation may have emptied the current (last) page — clamp so we don't strand on an empty page.
      if (page > tp) { setPage(tp); return; }
      setRows(result.data);
      setTotalPages(tp);
      setTotal(result.meta.total);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được danh sách KOL', description: parseErr(err.message) });
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, kindFilter, toast]);

  React.useEffect(() => {
    const t = setTimeout(loadKols, 350);
    return () => clearTimeout(t);
  }, [loadKols]);

  const loadAux = React.useCallback(async () => {
    try {
      const [pending, ldrs] = await Promise.all([
        adminListKols({ status: 'PENDING', limit: 1 }),
        adminListKols({ kind: 'LEADER', status: 'ACTIVE', limit: 100 }),
      ]);
      setPendingCount(pending.meta.total);
      setLeaders(ldrs.data);
    } catch {
      // non-fatal (badges/leader names only)
    }
  }, []);

  React.useEffect(() => { loadAux(); }, [loadAux]);

  const refreshAll = async () => { await Promise.all([loadKols(), loadAux()]); };

  const openPromote = (userId: string, userLabel: string, existing?: AdminKolRow) => {
    setForm({
      userId,
      userLabel,
      mode: 'promote',
      kind: existing?.kind ?? 'STANDARD',
      commissionPercent: existing?.commissionPercent != null ? String(existing.commissionPercent) : '',
      leaderId: existing?.leaderId ?? '',
      displayName: existing?.displayName ?? '',
      note: existing?.note ?? '',
    });
  };

  const openEdit = (row: AdminKolRow) => {
    setForm({
      userId: row.userId,
      userLabel: row.userFullName || row.userPhone || row.userId.slice(0, 8),
      mode: 'edit',
      kind: row.kind,
      commissionPercent: row.commissionPercent != null ? String(row.commissionPercent) : '',
      leaderId: row.leaderId ?? '',
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
    const leaderId = form.kind === 'STANDARD' && form.leaderId ? form.leaderId : undefined;
    // A LEADER never earns direct commission — never persist a stale % on it.
    const pctToSend = form.kind === 'LEADER' ? null : commissionPercent;
    setSubmitting(true);
    try {
      if (form.mode === 'promote') {
        await adminPromoteKol(form.userId, {
          kind: form.kind,
          commissionPercent: pctToSend,
          ...(leaderId ? { leaderId } : {}),
          displayName: form.displayName.trim() || undefined,
          note: form.note.trim() || undefined,
        });
        toast({ title: 'Đã duyệt/gán KOL', description: `${form.userLabel} giờ là ${KIND_LABEL[form.kind]} (đang hoạt động).` });
      } else {
        await adminUpdateKol(form.userId, {
          kind: form.kind,
          commissionPercent: pctToSend,
          leaderId: form.kind === 'STANDARD' ? (form.leaderId || null) : null,
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
      await adminRevokeKol(revokeTarget.userId);
      toast({ title: 'Đã thu hồi', description: `${revokeTarget.userFullName || revokeTarget.userPhone} không còn là KOL.` });
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
      const res = await getUsers({ search: phone, role: 'USER', limit: 10 });
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
    // getUsers returns the raw backend shape (fullName), not the mapped `name` on the User type.
    const label = (u as any).fullName || u.phone || u.id.slice(0, 8);
    try {
      // Don't silently overwrite: if the picked user is ALREADY a KOL, prefill from their profile so
      // 'Duyệt & kích hoạt' doesn't reset their kind/commission/leader.
      const existing = await adminListKols({ search: u.phone || label, limit: 50 });
      const found = existing.data.find((k) => k.userId === u.id);
      openPromote(u.id, label, found);
      if (found) {
        toast({ title: 'Người này đã là KOL', description: 'Form đã nạp cấu hình hiện tại — kiểm tra kỹ trước khi lưu.' });
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
            <Crown className="h-6 w-6" /> KOL / KOC
          </h1>
          <p className="text-sm text-muted-foreground">
            Duyệt đơn đăng ký, gán mức hoa hồng, gán thủ lĩnh cho KOL thường, và thu hồi.
          </p>
        </div>
        <Button onClick={() => { setAddOpen(true); setAddResults([]); setAddPhone(''); }}>
          <UserPlus className="mr-2 h-4 w-4" /> Thêm KOL
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
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
              <SelectItem value="PENDING">Chờ duyệt{pendingCount > 0 ? ` (${pendingCount})` : ''}</SelectItem>
              <SelectItem value="ACTIVE">Hoạt động</SelectItem>
              <SelectItem value="REVOKED">Đã thu hồi</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Loại</Label>
          <Select value={kindFilter} onValueChange={(v) => { setKindFilter(v as any); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả loại</SelectItem>
              <SelectItem value="STANDARD">KOL thường</SelectItem>
              <SelectItem value="LEADER">Thủ lĩnh</SelectItem>
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
          Có <b>{pendingCount}</b> đơn đăng ký KOL đang chờ duyệt — bấm để xem.
        </button>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Người dùng</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Hoa hồng</TableHead>
              <TableHead>Thủ lĩnh</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Không có KOL nào khớp bộ lọc.</TableCell></TableRow>
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
                    <Badge variant={r.kind === 'LEADER' ? 'default' : 'secondary'}>{KIND_LABEL[r.kind]}</Badge>
                  </TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.kind === 'LEADER'
                      ? <span className="text-muted-foreground">—</span>
                      : r.commissionPercent != null
                        ? `${r.commissionPercent}%`
                        : <span className="text-muted-foreground">nhóm</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.kind === 'STANDARD' && r.leaderId
                      ? (r.leaderName ?? leaderName.get(r.leaderId) ?? r.leaderId.slice(0, 8))
                      : <span className="text-muted-foreground">—</span>}
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
          <span className="text-sm text-muted-foreground">{total} KOL</span>
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
            <DialogTitle>{form?.mode === 'edit' ? 'Sửa KOL' : 'Duyệt / gán KOL'}</DialogTitle>
            <DialogDescription>{form?.userLabel}</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Loại</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as KolKind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD">KOL thường (ăn hoa hồng chuyến đầu của khách)</SelectItem>
                    <SelectItem value="LEADER">Thủ lĩnh (ăn override trên hoa hồng downline)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.kind === 'STANDARD' && (
                <>
                  <div className="space-y-1.5">
                    <Label>Hoa hồng riêng (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      placeholder="Bỏ trống = dùng mức nhóm (KOL_TRIP_PERCENT)"
                      value={form.commissionPercent}
                      onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Thủ lĩnh (tuỳ chọn)</Label>
                    <Select
                      value={form.leaderId || 'NONE'}
                      onValueChange={(v) => setForm({ ...form, leaderId: v === 'NONE' ? '' : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Không có" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Không có</SelectItem>
                        {leaders.map((l) => (
                          <SelectItem key={l.userId} value={l.userId}>
                            {l.displayName || l.userFullName || l.userPhone || l.userId.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Tên hiển thị (tuỳ chọn)</Label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Mặc định = tên tài khoản" />
              </div>
              <div className="space-y-1.5">
                <Label>Ghi chú (tuỳ chọn)</Label>
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="VD: kênh, thoả thuận..." />
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
            <DialogTitle>{revokeTarget?.status === 'PENDING' ? 'Từ chối đơn' : 'Thu hồi KOL'}</DialogTitle>
            <DialogDescription>
              {revokeTarget?.status === 'PENDING'
                ? `Từ chối đơn đăng ký của ${revokeTarget?.userFullName || revokeTarget?.userPhone}. Họ có thể nộp lại sau.`
                : `${revokeTarget?.userFullName || revokeTarget?.userPhone} sẽ không còn là KOL (lịch sử hoa hồng giữ nguyên, override mới ngừng phát sinh).`}
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

      {/* Add KOL by phone */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) setAddOpen(false); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm KOL theo số điện thoại</DialogTitle>
            <DialogDescription>Tìm tài khoản khách rồi gán làm KOL (bỏ qua bước đơn đăng ký).</DialogDescription>
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

function StatusBadge({ status }: { status: KolStatus }) {
  if (status === 'ACTIVE') return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">{STATUS_LABEL.ACTIVE}</Badge>;
  if (status === 'PENDING') return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{STATUS_LABEL.PENDING}</Badge>;
  return <Badge variant="destructive">{STATUS_LABEL.REVOKED}</Badge>;
}

// The API client throws Error(JSON.stringify(errorData)). Backend errors are ErrorResponseDto
// ({ error: { code, message } }); some legacy endpoints use { message }. Surface the human sentence.
function parseErr(msg: string): string {
  try {
    const o = JSON.parse(msg);
    return o?.error?.message || o?.message || msg;
  } catch {
    return msg;
  }
}
