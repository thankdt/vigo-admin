'use client';
import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { getScheduledNotifications, createScheduledNotification, cancelScheduledNotification } from '@/lib/api';
import type { ScheduledNotification, GetApiResponse } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, Calendar as CalendarIcon, PlusCircle, Trash2, Clock, Repeat, Bell, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const notificationSchema = z.object({
    title: z.string().min(1, { message: "Tiêu đề là bắt buộc" }),
    body: z.string().min(1, { message: "Nội dung là bắt buộc" }),
    imageUrl: z.string().url({ message: "URL không hợp lệ" }).optional().or(z.literal('')),
    targetType: z.enum(['ALL', 'ROLE', 'SPECIFIC_USERS']),
    targetRole: z.enum(['DRIVER', 'USER']).optional(),
    loyaltyTier: z.enum(['MEMBER', 'SILVER', 'GOLD', 'DIAMOND']).optional(),
    userIds: z.string().optional(), // Comma-separated user IDs
    scheduleType: z.enum(['ONE_TIME', 'RECURRING']),
    scheduleTime: z.date().optional(),
    cronExpression: z.string().optional(),
}).refine((data) => {
    if (data.scheduleType === 'ONE_TIME' && !data.scheduleTime) {
        return false;
    }
    return true;
}, {
    message: "Thời gian lên lịch là bắt buộc cho thông báo một lần",
    path: ["scheduleTime"],
}).refine((data) => {
    if (data.scheduleType === 'RECURRING' && !data.cronExpression) {
        return false;
    }
    return true;
}, {
    message: "Biểu thức Cron là bắt buộc cho thông báo lặp lại",
    path: ["cronExpression"],
}).refine((data) => {
    if (data.targetType === 'ROLE' && !data.targetRole) {
        return false;
    }
    return true;
}, {
    message: "Vui lòng chọn vai trò",
    path: ["targetRole"],
}).refine((data) => {
    if (data.targetType === 'SPECIFIC_USERS' && !data.userIds?.trim()) {
        return false;
    }
    return true;
}, {
    message: "Vui lòng nhập ít nhất một ID người dùng",
    path: ["userIds"],
});

type NotificationFormValues = z.infer<typeof notificationSchema>;

function NotificationForm({ onSaveSuccess, onCancel }: { onSaveSuccess: () => void, onCancel: () => void }) {
    const { toast } = useToast();
    const { register, handleSubmit, control, watch, setValue, formState: { errors, isSubmitting }, reset } = useForm<NotificationFormValues>({
        resolver: zodResolver(notificationSchema),
        defaultValues: {
            scheduleType: 'ONE_TIME',
            targetType: 'ALL',
        },
    });

    const scheduleType = watch('scheduleType');
    const targetType = watch('targetType');
    const targetRole = watch('targetRole');

    const onSubmit = async (data: NotificationFormValues) => {
        try {
            const payload: any = {
                title: data.title,
                body: data.body,
                imageUrl: data.imageUrl,
                targetType: data.targetType,
            };

            // Build targetData based on targetType
            if (data.targetType === 'ROLE') {
                payload.targetData = { role: data.targetRole };
                if (data.targetRole === 'USER' && data.loyaltyTier) {
                    payload.targetData.loyaltyTier = data.loyaltyTier;
                }
            } else if (data.targetType === 'SPECIFIC_USERS' && data.userIds) {
                payload.targetData = {
                    userIds: data.userIds.split(',').map(id => id.trim()).filter(Boolean)
                };
            }

            if (data.scheduleType === 'ONE_TIME' && data.scheduleTime) {
                payload.scheduleTime = data.scheduleTime.toISOString();
            } else if (data.scheduleType === 'RECURRING' && data.cronExpression) {
                payload.cronExpression = data.cronExpression;
            }

            await createScheduledNotification(payload);
            toast({ title: "Thành công", description: "Đã lên lịch thông báo thành công." });
            onSaveSuccess();
            reset();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể lên lịch thông báo', description: err.message });
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
                <DialogTitle>Lên lịch thông báo</DialogTitle>
                <DialogDescription>Tạo lịch thông báo đẩy mới.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto p-1">
                <div className="space-y-2">
                    <Label htmlFor="title">Tiêu đề</Label>
                    <Input id="title" {...register('title')} placeholder="Tiêu đề thông báo" />
                    {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="body">Nội dung</Label>
                    <Textarea id="body" {...register('body')} placeholder="Nội dung thông báo" />
                    {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="imageUrl">URL hình ảnh (Tùy chọn)</Label>
                    <Input id="imageUrl" {...register('imageUrl')} placeholder="https://..." />
                    {errors.imageUrl && <p className="text-sm text-destructive">{errors.imageUrl.message}</p>}
                </div>

                {/* Target Audience Section */}
                <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                    <Label className="text-sm font-semibold">Đối tượng nhận</Label>
                    <Controller
                        name="targetType"
                        control={control}
                        render={({ field }) => (
                            <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex flex-col space-y-2"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="ALL" id="target-all" />
                                    <Label htmlFor="target-all" className="font-normal cursor-pointer">📢 Tất cả người dùng (Phát sóng)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="ROLE" id="target-role" />
                                    <Label htmlFor="target-role" className="font-normal cursor-pointer">👥 Theo vai trò</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="SPECIFIC_USERS" id="target-specific" />
                                    <Label htmlFor="target-specific" className="font-normal cursor-pointer">🎯 Người dùng cụ thể</Label>
                                </div>
                            </RadioGroup>
                        )}
                    />

                    {/* Role Selection (when ROLE is selected) */}
                    {targetType === 'ROLE' && (
                        <div className="space-y-3 pl-6 border-l-2 border-primary/30">
                            <div className="space-y-2">
                                <Label>Chọn vai trò</Label>
                                <Controller
                                    name="targetRole"
                                    control={control}
                                    render={({ field }) => (
                                        <RadioGroup
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            className="flex gap-4"
                                        >
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="DRIVER" id="role-driver" />
                                                <Label htmlFor="role-driver" className="font-normal cursor-pointer">🚗 Tài xế</Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="USER" id="role-user" />
                                                <Label htmlFor="role-user" className="font-normal cursor-pointer">👤 Khách hàng</Label>
                                            </div>
                                        </RadioGroup>
                                    )}
                                />
                                {errors.targetRole && <p className="text-sm text-destructive">{errors.targetRole.message}</p>}
                            </div>

                            {/* Loyalty Tier (when USER role is selected) */}
                            {targetRole === 'USER' && (
                                <div className="space-y-2">
                                    <Label>Hạng thành viên (Tùy chọn)</Label>
                                    <Controller
                                        name="loyaltyTier"
                                        control={control}
                                        render={({ field }) => (
                                            <div className="flex flex-wrap gap-2">
                                                {[
                                                    { label: '🥉 Thành viên', value: 'MEMBER' },
                                                    { label: '🥈 Bạc', value: 'SILVER' },
                                                    { label: '🥇 Vàng', value: 'GOLD' },
                                                    { label: '💎 Kim cương', value: 'DIAMOND' },
                                                ].map((tier) => (
                                                    <Button
                                                        key={tier.value}
                                                        type="button"
                                                        variant={field.value === tier.value ? "default" : "outline"}
                                                        size="sm"
                                                        className="text-xs"
                                                        onClick={() => field.onChange(field.value === tier.value ? undefined : tier.value)}
                                                    >
                                                        {tier.label}
                                                    </Button>
                                                ))}
                                            </div>
                                        )}
                                    />
                                    <p className="text-xs text-muted-foreground">Để trống để gửi cho tất cả khách hàng</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* User IDs Input (when SPECIFIC_USERS is selected) */}
                    {targetType === 'SPECIFIC_USERS' && (
                        <div className="space-y-2 pl-6 border-l-2 border-primary/30">
                            <Label htmlFor="userIds">ID người dùng (phân cách bằng dấu phẩy)</Label>
                            <Textarea
                                id="userIds"
                                {...register('userIds')}
                                placeholder="uuid-1, uuid-2, uuid-3"
                                className="min-h-[80px]"
                            />
                            {errors.userIds && <p className="text-sm text-destructive">{errors.userIds.message}</p>}
                            <p className="text-xs text-muted-foreground">Nhập UUID người dùng phân cách bằng dấu phẩy</p>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label>Loại lịch</Label>
                    <Controller
                        name="scheduleType"
                        control={control}
                        render={({ field }) => (
                            <RadioGroup
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                                className="flex flex-col space-y-1"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="ONE_TIME" id="one-time" />
                                    <Label htmlFor="one-time" className="font-normal cursor-pointer">Một lần (Ngày cụ thể)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="RECURRING" id="recurring" />
                                    <Label htmlFor="recurring" className="font-normal cursor-pointer">Lặp lại (Cron)</Label>
                                </div>
                            </RadioGroup>
                        )}
                    />
                </div>

                {scheduleType === 'ONE_TIME' && (
                    <div className="space-y-2">
                        <Label>Thời gian lên lịch (UTC)</Label>
                        <Controller
                            name="scheduleTime"
                            control={control}
                            render={({ field }) => (
                                <Popover modal={true}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {field.value ? format(field.value, "PPP HH:mm") : <span>Chọn ngày & giờ</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <div className="p-3 border-b border-border">
                                            <p className="text-xs text-muted-foreground mb-2">Chọn ngày</p>
                                            <Calendar mode="single" selected={field.value} onSelect={(date) => {
                                                // Combine date with current time selection if exists, else default to 00:00
                                                const newDate = date || new Date();
                                                if (field.value) {
                                                    newDate.setHours(field.value.getHours());
                                                    newDate.setMinutes(field.value.getMinutes());
                                                }
                                                field.onChange(newDate);
                                            }} initialFocus />
                                        </div>
                                        <div className="p-3">
                                            <p className="text-xs text-muted-foreground mb-2">Chọn giờ</p>
                                            <Input
                                                type="time"
                                                className="w-full"
                                                value={field.value ? format(field.value, 'HH:mm') : ''}
                                                onChange={(e) => {
                                                    const [hours, minutes] = e.target.value.split(':').map(Number);
                                                    const newDate = field.value ? new Date(field.value) : new Date();
                                                    newDate.setHours(hours);
                                                    newDate.setMinutes(minutes);
                                                    field.onChange(newDate);
                                                }}
                                            />
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            )}
                        />
                        {errors.scheduleTime && <p className="text-sm text-destructive">{errors.scheduleTime.message}</p>}
                        <p className="text-xs text-muted-foreground">Thông báo sẽ được gửi vào thời điểm cụ thể này.</p>
                    </div>
                )}

                {scheduleType === 'RECURRING' && (
                    <div className="space-y-3">
                        <Label>Mẫu nhanh</Label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { label: '🌅 Hàng ngày 9h', value: '0 9 * * *' },
                                { label: '🏢 Ngày thường 9h', value: '0 9 ? * MON-FRI' },
                                { label: '🔄 Mỗi giờ', value: '0 * * * *' },
                                { label: '⏱️ Mỗi 30 phút', value: '0/30 * * * ? *' },
                                { label: '📅 Hàng tuần T2', value: '0 9 ? * MON' },
                            ].map((preset) => (
                                <Button
                                    key={preset.value}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => setValue('cronExpression', preset.value)}
                                >
                                    {preset.label}
                                </Button>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="cronExpression">Hoặc nhập biểu thức Cron tùy chỉnh</Label>
                            <Input id="cronExpression" {...register('cronExpression')} placeholder="VD: 0 9 * * *" />
                            {errors.cronExpression && <p className="text-sm text-destructive">{errors.cronExpression.message}</p>}
                        </div>

                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <span>Định dạng: Phút Giờ Ngày Tháng NgàyTrongTuần.</span>
                            <a href="https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-cron-expressions.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                Hướng dẫn AWS Cron <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onCancel} type="button">Hủy</Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Lên lịch
                </Button>
            </DialogFooter>
        </form>
    );
}

export function NotificationsManager() {
    const [notifications, setNotifications] = React.useState<ScheduledNotification[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [deletingId, setDeletingId] = React.useState<number | null>(null);
    const { toast } = useToast();

    const fetchData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await getScheduledNotifications();
            // API returns: {success, data: {data: [...], total, page}}
            let notifArray: ScheduledNotification[] = [];
            if (Array.isArray(response)) {
                notifArray = response;
            } else if (response?.data?.data && Array.isArray(response.data.data)) {
                // Nested structure: {data: {data: [...]}}
                notifArray = response.data.data;
            } else if (response?.data && Array.isArray(response.data)) {
                // Simple structure: {data: [...]}
                notifArray = response.data;
            }
            setNotifications(notifArray);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể tải thông báo', description: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCancel = async (id: number) => {
        setDeletingId(id);
        try {
            await cancelScheduledNotification(id);
            toast({ title: 'Thành công', description: 'Đã hủy lịch.' });
            fetchData();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể hủy', description: err.message });
        } finally {
            setDeletingId(null);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Hoạt động</Badge>;
            case 'COMPLETED': return <Badge variant="secondary">Hoàn thành</Badge>;
            case 'CANCELLED': return <Badge variant="destructive">Đã hủy</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Thông báo đã lên lịch</CardTitle>
                    <CardDescription>Quản lý thông báo đẩy tự động qua AWS EventBridge.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex justify-end">
                        <Button onClick={() => setIsFormOpen(true)}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Lên lịch mới
                        </Button>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tiêu đề</TableHead>
                                <TableHead>Loại</TableHead>
                                <TableHead>Lịch / Cron</TableHead>
                                <TableHead>Trạng thái</TableHead>
                                <TableHead>Ngày tạo</TableHead>
                                <TableHead className="text-right">Thao tác</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : notifications.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">
                                        Không tìm thấy thông báo đã lên lịch.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                notifications.map(notif => (
                                    <TableRow key={notif.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex flex-col">
                                                <span>{notif.title}</span>
                                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{notif.body}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {notif.cronExpression ? (
                                                <div className="flex items-center text-xs text-muted-foreground"><Repeat className="w-3 h-3 mr-1" /> Lặp lại</div>
                                            ) : (
                                                <div className="flex items-center text-xs text-muted-foreground"><Clock className="w-3 h-3 mr-1" /> Một lần</div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <code className="text-xs bg-muted p-1 rounded">
                                                {notif.cronExpression || (notif.scheduleTime ? format(new Date(notif.scheduleTime), 'PP p') : 'N/A')}
                                            </code>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(notif.status)}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {format(new Date(notif.createdAt), 'dd/MM/yy HH:mm')}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {notif.status === 'ACTIVE' && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    disabled={deletingId === notif.id}
                                                    onClick={() => handleCancel(notif.id)}
                                                >
                                                    {deletingId === notif.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="sm:max-w-lg">
                    <NotificationForm
                        onCancel={() => setIsFormOpen(false)}
                        onSaveSuccess={() => { setIsFormOpen(false); fetchData(); }}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}
