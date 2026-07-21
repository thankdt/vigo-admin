'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Edit, Loader2, Lock, Plus, PlusCircle, Trash2 } from 'lucide-react';
import type { AdminRole } from '@/lib/types';
import { adminListRoles, adminDeleteRole } from '@/lib/api';
import { allFunctionKeys } from '@/lib/function-catalog';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RoleEditor } from './role-editor';

const TOTAL_FUNCTIONS = allFunctionKeys().length;

export function RolesList() {
  const { toast } = useToast();
  const [roles, setRoles] = React.useState<AdminRole[]>([]);
  const [loading, setLoading] = React.useState(true);
  // undefined = dialog đóng · null = tạo mới · AdminRole = sửa.
  const [editing, setEditing] = React.useState<AdminRole | null | undefined>(undefined);
  const [deleting, setDeleting] = React.useState<AdminRole | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setRoles(await adminListRoles());
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể tải danh sách vai trò', description: err?.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    if (!deleting || deleting.isSystem) return;
    try {
      await adminDeleteRole(deleting.id);
      toast({ title: 'Đã xoá', description: `Vai trò "${deleting.name}" đã được xoá.` });
      setDeleting(null);
      load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không thể xoá vai trò', description: err?.message });
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setEditing(null)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Thêm vai trò
        </Button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : roles.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Chưa có vai trò nào.</div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    {role.name}
                    {role.isSystem && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Vai trò hệ thống" />}
                  </CardTitle>
                  <div className="flex items-center">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(role)} aria-label="Sửa">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(role)}
                      disabled={role.isSystem}
                      aria-label="Xoá"
                      title={role.isSystem ? 'Vai trò hệ thống — không thể xoá' : 'Xoá'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription>{role.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium">Quyền ({role.functions.length}/{TOTAL_FUNCTIONS})</div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {role.functions.slice(0, 5).map((fn) => (
                    <li key={fn} className="flex items-center gap-2">
                      <Check className="h-3 w-3 text-green-500" /> <span>{fn}</span>
                    </li>
                  ))}
                  {role.functions.length > 5 && (
                    <li className="flex items-center gap-2">
                      <Plus className="h-3 w-3" /> <span>và {role.functions.length - 5} quyền khác…</span>
                    </li>
                  )}
                </ul>
              </CardContent>
              <CardFooter className="text-xs text-muted-foreground">
                {role.isSystem ? 'Vai trò hệ thống' : 'Vai trò tuỳ chỉnh'}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== undefined} onOpenChange={(o) => { if (!o) setEditing(undefined); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Sửa vai trò' : 'Tạo vai trò'}</DialogTitle>
            <DialogDescription>Định nghĩa vai trò và các function được phép truy cập.</DialogDescription>
          </DialogHeader>
          {editing !== undefined && (
            <RoleEditor
              role={editing}
              onCancel={() => setEditing(undefined)}
              onSaved={() => { setEditing(undefined); load(); }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá vai trò “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Người dùng đang gán vai trò này sẽ mất các quyền tương ứng. Hành động không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Xoá</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
