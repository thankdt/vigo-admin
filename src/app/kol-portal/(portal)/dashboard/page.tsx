'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Copy, Crown, Wallet, TrendingUp, Users, Percent, Layers } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import {
  getKolMe,
  getKolEarnings,
  getKolLeaderDashboard,
  getKolReferees,
  parseApiError,
  type KolMe,
  type KolLeaderDashboard,
  type KolEarningsSeries,
  type KolReferee,
} from '@/lib/api';

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

// VN-local dates (UTC+7), browser-TZ-independent (see admin CLAUDE.md).
const vnToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const vnDaysAgo = (d: number) => new Date(Date.now() + 7 * 3600_000 - d * 86400_000).toISOString().slice(0, 10);

export default function KolDashboardPage() {
  const { toast } = useToast();
  const [me, setMe] = React.useState<KolMe | null>(null);
  const [leader, setLeader] = React.useState<KolLeaderDashboard | null>(null);
  const [earnings, setEarnings] = React.useState<KolEarningsSeries | null>(null);
  const [referees, setReferees] = React.useState<KolReferee[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const m = await getKolMe();
        setMe(m);
        const from = vnDaysAgo(29);
        const to = vnToday();
        const tasks: Promise<any>[] = [
          getKolEarnings(from, to).then(setEarnings).catch(() => {}),
        ];
        if (m.kind === 'LEADER') {
          tasks.push(getKolLeaderDashboard().then(setLeader).catch(() => {}));
        } else {
          tasks.push(getKolReferees(1, 50).then((r) => setReferees(r.data)).catch(() => {}));
        }
        await Promise.all(tasks);
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Không tải được dữ liệu', description: parseApiError(err.message) });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const copyLink = async () => {
    const link = me?.shareLink || me?.code || '';
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Đã copy link giới thiệu' });
    } catch {
      toast({ variant: 'destructive', title: 'Không copy được', description: link });
    }
  };

  if (loading) {
    return <div className="py-24 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!me) return null;

  const isLeader = me.kind === 'LEADER';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Crown className="h-6 w-6 text-primary" /> {me.displayName || 'Bảng điều khiển KOL'}
        </h1>
        <Badge variant={isLeader ? 'default' : 'secondary'}>{isLeader ? 'Thủ lĩnh' : 'KOL/KOC'}</Badge>
      </div>

      {/* Share link */}
      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Mã giới thiệu của bạn</div>
            <div className="flex items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-base font-bold tracking-wide">{me.code}</code>
              {me.shareLink && <span className="hidden text-sm text-muted-foreground sm:inline">{me.shareLink}</span>}
            </div>
          </div>
          <Button variant="outline" onClick={copyLink}><Copy className="mr-2 h-4 w-4" /> Copy link</Button>
        </div>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Wallet className="h-4 w-4" />} label="Số dư khả dụng" value={formatVND(me.balance)} highlight />
        {isLeader ? (
          <>
            <Stat icon={<TrendingUp className="h-4 w-4" />} label="Override tháng này" value={formatVND(leader?.overrideEarnedMonth ?? 0)} />
            <Stat icon={<Layers className="h-4 w-4" />} label="Hoa hồng đội (tháng này)" value={formatVND(leader?.teamEarningsThisMonth ?? 0)} hint={`Bậc hiện tại: ${leader?.currentRate ?? 0}%`} />
            <Stat icon={<TrendingUp className="h-4 w-4" />} label="Tổng override đã nhận" value={formatVND(leader?.overrideEarnedTotal ?? 0)} />
          </>
        ) : (
          <>
            <Stat icon={<TrendingUp className="h-4 w-4" />} label="Tổng hoa hồng" value={formatVND(me.tripRewardTotal)} />
            <Stat icon={<Percent className="h-4 w-4" />} label="Mức hoa hồng" value={me.commissionPercent != null ? `${me.commissionPercent}%` : 'Theo nhóm'} />
            <Stat icon={<Users className="h-4 w-4" />} label="Khách đã giới thiệu" value={String(me.refereeCount)} hint={`${me.tripCount} khách đã đi chuyến đầu`} />
          </>
        )}
      </div>

      {/* Earnings chart */}
      <Card className="p-4">
        <div className="mb-3 text-sm font-medium">Thu nhập 30 ngày gần nhất</div>
        {earnings && earnings.points.some((p) => p.value !== 0) ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={earnings.points}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip formatter={(v: any) => formatVND(Number(v))} labelClassName="text-xs" />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Chưa có thu nhập trong 30 ngày qua.</p>
        )}
      </Card>

      {/* Detail table */}
      {isLeader ? (
        <Card>
          <div className="border-b px-4 py-3 text-sm font-medium">Đội nhóm của bạn (tháng {leader?.yearMonthVn ?? ''})</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sub-KOL</TableHead>
                <TableHead className="text-right">Hoa hồng họ kiếm</TableHead>
                <TableHead className="text-right">Override bạn nhận</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(leader?.subKols ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={3} className="h-20 text-center text-muted-foreground">Chưa có sub-KOL nào phát sinh hoa hồng tháng này.</TableCell></TableRow>
              ) : leader!.subKols.map((s) => (
                <TableRow key={s.subKolUserId}>
                  <TableCell className="font-medium">{s.name || s.subKolUserId.slice(0, 8)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatVND(s.earnings)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-primary">{formatVND(s.myOverride)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <div className="border-b px-4 py-3 text-sm font-medium">Khách bạn đã giới thiệu</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Khách</TableHead>
                <TableHead>Chuyến đầu</TableHead>
                <TableHead className="text-right">Hoa hồng</TableHead>
                <TableHead>Ngày</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referees.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">Chưa có khách nào dùng mã của bạn.</TableCell></TableRow>
              ) : referees.map((r) => (
                <TableRow key={r.refereeId}>
                  <TableCell>
                    <div className="font-medium">{r.refereeName || '—'}</div>
                    <div className="text-xs text-muted-foreground">{r.refereePhone || '—'}</div>
                  </TableCell>
                  <TableCell>
                    {r.firstTripDone
                      ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Đã đi</Badge>
                      : <Badge variant="secondary">Chưa</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatVND(r.commissionEarned)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon, label, value, hint, highlight }: { icon: React.ReactNode; label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? 'border-primary' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={highlight ? 'text-primary' : 'text-muted-foreground'}>{icon}</div>
      </div>
      <div className={`mt-1 text-xl font-bold ${highlight ? 'text-primary' : ''}`}>{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
