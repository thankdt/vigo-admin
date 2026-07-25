'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, BarChart3, Plus, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  adminListKolCodes,
  adminCreateKolCode,
  adminUpdateKolCode,
  adminDeleteKolCode,
  adminKolCodeReport,
  type KolCodeRow,
  type KolCodeReport,
} from '@/lib/api';

const fmt = (n: number) => n.toLocaleString('vi-VN');

// API client ném Error(JSON.stringify({ error: { code, message } })) — rút câu message người đọc.
function parseErr(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  try {
    const o = JSON.parse(msg);
    return o?.error?.message || o?.message || msg;
  } catch {
    return msg;
  }
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  userLabel: string;
};

type CodeForm = {
  code: string;
  refereeRewardPoints: string;
  usageLimit: string;
  dailyLimit: string;
  campaignName: string;
};

const emptyForm: CodeForm = {
  code: '',
  refereeRewardPoints: '',
  usageLimit: '',
  dailyLimit: '',
  campaignName: '',
};

export function KolCodesDialog({ open, onOpenChange, userId, userLabel }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = React.useState<KolCodeRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState<CodeForm>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [reports, setReports] = React.useState<Record<string, KolCodeReport>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<KolCodeRow | null>(null);
  const [deletingBusy, setDeletingBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setRows(await adminListKolCodes(userId));
    } catch (e) {
      toast({ variant: 'destructive', description: parseErr(e) || 'Không tải được danh sách mã' });
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  React.useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setEditingId(null);
      setReports({});
      void load();
    }
  }, [open, load]);

  const startEdit = (row: KolCodeRow) => {
    setEditingId(row.id);
    setForm({
      code: row.code,
      refereeRewardPoints: String(row.refereeRewardPoints),
      usageLimit: String(row.usageLimit),
      dailyLimit: row.dailyLimit ? String(row.dailyLimit) : '',
      campaignName: row.campaignName ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  // Tạo mã mới HOẶC lưu sửa mã đang chọn (editingId). Mã (code) KHÔNG đổi được khi sửa.
  const save = async () => {
    const points = Number(form.refereeRewardPoints);
    const usage = Number(form.usageLimit);
    if (!Number.isFinite(points) || points < 1) {
      toast({ variant: 'destructive', description: 'Điểm/mã phải ≥ 1' });
      return;
    }
    if (!Number.isFinite(usage) || usage < 1) {
      toast({ variant: 'destructive', description: 'Giới hạn lượt (usageLimit) phải ≥ 1' });
      return;
    }
    const dailyLimit = form.dailyLimit.trim() ? Number(form.dailyLimit) : undefined;
    const campaignName = form.campaignName.trim() || undefined;
    setSaving(true);
    try {
      if (editingId) {
        await adminUpdateKolCode(editingId, {
          refereeRewardPoints: points,
          usageLimit: usage,
          dailyLimit,
          campaignName,
        });
        toast({ description: 'Đã lưu thay đổi' });
      } else {
        await adminCreateKolCode(userId, {
          code: form.code.trim() ? form.code.trim().toUpperCase() : undefined,
          refereeRewardPoints: points,
          usageLimit: usage,
          dailyLimit,
          campaignName,
        });
        toast({ description: 'Đã tạo mã ưu đãi' });
      }
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (e) {
      toast({ variant: 'destructive', description: parseErr(e) || 'Lưu mã thất bại' });
    } finally {
      setSaving(false);
    }
  };

  // Bật/tắt 2 chiều qua PATCH isActive (deactivate + reactivate cùng 1 đường).
  const toggleActive = async (row: KolCodeRow) => {
    const next = !row.isActive;
    setTogglingId(row.id);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, isActive: next } : r)));
    try {
      await adminUpdateKolCode(row.id, { isActive: next });
      toast({ description: next ? `Đã bật mã ${row.code}` : `Đã tắt mã ${row.code}` });
    } catch (e) {
      // revert optimistic
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, isActive: row.isActive } : r)));
      toast({ variant: 'destructive', description: parseErr(e) || 'Đổi trạng thái thất bại' });
    } finally {
      setTogglingId(null);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await adminDeleteKolCode(deleting.id);
      toast({ description: `Đã xoá mã ${deleting.code}` });
      setDeleting(null);
      if (editingId === deleting.id) cancelEdit();
      await load();
    } catch (e) {
      // Backend chặn xoá mã đã dùng → hiện đúng lý do, không đóng dialog.
      toast({ variant: 'destructive', description: parseErr(e) || 'Xoá mã thất bại' });
    } finally {
      setDeletingBusy(false);
    }
  };

  const toggleReport = async (row: KolCodeRow) => {
    if (reports[row.id]) {
      setReports((r) => {
        const next = { ...r };
        delete next[row.id];
        return next;
      });
      return;
    }
    setBusyId(row.id);
    try {
      const rep = await adminKolCodeReport(row.id);
      setReports((r) => ({ ...r, [row.id]: rep }));
    } catch (e) {
      toast({ variant: 'destructive', description: parseErr(e) || 'Không tải được báo cáo' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Mã ưu đãi — {userLabel}</DialogTitle>
          <DialogDescription>
            Khách dùng mã/link của KOL này sẽ được cộng điểm thưởng (mức đặt theo từng mã). 1 KOL nhiều mã.
          </DialogDescription>
        </DialogHeader>

        {/* Tạo / sửa mã */}
        <div className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">Mã {editingId ? '(không đổi được)' : '(trống = tự sinh)'}</Label>
            <Input
              placeholder="VD TET2026"
              value={form.code}
              disabled={!!editingId}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Điểm khách nhận *</Label>
            <Input
              type="number"
              placeholder="200000"
              value={form.refereeRewardPoints}
              onChange={(e) => setForm((f) => ({ ...f, refereeRewardPoints: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Giới hạn lượt *</Label>
            <Input
              type="number"
              placeholder="100"
              value={form.usageLimit}
              onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Giới hạn/ngày (0=∞)</Label>
            <Input
              type="number"
              placeholder="0"
              value={form.dailyLimit}
              onChange={(e) => setForm((f) => ({ ...f, dailyLimit: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Chiến dịch</Label>
            <Input
              placeholder="Tết 2026"
              value={form.campaignName}
              onChange={(e) => setForm((f) => ({ ...f, campaignName: e.target.value }))}
            />
          </div>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-5">
            {editingId && (
              <Button variant="outline" onClick={cancelEdit} disabled={saving} className="ml-auto">
                <X className="mr-2 h-4 w-4" />
                Huỷ
              </Button>
            )}
            <Button onClick={save} disabled={saving} className={editingId ? '' : 'ml-auto'}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : editingId ? (
                <Pencil className="mr-2 h-4 w-4" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {editingId ? 'Lưu thay đổi' : 'Tạo mã'}
            </Button>
          </div>
        </div>

        {/* Danh sách mã */}
        <div className="max-h-[45vh] overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Chưa có mã nào.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã</TableHead>
                  <TableHead className="text-right">Điểm</TableHead>
                  <TableHead className="text-right">Đã dùng</TableHead>
                  <TableHead className="text-right">/ngày</TableHead>
                  <TableHead>Chiến dịch</TableHead>
                  <TableHead>Bật</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <React.Fragment key={r.id}>
                    <TableRow className={editingId === r.id ? 'bg-muted/50' : undefined}>
                      <TableCell className="font-mono font-medium">{r.code}</TableCell>
                      <TableCell className="text-right">{fmt(r.refereeRewardPoints)}</TableCell>
                      <TableCell className="text-right">
                        {fmt(r.usedCount)}/{fmt(r.usageLimit)}
                      </TableCell>
                      <TableCell className="text-right">{r.dailyLimit ? fmt(r.dailyLimit) : '∞'}</TableCell>
                      <TableCell className="text-muted-foreground">{r.campaignName || '—'}</TableCell>
                      <TableCell>
                        <Switch
                          checked={r.isActive}
                          disabled={togglingId === r.id}
                          onCheckedChange={() => toggleActive(r)}
                          aria-label={r.isActive ? 'Tắt mã' : 'Bật mã'}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          title="Báo cáo"
                          disabled={busyId === r.id}
                          onClick={() => toggleReport(r)}
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          title="Sửa mã"
                          onClick={() => startEdit(r)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-destructive"
                          title="Xoá mã (chỉ mã chưa dùng)"
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {reports[r.id] && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/40 text-sm">
                          <span className="mr-4">Khách gắn mã: <b>{fmt(reports[r.id].totalReferees)}</b></span>
                          <span className="mr-4">Đã cộng điểm (chuyển đổi): <b>{fmt(reports[r.id].converted)}</b></span>
                          <span>Tổng điểm đã cộng: <b>{fmt(reports[r.id].totalPointsCredited)}</b></span>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>

      {/* Xác nhận xoá */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá mã {deleting?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Chỉ xoá được mã CHƯA phát sinh lượt dùng / chưa có khách gắn. Mã đã dùng sẽ bị chặn —
              hãy TẮT thay vì xoá để giữ báo cáo và điểm đã hứa cho khách. Hành động này không hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doDelete();
              }}
              disabled={deletingBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
