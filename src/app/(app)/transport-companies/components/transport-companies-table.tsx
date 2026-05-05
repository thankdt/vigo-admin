'use client';

import * as React from 'react';
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
import { Button } from '@/components/ui/button';
import {
  MoreHorizontal,
  ArrowUpDown,
  Loader2,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pencil,
  Trash2,
  Building2,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  getTransportCompanies,
  createTransportCompany,
  updateTransportCompany,
  deleteTransportCompany,
  assignTransportCompanyOwner,
} from '@/lib/api';
import type { TransportCompany } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

type FormData = {
  name: string;
  ownerName: string;
  ownerPhone: string;
  isActive: boolean;
};

const emptyForm: FormData = {
  name: '',
  ownerName: '',
  ownerPhone: '',
  isActive: true,
};

export function TransportCompaniesTable() {
  const [companies, setCompanies] = React.useState<TransportCompany[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = React.useState('');
  const [sortConfig, setSortConfig] = React.useState<{ key: keyof TransportCompany; direction: 'ascending' | 'descending' } | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);

  // Form dialog
  const [formOpen, setFormOpen] = React.useState(false);
  const [formData, setFormData] = React.useState<FormData>(emptyForm);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = React.useState<TransportCompany | null>(null);

  // Assign-owner dialog — admin links a User account to this TC so the owner can sign into
  // htx.vigogroup.vn. Existing phone → upgraded to TRANSPORT_COMPANY_OWNER + password reset.
  const [assignTarget, setAssignTarget] = React.useState<TransportCompany | null>(null);
  const [assignForm, setAssignForm] = React.useState({ phone: '', password: '', fullName: '' });
  const [isAssigning, setIsAssigning] = React.useState(false);

  const fetchCompanies = React.useCallback(async (search: string, page: number, limit: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getTransportCompanies({ search, page, limit });
      setCompanies(response.data);
      const meta = (response as any).meta;
      const total = meta?.total ?? 0;
      const apiLimit = meta?.limit ?? limit;
      setTotalItems(total);
      setTotalPages(Math.max(1, Math.ceil(total / apiLimit)));
    } catch (err: any) {
      setError(err.message);
      toast({
        variant: 'destructive',
        title: 'Không thể tải danh sách đơn vị vận tải',
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchCompanies(searchTerm, currentPage, pageSize);
    }, 500);
    return () => clearTimeout(timer);
  }, [fetchCompanies, searchTerm, currentPage, pageSize]);

  const sortedCompanies = React.useMemo(() => {
    let sortable = [...companies];
    if (sortConfig !== null) {
      sortable.sort((a, b) => {
        const aVal = a[sortConfig.key] as any;
        const bVal = b[sortConfig.key] as any;
        if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortable;
  }, [companies, sortConfig]);

  const requestSort = (key: keyof TransportCompany) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const openCreateForm = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setFormOpen(true);
  };

  const openEditForm = (company: TransportCompany) => {
    setEditingId(company.id);
    setFormData({
      name: company.name,
      ownerName: company.ownerName || '',
      ownerPhone: company.ownerPhone || '',
      isActive: company.isActive,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Tên đơn vị vận tải là bắt buộc.' });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        ownerName: formData.ownerName.trim() || undefined,
        ownerPhone: formData.ownerPhone.trim() || undefined,
        isActive: formData.isActive,
      };

      if (editingId) {
        await updateTransportCompany(editingId, payload);
        toast({ title: 'Đã cập nhật', description: `Đơn vị "${formData.name}" đã được cập nhật.` });
      } else {
        await createTransportCompany(payload);
        toast({ title: 'Đã tạo', description: `Đơn vị "${formData.name}" đã được tạo.` });
      }
      setFormOpen(false);
      fetchCompanies(searchTerm, currentPage, pageSize);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTransportCompany(deleteTarget.id);
      toast({ title: 'Đã xoá', description: `Đơn vị "${deleteTarget.name}" đã được vô hiệu hoá.` });
      setDeleteTarget(null);
      fetchCompanies(searchTerm, currentPage, pageSize);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lỗi', description: err.message });
    }
  };

  const openAssignOwner = (company: TransportCompany) => {
    // Pre-fill name/phone from existing freeform fields so admin doesn't retype if the row was
    // first created via the legacy "ownerName/ownerPhone" form.
    setAssignTarget(company);
    setAssignForm({
      phone: company.ownerPhone || '',
      password: '',
      fullName: company.ownerName || '',
    });
  };

  const handleAssignOwner = async () => {
    if (!assignTarget) return;
    if (!assignForm.phone.trim() || !/^\d{8,15}$/.test(assignForm.phone.trim())) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Số điện thoại phải là 8-15 chữ số.' });
      return;
    }
    if (!assignForm.password || assignForm.password.length < 6) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Mật khẩu phải tối thiểu 6 ký tự.' });
      return;
    }
    setIsAssigning(true);
    try {
      await assignTransportCompanyOwner(assignTarget.id, {
        phone: assignForm.phone.trim(),
        password: assignForm.password,
        fullName: assignForm.fullName.trim() || undefined,
      });
      toast({
        title: 'Đã gán chủ HTX',
        description: `Chủ HTX có thể đăng nhập htx.vigogroup.vn bằng SĐT ${assignForm.phone.trim()}.`,
      });
      setAssignTarget(null);
      setAssignForm({ phone: '', password: '', fullName: '' });
      fetchCompanies(searchTerm, currentPage, pageSize);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không gán được', description: err.message });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between pb-4">
        <Input
          placeholder="Tìm theo tên, chủ HTX, SĐT..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          className="max-w-sm"
        />
        <Button onClick={openCreateForm}>
          <Plus className="mr-2 h-4 w-4" />
          Thêm đơn vị
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" onClick={() => requestSort('name')}>
                  Tên đơn vị
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Chủ đơn vị</TableHead>
              <TableHead>SĐT chủ</TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => requestSort('driverCount' as keyof TransportCompany)}>
                  Số tài xế
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Trạng thái</TableHead>
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
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : sortedCompanies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                    <span className="text-muted-foreground">Chưa có đơn vị vận tải nào.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sortedCompanies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-semibold">{company.name}</TableCell>
                  <TableCell>{company.ownerName || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>{company.ownerPhone || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{company.driverCount ?? 0}</Badge>
                  </TableCell>
                  <TableCell>
                    {company.isActive ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">Hoạt động</Badge>
                    ) : (
                      <Badge variant="destructive">Ngừng hoạt động</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {company.createdAt
                        ? new Date(company.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : 'N/A'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Mở menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Thao tác</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => setTimeout(() => openEditForm(company), 0)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Chỉnh sửa
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setTimeout(() => openAssignOwner(company), 0)}>
                          <KeyRound className="mr-2 h-4 w-4" />
                          {company.ownerUserId ? 'Đặt lại tài khoản chủ' : 'Gán chủ HTX'}
                          {company.ownerUserId && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-green-600" />}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setTimeout(() => setDeleteTarget(company), 0)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Xoá
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
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
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage <= 1 || isLoading}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage <= 1 || isLoading}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage >= totalPages || isLoading}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages || isLoading}>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) setFormOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Chỉnh sửa đơn vị vận tải' : 'Thêm đơn vị vận tải mới'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="company-name">
                Tên đơn vị <span className="text-destructive">*</span>
              </Label>
              <Input
                id="company-name"
                placeholder="VD: HTX Vận tải Đông Anh"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="owner-name">Tên chủ đơn vị</Label>
              <Input
                id="owner-name"
                placeholder="VD: Nguyễn Văn A"
                value={formData.ownerName}
                onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="owner-phone">SĐT chủ đơn vị</Label>
              <Input
                id="owner-phone"
                placeholder="VD: 0912345678"
                value={formData.ownerPhone}
                onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
              />
            </div>
            {editingId && (
              <div className="flex items-center justify-between">
                <Label htmlFor="is-active">Trạng thái hoạt động</Label>
                <Switch
                  id="is-active"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={isSaving}>
              Huỷ
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? 'Cập nhật' : 'Tạo mới'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign-owner dialog — admin links a User account so the owner can sign into htx.vigogroup.vn */}
      <Dialog open={!!assignTarget} onOpenChange={(open) => { if (!open && !isAssigning) setAssignTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {assignTarget?.ownerUserId ? 'Đặt lại tài khoản chủ HTX' : 'Gán chủ HTX'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              Tạo / cập nhật tài khoản đăng nhập cho chủ HTX <span className="font-medium text-foreground">{assignTarget?.name}</span>.
              Chủ HTX dùng SĐT + mật khẩu này để đăng nhập tại <span className="font-mono text-xs">htx.vigogroup.vn</span>.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="assign-phone">
                Số điện thoại <span className="text-destructive">*</span>
              </Label>
              <Input
                id="assign-phone"
                placeholder="VD: 0912345678"
                value={assignForm.phone}
                onChange={(e) => setAssignForm({ ...assignForm, phone: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Nếu SĐT đã tồn tại trong hệ thống, tài khoản sẽ được nâng cấp thành chủ HTX và đặt lại mật khẩu.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assign-fullname">Họ tên</Label>
              <Input
                id="assign-fullname"
                placeholder="VD: Nguyễn Văn A"
                value={assignForm.fullName}
                onChange={(e) => setAssignForm({ ...assignForm, fullName: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="assign-password">
                Mật khẩu <span className="text-destructive">*</span>
              </Label>
              <Input
                id="assign-password"
                type="password"
                placeholder="Tối thiểu 6 ký tự"
                value={assignForm.password}
                onChange={(e) => setAssignForm({ ...assignForm, password: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={isAssigning}>
              Huỷ
            </Button>
            <Button onClick={handleAssignOwner} disabled={isAssigning}>
              {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {assignTarget?.ownerUserId ? 'Cập nhật' : 'Gán chủ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xoá</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn vô hiệu hoá đơn vị &ldquo;{deleteTarget?.name}&rdquo;? Đơn vị sẽ không bị xoá khỏi hệ thống mà chỉ chuyển sang trạng thái ngừng hoạt động.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
