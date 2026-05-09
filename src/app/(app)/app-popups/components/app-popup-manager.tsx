'use client';

import * as React from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
    getAppPopups,
    createAppPopup,
    updateAppPopup,
    deleteAppPopup,
    getPresignedUrl,
    uploadToS3,
    API_BASE_URL,
    AppPopupPayload,
} from '@/lib/api';
import type { AppPopup, AppPopupDisplayMode } from '@/lib/types';
import { Loader2, PlusCircle, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import Image from 'next/image';

const DISPLAY_MODE_LABEL: Record<AppPopupDisplayMode, string> = {
    ALWAYS: 'Luôn hiển thị',
    DISMISSIBLE: 'Ẩn sau khi tắt',
    ONCE: 'Chỉ hiển thị 1 lần',
};

// Convert ISO string from backend → value usable by <input type="datetime-local">.
// Returns '' for null/empty so the input renders as empty.
function isoToLocalInput(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
    if (!local) return null;
    const d = new Date(local);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

export function AppPopupManager() {
    const [popups, setPopups] = React.useState<AppPopup[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<AppPopup | null>(null);
    const [deleting, setDeleting] = React.useState<AppPopup | null>(null);
    const [formKey, setFormKey] = React.useState(0);
    const { toast } = useToast();

    const fetchPopups = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getAppPopups();
            setPopups(Array.isArray(data) ? data : []);
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Không thể tải popup',
                description: err.message,
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    React.useEffect(() => {
        fetchPopups();
    }, [fetchPopups]);

    const handleOpenForm = (item: AppPopup | null) => {
        setEditing(item);
        setFormKey((k) => k + 1);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setEditing(null);
        setIsFormOpen(false);
    };

    const handleSaveSuccess = () => {
        handleCloseForm();
        fetchPopups();
    };

    const handleDeleteConfirm = async () => {
        if (!deleting) return;
        try {
            await deleteAppPopup(deleting.id);
            toast({ title: 'Thành công', description: 'Đã xóa popup.' });
            setDeleting(null);
            fetchPopups();
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: 'Không thể xóa popup',
                description: err.message,
            });
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Popup quảng cáo</CardTitle>
                    <CardDescription>
                        Popup hiển thị khi người dùng mở app. Chế độ DISMISSIBLE/ONCE
                        ghi nhớ trên thiết bị nên người dùng cài lại app sẽ thấy lại.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex items-center justify-between">
                        <Button variant="outline" size="sm" onClick={fetchPopups}>
                            Làm mới
                        </Button>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Hình ảnh</TableHead>
                                <TableHead>Liên kết</TableHead>
                                <TableHead>Chế độ</TableHead>
                                <TableHead>Ưu tiên</TableHead>
                                <TableHead>Lịch chạy</TableHead>
                                <TableHead>Trạng thái</TableHead>
                                <TableHead className="text-right">Thao tác</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : popups.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        Chưa có popup nào.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                popups.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell>
                                            <div className="w-24 h-12 relative bg-muted rounded overflow-hidden">
                                                <Image
                                                    src={p.imageUrl}
                                                    alt="Popup"
                                                    fill
                                                    className="object-cover"
                                                    unoptimized
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-[220px] truncate">
                                            {p.linkUrl ? (
                                                <a
                                                    href={p.linkUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-primary hover:underline"
                                                >
                                                    {p.linkUrl}
                                                </a>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>{DISPLAY_MODE_LABEL[p.displayMode]}</TableCell>
                                        <TableCell>{p.priority}</TableCell>
                                        <TableCell className="text-xs">
                                            {p.startAt || p.endAt ? (
                                                <span>
                                                    {p.startAt ? new Date(p.startAt).toLocaleString('vi-VN') : '∞'}
                                                    {' → '}
                                                    {p.endAt ? new Date(p.endAt).toLocaleString('vi-VN') : '∞'}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">Không giới hạn</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={p.isActive ? 'default' : 'secondary'}>
                                                {p.isActive ? 'Hoạt động' : 'Tắt'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleOpenForm(p)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => setDeleting(p)}
                                            >
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
                        Thêm popup
                    </Button>
                </CardFooter>
            </Card>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <AppPopupForm
                    key={formKey}
                    popup={editing}
                    onCancel={handleCloseForm}
                    onSave={handleSaveSuccess}
                />
            </Dialog>

            <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Xóa popup?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Hành động này sẽ xóa vĩnh viễn popup khỏi hệ thống.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Xóa
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function AppPopupForm({
    popup,
    onSave,
    onCancel,
}: {
    popup: AppPopup | null;
    onSave: () => void;
    onCancel: () => void;
}) {
    const isEditing = !!popup;
    const { toast } = useToast();

    const [imageUrl, setImageUrl] = React.useState<string | undefined>(popup?.imageUrl);
    const [imageFile, setImageFile] = React.useState<File | null>(null);
    const [linkUrl, setLinkUrl] = React.useState(popup?.linkUrl ?? '');
    const [displayMode, setDisplayMode] = React.useState<AppPopupDisplayMode>(
        popup?.displayMode ?? 'ALWAYS',
    );
    const [priority, setPriority] = React.useState(popup?.priority ?? 0);
    const [isActive, setIsActive] = React.useState(popup?.isActive ?? true);
    const [startAt, setStartAt] = React.useState(isoToLocalInput(popup?.startAt));
    const [endAt, setEndAt] = React.useState(isoToLocalInput(popup?.endAt));

    const [isUploading, setIsUploading] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setImageUrl(reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async () => {
        if (!imageUrl && !imageFile) {
            toast({
                variant: 'destructive',
                title: 'Yêu cầu hình ảnh',
                description: 'Vui lòng tải lên một hình ảnh.',
            });
            return;
        }

        setIsSaving(true);
        let finalImageUrl = imageUrl!;

        if (imageFile) {
            setIsUploading(true);
            try {
                const contentType = imageFile.type || 'application/octet-stream';
                const presignedData = await getPresignedUrl(imageFile.name, contentType);
                await uploadToS3(presignedData.url, imageFile);
                finalImageUrl = `${API_BASE_URL}/${presignedData.key}`;
            } catch (err: any) {
                toast({
                    variant: 'destructive',
                    title: 'Tải lên thất bại',
                    description: err.message,
                });
                setIsSaving(false);
                setIsUploading(false);
                return;
            } finally {
                setIsUploading(false);
            }
        }

        const payload: AppPopupPayload = {
            imageUrl: finalImageUrl,
            linkUrl: linkUrl.trim() || null,
            displayMode,
            isActive,
            priority,
            startAt: localInputToIso(startAt),
            endAt: localInputToIso(endAt),
        };

        try {
            if (isEditing && popup) {
                await updateAppPopup(popup.id, payload);
                toast({ title: 'Thành công', description: 'Đã cập nhật popup.' });
            } else {
                await createAppPopup(payload);
                toast({ title: 'Thành công', description: 'Đã tạo popup.' });
            }
            onSave();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Lỗi', description: err.message });
            setIsSaving(false);
        }
    };

    return (
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>{isEditing ? 'Sửa popup' : 'Tạo popup'}</DialogTitle>
                <DialogDescription>
                    {isEditing
                        ? 'Cập nhật thông tin popup quảng cáo.'
                        : 'Thêm popup mới hiển thị khi người dùng vào app.'}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                    <Label>Hình ảnh popup (PNG)</Label>
                    <div className="flex flex-col gap-2">
                        {imageUrl && (
                            <div className="relative w-full h-48 rounded overflow-hidden border bg-muted">
                                <Image
                                    src={imageUrl}
                                    alt="Xem trước"
                                    fill
                                    className="object-contain"
                                    unoptimized
                                />
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <Input id="image" type="file" accept="image/*" onChange={handleImageChange} />
                            {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                        </div>
                    </div>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="linkUrl">Liên kết khi nhấn vào (tùy chọn)</Label>
                    <Input
                        id="linkUrl"
                        type="url"
                        placeholder="https://example.com/promo"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        Bỏ trống nếu chỉ muốn hiển thị ảnh, không điều hướng.
                    </p>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="displayMode">Chế độ hiển thị</Label>
                    <Select
                        value={displayMode}
                        onValueChange={(v) => setDisplayMode(v as AppPopupDisplayMode)}
                    >
                        <SelectTrigger id="displayMode">
                            <SelectValue placeholder="Chọn chế độ" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALWAYS">{DISPLAY_MODE_LABEL.ALWAYS}</SelectItem>
                            <SelectItem value="DISMISSIBLE">
                                {DISPLAY_MODE_LABEL.DISMISSIBLE}
                            </SelectItem>
                            <SelectItem value="ONCE">{DISPLAY_MODE_LABEL.ONCE}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="priority">Độ ưu tiên</Label>
                    <Input
                        id="priority"
                        type="number"
                        value={priority}
                        onChange={(e) => setPriority(Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                        Số càng cao càng được ưu tiên hiển thị (khi có nhiều popup cùng active).
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                        <Label htmlFor="startAt">Bắt đầu (tùy chọn)</Label>
                        <Input
                            id="startAt"
                            type="datetime-local"
                            value={startAt}
                            onChange={(e) => setStartAt(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="endAt">Kết thúc (tùy chọn)</Label>
                        <Input
                            id="endAt"
                            type="datetime-local"
                            value={endAt}
                            onChange={(e) => setEndAt(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
                    <Label htmlFor="active">Đang hoạt động</Label>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onCancel}>
                    Hủy
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving || isUploading}>
                    {(isSaving || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Lưu
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}
