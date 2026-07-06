'use client';

import * as React from 'react';
import { Loader2, Plus, Phone, User, Users, MapPin, Car, FileText, Clock, Calculator, CheckCircle2, UserPlus, Search, X, Ticket } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { createAdminBooking, getAvailableDrivers, lookupCustomerByPhone, estimateTripPrice, getVouchers } from '@/lib/api';
import type { Driver, Promotion } from '@/lib/types';
import { getImageUrl } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AddressAutocomplete } from './address-autocomplete';
import { fmtVnd, isVoucherSelectable, voucherLabel } from './voucher-utils';
import { validateWindow, toIso } from './schedule-utils';

interface CreateBookingDialogProps {
  onSuccess: () => void;
}

interface AddressData {
  address: string;
  lat: number;
  long: number;
}

export function CreateBookingDialog({ onSuccess }: CreateBookingDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { toast } = useToast();

  // Form state
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  // Phone-first flow: name stays locked until the phone is checked.
  //   idle → chưa kiểm tra | checking | existing (khách cũ, khoá tên) | new (khách mới, bắt nhập tên)
  const [customerStatus, setCustomerStatus] = React.useState<'idle' | 'checking' | 'existing' | 'new'>('idle');
  const [pickup, setPickup] = React.useState<AddressData | null>(null);
  const [dropoff, setDropoff] = React.useState<AddressData | null>(null);
  const [serviceType, setServiceType] = React.useState<'RIDE' | 'DELIVERY' | 'CARPOOL'>('CARPOOL');
  const [vehicleType, setVehicleType] = React.useState<'CAR_4' | 'CAR_7'>('CAR_4');
  const [note, setNote] = React.useState('');
  // Co-passengers (khách đi cùng) — passenger #2 onward. Passenger #1 is the
  // booking customer captured above from the phone lookup (customerName), so we
  // do NOT repeat them here. The seat count is DERIVED (1 + co-passengers), no
  // manual number box — mirrors the customer app. On submit we send
  // passengerNames = [customerName, ...coPassengers] (index 0 = primary, the
  // convention the customer app + contract/booking-detail screens rely on).
  const [coPassengers, setCoPassengers] = React.useState<string[]>([]);

  // Passenger fields don't apply to DELIVERY. Total-seat cap matches the
  // customer app: CAR_4 → 4, CAR_7 → 6, CARPOOL → 6. maxExtras excludes the
  // primary customer.
  const showPassengerFields = serviceType === 'RIDE' || serviceType === 'CARPOOL';
  const maxTotal = serviceType === 'RIDE' ? (vehicleType === 'CAR_7' ? 6 : 4) : 6;
  const maxExtras = maxTotal - 1;
  const totalPassengers = 1 + coPassengers.length;

  // Trim extra rows if the cap shrinks (e.g. switching CAR_7 → CAR_4).
  React.useEffect(() => {
    setCoPassengers((p) => (p.length > maxExtras ? p.slice(0, maxExtras) : p));
  }, [maxExtras]);

  const addPassenger = () => setCoPassengers((p) => [...p, '']);
  const updatePassenger = (i: number, v: string) =>
    setCoPassengers((p) => p.map((n, idx) => (idx === i ? v : n)));
  const removePassenger = (i: number) =>
    setCoPassengers((p) => p.filter((_, idx) => idx !== i));

  // Price estimate (manual — "Tính giá" button, to avoid spamming BE).
  // `priceEstimate` is the VAT-inclusive price actually charged; `estimateOriginal`
  // is the VAT-inclusive price before any discount (for the strikethrough).
  const [priceEstimate, setPriceEstimate] = React.useState<number | null>(null);
  const [estimateOriginal, setEstimateOriginal] = React.useState<number | null>(null);
  const [estimating, setEstimating] = React.useState(false);
  const estimateSavings = priceEstimate != null && estimateOriginal != null
    ? Math.max(0, estimateOriginal - priceEstimate)
    : 0;

  // Promotion (voucher) — optional. Applied to both the estimate and the
  // created booking. Changing it invalidates a stale estimate.
  const [vouchers, setVouchers] = React.useState<Promotion[]>([]);
  const [selectedPromotionId, setSelectedPromotionId] = React.useState<number | null>(null);
  // Wrap the predicate — passing it straight to filter would feed the array
  // index in as the `now` argument and break the date-window check.
  const selectableVouchers = React.useMemo(() => vouchers.filter((v) => isVoucherSelectable(v)), [vouchers]);
  const clearEstimate = () => { setPriceEstimate(null); setEstimateOriginal(null); };

  const checkCustomer = async () => {
    if (!customerPhone || customerPhone.length < 10) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Nhập SĐT hợp lệ (≥10 số) trước khi kiểm tra.' });
      return;
    }
    setCustomerStatus('checking');
    try {
      const res = await lookupCustomerByPhone(customerPhone);
      if (res.exists) {
        setCustomerName(res.fullName ?? '');
        setCustomerStatus('existing');
      } else {
        setCustomerName('');
        setCustomerStatus('new');
      }
    } catch (err: any) {
      setCustomerStatus('idle');
      toast({ variant: 'destructive', title: 'Không kiểm tra được SĐT', description: err.message });
    }
  };

  const handleEstimate = async () => {
    if (!pickup || !dropoff) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Chọn điểm đón và điểm trả trước khi tính giá.' });
      return;
    }
    setEstimating(true);
    try {
      const res = await estimateTripPrice({
        pickup: { address: pickup.address, lat: pickup.lat, long: pickup.long },
        dropoff: { address: dropoff.address, lat: dropoff.lat, long: dropoff.long },
        serviceType,
        requestedVehicleType: serviceType === 'RIDE' ? vehicleType : undefined,
        requestedSeats: showPassengerFields ? totalPassengers : undefined,
        promotionId: selectedPromotionId ?? undefined,
        // Chuyến đặt lịch → tính phụ phí theo NGÀY ĐI (đầu khung giờ), không phải
        // ngày đặt. Đi ngay → bỏ trống, backend dùng hiện tại.
        departureTime: isScheduled && scheduledFrom ? toIso(scheduledFrom) : undefined,
      });
      const final = res.finalPrice ?? res.price;
      setPriceEstimate(final);
      setEstimateOriginal(res.priceBeforeDiscount ?? final);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Tính giá thất bại', description: err.message });
    } finally {
      setEstimating(false);
    }
  };

  // Scheduled-trip state. Pickup WINDOW [from, to] — raw <input
  // type="datetime-local"> values (no timezone suffix). Converted to ISO at
  // submit. Default to from=+30m / to=+60m when the operator toggles on.
  const [isScheduled, setIsScheduled] = React.useState(false);
  const [scheduledFrom, setScheduledFrom] = React.useState('');
  const [scheduledTo, setScheduledTo] = React.useState('');

  // Driver selection
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = React.useState(false);
  const [selectedDriverId, setSelectedDriverId] = React.useState<string | null>(null);
  const [driverSearch, setDriverSearch] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    const fetchDrivers = async () => {
      setIsLoadingDrivers(true);
      try {
        const data = await getAvailableDrivers();
        setDrivers(data);
      } catch {
        // Ignore — driver list is optional
      } finally {
        setIsLoadingDrivers(false);
      }
    };
    fetchDrivers();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    getVouchers().then(setVouchers).catch(() => {
      // Ignore — voucher list is optional; promo selector just stays empty.
    });
  }, [open]);

  const resetForm = () => {
    setCustomerPhone('');
    setCustomerName('');
    setCustomerStatus('idle');
    setPickup(null);
    setDropoff(null);
    setServiceType('CARPOOL');
    setVehicleType('CAR_4');
    setCoPassengers([]);
    clearEstimate();
    setSelectedPromotionId(null);
    setNote('');
    setSelectedDriverId(null);
    setDriverSearch('');
    setIsScheduled(false);
    setScheduledFrom('');
    setScheduledTo('');
  };

  // Editing the phone after a check invalidates the customer lookup → re-check.
  const onPhoneChange = (v: string) => {
    setCustomerPhone(v);
    if (customerStatus !== 'idle') {
      setCustomerStatus('idle');
      setCustomerName('');
    }
  };

  // Build a `YYYY-MM-DDTHH:mm` string in *local* time. The native
  // <input type="datetime-local"> rejects ISO strings with timezone suffixes,
  // and toISOString().slice(0,16) would drift by the UTC offset (so VN ops
  // would see -7h at minimum).
  const formatLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Min-attr for the "from" datetime input — block "in the past" choices at the
  // browser level so the user gets immediate feedback. "to" uses `from` as its
  // min (see UI) so the window can't end before it starts.
  const minScheduledAt = React.useMemo(() => formatLocal(new Date()), [open, isScheduled]);

  // Default the window to from=+30m / to=+60m when the operator first toggles
  // scheduling on, so they only have to bump it forward.
  React.useEffect(() => {
    if (isScheduled && !scheduledFrom) {
      const from = new Date();
      from.setMinutes(from.getMinutes() + 30);
      const to = new Date();
      to.setMinutes(to.getMinutes() + 60);
      setScheduledFrom(formatLocal(from));
      setScheduledTo(formatLocal(to));
    }
  }, [isScheduled, scheduledFrom]);

  const handleSubmit = async () => {
    // Validation
    if (!customerPhone || customerPhone.length < 10) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'SĐT khách phải có ít nhất 10 ký tự.' });
      return;
    }
    if (customerStatus === 'idle' || customerStatus === 'checking') {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Bấm "Kiểm tra" SĐT trước khi tạo chuyến.' });
      return;
    }
    if (customerStatus === 'new' && !customerName.trim()) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Khách mới — vui lòng nhập tên khách.' });
      return;
    }
    if (!pickup) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng chọn địa chỉ đón.' });
      return;
    }
    if (!dropoff) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng chọn địa chỉ trả.' });
      return;
    }
    // Pickup window [from, to] — undefined for an immediate trip.
    let scheduledFromIso: string | undefined, scheduledToIso: string | undefined;
    if (isScheduled) {
      const v = validateWindow(scheduledFrom, scheduledTo);
      if (!v.ok) {
        toast({ variant: 'destructive', title: 'Lỗi', description: v.error });
        return;
      }
      scheduledFromIso = toIso(scheduledFrom);
      scheduledToIso = toIso(scheduledTo);
    }

    setIsSubmitting(true);
    try {
      await createAdminBooking({
        customerPhone,
        customerName: customerName || undefined,
        pickupAddress: {
          address: pickup.address,
          lat: pickup.lat,
          long: pickup.long,
        },
        dropoffAddress: {
          address: dropoff.address,
          lat: dropoff.lat,
          long: dropoff.long,
        },
        serviceType,
        requestedVehicleType: serviceType === 'RIDE' ? vehicleType : undefined,
        requestedSeats: showPassengerFields ? totalPassengers : undefined,
        // [primary, ...co-passengers] — primary is the booking customer. Only
        // sent when there's at least one co-passenger; a solo ride needs no list.
        passengerNames: (() => {
          if (!showPassengerFields) return undefined;
          const extras = coPassengers.map((n) => n.trim()).filter(Boolean);
          return extras.length > 0 ? [customerName.trim(), ...extras] : undefined;
        })(),
        note: note || undefined,
        driverId: selectedDriverId || undefined,
        // Pickup window. Send scheduledTime = from too: a backend without window
        // support (whitelist:true strips the unknown from/to fields) then still
        // schedules at the window start instead of silently falling back to
        // "now". All three are undefined for an immediate trip.
        scheduledTime: scheduledFromIso,
        scheduledFromTime: scheduledFromIso,
        scheduledToTime: scheduledToIso,
        promotionId: selectedPromotionId ?? undefined,
      });
      toast({ title: 'Thành công', description: 'Đã tạo chuyến mới.' });
      resetForm();
      setOpen(false);
      onSuccess();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Tạo chuyến thất bại', description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredDrivers = React.useMemo(() => {
    if (!driverSearch) return drivers;
    const q = driverSearch.toLowerCase();
    return drivers.filter(d => {
      const name = (d as any).fullName || d.name || d.user?.fullName || '';
      const phone = d.phone || d.user?.phone || '';
      return name.toLowerCase().includes(q) || phone.includes(q);
    });
  }, [drivers, driverSearch]);

  const getDriverName = (driver: Driver) =>
    (driver as any).fullName || driver.name || driver.user?.fullName || 'N/A';

  const getDriverId = (driver: Driver) =>
    (driver as any).driverId || driver.user?.id || driver.id;

  const getDriverAvatar = (driver: Driver) =>
    getImageUrl(driver.user?.avatarUrl || driver.user?.avatar || (driver as any).avatar);

  const selectedDriver = React.useMemo(() => {
    if (!selectedDriverId) return null;
    return drivers.find(d => getDriverId(d) === selectedDriverId) || null;
  }, [selectedDriverId, drivers]);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Tạo chuyến
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
        <DialogHeader>
          <DialogTitle>Tạo chuyến mới</DialogTitle>
          <DialogDescription>
            Nhập thông tin khách hàng và chuyến đi. Nếu khách chưa có tài khoản, hệ thống sẽ tự tạo mới.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Customer Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              Thông tin khách hàng
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cb-phone">SĐT khách <span className="text-destructive">*</span></Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="cb-phone"
                      placeholder="0909123456"
                      value={customerPhone}
                      onChange={(e) => onPhoneChange(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); checkCustomer(); } }}
                      className="pl-8"
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={checkCustomer} disabled={customerStatus === 'checking' || customerPhone.length < 10}>
                    {customerStatus === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span className="ml-1.5">Kiểm tra</span>
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cb-name">
                  Tên khách {customerStatus === 'new' && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="cb-name"
                  placeholder={customerStatus === 'new' ? 'Nhập tên khách mới' : 'Kiểm tra SĐT trước'}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  disabled={customerStatus !== 'new'}
                />
              </div>
            </div>
            {customerStatus === 'existing' && (
              <p className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Khách đã có tài khoản — dùng thông tin cũ ({customerName || 'không tên'}).
              </p>
            )}
            {customerStatus === 'new' && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600">
                <UserPlus className="h-3.5 w-3.5" /> Khách mới — nhập tên để tạo tài khoản + lưu lại.
              </p>
            )}
            {customerStatus === 'idle' && (
              <p className="text-xs text-muted-foreground">Nhập SĐT rồi bấm "Kiểm tra" để xác định khách cũ / mới.</p>
            )}
          </div>

          {/* Address Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              Địa chỉ
            </h4>
            {/* Pickup */}
            <div className="space-y-2 p-3 rounded-lg border bg-green-50/50 dark:bg-green-950/20">
              <Label className="text-green-700 dark:text-green-400 font-medium">Điểm đón <span className="text-destructive">*</span></Label>
              <AddressAutocomplete
                value={pickup?.address ?? ''}
                placeholder="Tìm kiếm điểm đón..."
                onSelect={(data) => { setPickup(data); clearEstimate(); }}
                onClear={() => { setPickup(null); clearEstimate(); }}
              />
              {pickup && (
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  📍 {pickup.lat.toFixed(6)}, {pickup.long.toFixed(6)}
                </div>
              )}
            </div>
            {/* Dropoff */}
            <div className="space-y-2 p-3 rounded-lg border bg-red-50/50 dark:bg-red-950/20">
              <Label className="text-red-700 dark:text-red-400 font-medium">Điểm trả <span className="text-destructive">*</span></Label>
              <AddressAutocomplete
                value={dropoff?.address ?? ''}
                placeholder="Tìm kiếm điểm trả..."
                onSelect={(data) => { setDropoff(data); clearEstimate(); }}
                onClear={() => { setDropoff(null); clearEstimate(); }}
              />
              {dropoff && (
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  📍 {dropoff.lat.toFixed(6)}, {dropoff.long.toFixed(6)}
                </div>
              )}
            </div>
          </div>

          {/* Service & Vehicle */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Loại dịch vụ</Label>
              <Select value={serviceType} onValueChange={(v) => { setServiceType(v as any); clearEstimate(); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RIDE">🚗 Bao xe</SelectItem>
                  <SelectItem value="DELIVERY">📦 Giao hàng</SelectItem>
                  <SelectItem value="CARPOOL">🚌 Đi chung</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {serviceType === 'RIDE' ? (
              <div className="space-y-1.5">
                <Label>Loại xe <span className="text-destructive">*</span></Label>
                <Select value={vehicleType} onValueChange={(v) => { setVehicleType(v as any); clearEstimate(); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAR_4">🚗 5 chỗ</SelectItem>
                    <SelectItem value="CAR_7">🚙 7 chỗ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="cb-note">Ghi chú</Label>
                <Textarea id="cb-note" placeholder="Ghi chú..." value={note} onChange={(e) => setNote(e.target.value)} rows={1} className="min-h-[36px] resize-none" />
              </div>
            )}
          </div>

          {serviceType === 'RIDE' && (
            <div className="space-y-1.5">
              <Label htmlFor="cb-note">Ghi chú</Label>
              <Textarea id="cb-note" placeholder="VD: Khách VIP, hành lý cồng kềnh..." value={note} onChange={(e) => setNote(e.target.value)} rows={1} className="min-h-[36px] resize-none" />
            </div>
          )}

          {/* Passenger info — RIDE/CARPOOL only. Seat count is derived from the
              passenger list (customer #1 + co-passengers), no manual box. */}
          {showPassengerFields && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Hành khách
                </h4>
                <Badge variant="secondary">{totalPassengers} người</Badge>
              </div>

              {/* Passenger #1 — the booking customer (from the phone lookup above). */}
              <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                <Badge variant="outline" className="shrink-0 text-xs">Khách 1</Badge>
                <span className={cn('text-sm', !customerName && 'text-muted-foreground italic')}>
                  {customerName || 'Nhập & kiểm tra SĐT ở trên'}
                </span>
              </div>

              {/* Co-passengers (khách đi cùng) — passenger #2 onward. */}
              {coPassengers.map((name, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder={`Tên khách ${i + 2} (đi cùng)`}
                    value={name}
                    onChange={(e) => { updatePassenger(i, e.target.value); clearEstimate(); }}
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => { removePassenger(i); clearEstimate(); }} aria-label="Xoá khách">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { addPassenger(); clearEstimate(); }}
                  disabled={coPassengers.length >= maxExtras}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Thêm khách đi cùng
                </Button>
                <span className="text-xs text-muted-foreground">
                  {coPassengers.length >= maxExtras
                    ? `Tối đa ${maxTotal} khách cho loại xe này`
                    : serviceType === 'CARPOOL'
                      ? 'Đi chung tính giá theo số khách'
                      : `Tối đa ${maxTotal} khách`}
                </span>
              </div>
            </div>
          )}

          {/* Promotion (voucher) */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Ticket className="h-4 w-4" /> Khuyến mãi
            </Label>
            <Select
              value={selectedPromotionId != null ? String(selectedPromotionId) : 'none'}
              onValueChange={(v) => { setSelectedPromotionId(v === 'none' ? null : Number(v)); clearEstimate(); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Không dùng khuyến mãi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Không dùng khuyến mãi</SelectItem>
                {selectableVouchers.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>{voucherLabel(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPromotionId != null ? (
              <p className="text-xs text-muted-foreground">Bấm "Tính giá" để xem giá sau khi áp khuyến mãi.</p>
            ) : selectableVouchers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {vouchers.length === 0
                  ? 'Chưa tải được danh sách khuyến mãi.'
                  : 'Không có khuyến mãi khả dụng (cần đang bật, còn hạn, còn lượt, loại công khai).'}
              </p>
            ) : null}
          </div>

          {/* Price estimate */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Giá dự kiến
              </div>
              {priceEstimate != null ? (
                <div>
                  {estimateSavings > 0 && (
                    <div className="text-xs text-muted-foreground line-through">{fmtVnd(estimateOriginal!)} đ</div>
                  )}
                  <div className="text-lg font-bold text-primary">{fmtVnd(priceEstimate)} đ</div>
                  {estimateSavings > 0 ? (
                    <div className="text-xs font-medium text-green-600 dark:text-green-400">Đã giảm {fmtVnd(estimateSavings)} đ</div>
                  ) : selectedPromotionId != null ? (
                    <div className="text-xs text-amber-600">Khuyến mãi chưa áp dụng (chưa đạt đơn tối thiểu hoặc không hợp lệ).</div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Chọn điểm đón/trả{serviceType === 'RIDE' ? ' + loại xe' : ''} rồi bấm Tính giá.</p>
              )}
            </div>
            <Button type="button" variant="outline" onClick={handleEstimate} disabled={estimating || !pickup || !dropoff}>
              {estimating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Calculator className="mr-1.5 h-4 w-4" />}
              Tính giá
            </Button>
          </div>

          {/* Scheduled Trip */}
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="cb-scheduled-toggle" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground cursor-pointer">
                  <Clock className="h-4 w-4" />
                  Hẹn giờ
                </Label>
                <p className="text-xs text-muted-foreground">
                  Bật để đặt khoảng giờ đón [từ → đến]. Tài xế nhận thông báo trước 10 phút.
                </p>
              </div>
              <Switch
                id="cb-scheduled-toggle"
                checked={isScheduled}
                // Đổi đi-ngay ↔ đặt-lịch làm đổi ngày cơ sở tính phụ phí → xoá giá cũ.
                onCheckedChange={(v) => { setIsScheduled(v); clearEstimate(); }}
              />
            </div>
            {isScheduled && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cb-scheduled-from">Đón từ <span className="text-destructive">*</span></Label>
                  <Input
                    id="cb-scheduled-from"
                    type="datetime-local"
                    value={scheduledFrom}
                    min={minScheduledAt}
                    // Đổi giờ đón (đầu khung) = đổi ngày tính phụ phí → xoá giá cũ, buộc tính lại.
                    onChange={(e) => { setScheduledFrom(e.target.value); clearEstimate(); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cb-scheduled-to">Đến <span className="text-destructive">*</span></Label>
                  <Input
                    id="cb-scheduled-to"
                    type="datetime-local"
                    value={scheduledTo}
                    min={scheduledFrom || minScheduledAt}
                    onChange={(e) => setScheduledTo(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Driver Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Car className="h-4 w-4" />
                Gán tài xế
                <span className="text-xs font-normal">(bỏ trống → dispatch tự động)</span>
              </h4>
              {selectedDriverId && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedDriverId(null)}>
                  Bỏ chọn
                </Button>
              )}
            </div>

            {selectedDriver ? (
              <Card className="p-3 flex items-center gap-3 ring-2 ring-primary">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={getDriverAvatar(selectedDriver)} alt={getDriverName(selectedDriver)} />
                  <AvatarFallback>{getDriverName(selectedDriver).charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-sm">
                  <div className="font-semibold">{getDriverName(selectedDriver)}</div>
                  <div className="text-muted-foreground">
                    {selectedDriver.phone}
                    {selectedDriver.fixedRoute?.name ? ` • ${selectedDriver.fixedRoute.name}` : ''}
                    {(selectedDriver as any).availableSeats != null ? ` • ${(selectedDriver as any).availableSeats} ghế trống` : ''}
                  </div>
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Tìm tài xế theo tên, SĐT..."
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                  className="h-8"
                />
                <div className="max-h-[160px] overflow-y-auto space-y-1.5 rounded-md border p-1.5">
                  {isLoadingDrivers ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredDrivers.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-4">Không tìm thấy tài xế.</p>
                  ) : (
                    filteredDrivers.map(driver => {
                      const name = getDriverName(driver);
                      const id = getDriverId(driver);
                      const avatar = getDriverAvatar(driver);
                      return (
                        <Card
                          key={driver.id || id}
                          className={cn(
                            'p-2.5 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors',
                            selectedDriverId === id && 'ring-2 ring-primary bg-primary/5'
                          )}
                          onClick={() => setSelectedDriverId(id)}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={avatar} alt={name} />
                            <AvatarFallback className="text-xs">{name.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 text-sm">
                            <span className="font-medium">{name}</span>
                            <span className="text-muted-foreground ml-2">{driver.phone}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {(driver as any).availableSeats != null && (
                              <Badge variant="outline" className="text-xs">
                                {(driver as any).availableSeats} ghế
                              </Badge>
                            )}
                            {driver.fixedRoute?.name && (
                              <span className="text-xs text-muted-foreground">{driver.fixedRoute.name}</span>
                            )}
                          </div>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Tạo chuyến
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
