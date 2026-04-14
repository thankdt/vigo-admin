'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getAdminUnits, createAdminUnit } from '@/lib/api';
import type { AdminUnit } from '@/lib/types';
import { Loader2, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function AdminUnitsManager() {
    const [units, setUnits] = React.useState<AdminUnit[]>([]);
    const [provinces, setProvinces] = React.useState<AdminUnit[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [currentPage, setCurrentPage] = React.useState(1);
    const itemsPerPage = 50;
    const { toast } = useToast();

    const fetchUnits = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getAdminUnits();
            setUnits(data);
            setProvinces(data.filter(u => u.level === 'PROVINCE'));
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể tải đơn vị hành chính', description: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    React.useEffect(() => {
        fetchUnits();
    }, [fetchUnits]);

    function UnitForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void; }) {
        const [name, setName] = React.useState('');
        const [level, setLevel] = React.useState<'PROVINCE' | 'DISTRICT' | 'WARD'>('PROVINCE');
        const [parentId, setParentId] = React.useState<number | undefined>();
        const [isSaving, setIsSaving] = React.useState(false);

        const handleSubmit = async () => {
            if (!name || !level) {
                toast({ variant: 'destructive', title: 'Thiếu thông tin', description: 'Tên và cấp đơn vị là bắt buộc.' });
                return;
            }
            if (level !== 'PROVINCE' && !parentId) {
                toast({ variant: 'destructive', title: 'Thiếu thông tin', description: 'Đơn vị cấp trên là bắt buộc cho Quận/Huyện và Phường/Xã.' });
                return;
            }

            setIsSaving(true);
            try {
                await createAdminUnit({ name, level, parentId: level === 'PROVINCE' ? undefined : parentId });
                toast({ title: 'Thành công', description: 'Đã tạo đơn vị hành chính.' });
                onSave();
            } catch (err: any) {
                toast({ variant: 'destructive', title: 'Không thể tạo đơn vị', description: err.message });
            } finally {
                setIsSaving(false);
            }
        }

        return (
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Tạo đơn vị hành chính</DialogTitle>
                    <DialogDescription>Thêm tỉnh/thành phố, quận/huyện hoặc phường/xã mới.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="unit-name">Tên</Label>
                        <Input id="unit-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Hà Nội, Quận Ba Đình" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="unit-level">Cấp</Label>
                        <Select onValueChange={(v: any) => setLevel(v)} defaultValue={level}>
                            <SelectTrigger id="unit-level"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PROVINCE">Tỉnh/Thành phố</SelectItem>
                                <SelectItem value="DISTRICT">Quận/Huyện</SelectItem>
                                <SelectItem value="WARD">Phường/Xã</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {level !== 'PROVINCE' && (
                        <div className="space-y-2">
                            <Label htmlFor="unit-parent">Đơn vị cấp trên (Tỉnh/TP)</Label>
                            <Select onValueChange={(v: any) => setParentId(Number(v))}>
                                <SelectTrigger id="unit-parent"><SelectValue placeholder="Chọn tỉnh/thành phố" /></SelectTrigger>
                                <SelectContent>
                                    {provinces.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onCancel}>Hủy</Button>
                    <Button onClick={handleSubmit} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Lưu
                    </Button>
                </DialogFooter>
            </DialogContent>
        )
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Danh sách đơn vị</CardTitle>
                    <CardDescription>Tất cả tỉnh/thành phố, quận/huyện và phường/xã trong hệ thống.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                            Hiển thị {Math.min((currentPage - 1) * itemsPerPage + 1, units.length)}-{Math.min(currentPage * itemsPerPage, units.length)} / {units.length} đơn vị
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
                                onClick={() => setCurrentPage(p => Math.min(Math.ceil(units.length / itemsPerPage), p + 1))}
                                disabled={currentPage >= Math.ceil(units.length / itemsPerPage)}
                            >
                                Sau
                            </Button>
                        </div>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Tên</TableHead>
                                <TableHead>Cấp</TableHead>
                                <TableHead>ID cấp trên</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : units.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(unit => (
                                <TableRow key={unit.id}>
                                    <TableCell>{unit.id}</TableCell>
                                    <TableCell className="font-medium">{unit.name}</TableCell>
                                    <TableCell>{unit.level}</TableCell>
                                    <TableCell>{unit.parentId || 'N/A'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
                <CardFooter className="justify-between">
                    <div className="text-xs text-muted-foreground">
                        Trang {currentPage} / {Math.max(1, Math.ceil(units.length / itemsPerPage))}
                    </div>
                    <Button onClick={() => setIsFormOpen(true)}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Thêm đơn vị
                    </Button>
                </CardFooter>
            </Card>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <UnitForm
                    onCancel={() => setIsFormOpen(false)}
                    onSave={() => {
                        setIsFormOpen(false);
                        fetchUnits();
                    }}
                />
            </Dialog>
        </>
    );
}
