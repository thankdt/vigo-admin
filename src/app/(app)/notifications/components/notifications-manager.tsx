'use client';
import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
    getScheduledNotifications,
    createScheduledNotification,
    cancelScheduledNotification,
    broadcastNotificationNow,
    previewNotificationAudience,
    type NotificationPayload,
} from '@/lib/api';
import type { ScheduledNotification, GetApiResponse, NotificationAudience } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
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
import { parseVnDateTimeInput, vnDateTimeInputValue } from '@/lib/date-input-utils';
import { Loader2, PlusCircle, Trash2, Clock, Repeat, Bell, ExternalLink, Send, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Hiển thị mốc UTC từ backend theo giờ VN. Toàn bộ ngày/giờ nghiệp vụ của Vigo
 * là giờ Việt Nam, không phụ thuộc timezone máy admin.
 */
function formatVn(iso: string | null | undefined, withTime = true): string {
    if (!iso) return 'N/A';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    });
}

const notificationSchema = z.object({
    title: z.string().min(1, { message: "Tiêu đề là bắt buộc" }),
    body: z.string().min(1, { message: "Nội dung là bắt buộc" }),
    imageUrl: z.string().url({ message: "URL không hợp lệ" }).optional().or(z.literal('')),
    targetType: z.enum(['ALL', 'APP', 'SPECIFIC_USERS']),
    targetApp: z.enum(['DRIVER', 'CUSTOMER']).optional(),
    loyaltyTier: z.enum(['MEMBER', 'SILVER', 'GOLD', 'DIAMOND']).optional(),
    userIds: z.string().optional(), // Comma-separated user IDs
    scheduleType: z.enum(['NOW', 'ONE_TIME', 'RECURRING']),
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
    if (data.targetType === 'APP' && !data.targetApp) {
        return false;
    }
    return true;
}, {
    message: "Vui lòng chọn app nhận",
    path: ["targetApp"],
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

/** Gom nội dung + đối tượng nhận thành payload chung cho cả 2 đường gửi. */
function buildPayload(data: NotificationFormValues): NotificationPayload {
    const payload: NotificationPayload = {
        title: data.title,
        body: data.body,
        imageUrl: data.imageUrl || undefined,
        targetType: data.targetType,
    };

    if (data.targetType === 'APP') {
        payload.targetData = { appId: data.targetApp };
        if (data.targetApp === 'CUSTOMER' && data.loyaltyTier) {
            payload.targetData.loyaltyTier = data.loyaltyTier;
        }
    } else if (data.targetType === 'SPECIFIC_USERS' && data.userIds) {
        payload.targetData = {
            userIds: data.userIds.split(',').map(id => id.trim()).filter(Boolean),
        };
    }

    return payload;
}

function NotificationForm({ onSaveSuccess, onCancel }: { onSaveSuccess: () => void, onCancel: () => void }) {
    const { toast } = useToast();
    const [pendingNow, setPendingNow] = React.useState<{
        payload: NotificationPayload;
        audience: NotificationAudience | null;
    } | null>(null);
    const [sendingNow, setSendingNow] = React.useState(false);

    const { register, handleSubmit, control, watch, setValue, formState: { errors, isSubmitting }, reset } = useForm<NotificationFormValues>({
        resolver: zodResolver(notificationSchema),
        defaultValues: {
            scheduleType: 'NOW',
            targetType: 'ALL',
        },
    });

    const scheduleType = watch('scheduleType');
    const targetType = watch('targetType');
    const targetApp = watch('targetApp');

    const onSubmit = async (data: NotificationFormValues) => {
        const payload = buildPayload(data);

        // Bắn ngay là hành động KHÔNG hoàn tác được (có thể chạm hàng chục nghìn
        // thiết bị) → luôn qua dialog xác nhận kèm số người nhận ước tính.
        if (data.scheduleType === 'NOW') {
            let audience: NotificationAudience | null = null;
            try {
                audience = await previewNotificationAudience({
                    targetType: payload.targetType,
                    targetData: payload.targetData,
                });
            } catch {
                // Đếm trước hỏng thì vẫn cho gửi, chỉ là không hiện được con số.
            }
            setPendingNow({ payload, audience });
            return;
        }

        try {
            await createScheduledNotification({
                ...payload,
                ...(data.scheduleType === 'ONE_TIME' && data.scheduleTime
                    ? { scheduleTime: data.scheduleTime.toISOString() }
                    : {}),
                ...(data.scheduleType === 'RECURRING' && data.cronExpression
                    ? { cronExpression: data.cronExpression }
                    : {}),
            });
            toast({ title: "Thành công", description: "Đã lên lịch thông báo thành công." });
            onSaveSuccess();
            reset();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể lên lịch thông báo', description: err.message });
        }
    };

    const confirmSendNow = async () => {
        if (!pendingNow) return;
        setSendingNow(true);
        try {
            await broadcastNotificationNow(pendingNow.payload);
            toast({ title: 'Đã gửi', description: 'Thông báo đang được bắn tới người nhận.' });
            setPendingNow(null);
            onSaveSuccess();
            reset();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không gửi được', description: err.message });
        } finally {
            setSendingNow(false);
        }
    };

    return (
        <>
        <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
                <DialogTitle>Tạo thông báo</DialogTitle>
                <DialogDescription>Bắn ngay hoặc hẹn lịch thông báo đẩy.</DialogDescription>
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
                                    <RadioGroupItem value="APP" id="target-app" />
                                    <Label htmlFor="target-app" className="font-normal cursor-pointer">📱 Theo app</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="SPECIFIC_USERS" id="target-specific" />
                                    <Label htmlFor="target-specific" className="font-normal cursor-pointer">🎯 Người dùng cụ thể</Label>
                                </div>
                            </RadioGroup>
                        )}
                    />

                    {targetType === 'APP' && (
                        <div className="space-y-3 pl-6 border-l-2 border-primary/30">
                            <div className="space-y-2">
                                <Label>Chọn app nhận</Label>
                                <Controller
                                    name="targetApp"
                                    control={control}
                                    render={({ field }) => (
                                        <RadioGroup
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            className="flex gap-4"
                                        >
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="DRIVER" id="app-driver" />
                                                <Label htmlFor="app-driver" className="font-normal cursor-pointer">🚗 App tài xế</Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="CUSTOMER" id="app-customer" />
                                                <Label htmlFor="app-customer" className="font-normal cursor-pointer">👤 App khách hàng</Label>
                                            </div>
                                        </RadioGroup>
                                    )}
                                />
                                {errors.targetApp && <p className="text-sm text-destructive">{errors.targetApp.message}</p>}
                                <p className="text-xs text-muted-foreground">
                                    Thiết bị chưa cập nhật app mới vẫn lọc theo vai trò tài khoản như trước.
                                    Nên tới khi người dùng cập nhật app: chọn &ldquo;App tài xế&rdquo; có thể lọt sang app
                                    khách của tài xế, còn chọn &ldquo;App khách hàng&rdquo; sẽ bỏ sót những tài xế chỉ
                                    dùng app khách.
                                </p>
                            </div>

                            {targetApp === 'CUSTOMER' && (
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
                    <Label>Thời điểm gửi</Label>
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
                                    <RadioGroupItem value="NOW" id="send-now" />
                                    <Label htmlFor="send-now" className="font-normal cursor-pointer">⚡ Bắn ngay</Label>
                                </div>
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
                        <Label>Thời gian lên lịch (giờ VN)</Label>
                        <Controller
                            name="scheduleTime"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    type="datetime-local"
                                    // Ghim giờ VN cả hai chiều — nhãn ghi "giờ VN" thì
                                    // phải đúng kể cả khi máy admin ở múi giờ khác.
                                    value={vnDateTimeInputValue(field.value)}
                                    onChange={(e) => field.onChange(parseVnDateTimeInput(e.target.value))}
                                />
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
                            {/* Cron kiểu Unix 5 trường — backend tự chuyển sang định dạng 6 trường
                                của AWS. Các mẫu cũ ở đây từng bị AWS từ chối và lỗi bị nuốt mất. */}
                            {[
                                { label: '🌅 Hàng ngày 9h', value: '0 9 * * *' },
                                { label: '🏢 Ngày thường 9h', value: '0 9 * * MON-FRI' },
                                { label: '🔄 Mỗi giờ', value: '0 * * * *' },
                                { label: '⏱️ Mỗi 30 phút', value: '*/30 * * * *' },
                                { label: '📅 Hàng tuần T2', value: '0 9 * * MON' },
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

                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                            <span>Định dạng: Phút Giờ Ngày Tháng ThứTrongTuần — chạy theo <b>giờ VN</b>.</span>
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
                    {scheduleType === 'NOW' ? (<><Send className="mr-2 h-4 w-4" /> Bắn ngay</>) : 'Lên lịch'}
                </Button>
            </DialogFooter>
        </form>

        <ConfirmSendDialog
            pending={pendingNow}
            sending={sendingNow}
            onCancel={() => setPendingNow(null)}
            onConfirm={confirmSendNow}
        />
        </>
    );
}

function ConfirmSendDialog({
    pending,
    sending,
    onCancel,
    onConfirm,
}: {
    pending: { payload: NotificationPayload; audience: NotificationAudience | null } | null;
    sending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <Dialog open={!!pending} onOpenChange={(open) => { if (!open && !sending) onCancel(); }}>
            <DialogContent className="sm:max-w-md">
                {pending && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-destructive" /> Xác nhận bắn ngay
                            </DialogTitle>
                            <DialogDescription>
                                Thông báo sẽ được gửi ngay lập tức và <b>không thể thu hồi</b>.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 text-sm">
                            <div className="rounded-md border p-3">
                                <p className="font-medium">{pending.payload.title}</p>
                                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{pending.payload.body}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Người nhận ước tính: </span>
                                {pending.audience ? (
                                    <b>{pending.audience.devices.toLocaleString('vi-VN')} thiết bị / {pending.audience.users.toLocaleString('vi-VN')} người</b>
                                ) : (
                                    <span className="text-muted-foreground">không đếm được</span>
                                )}
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={onCancel} disabled={sending}>Huỷ</Button>
                            <Button onClick={onConfirm} disabled={sending}>
                                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Gửi ngay
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

/** Mô tả đối tượng nhận cho bảng + dialog chi tiết. */
function describeTarget(notif: ScheduledNotification): string {
    switch (notif.targetType) {
        case 'APP':
            return notif.targetData?.appId === 'DRIVER' ? '🚗 App tài xế' : '👤 App khách hàng';
        case 'ROLE':
            // Lịch cũ. Giữ hiển thị để tra lại lịch sử; form không tạo mới kiểu này nữa.
            return notif.targetData?.role === 'DRIVER' ? '🚗 Vai trò tài xế (cũ)' : '👤 Vai trò khách (cũ)';
        case 'SPECIFIC_USERS':
            return `🎯 ${notif.targetData?.userIds?.length ?? 0} người`;
        default:
            return '📢 Tất cả';
    }
}

export function NotificationsManager() {
    const [notifications, setNotifications] = React.useState<ScheduledNotification[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isFormOpen, setIsFormOpen] = React.useState(false);
    const [deletingId, setDeletingId] = React.useState<number | null>(null);
    const [detailNotif, setDetailNotif] = React.useState<ScheduledNotification | null>(null);
    const [resend, setResend] = React.useState<{
        payload: NotificationPayload;
        audience: NotificationAudience | null;
    } | null>(null);
    const [resending, setResending] = React.useState(false);
    const { toast } = useToast();

    const fetchData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            // Envelope không nhất quán giữa các endpoint (có chỗ nested
            // {data:{data:[]}}, có chỗ flat {data:[]}, hoặc mảng trần) → nhận
            // diện shape theo runtime. Cast sang union permissive để type-check
            // 3 nhánh; LOGIC runtime giữ nguyên.
            const payload = (await getScheduledNotifications()) as unknown as
                | ScheduledNotification[]
                | { data?: ScheduledNotification[] | { data?: ScheduledNotification[] } };
            let notifArray: ScheduledNotification[] = [];
            if (Array.isArray(payload)) {
                notifArray = payload;
            } else if (payload?.data && !Array.isArray(payload.data) && Array.isArray(payload.data.data)) {
                // Nested structure: {data: {data: [...]}}
                notifArray = payload.data.data;
            } else if (Array.isArray(payload?.data)) {
                // Simple structure: {data: [...]}
                notifArray = payload.data;
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

    /** Bắn lại nguyên nội dung + đối tượng của một dòng đã có. */
    const openResend = async (notif: ScheduledNotification) => {
        const payload: NotificationPayload = {
            title: notif.title,
            body: notif.body,
            imageUrl: notif.imageUrl || undefined,
            targetType: notif.targetType ?? 'ALL',
            targetData: notif.targetData ?? undefined,
        };
        let audience: NotificationAudience | null = null;
        try {
            audience = await previewNotificationAudience({
                targetType: payload.targetType,
                targetData: payload.targetData,
            });
        } catch {
            // vẫn cho gửi, chỉ không hiện được số
        }
        setResend({ payload, audience });
    };

    const confirmResend = async () => {
        if (!resend) return;
        setResending(true);
        try {
            await broadcastNotificationNow(resend.payload);
            toast({ title: 'Đã gửi', description: 'Thông báo đang được bắn tới người nhận.' });
            setResend(null);
            fetchData();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không gửi được', description: err.message });
        } finally {
            setResending(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Hoạt động</Badge>;
            case 'COMPLETED': return <Badge variant="secondary">Hoàn thành</Badge>;
            case 'CANCELLED': return <Badge variant="destructive">Đã hủy</Badge>;
            case 'FAILED': return <Badge variant="destructive">Lỗi lịch</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getKindLabel = (notif: ScheduledNotification) => {
        if (notif.cronExpression) {
            return <div className="flex items-center text-xs text-muted-foreground"><Repeat className="w-3 h-3 mr-1" /> Lặp lại</div>;
        }
        // Lịch lỗi cũng có scheduleArn = null (createSchedule xoá ARN khi AWS từ
        // chối) nên phải loại ra, không thì hiện nhầm là "Bắn ngay".
        if (!notif.scheduleArn && notif.status === 'COMPLETED') {
            return <div className="flex items-center text-xs text-muted-foreground"><Send className="w-3 h-3 mr-1" /> Bắn ngay</div>;
        }
        return <div className="flex items-center text-xs text-muted-foreground"><Clock className="w-3 h-3 mr-1" /> Một lần</div>;
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Thông báo đẩy</CardTitle>
                    <CardDescription>Bắn ngay hoặc hẹn lịch qua AWS EventBridge. Mọi mốc thời gian hiển thị theo giờ VN.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex justify-end">
                        <Button onClick={() => setIsFormOpen(true)}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Tạo thông báo
                        </Button>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tiêu đề</TableHead>
                                <TableHead>Đối tượng</TableHead>
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
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : notifications.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        Chưa có thông báo nào.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                notifications.map(notif => (
                                    <TableRow
                                        key={notif.id}
                                        className="cursor-pointer"
                                        onClick={() => setDetailNotif(notif)}
                                    >
                                        <TableCell className="font-medium">
                                            <div className="flex flex-col">
                                                <span>{notif.title}</span>
                                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{notif.body}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">{describeTarget(notif)}</TableCell>
                                        <TableCell>{getKindLabel(notif)}</TableCell>
                                        <TableCell>
                                            <code className="text-xs bg-muted p-1 rounded">
                                                {notif.cronExpression || formatVn(notif.scheduleTime)}
                                            </code>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(notif.status)}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {formatVn(notif.createdAt)}
                                        </TableCell>
                                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                title="Bắn lại ngay"
                                                onClick={() => openResend(notif)}
                                            >
                                                <Send className="h-4 w-4" />
                                            </Button>
                                            {notif.status === 'ACTIVE' && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Huỷ lịch"
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

            <ConfirmSendDialog
                pending={resend}
                sending={resending}
                onCancel={() => setResend(null)}
                onConfirm={confirmResend}
            />

            <Dialog open={!!detailNotif} onOpenChange={(open) => { if (!open) setDetailNotif(null); }}>
                <DialogContent className="sm:max-w-lg">
                    {detailNotif && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <Bell className="h-5 w-5" /> {detailNotif.title}
                                </DialogTitle>
                                <DialogDescription>Chi tiết thông báo</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                                {detailNotif.imageUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={detailNotif.imageUrl}
                                        alt={detailNotif.title}
                                        className="max-h-48 w-full rounded-md border bg-muted object-contain"
                                    />
                                )}
                                <div>
                                    <Label className="text-xs text-muted-foreground">Nội dung</Label>
                                    <p className="mt-1 whitespace-pre-wrap text-sm">{detailNotif.body}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Trạng thái</Label>
                                        <div className="mt-1">{getStatusBadge(detailNotif.status)}</div>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Loại</Label>
                                        <div className="mt-1">{getKindLabel(detailNotif)}</div>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Đối tượng nhận</Label>
                                        <div className="mt-1 text-muted-foreground">{describeTarget(detailNotif)}</div>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">ID</Label>
                                        <div className="mt-1 text-muted-foreground">#{detailNotif.id}</div>
                                    </div>
                                    <div className="col-span-2">
                                        <Label className="text-xs text-muted-foreground">
                                            {detailNotif.cronExpression ? 'Biểu thức Cron (giờ VN)' : 'Thời gian gửi (giờ VN)'}
                                        </Label>
                                        <div className="mt-1">
                                            <code className="rounded bg-muted p-1 text-xs">
                                                {detailNotif.cronExpression || formatVn(detailNotif.scheduleTime)}
                                            </code>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Ngày tạo</Label>
                                        <div className="mt-1 text-muted-foreground">
                                            {formatVn(detailNotif.createdAt)}
                                        </div>
                                    </div>
                                </div>
                                {detailNotif.scheduleArn && (
                                    <div>
                                        <Label className="text-xs text-muted-foreground">Schedule ARN</Label>
                                        <p className="mt-1 break-all text-xs text-muted-foreground">{detailNotif.scheduleArn}</p>
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                {detailNotif.status === 'ACTIVE' && (
                                    <Button
                                        variant="destructive"
                                        disabled={deletingId === detailNotif.id}
                                        onClick={() => { handleCancel(detailNotif.id); setDetailNotif(null); }}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" /> Hủy lịch
                                    </Button>
                                )}
                                <Button variant="outline" onClick={() => setDetailNotif(null)}>Đóng</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
