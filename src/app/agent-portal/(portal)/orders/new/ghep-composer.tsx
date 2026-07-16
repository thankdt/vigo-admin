'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AddressAutocomplete } from '@/app/(app)/bookings/components/address-autocomplete';
import { useToast } from '@/hooks/use-toast';
import { createAgentGhepBookings, AgentGhepResult } from '@/lib/api';
import { Plus, Trash2, User, MapPin, Loader2, Send, CheckCircle2, AlertTriangle } from 'lucide-react';

type Addr = { address: string; lat: number; long: number };
type Px = { name: string; phone: string; pickup: Addr | null; dropoff: Addr | null };

const emptyPx = (): Px => ({ name: '', phone: '', pickup: null, dropoff: null });
const resolved = (a: Addr | null) => !!a && a.address !== '' && !(a.lat === 0 && a.long === 0);

/**
 * "Ghép tuyến" composer: the agent books ONE route-priced carpool seat per passenger (each with their
 * own pickup→dropoff), pooled with strangers by the normal engine. POST /agent/bookings/ghep.
 */
export function GhepComposer() {
  const { toast } = useToast();
  const [passengers, setPassengers] = React.useState<Px[]>([emptyPx()]);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<AgentGhepResult | null>(null);

  const setPx = (i: number, patch: Partial<Px>) =>
    setPassengers((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addPx = () => setPassengers((prev) => [...prev, emptyPx()]);
  const removePx = (i: number) =>
    setPassengers((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const validate = (): string | null => {
    for (const p of passengers) {
      if (!p.phone.trim() || p.phone.trim().length < 10) return 'Mỗi khách cần số điện thoại (≥ 10 số).';
      if (!resolved(p.pickup) || !resolved(p.dropoff)) return 'Mỗi khách phải chọn điểm đón và điểm trả từ gợi ý (để lấy toạ độ).';
    }
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) { toast({ variant: 'destructive', title: 'Chưa hợp lệ', description: err }); return; }
    setBusy(true);
    try {
      const res = await createAgentGhepBookings({
        passengers: passengers.map((p) => ({
          phone: p.phone.trim(),
          name: p.name.trim() || undefined,
          pickupAddress: p.pickup!,
          dropoffAddress: p.dropoff!,
        })),
        note: note.trim() || undefined,
      });
      setResult(res);
      if (res.count > 0) toast({ title: `Đã tạo ${res.count} chuyến ghép`, description: 'Đang tìm tài xế…' });
      if (res.failed.length > 0) toast({ variant: 'destructive', title: `${res.failed.length} khách lỗi`, description: 'Xem chi tiết bên dưới.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Không tạo được', description: e?.message });
    } finally { setBusy(false); }
  };

  const reset = () => { setResult(null); setPassengers([emptyPx()]); setNote(''); };

  // Re-seed the form with ONLY the passengers that failed (their addresses are still in local state,
  // matched by phone) so the agent retries just those without re-typing — and never duplicates a
  // passenger that already booked.
  const retryFailed = () => {
    const failedPhones = new Set((result?.failed ?? []).map((f) => f.phone));
    const remaining = passengers.filter((p) => failedPhones.has(p.phone.trim()));
    setPassengers(remaining.length ? remaining : [emptyPx()]);
    setResult(null);
  };

  // ─────────── result panel ───────────
  if (result) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" /> Đã tạo {result.count} chuyến ghép
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {result.bookings.map((b) => (
              <div key={b.id} className="flex justify-between border-b py-1 last:border-0">
                <span>{b.customerPhone ?? b.id.slice(0, 8)}</span>
                <span className="text-muted-foreground">{b.finalPrice != null ? `${b.finalPrice.toLocaleString('vi-VN')}₫` : '—'}</span>
              </div>
            ))}
            {result.bookings.length === 0 && <div className="text-muted-foreground">Không có chuyến nào được tạo.</div>}
          </CardContent>
        </Card>

        {result.failed.length > 0 && (
          <Card className="border-destructive/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> {result.failed.length} khách chưa đặt được
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {result.failed.map((f, i) => (
                <div key={i} className="flex justify-between gap-3 border-b py-1 last:border-0">
                  <span className="font-medium">{f.phone}</span>
                  <span className="text-muted-foreground text-right">{f.error}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">Bấm “Đặt lại khách lỗi” để nạp sẵn đúng các khách này và thử lại.</p>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-3">
          {result.failed.length > 0 && <Button onClick={retryFailed}>Đặt lại khách lỗi</Button>}
          <Button variant={result.failed.length > 0 ? 'outline' : 'default'} onClick={reset}>Đặt mới</Button>
          <Button variant="outline" asChild><Link href="/agent-portal/orders">Xem đơn của tôi</Link></Button>
        </div>
      </div>
    );
  }

  // ─────────── compose ───────────
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> Khách ({passengers.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={addPx}><Plus className="mr-1 h-4 w-4" /> Thêm khách</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {passengers.map((p, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Khách {i + 1}</span>
                {passengers.length > 1 && (
                  <button type="button" onClick={() => removePx(i)} className="text-destructive"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Tên khách" value={p.name} onChange={(e) => setPx(i, { name: e.target.value })} />
                <Input placeholder="SĐT" inputMode="tel" value={p.phone} onChange={(e) => setPx(i, { phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3 text-green-600" /> Điểm đón</Label>
                <AddressAutocomplete
                  value={p.pickup?.address ?? ''}
                  placeholder="Tìm điểm đón…"
                  onSelect={(d) => setPx(i, { pickup: d })}
                  onClear={() => setPx(i, { pickup: null })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3 text-red-600" /> Điểm trả</Label>
                <AddressAutocomplete
                  value={p.dropoff?.address ?? ''}
                  placeholder="Tìm điểm trả…"
                  onSelect={(d) => setPx(i, { dropoff: d })}
                  onClear={() => setPx(i, { dropoff: null })}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        <Label>Ghi chú (không bắt buộc)</Label>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: nhóm khách sạn X, gọi trước khi đón…" />
      </div>

      <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Mỗi khách là một chuyến <b>ghép theo tuyến</b> (giá tính theo tuyến đón→trả của khách, có thể ghép chung xe với khách khác). Thu tiền mặt.
      </div>

      <Button onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
        Đặt {passengers.length} chuyến ghép
      </Button>
    </div>
  );
}
