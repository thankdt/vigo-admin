'use client';

import * as React from 'react';
import { LogOut, KeyRound, Loader2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { changeOwnPassword } from '@/lib/api';

// Footer sidebar: danh tính admin đang đăng nhập (tên + SĐT động từ /admin/me) + nút
// Đăng xuất. Tách khỏi layout để test không phải render cả sidebar (matchMedia/jsdom).
// Không avatar (spec §5.4). Bấm vào tên → đổi mật khẩu của chính mình.
export function SidebarIdentity({
  fullName,
  phone,
  onLogout,
}: {
  fullName: string | null;
  phone: string | null;
  onLogout: () => void;
}) {
  const [pwOpen, setPwOpen] = React.useState(false);
  return (
    <div className="flex flex-col gap-2 duration-200 group-data-[collapsible=icon]:hidden">
      <button
        type="button"
        onClick={() => setPwOpen(true)}
        title="Đổi mật khẩu"
        className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-muted"
      >
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{fullName || 'Quản trị viên'}</span>
          <span className="truncate text-xs text-muted-foreground">{phone || ''}</span>
        </div>
        <Settings className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      <Button variant="ghost" size="sm" className="justify-start" onClick={onLogout}>
        <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
      </Button>
      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (open) { setCurrent(''); setNext(''); setConfirm(''); } }, [open]);

  const submit = async () => {
    if (next.length < 6) { toast({ variant: 'destructive', title: 'Mật khẩu mới quá ngắn', description: 'Tối thiểu 6 ký tự.' }); return; }
    if (next !== confirm) { toast({ variant: 'destructive', title: 'Xác nhận không khớp', description: 'Nhập lại mật khẩu mới cho khớp.' }); return; }
    setSaving(true);
    try {
      await changeOwnPassword(current, next);
      toast({ title: 'Đã đổi mật khẩu' });
      onClose();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không đổi được mật khẩu', description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Đổi mật khẩu</DialogTitle>
          <DialogDescription>Nhập mật khẩu hiện tại và mật khẩu mới.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label>Mật khẩu hiện tại</Label><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Mật khẩu mới</Label><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Xác nhận mật khẩu mới</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Đổi mật khẩu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
