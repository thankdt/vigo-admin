'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Ban, BarChart3, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  adminListKolCodes,
  adminCreateKolCode,
  adminDeactivateKolCode,
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

type CreateForm = {
  code: string;
  refereeRewardPoints: string;
  usageLimit: string;
  dailyLimit: string;
  campaignName: string;
};

const emptyForm: CreateForm = {
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
  const [form, setForm] = React.useState<CreateForm>(emptyForm);
  const [creating, setCreating] = React.useState(false);
  const [reports, setReports] = React.useState<Record<string, KolCodeReport>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

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
      setReports({});
      void load();
    }
  }, [open, load]);

  const create = async () => {
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
    setCreating(true);
    try {
      await adminCreateKolCode(userId, {
        code: form.code.trim() ? form.code.trim().toUpperCase() : undefined,
        refereeRewardPoints: points,
        usageLimit: usage,
        dailyLimit: form.dailyLimit.trim() ? Number(form.dailyLimit) : undefined,
        campaignName: form.campaignName.trim() || undefined,
      });
      toast({ description: 'Đã tạo mã ưu đãi' });
      setForm(emptyForm);
      await load();
    } catch (e) {
      toast({ variant: 'destructive', description: parseErr(e) || 'Tạo mã thất bại' });
    } finally {
      setCreating(false);
    }
  };

  const deactivate = async (row: KolCodeRow) => {
    setBusyId(row.id);
    try {
      await adminDeactivateKolCode(row.id);
      toast({ description: `Đã tắt mã ${row.code}` });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', description: parseErr(e) || 'Tắt mã thất bại' });
    } finally {
      setBusyId(null);
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

        {/* Tạo mã mới */}
        <div className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">Mã (trống = tự sinh)</Label>
            <Input
              placeholder="VD TET2026"
              value={form.code}
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
          <div className="col-span-2 flex items-end sm:col-span-5">
            <Button onClick={create} disabled={creating} className="ml-auto">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Tạo mã
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
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <React.Fragment key={r.id}>
                    <TableRow>
                      <TableCell className="font-mono font-medium">{r.code}</TableCell>
                      <TableCell className="text-right">{fmt(r.refereeRewardPoints)}</TableCell>
                      <TableCell className="text-right">
                        {fmt(r.usedCount)}/{fmt(r.usageLimit)}
                      </TableCell>
                      <TableCell className="text-right">{r.dailyLimit ? fmt(r.dailyLimit) : '∞'}</TableCell>
                      <TableCell className="text-muted-foreground">{r.campaignName || '—'}</TableCell>
                      <TableCell>
                        {r.isActive ? (
                          <Badge>Bật</Badge>
                        ) : (
                          <Badge variant="secondary">Tắt</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          disabled={busyId === r.id}
                          onClick={() => toggleReport(r)}
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        {r.isActive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive"
                            disabled={busyId === r.id}
                            onClick={() => deactivate(r)}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
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
    </Dialog>
  );
}
