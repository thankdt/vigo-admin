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
import {
  Loader2,
  PlusCircle,
  Trash2,
  Edit,
  Search,
  MapPin,
  Building2,
  Check,
  AlertCircle,
  ChevronDown,
  Info,
  X,
} from 'lucide-react';
import {
  getAreaPriceAdjustments,
  createAreaPriceAdjustment,
  updateAreaPriceAdjustment,
  deleteAreaPriceAdjustment,
  getAdminUnits,
} from '@/lib/api';
import type { AreaPriceAdjustment, AdminUnit } from '@/lib/types';
import { cn } from '@/lib/utils';

function stripVietnamese(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

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
  const [levelFilter, setLevelFilter] = React.useState<string>('ALL');
  const [provinceFilter, setProvinceFilter] = React.useState<string>('ALL');
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

  // Hierarchical selector states
  const [selectedProvinceId, setSelectedProvinceId] = React.useState<number | null>(null);
  const [selectedScope, setSelectedScope] = React.useState<'PROVINCE' | 'DISTRICT'>('PROVINCE');
  const [selectedDistrictId, setSelectedDistrictId] = React.useState<number | null>(null);

  // Popover / dropdown states
  const [quickSearch, setQuickSearch] = React.useState<string>('');
  const [provinceSearch, setProvinceSearch] = React.useState<string>('');
  const [districtSearch, setDistrictSearch] = React.useState<string>('');
  const [isProvinceOpen, setIsProvinceOpen] = React.useState(false);
  const [isDistrictOpen, setIsDistrictOpen] = React.useState(false);

  const provinceDropdownRef = React.useRef<HTMLDivElement>(null);
  const districtDropdownRef = React.useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  // Close dropdowns on click outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (provinceDropdownRef.current && !provinceDropdownRef.current.contains(event.target as Node)) {
        setIsProvinceOpen(false);
      }
      if (districtDropdownRef.current && !districtDropdownRef.current.contains(event.target as Node)) {
        setIsDistrictOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Unit lookup mappings
  const unitMap = React.useMemo(() => {
    const map = new Map<number, AdminUnit>();
    for (const u of adminUnits) {
      map.set(u.id, u);
    }
    return map;
  }, [adminUnits]);

  // List of provinces sorted alphabetically
  const provinces = React.useMemo(() => {
    return adminUnits
      .filter((u) => u.level === 'PROVINCE')
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [adminUnits]);

  // Districts grouped by parent province id
  const districtsByProvince = React.useMemo(() => {
    const map = new Map<number, AdminUnit[]>();
    for (const u of adminUnits) {
      if (u.level === 'DISTRICT' && u.parentId) {
        const list = map.get(u.parentId) || [];
        list.push(u);
        map.set(u.parentId, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }
    return map;
  }, [adminUnits]);

  // Districts belonging to the currently selected province
  const districtsOfSelectedProvince = React.useMemo(() => {
    if (!selectedProvinceId) return [];
    return districtsByProvince.get(selectedProvinceId) || [];
  }, [selectedProvinceId, districtsByProvince]);

  // Filtered provinces in dropdown by search
  const filteredProvinces = React.useMemo(() => {
    const term = stripVietnamese(provinceSearch);
    if (!term) return provinces;
    return provinces.filter((p) => stripVietnamese(p.name).includes(term));
  }, [provinces, provinceSearch]);

  // Filtered districts in dropdown by search
  const filteredDistricts = React.useMemo(() => {
    const term = stripVietnamese(districtSearch);
    if (!term) return districtsOfSelectedProvince;
    return districtsOfSelectedProvince.filter((d) => stripVietnamese(d.name).includes(term));
  }, [districtsOfSelectedProvince, districtSearch]);

  // Quick search results across all provinces & districts
  const quickSearchResults = React.useMemo(() => {
    const term = stripVietnamese(quickSearch);
    if (!term || term.length < 2) return [];

    const results: Array<{ id: number; name: string; level: string; parentId?: number; parentName?: string }> = [];

    // Search in provinces
    for (const p of provinces) {
      if (stripVietnamese(p.name).includes(term)) {
        results.push({
          id: p.id,
          name: p.name,
          level: 'PROVINCE',
        });
      }
      if (results.length >= 15) break;
    }

    // Search in districts
    for (const u of adminUnits) {
      if (u.level === 'DISTRICT' && stripVietnamese(u.name).includes(term)) {
        const parent = u.parentId ? unitMap.get(u.parentId) : undefined;
        results.push({
          id: u.id,
          name: u.name,
          level: 'DISTRICT',
          parentId: u.parentId,
          parentName: parent?.name,
        });
      }
      if (results.length >= 25) break;
    }

    return results;
  }, [quickSearch, provinces, adminUnits, unitMap]);

  // Filtered adjustments for main table
  const filteredAdjustments = React.useMemo(() => {
    const term = stripVietnamese(searchTerm);
    return adjustments.filter((a) => {
      const unit = a.adminUnit || (a.adminUnitId ? unitMap.get(a.adminUnitId) : undefined);
      const unitName = unit?.name || '';
      const note = a.note || '';
      const parentUnit = unit?.parentId ? unitMap.get(unit.parentId) : undefined;
      const parentName = parentUnit?.name || '';

      // Search match
      if (term) {
        const matchName = stripVietnamese(unitName).includes(term);
        const matchNote = stripVietnamese(note).includes(term);
        const matchParent = stripVietnamese(parentName).includes(term);
        if (!matchName && !matchNote && !matchParent) return false;
      }

      // Level filter
      if (levelFilter !== 'ALL') {
        if (unit?.level !== levelFilter) return false;
      }

      // Province filter
      if (provinceFilter !== 'ALL') {
        const pId = Number(provinceFilter);
        if (unit?.level === 'PROVINCE' && unit.id !== pId) return false;
        if (unit?.level === 'DISTRICT' && unit.parentId !== pId) return false;
      }

      return true;
    });
  }, [adjustments, searchTerm, levelFilter, provinceFilter, unitMap]);

  // Handle picking a province
  const handleSelectProvince = (provinceId: number) => {
    setSelectedProvinceId(provinceId);
    setProvinceSearch('');
    setIsProvinceOpen(false);

    if (selectedScope === 'PROVINCE') {
      setFormAdminUnitId(provinceId);
    } else {
      setSelectedDistrictId(null);
      setFormAdminUnitId(null);
      setDistrictSearch('');
      setIsDistrictOpen(true);
    }
  };

  // Handle scope change (Province vs District)
  const handleSelectScope = (scope: 'PROVINCE' | 'DISTRICT') => {
    setSelectedScope(scope);
    if (scope === 'PROVINCE') {
      setFormAdminUnitId(selectedProvinceId);
      setSelectedDistrictId(null);
    } else {
      setFormAdminUnitId(selectedDistrictId);
      if (!selectedDistrictId && selectedProvinceId) {
        setIsDistrictOpen(true);
      }
    }
  };

  // Handle picking a district
  const handleSelectDistrict = (districtId: number) => {
    setSelectedDistrictId(districtId);
    setFormAdminUnitId(districtId);
    setDistrictSearch('');
    setIsDistrictOpen(false);
  };

  // Handle quick search pick
  const handlePickQuickSearch = (item: { id: number; name: string; level: string; parentId?: number }) => {
    if (item.level === 'PROVINCE') {
      setSelectedProvinceId(item.id);
      setSelectedScope('PROVINCE');
      setSelectedDistrictId(null);
      setFormAdminUnitId(item.id);
    } else if (item.level === 'DISTRICT') {
      if (item.parentId) {
        setSelectedProvinceId(item.parentId);
      }
      setSelectedScope('DISTRICT');
      setSelectedDistrictId(item.id);
      setFormAdminUnitId(item.id);
    }
    setQuickSearch('');
  };

  const openCreateDialog = () => {
    setEditingItem(null);
    setFormAdminUnitId(null);
    setSelectedProvinceId(null);
    setSelectedScope('PROVINCE');
    setSelectedDistrictId(null);
    setQuickSearch('');
    setProvinceSearch('');
    setDistrictSearch('');
    setIsProvinceOpen(false);
    setIsDistrictOpen(false);

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
    setQuickSearch('');
    setProvinceSearch('');
    setDistrictSearch('');
    setIsProvinceOpen(false);
    setIsDistrictOpen(false);

    const unit = item.adminUnit || unitMap.get(item.adminUnitId);
    if (unit?.level === 'PROVINCE') {
      setSelectedProvinceId(unit.id);
      setSelectedScope('PROVINCE');
      setSelectedDistrictId(null);
    } else if (unit?.level === 'DISTRICT') {
      setSelectedProvinceId(unit.parentId || null);
      setSelectedScope('DISTRICT');
      setSelectedDistrictId(unit.id);
    } else {
      setSelectedProvinceId(null);
      setSelectedScope('PROVINCE');
      setSelectedDistrictId(null);
    }

    setFormServiceType(item.serviceType || 'ALL');
    setFormDeltaAmount(Number(item.deltaAmount) || 0);
    setFormApplyPerSeat(item.applyPerSeat !== false);
    setFormIsActive(item.isActive !== false);
    setFormNote(item.note || '');
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formAdminUnitId) {
      toast({
        title: 'Thiếu thông tin địa bàn',
        description: selectedScope === 'DISTRICT'
          ? 'Vui lòng chọn Quận / Huyện cụ thể'
          : 'Vui lòng chọn Tỉnh / Thành phố áp dụng',
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

  // Selected unit details for summary preview in dialog
  const currentSelectedUnit = formAdminUnitId ? unitMap.get(formAdminUnitId) : null;
  const currentSelectedProvince = selectedProvinceId ? unitMap.get(selectedProvinceId) : null;
  const currentSelectedDistrict = selectedDistrictId ? unitMap.get(selectedDistrictId) : null;

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
          {/* Bộ lọc thanh công cụ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4 items-center">
            {/* Tìm kiếm text */}
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm tên tỉnh, huyện, ghi chú..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Lọc theo Tỉnh */}
            <div className="flex items-center gap-1.5">
              <Select value={provinceFilter} onValueChange={setProvinceFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Lọc theo Tỉnh" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="ALL">Tất cả các Tỉnh</SelectItem>
                  {provinces.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lọc theo Cấp */}
            <div className="flex items-center gap-1.5">
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Lọc theo Cấp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả cấp (Tỉnh & Huyện)</SelectItem>
                  <SelectItem value="PROVINCE">Chỉ cấp Tỉnh</SelectItem>
                  <SelectItem value="DISTRICT">Chỉ cấp Huyện</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Lọc theo Dịch vụ */}
            <div className="flex items-center gap-1.5">
              <Select value={serviceFilter} onValueChange={setServiceFilter}>
                <SelectTrigger className="h-9 text-xs">
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
              <p>Chưa có cấu hình điều chỉnh giá nào phù hợp với bộ lọc.</p>
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
                    const unit = item.adminUnit || (item.adminUnitId ? unitMap.get(item.adminUnitId) : undefined);
                    const isDistrict = unit?.level === 'DISTRICT';
                    const parentUnit = unit?.parentId ? unitMap.get(unit.parentId) : undefined;
                    const isPositive = (Number(item.deltaAmount) || 0) > 0;
                    const isZero = (Number(item.deltaAmount) || 0) === 0;

                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            {isDistrict ? (
                              <MapPin className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                            ) : (
                              <Building2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                            )}
                            <div>
                              <div className="font-semibold text-foreground text-sm">
                                {unit?.name || `ID #${item.adminUnitId}`}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {isDistrict
                                  ? `Thuộc ${parentUnit?.name || 'Tỉnh'}`
                                  : 'Toàn bộ tỉnh'}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isDistrict ? 'default' : 'secondary'}
                            className={cn(
                              'text-xs font-normal',
                              isDistrict
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-100'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 hover:bg-blue-100'
                            )}
                          >
                            {isDistrict ? 'Cấp Huyện' : 'Cấp Tỉnh'}
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
                            {formatCurrency(Number(item.deltaAmount) || 0)}
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
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={item.note || ''}>
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
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {editingItem ? 'Sửa Cấu hình Điều chỉnh giá' : 'Thêm Cấu hình Điều chỉnh giá mới'}
            </DialogTitle>
            <DialogDescription>
              Cấu hình tăng hoặc giảm phụ phí trên giá km chuẩn. Cấp Huyện tự động ghi đè cấp Tỉnh.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Ô TÌM KIẾM NHANH TỈNH HOẶC HUYỆN */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5 text-primary" /> Tìm kiếm nhanh Tỉnh hoặc Huyện
                </span>
                <span className="text-[11px] font-normal text-muted-foreground">Gõ để lọc ngay</span>
              </Label>
              <div className="relative">
                <Input
                  placeholder="Gõ tên tỉnh hoặc huyện (VD: Hiệp Hòa, Yên Phong, Bắc Ninh, Hà Nam...)"
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  className="h-9 text-sm pr-8"
                />
                {quickSearch && (
                  <button
                    type="button"
                    onClick={() => setQuickSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}

                {/* Kết quả tìm nhanh */}
                {quickSearch.trim().length >= 2 && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-popover border rounded-md shadow-xl z-50 p-1 divide-y divide-border/60">
                    {quickSearchResults.length === 0 ? (
                      <div className="p-3 text-xs text-center text-muted-foreground">
                        Không tìm thấy địa bàn nào khớp với từ khóa "{quickSearch}"
                      </div>
                    ) : (
                      quickSearchResults.map((res) => (
                        <button
                          key={`${res.level}-${res.id}`}
                          type="button"
                          onClick={() => handlePickQuickSearch(res)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-accent rounded flex items-center justify-between transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {res.level === 'PROVINCE' ? (
                              <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
                            ) : (
                              <MapPin className="h-4 w-4 text-emerald-500 shrink-0" />
                            )}
                            <div>
                              <span className="font-semibold text-foreground">{res.name}</span>
                              {res.parentName && (
                                <span className="text-muted-foreground ml-1 font-normal">
                                  · Thuộc {res.parentName}
                                </span>
                              )}
                            </div>
                          </div>
                          <Badge
                            variant={res.level === 'DISTRICT' ? 'default' : 'secondary'}
                            className={cn(
                              'text-[10px] px-1.5 py-0 font-normal',
                              res.level === 'DISTRICT'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            )}
                          >
                            {res.level === 'DISTRICT' ? 'Huyện' : 'Tỉnh'}
                          </Badge>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* BỘ CHỌN PHÂN CẤP TỈNH -> HUYỆN */}
            <div className="rounded-lg border bg-muted/20 p-3.5 space-y-3.5">
              {/* Tầng 1: Chọn Tỉnh / Thành phố */}
              <div className="space-y-1.5" ref={provinceDropdownRef}>
                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span className="flex h-5 w-5 rounded-full bg-primary text-primary-foreground items-center justify-center text-[10px] font-bold">
                    1
                  </span>
                  Chọn Tỉnh / Thành phố *
                </Label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsProvinceOpen(!isProvinceOpen);
                      setIsDistrictOpen(false);
                    }}
                    className={cn(
                      'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors text-left',
                      !selectedProvinceId && 'text-muted-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate font-medium text-foreground">
                        {currentSelectedProvince ? currentSelectedProvince.name : '— Bấm để chọn Tỉnh / Thành phố —'}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                  </button>

                  {/* Dropdown danh sách Tỉnh có tìm kiếm */}
                  {isProvinceOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-hidden flex flex-col bg-popover border rounded-md shadow-2xl z-50">
                      <div className="p-2 border-b bg-muted/30">
                        <div className="relative">
                          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            autoFocus
                            placeholder="Gõ tìm Tỉnh (VD: Bắc Giang, Hà Nội...)"
                            value={provinceSearch}
                            onChange={(e) => setProvinceSearch(e.target.value)}
                            className="h-8 text-xs pl-7"
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto max-h-52 p-1">
                        {filteredProvinces.length === 0 ? (
                          <div className="p-3 text-xs text-center text-muted-foreground">
                            Không tìm thấy Tỉnh nào khớp "{provinceSearch}"
                          </div>
                        ) : (
                          filteredProvinces.map((p) => {
                            const isSelected = selectedProvinceId === p.id;
                            const dCount = (districtsByProvince.get(p.id) || []).length;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleSelectProvince(p.id)}
                                className={cn(
                                  'w-full text-left px-3 py-2 text-xs rounded flex items-center justify-between hover:bg-accent transition-colors',
                                  isSelected && 'bg-primary/10 font-semibold text-primary'
                                )}
                              >
                                <span className="flex items-center gap-2">
                                  {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                                  {p.name}
                                </span>
                                {dCount > 0 && (
                                  <span className="text-[10px] text-muted-foreground font-normal">
                                    {dCount} quận/huyện
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tầng 2: Cấp áp dụng (Toàn tỉnh vs Quận/Huyện) */}
              {selectedProvinceId && (
                <div className="space-y-3 pt-2 border-t border-border/60">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span className="flex h-5 w-5 rounded-full bg-primary text-primary-foreground items-center justify-center text-[10px] font-bold">
                        2
                      </span>
                      Phạm vi áp dụng tại {currentSelectedProvince?.name} *
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectScope('PROVINCE')}
                        className={cn(
                          'flex flex-col items-start p-2.5 rounded-md border text-left text-xs transition-all',
                          selectedScope === 'PROVINCE'
                            ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary font-semibold'
                            : 'border-border bg-background hover:bg-accent text-muted-foreground'
                        )}
                      >
                        <span className="flex items-center gap-1.5 text-foreground">
                          <Building2 className="h-4 w-4 text-primary" />
                          Toàn bộ Tỉnh
                        </span>
                        <span className="text-[11px] text-muted-foreground mt-1 font-normal leading-tight">
                          Áp dụng chung cho tất cả chuyến đón/trả tại {currentSelectedProvince?.name}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectScope('DISTRICT')}
                        className={cn(
                          'flex flex-col items-start p-2.5 rounded-md border text-left text-xs transition-all',
                          selectedScope === 'DISTRICT'
                            ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary font-semibold'
                            : 'border-border bg-background hover:bg-accent text-muted-foreground'
                        )}
                      >
                        <span className="flex items-center gap-1.5 text-foreground">
                          <MapPin className="h-4 w-4 text-primary" />
                          Theo Quận / Huyện
                        </span>
                        <span className="text-[11px] text-muted-foreground mt-1 font-normal leading-tight">
                          Chọn huyện cụ thể (tự động ghi đè giá của Tỉnh)
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Tầng 2.1: Chọn Huyện cụ thể nếu scope === 'DISTRICT' */}
                  {selectedScope === 'DISTRICT' && (
                    <div className="space-y-1.5 pt-1" ref={districtDropdownRef}>
                      <Label className="text-xs font-bold text-foreground flex items-center justify-between">
                        <span>Chọn Quận / Huyện cụ thể ({districtsOfSelectedProvince.length} huyện) *</span>
                        <span className="text-[10px] text-muted-foreground font-normal">Gõ tìm để lọc</span>
                      </Label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setIsDistrictOpen(!isDistrictOpen);
                            setIsProvinceOpen(false);
                          }}
                          className={cn(
                            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors text-left',
                            !selectedDistrictId && 'text-muted-foreground'
                          )}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span className="truncate font-medium text-foreground">
                              {currentSelectedDistrict ? currentSelectedDistrict.name : '— Bấm để chọn Quận / Huyện —'}
                            </span>
                          </div>
                          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                        </button>

                        {/* Dropdown danh sách Huyện có tìm kiếm */}
                        {isDistrictOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-hidden flex flex-col bg-popover border rounded-md shadow-2xl z-50">
                            <div className="p-2 border-b bg-muted/30">
                              <div className="relative">
                                <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  autoFocus
                                  placeholder="Gõ tìm Huyện (VD: Hiệp Hòa, Việt Yên...)"
                                  value={districtSearch}
                                  onChange={(e) => setDistrictSearch(e.target.value)}
                                  className="h-8 text-xs pl-7"
                                />
                              </div>
                            </div>
                            <div className="overflow-y-auto max-h-52 p-1">
                              {filteredDistricts.length === 0 ? (
                                <div className="p-3 text-xs text-center text-muted-foreground">
                                  Không tìm thấy Huyện nào khớp "{districtSearch}"
                                </div>
                              ) : (
                                filteredDistricts.map((d) => {
                                  const isSelected = selectedDistrictId === d.id;
                                  return (
                                    <button
                                      key={d.id}
                                      type="button"
                                      onClick={() => handleSelectDistrict(d.id)}
                                      className={cn(
                                        'w-full text-left px-3 py-2 text-xs rounded flex items-center justify-between hover:bg-accent transition-colors',
                                        isSelected && 'bg-primary/10 font-semibold text-primary'
                                      )}
                                    >
                                      <span className="flex items-center gap-2">
                                        {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                                        {d.name}
                                      </span>
                                      <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">
                                        Huyện
                                      </Badge>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Banner tóm tắt địa bàn đã chọn */}
            {currentSelectedUnit ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/30 p-3 text-xs flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                    Địa bàn áp dụng: {currentSelectedUnit.name}
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"
                    >
                      {currentSelectedUnit.level === 'DISTRICT' ? 'Cấp Huyện' : 'Cấp Tỉnh'}
                    </Badge>
                  </div>
                  <div className="text-emerald-700 dark:text-emerald-400 text-[11px] mt-0.5">
                    {currentSelectedUnit.level === 'DISTRICT'
                      ? `Thuộc ${currentSelectedProvince?.name || 'Tỉnh'}. Cấu hình này sẽ tự động GHI ĐÈ mức giá của Tỉnh.`
                      : `Áp dụng chung cho toàn tỉnh ${currentSelectedUnit.name} (các huyện chưa có cấu hình riêng sẽ thừa hưởng mức này).`}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-2.5 text-xs text-center text-muted-foreground flex items-center justify-center gap-1.5">
                <Info className="h-3.5 w-3.5" /> Vui lòng chọn Tỉnh và cấp áp dụng ở trên
              </div>
            )}

            {/* Dịch vụ áp dụng */}
            <div className="space-y-1.5">
              <Label>Loại dịch vụ áp dụng</Label>
              <Select value={formServiceType} onValueChange={setFormServiceType}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả dịch vụ (Cả Ghép và Bao xe)</SelectItem>
                  <SelectItem value="CARPOOL">Chỉ Xe ghép (Carpool)</SelectItem>
                  <SelectItem value="RIDE">Chỉ Bao xe (Ride)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Mức điều chỉnh */}
            <div className="space-y-1.5">
              <Label htmlFor="delta-amount">Mức điều chỉnh (VNĐ) *</Label>
              <Input
                id="delta-amount"
                type="number"
                step="1000"
                value={formDeltaAmount}
                onChange={(e) => setFormDeltaAmount(Number(e.target.value))}
                placeholder="Ví dụ: 30000 (tăng) hoặc -20000 (giảm)"
                className="h-9 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Nhập số dương để <strong>tăng giá/phụ thu</strong> (VD: 30000); nhập số âm để <strong>giảm giá</strong> (VD: -20000).
              </p>
            </div>

            {/* Checkbox nhân theo ghế */}
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

            {/* Checkbox kích hoạt */}
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

            {/* Ghi chú */}
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="note">Ghi chú (Tùy chọn)</Label>
              <Input
                id="note"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Ví dụ: Hiệp Hòa đường khó, Bắc Giang giờ cao điểm..."
                className="h-9 text-sm"
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
