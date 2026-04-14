'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getRoutes, getPricingByRoute, createPricing, updatePricing, deletePricing, getAdminUnits } from '@/lib/api';
import type { Route, RoutePricing, AdminUnit } from '@/lib/types';
import { Loader2, PlusCircle, Trash2, Edit, Star, MapPin, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Combobox } from '@/components/ui/combobox';

const formatCurrency = (value: number | string) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value));

const SERVICE_TYPE_LABELS: Record<string, string> = {
    DELIVERY: 'Giao hàng',
    CARPOOL: 'Ghép xe',
    RIDE: 'Đặt xe',
};

export function RoutePricingManager() {
    const [routes, setRoutes] = React.useState<Route[]>([]);
    const [allAdminUnits, setAllAdminUnits] = React.useState<AdminUnit[]>([]);
    const [selectedRouteId, setSelectedRouteId] = React.useState<number | null>(null);
    const [pricing, setPricing] = React.useState<RoutePricing[]>([]);
    const [serviceTypeFilter, setServiceTypeFilter] = React.useState<string>('');
    const [isLoading, setIsLoading] = React.useState(true);
    const [isPricingLoading, setIsPricingLoading] = React.useState(false);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [editingPricing, setEditingPricing] = React.useState<RoutePricing | null>(null);
    const [deletingPricing, setDeletingPricing] = React.useState<RoutePricing | null>(null);
    const [defaultFormLevel, setDefaultFormLevel] = React.useState<'province' | 'district'>('district');
    const { toast } = useToast();

    const selectedRoute = React.useMemo(() => routes.find(r => r.id === selectedRouteId), [routes, selectedRouteId]);

    // Derived: split pricing into province-level vs district-level
    const provincePricing = React.useMemo(() =>
        pricing.filter(p => p.adminUnit?.level === 'PROVINCE'), [pricing]);
    const districtPricing = React.useMemo(() =>
        pricing.filter(p => p.adminUnit?.level === 'DISTRICT'), [pricing]);

    const fetchInitialData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const [routesData, unitsData] = await Promise.all([getRoutes(), getAdminUnits()]);
            setRoutes(routesData);
            setAllAdminUnits(unitsData);
            if (routesData.length > 0) {
                setSelectedRouteId(routesData[0].id);
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể tải dữ liệu ban đầu', description: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    const fetchPricing = React.useCallback(async () => {
        if (!selectedRouteId) return;
        setIsPricingLoading(true);
        try {
            const filterValue = serviceTypeFilter && serviceTypeFilter !== 'ALL' ? serviceTypeFilter : undefined;
            const pricingData = await getPricingByRoute(selectedRouteId, filterValue);
            setPricing(pricingData);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể tải bảng giá', description: err.message });
            setPricing([]);
        } finally {
            setIsPricingLoading(false);
        }
    }, [selectedRouteId, serviceTypeFilter, toast]);

    React.useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    React.useEffect(() => {
        fetchPricing();
    }, [fetchPricing]);

    const routeOptions = React.useMemo(() => routes.map(r => ({
        value: String(r.id),
        label: r.name,
    })), [routes]);

    const handleOpenForm = (pricingItem: RoutePricing | null, level: 'province' | 'district' = 'district') => {
        setDefaultFormLevel(level);
        setEditingPricing(pricingItem);
        setIsFormOpen(true);
    };

    const handleSave = () => {
        setIsFormOpen(false);
        setEditingPricing(null);
        fetchPricing();
    };

    const handleDeleteConfirm = async () => {
        if (!deletingPricing) return;
        try {
            await deletePricing(deletingPricing.id);
            toast({ title: 'Thành công', description: 'Đã xóa quy tắc giá.' });
            fetchPricing();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể xóa quy tắc giá', description: err.message });
        } finally {
            setDeletingPricing(null);
        }
    };

    // Find provinces related to the selected route (from its districts' parentIds)
    const routeProvinceNames = React.useMemo(() => {
        if (!selectedRoute?.districts) return [];
        const provinceIds = new Set<number>();
        selectedRoute.districts.forEach(d => {
            if (d.parentId) provinceIds.add(d.parentId);
        });
        return allAdminUnits
            .filter(u => u.level === 'PROVINCE' && provinceIds.has(u.id))
            .map(u => u.name);
    }, [selectedRoute, allAdminUnits]);

    // Districts that don't have a specific pricing override
    const unconfiguredDistricts = React.useMemo(() => {
        if (!selectedRoute?.districts) return [];
        const configuredDistrictIds = new Set(districtPricing.map(p => p.adminUnitId));
        return selectedRoute.districts.filter(d => !configuredDistrictIds.has(d.id));
    }, [selectedRoute, districtPricing]);

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Quản lý bảng giá tuyến đường</CardTitle>
                    <CardDescription>Cấu hình giá mặc định tỉnh và ghi đè cho từng huyện cụ thể.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Filters */}
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center space-x-2">
                            <Label htmlFor="route-select" className="shrink-0">Tuyến đường:</Label>
                            <Combobox
                                options={routeOptions}
                                selectedValue={selectedRouteId ? String(selectedRouteId) : ""}
                                onSelect={(value) => setSelectedRouteId(value ? Number(value) : null)}
                                placeholder="Chọn tuyến đường..."
                                searchPlaceholder="Tìm tuyến đường..."
                                noResultsText="Không tìm thấy tuyến đường."
                                className="w-[350px]"
                                disabled={isLoading}
                            />
                        </div>
                        <div className="flex items-center space-x-2">
                            <Label className="shrink-0">Loại dịch vụ:</Label>
                            <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
                                <SelectTrigger className="w-[160px]">
                                    <SelectValue placeholder="Tất cả" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">Tất cả</SelectItem>
                                    <SelectItem value="DELIVERY">Giao hàng</SelectItem>
                                    <SelectItem value="CARPOOL">Ghép xe</SelectItem>
                                    <SelectItem value="RIDE">Đặt xe</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {isPricingLoading ? (
                        <div className="h-48 flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <>
                            {/* ===== SECTION 1: PROVINCE DEFAULT PRICING ===== */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                                        <h3 className="text-base font-semibold">Giá mặc định toàn tỉnh</h3>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenForm(null, 'province')}
                                        disabled={!selectedRouteId}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Thêm giá tỉnh
                                    </Button>
                                </div>

                                {provincePricing.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-center">
                                        <p className="text-sm text-muted-foreground">
                                            Chưa có giá mặc định tỉnh. Tất cả huyện sẽ sử dụng giá tính theo km.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {provincePricing.map(p => (
                                            <div
                                                key={p.id}
                                                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20 px-4 py-3"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
                                                        {p.adminUnit?.name || 'N/A'}
                                                    </Badge>
                                                    <span className="text-lg font-semibold">{formatCurrency(p.price)}</span>
                                                    <Badge variant={p.serviceType === 'CARPOOL' ? 'secondary' : p.serviceType === 'RIDE' ? 'outline' : 'default'}>
                                                        {SERVICE_TYPE_LABELS[p.serviceType || 'DELIVERY'] || p.serviceType}
                                                    </Badge>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenForm(p, 'province')}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeletingPricing(p)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ===== SECTION 2: DISTRICT OVERRIDE PRICING ===== */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-5 w-5 text-blue-500" />
                                        <h3 className="text-base font-semibold">Giá riêng theo huyện</h3>
                                        <span className="text-xs text-muted-foreground">(ghi đè giá tỉnh)</span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenForm(null, 'district')}
                                        disabled={!selectedRouteId}
                                    >
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Thêm giá huyện
                                    </Button>
                                </div>

                                {districtPricing.length === 0 ? (
                                    <div className="rounded-lg border border-dashed p-6 text-center">
                                        <p className="text-sm text-muted-foreground">
                                            Chưa có giá riêng cho huyện nào. Tất cả huyện sẽ dùng giá tỉnh mặc định (nếu có).
                                        </p>
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Quận/huyện bắt đầu</TableHead>
                                                <TableHead>Quận/huyện kết thúc</TableHead>
                                                <TableHead>Loại dịch vụ</TableHead>
                                                <TableHead>Giá</TableHead>
                                                <TableHead className="text-right">Thao tác</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {districtPricing.map(p => (
                                                <TableRow key={p.id}>
                                                    <TableCell className="font-medium">
                                                        {p.startDistrict ? p.startDistrict.name : <span className="text-muted-foreground italic">Tất cả</span>}
                                                    </TableCell>
                                                    <TableCell className="font-medium">{p.adminUnit?.name || 'N/A'}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={p.serviceType === 'CARPOOL' ? 'secondary' : p.serviceType === 'RIDE' ? 'outline' : 'default'}>
                                                            {SERVICE_TYPE_LABELS[p.serviceType || 'DELIVERY'] || p.serviceType}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>{formatCurrency(p.price)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="icon" onClick={() => handleOpenForm(p, 'district')}>
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeletingPricing(p)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </div>

                            {/* ===== INFO FOOTER ===== */}
                            {provincePricing.length > 0 && unconfiguredDistricts.length > 0 && (
                                <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                                    <p>
                                        <span className="font-medium">Huyện kế thừa giá tỉnh:</span>{' '}
                                        {unconfiguredDistricts.map(d => d.name).join(', ')}
                                        {' '}— sẽ tự động dùng giá mặc định tỉnh.
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* ===== PRICING FORM DIALOG ===== */}
            <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditingPricing(null); } else { setIsFormOpen(true); } }}>
                {selectedRouteId && (
                    <PricingForm
                        key={editingPricing?.id ?? `new-${defaultFormLevel}`}
                        routeId={selectedRouteId}
                        allAdminUnits={allAdminUnits}
                        routeDistricts={selectedRoute?.districts || []}
                        pricingItem={editingPricing}
                        defaultLevel={defaultFormLevel}
                        onSave={handleSave}
                        onCancel={() => { setIsFormOpen(false); setEditingPricing(null); }}
                    />
                )}
            </Dialog>

            {/* ===== DELETE CONFIRMATION ===== */}
            <AlertDialog open={!!deletingPricing} onOpenChange={() => setDeletingPricing(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Bạn có chắc chắn không?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Quy tắc giá cho &quot;{deletingPricing?.adminUnit?.name}&quot; sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive hover:bg-destructive/90">Xóa</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function PricingForm({
    routeId,
    allAdminUnits,
    routeDistricts,
    pricingItem,
    defaultLevel,
    onSave,
    onCancel,
}: {
    routeId: number;
    allAdminUnits: AdminUnit[];
    routeDistricts: AdminUnit[];
    pricingItem: RoutePricing | null;
    defaultLevel: 'province' | 'district';
    onSave: () => void;
    onCancel: () => void;
}) {
    const isEditing = !!pricingItem;
    const { toast } = useToast();

    // Determine initial level from existing item or default
    const initialLevel = isEditing
        ? (pricingItem.adminUnit?.level === 'PROVINCE' ? 'province' : 'district')
        : defaultLevel;

    const [pricingLevel, setPricingLevel] = React.useState<'province' | 'district'>(initialLevel);
    const [adminUnitId, setAdminUnitId] = React.useState<number | undefined>(pricingItem?.adminUnitId);
    const [startDistrictId, setStartDistrictId] = React.useState<number | undefined>(pricingItem?.startDistrictId);
    const [price, setPrice] = React.useState<number | string>(pricingItem?.price || '');
    const [serviceType, setServiceType] = React.useState<string>(pricingItem?.serviceType || 'DELIVERY');
    const [isSaving, setIsSaving] = React.useState(false);

    // Province options: all provinces from admin units
    const provinceOptions = React.useMemo(() => {
        // Get province IDs that are parents of route districts
        const routeProvinceIds = new Set<number>();
        routeDistricts.forEach(d => {
            if (d.parentId) routeProvinceIds.add(d.parentId);
        });
        return allAdminUnits
            .filter(u => u.level === 'PROVINCE' && routeProvinceIds.has(u.id))
            .map(u => ({ value: String(u.id), label: u.name }));
    }, [allAdminUnits, routeDistricts]);

    // District options: districts belonging to the route, grouped by parent province
    const districtOptions = React.useMemo(() => {
        const groups: Record<string, { value: string; label: string }[]> = {};
        const others: { value: string; label: string }[] = [];

        routeDistricts.forEach(d => {
            const option = { value: String(d.id), label: d.name };
            if (d.parent && d.parent.name) {
                const groupName = d.parent.name;
                if (!groups[groupName]) {
                    groups[groupName] = [];
                }
                groups[groupName].push(option);
            } else {
                // Try to find parent name from allAdminUnits
                const parent = d.parentId ? allAdminUnits.find(u => u.id === d.parentId) : null;
                if (parent) {
                    if (!groups[parent.name]) {
                        groups[parent.name] = [];
                    }
                    groups[parent.name].push(option);
                } else {
                    others.push(option);
                }
            }
        });

        const groupedOptions = Object.keys(groups).map(groupName => ({
            label: groupName,
            options: groups[groupName],
        }));

        if (others.length > 0) {
            groupedOptions.push({ label: 'Khác', options: others });
        }

        if (groupedOptions.length === 0 && routeDistricts.length > 0) {
            return routeDistricts.map(d => ({ value: String(d.id), label: d.name }));
        }

        return groupedOptions;
    }, [routeDistricts, allAdminUnits]);

    // Start district options: all districts from the route (for exact match pricing)
    const startDistrictOptions = React.useMemo(() => {
        const groups: Record<string, { value: string; label: string }[]> = {};
        const others: { value: string; label: string }[] = [];

        routeDistricts.forEach(d => {
            const option = { value: String(d.id), label: d.name };
            const parent = d.parent || (d.parentId ? allAdminUnits.find(u => u.id === d.parentId) : null);
            if (parent && 'name' in parent) {
                const groupName = parent.name;
                if (!groups[groupName]) {
                    groups[groupName] = [];
                }
                groups[groupName].push(option);
            } else {
                others.push(option);
            }
        });

        const groupedOptions = Object.keys(groups).map(groupName => ({
            label: groupName,
            options: groups[groupName],
        }));

        if (others.length > 0) {
            groupedOptions.push({ label: 'Khác', options: others });
        }

        return groupedOptions;
    }, [routeDistricts, allAdminUnits]);

    // Reset adminUnitId when switching levels
    React.useEffect(() => {
        if (!isEditing) {
            setAdminUnitId(undefined);
            setStartDistrictId(undefined);
        }
    }, [pricingLevel, isEditing]);

    const handleSubmit = async () => {
        if (!adminUnitId || price === '' || Number(price) <= 0) {
            toast({ variant: 'destructive', title: 'Thiếu thông tin', description: 'Đơn vị hành chính và giá hợp lệ là bắt buộc.' });
            return;
        }

        setIsSaving(true);
        try {
            if (isEditing) {
                await updatePricing(pricingItem.id, { price: Number(price), serviceType });
                toast({ title: 'Thành công', description: 'Đã cập nhật quy tắc giá.' });
            } else {
                await createPricing({
                    routeId,
                    adminUnitId,
                    startDistrictId: pricingLevel === 'district' ? (startDistrictId || null) : null,
                    price: Number(price),
                    priority: 1,
                    serviceType,
                });
                toast({ title: 'Thành công', description: `Đã tạo giá ${pricingLevel === 'province' ? 'mặc định tỉnh' : 'riêng huyện'}.` });
            }
            onSave();
        } catch (err: any) {
            toast({ variant: 'destructive', title: `Không thể ${isEditing ? 'cập nhật' : 'tạo'} quy tắc giá`, description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>{isEditing ? 'Sửa' : 'Tạo'} quy tắc giá</DialogTitle>
                <DialogDescription>
                    {isEditing
                        ? `Cập nhật giá cho ${pricingItem.adminUnit?.name}.`
                        : 'Thêm quy tắc giá mới cho tuyến đường đã chọn.'}
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                {/* Pricing Level Radio */}
                {!isEditing && (
                    <div className="space-y-2">
                        <Label>Cấp giá</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setPricingLevel('province')}
                                className={`flex items-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                                    pricingLevel === 'province'
                                        ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
                                        : 'border-muted hover:border-muted-foreground/30'
                                }`}
                            >
                                <Star className={`h-4 w-4 ${pricingLevel === 'province' ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground'}`} />
                                Giá mặc định tỉnh
                            </button>
                            <button
                                type="button"
                                onClick={() => setPricingLevel('district')}
                                className={`flex items-center gap-2 rounded-lg border-2 p-3 text-sm font-medium transition-colors ${
                                    pricingLevel === 'district'
                                        ? 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-300'
                                        : 'border-muted hover:border-muted-foreground/30'
                                }`}
                            >
                                <MapPin className={`h-4 w-4 ${pricingLevel === 'district' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                                Giá riêng huyện
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {pricingLevel === 'province'
                                ? 'Áp dụng cho tất cả huyện trong tỉnh chưa có giá riêng.'
                                : 'Ghi đè giá tỉnh cho huyện cụ thể.'}
                        </p>
                    </div>
                )}

                {/* Admin Unit Selection */}
                {pricingLevel === 'province' ? (
                    <div className="space-y-2">
                        <Label>Tỉnh/Thành phố</Label>
                        <Combobox
                            options={provinceOptions}
                            selectedValue={adminUnitId ? String(adminUnitId) : undefined}
                            onSelect={(value) => setAdminUnitId(value ? Number(value) : undefined)}
                            placeholder="Chọn tỉnh/thành phố..."
                            searchPlaceholder="Tìm tỉnh/thành phố..."
                            noResultsText="Không tìm thấy."
                            disabled={isEditing}
                        />
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <Label>Quận/huyện bắt đầu <span className="text-muted-foreground font-normal">(Không bắt buộc)</span></Label>
                            <Combobox
                                options={startDistrictOptions}
                                selectedValue={startDistrictId ? String(startDistrictId) : undefined}
                                onSelect={(value) => setStartDistrictId(value ? Number(value) : undefined)}
                                placeholder="Chọn quận/huyện bắt đầu (Tất cả)..."
                                searchPlaceholder="Tìm quận/huyện..."
                                noResultsText="Không tìm thấy quận/huyện."
                                disabled={isEditing}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Quận/huyện kết thúc</Label>
                            <Combobox
                                options={districtOptions}
                                selectedValue={adminUnitId ? String(adminUnitId) : undefined}
                                onSelect={(value) => setAdminUnitId(value ? Number(value) : undefined)}
                                placeholder="Chọn quận/huyện kết thúc..."
                                searchPlaceholder="Tìm quận/huyện..."
                                noResultsText="Không tìm thấy quận/huyện."
                                disabled={isEditing}
                            />
                        </div>
                    </>
                )}

                {/* Service Type */}
                <div className="space-y-2">
                    <Label>Loại dịch vụ</Label>
                    <Select value={serviceType} onValueChange={setServiceType} disabled={isEditing}>
                        <SelectTrigger>
                            <SelectValue placeholder="Chọn loại dịch vụ" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="DELIVERY">Giao hàng</SelectItem>
                            <SelectItem value="CARPOOL">Ghép xe</SelectItem>
                            <SelectItem value="RIDE">Đặt xe</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Price */}
                <div className="space-y-2">
                    <Label htmlFor="price-input">Giá (VNĐ)</Label>
                    <Input
                        id="price-input"
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="e.g., 300000"
                    />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onCancel}>Hủy</Button>
                <Button onClick={handleSubmit} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Lưu
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
