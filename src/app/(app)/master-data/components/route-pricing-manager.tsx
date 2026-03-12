'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getRoutes, getPricingByRoute, createPricing, updatePricing, deletePricing, getAdminUnits } from '@/lib/api';
import type { Route, RoutePricing, AdminUnit } from '@/lib/types';
import { Loader2, PlusCircle, Trash2, Edit } from 'lucide-react';
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

export function RoutePricingManager() {
    const [routes, setRoutes] = React.useState<Route[]>([]);
    const [districts, setDistricts] = React.useState<AdminUnit[]>([]);
    const [selectedRouteId, setSelectedRouteId] = React.useState<number | null>(null);
    const [pricing, setPricing] = React.useState<RoutePricing[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isPricingLoading, setIsPricingLoading] = React.useState(false);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [editingPricing, setEditingPricing] = React.useState<RoutePricing | null>(null);
    const [deletingPricing, setDeletingPricing] = React.useState<RoutePricing | null>(null);
    const [currentPage, setCurrentPage] = React.useState(1);
    const itemsPerPage = 50;
    const { toast } = useToast();

    const selectedRoute = React.useMemo(() => routes.find(r => r.id === selectedRouteId), [routes, selectedRouteId]);

    const fetchInitialData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const [routesData, unitsData] = await Promise.all([getRoutes(), getAdminUnits()]);
            setRoutes(routesData);
            setDistricts(unitsData.filter(u => u.level === 'DISTRICT'));
            if (routesData.length > 0) {
                setSelectedRouteId(routesData[0].id);
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to fetch initial data', description: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    const fetchPricing = React.useCallback(async () => {
        if (!selectedRouteId) return;
        setIsPricingLoading(true);
        try {
            const pricingData = await getPricingByRoute(selectedRouteId);
            setPricing(pricingData);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to fetch pricing', description: err.message });
            setPricing([]); // Clear pricing on error
        } finally {
            setIsPricingLoading(false);
        }
    }, [selectedRouteId, toast]);

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

    const handleOpenForm = (pricingItem: RoutePricing | null) => {
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
            toast({ title: 'Success', description: 'Pricing rule deleted.' });
            fetchPricing();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to delete pricing', description: err.message });
        } finally {
            setDeletingPricing(null);
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Route Pricing Management</CardTitle>
                    <CardDescription>Configure prices for districts within a specific route.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center space-x-4">
                        <Label htmlFor="route-select" className="shrink-0">Select a Route:</Label>
                        <Combobox
                            options={routeOptions}
                            selectedValue={selectedRouteId ? String(selectedRouteId) : ""}
                            onSelect={(value) => setSelectedRouteId(value ? Number(value) : null)}
                            placeholder="Select a route..."
                            searchPlaceholder="Search routes..."
                            noResultsText="No route found."
                            className="w-[350px]"
                            disabled={isLoading}
                        />
                    </div>
                    {isPricingLoading ? (
                        <div className="h-48 flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <>
                            <div className="mb-4 flex items-center justify-between">
                                <div className="text-sm text-muted-foreground">
                                    Showing {Math.min((currentPage - 1) * itemsPerPage + 1, pricing.length)}-{Math.min(currentPage * itemsPerPage, pricing.length)} of {pricing.length} rules
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
                                        onClick={() => setCurrentPage(p => Math.min(Math.ceil(pricing.length / itemsPerPage), p + 1))}
                                        disabled={currentPage >= Math.ceil(pricing.length / itemsPerPage)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Start District</TableHead>
                                        <TableHead>End District</TableHead>
                                        <TableHead>Price</TableHead>
                                        <TableHead>Priority</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pricing.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">No pricing rules found for this route.</TableCell>
                                        </TableRow>
                                    ) : (
                                        pricing.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(p => (
                                            <TableRow key={p.id}>
                                                <TableCell className="font-medium">
                                                    {p.startDistrict ? p.startDistrict.name : <span className="text-muted-foreground italic">Any</span>}
                                                </TableCell>
                                                <TableCell className="font-medium">{p.adminUnit.name}</TableCell>
                                                <TableCell>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(p.price)}</TableCell>
                                                <TableCell>{p.priority}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenForm(p)}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeletingPricing(p)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                            <div className="mt-4 text-xs text-muted-foreground text-center">
                                Page {currentPage} of {Math.max(1, Math.ceil(pricing.length / itemsPerPage))}
                            </div>
                        </>
                    )}
                </CardContent>
                <CardFooter>
                    <Button onClick={() => handleOpenForm(null)} disabled={!selectedRouteId}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Pricing Rule
                    </Button>
                </CardFooter>
            </Card>
            <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setEditingPricing(null); } else { setIsFormOpen(true); } }}>
                {selectedRouteId && (
                    <PricingForm
                        key={editingPricing?.id} // Re-mount form on edit
                        routeId={selectedRouteId}
                        districts={selectedRoute?.districts || []}
                        pricingItem={editingPricing}
                        onSave={handleSave}
                        onCancel={() => { setIsFormOpen(false); setEditingPricing(null); }}
                    />
                )}
            </Dialog>

            <AlertDialog open={!!deletingPricing} onOpenChange={() => setDeletingPricing(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the pricing rule for "{deletingPricing?.adminUnit.name}". This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function PricingForm({
    routeId,
    districts,
    pricingItem,
    onSave,
    onCancel,
}: {
    routeId: number;
    districts: AdminUnit[];
    pricingItem: RoutePricing | null;
    onSave: () => void;
    onCancel: () => void;
}) {
    const [adminUnitId, setAdminUnitId] = React.useState<number | undefined>(pricingItem?.adminUnitId);
    const [startDistrictId, setStartDistrictId] = React.useState<number | undefined>(pricingItem?.startDistrictId);
    const [price, setPrice] = React.useState<number | string>(pricingItem?.price || '');
    const [isSaving, setIsSaving] = React.useState(false);
    const { toast } = useToast();
    const isEditing = !!pricingItem;



    const districtOptions = React.useMemo(() => {
        const groups: Record<string, { value: string; label: string }[]> = {};
        const others: { value: string; label: string }[] = [];

        districts.forEach(d => {
            const option = { value: String(d.id), label: d.name };
            if (d.parent && d.parent.name) {
                const groupName = d.parent.name;
                if (!groups[groupName]) {
                    groups[groupName] = [];
                }
                groups[groupName].push(option);
            } else {
                others.push(option);
            }
        });

        // Use Object.entries but sorting keys might be nice. 
        // For now, let's just map.
        const groupedOptions = Object.keys(groups).map(groupName => ({
            label: groupName,
            options: groups[groupName]
        }));

        if (others.length > 0) {
            groupedOptions.push({ label: 'Other', options: others });
        }

        if (groupedOptions.length === 0 && districts.length > 0) {
            return districts.map(d => ({ value: String(d.id), label: d.name }));
        }

        return groupedOptions;
    }, [districts]);

    const handleSubmit = async () => {
        if (!adminUnitId || price === '' || Number(price) <= 0) {
            toast({ variant: 'destructive', title: 'Incomplete form', description: 'District and a valid price are required.' });
            return;
        }

        setIsSaving(true);
        try {
            if (isEditing) {
                await updatePricing(pricingItem.id, { price: Number(price) });
                toast({ title: 'Success', description: 'Pricing rule updated.' });
            } else {
                await createPricing({ routeId, adminUnitId, startDistrictId: startDistrictId || null, price: Number(price), priority: 1 });
                toast({ title: 'Success', description: 'Pricing rule created.' });
            }
            onSave();
        } catch (err: any) {
            toast({ variant: 'destructive', title: `Failed to ${isEditing ? 'update' : 'create'} pricing`, description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{isEditing ? 'Edit' : 'Create'} Pricing Rule</DialogTitle>
                <DialogDescription>
                    {isEditing ? `Update the price for ${pricingItem.adminUnit.name}.` : 'Add a new pricing rule for the selected route.'}
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="start-district-select">Start District <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                    <Combobox
                        options={districtOptions}
                        selectedValue={startDistrictId ? String(startDistrictId) : undefined}
                        onSelect={(value) => setStartDistrictId(value ? Number(value) : undefined)}
                        placeholder="Select start district (Any)..."
                        searchPlaceholder="Search districts..."
                        noResultsText="No district found."
                        disabled={isEditing}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="district-select">End District</Label>
                    <Combobox
                        options={districtOptions}
                        selectedValue={adminUnitId ? String(adminUnitId) : undefined}
                        onSelect={(value) => setAdminUnitId(value ? Number(value) : undefined)}
                        placeholder="Select end district..."
                        searchPlaceholder="Search districts..."
                        noResultsText="No district found."
                        disabled={isEditing}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="price-input">Price (VND)</Label>
                    <Input
                        id="price-input"
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="e.g., 200000"
                    />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={isSaving}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                </Button>
            </DialogFooter>
        </DialogContent >
    );
}
