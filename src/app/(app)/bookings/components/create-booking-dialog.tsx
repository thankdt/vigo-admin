'use client';

import * as React from 'react';
import { Loader2, Plus, Phone, User, MapPin, Car, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { createAdminBooking, getAvailableDrivers } from '@/lib/api';
import type { Driver } from '@/lib/types';
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
  const [pickup, setPickup] = React.useState<AddressData | null>(null);
  const [dropoff, setDropoff] = React.useState<AddressData | null>(null);
  const [serviceType, setServiceType] = React.useState<'RIDE' | 'DELIVERY' | 'CARPOOL'>('RIDE');
  const [note, setNote] = React.useState('');

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
    setPickup(null);
    setDropoff(null);
    setServiceType('RIDE');
    setNote('');
    setSelectedDriverId(null);
    setDriverSearch('');
  };

  const handleSubmit = async () => {
    // Validation
    if (!customerPhone || customerPhone.length < 10) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'SĐT khách phải có ít nhất 10 ký tự.' });
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
        note: note || undefined,
        driverId: selectedDriverId || undefined,
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
    driver.user?.avatarUrl || driver.user?.avatar || (driver as any).avatar || '';

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
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="cb-phone"
                    placeholder="0909123456"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cb-name">Tên khách</Label>
                <Input
                  id="cb-name"
                  placeholder="Nguyễn Văn A"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
            </div>
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
                onSelect={(data) => setPickup(data)}
                onClear={() => setPickup(null)}
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
                onSelect={(data) => setDropoff(data)}
                onClear={() => setDropoff(null)}
              />
              {dropoff && (
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  📍 {dropoff.lat.toFixed(6)}, {dropoff.long.toFixed(6)}
                </div>
              )}
            </div>
          </div>

          {/* Service & Note */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Loại dịch vụ</Label>
              <Select value={serviceType} onValueChange={(v) => setServiceType(v as any)}>
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
            <div className="space-y-1.5">
              <Label htmlFor="cb-note">Ghi chú</Label>
              <Textarea
                id="cb-note"
                placeholder="VD: Khách VIP, cần xe 7 chỗ"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={1}
                className="min-h-[36px] resize-none"
              />
            </div>
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
