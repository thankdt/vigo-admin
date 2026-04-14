'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getRoutes, createRoute, getAdminUnits, updateRoute, deleteRoute, getPresignedUrl, uploadToS3 } from '@/lib/api';
import type { Route, AdminUnit } from '@/lib/types';
import { Loader2, PlusCircle, MoreHorizontal, Edit, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from "@/components/ui/alert-dialog"
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Combobox } from '@/components/ui/combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';

export function RoutesManager() {
    const [routes, setRoutes] = React.useState<Route[]>([]);
    const [adminUnits, setAdminUnits] = React.useState<AdminUnit[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [editingRoute, setEditingRoute] = React.useState<Route | null>(null);
    const [deletingRoute, setDeletingRoute] = React.useState<Route | null>(null);
    const [currentPage, setCurrentPage] = React.useState(1);
    const itemsPerPage = 50;
    const { toast } = useToast();

    const fetchData = React.useCallback(async () => {
        // We do NOT set setIsLoading(true) here to avoid wiping the table content during refresh.
        // This keeps the DOM nodes (triggers) alive, preventing Radix UI focus issues and "UI Freeze".
        try {
            const [routesData, unitsData] = await Promise.all([getRoutes(), getAdminUnits()]);
            setRoutes(routesData);
            setAdminUnits(unitsData);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể tải dữ liệu', description: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenForm = (route: Route | null) => {
        setEditingRoute(route);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setEditingRoute(null);
        setIsFormOpen(false);
    };

    const handleSaveSuccess = () => {
        handleCloseForm();
        fetchData();
    };

    const handleDeleteConfirm = async () => {
        if (!deletingRoute) return;
        try {
            await deleteRoute(deletingRoute.id);
            toast({ title: 'Thành công', description: 'Đã xóa tuyến đường.' });
            setDeletingRoute(null);
            fetchData();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể xóa tuyến đường', description: err.message });
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Danh sách tuyến đường</CardTitle>
                    <CardDescription>Tất cả tuyến đường đã được thiết lập trong hệ thống.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                            Hiển thị {Math.min((currentPage - 1) * itemsPerPage + 1, routes.length)}-{Math.min(currentPage * itemsPerPage, routes.length)} / {routes.length} tuyến đường
                        </div>
                        <div className="space-x-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                Trước
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.min(Math.ceil(routes.length / itemsPerPage), p + 1))}
                                disabled={currentPage >= Math.ceil(routes.length / itemsPerPage)}
                            >
                                Sau
                            </Button>
                        </div>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Ảnh</TableHead>
                                <TableHead>Tên</TableHead>
                                <TableHead>Quận/Huyện</TableHead>
                                <TableHead className="text-right">Thao tác</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : routes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(route => (
                                <TableRow key={route.id}>
                                    <TableCell>{route.id}</TableCell>
                                    <TableCell>
                                        <Image
                                            src={route.imageUrl || 'https://picsum.photos/seed/default-route/80/50'}
                                            alt={route.name}
                                            width={80}
                                            height={50}
                                            className="rounded-md object-cover"
                                            data-ai-hint="route landscape"
                                            unoptimized // Use original S3 URL to avoid Next.js optimization issues with signed URLs
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">{route.name}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {route.districts?.slice(0, 5).map(d => <Badge key={d.id} variant="secondary">{d.name}</Badge>)}
                                            {route.districts?.length > 5 && <Badge variant="outline">+{route.districts.length - 5} khác</Badge>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <span className="sr-only">Mở menu</span>
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Thao tác</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => handleOpenForm(route)}>
                                                    <Edit className="mr-2 h-4 w-4" /> Sửa
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => setDeletingRoute(route)} className="text-destructive focus:text-destructive">
                                                    <Trash2 className="mr-2 h-4 w-4" /> Xóa
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
                <CardFooter className="justify-between">
                    <div className="text-xs text-muted-foreground">
                        Trang {currentPage} / {Math.max(1, Math.ceil(routes.length / itemsPerPage))}
                    </div>
                    <Button onClick={() => handleOpenForm(null)}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Thêm tuyến đường
                    </Button>
                </CardFooter>
            </Card>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <RouteForm
                    key={editingRoute?.id} // Re-mount on change
                    route={editingRoute}
                    adminUnits={adminUnits}
                    onCancel={handleCloseForm}
                    onSave={handleSaveSuccess}
                />
            </Dialog>

            <AlertDialog open={!!deletingRoute} onOpenChange={() => setDeletingRoute(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Bạn có chắc chắn không?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Hành động này không thể hoàn tác. Tuyến đường "{deletingRoute?.name}" và tất cả bảng giá liên quan sẽ bị xóa vĩnh viễn.
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

function RouteForm({ route, adminUnits, onSave, onCancel }: { route: Route | null, adminUnits: AdminUnit[], onSave: () => void; onCancel: () => void; }) {
    const isEditing = !!route;
    const { toast } = useToast();

    const [name, setName] = React.useState(route?.name || '');
    const [startProvinceId, setStartProvinceId] = React.useState<number | undefined>();
    const [endProvinceId, setEndProvinceId] = React.useState<number | undefined>();
    const [selectedStartDistricts, setSelectedStartDistricts] = React.useState<Set<number>>(new Set());
    const [selectedEndDistricts, setSelectedEndDistricts] = React.useState<Set<number>>(new Set());
    const [imageUrl, setImageUrl] = React.useState<string | undefined>(route?.imageUrl);
    const [imageFile, setImageFile] = React.useState<File | null>(null);
    const [isUploading, setIsUploading] = React.useState(false);

    const [isSaving, setIsSaving] = React.useState(false);

    const provinces = React.useMemo(() => adminUnits.filter(u => u.level === 'PROVINCE'), [adminUnits]);
    const districts = React.useMemo(() => adminUnits.filter(u => u.level === 'DISTRICT'), [adminUnits]);

    const startDistricts = React.useMemo(() => startProvinceId ? districts.filter(d => d.parentId === startProvinceId) : [], [districts, startProvinceId]);
    const endDistricts = React.useMemo(() => endProvinceId ? districts.filter(d => d.parentId === endProvinceId) : [], [districts, endProvinceId]);

    const provinceOptions = React.useMemo(() => provinces.map(p => ({ value: String(p.id), label: p.name })), [provinces]);

    // Effect to auto-populate form when editing
    React.useEffect(() => {
        if (isEditing && route?.districts && districts.length > 0) {
            const districtMap = new Map(districts.map(d => [d.id, d.parentId]));

            // Heuristic to determine start/end provinces
            const provinceCounts: Record<number, number> = {};
            route.districts.forEach(d => {
                const parentId = districtMap.get(d.id);
                if (parentId) {
                    provinceCounts[parentId] = (provinceCounts[parentId] || 0) + 1;
                }
            });
            const sortedProvinces = Object.keys(provinceCounts)
                .map(Number)
                .sort((a, b) => provinceCounts[b] - provinceCounts[a]);

            const p1 = sortedProvinces[0];
            const p2 = sortedProvinces[1] || p1;

            setStartProvinceId(p1);
            setEndProvinceId(p2);

            const startDistrictIds = new Set<number>();
            const endDistrictIds = new Set<number>();

            route.districts.forEach(d => {
                const parentId = districtMap.get(d.id);
                if (parentId === p1) {
                    startDistrictIds.add(d.id);
                } else if (parentId === p2) {
                    endDistrictIds.add(d.id);
                }
            });
            setSelectedStartDistricts(startDistrictIds);
            setSelectedEndDistricts(endDistrictIds);
        }
    }, [isEditing, route, districts]);


    // Effect to auto-generate route name
    React.useEffect(() => {
        if (!name) { // Only suggest name if it's empty
            const startProvince = provinces.find(p => p.id === startProvinceId);
            const endProvince = provinces.find(p => p.id === endProvinceId);
            if (startProvince && endProvince && startProvince.id !== endProvince.id) {
                setName(`${startProvince.name} - ${endProvince.name}`);
            } else if (startProvince) {
                setName(`${startProvince.name} - Nội tỉnh`);
            }
        }
    }, [startProvinceId, endProvinceId, provinces, name]);

    const handleDistrictToggle = (side: 'start' | 'end', districtId: number) => {
        const updater = side === 'start' ? setSelectedStartDistricts : setSelectedEndDistricts;
        updater(prev => {
            const newSet = new Set(prev);
            if (newSet.has(districtId)) {
                newSet.delete(districtId);
            } else {
                newSet.add(districtId);
            }
            return newSet;
        });
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImageUrl(reader.result as string); // Show local preview
            };
            reader.readAsDataURL(file);
        }
    };


    const handleSubmit = async () => {
        setIsSaving(true);
        let finalImageKey = route?.imageKey;

        if (imageFile) {
            setIsUploading(true);
            try {
                // Ensure we have a valid content type, fallback to octet-stream if empty (common with some Windows files or obscure types)
                const contentType = imageFile.type || 'application/octet-stream';
                const presignedData = await getPresignedUrl(imageFile.name, contentType);

                // We must use the SAME content type for the upload that we used for the presigned URL
                // The explicit file object is fine, but we need to make sure api.ts handles the header correctly.
                // However, `uploadToS3` in api.ts extracts type from file object.
                // To be safe, let's update api.ts to respect the type we decided on. 
                // But for now, we just ensure we request the URL with the right type.

                await uploadToS3(presignedData.url, imageFile);
                finalImageKey = presignedData.key;
                toast({ title: 'Thành công', description: 'Đã tải ảnh lên thành công.' });
            } catch (err: any) {
                toast({ variant: 'destructive', title: 'Tải ảnh lên thất bại', description: err.message });
                setIsSaving(false);
                setIsUploading(false);
                return;
            } finally {
                setIsUploading(false);
            }
        }

        const allSelectedIds = [...selectedStartDistricts, ...selectedEndDistricts];
        if (!name || allSelectedIds.length === 0) {
            toast({ variant: 'destructive', title: 'Thiếu thông tin', description: 'Tên tuyến đường và ít nhất một quận/huyện là bắt buộc.' });
            setIsSaving(false);
            return;
        }

        const payload = {
            name,
            districtIds: allSelectedIds,
            imageKey: finalImageKey,
        };

        try {
            if (isEditing && route) {
                await updateRoute(route.id, payload);
                toast({ title: 'Thành công', description: 'Đã cập nhật tuyến đường.' });
            } else {
                await createRoute(payload);
                toast({ title: 'Thành công', description: 'Đã tạo tuyến đường.' });
            }
            onSave();
            // Do NOT setIsSaving(false) here because onSave unmounts this component.
        } catch (err: any) {
            toast({ variant: 'destructive', title: `Không thể ${isEditing ? 'cập nhật' : 'tạo'} tuyến đường`, description: err.message });
            setIsSaving(false); // Only reset if we are staying on the form
        } finally {
            // Removed finally block to avoid setting state on unmounted component
        }
    }

    return (
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>{isEditing ? 'Sửa tuyến đường' : 'Tạo tuyến đường'}</DialogTitle>
                <DialogDescription>{isEditing ? 'Cập nhật thông tin tuyến đường.' : 'Thiết lập tuyến đường liên tỉnh mới.'}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 overflow-y-auto">
                <div className="space-y-2">
                    <Label>Ảnh tuyến đường</Label>
                    <div className="flex items-center gap-4">
                        {imageUrl && <Image src={imageUrl} alt="Route preview" width={120} height={75} className="rounded-md object-cover" unoptimized />}
                        <Input id="image-upload" type="file" accept="image/*" onChange={handleImageChange} className="max-w-xs" />
                        {isUploading && <Loader2 className="h-5 w-5 animate-spin" />}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label>Tỉnh/TP bắt đầu</Label>
                        <Combobox options={provinceOptions} selectedValue={startProvinceId ? String(startProvinceId) : undefined} onSelect={(val) => { setStartProvinceId(val ? Number(val) : undefined); setSelectedStartDistricts(new Set()) }} placeholder="Chọn tỉnh/TP bắt đầu..." searchPlaceholder="Tìm tỉnh/thành phố..." noResultsText="Không tìm thấy." />
                    </div>
                    <div className="space-y-2">
                        <Label>Tỉnh/TP kết thúc</Label>
                        <Combobox options={provinceOptions} selectedValue={endProvinceId ? String(endProvinceId) : undefined} onSelect={(val) => { setEndProvinceId(val ? Number(val) : undefined); setSelectedEndDistricts(new Set()) }} placeholder="Chọn tỉnh/TP kết thúc..." searchPlaceholder="Tìm tỉnh/thành phố..." noResultsText="Không tìm thấy." />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="route-name">Tên tuyến đường</Label>
                    <Input id="route-name" placeholder="e.g. Hà Nội - Hải Dương" value={name} onChange={e => setName(e.target.value)} />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2 rounded-md border p-4">
                        <Label>Quận/huyện tỉnh bắt đầu</Label>
                        <ScrollArea className="h-60">
                            <div className="space-y-2 p-1">
                                {startDistricts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Chọn tỉnh/TP bắt đầu để xem quận/huyện.</p>}
                                {startDistricts.map(d => (
                                    <div key={d.id} className="flex items-center gap-2">
                                        <Checkbox id={`start-dist-${d.id}`} checked={selectedStartDistricts.has(d.id)} onCheckedChange={() => handleDistrictToggle('start', d.id)} />
                                        <Label htmlFor={`start-dist-${d.id}`} className="font-normal">{d.name}</Label>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                    <div className="space-y-2 rounded-md border p-4">
                        <Label>Quận/huyện tỉnh kết thúc</Label>
                        <ScrollArea className="h-60">
                            <div className="space-y-2 p-1">
                                {endDistricts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Chọn tỉnh/TP kết thúc để xem quận/huyện.</p>}
                                {endDistricts.map(d => (
                                    <div key={d.id} className="flex items-center gap-2">
                                        <Checkbox id={`end-dist-${d.id}`} checked={selectedEndDistricts.has(d.id)} onCheckedChange={() => handleDistrictToggle('end', d.id)} />
                                        <Label htmlFor={`end-dist-${d.id}`} className="font-normal">{d.name}</Label>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onCancel}>Hủy</Button>
                <Button onClick={handleSubmit} disabled={isSaving || isUploading}>
                    {(isSaving || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Lưu
                </Button>
            </DialogFooter>
        </DialogContent>
    )
}
