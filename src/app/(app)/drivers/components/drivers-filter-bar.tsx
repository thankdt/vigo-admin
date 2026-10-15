'use client';

import * as React from 'react';
import { User, Phone, Car, X, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { getSurvivingProvinces } from '@/lib/api';
import type { AdminUnit } from '@/lib/types';
import { provinceOptionLabel, selectableProvinces } from './driver-provinces';
import { DRIVER_CALL_TYPE_LABEL, DRIVER_CALL_TYPE_ORDER } from '@/lib/cskh-call-labels';
import { DRIVER_ONLINE_LABEL, type DriverOnlineState } from '@/lib/driver-presence';

export type DriverFilters = {
  name: string;
  phone: string;
  plate: string;
  // Mã tỉnh gis (2 số) tài đang hoạt động. '' = tất cả tỉnh.
  provinceCode: string;
  // Free-text search against both registered transportCompany.name and the
  // driver's self-declared customTransportCompanyName.
  transportCompanyName: string;
  // True = only drivers who self-declared a transport company name but have no
  // confirmed transportCompanyId yet.
  unconfirmedTransportCompany: boolean;
  // CSKH đã gọi điện: '' = tất cả, 'true' = đã gọi, 'false' = chưa gọi.
  csCalled: '' | 'true' | 'false';
  // CSKH: loại mốc "lịch sử làm việc" gần nhất ('' = tất cả).
  csLastCallType: '' | 'CALLED' | 'UNREACHED' | 'CALLBACK' | 'HANDLED' | 'REMINDER' | 'NOTE';
  // CSKH: chỉ tài xế CHƯA có mốc làm việc nào.
  csNeverWorked: boolean;
  // CSKH: khoảng NGÀY LÀM VIỆC gần nhất (VN YYYY-MM-DD; '' = không lọc).
  csWorkedFrom: string;
  csWorkedTo: string;
  // Trạng thái online như badge ('' = tất cả). Chỉ áp dụng ở tab Đã duyệt / Tất cả.
  onlineState: '' | DriverOnlineState;
};

export const EMPTY_FILTERS: DriverFilters = {
  name: '',
  phone: '',
  plate: '',
  provinceCode: '',
  transportCompanyName: '',
  unconfirmedTransportCompany: false,
  csCalled: '',
  csLastCallType: '',
  csNeverWorked: false,
  csWorkedFrom: '',
  csWorkedTo: '',
  onlineState: '',
};

export function hasAnyFilter(f: DriverFilters): boolean {
  return Boolean(
    f.name || f.phone || f.plate || f.provinceCode || f.transportCompanyName ||
    f.unconfirmedTransportCompany || f.csCalled || f.csLastCallType || f.csNeverWorked ||
    f.csWorkedFrom || f.csWorkedTo || f.onlineState,
  );
}

const ALL_PROVINCES_VALUE = '__all__';
const ALL_CS_VALUE = '__all_cs__';
const ALL_CS_TYPE_VALUE = '__all_cs_type__';
const ALL_ONLINE_VALUE = '__all_online__';
// Thứ tự theo mức "cần xử lý" của vận hành; nhãn lấy từ nguồn chung để khớp badge.
const ONLINE_STATE_ORDER: DriverOnlineState[] = ['online', 'busy', 'idle', 'stale', 'unknown', 'offline'];
const ONLINE_OPTIONS = [
  { value: ALL_ONLINE_VALUE, label: 'Online: tất cả' },
  ...ONLINE_STATE_ORDER.map((s) => ({ value: s, label: DRIVER_ONLINE_LABEL[s] })),
];
// Nhãn suy từ nguồn chung (src/lib/cskh-call-labels.ts) — trước đây chép tay ở đây và
// ở driver-detail-dialog, sửa chữ một nơi là lệch nơi kia.
const CS_TYPE_OPTIONS = [
  { value: ALL_CS_TYPE_VALUE, label: 'Mốc CSKH: tất cả' },
  ...DRIVER_CALL_TYPE_ORDER.map((t) => ({ value: t, label: DRIVER_CALL_TYPE_LABEL[t] })),
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
  showOnlineState = false,
}: {
  value: DriverFilters;
  onChange: (next: DriverFilters) => void;
  /** Hiện ô lọc trạng thái online (tab Đã duyệt / Tất cả). */
  showOnlineState?: boolean;
}) {
  const [provinces, setProvinces] = React.useState<AdminUnit[]>([]);

  React.useEffect(() => {
    getSurvivingProvinces()
      .then((list) => setProvinces(selectableProvinces(list)))
      .catch(() => { /* dropdown stays empty if it fails; user can still use other filters */ });
  }, []);

  const setField = <K extends keyof DriverFilters>(key: K, v: DriverFilters[K]) => {
    onChange({ ...value, [key]: v });
  };

  const provinceOptions = React.useMemo(
    () => [
      { value: ALL_PROVINCES_VALUE, label: 'Tất cả tỉnh' },
      ...provinces.map((p) => ({ value: p.gisCode as string, label: provinceOptionLabel(p) })),
    ],
    [provinces],
  );

  return (
    <div className="space-y-3 pb-4">
      <div className={`grid grid-cols-1 gap-3 ${showOnlineState ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
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
        {showOnlineState && (
          <Combobox
            options={ONLINE_OPTIONS}
            selectedValue={value.onlineState || ALL_ONLINE_VALUE}
            onSelect={(v) =>
              setField('onlineState', !v || v === ALL_ONLINE_VALUE ? '' : (v as DriverOnlineState))
            }
            placeholder="Online: tất cả"
            searchPlaceholder="Lọc trạng thái..."
            noResultsText="Không có."
          />
        )}
      </div>
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Combobox
          options={provinceOptions}
          selectedValue={value.provinceCode || ALL_PROVINCES_VALUE}
          onSelect={(v) => setField('provinceCode', !v || v === ALL_PROVINCES_VALUE ? '' : v)}
          placeholder="Tất cả tỉnh"
          searchPlaceholder="Tìm tỉnh..."
          noResultsText="Không có tỉnh phù hợp."
        />
        <IconInput
          icon={Building2}
          placeholder="Tên đơn vị vận tải..."
          value={value.transportCompanyName}
          disabled={value.unconfirmedTransportCompany}
          onChange={(e) => setField('transportCompanyName', e.target.value)}
        />
        <Combobox
          options={[
            { value: ALL_CS_VALUE, label: 'Gọi điện: tất cả' },
            { value: 'false', label: 'Chưa gọi' },
            { value: 'true', label: 'Đã gọi' },
          ]}
          selectedValue={value.csCalled || ALL_CS_VALUE}
          onSelect={(v) =>
            setField('csCalled', !v || v === ALL_CS_VALUE ? '' : (v as 'true' | 'false'))
          }
          placeholder="Gọi điện: tất cả"
          searchPlaceholder="Lọc..."
          noResultsText="Không có."
        />
        <div className="flex items-center gap-3 sm:justify-end">
          <div className="flex items-center gap-2">
            <Checkbox
              id="unconfirmed-tc"
              checked={value.unconfirmedTransportCompany}
              onCheckedChange={(checked) =>
                onChange({
                  ...value,
                  unconfirmedTransportCompany: checked === true,
                  // When toggled on, clear the name search (the toggle filters the
                  // full unconfirmed-HTX group regardless of typed text).
                  transportCompanyName: checked === true ? '' : value.transportCompanyName,
                })
              }
            />
            <Label htmlFor="unconfirmed-tc" className="text-sm font-normal cursor-pointer">
              HTX chưa xác nhận
            </Label>
          </div>
          {hasAnyFilter(value) && (
            <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
              <X className="mr-1 h-4 w-4" />
              Xóa lọc
            </Button>
          )}
        </div>
      </div>
      {/* CSKH "lịch sử làm việc": lọc theo loại mốc gần nhất, khoảng ngày làm việc, hoặc chưa làm việc bao giờ. */}
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Combobox
          options={CS_TYPE_OPTIONS}
          selectedValue={value.csLastCallType || ALL_CS_TYPE_VALUE}
          onSelect={(v) =>
            setField('csLastCallType', !v || v === ALL_CS_TYPE_VALUE ? '' : (v as DriverFilters['csLastCallType']))
          }
          placeholder="Mốc CSKH: tất cả"
          searchPlaceholder="Lọc mốc..."
          noResultsText="Không có."
          disabled={value.csNeverWorked}
        />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Ngày làm việc từ</Label>
          <Input
            type="date"
            value={value.csWorkedFrom}
            max={value.csWorkedTo || undefined}
            disabled={value.csNeverWorked}
            onChange={(e) => setField('csWorkedFrom', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">đến ngày</Label>
          <Input
            type="date"
            value={value.csWorkedTo}
            min={value.csWorkedFrom || undefined}
            disabled={value.csNeverWorked}
            onChange={(e) => setField('csWorkedTo', e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          <Checkbox
            id="cs-never-worked"
            checked={value.csNeverWorked}
            onCheckedChange={(checked) =>
              onChange({
                ...value,
                csNeverWorked: checked === true,
                // "Chưa làm việc bao giờ" mâu thuẫn với lọc loại mốc / khoảng ngày → xoá chúng khi bật.
                csLastCallType: checked === true ? '' : value.csLastCallType,
                csWorkedFrom: checked === true ? '' : value.csWorkedFrom,
                csWorkedTo: checked === true ? '' : value.csWorkedTo,
              })
            }
          />
          <Label htmlFor="cs-never-worked" className="text-sm font-normal cursor-pointer">
            Chưa làm việc bao giờ
          </Label>
        </div>
      </div>
    </div>
  );
}
