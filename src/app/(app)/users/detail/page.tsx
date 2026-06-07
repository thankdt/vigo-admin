'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Lock,
  Trash2,
  Unlock,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { useToast } from '@/hooks/use-toast';
import {
  getAdminUserDetail,
  deleteAdminUser,
  lockUser,
  unlockUser,
  getBookings,
  adminGetUserReferralStats,
  type AdminUserDetail,
  type AdminUserReferralStats,
} from '@/lib/api';
import type { Booking } from '@/lib/types';

const ROLE_LABEL: Record<string, string> = {
  USER: 'Khách hàng',
  DRIVER: 'Tài xế',
  ADMIN: 'Admin',
  TRANSPORT_COMPANY_OWNER: 'Chủ HTX',
};

const WALLET_LABEL: Record<string, string> = {
  USER: 'Ví khách hàng',
  USER_REFERRAL: 'Ví affiliate',
  DRIVER_MAIN: 'Ví tài xế (chính)',
  DRIVER_DEPOSIT: 'Ví tài xế (ký quỹ)',
};

const BOOKING_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Mới tạo',
  SEARCHING: 'Đang tìm',
  PROCESSING: 'Đang xử lý',
  SCHEDULED: 'Đặt lịch',
  ACCEPTED: 'Đã nhận',
  ARRIVED: 'Đã đến',
  PICKED_UP: 'Đã đón',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã huỷ',
  DELIVERY_FAILED: 'Giao thất bại',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  COMPLETED: 'default',
  CANCELLED: 'destructive',
  DELIVERY_FAILED: 'destructive',
};

const fmtVnd = (v: number | string | null | undefined) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(v ?? 0));

function addressString(addr: Booking['pickupAddress'] | Booking['dropoffAddress']): string {
  if (!addr) return '—';
  if (typeof addr === 'string') return addr;
  return addr.address ?? '—';
}

export default function UserDetailPage() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id');
  const { toast } = useToast();

  const [user, setUser] = React.useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  // Affiliate stats fetched separately so a failing referral endpoint doesn't
  // block the main user-detail view. Drivers/admins typically don't have a
  // referral profile — null means "no data" not "loading".
  const [referralStats, setReferralStats] = React.useState<AdminUserReferralStats | null>(null);

  const fetchUser = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminUserDetail(id);
      setUser(data);
    } catch (e: any) {
      setError(e?.message ?? 'Không tải được thông tin user');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchReferral = React.useCallback(async () => {
    if (!id) return;
    try {
      const data = await adminGetUserReferralStats(id);
      setReferralStats(data);
    } catch {
      setReferralStats(null);
    }
  }, [id]);

  React.useEffect(() => {
    fetchUser();
    fetchReferral();
  }, [fetchUser, fetchReferral]);

  const handleToggleLock = async () => {
    if (!user) return;
    setBusy(true);
    try {
      if (user.isActive) await lockUser(user.id);
      else await unlockUser(user.id);
      toast({ title: 'Thành công', description: user.isActive ? 'Đã khoá tài khoản.' : 'Đã mở khoá tài khoản.' });
      await fetchUser();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: e?.message ?? 'Không thực hiện được' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await deleteAdminUser(user.id);
      toast({ title: 'Đã xoá', description: 'Tài khoản đã chuyển trạng thái xoá. Lịch sử giữ nguyên.' });
      setConfirmDelete(false);
      await fetchUser();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Không xoá được', description: e?.message ?? 'Vui lòng thử lại' });
    } finally {
      setBusy(false);
    }
  };

  if (!id) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Thiếu tham số id.</p>
        <Button asChild variant="outline"><Link href="/users"><ArrowLeft className="mr-2 h-4 w-4" /> Quay lại</Link></Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error ?? 'Không tìm thấy user'}</p>
        <Button asChild variant="outline"><Link href="/users"><ArrowLeft className="mr-2 h-4 w-4" /> Quay lại</Link></Button>
      </div>
    );
  }

  const isDeleted = !!user.deletedAt;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/users"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chi tiết người dùng</h1>
          <p className="text-sm text-muted-foreground">{user.fullName ?? 'Không có tên'} — {user.phone}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatar?.startsWith('http') ? user.avatar : undefined} alt={user.fullName ?? user.phone} />
              <AvatarFallback>{String(user.fullName ?? user.phone ?? '?').slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <CardTitle className="text-lg">{user.fullName ?? 'Không có tên'}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{ROLE_LABEL[user.role] ?? user.role}</Badge>
                {isDeleted ? (
                  <Badge variant="destructive">Đã xoá</Badge>
                ) : user.isActive ? (
                  <Badge variant="default">Đang hoạt động</Badge>
                ) : (
                  <Badge variant="secondary">Đã khoá</Badge>
                )}
                <Badge variant="outline">{user.loyaltyTier}</Badge>
              </div>
            </div>
          </div>
          {!isDeleted && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleToggleLock} disabled={busy} variant="outline" size="sm">
                {user.isActive ? <><Lock className="mr-2 h-4 w-4" /> Khoá</> : <><Unlock className="mr-2 h-4 w-4" /> Mở khoá</>}
              </Button>
              <Button onClick={() => setConfirmDelete(true)} disabled={busy} variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" /> Xoá tài khoản
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Số điện thoại" value={user.phone} />
            <Field label="Email" value={user.email ?? '—'} />
            <Field label="Mã giới thiệu" value={user.referralCode ?? '—'} />
            <Field label="Điểm tích luỹ" value={Number(user.loyaltyPoints ?? 0).toLocaleString('vi-VN')} />
            <Field label="Tổng chuyến đặt" value={Number(user.bookingCount ?? 0).toLocaleString('vi-VN')} />
            <Field label="Ngày tham gia" value={user.createdAt ? format(new Date(user.createdAt), 'dd/MM/yyyy HH:mm') : '—'} />
            {isDeleted && (
              <Field label="Đã xoá lúc" value={format(new Date(user.deletedAt!), 'dd/MM/yyyy HH:mm')} />
            )}
          </div>

          {/*
            Affiliate panel: focused view for referral-related state.
            Previously this slot showed a generic wallet loop, which double-rendered
            "Ví khách hàng" when the user had more than one USER-type wallet row in
            DB and didn't surface referee count anywhere.
            We now dedupe wallets by type and bring the affiliate balance + referee
            count to the front. Generic USER-wallet balance is still shown below
            for drivers/users who have it.
          */}
          {(() => {
            const dedupedWallets = Array.from(
              new Map(user.wallets.map((w) => [w.type, w])).values(),
            );
            const userReferralWallet = dedupedWallets.find((w) => w.type === 'USER_REFERRAL');
            const otherWallets = dedupedWallets.filter((w) => w.type !== 'USER_REFERRAL');
            const affiliateBalance =
              referralStats?.balance ?? userReferralWallet?.balance ?? 0;
            const refereeCount = referralStats?.refereeCount ?? 0;

            return (
              <>
                <div className="mt-6 border-t pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Ví Affiliate
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Số dư affiliate</div>
                      <div className="text-base font-semibold">{fmtVnd(affiliateBalance)}</div>
                      {userReferralWallet && userReferralWallet.lockedBalance > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Tạm khoá: {fmtVnd(userReferralWallet.lockedBalance)}
                        </div>
                      )}
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Đã giới thiệu</div>
                      <div className="text-base font-semibold">
                        {refereeCount.toLocaleString('vi-VN')} người
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Mã giới thiệu</div>
                      <div className="text-base font-mono font-semibold tracking-wider">
                        {user.referralCode ?? '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {otherWallets.length > 0 && (
                  <div className="mt-6 border-t pt-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Ví khác
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {otherWallets.map((w) => (
                        <div key={w.type} className="rounded-md border p-3">
                          <div className="text-xs text-muted-foreground">
                            {WALLET_LABEL[w.type] ?? w.type}
                          </div>
                          <div className="text-base font-semibold">{fmtVnd(w.balance)}</div>
                          {w.lockedBalance > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Tạm khoá: {fmtVnd(w.lockedBalance)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {user.bankInfo && (
            <div className="mt-6 border-t pt-4 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Thông tin ngân hàng</div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
                <Field label="Ngân hàng" value={user.bankInfo.bankName} />
                <Field label="Số tài khoản" value={user.bankInfo.accountNumber} />
                <Field label="Chủ tài khoản" value={user.bankInfo.accountHolder} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <UserBookingsCard customerId={user.id} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá tài khoản?</AlertDialogTitle>
            <AlertDialogDescription>
              Tài khoản sẽ chuyển trạng thái xoá (soft delete). Dữ liệu lịch sử (chuyến đi, giao dịch, ví) vẫn được giữ
              lại, user không đăng nhập được nữa. Hành động có thể đảo ngược trực tiếp trên DB nếu cần.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busy} className="bg-destructive hover:bg-destructive/90">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function UserBookingsCard({ customerId }: { customerId: string }) {
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const limit = 10;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const resp = await getBookings({ page, limit, customerId });
        if (cancelled) return;
        setBookings(resp.data);
        setTotal(resp.total);
        setTotalPages(resp.totalPages);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId, page]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chuyến đi đã đặt ({total.toLocaleString('vi-VN')})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Mã</TableHead>
                <TableHead>Điểm đón → trả</TableHead>
                <TableHead className="w-[120px]">Trạng thái</TableHead>
                <TableHead className="w-[140px] text-right">Giá cuối</TableHead>
                <TableHead className="w-[140px]">Thời gian đặt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : bookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                    Chưa có chuyến đi nào.
                  </TableCell>
                </TableRow>
              ) : (
                bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{String(b.id ?? '').slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">
                      <div className="line-clamp-1">{addressString(b.pickupAddress)}</div>
                      <div className="line-clamp-1 text-muted-foreground">→ {addressString(b.dropoffAddress)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[b.status] ?? 'secondary'}>
                        {BOOKING_STATUS_LABEL[b.status] ?? b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtVnd(b.finalPrice ?? b.price)}</TableCell>
                    <TableCell className="text-xs">{format(new Date(b.createdAt), 'dd/MM/yyyy HH:mm')}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Trang {page} / {totalPages}</div>
            <div className="flex gap-1">
              <Button size="icon" variant="outline" onClick={() => setPage(1)} disabled={page === 1}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
