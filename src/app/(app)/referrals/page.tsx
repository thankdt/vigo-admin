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
  Share2,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Users,
  TrendingUp,
  Wallet,
  Search,
  ArrowLeft,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  adminListReferrers,
  adminListReferrals,
  adminGetReferralDetail,
  adminClawbackReferralEvent,
  type AdminReferrerSummary,
  type AdminReferralRow,
  type AdminReferralDetail,
} from '@/lib/api';

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

type SortKey = 'amount' | 'trips' | 'referees';

export default function ReferralsPage() {
  const { toast } = useToast();

  const [referrers, setReferrers] = React.useState<AdminReferrerSummary[]>([]);
  const [search, setSearch] = React.useState('');
  const [sort, setSort] = React.useState<SortKey>('amount');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  // Drill-down: when a referrer is selected, fetch their list of relationships.
  const [selectedReferrer, setSelectedReferrer] = React.useState<AdminReferrerSummary | null>(null);
  const [referrals, setReferrals] = React.useState<AdminReferralRow[]>([]);
  const [referralsLoading, setReferralsLoading] = React.useState(false);

  // Bottom-level: event log + clawback for a single relationship.
  const [detail, setDetail] = React.useState<AdminReferralDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [clawbackTarget, setClawbackTarget] = React.useState<{ eventId: string; amount: number; type: string } | null>(null);
  const [clawbackReason, setClawbackReason] = React.useState('');
  const [isClawingBack, setIsClawingBack] = React.useState(false);

  // Drill-down filters (client-side over the loaded referees) + paging — the list
  // had no paging/filter and was unusable for referrers with many referees.
  const DRILL_PAGE_SIZE = 10;
  const EVENT_PAGE_SIZE = 10;
  const [drillSearch, setDrillSearch] = React.useState('');
  const [drillFrom, setDrillFrom] = React.useState('');
  const [drillTo, setDrillTo] = React.useState('');
  const [drillPage, setDrillPage] = React.useState(1);
  const [eventPage, setEventPage] = React.useState(1);
  React.useEffect(() => { setEventPage(1); }, [detail]);

  const filteredReferrals = React.useMemo(() => {
    const q = drillSearch.trim().toLowerCase();
    const fromT = drillFrom ? new Date(`${drillFrom}T00:00:00`).getTime() : -Infinity;
    const toT = drillTo ? new Date(`${drillTo}T23:59:59`).getTime() : Infinity;
    return referrals.filter((r) => {
      const name = (r.referee.fullName ?? '').toLowerCase();
      const phone = (r.referee.phone ?? '').toLowerCase();
      const matchQ = !q || name.includes(q) || phone.includes(q);
      const t = new Date(r.createdAt).getTime();
      return matchQ && t >= fromT && t <= toT;
    });
  }, [referrals, drillSearch, drillFrom, drillTo]);

  const drillTotalPages = Math.max(1, Math.ceil(filteredReferrals.length / DRILL_PAGE_SIZE));
  const pagedReferrals = React.useMemo(
    () => filteredReferrals.slice((drillPage - 1) * DRILL_PAGE_SIZE, drillPage * DRILL_PAGE_SIZE),
    [filteredReferrals, drillPage],
  );
  React.useEffect(() => { setDrillPage(1); }, [drillSearch, drillFrom, drillTo, selectedReferrer]);

  const loadReferrers = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await adminListReferrers({ page, limit: 20, search: search || undefined, sort });
      setReferrers(result.data);
      setTotalPages(result.meta.totalPages || 1);
      setTotal(result.meta.total);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được danh sách', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [page, search, sort, toast]);

  React.useEffect(() => {
    const timer = setTimeout(loadReferrers, 350);
    return () => clearTimeout(timer);
  }, [loadReferrers]);

  const openReferrerDrilldown = async (r: AdminReferrerSummary) => {
    setSelectedReferrer(r);
    setDrillSearch('');
    setDrillFrom('');
    setDrillTo('');
    setReferralsLoading(true);
    try {
      const result = await adminListReferrals({ referrerId: r.id, page: 1, limit: 100 });
      setReferrals(result.data);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được giới thiệu', description: err.message });
    } finally {
      setReferralsLoading(false);
    }
  };

  const closeReferrerDrilldown = () => {
    setSelectedReferrer(null);
    setReferrals([]);
  };

  const openDetail = async (row: AdminReferralRow) => {
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await adminGetReferralDetail(row.id);
      setDetail(d);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: err.message });
    } finally {
      setDetailLoading(false);
    }
  };

  const submitClawback = async () => {
    if (!clawbackTarget || !clawbackReason.trim()) return;
    setIsClawingBack(true);
    try {
      await adminClawbackReferralEvent(clawbackTarget.eventId, clawbackReason.trim());
      toast({ title: 'Đã clawback', description: `Đã hoàn ${formatVND(clawbackTarget.amount)} từ chủ link.` });
      setClawbackTarget(null);
      setClawbackReason('');
      if (detail) {
        const refreshed = await adminGetReferralDetail(detail.id);
        setDetail(refreshed);
      }
      // Refresh both drill-down list (for tripCount/reward) + top-level summary.
      if (selectedReferrer) {
        const result = await adminListReferrals({ referrerId: selectedReferrer.id, page: 1, limit: 100 });
        setReferrals(result.data);
      }
      loadReferrers();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Clawback thất bại', description: err.message });
    } finally {
      setIsClawingBack(false);
    }
  };

  // Aggregate stats banner — uses what's already loaded in current page.
  const pageStats = React.useMemo(() => {
    const sumTrips = referrers.reduce((s, r) => s + r.tripCount, 0);
    const sumAmount = referrers.reduce((s, r) => s + r.totalReward, 0);
    const sumReferees = referrers.reduce((s, r) => s + r.refereeCount, 0);
    return { sumTrips, sumAmount, sumReferees };
  }, [referrers]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Share2 className="h-6 w-6" /> Affiliate / Giới thiệu bạn bè
        </h1>
        <p className="text-sm text-muted-foreground">
          Danh sách người dùng đang có doanh thu từ giới thiệu. Click 1 dòng để xem họ giới thiệu được những ai và từng chuyến cụ thể.
        </p>
      </div>

      {/* Page-level stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Người có doanh thu (trang này)" value={String(referrers.length)} hint={`/${total} tổng`} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Tổng chuyến (trang này)" value={pageStats.sumTrips.toLocaleString('vi-VN')} hint={`${pageStats.sumReferees} người được mời`} />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Tổng đã chi (trang này)" value={formatVND(pageStats.sumAmount)} highlight />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tên hoặc SĐT chủ link..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Sắp xếp theo</Label>
          <Select value={sort} onValueChange={(v) => { setSort(v as SortKey); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="amount">Tổng tiền giảm dần</SelectItem>
              <SelectItem value="trips">Số chuyến giảm dần</SelectItem>
              <SelectItem value="referees">Số người mời giảm dần</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chủ link</TableHead>
              <TableHead>Mã</TableHead>
              <TableHead className="text-right">Số người mời</TableHead>
              <TableHead className="text-right">Số chuyến</TableHead>
              <TableHead className="text-right">Tổng tiền</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></TableCell></TableRow>
            ) : referrers.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Không tìm thấy chủ link nào.</TableCell></TableRow>
            ) : (
              referrers.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openReferrerDrilldown(r)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{(r.fullName ?? r.phone ?? '?').slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{r.fullName ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.phone ?? '—'}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.referralCode
                      ? <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.referralCode}</code>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.refereeCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.tripCount}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-primary">{formatVND(r.totalReward)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openReferrerDrilldown(r); }}>
                      Chi tiết →
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-muted-foreground">{total} chủ link</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Trang {page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1 || isLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages || isLoading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>

      {/* Drill-down: referees of a specific referrer */}
      <Dialog open={!!selectedReferrer} onOpenChange={(open) => { if (!open) closeReferrerDrilldown(); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeReferrerDrilldown}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              Giới thiệu của {selectedReferrer?.fullName ?? selectedReferrer?.phone}
            </DialogTitle>
            {selectedReferrer && (
              <DialogDescription>
                {selectedReferrer.refereeCount} người được mời · {selectedReferrer.tripCount} chuyến · tổng{' '}
                <span className="font-medium text-foreground">{formatVND(selectedReferrer.totalReward)}</span>
              </DialogDescription>
            )}
          </DialogHeader>
          {referralsLoading ? (
            <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end pb-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Lọc theo tên / SĐT khách..." value={drillSearch} onChange={(e) => setDrillSearch(e.target.value)} />
              </div>
              <Input type="date" className="sm:w-[150px]" value={drillFrom} onChange={(e) => setDrillFrom(e.target.value)} />
              <Input type="date" className="sm:w-[150px]" value={drillTo} onChange={(e) => setDrillTo(e.target.value)} />
            </div>
            <div className="max-h-[55vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Người được mời</TableHead>
                    <TableHead className="text-right">Chuyến</TableHead>
                    <TableHead className="text-right">Tiền</TableHead>
                    <TableHead>Ngày</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReferrals.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-16 text-center text-muted-foreground">Không có giới thiệu khớp bộ lọc.</TableCell></TableRow>
                  ) : pagedReferrals.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(r)}>
                      <TableCell>
                        <div className="font-medium">{r.referee.fullName ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.referee.phone}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.tripCountUsed}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatVND(r.totalAmount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(r); }}>Chi tiết</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {drillTotalPages > 1 && (
              <div className="flex items-center justify-between border-t pt-2 mt-1">
                <span className="text-sm text-muted-foreground">Trang {drillPage}/{drillTotalPages} · {filteredReferrals.length} khách</span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={drillPage <= 1} onClick={() => setDrillPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={drillPage >= drillTotalPages} onClick={() => setDrillPage((p) => Math.min(drillTotalPages, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Event log + clawback dialog (per referee relationship) */}
      <Dialog open={!!detail || detailLoading} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lịch sử giao dịch</DialogTitle>
            {detail && (
              <DialogDescription>
                <span className="font-medium">{detail.referrer.fullName ?? detail.referrer.phone}</span> →{' '}
                <span className="font-medium">{detail.referee.fullName ?? detail.referee.phone}</span> · mã{' '}
                <code className="bg-muted px-1.5 py-0.5 rounded">{detail.codeUsed}</code>
              </DialogDescription>
            )}
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-muted/50 rounded p-2"><div className="text-muted-foreground text-xs">Số chuyến</div><div className="font-bold">{detail.tripCountUsed}</div></div>
                <div className="bg-muted/50 rounded p-2"><div className="text-muted-foreground text-xs">Tiền trip</div><div className="font-bold">{formatVND(detail.tripRewardTotal)}</div></div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loại</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead>Booking</TableHead>
                    <TableHead>Ngày</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.events.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-16 text-center text-muted-foreground">Chưa có giao dịch.</TableCell></TableRow>
                  ) : detail.events.slice((eventPage - 1) * EVENT_PAGE_SIZE, eventPage * EVENT_PAGE_SIZE).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell><Badge variant={e.type === 'CLAWBACK' ? 'destructive' : 'secondary'}>{e.type}</Badge></TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${e.amount < 0 ? 'text-red-600' : ''}`}>{formatVND(e.amount)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{e.bookingId ? e.bookingId.slice(0, 8) + '...' : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString('vi-VN')}</TableCell>
                      <TableCell className="text-right">
                        {e.type !== 'CLAWBACK' && Number(e.amount) > 0 && (
                          <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => setClawbackTarget({ eventId: e.id, amount: e.amount, type: e.type })}>
                            <Undo2 className="h-3.5 w-3.5 mr-1" /> Clawback
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {detail.events.length > EVENT_PAGE_SIZE && (
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-sm text-muted-foreground">
                    Trang {eventPage}/{Math.ceil(detail.events.length / EVENT_PAGE_SIZE)} · {detail.events.length} giao dịch
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={eventPage <= 1} onClick={() => setEventPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={eventPage >= Math.ceil(detail.events.length / EVENT_PAGE_SIZE)} onClick={() => setEventPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Clawback confirm dialog */}
      <Dialog open={!!clawbackTarget} onOpenChange={(open) => { if (!open && !isClawingBack) { setClawbackTarget(null); setClawbackReason(''); } }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clawback giao dịch</DialogTitle>
            <DialogDescription>
              Hoàn lại <span className="font-medium">{clawbackTarget && formatVND(clawbackTarget.amount)}</span> ({clawbackTarget?.type}) từ chủ link về system. Hành động được ghi audit và không thể tự undo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="clawback-reason">Lý do (bắt buộc)</Label>
            <Input id="clawback-reason" value={clawbackReason} onChange={(e) => setClawbackReason(e.target.value)} placeholder="VD: Phát hiện account giả, IP trùng..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClawbackTarget(null)} disabled={isClawingBack}>Huỷ</Button>
            <Button variant="destructive" onClick={submitClawback} disabled={isClawingBack || !clawbackReason.trim()}>
              {isClawingBack && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận clawback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-4 ${highlight ? 'border-primary' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={highlight ? 'text-primary' : 'text-muted-foreground'}>{icon}</div>
      </div>
      <div className={`text-2xl font-bold mt-1 ${highlight ? 'text-primary' : ''}`}>{value}</div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </Card>
  );
}
