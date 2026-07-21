'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { AdminAssignmentUser, AdminRole } from '@/lib/types';
import {
  adminListAssignableUsers, adminListRoles, adminSetUserRoles, adminSetUserOverrides, adminSetUserSuper,
} from '@/lib/api';
import { buildFunctionCatalog } from '@/lib/function-catalog';
import {
  computeEffectiveFunctions, overridesToMap, mapToOverrides, isSuperToggleLocked, type OverrideMap,
} from '@/lib/rbac-effective';

type OverrideState = 'default' | 'GRANT' | 'REVOKE';

// Màn 2 của /roles: gán role + override + cờ super cho từng user admin. Effective preview
// tính client-side (server là nguồn chân lý). Super bypass mọi function nên khi bật super
// phần role/override chỉ để dành lúc hạ super.
export function UserAssignment() {
  const { toast } = useToast();
  const [users, setUsers] = React.useState<AdminAssignmentUser[]>([]);
  const [roles, setRoles] = React.useState<AdminRole[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [roleIds, setRoleIds] = React.useState<Set<string>>(new Set());
  const [overrides, setOverrides] = React.useState<OverrideMap>({});
  const [saving, setSaving] = React.useState(false);
  const [superSaving, setSuperSaving] = React.useState(false);

  const catalog = React.useMemo(() => buildFunctionCatalog(), []);
  const superCount = users.filter((u) => u.isSuperAdmin).length;
  const selected = users.find((u) => u.id === selectedId) ?? null;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([adminListAssignableUsers(), adminListRoles()]);
      setUsers(u);
      setRoles(r);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể tải dữ liệu gán quyền', description: err?.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  // Chọn user -> nạp role/override hiện tại của họ vào state chỉnh sửa.
  const selectUser = (u: AdminAssignmentUser) => {
    setSelectedId(u.id);
    setRoleIds(new Set(u.roleIds));
    setOverrides(overridesToMap(u.overrides));
  };

  const toggleRole = (id: string, checked: boolean) => {
    setRoleIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const setOverride = (fn: string, state: OverrideState) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (state === 'default') delete next[fn];
      else next[fn] = state;
      return next;
    });
  };

  const effective = React.useMemo(
    () => computeEffectiveFunctions(roles, [...roleIds], overrides),
    [roles, roleIds, overrides],
  );

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await adminSetUserRoles(selected.id, [...roleIds]);
      await adminSetUserOverrides(selected.id, mapToOverrides(overrides));
      toast({ title: 'Đã lưu', description: `Đã cập nhật quyền cho ${selected.fullName ?? selected.phone}.` });
      await load();
      setSelectedId(selected.id);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể lưu', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSuperToggle = async (value: boolean) => {
    if (!selected) return;
    setSuperSaving(true);
    try {
      await adminSetUserSuper(selected.id, value);
      toast({ title: value ? 'Đã cấp super admin' : 'Đã gỡ super admin' });
      await load();
      setSelectedId(selected.id);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể đổi cờ super', description: err?.message });
    } finally {
      setSuperSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const superLocked = selected ? isSuperToggleLocked(selected, superCount) : false;

  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      {/* Danh sách user admin */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tài khoản admin</CardTitle>
          <CardDescription>Chọn tài khoản để gán quyền.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {users.length === 0 && <p className="text-sm text-muted-foreground">Không có tài khoản admin.</p>}
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => selectUser(u)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${
                selectedId === u.id ? 'bg-muted font-medium' : ''
              }`}
            >
              <span className="flex flex-col">
                <span>{u.fullName ?? u.phone}</span>
                <span className="text-xs text-muted-foreground">{u.phone}</span>
              </span>
              {u.isSuperAdmin && <ShieldCheck className="h-4 w-4 text-primary" aria-label="Super admin" />}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Trình chỉnh quyền cho user đã chọn */}
      {!selected ? (
        <Card className="flex items-center justify-center">
          <p className="p-8 text-sm text-muted-foreground">Chọn một tài khoản admin ở bên trái.</p>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selected.fullName ?? selected.phone}</CardTitle>
            <CardDescription>{selected.phone}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Super toggle */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Super admin</Label>
                <p className="text-sm text-muted-foreground">
                  Bỏ qua mọi kiểm tra quyền + quản lý phân quyền.
                  {superLocked && ' (Không thể thay đổi: tài khoản seed hoặc super cuối cùng.)'}
                </p>
              </div>
              <Switch
                checked={selected.isSuperAdmin}
                disabled={superLocked || superSaving}
                onCheckedChange={handleSuperToggle}
                aria-label="Super admin"
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label>Vai trò</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {roles.map((r) => (
                  <div key={r.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`role-${r.id}`}
                      checked={roleIds.has(r.id)}
                      onCheckedChange={(c) => toggleRole(r.id, !!c)}
                    />
                    <label htmlFor={`role-${r.id}`} className="text-sm font-normal">{r.name}</label>
                  </div>
                ))}
                {roles.length === 0 && <p className="text-sm text-muted-foreground">Chưa có vai trò nào.</p>}
              </div>
            </div>

            {/* Override tri-state */}
            <div className="space-y-2">
              <Label>Ngoại lệ theo function (ghi đè vai trò)</Label>
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-4">
                  {catalog.map((grp) => (
                    <div key={grp.group}>
                      <h4 className="mb-2 text-sm font-medium">{grp.group}</h4>
                      <div className="space-y-1.5">
                        {grp.items.map((item) => {
                          const state: OverrideState = overrides[item.key] ?? 'default';
                          return (
                            <div key={item.key} className="flex items-center justify-between gap-2">
                              <span className="text-sm">{item.label}</span>
                              <div className="flex gap-1" role="group" aria-label={`Ngoại lệ ${item.label}`}>
                                {(['default', 'GRANT', 'REVOKE'] as OverrideState[]).map((s) => (
                                  <Button
                                    key={s}
                                    type="button"
                                    size="sm"
                                    variant={state === s ? 'default' : 'outline'}
                                    className="h-7 px-2 text-xs"
                                    aria-pressed={state === s}
                                    aria-label={`${item.label}: ${s === 'default' ? 'Mặc định' : s === 'GRANT' ? 'Cấp' : 'Thu'}`}
                                    onClick={() => setOverride(item.key, s)}
                                  >
                                    {s === 'default' ? 'Mặc định' : s === 'GRANT' ? '+Cấp' : '−Thu'}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Effective preview */}
            <div className="space-y-2">
              <Label>Quyền hiệu lực ({effective.length}){selected.isSuperAdmin && ' — super: thấy tất cả'}</Label>
              <div className="flex flex-wrap gap-1.5" data-testid="effective-preview">
                {effective.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Không có quyền nào.</span>
                ) : (
                  effective.map((fn) => <Badge key={fn} variant="secondary">{fn}</Badge>)
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} aria-busy={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lưu vai trò & ngoại lệ
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
