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
            toast({ variant: 'destructive', title: 'Failed to fetch units', description: err.message });
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
                toast({ variant: 'destructive', title: 'Incomplete form', description: 'Name and level are required.' });
                return;
            }
            if (level !== 'PROVINCE' && !parentId) {
                toast({ variant: 'destructive', title: 'Incomplete form', description: 'Parent unit is required for District/Ward.' });
                return;
            }

            setIsSaving(true);
            try {
                await createAdminUnit({ name, level, parentId: level === 'PROVINCE' ? undefined : parentId });
                toast({ title: 'Success', description: 'Administrative unit created.' });
                onSave();
            } catch (err: any) {
                toast({ variant: 'destructive', title: 'Failed to create unit', description: err.message });
            } finally {
                setIsSaving(false);
            }
        }

        return (
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create Administrative Unit</DialogTitle>
                    <DialogDescription>Add a new province, district, or ward.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="unit-name">Name</Label>
                        <Input id="unit-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Hà Nội, Quận Ba Đình" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="unit-level">Level</Label>
                        <Select onValueChange={(v: any) => setLevel(v)} defaultValue={level}>
                            <SelectTrigger id="unit-level"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PROVINCE">Province</SelectItem>
                                <SelectItem value="DISTRICT">District</SelectItem>
                                <SelectItem value="WARD">Ward</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {level !== 'PROVINCE' && (
                        <div className="space-y-2">
                            <Label htmlFor="unit-parent">Parent Unit (Province)</Label>
                            <Select onValueChange={(v: any) => setParentId(Number(v))}>
                                <SelectTrigger id="unit-parent"><SelectValue placeholder="Select a parent province" /></SelectTrigger>
                                <SelectContent>
                                    {provinces.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onCancel}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        )
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Units List</CardTitle>
                    <CardDescription>All provinces, districts, and wards in the system.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, units.length)}-{Math.min(currentPage * itemsPerPage, units.length)} of {units.length} units
                        </div>
                        <div className="space-x-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.min(Math.ceil(units.length / itemsPerPage), p + 1))}
                                disabled={currentPage >= Math.ceil(units.length / itemsPerPage)}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Level</TableHead>
                                <TableHead>Parent ID</TableHead>
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
                        Page {currentPage} of {Math.max(1, Math.ceil(units.length / itemsPerPage))}
                    </div>
                    <Button onClick={() => setIsFormOpen(true)}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Unit
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
