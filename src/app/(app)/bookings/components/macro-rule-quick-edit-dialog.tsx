'use client';

import * as React from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Zap, ExternalLink, ArrowLeftRight, MapPin } from 'lucide-react';
import { getPricingMacroRulesPage, getPricingMacroProvinces, updatePricingMacroRule } from '@/lib/api';
import {
  FORM_SERVICE_VALUES,
  FORM_VEHICLE_VALUES,
  adjustmentValueError,
  adjustmentValueHint,
  adjustmentValueRange,
  formServiceValue,
  formVehicleValue,
  formatMacroAdjustment,
  isLegacyAdjustmentType,
  priorityError,
  summarizeWarnings,
} from '@/lib/macro-bulk';
import type { PricingMacroRule, ProvinceOption, MacroAdjustmentType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export function MacroRuleBadge({
  ruleId,
  ruleName,
  adjustmentType,
  onClick,
  compact = false,
}: {
  ruleId: number;
  ruleName?: string | null;
  adjustmentType?: string | null;
  onClick: (ruleId: number) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(ruleId);
      }}
      title={
        ruleName
          ? `Quy tắc #${ruleId}: ${ruleName} — Bấm để kiểm tra & chỉnh sửa`
          : `Quy tắc #${ruleId} — Bấm để kiểm tra & chỉnh sửa`
      }
      className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors cursor-pointer w-fit text-left"
    >
      <Zap className="h-3 w-3 shrink-0 text-indigo-600" />
      <span className="font-mono font-semibold">Rule #{ruleId}</span>
      {!compact && ruleName && (
        <span className="truncate max-w-[180px] text-indigo-600/90 font-normal">· {ruleName}</span>
      )}
      {!compact && adjustmentType === 'FIXED_PRICE' && (
        <span className="rounded bg-indigo-100 px-1 text-[10px] text-indigo-800">Cố định</span>
      )}
    </button>
  );
}

export function MacroRuleQuickEditDialog({
  ruleId,
  onClose,
  onSaved,
}: {
  ruleId: number | null;
  onClose: () => void;
  onSaved?: (updated: PricingMacroRule) => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [rule, setRule] = React.useState<PricingMacroRule | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [provinces, setProvinces] = React.useState<ProvinceOption[]>([]);

  const [formData, setFormData] = React.useState<{
    isActive: boolean;
    priority: number;
    serviceType: string;
    vehicleType: string;
    adjustmentType: MacroAdjustmentType;
    adjustmentValue: number;
    isBidirectional: boolean;
    note: string;
  }>({
    isActive: true,
    priority: 0,
    serviceType: 'ALL',
    vehicleType: 'ALL',
    adjustmentType: 'FIXED_PRICE',
    adjustmentValue: 0,
    isBidirectional: true,
    note: '',
  });

  React.useEffect(() => {
    if (ruleId == null) {
      setRule(null);
      setNotFound(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    Promise.all([
      getPricingMacroRulesPage({ page: 1, limit: 10, noteSearch: `#${ruleId}` }),
      getPricingMacroProvinces().catch(() => [] as ProvinceOption[]),
    ])
      .then(([res, provs]) => {
        if (cancelled) return;
        setProvinces(provs || []);
        const found = (res?.items ?? []).find((r) => Number(r.id) === Number(ruleId)) ?? null;
        if (!found) {
          setRule(null);
          setNotFound(true);
          return;
        }
        setRule(found);
        setFormData({
          isActive: found.isActive,
          priority: Number(found.priority ?? 0),
          serviceType: formServiceValue(found.serviceType),
          vehicleType: formVehicleValue(found.vehicleType),
          adjustmentType: found.adjustmentType,
          adjustmentValue: Number(found.adjustmentValue ?? 0),
          isBidirectional: found.isBidirectional === true,
          note: found.note || '',
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        toast({
          title: 'Lỗi tải quy tắc giá',
          description: err?.message || 'Không thể tải thông tin quy tắc giá.',
          variant: 'destructive',
        });
        setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ruleId, toast]);

  const getProvinceName = (code: string | null) => {
    if (!code) return 'Toàn quốc (Mọi tỉnh)';
    return provinces.find((p) => p.code === code)?.name || `Mã tỉnh: ${code}`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rule) return;

    const earlyError =
      adjustmentValueError(formData.adjustmentType, Number(formData.adjustmentValue)) ||
      priorityError(Number(formData.priority) || 0);
    if (earlyError) {
      toast({ title: 'Giá trị chưa hợp lệ', description: earlyError, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<PricingMacroRule> = {
        isActive: formData.isActive,
        priority: Number(formData.priority) || 0,
        serviceType: formData.serviceType,
        vehicleType: formData.vehicleType,
        originProvinceCode: rule.originProvinceCode || null,
        originWardCode: rule.originWardCode || null,
        destProvinceCode: rule.destProvinceCode || null,
        destWardCode: rule.destWardCode || null,
        adjustmentType: formData.adjustmentType,
        adjustmentValue: Number(formData.adjustmentValue) || 0,
        isBidirectional: formData.isBidirectional,
        note: formData.note || null,
      };
      const updated = await updatePricingMacroRule(rule.id, payload);
      const warnMsg = summarizeWarnings(updated.warnings);
      toast({
        title: `Đã cập nhật quy tắc #${rule.id}`,
        description:
          warnMsg ||
          `Giá trị mới: ${formatMacroAdjustment(formData.adjustmentType, Number(formData.adjustmentValue))} (áp dụng cho các chuyến báo giá tiếp theo).`,
      });
      setRule(updated);
      onSaved?.(updated);
      onClose();
    } catch (err: any) {
      toast({
        title: 'Lỗi cập nhật quy tắc',
        description: err?.message || 'Không thể lưu quy tắc giá.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={ruleId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-indigo-600" />
            <span>Kiểm tra & Chỉnh sửa Quy tắc giá {ruleId != null ? `#${ruleId}` : ''}</span>
          </DialogTitle>
          <DialogDescription>
            Xem chi tiết và điều chỉnh trực tiếp quy tắc giá đã khớp cho chuyến đi này.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-indigo-600" />
            Đang tải quy tắc #{ruleId}...
          </div>
        ) : notFound || !rule ? (
          <div className="space-y-3 py-6 text-center">
            <div className="text-sm text-muted-foreground">
              Không tìm thấy quy tắc <span className="font-mono font-semibold">#{ruleId}</span> (có thể quy tắc đã bị xoá).
            </div>
            {ruleId != null && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/master-data?ruleId=${ruleId}`}>
                  Mở trang Vùng & Giá khu vực <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {/* Tóm tắt điểm đi / điểm đến của rule */}
            <div className="rounded-lg border bg-slate-50 p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono bg-white">
                    #{rule.id}
                  </Badge>
                  <Badge variant={formData.isActive ? 'default' : 'secondary'}>
                    {formData.isActive ? 'Đang bật' : 'Đang tắt'}
                  </Badge>
                  {formData.isBidirectional && (
                    <Badge variant="outline" className="gap-1 bg-white">
                      <ArrowLeftRight className="h-3 w-3" /> 2 chiều
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-indigo-600" asChild>
                  <Link href={`/master-data?ruleId=${rule.id}`}>
                    Mở ở Vùng & Giá khu vực <ExternalLink className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/80">
                <div>
                  <div className="text-[11px] font-medium uppercase text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-blue-600" /> Điểm đi
                  </div>
                  <div className="font-semibold text-slate-900">
                    {getProvinceName(rule.originProvinceCode)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {rule.originWardCode
                      ? `${rule.originWardName || rule.originWardCode} (${rule.originWardCode})`
                      : 'Toàn bộ tỉnh/thành'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-emerald-600" /> Điểm đến
                  </div>
                  <div className="font-semibold text-slate-900">
                    {getProvinceName(rule.destProvinceCode)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {rule.destWardCode
                      ? `${rule.destWardName || rule.destWardCode} (${rule.destWardCode})`
                      : 'Toàn bộ tỉnh/thành'}
                  </div>
                </div>
              </div>
            </div>

            {/* Dịch vụ & Loại xe */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Loại dịch vụ</Label>
                <Select
                  value={formData.serviceType}
                  onValueChange={(v) => setFormData((p) => ({ ...p, serviceType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả dịch vụ</SelectItem>
                    <SelectItem value="CARPOOL">Ghép xe (CARPOOL)</SelectItem>
                    <SelectItem value="CONVENIENT">Bao xe (CONVENIENT)</SelectItem>
                    {!FORM_SERVICE_VALUES.includes(formData.serviceType) && (
                      <SelectItem value={formData.serviceType}>Khác: {formData.serviceType}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Loại phương tiện</Label>
                <Select
                  value={formData.vehicleType}
                  onValueChange={(v) => setFormData((p) => ({ ...p, vehicleType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả loại xe</SelectItem>
                    <SelectItem value="4SEATS">Xe 4 chỗ</SelectItem>
                    <SelectItem value="7SEATS">Xe 7 chỗ</SelectItem>
                    {!FORM_VEHICLE_VALUES.includes(formData.vehicleType) && (
                      <SelectItem value={formData.vehicleType}>Khác: {formData.vehicleType}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Loại điều chỉnh & Giá trị */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Kiểu điều chỉnh</Label>
                <Select
                  value={formData.adjustmentType}
                  onValueChange={(v: MacroAdjustmentType) =>
                    setFormData((p) => ({ ...p, adjustmentType: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DELTA_AMOUNT">Cộng/Trừ tiền cố định (± VNĐ)</SelectItem>
                    <SelectItem value="PERCENTAGE">Theo phần trăm (± %)</SelectItem>
                    <SelectItem value="FIXED_PRICE">Ghi đè giá cố định (VNĐ)</SelectItem>
                    {isLegacyAdjustmentType(formData.adjustmentType) && (
                      <SelectItem value={formData.adjustmentType} disabled>
                        {formData.adjustmentType === 'MIN_FLOOR' ? 'Giá sàn tối thiểu' : 'Giá trần tối đa'} (đã ngừng áp dụng)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Giá trị ({formData.adjustmentType === 'PERCENTAGE' ? '%' : 'VNĐ'})
                </Label>
                <Input
                  type="number"
                  step={formData.adjustmentType === 'PERCENTAGE' ? '0.1' : '1000'}
                  {...adjustmentValueRange(formData.adjustmentType)}
                  value={formData.adjustmentValue}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, adjustmentValue: parseFloat(e.target.value) || 0 }))
                  }
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Hiện tại:{' '}
                  <span className="font-semibold text-foreground">
                    {formatMacroAdjustment(formData.adjustmentType, Number(formData.adjustmentValue))}
                  </span>{' '}
                  · {adjustmentValueHint(formData.adjustmentType)}
                </p>
              </div>
            </div>

            {/* Độ ưu tiên & Ghi chú */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Độ ưu tiên</Label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, priority: parseInt(e.target.value, 10) || 0 }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">Số lớn hơn ưu tiên trước</p>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Ghi chú</Label>
                <Input
                  placeholder="Ghi chú nội bộ..."
                  value={formData.note}
                  onChange={(e) => setFormData((p) => ({ ...p, note: e.target.value }))}
                />
              </div>
            </div>

            {/* Checkbox trạng thái & 2 chiều */}
            <div className="flex flex-wrap items-center gap-6 pt-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="quick-macro-active"
                  checked={formData.isActive}
                  onCheckedChange={(c) => setFormData((p) => ({ ...p, isActive: Boolean(c) }))}
                />
                <Label htmlFor="quick-macro-active" className="cursor-pointer">
                  Kích hoạt quy tắc này
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="quick-macro-bidir"
                  checked={formData.isBidirectional}
                  onCheckedChange={(c) =>
                    setFormData((p) => ({ ...p, isBidirectional: Boolean(c) }))
                  }
                />
                <Label htmlFor="quick-macro-bidir" className="cursor-pointer">
                  Áp dụng 2 chiều (Đi ↔ Đến)
                </Label>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Đóng
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lưu quy tắc #{rule.id}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
