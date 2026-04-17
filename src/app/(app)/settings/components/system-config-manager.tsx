
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { getSystemConfigs, updateSystemConfig } from '@/lib/api';
import type { SystemConfig } from '@/lib/types';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

export function SystemConfigManager() {
    const [configs, setConfigs] = React.useState<SystemConfig[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSaving, setIsSaving] = React.useState<Record<string, boolean>>({});
    const { toast } = useToast();

    const fetchConfigs = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getSystemConfigs();
            setConfigs(data);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể tải cấu hình', description: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    React.useEffect(() => {
        fetchConfigs();
    }, [fetchConfigs]);

    const handleValueChange = (key: string, value: string) => {
        setConfigs(currentConfigs =>
            currentConfigs.map(c => c.key === key ? { ...c, value } : c)
        );
    };

    const handleSave = async (config: SystemConfig) => {
        setIsSaving(prev => ({ ...prev, [config.key]: true }));
        try {
            await updateSystemConfig(config.key, config.value, config.description);
            toast({ title: 'Thành công', description: `Cấu hình "${config.key}" đã được cập nhật.` });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể cập nhật cấu hình', description: err.message });
            // Optionally, revert the change in UI on failure
            fetchConfigs();
        } finally {
            setIsSaving(prev => ({ ...prev, [config.key]: false }));
        }
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Cấu hình hệ thống</CardTitle>
                    <CardDescription>Quản lý các cài đặt và biến toàn hệ thống.</CardDescription>
                </CardHeader>
                <CardContent className="h-48 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Cấu hình hệ thống</CardTitle>
                <CardDescription>Quản lý các cài đặt và biến toàn hệ thống. Thay đổi có thể cần khởi động lại ứng dụng để có hiệu lực đầy đủ.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[25%]">Khóa</TableHead>
                            <TableHead className="w-[45%]">Mô tả</TableHead>
                            <TableHead className="w-[20%]">Giá trị</TableHead>
                            <TableHead className="w-[10%] text-right">Thao tác</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {configs.map(config => (
                            <TableRow key={config.key}>
                                <TableCell className="font-mono text-sm">{config.key}</TableCell>
                                <TableCell className="text-muted-foreground">{config.description}</TableCell>
                                <TableCell>
                                    <Input
                                        value={config.value}
                                        onChange={(e) => handleValueChange(config.key, e.target.value)}
                                        className="h-8"
                                    />
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" onClick={() => handleSave(config)} disabled={isSaving[config.key]}>
                                        {isSaving[config.key] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

