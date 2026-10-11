'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  createDriverNotePreset,
  deleteDriverNotePreset,
  renameDriverNotePreset,
  type DriverNotePreset,
} from '@/lib/api';
import { loadDriverNotePresets } from './driver-note-presets-cache';

/**
 * Quản lý danh mục ghi chú tài xế (đổi tên / xoá / thêm). Chỉ mở cho người có quyền
 * `driver-note-presets`; backend vẫn chặn lại nên đây chỉ là lớp UI.
 */
export function DriverNoteManageDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = React.useState<DriverNotePreset[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [newLabel, setNewLabel] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    loadDriverNotePresets(true)
      .then((list) => {
        if (!alive) return;
        setItems(list);
        setDrafts({});
      })
      .catch((err: any) =>
        toast({ variant: 'destructive', title: 'Không tải được danh sách ghi chú', description: err.message }),
      );
    return () => {
      alive = false;
    };
  }, [open, toast]);

  const run = async (title: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onChanged?.();
    } catch (err: any) {
      toast({ variant: 'destructive', title, description: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quản lý ghi chú tài xế</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {items.map((p) => {
            const draft = drafts[p.id] ?? p.label;
            const changed = draft.trim() !== '' && draft.trim() !== p.label;
            return (
              <div key={p.id} className="flex items-center gap-2">
                <Input
                  value={draft}
                  maxLength={100}
                  disabled={busy}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  disabled={busy || !changed}
                  onClick={() =>
                    run('Không đổi tên được', async () => {
                      const updated = await renameDriverNotePreset(p.id, draft.trim());
                      setItems((list) => list.map((x) => (x.id === p.id ? { ...x, ...updated } : x)));
                      setDrafts((d) => {
                        const { [p.id]: _drop, ...rest } = d;
                        return rest;
                      });
                    })
                  }
                >
                  Lưu
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    run('Không xoá được', async () => {
                      await deleteDriverNotePreset(p.id);
                      setItems((list) => list.filter((x) => x.id !== p.id));
                    })
                  }
                >
                  Xoá
                </Button>
              </div>
            );
          })}
          <div className="flex items-center gap-2 border-t pt-3">
            <Input
              value={newLabel}
              maxLength={100}
              disabled={busy}
              placeholder="Ghi chú mới…"
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <Button
              size="sm"
              disabled={busy || !newLabel.trim()}
              onClick={() =>
                run('Không thêm được ghi chú', async () => {
                  const created = await createDriverNotePreset(newLabel.trim());
                  setItems((list) => [...list, created]);
                  setNewLabel('');
                })
              }
            >
              Thêm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
