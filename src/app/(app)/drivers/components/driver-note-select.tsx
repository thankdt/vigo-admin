'use client';

import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { createDriverNotePreset, type DriverNotePreset } from '@/lib/api';
import { DriverNoteManageDialog } from './driver-note-manage-dialog';
import {
  buildNoteOptions,
  loadDriverNotePresets,
  refreshDriverNotePresets,
  subscribeDriverNotePresets,
} from './driver-note-presets-cache';

export { buildNoteOptions, loadDriverNotePresets };

const NONE = '__none__';
const ADD = '__add__';
const MANAGE = '__manage__';

/**
 * Ô chọn ghi chú tài xế (1 ghi chú / tài xế). Ai có quyền `drivers` chỉ chọn mục có sẵn;
 * người có `driver-note-presets` còn thấy "+ Thêm ghi chú mới…" và "Quản lý danh sách…".
 */
export function DriverNoteSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string | null;
  onChange: (note: string | null) => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}) {
  const { can } = useAuth();
  const canManage = can('driver-note-presets');
  const { toast } = useToast();
  const [presets, setPresets] = React.useState<DriverNotePreset[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState('');

  const reload = React.useCallback(
    async (force = false) => {
      try {
        setPresets(await loadDriverNotePresets(force));
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Không tải được danh sách ghi chú', description: err.message });
      }
    },
    [toast],
  );

  React.useEffect(() => {
    void reload();
    // Dòng khác đổi danh mục → đọc lại từ cache đã làm mới (không thêm request).
    return subscribeDriverNotePresets(() => void reload());
  }, [reload]);

  const commit = async (note: string | null) => {
    setBusy(true);
    try {
      await onChange(note);
    } finally {
      setBusy(false);
    }
  };

  const options = buildNoteOptions(presets, value);
  const current = (value ?? '').trim() || NONE;

  return (
    <>
      <Select
        value={current}
        disabled={disabled || busy}
        onValueChange={(v) => {
          if (v === ADD) {
            setNewLabel('');
            setAddOpen(true);
            return;
          }
          if (v === MANAGE) {
            setManageOpen(true);
            return;
          }
          void commit(v === NONE ? null : v);
        }}
      >
        <SelectTrigger className={className ?? 'h-8 w-full min-w-[200px] text-sm'}>
          <SelectValue placeholder="Chọn ghi chú…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Không có ghi chú</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
          {canManage && <SelectItem value={ADD}>+ Thêm ghi chú mới…</SelectItem>}
          {canManage && <SelectItem value={MANAGE}>Quản lý danh sách…</SelectItem>}
        </SelectContent>
      </Select>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm ghi chú mới</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newLabel}
            maxLength={100}
            placeholder="Ví dụ: Chuyên chạy ghép"
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={!newLabel.trim() || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const created = await createDriverNotePreset(newLabel.trim());
                  await refreshDriverNotePresets();
                  setAddOpen(false);
                  await onChange(created.label);
                } catch (err: any) {
                  toast({ variant: 'destructive', title: 'Không thêm được ghi chú', description: err.message });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Thêm và chọn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManage && (
        <DriverNoteManageDialog open={manageOpen} onOpenChange={setManageOpen} onChanged={() => void reload()} />
      )}
    </>
  );
}
