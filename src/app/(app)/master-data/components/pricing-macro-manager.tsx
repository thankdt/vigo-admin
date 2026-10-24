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
import { Combobox } from '@/components/ui/combobox';
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
  MapPin,
  RefreshCw,
  Compass,
  ArrowLeftRight,
  Sparkles,
  X,
} from 'lucide-react';
import {
  getPricingMacroRulesPage,
  aiSearchPricingMacroRules,
  getPricingMacroProvinces,
  getSpecialZones,
  getPricingMacroWards,
  updatePricingMacroRule,
  deletePricingMacroRule,
  bulkDeletePricingMacroRules,
  getPricingMacroBandWarnings,
} from '@/lib/api';
import {
  FORM_SERVICE_VALUES,
  FORM_VEHICLE_VALUES,
  MACRO_BULK_DELETE_MAX,
  MACRO_VALUE_LIMITS,
  adjustmentValueError,
  adjustmentValueHint,
  adjustmentValueRange,
  bidirectionalNotHonored,
  chunk,
  formServiceValue,
  formVehicleValue,
  formatMacroAdjustment,
  isLegacyAdjustmentType,
  isZoneWardCode,
  MACRO_ZONE_PREFIX,
  priorityError,
  serviceLabel,
  summarizeWarnings,
  vehicleLabel,
} from '@/lib/macro-bulk';
import { MacroBulkDialog } from './macro-bulk-dialog';
import type {
  PricingMacroRule,
  ProvinceOption,
  SpecialZone,
  WardOption,
  MacroAdjustmentType,
  MacroBandWarnings,
} from '@/lib/types';
import { cn } from '@/lib/utils';

/** Số dòng mỗi trang: admin chọn được; mặc định 50. */
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

/** Giá trị của mục "Toàn quốc / Toàn bộ tỉnh" trong ô chọn tỉnh / xã (form lưu '' cho "không giới hạn"). */
const ALL_CODE = '__ALL__';

/** Luật tính THEO GHẾ (đi ghép) hay THEO CHUYẾN (bao xe) — cùng quy ước với cột "Điều chỉnh" của bảng. */
const isPerSeatRule = (r: PricingMacroRule) =>
  r.applyPerSeat && r.serviceType !== 'RIDE' && r.serviceType !== 'CONVENIENT';

/**
 * Lựa chọn cho ô chọn tỉnh / xã có thể tìm: mục "tất cả" đứng đầu rồi tới danh sách.
 * Mã đang chọn mà chưa có trong danh sách (đang nạp xã, hoặc nạp lỗi) vẫn được hiện — bằng mã — thay vì ô trống.
 */
function withAllOption(
  allLabel: string,
  items: { code: string; name: string }[],
  selectedCode: string,
): { value: string; label: string }[] {
  const options = [{ value: ALL_CODE, label: allLabel }, ...items.map((i) => ({ value: i.code, label: i.name }))];
  if (selectedCode && !items.some((i) => i.code === selectedCode)) {
    options.push({ value: selectedCode, label: selectedCode });
  }
  return options;
}

export function PricingMacroManager() {
  const { toast } = useToast();

  const [rules, setRules] = React.useState<PricingMacroRule[]>([]);
  // Bản chụp các luật đã từng hiển thị: vùng chọn xuyên trang nên hộp sửa hàng loạt cần dữ liệu cả luật đang ẩn.
  const ruleCache = React.useRef(new Map<number, PricingMacroRule>());
  React.useEffect(() => {
    rules.forEach((r) => ruleCache.current.set(r.id, r));
  }, [rules]);
  const [provinces, setProvinces] = React.useState<ProvinceOption[]>([]);
  // Điểm đặc biệt ĐANG BẬT: thêm vào ô "Xã / Phường" của tỉnh chứa vùng (giá trị `ZONE:<mã>`, backend điền tỉnh).
  const [zones, setZones] = React.useState<SpecialZone[]>([]);
  const [loading, setLoading] = React.useState(true);
  const initialNote = typeof window !== 'undefined' && /^\d+$/.test(new URLSearchParams(window.location.search).get('ruleId')?.trim() || '')
    ? `#${new URLSearchParams(window.location.search).get('ruleId')!.trim()}`
    : '';
  // Bộ lọc duy nhất ngoài AI: liên kết sâu `?ruleId=` từ trang đơn (hiện thành chip, bấm ✕ để bỏ).
  const [noteFilter, setNoteFilter] = React.useState(initialNote);
  // Tìm kiếm AI (Gemini)
  const [aiQuery, setAiQuery] = React.useState('');
  const [aiSearching, setAiSearching] = React.useState(false);
  const [aiResult, setAiResult] = React.useState<{
    query: string;
    explanation: string;
    winningRuleId: number | null;
  } | null>(null);
  // Phân trang + tìm kiếm chạy ở SERVER (luật nhiều thì tải hết sẽ lag).
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = React.useState(0);
  const [reloadKey, setReloadKey] = React.useState(0);
  const loadSeq = React.useRef(0);

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
    isBidirectional: boolean;
    note: string;
  }>({
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
    // Spec bỏ-tuyến §5: luật MỚI mặc định HAI chiều (backend lưu `isBidirectional !== false`).
    isBidirectional: true,
    note: '',
  });

  // Băng chặn kết quả: luật % đang bật lọt ngoài biên (báo giá khớp có thể bị PRC_002). Không chặn thao tác.
  const [bandWarnings, setBandWarnings] = React.useState<MacroBandWarnings | null>(null);

  // Chọn nhiều + tạo/xoá hàng loạt
  // Chọn xuyên các trang: id → nhãn (để hộp xác nhận xoá liệt kê được cả dòng không còn ở trang hiện tại).
  const [selected, setSelected] = React.useState<Map<number, string>>(new Map());
  const selectedIds = React.useMemo(() => new Set(selected.keys()), [selected]);
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  // Sửa giá hàng loạt: đặt CÙNG kiểu + giá trị cho mọi luật đã chọn (gọi PUT từng luật, backend chưa có API bulk-update).
  const [bulkEditOpen, setBulkEditOpen] = React.useState(false);
  const [bulkEditing, setBulkEditing] = React.useState(false);
  const [bulkEditType, setBulkEditType] = React.useState<MacroAdjustmentType>('DELTA_AMOUNT');
  const [bulkEditValue, setBulkEditValue] = React.useState('');

  // Delete State
  const [deleteRuleId, setDeleteRuleId] = React.useState<number | null>(null);
  const [deleting, setDeleting] = React.useState(false);


  // Tỉnh nạp một lần (tên tỉnh cho bảng + ô chọn).
  React.useEffect(() => {
    getPricingMacroProvinces()
      .then((p) => setProvinces(p || []))
      .catch(() => setProvinces([]));
  }, []);

  const hasActiveSearch = Boolean(noteFilter || aiResult);

  const handleAiSearch = React.useCallback(
    async (targetPage = 1) => {
      const q = aiQuery.trim();
      if (!q) return;
      const seq = ++loadSeq.current;
      setAiSearching(true);
      setLoading(true);
      try {
        const res = await aiSearchPricingMacroRules({
          query: q,
          page: targetPage,
          limit: pageSize,
        });
        if (seq !== loadSeq.current) return;
        setRules(res?.items ?? []);
        setTotal(res?.total ?? 0);
        setPage(targetPage);
        setAiResult({
          query: q,
          explanation: res?.explanation || `Kết quả tìm kiếm AI cho "${q}"`,
          winningRuleId: res?.winningRuleId ?? null,
        });
      } catch (err: any) {
        if (seq !== loadSeq.current) return;
        toast({
          title: 'Lỗi tìm kiếm AI',
          description: err.message || 'Không thể thực hiện tìm kiếm bằng Gemini AI',
          variant: 'destructive',
        });
      } finally {
        if (seq === loadSeq.current) {
          setAiSearching(false);
          setLoading(false);
        }
      }
    },
    [aiQuery, pageSize, toast],
  );

  const clearAiSearch = React.useCallback(() => {
    setAiQuery('');
    setAiResult(null);
    setPage(1);
    setReloadKey((k) => k + 1);
  }, []);

  // Nạp MỘT trang luật. Có số thứ tự yêu cầu: kết quả của yêu cầu cũ không được đè lên yêu cầu mới.
  React.useEffect(() => {
    if (aiResult) {
      handleAiSearch(page);
      return;
    }
    const seq = ++loadSeq.current;
    setLoading(true);
    getPricingMacroRulesPage({
      page,
      limit: pageSize,
      ...(noteFilter ? { noteSearch: noteFilter } : {}),
    })
      .then((res) => {
        if (seq !== loadSeq.current) return;
        const items = res?.items ?? [];
        const count = res?.total ?? 0;
        // Xoá hết dòng của trang cuối ⇒ lùi về trang cuối còn dữ liệu (không kẹt ở trang trống).
        if (items.length === 0 && count > 0 && page > 1) {
          setPage(Math.max(1, Math.ceil(count / pageSize)));
          return;
        }
        setRules(items);
        setTotal(count);
        setLoading(false);
      })
      .catch((err: any) => {
        if (seq !== loadSeq.current) return;
        toast({
          title: 'Lỗi tải dữ liệu Macro',
          description: err.message || 'Không thể tải danh sách quy tắc macro',
          variant: 'destructive',
        });
        setLoading(false);
      });
  }, [page, pageSize, noteFilter, reloadKey, toast]);

  // Cảnh báo băng chặn: phụ — lỗi (backend cũ / thiếu quyền master-data) thì bỏ qua, không làm hỏng danh sách.
  const loadBandWarnings = React.useCallback(() => {
    getPricingMacroBandWarnings()
      .then((b) => setBandWarnings(b ?? null))
      .catch(() => setBandWarnings(null));
  }, []);

  React.useEffect(() => {
    loadBandWarnings();
  }, [loadBandWarnings, reloadKey]);

  /** Nạp lại trang hiện tại (sau khi lưu/xoá/tạo, hoặc bấm Làm mới). */
  const loadData = React.useCallback(() => setReloadKey((k) => k + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getSpecialZones())
      .then((list) => {
        if (!cancelled) setZones((list || []).filter((z) => z.active));
      })
      .catch(() => {
        // Chỉ mất lựa chọn "điểm đặc biệt"; sửa theo tỉnh/xã vẫn chạy.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Xã của tỉnh + các điểm đặc biệt thuộc tỉnh đó (đứng trước, nhãn rõ là điểm đặc biệt). */
  const withZones = (wards: { code: string; name: string }[], provinceCode: string) => [
    ...zones
      .filter((z) => z.provinceCode === provinceCode)
      .map((z) => ({ code: `${MACRO_ZONE_PREFIX}${z.code}`, name: `${z.name} (điểm đặc biệt)` })),
    ...wards,
  ];

  // Load wards when province changes in dialog
  const handleOriginProvinceChange = async (provCode: string) => {
    const val = provCode === ALL_CODE ? '' : provCode;
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
    const val = provCode === ALL_CODE ? '' : provCode;
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

  // "Thêm quy tắc" = hộp thoại nhiều xã (một xã mỗi bên ⇒ một luật). Form một-luật chỉ còn dùng để SỬA.
  const openCreateDialog = () => setBulkDialogOpen(true);

  const openEditDialog = async (rule: PricingMacroRule) => {
    setEditingRule(rule);
    setFormData({
      isActive: rule.isActive,
      priority: rule.priority,
      // Luật tạo từ API/bulk có thể mang dạng chuẩn (RIDE, CAR_4...): quy về giá trị của ô chọn.
      serviceType: formServiceValue(rule.serviceType),
      vehicleType: formVehicleValue(rule.vehicleType),
      originProvinceCode: rule.originProvinceCode || '',
      originWardCode: rule.originWardCode || '',
      destProvinceCode: rule.destProvinceCode || '',
      destWardCode: rule.destWardCode || '',
      adjustmentType: rule.adjustmentType,
      adjustmentValue: Number(rule.adjustmentValue),
      isBidirectional: rule.isBidirectional === true,
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
    // Báo sớm giá trị ngoài biên (backend vẫn là nơi chốt, cùng một bộ số).
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
        originProvinceCode: formData.originProvinceCode || null,
        originWardCode: formData.originWardCode || null,
        destProvinceCode: formData.destProvinceCode || null,
        destWardCode: formData.destWardCode || null,
        adjustmentType: formData.adjustmentType,
        adjustmentValue: Number(formData.adjustmentValue) || 0,
        // Backend luôn nhân theo ghế và từ chối `applyPerSeat=false`: gửi true cho khớp mọi phiên bản.
        applyPerSeat: true,
        isBidirectional: formData.isBidirectional,
        note: formData.note ? formData.note.trim() : null,
      };

      if (!editingRule) return; // tạo mới đi qua MacroBulkDialog
      const saved = await updatePricingMacroRule(editingRule.id, payload);

      if (bidirectionalNotHonored(formData.isBidirectional, saved)) {
        // Backend cũ bỏ qua field lặng lẽ: quy tắc đã lưu nhưng chỉ MỘT chiều.
        toast({
          title: 'Máy chủ chưa hỗ trợ quy tắc hai chiều',
          description: 'Quy tắc đã lưu nhưng chỉ áp dụng MỘT chiều. Cần cập nhật backend trước.',
          variant: 'destructive',
        });
      } else {
        const w = summarizeWarnings(saved.warnings);
        toast({
          title: 'Cập nhật quy tắc macro thành công',
          description:
            w.count > 0
              ? `Có ${w.count} cảnh báo (không chặn): ${w.lines.join(' · ')}${w.more ? ` · … và ${w.more} cảnh báo khác` : ''}`
              : undefined,
        });
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
      const deletedId = deleteRuleId;
      setSelected((prev) => {
        if (!prev.has(deletedId)) return prev;
        const next = new Map(prev);
        next.delete(deletedId);
        return next;
      });
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

  const toggleRow = (rule: PricingMacroRule) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(rule.id)) next.delete(rule.id);
      else next.set(rule.id, ruleTitle(rule));
      return next;
    });

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    let deleted = 0;
    let missing = 0;
    try {
      // Backend nhận tối đa MACRO_BULK_DELETE_MAX id mỗi lần.
      for (const part of chunk(ids, MACRO_BULK_DELETE_MAX)) {
        const res = await bulkDeletePricingMacroRules(part);
        deleted += res.deleted.length;
        missing += res.missing.length;
      }
      toast({
        title: `Đã xoá ${deleted} quy tắc`,
        description: missing ? `${missing} quy tắc không còn tồn tại.` : undefined,
      });
      setSelected(new Map());
    } catch (err: any) {
      toast({
        title: 'Lỗi xoá hàng loạt',
        description: `${err?.message || 'Không thể xoá quy tắc'}${deleted ? ` (đã xoá được ${deleted} trước khi lỗi)` : ''}`,
        variant: 'destructive',
      });
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
      loadData();
    }
  };

  const openBulkEdit = () => {
    setBulkEditType('DELTA_AMOUNT');
    setBulkEditValue('');
    setBulkEditOpen(true);
  };

  const bulkEditValueError =
    bulkEditValue.trim() === '' ? 'Nhập giá trị.' : adjustmentValueError(bulkEditType, Number(bulkEditValue));

  const handleBulkEdit = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkEditValueError) return;
    const payload = { adjustmentType: bulkEditType, adjustmentValue: Number(bulkEditValue) };
    setBulkEditing(true);
    const okIds: number[] = [];
    const failed: { id: number; message: string }[] = [];
    let warningCount = 0;
    try {
      // 5 yêu cầu song song mỗi đợt: đủ nhanh, không dồn tải lên máy chủ/trình duyệt.
      for (const part of chunk(ids, 5)) {
        const results = await Promise.allSettled(part.map((id) => updatePricingMacroRule(id, payload)));
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            okIds.push(part[i]);
            warningCount += r.value?.warnings?.length ?? 0;
          } else {
            failed.push({ id: part[i], message: r.reason?.message || 'Lỗi không xác định' });
          }
        });
      }
      toast({
        title: failed.length ? `Đã sửa ${okIds.length}/${ids.length} quy tắc` : `Đã sửa ${okIds.length} quy tắc`,
        description:
          [
            failed.length
              ? `${failed.length} quy tắc lỗi (giữ nguyên chọn để thử lại): ${failed
                  .slice(0, 3)
                  .map((f) => `${selected.get(f.id) ?? `#${f.id}`} — ${f.message}`)
                  .join('; ')}${failed.length > 3 ? '…' : ''}`
              : '',
            warningCount ? `Có ${warningCount} cảnh báo biên (không chặn).` : '',
          ]
            .filter(Boolean)
            .join(' ') || undefined,
        variant: failed.length ? 'destructive' : undefined,
      });
      // Chỉ bỏ chọn các luật đã sửa xong; luật lỗi vẫn được chọn để thử lại.
      setSelected((prev) => {
        const next = new Map(prev);
        okIds.forEach((id) => next.delete(id));
        return next;
      });
      if (failed.length === 0) setBulkEditOpen(false);
    } finally {
      setBulkEditing(false);
      loadData();
    }
  };

  // Helper name lookups
  const getProvinceName = (code?: string | null) => {
    if (!code) return 'Toàn quốc';
    const found = provinces.find((p) => p.code === code);
    return found ? found.name : code;
  };

  /** Một đầu: tên xã/điểm đặc biệt (nếu có) + tỉnh. Backend cũ không trả tên xã ⇒ hiện mã. */
  const endLabel = (provinceCode?: string | null, wardCode?: string | null, wardName?: string) => {
    const prov = getProvinceName(provinceCode);
    if (!wardCode) return prov;
    if (isZoneWardCode(wardCode) && !wardName) return `Điểm đặc biệt ${wardCode.slice(MACRO_ZONE_PREFIX.length)}${provinceCode ? ` (${prov})` : ''}`;
    return `${wardName || `Xã #${wardCode}`}${provinceCode ? ` (${prov})` : ''}`;
  };

  /** Tên hiển thị của luật: "Đón → Trả" / "Đón ↔ Trả" (luật không còn tên riêng). */
  const ruleTitle = (r: PricingMacroRule) =>
    `${endLabel(r.originProvinceCode, r.originWardCode, r.originWardName)} ${r.isBidirectional ? '↔' : '→'} ${endLabel(
      r.destProvinceCode,
      r.destWardCode,
      r.destWardName,
    )}`;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = firstRow === 0 ? 0 : firstRow + rules.length - 1;

  const formatAdjustment = formatMacroAdjustment;

  // Vùng chọn là TOÀN CỤC (xuyên trang và không bị bộ lọc tìm kiếm cắt): hộp xác nhận xoá phải cho thấy
  // chính xác những quy tắc nào sẽ bị xoá, kể cả những dòng không còn nằm ở trang đang xem.
  const selectedTitles = React.useMemo(() => Array.from(selected.values()), [selected]);
  const offPageSelectedCount = React.useMemo(() => {
    const onPage = new Set(rules.map((r) => r.id));
    return Array.from(selected.keys()).filter((id) => !onPage.has(id)).length;
  }, [selected, rules]);
  const BULK_DELETE_LIST_MAX = 8;

  // Bản xem trước sửa hàng loạt: luật đã chọn (kể cả luật đang ẩn do trang/bộ lọc) với giá trị CŨ → MỚI.
  const bulkEditRules = React.useMemo(
    () =>
      bulkEditOpen
        ? Array.from(selected.keys()).map((id) => ({ id, title: selected.get(id)!, rule: ruleCache.current.get(id) }))
        : [],
    [bulkEditOpen, selected],
  );
  const bulkEditNewValue = Number(bulkEditValue);
  const bulkEditPerSeatCount = bulkEditRules.filter((r) => r.rule && isPerSeatRule(r.rule)).length;
  const bulkEditWholeCarCount = bulkEditRules.filter((r) => r.rule && !isPerSeatRule(r.rule)).length;
  const bulkEditMixesUnits = bulkEditType !== 'PERCENTAGE' && bulkEditPerSeatCount > 0 && bulkEditWholeCarCount > 0;
  const bulkEditLegacyCount = bulkEditRules.filter((r) => r.rule && isLegacyAdjustmentType(r.rule.adjustmentType)).length;

  // Ô chọn tỉnh / xã có ô tìm (gõ không dấu vẫn khớp): xã mỗi tỉnh có thể hơn 100 mục.
  const originProvinceOptions = React.useMemo(
    () => withAllOption('Toàn quốc (Bất kỳ)', provinces, formData.originProvinceCode),
    [provinces, formData.originProvinceCode],
  );
  const destProvinceOptions = React.useMemo(
    () => withAllOption('Toàn quốc (Bất kỳ)', provinces, formData.destProvinceCode),
    [provinces, formData.destProvinceCode],
  );
  const originWardOptions = React.useMemo(
    () => withAllOption('Toàn bộ tỉnh (Mọi xã)', withZones(originWards, formData.originProvinceCode), formData.originWardCode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [originWards, formData.originWardCode, formData.originProvinceCode, zones],
  );
  const destWardOptions = React.useMemo(
    () => withAllOption('Toàn bộ tỉnh (Mọi xã)', withZones(destWards, formData.destProvinceCode), formData.destWardCode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [destWards, formData.destWardCode, formData.destProvinceCode, zones],
  );

  return (
    <div className="space-y-6">
      {/* ───────── HEADER & SIMULATOR ACCORDION / TOGGLE ───────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Compass className="w-5 h-5 text-indigo-600" />
            Điều chỉnh khu vực
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

      {bandWarnings && bandWarnings.warnings.length > 0 && (
        <div role="alert" data-testid="band-warnings" className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-semibold">
            {bandWarnings.warnings.length} quy tắc % đang bật có thể làm báo giá bị từ chối
          </div>
          <div className="mt-0.5">
            Giá sau điều chỉnh nằm ngoài băng cho phép
            {bandWarnings.band?.minRatio != null && bandWarnings.band?.maxRatio != null
              ? ` (tỉ lệ ${bandWarnings.band.minRatio}–${bandWarnings.band.maxRatio} × giá nền)`
              : ''}
            : báo giá khớp các quy tắc này sẽ bị từ chối (khách không đặt được chuyến). Hãy sửa mức % hoặc điều chỉnh băng.
          </div>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            {bandWarnings.warnings.slice(0, 5).map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
          {bandWarnings.warnings.length > 5 && (
            <div className="mt-1 text-amber-700">… và {bandWarnings.warnings.length - 5} cảnh báo khác.</div>
          )}
        </div>
      )}

      {/* ───────── RULES LIST TABLE ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <CardTitle className="text-base font-semibold text-slate-800">
                Danh sách Quy tắc Điều chỉnh Khu vực ({total})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Mỗi chuyến chỉ áp dụng MỘT quy tắc: quy tắc khớp chi tiết nhất thắng (xã/phường › tỉnh › đúng dịch vụ ›
                đúng loại xe). Chỉ khi chi tiết như nhau thì độ ưu tiên cao hơn thắng. Giá sau quy tắc phải nằm trong
                biên cho phép, nếu vượt thì báo giá bị từ chối (khách không đặt được chuyến).
              </CardDescription>
            </div>
            <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
              {selectedIds.size > 0 && (
                <Button variant="outline" size="sm" className="h-9 text-xs" onClick={openBulkEdit}>
                  <Edit className="w-3.5 h-3.5 mr-1" />
                  Sửa giá đã chọn ({selectedIds.size})
                </Button>
              )}
              {selectedIds.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Xoá đã chọn ({selectedIds.size})
                </Button>
              )}
              {noteFilter && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs"
                  aria-label="Bỏ lọc quy tắc"
                  onClick={() => {
                    setNoteFilter('');
                    setPage(1);
                  }}
                >
                  Đang lọc {noteFilter}
                  <X className="w-3.5 h-3.5 ml-1" />
                </Button>
              )}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Sparkles className="w-4 h-4 absolute left-2.5 top-2.5 text-indigo-500" />
                <Input
                  aria-label="Tìm kiếm thông minh bằng AI"
                  className="pl-8 h-9 text-xs border-indigo-200 focus-visible:ring-indigo-500 bg-indigo-50/30"
                  placeholder='Hỏi AI tìm quy tắc (vd: "Đông Anh đi Phủ Lý ăn rule nào?", "bao xe 7 chỗ Hà Nội đi Hải Dương cũ", "rule giá trên 2 triệu")...'
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAiSearch(1);
                    }
                  }}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-9 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={aiSearching || !aiQuery.trim()}
                  onClick={() => handleAiSearch(1)}
                >
                  {aiSearching ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                  )}
                  Tìm với AI
                </Button>
                {aiResult && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={clearAiSearch}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Xoá lọc AI
                  </Button>
                )}
              </div>
            </div>
            {aiResult && (
              <div
                data-testid="ai-search-banner"
                className="rounded-md border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-950 flex items-start gap-2"
              >
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                  <span className="font-semibold text-indigo-700">Gemini AI: </span>
                  {aiResult.explanation}
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 text-xs">
                <TableHead className="w-8">
                  <Checkbox
                    aria-label="Chọn tất cả quy tắc ở trang này"
                    checked={rules.length > 0 && rules.every((r) => selectedIds.has(r.id))}
                    onCheckedChange={(c) =>
                      setSelected((prev) => {
                        const next = new Map(prev);
                        for (const r of rules) {
                          if (c) next.set(r.id, ruleTitle(r));
                          else next.delete(r.id);
                        }
                        return next;
                      })
                    }
                  />
                </TableHead>
                <TableHead className="w-12 text-center">Ưu tiên</TableHead>
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
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-slate-400 text-xs">
                    {hasActiveSearch
                      ? 'Không có quy tắc nào khớp từ khoá tìm kiếm.'
                      : 'Chưa có quy tắc macro nào. Bấm "Thêm quy tắc" để bắt đầu cấu hình.'}
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => {
                  const isWinner = aiResult?.winningRuleId === rule.id;
                  return (
                    <TableRow
                      key={rule.id}
                      data-testid={`rule-row-${rule.id}`}
                      className={cn(
                        'text-xs hover:bg-slate-50/50',
                        isWinner && 'bg-emerald-50/70 hover:bg-emerald-50',
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          aria-label={`Chọn quy tắc #${rule.id} ${ruleTitle(rule)}`}
                          checked={selectedIds.has(rule.id)}
                          onCheckedChange={() => toggleRow(rule)}
                        />
                      </TableCell>
                      <TableCell className="text-center font-bold text-slate-600">
                        <div>{rule.priority}</div>
                        <div className="text-[10px] font-normal text-slate-400">#{rule.id}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-slate-700 font-medium flex items-center gap-1.5 flex-wrap">
                          <span>{getProvinceName(rule.originProvinceCode)}</span>
                          {isWinner && (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] h-4 px-1.5">
                              ⚡ Đang áp dụng
                            </Badge>
                          )}
                        </div>
                        {rule.originWardCode && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 mt-0.5 bg-blue-50 text-blue-700">
                            {rule.originWardName || `Xã #${rule.originWardCode}`}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-slate-700 font-medium">
                          {getProvinceName(rule.destProvinceCode)}
                        </div>
                        {rule.destWardCode && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 mt-0.5 bg-purple-50 text-purple-700">
                            {rule.destWardName || `Xã #${rule.destWardCode}`}
                          </Badge>
                        )}
                        {rule.isBidirectional && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 px-1 mt-0.5 ml-1 bg-indigo-50 text-indigo-700 border-indigo-200"
                            title="Áp dụng cả chiều ngược (trả → đón)"
                          >
                            <ArrowLeftRight className="w-3 h-3 mr-0.5" />2 chiều
                          </Badge>
                        )}
                        {rule.note && <div className="text-[11px] text-slate-400 mt-0.5">{rule.note}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">
                            {serviceLabel(rule.serviceType)}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">
                            {vehicleLabel(rule.vehicleType)}
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
                            rule.adjustmentType === 'FIXED_PRICE' && 'text-blue-700',
                          )}
                        >
                          {formatAdjustment(
                            rule.adjustmentType,
                            Number(rule.adjustmentValue),
                            isPerSeatRule(rule),
                          )}
                        </span>
                        {isLegacyAdjustmentType(rule.adjustmentType) && (
                          <Badge
                            variant="outline"
                            className="ml-1 text-[10px] h-4 px-1 bg-amber-50 text-amber-700 border-amber-200"
                            title="Backend không còn áp loại sàn/trần vào giá"
                          >
                            ngừng áp dụng
                          </Badge>
                        )}
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
                            aria-label={`Sửa quy tắc #${rule.id} ${ruleTitle(rule)}`}
                            onClick={() => openEditDialog(rule)}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-500 hover:text-red-600"
                            aria-label={`Xoá quy tắc #${rule.id} ${ruleTitle(rule)}`}
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
          <div
            className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t px-4 py-2 text-xs text-slate-600"
            data-testid="rules-pager"
          >
            <div>
              {total === 0 ? 'Không có quy tắc' : `Hiển thị ${firstRow}–${lastRow} / ${total} quy tắc`}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1">
                Số dòng/trang
                <select
                  aria-label="Số dòng mỗi trang"
                  className="h-7 rounded-md border border-input bg-white px-1 text-xs"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                aria-label="Trang trước"
                disabled={loading || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Trước
              </Button>
              <span aria-live="polite">
                Trang {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                aria-label="Trang sau"
                disabled={loading || page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ───────── CREATE / EDIT MODAL ───────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Chỉnh sửa quy tắc macro
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Mô hình 2 cấp: Chọn Tỉnh/Thành phố sau đó chọn Xã/Phường tương ứng.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 text-xs">
            {/* Điểm đón (Origin 2 cấp: Tỉnh -> Xã) */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/60 space-y-2">
              <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                Điểm đón (Origin) - 2 cấp: Tỉnh → Xã
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="macro-origin-province" className="text-[11px] text-slate-500">Tỉnh / Thành phố</Label>
                  <Combobox
                    id="macro-origin-province"
                    className="h-8 text-xs bg-white"
                    options={originProvinceOptions}
                    selectedValue={formData.originProvinceCode || ALL_CODE}
                    // Bấm lại mục đang chọn làm Combobox trả undefined: bỏ qua, đừng đặt lại thành "Toàn quốc".
                    onSelect={(val) => {
                      if (val !== undefined) handleOriginProvinceChange(val);
                    }}
                    placeholder="Toàn quốc (Bất kỳ tỉnh nào)"
                    searchPlaceholder="Tìm tỉnh / thành phố..."
                    noResultsText="Không tìm thấy tỉnh"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="macro-origin-ward" className="text-[11px] text-slate-500">Xã / Phường</Label>
                  <Combobox
                    id="macro-origin-ward"
                    className="h-8 text-xs bg-white"
                    options={originWardOptions}
                    selectedValue={formData.originWardCode || (formData.originProvinceCode && !loadingOriginWards ? ALL_CODE : undefined)}
                    onSelect={(val) => {
                      if (val !== undefined) {
                        setFormData((prev) => ({ ...prev, originWardCode: val === ALL_CODE ? '' : val }));
                      }
                    }}
                    disabled={!formData.originProvinceCode || loadingOriginWards}
                    placeholder={
                      loadingOriginWards
                        ? 'Đang tải danh sách xã...'
                        : !formData.originProvinceCode
                        ? 'Chọn tỉnh trước'
                        : 'Toàn bộ tỉnh (Mọi xã)'
                    }
                    searchPlaceholder="Tìm xã / phường..."
                    noResultsText="Không tìm thấy xã / phường"
                  />
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
                  <Label htmlFor="macro-dest-province" className="text-[11px] text-slate-500">Tỉnh / Thành phố</Label>
                  <Combobox
                    id="macro-dest-province"
                    className="h-8 text-xs bg-white"
                    options={destProvinceOptions}
                    selectedValue={formData.destProvinceCode || ALL_CODE}
                    // Bấm lại mục đang chọn làm Combobox trả undefined: bỏ qua, đừng đặt lại thành "Toàn quốc".
                    onSelect={(val) => {
                      if (val !== undefined) handleDestProvinceChange(val);
                    }}
                    placeholder="Toàn quốc (Bất kỳ tỉnh nào)"
                    searchPlaceholder="Tìm tỉnh / thành phố..."
                    noResultsText="Không tìm thấy tỉnh"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="macro-dest-ward" className="text-[11px] text-slate-500">Xã / Phường</Label>
                  <Combobox
                    id="macro-dest-ward"
                    className="h-8 text-xs bg-white"
                    options={destWardOptions}
                    selectedValue={formData.destWardCode || (formData.destProvinceCode && !loadingDestWards ? ALL_CODE : undefined)}
                    onSelect={(val) => {
                      if (val !== undefined) {
                        setFormData((prev) => ({ ...prev, destWardCode: val === ALL_CODE ? '' : val }));
                      }
                    }}
                    disabled={!formData.destProvinceCode || loadingDestWards}
                    placeholder={
                      loadingDestWards
                        ? 'Đang tải danh sách xã...'
                        : !formData.destProvinceCode
                        ? 'Chọn tỉnh trước'
                        : 'Toàn bộ tỉnh (Mọi xã)'
                    }
                    searchPlaceholder="Tìm xã / phường..."
                    noResultsText="Không tìm thấy xã / phường"
                  />
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
                    {!FORM_SERVICE_VALUES.includes(formData.serviceType) && (
                      <SelectItem value={formData.serviceType}>Khác: {formData.serviceType}</SelectItem>
                    )}
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
                    {!FORM_VEHICLE_VALUES.includes(formData.vehicleType) && (
                      <SelectItem value={formData.vehicleType}>Khác: {formData.vehicleType}</SelectItem>
                    )}
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
                    <SelectItem value="FIXED_PRICE">Ghi đè giá cố định (VNĐ)</SelectItem>
                    {/* Sàn/trần: backend đã ngừng áp dụng và không cho tạo mới — chỉ hiện khi đang mở một luật cũ. */}
                    {isLegacyAdjustmentType(formData.adjustmentType) && (
                      <SelectItem value={formData.adjustmentType} disabled>
                        {formData.adjustmentType === 'MIN_FLOOR' ? 'Giá sàn tối thiểu' : 'Giá trần tối đa'} (đã ngừng áp dụng)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {isLegacyAdjustmentType(formData.adjustmentType) && (
                  <div role="note" className="text-[11px] text-amber-700">
                    Quy tắc kiểu sàn/trần không còn được áp dụng vào giá. Hãy đổi sang cộng/trừ tiền, % hoặc ghi đè giá, hoặc xoá quy tắc.
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">
                  Giá trị ({formData.adjustmentType === 'PERCENTAGE' ? '%' : 'VNĐ'})
                </Label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  {...adjustmentValueRange(formData.adjustmentType)}
                  placeholder={
                    formData.adjustmentType === 'PERCENTAGE'
                      ? 'Ví dụ: 10 hoặc -5'
                      : formData.adjustmentType === 'FIXED_PRICE'
                        ? 'Ví dụ: 250000'
                        : 'Ví dụ: -20000 hoặc 50000'
                  }
                  value={formData.adjustmentValue}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, adjustmentValue: parseFloat(e.target.value) || 0 }))
                  }
                  required
                />
                <div className="text-[11px] text-slate-400">{adjustmentValueHint(formData.adjustmentType)}</div>
                <div className="text-[11px] text-slate-400">Đi ghép: mức này áp lên giá MỘT ghế, sau đó nhân số ghế.</div>
              </div>
            </div>

            {/* Độ ưu tiên (backend luôn nhân theo số ghế khi đi ghép — không còn tuỳ chọn applyPerSeat) */}
            <div className="grid grid-cols-1 gap-3 items-center">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Độ ưu tiên (số càng cao càng thắng khi chi tiết như nhau)</Label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  min={MACRO_VALUE_LIMITS.PRIORITY_MIN}
                  max={MACRO_VALUE_LIMITS.PRIORITY_MAX}
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, priority: parseInt(e.target.value, 10) || 0 }))
                  }
                />
                <div className="text-[11px] text-slate-400">
                  Quy tắc khớp chi tiết hơn (xã/phường) luôn thắng quy tắc chung hơn, bất kể độ ưu tiên.
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="isBidirectional"
                checked={formData.isBidirectional}
                onCheckedChange={(c) => setFormData((prev) => ({ ...prev, isBidirectional: !!c }))}
              />
              <div>
                <Label htmlFor="isBidirectional" className="text-xs font-normal cursor-pointer">
                  Áp dụng cả chiều ngược (trả → đón)
                </Label>
                <div className="text-[11px] text-slate-400">
                  Một quy tắc dùng cho cả chuyến đi và chuyến về giữa hai điểm này.
                </div>
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

      {/* ───────── BULK CREATE DIALOG ───────── */}
      <MacroBulkDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        provinces={provinces}
        onDone={loadData}
      />

      {/* ───────── BULK DELETE CONFIRM ───────── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={(open) => !open && !bulkDeleting && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold text-slate-900">
              Xoá {selectedIds.size} quy tắc đã chọn?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              Các chuyến đặt sau khi xoá sẽ không còn áp dụng những quy tắc này. Thao tác không hoàn tác được.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-xs space-y-1.5" data-testid="bulk-delete-list">
            <ul className="list-disc pl-5 text-slate-700 max-h-40 overflow-y-auto">
              {Array.from(selected.entries())
                .slice(0, BULK_DELETE_LIST_MAX)
                .map(([id, title]) => (
                  <li key={id}>{title}</li>
                ))}
            </ul>
            {selectedTitles.length > BULK_DELETE_LIST_MAX && (
              <div className="text-slate-500">… và {selectedTitles.length - BULK_DELETE_LIST_MAX} quy tắc khác.</div>
            )}
            {offPageSelectedCount > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 p-1.5 text-amber-800" role="alert">
                Trong đó {offPageSelectedCount} quy tắc không nằm ở trang đang xem (trang khác hoặc bị bộ lọc ẩn) — chúng
                VẪN sẽ bị xoá.
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs" disabled={bulkDeleting}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
              onClick={(e) => {
                e.preventDefault();
                handleBulkDelete();
              }}
              disabled={bulkDeleting}
            >
              {bulkDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Xoá {selectedIds.size} quy tắc
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ───────── BULK EDIT VALUE DIALOG ───────── */}
      <Dialog open={bulkEditOpen} onOpenChange={(open) => !open && !bulkEditing && setBulkEditOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Sửa giá {selectedIds.size} quy tắc đã chọn</DialogTitle>
            <DialogDescription className="text-xs">
              Kiểu và giá trị bên dưới sẽ GHI ĐÈ lên kiểu/giá trị hiện tại của mọi quy tắc đã chọn. Các thông số khác
              (khu vực, dịch vụ, loại xe, ưu tiên…) giữ nguyên.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Kiểu điều chỉnh</Label>
              <Select value={bulkEditType} onValueChange={(v) => setBulkEditType(v as MacroAdjustmentType)}>
                <SelectTrigger aria-label="Kiểu điều chỉnh hàng loạt" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DELTA_AMOUNT">Cộng/Trừ tiền cố định (± VNĐ)</SelectItem>
                  <SelectItem value="PERCENTAGE">Theo phần trăm (± %)</SelectItem>
                  <SelectItem value="FIXED_PRICE">Ghi đè giá cố định (VNĐ)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Giá trị chung ({bulkEditType === 'PERCENTAGE' ? '%' : 'VNĐ'})</Label>
              <Input
                aria-label="Giá trị chung"
                className="h-8 text-xs"
                type="number"
                {...adjustmentValueRange(bulkEditType)}
                value={bulkEditValue}
                onChange={(e) => setBulkEditValue(e.target.value)}
              />
              {bulkEditValue.trim() !== '' && bulkEditValueError ? (
                <div role="alert" className="text-[11px] text-red-600">{bulkEditValueError}</div>
              ) : (
                <div className="text-[11px] text-slate-400">{adjustmentValueHint(bulkEditType)}</div>
              )}
            </div>
          </div>
          <div className="text-xs space-y-1.5" data-testid="bulk-edit-list">
            <ul className="list-disc pl-5 text-slate-700 max-h-40 overflow-y-auto">
              {bulkEditRules.slice(0, BULK_DELETE_LIST_MAX).map(({ id, title, rule }) => (
                <li key={id}>
                  {title}
                  {rule && (
                    <span className="text-slate-500">
                      {' '}
                      — {formatAdjustment(rule.adjustmentType, Number(rule.adjustmentValue), isPerSeatRule(rule))}
                      {!bulkEditValueError && (
                        <>
                          {' → '}
                          <b className="text-slate-800">
                            {formatAdjustment(bulkEditType, bulkEditNewValue, isPerSeatRule(rule))}
                          </b>
                        </>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {bulkEditRules.length > BULK_DELETE_LIST_MAX && (
              <div className="text-slate-500">… và {bulkEditRules.length - BULK_DELETE_LIST_MAX} quy tắc khác.</div>
            )}
            {offPageSelectedCount > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 p-1.5 text-amber-800" role="alert">
                Trong đó {offPageSelectedCount} quy tắc không nằm ở trang đang xem (trang khác hoặc bị bộ lọc ẩn) — chúng
                VẪN sẽ bị sửa.
              </div>
            )}
            {bulkEditMixesUnits && (
              <div className="rounded border border-amber-300 bg-amber-50 p-1.5 text-amber-800" role="alert">
                Lựa chọn trộn {bulkEditPerSeatCount} quy tắc tính THEO GHẾ (đi ghép) với {bulkEditWholeCarCount} quy tắc
                tính THEO CHUYẾN (bao xe): cùng một số tiền sẽ có nghĩa khác nhau. Nên sửa riêng từng nhóm.
              </div>
            )}
            {bulkEditLegacyCount > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 p-1.5 text-amber-800" role="alert">
                {bulkEditLegacyCount} quy tắc đang là kiểu sàn/trần (đã ngừng áp dụng). Đổi kiểu sẽ khiến chúng BẮT ĐẦU
                ảnh hưởng giá nếu đang bật.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" disabled={bulkEditing} onClick={() => setBulkEditOpen(false)}>
              Huỷ
            </Button>
            <Button size="sm" className="text-xs" disabled={bulkEditing || !!bulkEditValueError} onClick={handleBulkEdit}>
              {bulkEditing && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Áp dụng cho {selectedIds.size} quy tắc
            </Button>
          </DialogFooter>
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
