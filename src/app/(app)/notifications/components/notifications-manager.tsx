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
    title: z.string().min(1, { message: "Title is required" }),
    body: z.string().min(1, { message: "Body is required" }),
    imageUrl: z.string().url({ message: "Invalid URL" }).optional().or(z.literal('')),
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
    message: "Schedule time is required for one-time notifications",
    path: ["scheduleTime"],
}).refine((data) => {
    if (data.scheduleType === 'RECURRING' && !data.cronExpression) {
        return false;
    }
    return true;
}, {
    message: "Cron expression is required for recurring notifications",
    path: ["cronExpression"],
}).refine((data) => {
    if (data.targetType === 'ROLE' && !data.targetRole) {
        return false;
    }
    return true;
}, {
    message: "Please select a role",
    path: ["targetRole"],
}).refine((data) => {
    if (data.targetType === 'SPECIFIC_USERS' && !data.userIds?.trim()) {
        return false;
    }
    return true;
}, {
    message: "Please enter at least one user ID",
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
            toast({ title: "Success", description: "Notification scheduled successfully." });
            onSaveSuccess();
            reset();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to schedule notification', description: err.message });
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
                <DialogTitle>Schedule Notification</DialogTitle>
                <DialogDescription>Create a new push notification schedule.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto p-1">
                <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" {...register('title')} placeholder="Notification Title" />
                    {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="body">Body</Label>
                    <Textarea id="body" {...register('body')} placeholder="Notification Body Content" />
                    {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="imageUrl">Image URL (Optional)</Label>
                    <Input id="imageUrl" {...register('imageUrl')} placeholder="https://..." />
                    {errors.imageUrl && <p className="text-sm text-destructive">{errors.imageUrl.message}</p>}
                </div>

                {/* Target Audience Section */}
                <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                    <Label className="text-sm font-semibold">Target Audience</Label>
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
                                    <Label htmlFor="target-all" className="font-normal cursor-pointer">📢 All Users (Broadcast)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="ROLE" id="target-role" />
                                    <Label htmlFor="target-role" className="font-normal cursor-pointer">👥 By Role</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="SPECIFIC_USERS" id="target-specific" />
                                    <Label htmlFor="target-specific" className="font-normal cursor-pointer">🎯 Specific Users</Label>
                                </div>
                            </RadioGroup>
                        )}
                    />

                    {/* Role Selection (when ROLE is selected) */}
                    {targetType === 'ROLE' && (
                        <div className="space-y-3 pl-6 border-l-2 border-primary/30">
                            <div className="space-y-2">
                                <Label>Select Role</Label>
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
                                                <Label htmlFor="role-driver" className="font-normal cursor-pointer">🚗 Drivers</Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="USER" id="role-user" />
                                                <Label htmlFor="role-user" className="font-normal cursor-pointer">👤 Customers</Label>
                                            </div>
                                        </RadioGroup>
                                    )}
                                />
                                {errors.targetRole && <p className="text-sm text-destructive">{errors.targetRole.message}</p>}
                            </div>

                            {/* Loyalty Tier (when USER role is selected) */}
                            {targetRole === 'USER' && (
                                <div className="space-y-2">
                                    <Label>Loyalty Tier (Optional)</Label>
                                    <Controller
                                        name="loyaltyTier"
                                        control={control}
                                        render={({ field }) => (
                                            <div className="flex flex-wrap gap-2">
                                                {[
                                                    { label: '🥉 Member', value: 'MEMBER' },
                                                    { label: '🥈 Silver', value: 'SILVER' },
                                                    { label: '🥇 Gold', value: 'GOLD' },
                                                    { label: '💎 Diamond', value: 'DIAMOND' },
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
                                    <p className="text-xs text-muted-foreground">Leave empty to send to all customers</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* User IDs Input (when SPECIFIC_USERS is selected) */}
                    {targetType === 'SPECIFIC_USERS' && (
                        <div className="space-y-2 pl-6 border-l-2 border-primary/30">
                            <Label htmlFor="userIds">User IDs (comma-separated)</Label>
                            <Textarea
                                id="userIds"
                                {...register('userIds')}
                                placeholder="uuid-1, uuid-2, uuid-3"
                                className="min-h-[80px]"
                            />
                            {errors.userIds && <p className="text-sm text-destructive">{errors.userIds.message}</p>}
                            <p className="text-xs text-muted-foreground">Enter user UUIDs separated by commas</p>
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <Label>Schedule Type</Label>
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
                                    <Label htmlFor="one-time" className="font-normal cursor-pointer">One-time (Specific Date)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="RECURRING" id="recurring" />
                                    <Label htmlFor="recurring" className="font-normal cursor-pointer">Recurring (Cron)</Label>
                                </div>
                            </RadioGroup>
                        )}
                    />
                </div>

                {scheduleType === 'ONE_TIME' && (
                    <div className="space-y-2">
                        <Label>Schedule Time (UTC)</Label>
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
                                            {field.value ? format(field.value, "PPP HH:mm") : <span>Pick a date & time</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <div className="p-3 border-b border-border">
                                            <p className="text-xs text-muted-foreground mb-2">Select Date</p>
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
                                            <p className="text-xs text-muted-foreground mb-2">Select Time</p>
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
                        <p className="text-xs text-muted-foreground">Notification will be sent at this specific time.</p>
                    </div>
                )}

                {scheduleType === 'RECURRING' && (
                    <div className="space-y-3">
                        <Label>Quick Presets</Label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { label: '🌅 Daily 9AM', value: '0 9 * * *' },
                                { label: '🏢 Weekdays 9AM', value: '0 9 ? * MON-FRI' },
                                { label: '🔄 Every Hour', value: '0 * * * *' },
                                { label: '⏱️ Every 30 min', value: '0/30 * * * ? *' },
                                { label: '📅 Weekly Monday', value: '0 9 ? * MON' },
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
                            <Label htmlFor="cronExpression">Or enter custom Cron Expression</Label>
                            <Input id="cronExpression" {...register('cronExpression')} placeholder="e.g. 0 9 * * *" />
                            {errors.cronExpression && <p className="text-sm text-destructive">{errors.cronExpression.message}</p>}
                        </div>

                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <span>Format: Minutes Hours Day Month DayOfWeek.</span>
                            <a href="https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-cron-expressions.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                AWS Cron Guide <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onCancel} type="button">Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Schedule
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
            toast({ variant: 'destructive', title: 'Failed to fetch notifications', description: err.message });
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
            toast({ title: 'Success', description: 'Schedule cancelled.' });
            fetchData();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Failed to cancel', description: err.message });
        } finally {
            setDeletingId(null);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>;
            case 'COMPLETED': return <Badge variant="secondary">Completed</Badge>;
            case 'CANCELLED': return <Badge variant="destructive">Cancelled</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Scheduled Notifications</CardTitle>
                    <CardDescription>Manage automated push notifications via AWS EventBridge.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4 flex justify-end">
                        <Button onClick={() => setIsFormOpen(true)}>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Schedule New
                        </Button>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Title</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Schedule / Cron</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created At</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
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
                                        No scheduled notifications found.
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
                                                <div className="flex items-center text-xs text-muted-foreground"><Repeat className="w-3 h-3 mr-1" /> Recurring</div>
                                            ) : (
                                                <div className="flex items-center text-xs text-muted-foreground"><Clock className="w-3 h-3 mr-1" /> One-time</div>
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
