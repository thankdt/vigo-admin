'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSystemConfigs, updateSystemConfig } from '@/lib/api';
import type { SystemConfig } from '@/lib/types';
import { Loader2, Save, Percent, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Single source of truth for the keys this UI manages. Adding a new commission/vinow
// knob here keeps the rest of the component generic.
type FieldDef = {
    key: string;
    label: string;
    description: string;
    kind: 'rate' | 'minutes';
    defaultValue: string; // Used to seed the form if the key isn't in DB yet (migration not run).
    min: number;
    max: number;
};

const FIELDS: FieldDef[] = [
    {
        key: 'BOOKING_COMMISSION_RATE',
        label: 'Tỉ lệ hoa hồng (booking thường)',
        description: 'Phần trăm app thu trên mỗi đơn (0–100%). Áp dụng cho mọi đơn không phải Vi-now.',
        kind: 'rate',
        defaultValue: '0.2',
        min: 0,
        max: 100,
    },
    {
        key: 'VINOW_COMMISSION_RATE',
        label: 'Tỉ lệ hoa hồng (Vi-now / đặt trực tiếp)',
        description: 'Áp dụng khi tài xế nhận đơn bằng mã Vi-now (không qua dispatch). Thường thấp hơn rate thường.',
        kind: 'rate',
        defaultValue: '0.10',
        min: 0,
        max: 100,
    },
    {
        key: 'VINOW_CODE_TTL_MINUTES',
        label: 'Thời gian hiệu lực mã Vi-now (phút)',
        description: 'Mã đặt xe Vi-now sẽ tự hết hạn sau khoảng thời gian này nếu không có tài xế nhận.',
        kind: 'minutes',
        defaultValue: '30',
        min: 1,
        max: 1440,
    },
];

// Backend stores rates as decimals 0–1; UI shows them as percentages 0–100.
// Keeping conversion in one place avoids accidental "0.10 typed as 10%" mistakes.
const decimalToPercent = (decimal: string): string => {
    const n = Number(decimal);
    if (!Number.isFinite(n)) return '';
    // Round to 2 decimals to avoid floating-point ugliness like 0.1 → 9.999999999.
    return String(Math.round(n * 10000) / 100);
};

const percentToDecimal = (percent: string): string => {
    const n = Number(percent);
    if (!Number.isFinite(n)) return '';
    return String(Math.round((n / 100) * 10000) / 10000);
};

type FieldState = {
    inputValue: string;       // What the user sees/types (percentage or minutes)
    persistedDecimal: string; // What the DB has (decimal for rate, raw int for minutes) — used to detect dirty
    description: string;
};

export function CommissionConfigManager() {
    const [fieldStates, setFieldStates] = React.useState<Record<string, FieldState>>({});
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSaving, setIsSaving] = React.useState<Record<string, boolean>>({});
    const { toast } = useToast();

    const loadConfigs = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const configs = await getSystemConfigs();
            const byKey = new Map(configs.map((c: SystemConfig) => [c.key, c]));
            const next: Record<string, FieldState> = {};
            for (const f of FIELDS) {
                const existing = byKey.get(f.key);
                // Falls back to defaultValue when migration hasn't seeded the key yet.
                // Saving from this UI will create the row via the upsert endpoint.
                const stored = existing?.value ?? f.defaultValue;
                const display = f.kind === 'rate' ? decimalToPercent(stored) : stored;
                next[f.key] = {
                    inputValue: display,
                    persistedDecimal: stored,
                    description: existing?.description ?? f.description,
                };
            }
            setFieldStates(next);
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể tải cấu hình', description: err.message });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    React.useEffect(() => {
        loadConfigs();
    }, [loadConfigs]);

    const handleChange = (key: string, value: string) => {
        setFieldStates((prev) => ({
            ...prev,
            [key]: { ...prev[key], inputValue: value },
        }));
    };

    const handleSave = async (field: FieldDef) => {
        const state = fieldStates[field.key];
        if (!state) return;

        const raw = state.inputValue.trim();
        const numeric = Number(raw);
        if (raw === '' || !Number.isFinite(numeric) || numeric < field.min || numeric > field.max) {
            toast({
                variant: 'destructive',
                title: 'Giá trị không hợp lệ',
                description: `Vui lòng nhập số từ ${field.min} đến ${field.max}.`,
            });
            return;
        }

        const persistValue = field.kind === 'rate' ? percentToDecimal(raw) : String(Math.round(numeric));

        setIsSaving((prev) => ({ ...prev, [field.key]: true }));
        try {
            await updateSystemConfig(field.key, persistValue, state.description);
            setFieldStates((prev) => ({
                ...prev,
                [field.key]: { ...prev[field.key], persistedDecimal: persistValue },
            }));
            toast({ title: 'Đã lưu', description: `${field.label} đã được cập nhật.` });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Không thể cập nhật', description: err.message });
        } finally {
            setIsSaving((prev) => ({ ...prev, [field.key]: false }));
        }
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Tỉ lệ ăn chia & Vi-now</CardTitle>
                    <CardDescription>Cấu hình tỉ lệ hoa hồng và thời gian hiệu lực mã Vi-now.</CardDescription>
                </CardHeader>
                <CardContent className="h-48 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Tỉ lệ ăn chia & Vi-now</CardTitle>
                <CardDescription>
                    Cấu hình tỉ lệ hoa hồng app thu trên mỗi đơn và thời gian hiệu lực mã Vi-now.
                    Thay đổi có hiệu lực ngay với các đơn mới.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {FIELDS.map((field) => {
                    const state = fieldStates[field.key];
                    if (!state) return null;
                    const isDirty = field.kind === 'rate'
                        ? percentToDecimal(state.inputValue) !== state.persistedDecimal
                        : state.inputValue.trim() !== state.persistedDecimal;
                    const Icon = field.kind === 'rate' ? Percent : Clock;
                    const suffix = field.kind === 'rate' ? '%' : 'phút';

                    return (
                        <div key={field.key} className="rounded-lg border p-4 space-y-3">
                            <div className="flex items-start gap-2">
                                <Icon className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                                <div className="flex-1 space-y-1">
                                    <Label htmlFor={`field-${field.key}`} className="text-base font-medium">
                                        {field.label}
                                    </Label>
                                    <p className="text-sm text-muted-foreground">{field.description}</p>
                                    <p className="text-xs font-mono text-muted-foreground/70">
                                        Khóa: {field.key}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 pl-6">
                                <Input
                                    id={`field-${field.key}`}
                                    type="number"
                                    inputMode="decimal"
                                    step={field.kind === 'rate' ? '0.1' : '1'}
                                    min={field.min}
                                    max={field.max}
                                    value={state.inputValue}
                                    onChange={(e) => handleChange(field.key, e.target.value)}
                                    className="max-w-[140px]"
                                />
                                <span className="text-sm text-muted-foreground">{suffix}</span>
                                <Button
                                    size="sm"
                                    onClick={() => handleSave(field)}
                                    disabled={isSaving[field.key] || !isDirty}
                                >
                                    {isSaving[field.key]
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Save className="h-4 w-4" />}
                                    <span className="ml-2">Lưu</span>
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
