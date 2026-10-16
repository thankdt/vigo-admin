'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { MultiSelectComboBox } from '@/components/ui/multi-select-combobox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Pencil, PlusCircle, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  createWardGroup,
  deleteWardGroup,
  getPricingMacroProvinces,
  getPricingMacroWards,
  listWardGroups,
  updateWardGroup,
} from '@/lib/api';
import { addEndpoints, endpointKey, removeEndpoint, type MacroEndpoint } from '@/lib/macro-bulk';
import { wardsToEndpoints } from '@/lib/ward-match';
import type { ProvinceOption, WardGroup, WardOption } from '@/lib/types';
import { WardSourcePanel } from './ward-source-panel';

/** Khớp trần của backend (UpsertWardGroupDto). */
const GROUP_MAX_WARDS = 200;
const NAME_MAX = 60;

export function WardGroupsManager() {
  const { toast } = useToast();
  const [groups, setGroups] = React.useState<WardGroup[]>([]);
  const [provinces, setProvinces] = React.useState<ProvinceOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WardGroup | null>(null);
  const [deleting, setDeleting] = React.useState<WardGroup | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [g, p] = await Promise.all([listWardGroups(), getPricingMacroProvinces()]);
      setGroups(g || []);
      setProvinces(p || []);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể tải nhóm xã', description: err?.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteWardGroup(deleting.id);
      toast({ title: 'Đã xoá nhóm xã' });
      setDeleting(null);
      void load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lỗi xoá nhóm xã', description: err?.message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 max-w-2xl">
          Nhóm xã là danh sách xã đặt tên sẵn (vd "Hà Nam cũ") để chọn nhanh khi thêm quy tắc giá. Nhóm chỉ là MẪU CHỌN:
          sửa hoặc xoá nhóm KHÔNG đổi các quy tắc đã tạo.
        </p>
        <Button
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <PlusCircle className="w-4 h-4 mr-1" />
          Thêm nhóm xã
        </Button>
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên nhóm</TableHead>
              <TableHead className="w-24">Số xã</TableHead>
              <TableHead>Ghi chú</TableHead>
              <TableHead className="w-24 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-16 text-center">
                  <Loader2 className="inline h-4 w-4 animate-spin" /> Đang tải...
                </TableCell>
              </TableRow>
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-16 text-center text-sm text-slate-500">
                  Chưa có nhóm xã nào. Bấm "Thêm nhóm xã" để tạo.
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">
                    {g.name}
                    {g.staleCodes.length > 0 && (
                      <Badge variant="outline" className="ml-2 text-[10px] text-amber-700">
                        {g.staleCodes.length} xã không còn
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{g.wardCount}</TableCell>
                  <TableCell className="text-xs text-slate-600">{g.note ?? ''}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Sửa nhóm ${g.name}`}
                      onClick={() => {
                        setEditing(g);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Xoá nhóm ${g.name}`}
                      onClick={() => setDeleting(g)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <WardGroupDialog
        open={open}
        onOpenChange={setOpen}
        group={editing}
        provinces={provinces}
        onSaved={() => {
          setOpen(false);
          void load();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá nhóm xã?</AlertDialogTitle>
            <AlertDialogDescription>
              Xoá nhóm "{deleting?.name}". Các quy tắc giá đã tạo từ nhóm này KHÔNG bị ảnh hưởng.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Xoá nhóm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WardGroupDialog({
  open,
  onOpenChange,
  group,
  provinces,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  group: WardGroup | null;
  provinces: ProvinceOption[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [note, setNote] = React.useState('');
  const [items, setItems] = React.useState<MacroEndpoint[]>([]);
  const [dropped, setDropped] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [loadingWards, setLoadingWards] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [provinceCode, setProvinceCode] = React.useState('');
  const [wards, setWards] = React.useState<WardOption[]>([]);
  const [wardCodes, setWardCodes] = React.useState<string[]>([]);
  const wardsSeq = React.useRef(0);

  const provinceNames = React.useMemo(() => new Map(provinces.map((p) => [p.code, p.name])), [provinces]);
  const provinceOptions = React.useMemo(
    () => [{ value: '', label: '— Chọn tỉnh —' }, ...provinces.map((p) => ({ value: p.code, label: p.name }))],
    [provinces],
  );

  // Mở hộp thoại: nạp trạng thái ban đầu. Khi sửa: đổi mã xã → điểm có nhãn, BỎ mã không còn trong dữ liệu
  // (backend trả 400 nếu PUT còn mã không tồn tại) và báo số xã đã bỏ.
  React.useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setNote(group?.note ?? '');
    setItems([]);
    setDropped(0);
    setLoadFailed(false);
    setProvinceCode('');
    setWards([]);
    setWardCodes([]);
    if (!group || group.wardCodes.length === 0) return;
    let alive = true;
    setLoadingWards(true);
    getPricingMacroWards()
      .then((all) => {
        if (!alive) return;
        const eps = wardsToEndpoints(group.wardCodes, all || [], provinceNames);
        // Danh sách rỗng/không khớp mã nào = nạp lỗi (backend nuốt lỗi trả []), KHÔNG phải "xã đã bị xoá": khoá Lưu, tránh ghi đè nhóm.
        if (eps.length === 0) {
          setLoadFailed(true);
          return;
        }
        setItems((cur) => addEndpoints(eps, cur));
        setDropped(group.wardCodes.length - eps.length);
      })
      .catch((e) => {
        setLoadFailed(true);
        toast({ variant: 'destructive', title: 'Không tải được danh sách xã', description: e?.message });
      })
      .finally(() => alive && setLoadingWards(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group]);

  const chooseProvince = async (code: string) => {
    setProvinceCode(code);
    setWardCodes([]);
    setWards([]);
    const mine = ++wardsSeq.current;
    if (!code) return;
    try {
      const list = await getPricingMacroWards(code);
      if (mine === wardsSeq.current) setWards(list || []);
    } catch {
      if (mine === wardsSeq.current) setWards([]);
    }
  };

  const addSelected = () => {
    const picked = wardCodes.length ? wards.filter((w) => wardCodes.includes(w.code)) : wards;
    setItems((cur) => addEndpoints(cur, wardsToEndpoints(picked.map((w) => w.code), picked, provinceNames)));
    setWardCodes([]);
  };

  const trimmed = name.replace(/\s+/g, ' ').trim();
  const error = loadingWards
    ? 'Đang tải danh sách xã của nhóm...'
    : loadFailed
      ? 'Không tải được xã của nhóm — đóng hộp thoại và mở lại trước khi lưu.'
      : !trimmed
    ? 'Nhập tên nhóm.'
    : trimmed.length > NAME_MAX
      ? `Tên nhóm tối đa ${NAME_MAX} ký tự.`
      : items.length === 0
        ? 'Chọn ít nhất một xã.'
        : items.length > GROUP_MAX_WARDS
          ? `Một nhóm tối đa ${GROUP_MAX_WARDS} xã (đang chọn ${items.length}).`
          : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (error || saving) return;
    const body = { name: trimmed, note: note.trim() || null, wardCodes: items.map((i) => i.wardCode!) };
    setSaving(true);
    try {
      if (group) await updateWardGroup(group.id, body);
      else await createWardGroup(body);
      toast({ title: group ? 'Đã cập nhật nhóm xã' : 'Đã tạo nhóm xã' });
      onSaved();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lỗi lưu nhóm xã', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group ? 'Sửa nhóm xã' : 'Thêm nhóm xã'}</DialogTitle>
          <DialogDescription className="text-xs">
            Đặt tên và chọn các xã/phường (mới). Tối đa {GROUP_MAX_WARDS} xã mỗi nhóm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ward-group-name" className="text-xs">
                Tên nhóm
              </Label>
              <Input id="ward-group-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ward-group-note" className="text-xs">
                Ghi chú
              </Label>
              <Input id="ward-group-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200/60 bg-slate-50 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Tỉnh / Thành phố</Label>
                <Combobox
                  ariaLabel="Nhóm xã: tỉnh/thành"
                  className="h-8 text-xs bg-white"
                  options={provinceOptions}
                  selectedValue={provinceCode}
                  onSelect={(c) => {
                    if (c !== undefined) void chooseProvince(c);
                  }}
                  placeholder="— Chọn tỉnh —"
                  searchPlaceholder="Tìm tỉnh / thành phố..."
                  noResultsText="Không tìm thấy tỉnh"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Phường / Xã (bỏ trống = cả tỉnh)</Label>
                <MultiSelectComboBox
                  options={wards.map((w) => ({ value: w.code, label: w.name }))}
                  selectedValues={wardCodes}
                  onSelectedValuesChange={setWardCodes}
                  placeholder={provinceCode ? 'Chọn phường/xã' : 'Chọn tỉnh trước'}
                  searchPlaceholder="Tìm phường/xã..."
                  noResultsText="Không tìm thấy"
                  disabled={!provinceCode}
                  className="min-h-8 text-xs"
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!provinceCode || wards.length === 0}
              onClick={addSelected}
              aria-label="Nhóm xã: thêm xã đã chọn"
            >
              {wardCodes.length ? `Thêm ${wardCodes.length} phường/xã` : `Thêm cả tỉnh (${wards.length} xã)`}
            </Button>

            <WardSourcePanel
              title="Nhóm xã"
              provinces={provinces}
              onAdd={(add) => setItems((cur) => addEndpoints(cur, add))}
            />
          </div>

          {dropped > 0 && (
            <div role="note" className="text-[11px] text-amber-800">
              {dropped} xã của nhóm không còn trong dữ liệu ranh giới đã được bỏ khỏi danh sách; lưu để cập nhật.
            </div>
          )}
          <div className="text-xs font-semibold text-slate-700">
            Đã chọn {items.length}/{GROUP_MAX_WARDS} xã
            {loadingWards && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
            {items.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-2 h-6 text-xs text-red-600"
                onClick={() => setItems([])}
                aria-label="Nhóm xã: xoá danh sách"
              >
                Xoá danh sách
              </Button>
            )}
          </div>
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto" role="group" aria-label="Nhóm xã: đã chọn">
            {items.map((e) => (
              <Badge key={endpointKey(e)} variant="secondary" className="gap-1 pr-1 text-[11px]">
                {e.label}
                <button
                  type="button"
                  aria-label={`Nhóm xã: bỏ ${e.label}`}
                  className="rounded hover:bg-slate-300/60"
                  onClick={() => setItems((cur) => removeEndpoint(cur, endpointKey(e)))}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>

          {error && (items.length > 0 || loadFailed) && (
            <div role="alert" className="text-xs text-red-600">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={!!error || saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Lưu nhóm
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
