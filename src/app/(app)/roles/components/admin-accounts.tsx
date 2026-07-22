'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, ShieldCheck, Plus, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { AdminAssignmentUser } from '@/lib/types';
import { adminListAssignableUsers, createAdminUser, updateAdminUser, deleteAdminUser } from '@/lib/api';

// Tab "Tài khoản admin" của /roles (super-only, vì cả trang /roles chỉ super vào được).
// Tạo / sửa (tên + reset mật khẩu) / xoá admin. Gán role & cờ super ở tab "Gán người dùng".
export function AdminAccounts() {
  const { toast } = useToast();
  const [users, setUsers] = React.useState<AdminAssignmentUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editUser, setEditUser] = React.useState<AdminAssignmentUser | null>(null);
  const [delUser, setDelUser] = React.useState<AdminAssignmentUser | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await adminListAssignableUsers());
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được danh sách admin', description: err?.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);
  React.useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Tài khoản admin</CardTitle>
          <CardDescription>Tạo, sửa (tên/mật khẩu), xoá tài khoản quản trị. Đăng nhập bằng số điện thoại.</CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" /> Thêm admin</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Số điện thoại</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.fullName || '—'}</TableCell>
                  <TableCell className="tabular-nums">{u.phone}</TableCell>
                  <TableCell>
                    {u.isSuperAdmin
                      ? <Badge><ShieldCheck className="mr-1 h-3 w-3" />Super</Badge>
                      : <Badge variant="secondary">Admin</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditUser(u)}><Pencil className="h-4 w-4" /></Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={u.isSuperAdmin}
                      title={u.isSuperAdmin ? 'Không thể xoá super admin' : 'Xoá'}
                      onClick={() => setDelUser(u)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Chưa có tài khoản admin.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onDone={load} />
      <EditDialog user={editUser} onClose={() => setEditUser(null)} onDone={load} />
      <DeleteDialog user={delUser} onClose={() => setDelUser(null)} onDone={load} />
    </Card>
  );
}

function CreateDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (open) { setFullName(''); setPhone(''); setPassword(''); } }, [open]);

  const submit = async () => {
    if (phone.trim().length < 10) { toast({ variant: 'destructive', title: 'SĐT không hợp lệ', description: 'Số điện thoại tối thiểu 10 số.' }); return; }
    if (password.length < 6) { toast({ variant: 'destructive', title: 'Mật khẩu quá ngắn', description: 'Tối thiểu 6 ký tự.' }); return; }
    setSaving(true);
    try {
      await createAdminUser({ phone: phone.trim(), password, fullName: fullName.trim() || undefined });
      toast({ title: 'Đã tạo tài khoản admin', description: fullName.trim() || phone.trim() });
      onDone(); onClose();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tạo được tài khoản', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Tạo tài khoản admin</DialogTitle>
          <DialogDescription>Tài khoản đăng nhập bằng số điện thoại + mật khẩu.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label>Tên</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" /></div>
          <div className="space-y-1.5"><Label>Số điện thoại</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxx" /></div>
          <div className="space-y-1.5"><Label>Mật khẩu</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tạo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ user, onClose, onDone }: { user: AdminAssignmentUser | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [fullName, setFullName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (user) { setFullName(user.fullName || ''); setPassword(''); } }, [user]);
  if (!user) return null;

  const submit = async () => {
    if (password && password.length < 6) { toast({ variant: 'destructive', title: 'Mật khẩu quá ngắn', description: 'Tối thiểu 6 ký tự.' }); return; }
    const body: { fullName?: string; password?: string } = {};
    if (fullName.trim() !== (user.fullName || '')) body.fullName = fullName.trim();
    if (password) body.password = password;
    if (!('fullName' in body) && !body.password) { onClose(); return; }
    setSaving(true);
    try {
      await updateAdminUser(user.id, body);
      toast({ title: 'Đã cập nhật admin', description: user.phone });
      onDone(); onClose();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không cập nhật được', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Sửa admin</DialogTitle>
          <DialogDescription>Số điện thoại ({user.phone}) không đổi được. Để trống mật khẩu nếu giữ nguyên.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label>Tên</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Mật khẩu mới (tuỳ chọn)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Để trống nếu không đổi" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ user, onClose, onDone }: { user: AdminAssignmentUser | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  if (!user) return null;

  const submit = async () => {
    setSaving(true);
    try {
      await deleteAdminUser(user.id);
      toast({ title: 'Đã xoá tài khoản admin', description: user.phone });
      onDone(); onClose();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không xoá được', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Xoá tài khoản admin?</DialogTitle>
          <DialogDescription>Xoá <b>{user.fullName || user.phone}</b> ({user.phone}). Tài khoản sẽ bị vô hiệu (soft-delete).</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Xoá</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
