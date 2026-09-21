'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
import { Loader2, PlusCircle, Trash2, Edit, Search, MapPin, Check, AlertCircle } from 'lucide-react';
import {
  getAreaPriceAdjustments,
  createAreaPriceAdjustment,
  updateAreaPriceAdjustment,
  deleteAreaPriceAdjustment,
  getAdminUnits,
} from '@/lib/api';
import type { AreaPriceAdjustment, AdminUnit } from '@/lib/types';
import { Combobox } from '@/components/ui/combobox';

const formatCurrency = (value: number) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)}`;
};

const SERVICE_LABELS: Record<string, string> = {
  ALL: 'Tất cả dịch vụ',
  CARPOOL: 'Xe ghép (Carpool)',
  RIDE: 'Bao xe (Ride)',
};

export function AreaPriceAdjustmentsManager() {
  const [adjustments, setAdjustments] = React.useState<AreaPriceAdjustment[]>([]);
  const [adminUnits, setAdminUnits] = React.useState<AdminUnit[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [serviceFilter, setServiceFilter] = React.useState<string>('ALL');
  const [searchTerm, setSearchTerm] = React.useState<string>('');
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<AreaPriceAdjustment | null>(null);
  const [deletingItem, setDeletingItem] = React.useState<AreaPriceAdjustment | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Form fields
  const [formAdminUnitId, setFormAdminUnitId] = React.useState<number | null>(null);
  const [formServiceType, setFormServiceType] = React.useState<string>('ALL');
  const [formDeltaAmount, setFormDeltaAmount] = React.useState<number>(0);
  const [formApplyPerSeat, setFormApplyPerSeat] = React.useState<boolean>(true);
  const [formIsActive, setFormIsActive] = React.useState<boolean>(true);
  const [formNote, setFormNote] = React.useState<string>('');

  const { toast } = useToast();

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [adjList, units] = await Promise.all([
        getAreaPriceAdjustments(serviceFilter === 'ALL' ? undefined : serviceFilter),
        getAdminUnits(),
      ]);
      setAdjustments(adjList || []);
      setAdminUnits(units || []);
    } catch (err: any) {
      toast({
        title: 'Lỗi tải dữ liệu',
        description: err?.message || 'Không thể tải danh sách điều chỉnh giá',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [serviceFilter, toast]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredAdjustments = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return adjustments.filter((a) => {
      const name = (a.adminUnit?.name || '').toLowerCase();
      const note = (a.note || '').toLowerCase();
      return !term || name.includes(term) || note.includes(term);
    });
  }, [adjustments, searchTerm]);

  const adminUnitOptions = React.useMemo(() => {
    return adminUnits.map((u) => ({
      value: String(u.id),
      label: `${u.name} (${u.level === 'PROVINCE' ? 'Tỉnh' : u.level === 'DISTRICT' ? 'Huyện' : 'Xã/POI'})`,
    }));
  }, [adminUnits]);

  const openCreateDialog = () => {
    setEditingItem(null);
    setFormAdminUnitId(null);
    setFormServiceType('ALL');
    setFormDeltaAmount(0);
    setFormApplyPerSeat(true);
    setFormIsActive(true);
    setFormNote('');
    setIsFormOpen(true);
  };

  const openEditDialog = (item: AreaPriceAdjustment) => {
    setEditingItem(item);
    setFormAdminUnitId(item.adminUnitId);
    setFormServiceType(item.serviceType || 'ALL');
    setFormDeltaAmount(item.deltaAmount || 0);
    setFormApplyPerSeat(item.applyPerSeat !== false);
    setFormIsActive(item.isActive !== false);
    setFormNote(item.note || '');
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formAdminUnitId) {
      toast({
        title: 'Thiếu thông tin',
        description: 'Vui lòng chọn địa bàn (Tỉnh / Huyện)',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingItem) {
        await updateAreaPriceAdjustment(editingItem.id, {
          adminUnitId: formAdminUnitId,
          serviceType: formServiceType,
          deltaAmount: formDeltaAmount,
          applyPerSeat: formApplyPerSeat,
          isActive: formIsActive,
          note: formNote || null,
        });
        toast({ title: 'Thành công', description: 'Đã cập nhật cấu hình điều chỉnh giá' });
      } else {
        await createAreaPriceAdjustment({
          adminUnitId: formAdminUnitId,
          serviceType: formServiceType,
          deltaAmount: formDeltaAmount,
          applyPerSeat: formApplyPerSeat,
          isActive: formIsActive,
          note: formNote || null,
        });
        toast({ title: 'Thành công', description: 'Đã tạo cấu hình điều chỉnh giá mới' });
      }
      setIsFormOpen(false);
      loadData();
    } catch (err: any) {
      toast({
        title: 'Thao tác thất bại',
        description: err?.message || 'Có lỗi xảy ra khi lưu cấu hình',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setIsSubmitting(true);
    try {
      await deleteAreaPriceAdjustment(deletingItem.id);
      toast({ title: 'Thành công', description: 'Đã xóa cấu hình điều chỉnh giá' });
      setDeletingItem(null);
      loadData();
    } catch (err: any) {
      toast({
        title: 'Xóa thất bại',
        description: err?.message || 'Có lỗi xảy ra khi xóa',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Cấu hình Điều chỉnh giá theo Khu vực (Tỉnh / Huyện)
              </CardTitle>
              <CardDescription className="mt-1">
                Tăng hoặc giảm phụ phí (±Δ) trên nền giá km chuẩn cho từng địa bàn. Cấp <strong>Huyện</strong> sẽ tự động <strong>ghi đè</strong> cấp Tỉnh.
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog} className="shrink-0 gap-2">
              <PlusCircle className="h-4 w-4" /> Thêm điều chỉnh mới
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4 items-center justify-between">
            <div className="flex items-center gap-2 w-full sm:w-80">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm theo tên tỉnh/huyện..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Label className="text-sm whitespace-nowrap text-muted-foreground">Loại dịch vụ:</Label>
              <Select value={serviceFilter} onValueChange={setServiceFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Lọc dịch vụ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả dịch vụ</SelectItem>
                  <SelectItem value="CARPOOL">Xe ghép (Carpool)</SelectItem>
                  <SelectItem value="RIDE">Bao xe (Ride)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center items-center text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Đang tải danh sách điều chỉnh giá...
            </div>
          ) : filteredAdjustments.length === 0 ? (
            <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Chưa có cấu hình điều chỉnh giá nào phù hợp.</p>
              <p className="text-xs mt-1">Bấm "Thêm điều chỉnh mới" để thiết lập mức chênh lệch giá cho Tỉnh hoặc Huyện.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Địa bàn áp dụng</TableHead>
                    <TableHead>Cấp</TableHead>
                    <TableHead>Dịch vụ</TableHead>
                    <TableHead className="text-right">Mức điều chỉnh (±Δ)</TableHead>
                    <TableHead>Cách tính</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead className="text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdjustments.map((item) => {
                    const isPositive = (item.deltaAmount || 0) > 0;
                    const isZero = (item.deltaAmount || 0) === 0;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-semibold text-foreground">
                          {item.adminUnit?.name || `ID #${item.adminUnitId}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.adminUnit?.level === 'DISTRICT' ? 'default' : 'secondary'}>
                            {item.adminUnit?.level === 'DISTRICT' ? 'Huyện' : item.adminUnit?.level === 'PROVINCE' ? 'Tỉnh' : 'Khác'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">
                            {SERVICE_LABELS[item.serviceType] || item.serviceType || 'Tất cả'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          <span
                            className={
                              isZero
                                ? 'text-muted-foreground'
                                : isPositive
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {formatCurrency(item.deltaAmount || 0)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {item.serviceType === 'CARPOOL' || item.serviceType === 'ALL'
                              ? item.applyPerSeat
                                ? 'Nhân theo số ghế'
                                : 'Trọn gói / chuyến'
                              : 'Trọn gói (Bao xe)'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.isActive ? 'outline' : 'destructive'} className="text-xs">
                            {item.isActive ? 'Hoạt động' : 'Tạm tắt'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={item.note || ''}>
                          {item.note || '—'}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeletingItem(item)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Thêm / Sửa */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Sửa Cấu hình Điều chỉnh giá' : 'Thêm Cấu hình Điều chỉnh giá mới'}</DialogTitle>
            <DialogDescription>
              Cấu hình tăng/giảm giá trên giá km chuẩn. Cấp Huyện có độ ưu tiên cao hơn cấp Tỉnh.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="admin-unit">Địa bàn (Tỉnh / Huyện) *</Label>
              <Combobox
                options={adminUnitOptions}
                value={formAdminUnitId ? String(formAdminUnitId) : ''}
                onSelect={(val) => setFormAdminUnitId(val ? Number(val) : null)}
                placeholder="Chọn hoặc gõ tìm Tỉnh / Huyện..."
                emptyText="Không tìm thấy địa bàn"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Loại dịch vụ áp dụng</Label>
              <Select value={formServiceType} onValueChange={setFormServiceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả dịch vụ (Cả Ghép và Bao xe)</SelectItem>
                  <SelectItem value="CARPOOL">Chỉ Xe ghép (Carpool)</SelectItem>
                  <SelectItem value="RIDE">Chỉ Bao xe (Ride)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="delta-amount">Mức điều chỉnh (VNĐ) *</Label>
              <Input
                id="delta-amount"
                type="number"
                step="1000"
                value={formDeltaAmount}
                onChange={(e) => setFormDeltaAmount(Number(e.target.value))}
                placeholder="Ví dụ: 30000 (tăng) hoặc -20000 (giảm)"
              />
              <p className="text-xs text-muted-foreground">
                Nhập số dương để <strong>tăng giá/phụ thu</strong> (VD: 30000); nhập số âm để <strong>giảm giá</strong> (VD: -20000).
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <Checkbox
                id="apply-per-seat"
                checked={formApplyPerSeat}
                onCheckedChange={(c) => setFormApplyPerSeat(!!c)}
              />
              <Label htmlFor="apply-per-seat" className="text-sm cursor-pointer">
                Nhân theo số lượng ghế (Xe ghép)
              </Label>
            </div>
            <p className="text-xs text-muted-foreground pl-6 -mt-2">
              Nếu bật, phụ phí sẽ nhân với số ghế khách đặt (ví dụ: +30k/ghế, khách đặt 2 ghế là +60k). Bao xe luôn tính trọn gói 1 lần.
            </p>

            <div className="flex items-center space-x-2 pt-1">
              <Checkbox
                id="is-active"
                checked={formIsActive}
                onCheckedChange={(c) => setFormIsActive(!!c)}
              />
              <Label htmlFor="is-active" className="text-sm cursor-pointer">
                Kích hoạt cấu hình này
              </Label>
            </div>

            <div className="space-y-1.5 pt-1">
              <Label htmlFor="note">Ghi chú (Tùy chọn)</Label>
              <Input
                id="note"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Ví dụ: Hiệp Hòa đường khó, Bắc Ninh giờ cao điểm..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>
              Hủy
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingItem ? 'Lưu thay đổi' : 'Tạo mới'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Xác nhận Xóa */}
      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa cấu hình?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa cấu hình điều chỉnh giá cho địa bàn{' '}
              <strong>{deletingItem?.adminUnit?.name || `ID #${deletingItem?.adminUnitId}`}</strong>? Sau khi xóa, giá các chuyến đi thuộc địa bàn này sẽ trở về giá km chuẩn gốc.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Xác nhận xóa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
