'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AddressAutocomplete } from '@/app/(app)/bookings/components/address-autocomplete';
import { useToast } from '@/hooks/use-toast';
import {
  createDriverReturnTrip,
  estimateTripPrice,
  getAgentMe,
  type AgentMe,
  type DriverReturnTripResult,
} from '@/lib/api';
import {
  Car,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MapPin,
  Phone,
  User,
  DollarSign,
  Receipt,
  RotateCcw,
  Navigation,
  Share2,
} from 'lucide-react';

interface AddressPoint {
  address: string;
  lat: number;
  long: number;
}

const emptyPoint = (): AddressPoint => ({ address: '', lat: 0, long: 0 });
const fmtVnd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`);

export default function ReturnTripPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [me, setMe] = React.useState<AgentMe | null>(null);
  const [driverPhone, setDriverPhone] = React.useState('');
  const [isEditingDriverPhone, setIsEditingDriverPhone] = React.useState(false);

  // Customer info
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  const [note, setNote] = React.useState('');

  // Route points
  const [pickup, setPickup] = React.useState<AddressPoint>(emptyPoint());
  const [dropoff, setDropoff] = React.useState<AddressPoint>(emptyPoint());

  // Pricing
  const [isEstimating, setIsEstimating] = React.useState(false);
  const [minPrice, setMinPrice] = React.useState<number | null>(null);
  const [distanceKm, setDistanceKm] = React.useState<number | null>(null);
  const [customPriceStr, setCustomPriceStr] = React.useState('');

  // VAT Invoice
  const [needVat, setNeedVat] = React.useState(false);
  const [companyName, setCompanyName] = React.useState('');
  const [taxCode, setTaxCode] = React.useState('');
  const [companyAddress, setCompanyAddress] = React.useState('');
  const [invoiceEmail, setInvoiceEmail] = React.useState('');

  // Submission state
  const [submitting, setSubmitting] = React.useState(false);
  const [createdBooking, setCreatedBooking] = React.useState<DriverReturnTripResult | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Load current agent/driver
  React.useEffect(() => {
    getAgentMe()
      .then((m) => {
        setMe(m);
        if (m?.phone) {
          setDriverPhone(m.phone);
        }
      })
      .catch((err) => {
        console.error('Failed to load agent info:', err);
      });
  }, []);

  // Recalculate floor price when pickup & dropoff coordinates are valid
  React.useEffect(() => {
    if (!pickup.lat || !pickup.long || !dropoff.lat || !dropoff.long) {
      setMinPrice(null);
      setDistanceKm(null);
      return;
    }

    let active = true;
    setIsEstimating(true);
    setErrorMessage(null);

    estimateTripPrice({
      pickup: { address: pickup.address, lat: pickup.lat, long: pickup.long },
      dropoff: { address: dropoff.address, lat: dropoff.lat, long: dropoff.long },
      serviceType: 'CARPOOL',
      requestedSeats: 1,
    })
      .then((res) => {
        if (!active) return;
        const floor = res.finalPrice || res.price;
        setMinPrice(floor);
        setDistanceKm(res.distanceKm ?? null);
        // Default customPrice to floor if not yet set
        setCustomPriceStr((prev) => (prev ? prev : floor.toString()));
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to estimate return trip min price:', err);
        setMinPrice(null);
      })
      .finally(() => {
        if (active) setIsEstimating(false);
      });

    return () => {
      active = false;
    };
  }, [pickup.lat, pickup.long, dropoff.lat, dropoff.long, pickup.address, dropoff.address]);

  const customPrice = Number(customPriceStr.replace(/\D/g, '')) || 0;
  const isPriceBelowFloor = minPrice != null && customPrice < minPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!customerPhone.trim()) {
      setErrorMessage('Vui lòng nhập số điện thoại khách hàng.');
      return;
    }

    if (!pickup.lat || !pickup.long || !pickup.address) {
      setErrorMessage('Vui lòng chọn điểm đón hợp lệ từ gợi ý tìm kiếm.');
      return;
    }

    if (!dropoff.lat || !dropoff.long || !dropoff.address) {
      setErrorMessage('Vui lòng chọn điểm trả hợp lệ từ gợi ý tìm kiếm.');
      return;
    }

    if (!customPrice || customPrice <= 0) {
      setErrorMessage('Vui lòng nhập giá cước cho chuyến đi.');
      return;
    }

    if (minPrice != null && customPrice < minPrice) {
      setErrorMessage(
        `Giá cước không được thấp hơn giá sàn tối thiểu ${fmtVnd(minPrice)} (1 ghế ghép theo công thức).`,
      );
      return;
    }

    if (needVat) {
      if (!companyName.trim() || !taxCode.trim() || !companyAddress.trim()) {
        setErrorMessage('Vui lòng điền đầy đủ Tên công ty, MST và Địa chỉ công ty để xuất hoá đơn.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await createDriverReturnTrip({
        customerPhone: customerPhone.trim(),
        customerName: customerName.trim() || undefined,
        pickupAddress: pickup,
        dropoffAddress: dropoff,
        customPrice,
        driverPhone: driverPhone.trim() || undefined,
        note: note.trim() || undefined,
        vatInfo: needVat
          ? {
              companyName: companyName.trim(),
              taxCode: taxCode.trim(),
              companyAddress: companyAddress.trim(),
              invoiceEmail: invoiceEmail.trim() || undefined,
            }
          : undefined,
      });

      setCreatedBooking(res);
      toast({
        title: 'Tạo chuyến thành công!',
        description: `Chuyến xe #${res.code || res.id.slice(0, 8).toUpperCase()} đã được nhận thành công.`,
      });

      // Notify host mobile webview if embedded in Driver App
      if (typeof window !== 'undefined') {
        try {
          const w = window as any;
          if (w.VigoApp?.postMessage) {
            w.VigoApp.postMessage('return-trip-created');
          }
        } catch (_) {}
      }
    } catch (err: any) {
      console.error('Error creating return trip:', err);
      setErrorMessage(err.message || 'Không thể tạo chuyến chiều về. Vui lòng thử lại.');
      toast({
        variant: 'destructive',
        title: 'Tạo chuyến thất bại',
        description: err.message || 'Vui lòng kiểm tra lại thông tin.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setCreatedBooking(null);
    setCustomerPhone('');
    setCustomerName('');
    setNote('');
    setPickup(emptyPoint());
    setDropoff(emptyPoint());
    setMinPrice(null);
    setDistanceKm(null);
    setCustomPriceStr('');
    setNeedVat(false);
    setCompanyName('');
    setTaxCode('');
    setCompanyAddress('');
    setInvoiceEmail('');
    setErrorMessage(null);
  };

  if (createdBooking) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <Card className="border-green-500/30 bg-green-500/5 shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/50 dark:text-green-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl font-bold text-green-700 dark:text-green-400">
              Đặt chuyến chiều về thành công!
            </CardTitle>
            <CardDescription className="text-sm">
              Chuyến xe đã được tự động nhận và xếp cho tài xế.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground">Mã chuyến đi:</span>
                <span className="font-mono font-bold text-base text-primary">
                  {createdBooking.code || createdBooking.id.slice(0, 8)}
                </span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground">Trạng thái:</span>
                <Badge className="bg-emerald-600 hover:bg-emerald-700">Đã nhận (ACCEPTED)</Badge>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground">Khách hàng:</span>
                <span className="font-medium">
                  {createdBooking.customerName || 'Khách vãng lai'} ({createdBooking.customerPhone || customerPhone})
                </span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground">Giá cước:</span>
                <span className="font-bold text-base text-emerald-600">
                  {fmtVnd(createdBooking.price || customPrice)}
                </span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground">Hình thức thanh toán:</span>
                <Badge variant="outline" className="font-normal">Tiền mặt (CASH)</Badge>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Điểm đón:</div>
                    <div className="font-medium text-xs">{createdBooking.pickupAddress?.address || pickup.address}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Navigation className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Điểm trả:</div>
                    <div className="font-medium text-xs">{createdBooking.dropoffAddress?.address || dropoff.address}</div>
                  </div>
                </div>
              </div>

              {createdBooking.vatInfo && (
                <div className="mt-3 rounded-md bg-muted/50 p-2.5 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <Receipt className="h-3.5 w-3.5" /> Thông tin xuất hoá đơn:
                  </div>
                  <div>Công ty: {createdBooking.vatInfo.companyName}</div>
                  <div>MST: {createdBooking.vatInfo.taxCode}</div>
                  {createdBooking.vatInfo.invoiceEmail && <div>Email: {createdBooking.vatInfo.invoiceEmail}</div>}
                </div>
              )}
            </div>

            {createdBooking.shareLink && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate pr-2">
                  <Share2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{createdBooking.shareLink}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(createdBooking.shareLink || '');
                    toast({ title: 'Đã sao chép link hành trình' });
                  }}
                >
                  Sao chép
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handleResetForm} variant="outline" className="w-full gap-2">
                <RotateCcw className="h-4 w-4" /> Đặt chuyến chiều về khác
              </Button>
              <Button
                onClick={() => router.push('/agent-portal/orders')}
                className="w-full"
              >
                Xem danh sách đơn của tôi
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Car className="h-6 w-6 text-primary" /> Đặt chuyến chiều về
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tài xế tự đặt cuốc cho chính mình với giá cước thoả thuận, tối thiểu bằng giá 1 ghế ghép.
        </p>
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Section: Driver assignment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <span>{me?.displayName ? `Tài xế: ${me.displayName}` : 'Tài xế nhận chuyến'}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-primary font-normal"
                onClick={() => setIsEditingDriverPhone(!isEditingDriverPhone)}
              >
                {isEditingDriverPhone ? 'Khoá SĐT' : 'Đổi tài xế khác'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="driverPhone" className="text-xs text-muted-foreground">
                Số điện thoại tài xế nhận chuyến
              </Label>
              <Input
                id="driverPhone"
                type="tel"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                disabled={!isEditingDriverPhone}
                placeholder="Nhập SĐT tài xế..."
                className="font-medium bg-muted/30"
              />
              <p className="text-[11px] text-muted-foreground">
                {isEditingDriverPhone
                  ? 'Nhập SĐT tài xế đang hoạt động để gán chuyến trực tiếp.'
                  : 'Mặc định là SĐT của bạn đang đăng nhập. Chuyến sẽ được gán ngay cho bạn.'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Section: Customer info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> Thông tin khách hàng
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="customerPhone" className="text-xs font-medium">
                  Số điện thoại khách <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="customerPhone"
                  type="tel"
                  required
                  placeholder="0987654321"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customerName" className="text-xs font-medium">
                  Tên khách hàng (tuỳ chọn)
                </Label>
                <Input
                  id="customerName"
                  placeholder="Anh Tuấn, Chị Hoa..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note" className="text-xs font-medium">
                Ghi chú cuốc xe (tuỳ chọn)
              </Label>
              <Textarea
                id="note"
                rows={2}
                placeholder="Ví dụ: Đón ở cổng phụ, khách có 1 vali..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section: Route */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Lộ trình di chuyển
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                Điểm đón khách <span className="text-rose-500">*</span>
              </Label>
              <AddressAutocomplete
                value={pickup.address}
                placeholder="Tìm địa chỉ đón khách..."
                onSelect={(data) => setPickup(data)}
                onClear={() => setPickup(emptyPoint())}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <span className="flex h-2 w-2 rounded-full bg-rose-500" />
                Điểm trả khách <span className="text-rose-500">*</span>
              </Label>
              <AddressAutocomplete
                value={dropoff.address}
                placeholder="Tìm địa chỉ trả khách..."
                onSelect={(data) => setDropoff(data)}
                onClear={() => setDropoff(emptyPoint())}
              />
            </div>

            {/* Price floor indicator */}
            {(isEstimating || minPrice != null) && (
              <div className="rounded-lg bg-muted/60 p-3.5 border text-sm space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Khoảng cách ước tính:</span>
                  <span className="font-semibold text-foreground">
                    {isEstimating ? (
                      <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                    ) : distanceKm != null ? (
                      `${distanceKm.toFixed(1)} km`
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Giá sàn tối thiểu (1 ghế ghép):
                  </span>
                  <span className="text-base font-bold text-primary">
                    {isEstimating ? (
                      <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tính...
                      </span>
                    ) : (
                      fmtVnd(minPrice)
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Hệ thống không cho phép nhập giá thấp hơn giá sàn của 1 ghế xe ghép theo công thức định giá.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section: Agreed Price & Payment */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Giá cước & Thanh toán
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="customPrice" className="text-xs font-medium">
                  Giá cước thoả thuận (VNĐ) <span className="text-rose-500">*</span>
                </Label>
                {minPrice != null && (
                  <button
                    type="button"
                    onClick={() => setCustomPriceStr(minPrice.toString())}
                    className="text-xs text-primary hover:underline"
                  >
                    Điền giá sàn ({fmtVnd(minPrice)})
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="customPrice"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={
                    customPrice > 0
                      ? customPrice.toLocaleString('vi-VN')
                      : customPriceStr
                  }
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    setCustomPriceStr(raw);
                  }}
                  className={`text-lg font-bold pr-10 ${
                    isPriceBelowFloor ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">
                  ₫
                </span>
              </div>

              {isPriceBelowFloor && (
                <p className="text-xs font-medium text-rose-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Giá bạn nhập ({fmtVnd(customPrice)}) thấp hơn giá sàn tối thiểu ({fmtVnd(minPrice)}).
                </p>
              )}

              {/* Quick bump buttons */}
              {minPrice != null && (
                <div className="flex gap-2 pt-1 flex-wrap">
                  {[0, 20000, 50000, 100000].map((delta) => {
                    const target = minPrice + delta;
                    return (
                      <Button
                        key={delta}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setCustomPriceStr(target.toString())}
                      >
                        {delta === 0 ? 'Bằng giá sàn' : `+${(delta / 1000).toFixed(0)}k (${(target / 1000).toFixed(0)}k)`}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-2 border-t">
              <Label className="text-xs font-medium">Hình thức thanh toán</Label>
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  <div>
                    <div className="font-semibold text-sm">Tiền mặt (CASH)</div>
                    <div className="text-xs text-muted-foreground">Khách thanh toán trực tiếp cho tài xế</div>
                  </div>
                </div>
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  Mặc định
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section: VAT Invoice */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" /> Xuất hoá đơn VAT
              </CardTitle>
              <Switch checked={needVat} onCheckedChange={setNeedVat} />
            </div>
            <CardDescription className="text-xs">
              Bật nếu khách hàng yêu cầu công ty xuất hoá đơn điện tử.
            </CardDescription>
          </CardHeader>
          {needVat && (
            <CardContent className="space-y-3 pt-0 border-t mt-3">
              <div className="space-y-1.5 pt-3">
                <Label htmlFor="companyName" className="text-xs font-medium">
                  Tên công ty / Đơn vị <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="companyName"
                  placeholder="Công ty TNHH..."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="taxCode" className="text-xs font-medium">
                    Mã số thuế (MST) <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="taxCode"
                    placeholder="0123456789"
                    value={taxCode}
                    onChange={(e) => setTaxCode(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="invoiceEmail" className="text-xs font-medium">
                    Email nhận hoá đơn
                  </Label>
                  <Input
                    id="invoiceEmail"
                    type="email"
                    placeholder="ketoan@congty.com"
                    value={invoiceEmail}
                    onChange={(e) => setInvoiceEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="companyAddress" className="text-xs font-medium">
                  Địa chỉ công ty <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="companyAddress"
                  placeholder="Số nhà, đường, phường, quận, tỉnh/thành..."
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                />
              </div>
            </CardContent>
          )}
        </Card>

        {/* Submit action */}
        <div className="pt-2">
          <Button
            type="submit"
            size="lg"
            className="w-full text-base font-semibold shadow-lg"
            disabled={submitting || isPriceBelowFloor || isEstimating}
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang tạo và nhận chuyến...
              </>
            ) : (
              <>Tạo và nhận chuyến chiều về</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
