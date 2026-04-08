'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getNews, createNews, updateNews, deleteNews, getPresignedUrl, uploadToS3, API_BASE_URL } from '@/lib/api';
import type { News } from '@/lib/types';
import { Loader2, PlusCircle, Edit, Trash2, Search, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from "@/components/ui/alert-dialog"
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

export function NewsManager() {
    const [news, setNews] = React.useState<News[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [currentPage, setCurrentPage] = React.useState(1);
    const itemsPerPage = 20;

    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [editingNews, setEditingNews] = React.useState<News | null>(null);
    const [deletingNews, setDeletingNews] = React.useState<News | null>(null);
    const [formKey, setFormKey] = React.useState(0);
    const { toast } = useToast();

    // Fetch data using pagination if desired, but for now we fetch list and paginate client side or use api params
    // API: GET /news/admin?page=...&limit=...
    // Let's assume we want to use server side pagination if possible, or client if we fetch all.
    // The user requirement said: Response: List of all news.
    // But endpoint supports page/limit.
    // Let's implement Server Side Pagination logic effectively.

    const fetchNews = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await getNews({ page: currentPage, limit: itemsPerPage });
            // Check structure. If it returns { data, meta } or just data.
            // My api wrapper usually returns `response.json()`.
            // getNews implementation returns `response.json()`.
            // The user endpoint description: "Response: List of all news".
            // If it returns array directly? Or { data: [], meta: ... }?
            // Existing `getScheduledNotifications` returns `GetApiResponse`.
            // User said "Response: List of all news".
            // I'll handle both cases to be safe.
            if (Array.isArray(response)) {
                setNews(response);
            } else if (response.data && Array.isArray(response.data)) {
                setNews(response.data);
            } else {
                setNews([]);
            }
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to fetch news', description: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, toast]);

    React.useEffect(() => {
        fetchNews();
    }, [fetchNews]);

    const handleOpenForm = (item: News | null) => {
        setEditingNews(item);
        setFormKey(k => k + 1);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setEditingNews(null);
        setIsFormOpen(false);
    };

    const handleSaveSuccess = () => {
        handleCloseForm();
        fetchNews();
    };

    const handleDeleteConfirm = async () => {
        if (!deletingNews) return;
        try {
            await deleteNews(deletingNews.id);
            toast({ title: 'Success', description: 'News deleted.' });
            setDeletingNews(null);
            fetchNews();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to delete news', description: err.message });
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>News Articles</CardTitle>
                    <CardDescription>Manage news and updates visible to users.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex items-center justify-between">
                        <Button variant="outline" size="sm" onClick={() => fetchNews()}>Refresh</Button>
                        <div className="space-x-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1 || isLoading}
                            >
                                Previous
                            </Button>
                            <span className="text-sm py-2">Page {currentPage}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(p => p + 1)}
                                disabled={isLoading || news.length < itemsPerPage}
                            >
                                Next
                            </Button>
                        </div>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Image</TableHead>
                                <TableHead>Title</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : news.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">No news found.</TableCell>
                                </TableRow>
                            ) : (
                                news.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <div className="w-16 h-10 relative bg-muted rounded overflow-hidden">
                                                {item.imageUrl ? (
                                                    <Image
                                                        src={item.imageUrl}
                                                        alt={item.title}
                                                        fill
                                                        className="object-cover"
                                                        unoptimized
                                                    />
                                                ) : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No Img</div>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            <div>{item.title}</div>
                                            {item.link && (
                                                <a href={item.link} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                                                    Link <ExternalLink className="h-3 w-3" />
                                                </a>
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-xs truncate text-muted-foreground">{item.description}</TableCell>
                                        <TableCell>
                                            <Badge variant={item.isActive ? "default" : "secondary"}>
                                                {item.isActive ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenForm(item)}>
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeletingNews(item)}>
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
                        Create News
                    </Button>
                </CardFooter>
            </Card>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <NewsForm
                    key={formKey}
                    news={editingNews}
                    onCancel={handleCloseForm}
                    onSave={handleSaveSuccess}
                />
            </Dialog>

            <AlertDialog open={!!deletingNews} onOpenChange={() => setDeletingNews(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete "{deletingNews?.title}". This action cannot be undone.
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

function NewsForm({ news, onSave, onCancel }: { news: News | null, onSave: () => void, onCancel: () => void }) {
    const isEditing = !!news;
    const { toast } = useToast();

    const [title, setTitle] = React.useState(news?.title || '');
    const [description, setDescription] = React.useState(news?.description || '');
    const [link, setLink] = React.useState(news?.link || '');
    const [isActive, setIsActive] = React.useState(news?.isActive ?? true);
    const [imageUrl, setImageUrl] = React.useState<string | undefined>(news?.imageUrl);
    const [imageFile, setImageFile] = React.useState<File | null>(null);
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
        if (!title || !description) {
            toast({ variant: 'destructive', title: 'Start', description: 'Title and description are required.' });
            return;
        }

        setIsSaving(true);
        let finalImageKey = imageUrl; // If specific key needed or just URL. User said imageUrl is URL.

        // If file selected, upload to S3 and get URL
        if (imageFile) {
            setIsUploading(true);
            try {
                const contentType = imageFile.type || 'application/octet-stream';
                const presignedData = await getPresignedUrl(imageFile.name, contentType);
                await uploadToS3(presignedData.url, imageFile);

                // Assuming the KEY is what we want? Or the public URL?
                // Usually we store the KEY, but user API says "imageUrl".
                // If backend constructs URL from Key, we send Key?
                // User requirement: "imageUrl": "https://..."
                // Presigned upload doesn't return public URL directly usually, unless we know the bucket structure.
                // But `presignedData.key` is available.
                // Let's assume we construct URL or backend allows Key.
                // Using API_BASE_URL
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
            title,
            description,
            imageUrl: finalImageKey,
            link,
            isActive
        };

        try {
            if (isEditing && news) {
                await updateNews(news.id, payload);
                toast({ title: 'Success', description: 'News updated.' });
            } else {
                await createNews(payload);
                toast({ title: 'Success', description: 'News created.' });
            }
            onSave();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
            setIsSaving(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>{isEditing ? 'Edit News' : 'Create News'}</DialogTitle>
                <DialogDescription>{isEditing ? 'Update news details.' : 'Publish a new news article.'}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="News title" />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="News content..." rows={5} />
                </div>
                <div className="grid gap-2">
                    <Label>Image</Label>
                    <div className="flex items-center gap-4">
                        {imageUrl && (
                            <div className="relative w-24 h-16 rounded overflow-hidden border">
                                <Image src={imageUrl} alt="Preview" fill className="object-cover" unoptimized />
                            </div>
                        )}
                        <Input id="image" type="file" accept="image/*" onChange={handleImageChange} className="max-w-xs" />
                        {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="link">Link (Optional)</Label>
                    <Input id="link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://example.com" />
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
