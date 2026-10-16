'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { MultiSelectComboBox } from '@/components/ui/multi-select-combobox';
import { Label } from '@/components/ui/label';
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
import { useAuth } from '@/lib/auth-context';
import { Loader2, PlaneTakeoff, PlusCircle, RefreshCw, Trash2, Edit } from 'lucide-react';
import {
  deleteSpecialZoneFlatPrice,
  getPricingMacroWards,
  getSpecialZoneFlatPrices,
  getSpecialZones,
  upsertSpecialZoneFlatPrice,
} from '@/lib/api';
import {
  BUSINESS_REFERENCE_VND,
  FLAT_PRICE_BYPASS_WARNING,
  FLAT_PRICE_FIELDS,
  FLAT_PRICE_NOTE_MAX,
  FLAT_PRICE_UNIT_VND,
  REFERENCE_PROVENANCE,
  FLAT_PRICE_BATCH_MAX,
  describeFlatPriceBatchSave,
  describeFlatPriceDelete,
  describeFlatPriceSave,
  diffFlatPrice,
  flatPriceTargetLabel,
  formatVnd,
  hasPriceChange,
  roundToThousand,
  validateFlatPriceBatch,
  validateFlatPriceForm,
  type ConfirmText,
  type FlatPriceKey,
} from '@/lib/special-zone-flat-price';
import type { SpecialZone, SpecialZoneFlatPrice, UpsertSpecialZoneFlatPriceRequest, WardOption } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Cùng quyền với backend: `@RequireFunction('master-data')` ở cấp class của SpecialZonesController. */
const REQUIRED_FUNCTION = 'master-data';

/** Giá trị ô chọn cho hàng mặc định cả tỉnh (mã phường gis là số nên không đụng). */
const DEFAULT_TARGET = '__DEFAULT__';

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function SpecialZonesManager() {
  const { can } = useAuth();
  const allowed = can(REQUIRED_FUNCTION);

  const [zones, setZones] = React.useState<SpecialZone[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  // Tăng để các thẻ vùng nạp lại hàng đồng giá khi bấm "Làm mới".
  const [refreshTick, setRefreshTick] = React.useState(0);

  const loadZones = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getSpecialZones();
      setZones(Array.isArray(list) ? list : []);
    } catch (err) {
      setLoadError(errMessage(err, 'Không thể tải danh sách điểm đặc biệt'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (allowed) void loadZones();
    else setLoading(false);
  }, [allowed, loadZones]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <PlaneTakeoff className="w-5 h-5 text-indigo-600" />
            Sân bay & đồng giá
          </h2>
          <p className="text-sm text-slate-500">
            Đặt GIÁ CỐ ĐỊNH cho chuyến ghép/bao xe đi hoặc đến một điểm đặc biệt (sân bay), theo cả tỉnh hoặc riêng
            từng phường/xã.
          </p>
        </div>
        {allowed && (
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => {
              setRefreshTick((n) => n + 1);
              void loadZones();
            }}
          >
            <RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} />
            Làm mới
          </Button>
        )}
      </div>

      <div role="note" data-testid="flat-price-semantics" className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1.5">
        <div className="font-semibold">Đồng giá hoạt động thế nào (đây là giá TIỀN THẬT)</div>
        <ul className="list-disc pl-5 space-y-0.5">
          <li data-testid="flat-price-scope">
            Phạm vi: chỉ áp cho chuyến GHÉP và BAO XE, khi ĐÚNG MỘT đầu (đón hoặc trả) nằm trong vùng — khai một chiều,
            áp cả hai chiều. Cả hai đầu cùng nằm trong vùng đặc biệt (vd T1 ↔ T2) hoặc không đầu nào nằm trong vùng:
            KHÔNG áp đồng giá, tính theo bảng km (+ luật macro). Giao hàng không dùng đồng giá (tính theo công thức giao
            hàng riêng). Chuyến ghép đặt đủ số ghế khách của xe 4/7 chỗ được tính như bao xe (dùng giá bao xe tương
            ứng).
          </li>
          <li data-testid="flat-price-lookup">
            Cách tra, theo TỪNG loại (ghép / bao xe 4 chỗ / bao xe 7 chỗ): (1) hàng RIÊNG của phường chứa đầu kia, nếu
            hàng đó CÓ giá cho loại này; (2) nếu không → hàng MẶC ĐỊNH cả tỉnh, chỉ khi đầu kia nằm trong tỉnh của vùng
            và hàng đó có giá cho loại này; (3) nếu không → bảng km + luật macro (kể cả luật{' '}
            <code>ZONE:&lt;mã&gt;</code>). Ô để trống = bỏ qua bậc đó cho đúng loại đó.
          </li>
          <li>
            Giá nhập là giá VẬN CHUYỂN: phụ phí và VAT vẫn được cộng thêm. Chuyến ghép = giá 1 ghế × số ghế, sau đó mới
            trừ giảm giá ghế. Backend làm tròn đến nghìn đồng khi báo giá nên màn này chỉ nhận bội số của 1.000 đ — số
            nhập được dùng nguyên làm giá vận chuyển.
          </li>
          <li>{FLAT_PRICE_BYPASS_WARNING}</li>
          <li>Ranh giới (polygon) sân bay chỉ nạp bằng migration — màn này không sửa được; chỉ đặt giá.</li>
        </ul>
        <div data-testid="flat-price-reference">
          {REFERENCE_PROVENANCE} — CAR_4 <b>{formatVnd(BUSINESS_REFERENCE_VND.priceCar4)}</b> / CAR_7{' '}
          <b>{formatVnd(BUSINESS_REFERENCE_VND.priceCar7)}</b>. Chỉ dùng để cảnh báo khi gõ lệch quá 2 lần (thiếu/thừa
          số 0); không tự điền vào form.
        </div>
      </div>

      {!allowed ? (
        <Card>
          <CardContent className="p-6 text-sm text-slate-600">
            Bạn không có quyền <code>{REQUIRED_FUNCTION}</code> nên không xem hoặc sửa được đồng giá sân bay.
          </CardContent>
        </Card>
      ) : loading && zones.length === 0 ? (
        <div className="flex items-center justify-center p-10 text-slate-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang tải điểm đặc biệt...
        </div>
      ) : loadError && zones.length === 0 ? (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>Không tải được điểm đặc biệt: {loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void loadZones()}>
            Thử lại
          </Button>
        </div>
      ) : zones.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-slate-500">
            Chưa có điểm đặc biệt nào (vùng được nạp bằng migration).
          </CardContent>
        </Card>
      ) : (
        // "Làm mới" KHÔNG gỡ các thẻ vùng: hộp thoại đang mở (kèm số liệu chưa lưu) nằm trong thẻ, gỡ thẻ là mất.
        <>
          {loadError && (
            <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between gap-3">
              <span>Không làm mới được danh sách điểm đặc biệt: {loadError}</span>
              <Button size="sm" variant="outline" onClick={() => void loadZones()}>
                Thử lại
              </Button>
            </div>
          )}
          {zones.map((z) => (
            <ZoneCard key={z.code} zone={z} refreshTick={refreshTick} />
          ))}
        </>
      )}
    </div>
  );
}

type FormState = {
  /** `DEFAULT_TARGET` | mã phường | '' (chưa chọn). */
  target: string;
  /** Chế độ THÊM: các nơi áp dụng (DEFAULT_TARGET hoặc mã phường) — cùng một mức giá. */
  targets: string[];
  prices: Record<FlatPriceKey, string>;
  note: string;
};

const EMPTY_FORM: FormState = {
  target: '',
  targets: [],
  prices: { pricePerSeatGhep: '', priceCar4: '', priceCar7: '' },
  note: '',
};

type PendingSave = {
  requests: UpsertSpecialZoneFlatPriceRequest[];
  before: SpecialZoneFlatPrice | null;
  text: ConfirmText;
};

function ZoneCard({ zone, refreshTick }: { zone: SpecialZone; refreshTick: number }) {
  const { toast } = useToast();

  const [rows, setRows] = React.useState<SpecialZoneFlatPrice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Dialog sửa/thêm: `editing` = hàng đang sửa, 'new' = thêm hàng mới, null = đóng.
  const [editing, setEditing] = React.useState<SpecialZoneFlatPrice | 'new' | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [showErrors, setShowErrors] = React.useState(false);
  const [wards, setWards] = React.useState<WardOption[] | null>(null);
  const [wardsError, setWardsError] = React.useState<string | null>(null);

  const [pending, setPending] = React.useState<PendingSave | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleteRow, setDeleteRow] = React.useState<SpecialZoneFlatPrice | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const loadRows = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getSpecialZoneFlatPrices(zone.code);
      setRows(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(errMessage(err, 'Không thể tải đồng giá'));
    } finally {
      setLoading(false);
    }
  }, [zone.code]);

  React.useEffect(() => {
    void loadRows();
  }, [loadRows, refreshTick]);

  const loadWards = React.useCallback(async () => {
    setWardsError(null);
    setWards(null); // "đang tải" (kể cả khi thử lại từ danh sách rỗng), không để chữ "không có phường/xã" treo
    try {
      const list = await getPricingMacroWards(zone.provinceCode);
      // Chỉ giữ phường của đúng tỉnh: backend chặn phường tỉnh khác, nên đừng cho chọn.
      setWards((Array.isArray(list) ? list : []).filter((w) => w.provinceCode === zone.provinceCode));
    } catch (err) {
      setWards(null);
      setWardsError(errMessage(err, 'Không thể tải danh sách phường/xã'));
    }
  }, [zone.provinceCode]);

  const openCreate = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
    setShowErrors(false);
    // Rỗng cũng nạp lại: backend `listWards` nuốt lỗi DB và trả [] — danh sách rỗng không được coi là "đã tải".
    if (wards === null || wards.length === 0) void loadWards();
  };

  const openEdit = (row: SpecialZoneFlatPrice) => {
    setEditing(row);
    setForm({
      target: row.wardCode === null ? DEFAULT_TARGET : row.wardCode,
      targets: [],
      prices: {
        pricePerSeatGhep: row.pricePerSeatGhep === null ? '' : String(row.pricePerSeatGhep),
        priceCar4: row.priceCar4 === null ? '' : String(row.priceCar4),
        priceCar7: row.priceCar7 === null ? '' : String(row.priceCar7),
      },
      note: row.note ?? '',
    });
    setShowErrors(false);
  };

  const editingRow = editing !== null && editing !== 'new' ? editing : null;
  const wardCodeOfForm = form.target === DEFAULT_TARGET ? null : form.target;
  // Hàng mặc định cả tỉnh hiện có: hàng của phường để trống một loại thì loại đó rơi về giá của hàng này.
  const defaultRow = React.useMemo(() => rows.find((r) => r.wardCode === null) ?? null, [rows]);

  const wardNameOf = React.useCallback(
    (code: string | null): string | null => {
      if (code === null) return null;
      return wards?.find((w) => w.code === code)?.name ?? rows.find((r) => r.wardCode === code)?.wardName ?? null;
    },
    [wards, rows],
  );

  const validation = React.useMemo(() => {
    if (editing === null) return null;
    if (editingRow) {
      // Sửa hàng có sẵn: phường cố định (không đổi được) nên không cần danh sách phường.
      const wardSet: ReadonlySet<string> = new Set(editingRow.wardCode === null ? [] : [editingRow.wardCode]);
      const v = validateFlatPriceForm(
        { wardCode: wardCodeOfForm, prices: form.prices, note: form.note },
        { mode: 'edit', provinceWardCodes: wardSet, existing: rows },
      );
      return { errors: v.errors, warnings: v.warnings, requests: v.request ? [v.request] : undefined };
    }
    return validateFlatPriceBatch(
      { targets: form.targets.map((t) => (t === DEFAULT_TARGET ? null : t)), prices: form.prices, note: form.note },
      { provinceWardCodes: wards ? new Set(wards.map((w) => w.code)) : null, existing: rows },
    );
  }, [editing, editingRow, wards, wardCodeOfForm, form, rows]);

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    const requests = validation?.requests;
    if (!requests || requests.length === 0) return;
    // "Giá cũ" lấy từ danh sách HIỆN TẠI (đã nạp lại sau lỗi / "Làm mới"), không phải ảnh chụp lúc mở hộp thoại:
    // admin khác có thể đã đổi hoặc xoá hàng này, mà PUT ghi đè cả hàng. Hàng đã bị xoá ⇒ before null ⇒ là THÊM.
    const before = editingRow ? (rows.find((r) => r.wardCode === editingRow.wardCode) ?? null) : null;
    const request = requests[0];
    const noteChanged = (before?.note ?? null) !== (request.note ?? null);
    if (before && !hasPriceChange(diffFlatPrice(before, request)) && !noteChanged) {
      toast({ title: 'Không có thay đổi để lưu' });
      return;
    }
    setPending({
      requests,
      before,
      // Một nơi (kể cả thêm mới): hộp xác nhận đầy đủ như trước; nhiều nơi: gộp một giá + danh sách.
      text: requests.length === 1
        ? describeFlatPriceSave({
            zone,
            wardCode: request.wardCode,
            wardName: wardNameOf(request.wardCode),
            before,
            after: request,
            defaultRow,
            warnings: validation?.warnings,
          })
        : describeFlatPriceBatchSave({
            zone,
            targets: requests.map((r) => ({ wardCode: r.wardCode, wardName: wardNameOf(r.wardCode) })),
            after: request,
            defaultRow,
            warnings: validation?.warnings,
          }),
    });
  };

  const handleConfirmSave = async () => {
    if (!pending) return;
    setSaving(true);
    // PUT tuần tự từng nơi (API hiện có, mỗi lần ghi đè một hàng). Dừng ở lỗi đầu tiên: nơi đã lưu giữ nguyên,
    // phần còn lại ở lại trong form để bấm lưu lại (an toàn vì mỗi PUT là upsert theo nơi).
    let done = 0;
    try {
      for (const req of pending.requests) {
        await upsertSpecialZoneFlatPrice(zone.code, req);
        done += 1;
      }
      toast({
        title: 'Đã lưu đồng giá',
        description: pending.requests.length > 1 ? `${pending.requests.length} nơi — ${zone.name}` : pending.text.title,
      });
      setPending(null);
      setEditing(null);
      await loadRows();
    } catch (err) {
      const total = pending.requests.length;
      const failedAt = pending.requests[done];
      toast({
        title: total > 1 ? `Đã lưu ${done}/${total} nơi, dừng ở lỗi` : 'Lỗi lưu đồng giá',
        description:
          total > 1
            ? `${flatPriceTargetLabel(zone, failedAt.wardCode, wardNameOf(failedAt.wardCode))}: ${errMessage(err, 'Không thể lưu đồng giá')}`
            : errMessage(err, 'Không thể lưu đồng giá'),
        variant: 'destructive',
      });
      if (total > 1 && done > 0) {
        // Giữ lại đúng các nơi CHƯA lưu (nơi lỗi + nơi sau nó).
        const left = pending.requests.slice(done).map((r) => r.wardCode ?? DEFAULT_TARGET);
        setForm((p) => ({ ...p, targets: left }));
      }
      setPending(null);
      // Lỗi có thể do hàng đã đổi/xoá bởi admin khác (404/409…): nạp lại để "giá cũ" của lần xem lại sau không cũ.
      void loadRows();
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteRow) return;
    setDeleting(true);
    try {
      await deleteSpecialZoneFlatPrice(zone.code, deleteRow.wardCode);
      toast({ title: 'Đã xoá đồng giá' });
      setDeleteRow(null);
      await loadRows();
    } catch (err) {
      toast({ title: 'Lỗi xoá đồng giá', description: errMessage(err, 'Không thể xoá đồng giá'), variant: 'destructive' });
      setDeleteRow(null);
      // 404 = hàng đã bị xoá nơi khác: nạp lại để dòng chết biến khỏi bảng thay vì nằm đó tới lần "Làm mới" sau.
      void loadRows();
    } finally {
      setDeleting(false);
    }
  };

  const deleteText = deleteRow ? describeFlatPriceDelete({ zone, row: deleteRow }) : null;
  const provinceLabel = zone.provinceName ?? `tỉnh ${zone.provinceCode}`;
  // Hàng mặc định cả tỉnh đứng đầu rồi tới phường/xã; ô tìm của Combobox khớp cả tên (không dấu cũng được) lẫn mã.
  const targetOptions = React.useMemo(
    () => [
      ...(defaultRow ? [] : [{ value: DEFAULT_TARGET, label: `Cả ${provinceLabel} (mặc định)` }]),
      ...(wards ?? [])
        .filter((w) => !rows.some((r) => r.wardCode === w.code))
        .map((w) => ({ value: w.code, label: `${w.name} (${w.code})` })),
    ],
    [wards, provinceLabel, rows, defaultRow],
  );
  const takenWardCount = (wards ?? []).filter((w) => rows.some((r) => r.wardCode === w.code)).length;
  const errs = showErrors ? validation?.errors : undefined;

  return (
    <Card data-testid={`zone-${zone.code}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
              {zone.name}
              <Badge variant="outline" className="text-[10px] font-mono">{zone.code}</Badge>
              <Badge variant="secondary" className="text-[10px]">{zone.kind === 'AIRPORT' ? 'Sân bay' : zone.kind}</Badge>
              {!zone.active && <Badge variant="destructive" className="text-[10px]">Đang tắt</Badge>}
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Thuộc {provinceLabel}. Hàng mặc định áp cho cả tỉnh này; hàng riêng của phường được ưu tiên — loại nào
              hàng riêng để trống thì lấy hàng mặc định.
            </CardDescription>
          </div>
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={openCreate}
            disabled={!zone.active}
            title={zone.active ? undefined : 'Vùng đang tắt — không đặt được đồng giá'}
          >
            <PlusCircle className="w-4 h-4 mr-1" />
            Thêm đồng giá
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!zone.active && (
          <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
            Vùng đang tắt: không thêm/sửa được đồng giá (xoá thì được). Bật vùng bằng migration.
          </div>
        )}
        {loading ? (
          <div className="flex items-center p-4 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Đang tải đồng giá...
          </div>
        ) : error ? (
          <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void loadRows()}>
              Thử lại
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div data-testid="no-flat-rows" className="text-sm text-slate-500 p-2">
            Chưa có đồng giá nào cho vùng này — chuyến ghép/bao xe đi/đến đây đang tính theo bảng km (+ luật macro).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Áp cho</TableHead>
                  {FLAT_PRICE_FIELDS.map((f) => (
                    <TableHead key={f.key} className="text-right">{f.label}</TableHead>
                  ))}
                  <TableHead>Ghi chú</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} data-testid={`flat-row-${r.wardCode ?? 'default'}`}>
                    <TableCell className="text-sm font-medium">
                      {flatPriceTargetLabel(zone, r.wardCode, r.wardName)}
                    </TableCell>
                    {FLAT_PRICE_FIELDS.map((f) => {
                      const v = r[f.key];
                      return (
                        <TableCell key={f.key} className="text-right text-sm tabular-nums">
                          {v === null || v === undefined ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <>
                              {formatVnd(v)}
                              {/* Số lẻ nghìn (ghi thẳng qua API, màn này không nhận): backend bán giá đã làm tròn. */}
                              {v % FLAT_PRICE_UNIT_VND !== 0 && (
                                <div className="text-[10px] text-amber-700" data-testid={`flat-odd-${r.wardCode ?? 'default'}-${f.key}`}>
                                  bán {formatVnd(roundToThousand(v))}
                                </div>
                              )}
                            </>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-xs text-slate-500 max-w-[16rem] truncate" title={r.note ?? undefined}>
                      {r.note ?? ''}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Sửa đồng giá ${flatPriceTargetLabel(zone, r.wardCode, r.wardName)}`}
                        disabled={!zone.active}
                        onClick={() => openEdit(r)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600"
                        aria-label={`Xoá đồng giá ${flatPriceTargetLabel(zone, r.wardCode, r.wardName)}`}
                        onClick={() => setDeleteRow(r)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* ───────── Thêm / sửa ───────── */}
      <Dialog open={editing !== null && pending === null} onOpenChange={(o) => !o && !saving && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleReview} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {editingRow ? 'Sửa đồng giá' : 'Thêm đồng giá'} — {zone.name}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Ghi đè CẢ hàng. Ô để trống = hàng này không có giá riêng cho loại đó: với hàng của phường, chuyến loại
                đó lấy giá của hàng mặc định cả tỉnh (nếu hàng đó có), nếu không thì tính theo bảng km (+ luật macro);
                với hàng mặc định, chuyến loại đó tính theo bảng km (+ luật macro). Cần ít nhất một giá; giá là bội số
                của 1.000 đ.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1">
              {editingRow ? (
                // Sửa hàng có sẵn: nơi áp là chữ thường, không có ô nào để `htmlFor` trỏ tới.
                <div className="text-xs font-semibold leading-none">Áp cho</div>
              ) : (
                <div className="text-xs font-semibold leading-none">Áp cho</div>
              )}
              {editingRow ? (
                <div className="text-sm font-medium" data-testid="flat-target-fixed">
                  {flatPriceTargetLabel(zone, editingRow.wardCode, editingRow.wardName)}
                </div>
              ) : (
                <>
                  <MultiSelectComboBox
                    options={targetOptions}
                    selectedValues={form.targets}
                    onSelectedValuesChange={(targets) => setForm((p) => ({ ...p, targets }))}
                    placeholder="— Chọn một hoặc nhiều nơi áp dụng —"
                    searchPlaceholder="Tìm phường/xã theo tên hoặc mã..."
                    noResultsText="Không tìm thấy phường/xã"
                    className="min-h-9 text-sm"
                  />
                  <div className="text-[11px] text-slate-500" data-testid="flat-target-hint">
                    Chọn nhiều nơi để áp CÙNG một mức giá (tối đa {FLAT_PRICE_BATCH_MAX} mỗi lần).
                    {takenWardCount > 0 && ` ${takenWardCount} phường/xã đã có hàng riêng nên không hiện ở đây — sửa trong bảng.`}
                  </div>
                  {wards === null && !wardsError && (
                    <div className="text-[11px] text-slate-500">Đang tải phường/xã của {provinceLabel}...</div>
                  )}
                  {wardsError && (
                    <div role="alert" className="text-[11px] text-red-700">
                      {wardsError}{' '}
                      <button type="button" className="underline" onClick={() => void loadWards()}>
                        Thử lại
                      </button>
                    </div>
                  )}
                  {wards !== null && wards.length === 0 && (
                    // Backend `listWards` nuốt lỗi DB và trả []: rỗng có thể là lỗi tải chứ không phải "tỉnh không có phường".
                    <div role="alert" data-testid="wards-empty" className="text-[11px] text-amber-700">
                      Không có phường/xã nào của {provinceLabel} (hoặc máy chủ không trả được danh sách) — hiện chỉ đặt
                      được hàng mặc định cả tỉnh.{' '}
                      <button type="button" className="underline" onClick={() => void loadWards()}>
                        Thử lại
                      </button>
                    </div>
                  )}
                </>
              )}
              {errs?.ward && <div className="text-[11px] text-red-600">{errs.ward}</div>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {FLAT_PRICE_FIELDS.map((f) => {
                const ref = f.key === 'pricePerSeatGhep' ? null : BUSINESS_REFERENCE_VND[f.key];
                return (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={`sz-${f.key}-${zone.code}`} className="text-xs font-semibold">{f.label} (đ)</Label>
                    <Input
                      id={`sz-${f.key}-${zone.code}`}
                      inputMode="numeric"
                      autoComplete="off"
                      className="h-9 text-sm tabular-nums"
                      placeholder="để trống = không áp"
                      value={form.prices[f.key]}
                      onChange={(e) => setForm((p) => ({ ...p, prices: { ...p.prices, [f.key]: e.target.value } }))}
                    />
                    <div className="text-[10px] text-slate-500">
                      {ref !== null ? `Tham chiếu (trần cũ, chưa phải giá đã chốt): ${formatVnd(ref)}` : f.hint}
                    </div>
                    {errs?.prices[f.key] && <div className="text-[11px] text-red-600">{errs.prices[f.key]}</div>}
                  </div>
                );
              })}
            </div>
            {errs?.form && <div className="text-[11px] text-red-600">{errs.form}</div>}

            <div className="space-y-1">
              <Label htmlFor={`sz-note-${zone.code}`} className="text-xs font-semibold">Ghi chú (tuỳ chọn)</Label>
              <Input
                id={`sz-note-${zone.code}`}
                className="h-9 text-sm"
                maxLength={FLAT_PRICE_NOTE_MAX}
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              />
              {errs?.note && <div className="text-[11px] text-red-600">{errs.note}</div>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Huỷ
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Xem lại & lưu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ───────── Xác nhận LƯU: nêu giá cũ → mới + điều khoản bỏ qua macro/band ───────── */}
      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && !saving && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold text-slate-900">
              {pending?.text.title ?? ''}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs text-slate-600">
                <ul className="list-disc pl-5 space-y-0.5 text-slate-800">
                  {pending?.text.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
                {pending && pending.text.fallbacks.length > 0 && (
                  <div data-testid="confirm-fallbacks" className="rounded border border-slate-200 bg-slate-50 p-2 text-slate-700 space-y-0.5">
                    <div className="font-semibold">Loại để trống sẽ tính thế nào:</div>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {pending.text.fallbacks.map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  </div>
                )}
                {pending && pending.text.warnings.length > 0 && (
                  <div role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-red-800 space-y-1">
                    {pending.text.warnings.map((w) => <div key={w}>{w}</div>)}
                  </div>
                )}
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">{pending?.text.bypass}</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs" disabled={saving}>Quay lại sửa</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmSave();
              }}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Xác nhận lưu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ───────── Xác nhận XOÁ ───────── */}
      <AlertDialog open={deleteRow !== null} onOpenChange={(o) => !o && !deleting && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold text-slate-900">{deleteText?.title ?? ''}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs text-slate-600">
                <ul className="list-disc pl-5 space-y-0.5 text-slate-800">
                  {deleteText?.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">{deleteText?.consequence}</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs" disabled={deleting}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              Xoá đồng giá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
