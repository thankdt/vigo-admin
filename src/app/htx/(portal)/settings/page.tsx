'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { htxGetMe, htxUpdateMe } from '@/lib/api';
import type { TransportCompany } from '@/lib/types';

type FormState = {
  name: string;
  taxCode: string;
  address: string;
  ownerName: string;
  htxHotline: string;
  accountingHotline: string;
};

const emptyForm: FormState = {
  name: '',
  taxCode: '',
  address: '',
  ownerName: '',
  htxHotline: '',
  accountingHotline: '',
};

function toForm(tc: TransportCompany): FormState {
  return {
    name: tc.name ?? '',
    taxCode: tc.taxCode ?? '',
    address: tc.address ?? '',
    ownerName: tc.ownerName ?? '',
    htxHotline: tc.htxHotline ?? '',
    accountingHotline: tc.accountingHotline ?? '',
  };
}

export default function HtxSettingsPage() {
  const { toast } = useToast();
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [original, setOriginal] = React.useState<FormState>(emptyForm);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const tc = await htxGetMe();
      const f = toForm(tc);
      setForm(f);
      setOriginal(f);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Không tải được thông tin HTX', description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const dirty = React.useMemo(() => {
    return (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== original[k]);
  }, [form, original]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Tên HTX là bắt buộc.' });
      return;
    }
    setIsSaving(true);
    try {
      const updated = await htxUpdateMe({
        name: form.name.trim(),
        taxCode: form.taxCode.trim(),
        address: form.address.trim(),
        ownerName: form.ownerName.trim(),
        htxHotline: form.htxHotline.trim(),
        accountingHotline: form.accountingHotline.trim(),
      });
      const f = toForm(updated);
      setForm(f);
      setOriginal(f);
      toast({ title: 'Đã lưu', description: 'Thông tin HTX đã được cập nhật.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Lưu thất bại', description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => setForm(original);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Thông tin HTX</h1>
        <p className="text-sm text-muted-foreground">
          Cập nhật thông tin pháp lý và liên hệ của hợp tác xã. Các thay đổi áp dụng ngay sau khi lưu.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Tên HTX <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              placeholder="VD: HTX Vận tải Đông Anh"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="taxCode">Mã số thuế</Label>
              <Input
                id="taxCode"
                placeholder="VD: 0101234567"
                value={form.taxCode}
                onChange={(e) => setField('taxCode', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ownerName">Người đại diện</Label>
              <Input
                id="ownerName"
                placeholder="Họ và tên"
                value={form.ownerName}
                onChange={(e) => setField('ownerName', e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="address">Địa chỉ</Label>
            <Textarea
              id="address"
              placeholder="Địa chỉ trụ sở chính"
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liên hệ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="htxHotline">Hotline HTX</Label>
              <Input
                id="htxHotline"
                placeholder="VD: 0901234567"
                value={form.htxHotline}
                onChange={(e) => setField('htxHotline', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Số tổng đài chung của HTX, hiển thị cho khách hàng.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="accountingHotline">Hotline kế toán</Label>
              <Input
                id="accountingHotline"
                placeholder="VD: 0901234568"
                value={form.accountingHotline}
                onChange={(e) => setField('accountingHotline', e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Số liên hệ bộ phận kế toán / quyết toán hoa hồng.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={handleReset} disabled={!dirty || isSaving}>
          Hoàn tác
        </Button>
        <Button onClick={handleSave} disabled={!dirty || isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Lưu thay đổi
        </Button>
      </div>
    </div>
  );
}
