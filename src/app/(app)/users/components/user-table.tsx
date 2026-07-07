'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Button } from '@/components/ui/button';
import { MoreHorizontal, ArrowUpDown, Loader2, Lock, Unlock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Calendar, Share2, Plus, Trash2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getUsers, lockUser, unlockUser, deleteAdminUser, restoreUser, adminGetUserReferralStats, createAdminUser, type AdminUserReferralStats } from '@/lib/api';
import type { User } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';

type SortKey = keyof User;

export function UsersTable() {
  const [users, setUsers] = React.useState<User[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<'ALL' | 'USER' | 'TRANSPORT_COMPANY_OWNER'>('ALL');
  // Trạng thái xoá: 'active' = user sống (mặc định); 'deleted' = user đã xoá (để khôi phục).
  const [deletedScope, setDeletedScope] = React.useState<'active' | 'deleted'>('active');
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<User | null>(null);

  // Affiliate stats viewer — admin support tool. Targets the same /referrals/me data the
  // mobile app shows but for any user, so support can answer "what's my balance?" without
  // asking the user to read it off their phone.
  const [statsTarget, setStatsTarget] = React.useState<User | null>(null);
  const [stats, setStats] = React.useState<AdminUserReferralStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = React.useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);

  const fetchUsers = React.useCallback(async (search: string, page: number, limit: number, role: 'ALL' | 'USER' | 'TRANSPORT_COMPANY_OWNER', scope: 'active' | 'deleted') => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getUsers({
        search,
        page,
        limit,
        ...(role !== 'ALL' && { role }),
        ...(scope === 'deleted' && { deleted: 'only' as const }),
      });
      const mappedUsers: User[] = response.data.map((apiUser: any) => ({
        id: apiUser.id,
        name: apiUser.fullName,
        email: apiUser.email || 'N/A',
        role: apiUser.role,
        status: apiUser.isLocked ? 'Inactive' : 'Active',
        avatarUrl: `https://picsum.photos/seed/${apiUser.id}/40/40`,
        lastLogin: 'N/A',
        phone: apiUser.phone,
        isLocked: apiUser.isLocked,
        createdAt: apiUser.createdAt,
        loyaltyTier: apiUser.loyaltyTier,
        currentBalance: Number(apiUser.currentBalance ?? 0),
        totalWithdrawn: Number(apiUser.totalWithdrawn ?? 0),
        deletedAt: apiUser.deletedAt ?? null,
      }));
      setUsers(mappedUsers);
      const total = response.meta?.total ?? 0;
      const apiLimit = response.meta?.limit ?? limit;
      setTotalItems(total);
      setTotalPages(Math.max(1, Math.ceil(total / apiLimit)));
    } catch (err: any) {
      setError(err.message);
      toast({
        variant: "destructive",
        title: "Không thể tải người dùng",
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
        fetchUsers(searchTerm, currentPage, pageSize, roleFilter, deletedScope);
    }, 500); // Debounce search

    return () => clearTimeout(timer);
  }, [fetchUsers, searchTerm, currentPage, pageSize, roleFilter, deletedScope]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to page 1 on search
  };

  const sortedUsers = React.useMemo(() => {
    let sortableUsers = [...users];
    if (sortConfig !== null) {
      sortableUsers.sort((a, b) => {
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableUsers;
  }, [users, sortConfig]);
  

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const handleOpenForm = (user: User | null) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };
  
  const handleCloseForm = () => {
    setEditingUser(null);
    setIsFormOpen(false);
  };
  
  // Soft-delete the user via the new admin DELETE endpoint. Reuses the
  // confirm-dialog state below so the dropdown can fire-and-forget.
  const [pendingDelete, setPendingDelete] = React.useState<User | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteAdminUser(pendingDelete.id);
      toast({ title: 'Đã xoá', description: `Tài khoản ${pendingDelete.phone} đã chuyển trạng thái xoá.` });
      setPendingDelete(null);
      // Refresh list to drop the deleted user (admin list filters soft-deleted by default).
      fetchUsers(searchTerm, currentPage, pageSize, roleFilter, deletedScope);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không xoá được', description: err?.message ?? 'Vui lòng thử lại' });
    } finally {
      setIsDeleting(false);
    }
  };

  const router = useRouter();
  const openUserDetail = (id: string) => router.push(`/users/detail?id=${id}`);

  const handleOpenStats = async (user: User) => {
    setStatsTarget(user);
    setStats(null);
    setIsLoadingStats(true);
    try {
      const result = await adminGetUserReferralStats(user.id);
      setStats(result);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được', description: err.message });
      setStatsTarget(null);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleToggleLock = async (user: User) => {
    try {
      if (user.isLocked) {
        await unlockUser(user.id);
        toast({ title: 'Đã mở khóa', description: `${user.name} đã được mở khóa.` });
      } else {
        await lockUser(user.id);
        toast({ title: 'Đã khóa', description: `${user.name} đã bị khóa.` });
      }
      // Refresh user list
      fetchUsers(searchTerm, currentPage, pageSize, roleFilter, deletedScope);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: `Không thể ${user.isLocked ? 'mở khóa' : 'khóa'} người dùng`,
        description: err.message,
      });
    }
  }

  const handleRestore = async (user: User) => {
    try {
      await restoreUser(user.id);
      toast({ title: 'Đã khôi phục', description: `Tài khoản ${user.phone ?? user.name} đã được khôi phục.` });
      fetchUsers(searchTerm, currentPage, pageSize, roleFilter, deletedScope);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không khôi phục được', description: err?.message ?? 'Vui lòng thử lại' });
    }
  };


  const CreateAdminForm = ({ onClose }: { onClose: () => void }) => {
    const [fullName, setFullName] = React.useState('');
    const [phone, setPhone] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (phone.trim().length < 10) {
        toast({ variant: 'destructive', title: 'SĐT không hợp lệ', description: 'Số điện thoại tối thiểu 10 ký tự.' });
        return;
      }
      if (password.length < 6) {
        toast({ variant: 'destructive', title: 'Mật khẩu quá ngắn', description: 'Mật khẩu tối thiểu 6 ký tự.' });
        return;
      }
      setIsSubmitting(true);
      try {
        await createAdminUser({
          phone: phone.trim(),
          password,
          fullName: fullName.trim() || undefined,
          email: email.trim() || undefined,
        });
        toast({ title: 'Đã tạo tài khoản admin', description: fullName.trim() || phone.trim() });
        fetchUsers(searchTerm, currentPage, pageSize, roleFilter, deletedScope);
        onClose();
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Không tạo được tài khoản', description: err.message });
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Tạo tài khoản admin</DialogTitle>
            <DialogDescription>
              Tạo một tài khoản quản trị viên mới. Tài khoản đăng nhập bằng số điện thoại + mật khẩu.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="fullName">Họ tên</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Số điện thoại <span className="text-destructive">*</span></Label>
              <Input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0901234567" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Mật khẩu <span className="text-destructive">*</span></Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email (không bắt buộc)</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@vigogroup.vn" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Tạo admin
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3 flex-1">
          <Input
            placeholder="Tìm theo tên hoặc SĐT..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="max-w-sm"
          />
          <Select
            value={roleFilter}
            onValueChange={(val) => { setRoleFilter(val as typeof roleFilter); setCurrentPage(1); }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Loại tài khoản" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả</SelectItem>
              <SelectItem value="USER">Khách</SelectItem>
              <SelectItem value="TRANSPORT_COMPANY_OWNER">Chủ HTX</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={deletedScope}
            onValueChange={(val) => { setDeletedScope(val as typeof deletedScope); setCurrentPage(1); }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Đang hoạt động</SelectItem>
              <SelectItem value="deleted">Đã xoá</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setEditingUser(null); setIsFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Tạo admin
        </Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" onClick={() => requestSort('name')}>
                  Người dùng
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
               <TableHead>
                 <Button variant="ghost" onClick={() => requestSort('phone')}>
                  SĐT
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Hạng</TableHead>
              <TableHead className="text-right">Số dư</TableHead>
              <TableHead className="text-right">Đã rút</TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => requestSort('status')}>
                  Trạng thái
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => requestSort('createdAt')}>
                  Ngày tạo
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <span className="sr-only">Thao tác</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : sortedUsers.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                    Không tìm thấy người dùng.
                    </TableCell>
                </TableRow>
            ) : (
              sortedUsers.map((user) => (
              <TableRow
                key={user.id}
                className="cursor-pointer"
                onClick={() => openUserDetail(user.id)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={user.avatarUrl} alt={user.name} data-ai-hint="person portrait" />
                      <AvatarFallback>{user.name?.charAt(0) || '?'}</AvatarFallback>
                    </Avatar>
                    <div className="grid">
                      <span className="font-semibold">{user.name}</span>
                      <span className="text-sm text-muted-foreground">{user.email}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{user.phone}</TableCell>
                <TableCell>
                  {user.role === 'TRANSPORT_COMPANY_OWNER' ? (
                    <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 hover:bg-purple-100">
                      Chủ HTX
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Khách</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {(() => {
                    const tier = user.loyaltyTier ?? 'MEMBER';
                    const tierStyles: Record<string, { label: string; className: string }> = {
                      MEMBER: { label: 'Member', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
                      SILVER: { label: 'Silver', className: 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100' },
                      GOLD: { label: 'Gold', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
                      DIAMOND: { label: 'Diamond', className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300' },
                    };
                    const t = tierStyles[tier] ?? tierStyles.MEMBER;
                    return <Badge className={`${t.className} hover:${t.className}`}>{t.label}</Badge>;
                  })()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(user.currentBalance ?? 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(user.totalWithdrawn ?? 0)}
                </TableCell>
                <TableCell>
                   <Badge variant={user.status === 'Active' ? 'default' : 'secondary'} className={user.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400' : ''}>
                    {user.status === 'Active' ? 'Hoạt động' : 'Bị khóa'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                  </span>
                </TableCell>
                {/* Stop propagation so the action menu doesn't trigger the row's
                    detail-page navigation when clicked. */}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Mở menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Thao tác</DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => setTimeout(() => handleOpenStats(user), 0)}>
                        <Share2 className="mr-2 h-4 w-4" />
                        <span>Xem affiliate</span>
                      </DropdownMenuItem>
                      {user.deletedAt ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setTimeout(() => handleRestore(user), 0)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            <span>Khôi phục</span>
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <>
                          <DropdownMenuItem onSelect={() => setTimeout(() => handleToggleLock(user), 0)}>
                            {user.isLocked ? (
                              <>
                                <Unlock className="mr-2 h-4 w-4" />
                                <span>Mở khóa</span>
                              </>
                            ) : (
                              <>
                                <Lock className="mr-2 h-4 w-4" />
                                <span>Khóa</span>
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            onSelect={() => setTimeout(() => setPendingDelete(user), 0)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Xóa</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )))}
          </TableBody>
        </Table>
        {/* Pagination Controls */}
        <div className="flex items-center justify-between px-4 py-4 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Hiển thị</span>
            <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span>/ {totalItems} kết quả</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Trang {currentPage} / {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage <= 1 || isLoading}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage <= 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages || isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages || isLoading}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
      {isFormOpen && <CreateAdminForm onClose={handleCloseForm} />}

      {/* Affiliate stats viewer — same data the user sees in their mobile app, scoped by userId. */}
      <Dialog open={!!statsTarget} onOpenChange={(open) => { if (!open) { setStatsTarget(null); setStats(null); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Affiliate · {statsTarget?.name ?? statsTarget?.phone ?? '—'}</DialogTitle>
            <DialogDescription>
              Số dư & lịch sử giới thiệu của user này (giống màn hình khách thấy trên app).
            </DialogDescription>
          </DialogHeader>
          {isLoadingStats || !stats ? (
            <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-muted/50 rounded p-3">
                  <div className="text-muted-foreground text-xs">Mã giới thiệu</div>
                  <div className="font-mono font-bold tracking-wider mt-1">{stats.code}</div>
                </div>
                <div className="bg-muted/50 rounded p-3">
                  <div className="text-muted-foreground text-xs">Số người đã mời</div>
                  <div className="font-bold mt-1 text-lg">{stats.refereeCount}</div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded p-3 border border-blue-200 dark:border-blue-800">
                  <div className="text-muted-foreground text-xs">Số dư affiliate</div>
                  <div className="font-bold mt-1 text-lg text-blue-700 dark:text-blue-300">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(stats.balance)}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Người được giới thiệu</h3>
                {stats.referees.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">User này chưa giới thiệu được ai.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Người được mời</TableHead>
                        <TableHead className="text-right">Chuyến</TableHead>
                        <TableHead className="text-right">Tiền nhận</TableHead>
                        <TableHead>Bonus signup</TableHead>
                        <TableHead>Ngày mời</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.referees.map((r) => (
                        <TableRow key={r.refereeId}>
                          <TableCell>
                            <div className="font-medium">{r.refereeName ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">{r.refereePhone ?? r.refereeId.slice(0, 8)}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.tripCountUsed}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(r.tripRewardTotal)}
                          </TableCell>
                          <TableCell>
                            {r.signupRewardCredited
                              ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">Đã trả</Badge>
                              : <Badge variant="secondary">Chưa</Badge>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStatsTarget(null); setStats(null); }}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá tài khoản?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  <span className="font-medium">{pendingDelete.name || pendingDelete.phone}</span> ({pendingDelete.phone}) sẽ
                  chuyển trạng thái xoá (soft delete). Dữ liệu lịch sử vẫn giữ nguyên, user không đăng nhập được nữa.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
