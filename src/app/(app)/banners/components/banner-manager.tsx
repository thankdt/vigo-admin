'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getBanners, createBanner, updateBanner, deleteBanner, getPresignedUrl, uploadToS3, API_BASE_URL } from '@/lib/api';
import type { Banner } from '@/lib/types';
import { Loader2, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from "@/components/ui/alert-dialog"
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

export function BannerManager() {
    const [banners, setBanners] = React.useState<Banner[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);

    // Pagination state (client-side for now as API didn't specify page params in request, but response says List)
    // Actually user API spec for Banner didn't mention params `page`. "GET /admin".
    // I will use client side pagination or just list all if not many.
    // Let's assume client side pagination to be safe.
    const [currentPage, setCurrentPage] = React.useState(1);
    const itemsPerPage = 20;

    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [editingBanner, setEditingBanner] = React.useState<Banner | null>(null);
    const [deletingBanner, setDeletingBanner] = React.useState<Banner | null>(null);
    const [formKey, setFormKey] = React.useState(0);
    const { toast } = useToast();

    const fetchBanners = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getBanners();
            if (Array.isArray(data)) {
                setBanners(data);
            } else {
                setBanners([]);
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to fetch banners', description: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    React.useEffect(() => {
        fetchBanners();
    }, [fetchBanners]);

    const handleOpenForm = (item: Banner | null) => {
        setEditingBanner(item);
        setFormKey(k => k + 1);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setEditingBanner(null);
        setIsFormOpen(false);
    };

    const handleSaveSuccess = () => {
        handleCloseForm();
        fetchBanners();
    };

    const handleDeleteConfirm = async () => {
        if (!deletingBanner) return;
        try {
            await deleteBanner(deletingBanner.id);
            toast({ title: 'Success', description: 'Banner deleted.' });
            setDeletingBanner(null);
            fetchBanners();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to delete banner', description: err.message });
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Banners</CardTitle>
                    <CardDescription>Manage promotion banners displayed in the app.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex items-center justify-between">
                        <Button variant="outline" size="sm" onClick={() => fetchBanners()}>Refresh</Button>
                        {banners.length > itemsPerPage && (
                            <div className="space-x-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </Button>
                                <span className="text-sm py-2">Page {currentPage}</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    disabled={currentPage * itemsPerPage >= banners.length}
                                >
                                    Next
                                </Button>
                            </div>
                        )}
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Image</TableHead>
                                <TableHead>Priority</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : banners.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">No banners found.</TableCell>
                                </TableRow>
                            ) : (
                                banners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(banner => (
                                    <TableRow key={banner.id}>
                                        <TableCell>
                                            <div className="w-24 h-12 relative bg-muted rounded overflow-hidden">
                                                <Image
                                                    src={banner.imageUrl}
                                                    alt="Banner"
                                                    fill
                                                    className="object-cover"
                                                    unoptimized
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell>{banner.priority}</TableCell>
                                        <TableCell>
                                            <Badge variant={banner.isActive ? "default" : "secondary"}>
                                                {banner.isActive ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenForm(banner)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeletingBanner(banner)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
                <CardFooter>
                    <Button onClick={() => handleOpenForm(null)}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Banner
                    </Button>
                </CardFooter>
            </Card>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <BannerForm
                    key={formKey}
                    banner={editingBanner}
                    onCancel={handleCloseForm}
                    onSave={handleSaveSuccess}
                />
            </Dialog>

            <AlertDialog open={!!deletingBanner} onOpenChange={() => setDeletingBanner(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this banner.
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

function BannerForm({ banner, onSave, onCancel }: { banner: Banner | null, onSave: () => void, onCancel: () => void }) {
    const isEditing = !!banner;
    const { toast } = useToast();

    const [imageUrl, setImageUrl] = React.useState<string | undefined>(banner?.imageUrl);
    const [imageFile, setImageFile] = React.useState<File | null>(null);
    const [priority, setPriority] = React.useState(banner?.priority ?? 10);
    const [isActive, setIsActive] = React.useState(banner?.isActive ?? true);

    const [isUploading, setIsUploading] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImageUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async () => {
        if (!imageUrl && !imageFile) {
            toast({ variant: 'destructive', title: 'Image required', description: 'Please upload an image.' });
            return;
        }

        setIsSaving(true);
        let finalImageKey = imageUrl!;

        if (imageFile) {
            setIsUploading(true);
            try {
                const contentType = imageFile.type || 'application/octet-stream';
                const presignedData = await getPresignedUrl(imageFile.name, contentType);
                await uploadToS3(presignedData.url, imageFile);
                finalImageKey = `${API_BASE_URL}/${presignedData.key}`;
            } catch (err: any) {
                toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
                setIsSaving(false);
                setIsUploading(false);
                return;
            } finally {
                setIsUploading(false);
            }
        }

        const payload = {
            imageUrl: finalImageKey,
            priority,
            isActive
        };

        try {
            if (isEditing && banner) {
                // Update only allows priority and isActive according to spec?
                // Spec: Update Banner Body: { priority: 5, isActive: false } (Partial Update)
                // Assuming we can update image too? Or strictly follow spec?
                // Typically we want to update image too. I'll include it.
                // If backend ignores it, fine.
                await updateBanner(banner.id, { ...payload });
                toast({ title: 'Success', description: 'Banner updated.' });
            } else {
                await createBanner(payload);
                toast({ title: 'Success', description: 'Banner created.' });
            }
            onSave();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
            setIsSaving(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
                <DialogTitle>{isEditing ? 'Edit Banner' : 'Create Banner'}</DialogTitle>
                <DialogDescription>{isEditing ? 'Update banner details.' : 'Add a new banner.'}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                    <Label>Banner Image</Label>
                    <div className="flex flex-col gap-2">
                        {imageUrl && (
                            <div className="relative w-full h-32 rounded overflow-hidden border bg-muted">
                                <Image src={imageUrl} alt="Preview" fill className="object-cover" unoptimized />
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <Input id="image" type="file" accept="image/*" onChange={handleImageChange} />
                            {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                        </div>
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Input id="priority" type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
                    <p className="text-xs text-muted-foreground">Higher number = higher priority.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
                    <Label htmlFor="active">Active</Label>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={isSaving || isUploading}>
                    {(isSaving || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
