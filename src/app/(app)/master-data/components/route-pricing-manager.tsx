'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getRoutes, getPricingByRoute, createPricing, updatePricing, deletePricing, getAdminUnits } from '@/lib/api';
import type { Route, RoutePricing, AdminUnit } from '@/lib/types';
import { Loader2, PlusCircle, Trash2, Edit, Star, MapPin, Info, Building2, Sparkles, X } from 'lucide-react';
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
import { MultiSelectComboBox } from '@/components/ui/multi-select-combobox';

const formatCurrency = (value: number | string) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value));

const SERVICE_TYPE_LABELS: Record<string, string> = {
    CARPOOL: 'Ghép xe',
    RIDE: 'Bao xe',
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
                                    <SelectItem value="CARPOOL">Ghép xe</SelectItem>
                                    <SelectItem value="RIDE">Bao xe</SelectItem>
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
                                                    <Badge variant={p.serviceType === 'RIDE' ? 'outline' : 'secondary'}>
                                                        {SERVICE_TYPE_LABELS[p.serviceType || 'CARPOOL'] || p.serviceType}
                                                    </Badge>
                                                    {p.serviceType === 'RIDE' && p.vehicleType && (
                                                        <Badge variant="outline">
                                                            {p.vehicleType === 'CAR_7' ? '7 chỗ' : '5 chỗ'}
                                                        </Badge>
                                                    )}
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
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <Badge variant={p.serviceType === 'RIDE' ? 'outline' : 'secondary'}>
                                                                {SERVICE_TYPE_LABELS[p.serviceType || 'CARPOOL'] || p.serviceType}
                                                            </Badge>
                                                            {p.serviceType === 'RIDE' && p.vehicleType && (
                                                                <Badge variant="outline">
                                                                    {p.vehicleType === 'CAR_7' ? '7 chỗ' : '5 chỗ'}
                                                                </Badge>
                                                            )}
                                                        </div>
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
    const [adminUnitIds, setAdminUnitIds] = React.useState<string[]>([]);
    const [startDistrictId, setStartDistrictId] = React.useState<number | undefined>(pricingItem?.startDistrictId);
    const [startDistrictIds, setStartDistrictIds] = React.useState<string[]>([]);
    const [price, setPrice] = React.useState<number | string>(pricingItem?.price || '');
    const [serviceType, setServiceType] = React.useState<string>(pricingItem?.serviceType || 'CARPOOL');
    // RIDE-only: 5-seater (CAR_4) vs 7-seater (CAR_7) carry different fares — backend validates
    // (CreatePricingDto). Default CAR_4 to keep edits one-click for the common case.
    const [vehicleType, setVehicleType] = React.useState<string>(pricingItem?.vehicleType || 'CAR_4');
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

    // IDs of inner-city districts among the route districts (name starts with "Quận ")
    const urbanDistrictIds = React.useMemo(() => {
        return routeDistricts
            .filter(d => /^qu[ậa]n\s/i.test(d.name.trim()))
            .map(d => String(d.id));
    }, [routeDistricts]);

    // IDs of all route districts (for "select all" end district button)
    const allDistrictIds = React.useMemo(() => routeDistricts.map(d => String(d.id)), [routeDistricts]);

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
            setAdminUnitIds([]);
            setStartDistrictId(undefined);
            setStartDistrictIds([]);
        }
    }, [pricingLevel, isEditing]);

    const handleSubmit = async () => {
        if (price === '' || Number(price) <= 0) {
            toast({ variant: 'destructive', title: 'Thiếu thông tin', description: 'Giá hợp lệ là bắt buộc.' });
            return;
        }

        // Edit mode & province mode: need single adminUnitId
        const needsSingleAdminUnit = isEditing || pricingLevel === 'province';
        if (needsSingleAdminUnit && !adminUnitId) {
            toast({ variant: 'destructive', title: 'Thiếu thông tin', description: 'Vui lòng chọn đơn vị hành chính.' });
            return;
        }

        // District creation mode: need at least one end district
        if (!isEditing && pricingLevel === 'district' && adminUnitIds.length === 0) {
            toast({ variant: 'destructive', title: 'Thiếu thông tin', description: 'Vui lòng chọn ít nhất một quận/huyện kết thúc.' });
            return;
        }

        // RIDE bookings need vehicleType (5 vs 7 seats have separate fares); other services don't.
        const effectiveVehicleType = serviceType === 'RIDE' ? vehicleType : undefined;

        setIsSaving(true);
        try {
            if (isEditing) {
                await updatePricing(pricingItem.id, {
                    price: Number(price),
                    serviceType,
                    vehicleType: effectiveVehicleType,
                });
                toast({ title: 'Thành công', description: 'Đã cập nhật quy tắc giá.' });
                onSave();
                return;
            }

            if (pricingLevel === 'province') {
                await createPricing({
                    routeId,
                    adminUnitId: adminUnitId!,
                    startDistrictId: null,
                    price: Number(price),
                    priority: 1,
                    serviceType,
                    vehicleType: effectiveVehicleType,
                });
                toast({ title: 'Thành công', description: 'Đã tạo giá mặc định tỉnh.' });
                onSave();
                return;
            }

            // District-level: cross product of start × end districts
            // empty startDistrictIds = single "all" entry (null)
            const startIds: (number | null)[] = startDistrictIds.length > 0
                ? startDistrictIds.map(v => Number(v))
                : [null];
            const endIds = adminUnitIds.map(v => Number(v));

            const pairs: { startId: number | null; endId: number }[] = [];
            for (const endId of endIds) {
                for (const startId of startIds) {
                    pairs.push({ startId, endId });
                }
            }

            const results = await Promise.allSettled(
                pairs.map(({ startId, endId }) => createPricing({
                    routeId,
                    adminUnitId: endId,
                    startDistrictId: startId,
                    price: Number(price),
                    priority: 1,
                    serviceType,
                    vehicleType: effectiveVehicleType,
                }))
            );

            const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
            const succeeded = results.length - failed.length;

            if (failed.length === 0) {
                toast({
                    title: 'Thành công',
                    description: pairs.length > 1
                        ? `Đã tạo ${succeeded} quy tắc giá riêng huyện.`
                        : 'Đã tạo giá riêng huyện.',
                });
                onSave();
            } else if (succeeded === 0) {
                throw new Error(failed[0].reason?.message || 'Không tạo được quy tắc giá nào.');
            } else {
                toast({
                    variant: 'destructive',
                    title: `Tạo được ${succeeded}/${results.length} quy tắc`,
                    description: failed[0].reason?.message || 'Một số quy tắc không tạo được.',
                });
                onSave();
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: `Không thể ${isEditing ? 'cập nhật' : 'tạo'} quy tắc giá`, description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-lg max-h-[90dvh] flex flex-col gap-0 p-0">
            <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
                <DialogTitle>{isEditing ? 'Sửa' : 'Tạo'} quy tắc giá</DialogTitle>
                <DialogDescription>
                    {isEditing
                        ? `Cập nhật giá cho ${pricingItem.adminUnit?.name}.`
                        : 'Thêm quy tắc giá mới cho tuyến đường đã chọn.'}
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1">
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
                            <Label>
                                Quận/huyện bắt đầu{' '}
                                <span className="text-muted-foreground font-normal">
                                    {isEditing ? '(Không bắt buộc)' : '(Có thể chọn nhiều — để trống = Tất cả)'}
                                </span>
                            </Label>
                            {isEditing ? (
                                <Combobox
                                    options={startDistrictOptions}
                                    selectedValue={startDistrictId ? String(startDistrictId) : undefined}
                                    onSelect={(value) => setStartDistrictId(value ? Number(value) : undefined)}
                                    placeholder="Chọn quận/huyện bắt đầu (Tất cả)..."
                                    searchPlaceholder="Tìm quận/huyện..."
                                    noResultsText="Không tìm thấy quận/huyện."
                                    disabled
                                />
                            ) : (
                                <>
                                    <MultiSelectComboBox
                                        options={startDistrictOptions}
                                        selectedValues={startDistrictIds}
                                        onSelectedValuesChange={setStartDistrictIds}
                                        placeholder="Chọn quận/huyện bắt đầu (Tất cả)..."
                                        searchPlaceholder="Tìm quận/huyện..."
                                        noResultsText="Không tìm thấy quận/huyện."
                                    />
                                    {urbanDistrictIds.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setStartDistrictIds(urbanDistrictIds)}
                                                className="group inline-flex items-center gap-2 rounded-full border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-3.5 py-1.5 text-xs font-medium text-blue-700 shadow-sm transition-all hover:border-blue-300 hover:from-blue-100 hover:to-indigo-100 hover:shadow active:scale-[0.98] dark:border-blue-800 dark:from-blue-950/40 dark:to-indigo-950/40 dark:text-blue-300 dark:hover:border-blue-700"
                                            >
                                                <Building2 className="h-3.5 w-3.5" />
                                                <span>Chọn các quận nội thành</span>
                                                <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-blue-500">
                                                    {urbanDistrictIds.length}
                                                </span>
                                                <Sparkles className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" />
                                            </button>
                                            {startDistrictIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setStartDistrictIds([])}
                                                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                >
                                                    <X className="h-3 w-3" />
                                                    Bỏ chọn
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>
                                Quận/huyện kết thúc{' '}
                                {!isEditing && (
                                    <span className="text-muted-foreground font-normal">(Có thể chọn nhiều)</span>
                                )}
                            </Label>
                            {isEditing ? (
                                <Combobox
                                    options={districtOptions}
                                    selectedValue={adminUnitId ? String(adminUnitId) : undefined}
                                    onSelect={(value) => setAdminUnitId(value ? Number(value) : undefined)}
                                    placeholder="Chọn quận/huyện kết thúc..."
                                    searchPlaceholder="Tìm quận/huyện..."
                                    noResultsText="Không tìm thấy quận/huyện."
                                    disabled
                                />
                            ) : (
                                <>
                                    <MultiSelectComboBox
                                        options={districtOptions}
                                        selectedValues={adminUnitIds}
                                        onSelectedValuesChange={setAdminUnitIds}
                                        placeholder="Chọn quận/huyện kết thúc..."
                                        searchPlaceholder="Tìm quận/huyện..."
                                        noResultsText="Không tìm thấy quận/huyện."
                                    />
                                    {allDistrictIds.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setAdminUnitIds(allDistrictIds)}
                                                className="group inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-3.5 py-1.5 text-xs font-medium text-emerald-700 shadow-sm transition-all hover:border-emerald-300 hover:from-emerald-100 hover:to-teal-100 hover:shadow active:scale-[0.98] dark:border-emerald-800 dark:from-emerald-950/40 dark:to-teal-950/40 dark:text-emerald-300 dark:hover:border-emerald-700"
                                            >
                                                <MapPin className="h-3.5 w-3.5" />
                                                <span>Chọn tất cả</span>
                                                <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-emerald-500">
                                                    {allDistrictIds.length}
                                                </span>
                                            </button>
                                            {adminUnitIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setAdminUnitIds([])}
                                                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                >
                                                    <X className="h-3 w-3" />
                                                    Bỏ chọn
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        {!isEditing && adminUnitIds.length > 0 && (() => {
                            const startCount = startDistrictIds.length > 0 ? startDistrictIds.length : 1;
                            const total = startCount * adminUnitIds.length;
                            if (total <= 1) return null;
                            return (
                                <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-300">
                                    Sẽ tạo <span className="font-semibold">{total}</span> quy tắc giá
                                    {' '}({startCount} huyện bắt đầu × {adminUnitIds.length} huyện kết thúc).
                                </div>
                            );
                        })()}
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
                            <SelectItem value="CARPOOL">Ghép xe</SelectItem>
                            <SelectItem value="RIDE">Bao xe</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Vehicle Type — RIDE only. Each route normally needs both rows (CAR_4 + CAR_7). */}
                {serviceType === 'RIDE' && (
                    <div className="space-y-2">
                        <Label>Loại xe</Label>
                        <Select value={vehicleType} onValueChange={setVehicleType}>
                            <SelectTrigger>
                                <SelectValue placeholder="Chọn loại xe" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="CAR_4">Xe 5 chỗ (CAR_4)</SelectItem>
                                <SelectItem value="CAR_7">Xe 7 chỗ (CAR_7)</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Bao xe tách giá theo loại xe. Mỗi tuyến nên có 2 quy tắc — một cho xe 5 chỗ và một cho xe 7 chỗ.
                        </p>
                    </div>
                )}

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
            <DialogFooter className="px-6 py-4 border-t bg-background shrink-0 sm:space-x-2">
                <Button variant="outline" onClick={onCancel}>Hủy</Button>
                <Button onClick={handleSubmit} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Lưu
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
