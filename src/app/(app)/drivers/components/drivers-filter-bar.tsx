'use client';

import * as React from 'react';
import { User, Phone, Car, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TransportCompany } from '@/lib/types';

export type DriverFilters = {
  name: string;
  phone: string;
  plate: string;
  serviceType: '' | 'RIDE' | 'CARPOOL' | 'DELIVERY';
  transportCompanyId: string;
};

export const EMPTY_FILTERS: DriverFilters = {
  name: '',
  phone: '',
  plate: '',
  serviceType: '',
  transportCompanyId: '',
};

export function hasAnyFilter(f: DriverFilters): boolean {
  return Boolean(f.name || f.phone || f.plate || f.serviceType || f.transportCompanyId);
}

const SERVICE_OPTIONS = [
  { value: 'RIDE', label: 'Chở khách (Taxi)' },
  { value: 'CARPOOL', label: 'Đi chung' },
  { value: 'DELIVERY', label: 'Giao hàng' },
];

function IconInput({
  icon: Icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9" {...props} />
    </div>
  );
}

export function DriversFilterBar({
  value,
  onChange,
  transportCompanies,
}: {
  value: DriverFilters;
  onChange: (next: DriverFilters) => void;
  transportCompanies: TransportCompany[];
}) {
  const setField = <K extends keyof DriverFilters>(key: K, v: DriverFilters[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <div className="space-y-3 pb-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <IconInput
          icon={User}
          placeholder="Tên tài xế..."
          value={value.name}
          onChange={(e) => setField('name', e.target.value)}
        />
        <IconInput
          icon={Phone}
          placeholder="Số điện thoại..."
          value={value.phone}
          onChange={(e) => setField('phone', e.target.value)}
        />
        <IconInput
          icon={Car}
          placeholder="Biển số xe..."
          value={value.plate}
          onChange={(e) => setField('plate', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-3">
        <Select
          value={value.serviceType || 'ALL'}
          onValueChange={(v) => setField('serviceType', v === 'ALL' ? '' : (v as DriverFilters['serviceType']))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Dịch vụ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả dịch vụ</SelectItem>
            {SERVICE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={value.transportCompanyId || 'ALL'}
          onValueChange={(v) => setField('transportCompanyId', v === 'ALL' ? '' : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Đơn vị vận tải" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả đơn vị</SelectItem>
            {transportCompanies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex justify-start sm:justify-end">
          {hasAnyFilter(value) && (
            <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
              <X className="mr-1 h-4 w-4" />
              Xóa lọc
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
