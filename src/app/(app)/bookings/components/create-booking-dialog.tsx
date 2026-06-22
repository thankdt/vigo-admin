'use client';

import * as React from 'react';
import { Loader2, Plus, Phone, User, Users, MapPin, Car, FileText, Clock, Calculator, CheckCircle2, UserPlus, Search, X } from 'lucide-react';
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
import { createAdminBooking, getAvailableDrivers, lookupCustomerByPhone, estimateTripPrice } from '@/lib/api';
import type { Driver } from '@/lib/types';
import { getImageUrl } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AddressAutocomplete } from './address-autocomplete';

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
  const [serviceType, setServiceType] = React.useState<'RIDE' | 'DELIVERY' | 'CARPOOL'>('RIDE');
  const [vehicleType, setVehicleType] = React.useState<'CAR_4' | 'CAR_7'>('CAR_4');
  const [note, setNote] = React.useState('');
  // Passenger info (RIDE/CARPOOL only). requestedSeats default 1; for CARPOOL it
  // scales the price on the backend. passengerNames = co-passenger names, optional.
  const [requestedSeats, setRequestedSeats] = React.useState(1);
  const [passengerNames, setPassengerNames] = React.useState<string[]>([]);

  // Passenger fields don't apply to DELIVERY. Seat cap is a soft guard rail:
  // RIDE → vehicle capacity; CARPOOL → reasonable upper bound.
  const showPassengerFields = serviceType === 'RIDE' || serviceType === 'CARPOOL';
  const maxSeats = serviceType === 'RIDE' ? (vehicleType === 'CAR_7' ? 7 : 4) : serviceType === 'CARPOOL' ? 7 : 1;

  // Keep the seat count within the current cap (e.g. switching CAR_7 → CAR_4).
  React.useEffect(() => {
    setRequestedSeats((s) => Math.min(Math.max(1, s), maxSeats));
  }, [maxSeats]);

  const addPassenger = () => setPassengerNames((p) => [...p, '']);
  const updatePassenger = (i: number, v: string) =>
    setPassengerNames((p) => p.map((n, idx) => (idx === i ? v : n)));
  const removePassenger = (i: number) =>
    setPassengerNames((p) => p.filter((_, idx) => idx !== i));

  // Price estimate (manual — "Tính giá" button, to avoid spamming BE).
  const [priceEstimate, setPriceEstimate] = React.useState<number | null>(null);
  const [estimating, setEstimating] = React.useState(false);

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
        requestedSeats: showPassengerFields ? requestedSeats : undefined,
      });
      setPriceEstimate(res.finalPrice ?? res.price);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Tính giá thất bại', description: err.message });
    } finally {
      setEstimating(false);
    }
  };

  // Scheduled-trip state. `scheduledAt` is the raw <input type="datetime-local">
  // value (no timezone suffix). We convert to ISO at submit time. Default to
  // 30 min from now so the picker isn't empty when the operator toggles on.
  const [isScheduled, setIsScheduled] = React.useState(false);
  const [scheduledAt, setScheduledAt] = React.useState('');

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

  const resetForm = () => {
    setCustomerPhone('');
    setCustomerName('');
    setCustomerStatus('idle');
    setPickup(null);
    setDropoff(null);
    setServiceType('RIDE');
    setVehicleType('CAR_4');
    setRequestedSeats(1);
    setPassengerNames([]);
    setPriceEstimate(null);
    setNote('');
    setSelectedDriverId(null);
    setDriverSearch('');
    setIsScheduled(false);
    setScheduledAt('');
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

  // Min-attr for the datetime input — block "in the past" choices at the
  // browser level so the user gets immediate feedback instead of a backend
  // error toast.
  const minScheduledAt = React.useMemo(() => formatLocal(new Date()), [open, isScheduled]);

  // Default the picker to +30 minutes when the operator first toggles
  // scheduling on, so they only have to bump it forward.
  React.useEffect(() => {
    if (isScheduled && !scheduledAt) {
      const d = new Date();
      d.setMinutes(d.getMinutes() + 30);
      setScheduledAt(formatLocal(d));
    }
  }, [isScheduled, scheduledAt]);

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
    let scheduledIso: string | undefined;
    if (isScheduled) {
      if (!scheduledAt) {
        toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng chọn thời gian hẹn.' });
        return;
      }
      const parsed = new Date(scheduledAt);
      if (Number.isNaN(parsed.getTime())) {
        toast({ variant: 'destructive', title: 'Lỗi', description: 'Thời gian hẹn không hợp lệ.' });
        return;
      }
      if (parsed.getTime() < Date.now() - 60_000) {
        toast({ variant: 'destructive', title: 'Lỗi', description: 'Thời gian hẹn phải ở tương lai.' });
        return;
      }
      scheduledIso = parsed.toISOString();
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
        requestedSeats: showPassengerFields ? requestedSeats : undefined,
        passengerNames: showPassengerFields
          ? (() => {
              const names = passengerNames.map((n) => n.trim()).filter(Boolean);
              return names.length > 0 ? names : undefined;
            })()
          : undefined,
        note: note || undefined,
        driverId: selectedDriverId || undefined,
        scheduledTime: scheduledIso,
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
                onSelect={(data) => { setPickup(data); setPriceEstimate(null); }}
                onClear={() => { setPickup(null); setPriceEstimate(null); }}
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
                onSelect={(data) => { setDropoff(data); setPriceEstimate(null); }}
                onClear={() => { setDropoff(null); setPriceEstimate(null); }}
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
              <Select value={serviceType} onValueChange={(v) => { setServiceType(v as any); setPriceEstimate(null); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RIDE">🚗 Chở khách</SelectItem>
                  <SelectItem value="DELIVERY">📦 Giao hàng</SelectItem>
                  <SelectItem value="CARPOOL">🚌 Đi chung</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {serviceType === 'RIDE' ? (
              <div className="space-y-1.5">
                <Label>Loại xe <span className="text-destructive">*</span></Label>
                <Select value={vehicleType} onValueChange={(v) => { setVehicleType(v as any); setPriceEstimate(null); }}>
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

          {/* Passenger info — RIDE/CARPOOL only */}
          {showPassengerFields && (
            <div className="space-y-3 rounded-lg border p-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                Hành khách
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cb-seats">Số lượng hành khách</Label>
                  <Input
                    id="cb-seats"
                    type="number"
                    min={1}
                    max={maxSeats}
                    value={requestedSeats}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setRequestedSeats(Number.isNaN(n) ? 1 : Math.min(Math.max(1, n), maxSeats));
                      setPriceEstimate(null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tối đa {maxSeats} khách{serviceType === 'CARPOOL' ? ' • đi chung tính giá theo số ghế' : ''}.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Tên hành khách <span className="font-normal text-muted-foreground">(nếu có thêm)</span></Label>
                {passengerNames.length === 0 && (
                  <p className="text-xs text-muted-foreground">Không bắt buộc. Thêm tên nếu cần in lên hợp đồng/hoá đơn.</p>
                )}
                {passengerNames.map((name, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      placeholder={`Hành khách ${i + 1}`}
                      value={name}
                      onChange={(e) => updatePassenger(i, e.target.value)}
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removePassenger(i)} aria-label="Xoá hành khách">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addPassenger}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Thêm hành khách
                </Button>
              </div>
            </div>
          )}

          {/* Price estimate */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Giá dự kiến
              </div>
              {priceEstimate != null ? (
                <div className="text-lg font-bold text-primary">{new Intl.NumberFormat('vi-VN').format(priceEstimate)} đ</div>
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
                  Bật để tạo chuyến hẹn giờ. Tài xế sẽ nhận thông báo trước 10 phút.
                </p>
              </div>
              <Switch
                id="cb-scheduled-toggle"
                checked={isScheduled}
                onCheckedChange={setIsScheduled}
              />
            </div>
            {isScheduled && (
              <div className="space-y-1.5">
                <Label htmlFor="cb-scheduled-at">Thời gian khách muốn đi <span className="text-destructive">*</span></Label>
                <Input
                  id="cb-scheduled-at"
                  type="datetime-local"
                  value={scheduledAt}
                  min={minScheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
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
