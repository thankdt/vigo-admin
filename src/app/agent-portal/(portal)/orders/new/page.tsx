'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddressAutocomplete } from '@/app/(app)/bookings/components/address-autocomplete';
import { useToast } from '@/hooks/use-toast';
import {
  createAgentOrder, quoteAgentOrder, submitAgentOrder, cancelAgentOrder, AgentOrder,
} from '@/lib/api';
import { Plus, Trash2, MapPin, User, Loader2, ArrowLeft, Send, Car, Users } from 'lucide-react';
import { GhepComposer } from './ghep-composer';

type Mode = 'rieng' | 'ghep';

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const opt = (m: Mode, title: string, sub: string, Icon: any) => (
    <button
      type="button" onClick={() => onChange(m)}
      className={`flex-1 rounded-lg border p-3 text-left text-sm transition ${
        mode === m ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent'
      }`}
    >
      <div className="font-semibold flex items-center gap-1.5"><Icon className="h-4 w-4" /> {title}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </button>
  );
  return (
    <div className="flex gap-3">
      {opt('rieng', 'Xe riêng', 'Bao trọn 1 xe, nhiều điểm, không ghép khách lạ', Car)}
      {opt('ghep', 'Ghép tuyến', 'Ghép chung xe, giá theo tuyến từng khách', Users)}
    </div>
  );
}

type WP = { label: string; address: string; lat: number; lng: number };
type PX = { name: string; phone: string; pickupIdx: number; dropoffIdx: number; note: string };

const fmtVnd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`);
const emptyWp = (): WP => ({ label: '', address: '', lat: 0, lng: 0 });
const emptyPx = (): PX => ({ name: '', phone: '', pickupIdx: 0, dropoffIdx: 1, note: '' });

export default function NewAgentOrderPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [mode, setMode] = React.useState<Mode>('rieng');
  const [billingMode, setBillingMode] = React.useState<'BAO' | 'GHEP'>('BAO');
  const [waypoints, setWaypoints] = React.useState<WP[]>([emptyWp(), emptyWp()]);
  const [passengers, setPassengers] = React.useState<PX[]>([emptyPx()]);

  // review phase state
  const [quoted, setQuoted] = React.useState<AgentOrder | null>(null);
  // The server DRAFT currently backing `quoted` (or a leftover to discard). There is no update
  // endpoint, so every re-quote must create a *fresh* draft — we cancel the prior one to avoid
  // both quoting stale data and leaking orphaned DRAFT rows. `draftIdRef` mirrors it imperatively
  // so the unmount cleanup below sees the exact current value (never a stale closure), and so a
  // submit — which nulls it synchronously — can never be cancelled by the cleanup.
  const [draftId, _setDraftId] = React.useState<string | null>(null);
  const draftIdRef = React.useRef<string | null>(null);
  const setDraftId = (id: string | null) => { draftIdRef.current = id; _setDraftId(id); };
  const [busy, setBusy] = React.useState(false);

  // Abandon a quoted-but-unsubmitted draft when the user leaves the page (sidebar nav, close).
  React.useEffect(() => () => {
    const id = draftIdRef.current;
    if (id) cancelAgentOrder(id).catch(() => {});
  }, []);

  // Switching AWAY from "xe riêng" while a bao-xe draft is pending → discard it (the ghép flow
  // renders a separate component, so the unmount cleanup won't fire; without this the draft orphans).
  const changeMode = (m: Mode) => {
    if (m !== 'rieng') {
      const id = draftIdRef.current;
      if (id) cancelAgentOrder(id).catch(() => {});
      setDraftId(null);
      setQuoted(null);
    }
    setMode(m);
  };

  const wpLabel = (i: number) => waypoints[i]?.label?.trim() || waypoints[i]?.address || `Điểm ${i + 1}`;

  const setWp = (i: number, patch: Partial<WP>) =>
    setWaypoints((prev) => prev.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  const addWp = () => setWaypoints((prev) => [...prev, emptyWp()]);
  const removeWp = (i: number) => {
    if (waypoints.length <= 2) return;
    setWaypoints((prev) => prev.filter((_, idx) => idx !== i));
    // Re-clamp passenger indices that referenced removed/shifted waypoints. If the removal
    // collapses a passenger's pickup and dropoff onto the same stop, nudge dropoff to a distinct
    // one (>=2 waypoints always remain here, so index 0/1 are both valid).
    setPassengers((prev) =>
      prev.map((p) => {
        const clamp = (v: number) => (v === i ? 0 : v > i ? v - 1 : v);
        const pickupIdx = clamp(p.pickupIdx);
        let dropoffIdx = clamp(p.dropoffIdx);
        if (dropoffIdx === pickupIdx) dropoffIdx = pickupIdx === 0 ? 1 : 0;
        return { ...p, pickupIdx, dropoffIdx };
      }),
    );
  };

  const setPx = (i: number, patch: Partial<PX>) =>
    setPassengers((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addPx = () => setPassengers((prev) => [...prev, emptyPx()]);
  const removePx = (i: number) =>
    setPassengers((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const validate = (): string | null => {
    const badWp = waypoints.find((w) => !w.address || (w.lat === 0 && w.lng === 0));
    if (badWp) return 'Mỗi điểm phải chọn địa chỉ từ gợi ý (để lấy toạ độ).';
    if (passengers.length === 0) return 'Cần ít nhất 1 khách.';
    for (const p of passengers) {
      if (!p.name.trim() || !p.phone.trim()) return 'Mỗi khách cần tên và số điện thoại.';
      if (p.pickupIdx === p.dropoffIdx) return 'Điểm đón và điểm trả của khách phải khác nhau.';
    }
    return null;
  };

  const doQuote = async () => {
    const err = validate();
    if (err) { toast({ variant: 'destructive', title: 'Chưa hợp lệ', description: err }); return; }
    setBusy(true);
    // Discard any prior draft (from a previous quote or a failed attempt) — it holds stale
    // composition and would otherwise leak as an orphaned DRAFT row.
    if (draftId) { cancelAgentOrder(draftId).catch(() => {}); setDraftId(null); }
    let createdId: string | null = null;
    try {
      const draft = await createAgentOrder({
        billingMode,
        waypoints: waypoints.map((w) => ({ label: w.label.trim() || null, address: w.address, lat: w.lat, lng: w.lng })),
        passengers: passengers.map((p) => ({
          name: p.name.trim(), phone: p.phone.trim(),
          pickupIdx: p.pickupIdx, dropoffIdx: p.dropoffIdx, note: p.note.trim() || null,
        })),
        paymentMethod: 'CASH',
      });
      createdId = draft.id;
      const q = await quoteAgentOrder(draft.id);
      setDraftId(draft.id);
      setQuoted(q);
    } catch (e: any) {
      // A create-then-quote that failed mid-way must not leave a DRAFT behind.
      if (createdId) cancelAgentOrder(createdId).catch(() => {});
      setDraftId(null);
      toast({ variant: 'destructive', title: 'Lỗi tính giá', description: e?.message });
    } finally { setBusy(false); }
  };

  const doEditAgain = async () => {
    const id = draftId;
    setQuoted(null);
    setDraftId(null);
    // Best-effort discard the draft so it doesn't linger.
    if (id) cancelAgentOrder(id).catch(() => {});
  };

  const doSubmit = async () => {
    if (!quoted) return;
    setBusy(true);
    try {
      await submitAgentOrder(quoted.id);
      setDraftId(null); // now a live SEARCHING order, no longer a discardable draft
      toast({ title: 'Đã gửi chuyến', description: 'Đang tìm tài xế…' });
      router.replace('/agent-portal/orders');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Không gửi được', description: e?.message });
    } finally { setBusy(false); }
  };

  // ─────────────────────── ghép-tuyến mode (fully separate flow) ───────────────────────
  if (mode === 'ghep') {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-2xl font-bold">Đặt hộ mới</h1>
        <ModeToggle mode={mode} onChange={changeMode} />
        <GhepComposer />
      </div>
    );
  }

  // ─────────────────────── review phase (xe riêng) ───────────────────────
  if (quoted) {
    return (
      <div className="space-y-5 max-w-2xl">
        <h1 className="text-2xl font-bold">Xác nhận chuyến</h1>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Giá cước</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-lg">
              <span>Tổng cước</span><span className="font-bold">{fmtVnd(quoted.totalFare)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{quoted.billingMode === 'BAO' ? 'Bao xe (1 người trả)' : 'Đi ghép (chia đều)'}</Badge>
              <span>· cần {quoted.capacityRequired} chỗ</span>
              {quoted.commissionAmount != null && (
                <span className="text-green-600">· Hoa hồng bạn nhận: {fmtVnd(quoted.commissionAmount)}</span>
              )}
            </div>
            {quoted.billingMode === 'GHEP' && quoted.perPassengerFare && (
              <div className="pt-2 space-y-1 border-t">
                <div className="text-sm font-medium">Mỗi khách trả:</div>
                {quoted.perPassengerFare.map((pf) => (
                  <div key={pf.passengerIdx} className="flex justify-between text-sm">
                    <span>{quoted.passengers[pf.passengerIdx]?.name || `Khách ${pf.passengerIdx + 1}`}</span>
                    <span>{fmtVnd(pf.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button onClick={doSubmit} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Gửi chuyến — tìm tài xế
          </Button>
          <Button variant="outline" onClick={doEditAgain} disabled={busy}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Sửa lại
          </Button>
        </div>
      </div>
    );
  }

  // ─────────────────────── compose phase ───────────────────────
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Đặt hộ mới</h1>
      <ModeToggle mode={mode} onChange={changeMode} />

      {/* Billing mode */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Hình thức thanh toán</CardTitle></CardHeader>
        <CardContent className="flex gap-3">
          {(['BAO', 'GHEP'] as const).map((m) => (
            <button
              key={m} type="button" onClick={() => setBillingMode(m)}
              className={`flex-1 rounded-lg border p-3 text-left text-sm transition ${
                billingMode === m ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent'
              }`}
            >
              <div className="font-semibold">{m === 'BAO' ? 'Bao xe' : 'Đi ghép'}</div>
              <div className="text-xs text-muted-foreground">
                {m === 'BAO' ? '1 người trả toàn bộ' : 'Chia đều theo đầu người'}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Waypoints */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> Các điểm ({waypoints.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={addWp}><Plus className="mr-1 h-4 w-4" /> Thêm điểm</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {waypoints.map((w, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Điểm {i + 1}</span>
                {waypoints.length > 2 && (
                  <button type="button" onClick={() => removeWp(i)} className="text-destructive"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              <Input
                placeholder="Nhãn (vd: Sảnh đến sân bay) — không bắt buộc"
                value={w.label} onChange={(e) => setWp(i, { label: e.target.value })}
              />
              <AddressAutocomplete
                value={w.address}
                placeholder="Tìm địa chỉ…"
                onSelect={({ address, lat, long }) => setWp(i, { address, lat, lng: long })}
                onClear={() => setWp(i, { address: '', lat: 0, lng: 0 })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Passengers */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> Khách ({passengers.length})</CardTitle>
          <Button variant="outline" size="sm" onClick={addPx}><Plus className="mr-1 h-4 w-4" /> Thêm khách</Button>
        </CardHeader>
        <CardContent className="space-y-3">
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
                <Input placeholder="SĐT" value={p.phone} onChange={(e) => setPx(i, { phone: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Đón tại</Label>
                  <Select value={String(p.pickupIdx)} onValueChange={(v) => setPx(i, { pickupIdx: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {waypoints.map((_, wi) => <SelectItem key={wi} value={String(wi)}>{wpLabel(wi)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Trả tại</Label>
                  <Select value={String(p.dropoffIdx)} onValueChange={(v) => setPx(i, { dropoffIdx: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {waypoints.map((_, wi) => <SelectItem key={wi} value={String(wi)}>{wpLabel(wi)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Textarea
                placeholder="Ghi chú (không bắt buộc)" rows={1}
                value={p.note} onChange={(e) => setPx(i, { note: e.target.value })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={doQuote} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Tính giá
        </Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={busy}>Huỷ</Button>
      </div>
    </div>
  );
}
