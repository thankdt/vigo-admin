'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { AdminRole } from '@/lib/types';
import { adminCreateRole, adminUpdateRole } from '@/lib/api';
import { buildFunctionCatalog, slugifyRoleKey } from '@/lib/function-catalog';

// Form tạo/sửa role: tên, mô tả, tick function theo nhóm (menu + settings). Không bọc
// Dialog để test được độc lập; parent (roles-list) đặt trong DialogContent. Lưu ->
// adminCreateRole (key = slug(tên)) hoặc adminUpdateRole. isSystem: sửa được function,
// chỉ chặn XOÁ (ở roles-list).
export function RoleEditor({
  role,
  onCancel,
  onSaved,
}: {
  role?: AdminRole | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState(role?.name ?? '');
  const [description, setDescription] = React.useState(role?.description ?? '');
  const [selected, setSelected] = React.useState<Set<string>>(new Set(role?.functions ?? []));
  const [saving, setSaving] = React.useState(false);

  const catalog = React.useMemo(() => buildFunctionCatalog(), []);

  const toggle = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const functions = [...selected];
      if (role) {
        await adminUpdateRole(role.id, { name: trimmed, description, functions });
      } else {
        await adminCreateRole({ key: slugifyRoleKey(trimmed), name: trimmed, description, functions });
      }
      toast({ title: 'Đã lưu', description: `Vai trò "${trimmed}" đã được lưu.` });
      onSaved();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể lưu vai trò', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="role-name">Tên vai trò</Label>
        <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="vd: Vận hành, Tài chính" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role-description">Mô tả</Label>
        <Input id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Quyền (function) — đã chọn {selected.size}</Label>
        <ScrollArea className="h-72 rounded-md border p-4">
          <div className="space-y-4">
            {catalog.map((grp) => (
              <div key={grp.group}>
                <h4 className="mb-2 text-sm font-medium tracking-tight">{grp.group}</h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {grp.items.map((item) => (
                    <div key={item.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`fn-${item.key}`}
                        checked={selected.has(item.key)}
                        onCheckedChange={(checked) => toggle(item.key, !!checked)}
                      />
                      <label htmlFor={`fn-${item.key}`} className="text-sm font-normal">
                        {item.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Hủy</Button>
        <Button onClick={handleSubmit} disabled={!name.trim() || saving} aria-busy={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Lưu vai trò
        </Button>
      </div>
    </div>
  );
}
