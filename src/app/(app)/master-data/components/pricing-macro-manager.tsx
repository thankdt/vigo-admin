'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2,
  PlusCircle,
  Trash2,
  Edit,
  Search,
  MapPin,
  Sparkles,
  Calculator,
  RefreshCw,
  Compass,
} from 'lucide-react';
import {
  getPricingMacroRules,
  getPricingMacroProvinces,
  getPricingMacroWards,
  createPricingMacroRule,
  updatePricingMacroRule,
  deletePricingMacroRule,
  simulatePricingMacro,
} from '@/lib/api';
import type {
  PricingMacroRule,
  ProvinceOption,
  WardOption,
  MacroAdjustmentType,
  SimulatePricingMacroResult,
} from '@/lib/types';
import { cn } from '@/lib/utils';

export function PricingMacroManager() {
  const { toast } = useToast();

  const [rules, setRules] = React.useState<PricingMacroRule[]>([]);
  const [provinces, setProvinces] = React.useState<ProvinceOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');

  // Dropdown ward caches per province
  const [originWards, setOriginWards] = React.useState<WardOption[]>([]);
  const [destWards, setDestWards] = React.useState<WardOption[]>([]);
  const [loadingOriginWards, setLoadingOriginWards] = React.useState(false);
  const [loadingDestWards, setLoadingDestWards] = React.useState(false);

  // Dialog State
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<PricingMacroRule | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Form State
  const [formData, setFormData] = React.useState<{
    name: string;
    isActive: boolean;
    priority: number;
    serviceType: string;
    vehicleType: string;
    originProvinceCode: string;
    originWardCode: string;
    destProvinceCode: string;
    destWardCode: string;
    adjustmentType: MacroAdjustmentType;
    adjustmentValue: number;
    applyPerSeat: boolean;
    note: string;
  }>({
    name: '',
    isActive: true,
    priority: 0,
    serviceType: 'ALL',
    vehicleType: 'ALL',
    originProvinceCode: '',
    originWardCode: '',
    destProvinceCode: '',
    destWardCode: '',
    adjustmentType: 'DELTA_AMOUNT',
    adjustmentValue: 0,
    applyPerSeat: true,
    note: '',
  });

  // Delete State
  const [deleteRuleId, setDeleteRuleId] = React.useState<number | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Simulator State
  const [simPickupLat, setSimPickupLat] = React.useState<string>('21.2187'); // Sân bay Nội Bài
  const [simPickupLng, setSimPickupLng] = React.useState<string>('105.8042');
  const [simDropoffLat, setSimDropoffLat] = React.useState<string>('20.5375'); // Phủ Lý, Hà Nam
  const [simDropoffLng, setSimDropoffLng] = React.useState<string>('105.9135');
  const [simServiceType, setSimServiceType] = React.useState<string>('CARPOOL');
  const [simVehicleType, setSimVehicleType] = React.useState<string>('ALL');
  const [simSeats, setSimSeats] = React.useState<number>(1);
  const [simulating, setSimulating] = React.useState(false);
  const [simResult, setSimResult] = React.useState<SimulatePricingMacroResult | null>(null);

  // Load initial rules and provinces
  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedRules, fetchedProvinces] = await Promise.all([
        getPricingMacroRules(),
        getPricingMacroProvinces(),
      ]);
      setRules(fetchedRules || []);
      setProvinces(fetchedProvinces || []);
    } catch (err: any) {
      toast({
        title: 'Lỗi tải dữ liệu Macro',
        description: err.message || 'Không thể tải danh sách quy tắc macro',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Load wards when province changes in dialog
  const handleOriginProvinceChange = async (provCode: string) => {
    const val = provCode === '__ALL__' ? '' : provCode;
    setFormData((prev) => ({ ...prev, originProvinceCode: val, originWardCode: '' }));
    if (!val) {
      setOriginWards([]);
      return;
    }
    setLoadingOriginWards(true);
    try {
      const wards = await getPricingMacroWards(val);
      setOriginWards(wards || []);
    } catch {
      setOriginWards([]);
    } finally {
      setLoadingOriginWards(false);
    }
  };

  const handleDestProvinceChange = async (provCode: string) => {
    const val = provCode === '__ALL__' ? '' : provCode;
    setFormData((prev) => ({ ...prev, destProvinceCode: val, destWardCode: '' }));
    if (!val) {
      setDestWards([]);
      return;
    }
    setLoadingDestWards(true);
    try {
      const wards = await getPricingMacroWards(val);
      setDestWards(wards || []);
    } catch {
      setDestWards([]);
    } finally {
      setLoadingDestWards(false);
    }
  };

  const openCreateDialog = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      isActive: true,
      priority: 0,
      serviceType: 'ALL',
      vehicleType: 'ALL',
      originProvinceCode: '',
      originWardCode: '',
      destProvinceCode: '',
      destWardCode: '',
      adjustmentType: 'DELTA_AMOUNT',
      adjustmentValue: 0,
      applyPerSeat: true,
      note: '',
    });
    setOriginWards([]);
    setDestWards([]);
    setDialogOpen(true);
  };

  const openEditDialog = async (rule: PricingMacroRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      isActive: rule.isActive,
      priority: rule.priority,
      serviceType: rule.serviceType || 'ALL',
      vehicleType: rule.vehicleType || 'ALL',
      originProvinceCode: rule.originProvinceCode || '',
      originWardCode: rule.originWardCode || '',
      destProvinceCode: rule.destProvinceCode || '',
      destWardCode: rule.destWardCode || '',
      adjustmentType: rule.adjustmentType,
      adjustmentValue: Number(rule.adjustmentValue),
      applyPerSeat: rule.applyPerSeat,
      note: rule.note || '',
    });

    if (rule.originProvinceCode) {
      getPricingMacroWards(rule.originProvinceCode).then((w) => setOriginWards(w || []));
    } else {
      setOriginWards([]);
    }

    if (rule.destProvinceCode) {
      getPricingMacroWards(rule.destProvinceCode).then((w) => setDestWards(w || []));
    } else {
      setDestWards([]);
    }

    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: 'Vui lòng nhập tên quy tắc', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<PricingMacroRule> = {
        name: formData.name.trim(),
        isActive: formData.isActive,
        priority: Number(formData.priority) || 0,
        serviceType: formData.serviceType,
        vehicleType: formData.vehicleType,
        originProvinceCode: formData.originProvinceCode || null,
        originWardCode: formData.originWardCode || null,
        destProvinceCode: formData.destProvinceCode || null,
        destWardCode: formData.destWardCode || null,
        adjustmentType: formData.adjustmentType,
        adjustmentValue: Number(formData.adjustmentValue) || 0,
        applyPerSeat: formData.applyPerSeat,
        note: formData.note ? formData.note.trim() : null,
      };

      if (editingRule) {
        await updatePricingMacroRule(editingRule.id, payload);
        toast({ title: 'Cập nhật quy tắc macro thành công' });
      } else {
        await createPricingMacroRule(payload);
        toast({ title: 'Tạo quy tắc macro thành công' });
      }

      setDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast({
        title: 'Lỗi lưu quy tắc',
        description: err.message || 'Không thể lưu quy tắc',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRuleId) return;
    setDeleting(true);
    try {
      await deletePricingMacroRule(deleteRuleId);
      toast({ title: 'Đã xoá quy tắc macro' });
      setDeleteRuleId(null);
      loadData();
    } catch (err: any) {
      toast({
        title: 'Lỗi xoá quy tắc',
        description: err.message || 'Không thể xoá quy tắc',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (rule: PricingMacroRule) => {
    try {
      await updatePricingMacroRule(rule.id, { isActive: !rule.isActive });
      toast({ title: rule.isActive ? 'Đã tắt quy tắc' : 'Đã kích hoạt quy tắc' });
      loadData();
    } catch (err: any) {
      toast({
        title: 'Lỗi cập nhật',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const handleRunSimulation = async () => {
    const pLat = parseFloat(simPickupLat);
    const pLng = parseFloat(simPickupLng);
    const dLat = parseFloat(simDropoffLat);
    const dLng = parseFloat(simDropoffLng);

    if (isNaN(pLat) || isNaN(pLng) || isNaN(dLat) || isNaN(dLng)) {
      toast({ title: 'Toạ độ không hợp lệ', variant: 'destructive' });
      return;
    }

    setSimulating(true);
    try {
      const res = await simulatePricingMacro({
        pickupLat: pLat,
        pickupLng: pLng,
        dropoffLat: dLat,
        dropoffLng: dLng,
        serviceType: simServiceType,
        vehicleType: simVehicleType,
        seats: simSeats,
      });
      setSimResult(res);
      toast({ title: 'Mô phỏng thành công' });
    } catch (err: any) {
      toast({
        title: 'Mô phỏng thất bại',
        description: err.message || 'Không thể tính giá',
        variant: 'destructive',
      });
    } finally {
      setSimulating(false);
    }
  };

  // Helper name lookups
  const getProvinceName = (code?: string | null) => {
    if (!code) return 'Toàn quốc';
    const found = provinces.find((p) => p.code === code);
    return found ? found.name : code;
  };

  const filteredRules = React.useMemo(() => {
    if (!search.trim()) return rules;
    const q = search.toLowerCase();
    return rules.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.note && r.note.toLowerCase().includes(q)) ||
        getProvinceName(r.destProvinceCode).toLowerCase().includes(q) ||
        getProvinceName(r.originProvinceCode).toLowerCase().includes(q),
    );
  }, [rules, search, provinces]);

  const formatAdjustment = (type: MacroAdjustmentType, value: number, applyPerSeat: boolean) => {
    const seatSuffix = applyPerSeat ? '/ghế' : '';
    if (type === 'DELTA_AMOUNT') {
      const sign = value > 0 ? '+' : '';
      return `${sign}${new Intl.NumberFormat('vi-VN').format(value)} đ${seatSuffix}`;
    }
    if (type === 'PERCENTAGE') {
      const sign = value > 0 ? '+' : '';
      return `${sign}${value}%`;
    }
    if (type === 'MIN_FLOOR') {
      return `Sàn: ${new Intl.NumberFormat('vi-VN').format(value)} đ`;
    }
    if (type === 'MAX_CEILING') {
      return `Trần: ${new Intl.NumberFormat('vi-VN').format(value)} đ`;
    }
    return `${value}`;
  };

  return (
    <div className="space-y-6">
      {/* ───────── HEADER & SIMULATOR ACCORDION / TOGGLE ───────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Compass className="w-5 h-5 text-indigo-600" />
            Macro Định Giá 2 Cấp (Tỉnh → Xã)
          </h2>
          <p className="text-sm text-slate-500">
            Cấu hình bộ quy tắc tăng/giảm giá tự động dựa trên toạ độ điểm đón/trả theo 34 tỉnh và 3.321 xã mới.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} />
            Làm mới
          </Button>
          <Button size="sm" onClick={openCreateDialog} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <PlusCircle className="w-4 h-4 mr-1" />
            Thêm quy tắc
          </Button>
        </div>
      </div>

      {/* ───────── PRICE SIMULATOR CARD ───────── */}
      <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/40 via-white to-sky-50/30 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-md">
                <Calculator className="w-4 h-4" />
              </div>
              <CardTitle className="text-base font-semibold text-slate-800">
                Price Simulator (Công cụ kiểm tra & thử nghiệm tính giá)
              </CardTitle>
            </div>
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs">
              Ranh giới Polygon 3.321 Xã
            </Badge>
          </div>
          <CardDescription className="text-xs text-slate-500">
            Nhập toạ độ GPS (lat, lng) điểm đón và trả khách để kiểm tra nhận diện đơn vị hành chính và rule nào được kích hoạt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick preset buttons */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Toạ độ mẫu:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2 bg-white"
              onClick={() => {
                setSimPickupLat('21.2187');
                setSimPickupLng('105.8042'); // Sân bay Nội Bài
                setSimDropoffLat('20.5375');
                setSimDropoffLng('105.9135'); // TP Phủ Lý (Hà Nam)
              }}
            >
              Sân bay Nội Bài → TP Phủ Lý (Hà Nam)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2 bg-white"
              onClick={() => {
                setSimPickupLat('21.0285');
                setSimPickupLng('105.8542'); // Hoàn Kiếm, Hà Nội
                setSimDropoffLat('20.8449');
                setSimDropoffLng('106.6881'); // Lê Chân, Hải Phòng
              }}
            >
              Hà Nội → Hải Phòng
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2 bg-white"
              onClick={() => {
                setSimPickupLat('20.9419');
                setSimPickupLng('106.0594'); // Yên Mỹ, Hưng Yên
                setSimDropoffLat('21.0031');
                setSimDropoffLng('105.8202'); // Đống Đa, Hà Nội
              }}
            >
              Hưng Yên → Đống Đa (HN)
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Điểm đón (Lat, Lng)</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="Lat"
                  value={simPickupLat}
                  onChange={(e) => setSimPickupLat(e.target.value)}
                />
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="Lng"
                  value={simPickupLng}
                  onChange={(e) => setSimPickupLng(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Điểm trả (Lat, Lng)</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="Lat"
                  value={simDropoffLat}
                  onChange={(e) => setSimDropoffLat(e.target.value)}
                />
                <Input
                  className="h-8 text-xs font-mono"
                  placeholder="Lng"
                  value={simDropoffLng}
                  onChange={(e) => setSimDropoffLng(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Dịch vụ & Ghế</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Select value={simServiceType} onValueChange={setSimServiceType}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CARPOOL">Ghép xe</SelectItem>
                    <SelectItem value="CONVENIENT">Bao xe</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  min={1}
                  max={7}
                  value={simSeats}
                  onChange={(e) => setSimSeats(parseInt(e.target.value, 10) || 1)}
                  placeholder="Số ghế"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Loại xe</Label>
              <Select value={simVehicleType} onValueChange={setSimVehicleType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Mọi loại xe</SelectItem>
                  <SelectItem value="4SEATS">Xe 4 chỗ</SelectItem>
                  <SelectItem value="7SEATS">Xe 7 chỗ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                className="w-full h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={handleRunSimulation}
                disabled={simulating}
              >
                {simulating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                )}
                Thử nghiệm tính giá
              </Button>
            </div>
          </div>

          {/* SIMULATION RESULT DISPLAY */}
          {simResult && (
            <div className="mt-3 p-3 bg-white border border-indigo-100 rounded-lg shadow-sm space-y-2 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {/* Origin Resolution */}
                <div className="p-2 bg-slate-50 rounded border border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-600" />
                    Điểm đón nhận diện
                  </div>
                  {simResult.origin ? (
                    <div className="mt-1">
                      <div className="font-semibold text-slate-800">{simResult.origin.wardName}</div>
                      <div className="text-slate-500">{simResult.origin.provinceName} (mã: {simResult.origin.provinceCode})</div>
                    </div>
                  ) : (
                    <div className="text-amber-600 mt-1">Không khớp ranh giới xã</div>
                  )}
                </div>

                {/* Dest Resolution */}
                <div className="p-2 bg-slate-50 rounded border border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-red-600" />
                    Điểm trả nhận diện
                  </div>
                  {simResult.dest ? (
                    <div className="mt-1">
                      <div className="font-semibold text-slate-800">{simResult.dest.wardName}</div>
                      <div className="text-slate-500">{simResult.dest.provinceName} (mã: {simResult.dest.provinceCode})</div>
                    </div>
                  ) : (
                    <div className="text-amber-600 mt-1">Không khớp ranh giới xã</div>
                  )}
                </div>

                {/* Matched Macro Rule */}
                <div className="p-2 bg-slate-50 rounded border border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    Quy tắc Macro khớp
                  </div>
                  {simResult.matchedRule ? (
                    <div className="mt-1">
                      <div className="font-semibold text-indigo-700">{simResult.matchedRule.name}</div>
                      <div className="text-slate-500">
                        Score: {simResult.matchScore} • {formatAdjustment(simResult.matchedRule.adjustmentType, Number(simResult.matchedRule.adjustmentValue), simResult.matchedRule.applyPerSeat)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 mt-1">Không có macro rule phù hợp</div>
                  )}
                </div>
              </div>

              {/* Price Quote Breakdown */}
              {simResult.quote && (
                <div className="p-2.5 bg-indigo-50/60 rounded border border-indigo-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-slate-500">Quãng đường: </span>
                      <span className="font-semibold">{simResult.quote.distanceKm} km</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Giá gốc km: </span>
                      <span className="font-semibold">
                        {new Intl.NumberFormat('vi-VN').format(simResult.quote.breakdown?.basePrice || 0)} đ
                      </span>
                    </div>
                    {simResult.quote.breakdown?.macroDeltaAmount !== 0 && (
                      <div>
                        <span className="text-slate-500">Điều chỉnh macro: </span>
                        <span className={cn('font-bold', (simResult.quote.breakdown?.macroDeltaAmount || 0) > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                          {(simResult.quote.breakdown?.macroDeltaAmount || 0) > 0 ? '+' : ''}
                          {new Intl.NumberFormat('vi-VN').format(simResult.quote.breakdown?.macroDeltaAmount || 0)} đ
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 mr-2">Tổng tiền:</span>
                    <span className="text-base font-bold text-indigo-700">
                      {new Intl.NumberFormat('vi-VN').format(simResult.quote.finalPrice || 0)} đ
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ───────── RULES LIST TABLE ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-800">
                Danh sách Quy tắc Macro ({filteredRules.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Hệ thống tự động ưu tiên rule có độ ưu tiên cao hơn, hoặc rule khớp chi tiết tới cấp Xã/Phường.
              </CardDescription>
            </div>
            <div className="w-full sm:w-64">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                <Input
                  className="pl-8 h-9 text-xs"
                  placeholder="Tìm kiếm quy tắc, tỉnh, xã..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 text-xs">
                <TableHead className="w-12 text-center">Ưu tiên</TableHead>
                <TableHead className="min-w-[200px]">Tên quy tắc</TableHead>
                <TableHead>Điểm đón (Tỉnh / Xã)</TableHead>
                <TableHead>Điểm đến (Tỉnh / Xã)</TableHead>
                <TableHead>Dịch vụ / Loại xe</TableHead>
                <TableHead>Mức điều chỉnh</TableHead>
                <TableHead className="w-24 text-center">Trạng thái</TableHead>
                <TableHead className="w-24 text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
                    <span className="text-xs text-slate-500">Đang tải danh sách macro rules...</span>
                  </TableCell>
                </TableRow>
              ) : filteredRules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-slate-400 text-xs">
                    Chưa có quy tắc macro nào. Bấm "Thêm quy tắc" để bắt đầu cấu hình.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRules.map((rule) => {
                  return (
                    <TableRow key={rule.id} className="text-xs hover:bg-slate-50/50">
                      <TableCell className="text-center font-bold text-slate-600">
                        {rule.priority}
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-slate-800">{rule.name}</div>
                        {rule.note && <div className="text-[11px] text-slate-400 mt-0.5">{rule.note}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="text-slate-700 font-medium">
                          {rule.originProvinceCode ? getProvinceName(rule.originProvinceCode) : 'Toàn quốc'}
                        </div>
                        {rule.originWardCode && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 mt-0.5 bg-blue-50 text-blue-700">
                            Xã #{rule.originWardCode}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-slate-700 font-medium">
                          {rule.destProvinceCode ? getProvinceName(rule.destProvinceCode) : 'Toàn quốc'}
                        </div>
                        {rule.destWardCode && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 mt-0.5 bg-purple-50 text-purple-700">
                            Xã #{rule.destWardCode}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">
                            {rule.serviceType === 'ALL' ? 'Mọi dịch vụ' : rule.serviceType}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">
                            {rule.vehicleType === 'ALL' ? 'Mọi loại xe' : rule.vehicleType}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'font-bold',
                            rule.adjustmentType === 'DELTA_AMOUNT' && Number(rule.adjustmentValue) > 0 && 'text-amber-600',
                            rule.adjustmentType === 'DELTA_AMOUNT' && Number(rule.adjustmentValue) < 0 && 'text-emerald-600',
                            rule.adjustmentType === 'PERCENTAGE' && 'text-indigo-600',
                          )}
                        >
                          {formatAdjustment(rule.adjustmentType, Number(rule.adjustmentValue), rule.applyPerSeat)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleToggleActive(rule)}
                        >
                          {rule.isActive ? (
                            <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px]">Bật</Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-400 text-[10px]">Tắt</Badge>
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-500 hover:text-indigo-600"
                            onClick={() => openEditDialog(rule)}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-500 hover:text-red-600"
                            onClick={() => setDeleteRuleId(rule.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ───────── CREATE / EDIT MODAL ───────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {editingRule ? 'Chỉnh sửa quy tắc macro' : 'Thêm quy tắc macro định giá mới'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Mô hình 2 cấp: Chọn Tỉnh/Thành phố sau đó chọn Xã/Phường tương ứng.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 text-xs">
            {/* Tên quy tắc */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tên quy tắc *</Label>
              <Input
                className="h-9 text-xs"
                placeholder="Ví dụ: Về TP Phủ Lý (Hà Nam) giảm 20k / Sân bay Nội Bài đi Hải Phòng tăng 50k"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            {/* Điểm đón (Origin 2 cấp: Tỉnh -> Xã) */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-2">
              <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                Điểm đón (Origin) - 2 cấp: Tỉnh → Xã
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Tỉnh / Thành phố</Label>
                  <Select
                    value={formData.originProvinceCode || '__ALL__'}
                    onValueChange={handleOriginProvinceChange}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue placeholder="Toàn quốc (Bất kỳ tỉnh nào)" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="__ALL__">Toàn quốc (Bất kỳ)</SelectItem>
                      {provinces.map((p) => (
                        <SelectItem key={p.code} value={p.code}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Xã / Phường</Label>
                  <Select
                    value={formData.originWardCode || '__ALL__'}
                    onValueChange={(val) =>
                      setFormData((prev) => ({ ...prev, originWardCode: val === '__ALL__' ? '' : val }))
                    }
                    disabled={!formData.originProvinceCode || loadingOriginWards}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue
                        placeholder={
                          loadingOriginWards
                            ? 'Đang tải danh sách xã...'
                            : !formData.originProvinceCode
                            ? 'Chọn tỉnh trước'
                            : 'Toàn bộ tỉnh (Mọi xã)'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="__ALL__">Toàn bộ tỉnh (Mọi xã)</SelectItem>
                      {originWards.map((w) => (
                        <SelectItem key={w.code} value={w.code}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Điểm đến (Destination 2 cấp: Tỉnh -> Xã) */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-2">
              <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-purple-600" />
                Điểm đến (Destination) - 2 cấp: Tỉnh → Xã
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Tỉnh / Thành phố</Label>
                  <Select
                    value={formData.destProvinceCode || '__ALL__'}
                    onValueChange={handleDestProvinceChange}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue placeholder="Toàn quốc (Bất kỳ tỉnh nào)" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="__ALL__">Toàn quốc (Bất kỳ)</SelectItem>
                      {provinces.map((p) => (
                        <SelectItem key={p.code} value={p.code}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Xã / Phường</Label>
                  <Select
                    value={formData.destWardCode || '__ALL__'}
                    onValueChange={(val) =>
                      setFormData((prev) => ({ ...prev, destWardCode: val === '__ALL__' ? '' : val }))
                    }
                    disabled={!formData.destProvinceCode || loadingDestWards}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue
                        placeholder={
                          loadingDestWards
                            ? 'Đang tải danh sách xã...'
                            : !formData.destProvinceCode
                            ? 'Chọn tỉnh trước'
                            : 'Toàn bộ tỉnh (Mọi xã)'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="__ALL__">Toàn bộ tỉnh (Mọi xã)</SelectItem>
                      {destWards.map((w) => (
                        <SelectItem key={w.code} value={w.code}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Dịch vụ & Loại xe */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Loại dịch vụ</Label>
                <Select
                  value={formData.serviceType}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, serviceType: val }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả dịch vụ</SelectItem>
                    <SelectItem value="CARPOOL">Ghép xe (CARPOOL)</SelectItem>
                    <SelectItem value="CONVENIENT">Bao xe (CONVENIENT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Loại phương tiện</Label>
                <Select
                  value={formData.vehicleType}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, vehicleType: val }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả loại xe</SelectItem>
                    <SelectItem value="4SEATS">Xe 4 chỗ</SelectItem>
                    <SelectItem value="7SEATS">Xe 7 chỗ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Kiểu điều chỉnh & Giá trị */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Kiểu điều chỉnh</Label>
                <Select
                  value={formData.adjustmentType}
                  onValueChange={(val) =>
                    setFormData((prev) => ({ ...prev, adjustmentType: val as MacroAdjustmentType }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DELTA_AMOUNT">Cộng/Trừ tiền cố định (± VNĐ)</SelectItem>
                    <SelectItem value="PERCENTAGE">Theo phần trăm (± %)</SelectItem>
                    <SelectItem value="MIN_FLOOR">Giá sàn tối thiểu (VNĐ)</SelectItem>
                    <SelectItem value="MAX_CEILING">Giá trần tối đa (VNĐ)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">
                  Giá trị ({formData.adjustmentType === 'PERCENTAGE' ? '%' : 'VNĐ'})
                </Label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  placeholder={formData.adjustmentType === 'PERCENTAGE' ? 'Ví dụ: 10 hoặc -5' : 'Ví dụ: -20000 hoặc 50000'}
                  value={formData.adjustmentValue}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, adjustmentValue: parseFloat(e.target.value) || 0 }))
                  }
                  required
                />
              </div>
            </div>

            {/* Checkbox per seat & priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="applyPerSeat"
                  checked={formData.applyPerSeat}
                  onCheckedChange={(c) => setFormData((prev) => ({ ...prev, applyPerSeat: !!c }))}
                />
                <Label htmlFor="applyPerSeat" className="text-xs font-normal cursor-pointer">
                  Áp dụng nhân theo số ghế (khi đi ghép xe)
                </Label>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Độ ưu tiên (Số càng cao càng ưu tiên)</Label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, priority: parseInt(e.target.value, 10) || 0 }))
                  }
                />
              </div>
            </div>

            {/* Ghi chú & Kích hoạt */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Ghi chú</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Ghi chú nội bộ cho admin..."
                value={formData.note}
                onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
              />
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <Checkbox
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(c) => setFormData((prev) => ({ ...prev, isActive: !!c }))}
              />
              <Label htmlFor="isActive" className="text-xs font-normal cursor-pointer">
                Kích hoạt quy tắc ngay
              </Label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Huỷ
              </Button>
              <Button type="submit" size="sm" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                Lưu quy tắc
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ───────── DELETE CONFIRM ALERT DIALOG ───────── */}
      <AlertDialog open={!!deleteRuleId} onOpenChange={(open) => !open && setDeleteRuleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold text-slate-900">
              Xác nhận xoá quy tắc macro
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              Bạn có chắc chắn muốn xoá quy tắc này? Sau khi xoá, các chuyến đi sẽ không còn áp dụng quy tắc này nữa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Xoá quy tắc
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
