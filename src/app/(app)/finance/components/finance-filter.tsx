'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type DateRange = { from: string; to: string };

const todayVn = (): string => {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(0, 10);
};

const daysAgoVn = (n: number): string => {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  vn.setUTCDate(vn.getUTCDate() - n);
  return vn.toISOString().slice(0, 10);
};

const firstOfMonthVn = (offsetMonths = 0): string => {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  vn.setUTCDate(1);
  vn.setUTCMonth(vn.getUTCMonth() + offsetMonths);
  return vn.toISOString().slice(0, 10);
};

const lastOfMonthVn = (offsetMonths = 0): string => {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  vn.setUTCMonth(vn.getUTCMonth() + offsetMonths + 1);
  vn.setUTCDate(0);
  return vn.toISOString().slice(0, 10);
};

const firstOfYearVn = (): string => {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return `${vn.getUTCFullYear()}-01-01`;
};

export const PRESETS: Array<{ key: string; label: string; range: () => DateRange }> = [
  { key: 'today', label: 'Hôm nay', range: () => ({ from: todayVn(), to: todayVn() }) },
  { key: 'last7', label: '7 ngày qua', range: () => ({ from: daysAgoVn(6), to: todayVn() }) },
  { key: 'thisMonth', label: 'Tháng này', range: () => ({ from: firstOfMonthVn(0), to: todayVn() }) },
  { key: 'last30', label: '30 ngày qua', range: () => ({ from: daysAgoVn(29), to: todayVn() }) },
  { key: 'lastMonth', label: 'Tháng trước', range: () => ({ from: firstOfMonthVn(-1), to: lastOfMonthVn(-1) }) },
  { key: 'thisYear', label: 'Năm nay', range: () => ({ from: firstOfYearVn(), to: todayVn() }) },
];

export function FinanceFilter({
  value,
  onChange,
  isLoading,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  isLoading?: boolean;
}) {
  const [activePreset, setActivePreset] = React.useState<string | null>('today');

  const applyPreset = (key: string) => {
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setActivePreset(key);
    onChange(preset.range());
  };

  const handleCustom = (key: 'from' | 'to', v: string) => {
    setActivePreset(null);
    onChange({ ...value, [key]: v });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            variant={activePreset === p.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyPreset(p.key)}
            disabled={isLoading}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Từ</Label>
          <Input
            type="date"
            value={value.from}
            onChange={(e) => handleCustom('from', e.target.value)}
            className="w-44"
            disabled={isLoading}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Đến</Label>
          <Input
            type="date"
            value={value.to}
            onChange={(e) => handleCustom('to', e.target.value)}
            className="w-44"
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
