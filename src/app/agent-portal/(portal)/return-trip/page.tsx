'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddressAutocomplete } from '@/app/(app)/bookings/components/address-autocomplete';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  createDriverReturnTrip,
  estimateTripPrice,
  getAgentMe,
  downloadBookingContractPdf,
  lookupCustomerByPhone,
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
  Users,
  Plus,
  X,
  Calculator,
  Receipt,
  RotateCcw,
  Navigation,
  Share2,
  Home,
  FileText,
  ArrowUpDown,
  Copy,
} from 'lucide-react';

interface AddressPoint {
  address: string;
  lat: number;
  long: number;
}

const emptyPoint = (): AddressPoint => ({ address: '', lat: 0, long: 0 });
const fmtVnd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`);
const hasCoords = (p: AddressPoint | null | undefined) => !!p && !(p.lat === 0 && p.long === 0) && !!p.address;

export default function ReturnTripPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [me, setMe] = React.useState<AgentMe | null>(null);
  const [driverPhone, setDriverPhone] = React.useState('');
  const [isEditingDriverPhone, setIsEditingDriverPhone] = React.useState(false);

  // Customer state
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  const [checkingCustomer, setCheckingCustomer] = React.useState(false);

  // Trip route & service state
  const [pickup, setPickup] = React.useState<AddressPoint>(emptyPoint());
  const [dropoff, setDropoff] = React.useState<AddressPoint>(emptyPoint());
  const [serviceType, setServiceType] = React.useState<'CARPOOL' | 'RIDE'>('CARPOOL');
  const [vehicleType, setVehicleType] = React.useState<'CAR_4' | 'CAR_7'>('CAR_4');
  const [coPassengers, setCoPassengers] = React.useState<string[]>([]);
  const [note, setNote] = React.useState('');

  // Price estimate & custom price state
  const [isEstimating, setIsEstimating] = React.useState(false);
  const [minFloorPrice, setMinFloorPrice] = React.useState<number | null>(null);
  const [priceEstimate, setPriceEstimate] = React.useState<number | null>(null);
  const [distanceKm, setDistanceKm] = React.useState<number | null>(null);

  // Custom price configuration (similar to agent portal)
  const [isCustomPrice, setIsCustomPrice] = React.useState(false);
  const [customPriceStr, setCustomPriceStr] = React.useState('');

  // VAT Invoice state
  const [needVat, setNeedVat] = React.useState(false);
  const [companyName, setCompanyName] = React.useState('');
  const [taxCode, setTaxCode] = React.useState('');
  const [companyAddress, setCompanyAddress] = React.useState('');
  const [invoiceEmail, setInvoiceEmail] = React.useState('');

  // Submission state
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [createdBooking, setCreatedBooking] = React.useState<DriverReturnTripResult | null>(null);
  const [downloadingContract, setDownloadingContract] = React.useState(false);

  const estimateSeqRef = React.useRef(0);

  // Initial load: current driver info
  React.useEffect(() => {
    getAgentMe()
      .then((data) => {
        setMe(data);
        if (data.phone) {
          setDriverPhone(data.phone);
        }
      })
      .catch((err) => {
        console.error('Failed to get agent info:', err);
      });
  }, []);

  // Passenger limits
  const maxTotal = serviceType === 'RIDE' ? (vehicleType === 'CAR_7' ? 6 : 4) : 6;
  const maxExtras = maxTotal - 1;
  const totalPassengers = 1 + coPassengers.length;

  React.useEffect(() => {
    setCoPassengers((prev) => (prev.length > maxExtras ? prev.slice(0, maxExtras) : prev));
  }, [maxExtras]);

  const addPassenger = () => {
    if (coPassengers.length < maxExtras) {
      setCoPassengers((prev) => [...prev, '']);
    }
  };

  const updatePassenger = (idx: number, val: string) => {
    setCoPassengers((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };

  const removePassenger = (idx: number) => {
    setCoPassengers((prev) => prev.filter((_, i) => i !== idx));
  };

  // Auto lookup customer name when phone reaches 10 digits
  const handlePhoneChange = (val: string) => {
    setCustomerPhone(val);
    const clean = val.replace(/\D/g, '');
    if (clean.length === 10 && !customerName) {
      setCheckingCustomer(true);
      lookupCustomerByPhone(clean)
        .then((res) => {
          if (res?.fullName) {
            setCustomerName(res.fullName);
          }
        })
        .catch(() => {})
        .finally(() => setCheckingCustomer(false));
    }
  };

  // Swap pickup & dropoff
  const swapAddresses = () => {
    const temp = pickup;
    setPickup(dropoff);
    setDropoff(temp);
  };

  // Price estimation when pickup / dropoff / service changes
  React.useEffect(() => {
    if (!hasCoords(pickup) || !hasCoords(dropoff)) {
      setMinFloorPrice(null);
      setPriceEstimate(null);
      setDistanceKm(null);
      setIsEstimating(false);
      return;
    }

    const seq = ++estimateSeqRef.current;
    setIsEstimating(true);

    // 1. Calculate floor price (1-seat CARPOOL) for route
    estimateTripPrice({
      pickup: { address: pickup.address, lat: pickup.lat, long: pickup.long },
      dropoff: { address: dropoff.address, lat: dropoff.lat, long: dropoff.long },
      serviceType: 'CARPOOL',
      requestedSeats: 1,
    })
      .then(async (floorRes) => {
        if (seq !== estimateSeqRef.current) return;
        const floor = floorRes.finalPrice || floorRes.price;
        setMinFloorPrice(floor);
        setDistanceKm(floorRes.distanceKm ?? null);

        // 2. Calculate service estimate
        if (serviceType === 'CARPOOL' && totalPassengers === 1) {
          setPriceEstimate(floor);
          setIsEstimating(false);
        } else {
          try {
            const estRes = await estimateTripPrice({
              pickup: { address: pickup.address, lat: pickup.lat, long: pickup.long },
              dropoff: { address: dropoff.address, lat: dropoff.lat, long: dropoff.long },
              serviceType,
              vehicleType: serviceType === 'RIDE' ? vehicleType : undefined,
              requestedSeats: serviceType === 'CARPOOL' ? totalPassengers : undefined,
            });
            if (seq === estimateSeqRef.current) {
              setPriceEstimate(estRes.finalPrice || estRes.price);
            }
          } catch {
            if (seq === estimateSeqRef.current) {
              setPriceEstimate(floor);
            }
          } finally {
            if (seq === estimateSeqRef.current) {
              setIsEstimating(false);
            }
          }
        }
      })
      .catch((err) => {
        if (seq !== estimateSeqRef.current) return;
        console.error('Failed to estimate return trip price:', err);
        setMinFloorPrice(null);
        setPriceEstimate(null);
        setIsEstimating(false);
      });
  }, [pickup, dropoff, serviceType, vehicleType, totalPassengers]);

  // Custom price helpers
  const handleCustomPriceChange = (raw: string) => {
    const cleanDigits = raw.replace(/\D/g, '');
    if (!cleanDigits) {
      setCustomPriceStr('');
      return;
    }
    const num = Number(cleanDigits);
    setCustomPriceStr(num.toLocaleString('vi-VN'));
  };

  const parsedCustomPrice = React.useMemo(() => {
    if (!customPriceStr) return 0;
    return Number(customPriceStr.replace(/\D/g, '')) || 0;
  }, [customPriceStr]);

  // Floor price rule: backend requires customPrice >= 1-seat CARPOOL price
  const effectiveFloorPrice = minFloorPrice != null && minFloorPrice > 0 ? minFloorPrice : 150000;
  const isCustomPriceBelowFloor = isCustomPrice && parsedCustomPrice > 0 && parsedCustomPrice < effectiveFloorPrice;

  // The actual price used for the booking
  const effectiveBookingPrice = isCustomPrice
    ? parsedCustomPrice
    : (priceEstimate || minFloorPrice || 0);

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMessage('Vui lòng nhập số điện thoại khách hàng hợp lệ (tối thiểu 10 chữ số).');
      return;
    }

    if (!hasCoords(pickup)) {
      setErrorMessage('Vui lòng chọn địa chỉ đón khách từ danh sách gợi ý.');
      return;
    }

    if (!hasCoords(dropoff)) {
      setErrorMessage('Vui lòng chọn địa chỉ trả khách từ danh sách gợi ý.');
      return;
    }

    if (effectiveBookingPrice <= 0) {
      setErrorMessage('Chưa tính được giá cước chuyến đi. Vui lòng kiểm tra lại điểm đón và điểm trả.');
      return;
    }

    if (isCustomPrice && parsedCustomPrice < effectiveFloorPrice) {
      setErrorMessage(
        `Giá cước tự cấu hình (${fmtVnd(parsedCustomPrice)}) không được thấp hơn giá tối thiểu (${fmtVnd(effectiveFloorPrice)}).`,
      );
      return;
    }

    if (needVat) {
      if (!companyName.trim()) {
        setErrorMessage('Vui lòng nhập tên công ty xuất hoá đơn.');
        return;
      }
      if (!taxCode.trim()) {
        setErrorMessage('Vui lòng nhập mã số thuế công ty.');
        return;
      }
      if (!companyAddress.trim()) {
        setErrorMessage('Vui lòng nhập địa chỉ công ty xuất hoá đơn.');
        return;
      }
    }

    setSubmitting(true);

    try {
      const passengerNamesList = [customerName.trim(), ...coPassengers.map((n) => n.trim())].filter(Boolean);

      const res = await createDriverReturnTrip({
        customerPhone: cleanPhone,
        customerName: customerName.trim() || undefined,
        pickupAddress: { address: pickup.address, lat: pickup.lat, long: pickup.long },
        dropoffAddress: { address: dropoff.address, lat: dropoff.lat, long: dropoff.long },
        customPrice: effectiveBookingPrice,
        driverPhone: isEditingDriverPhone && driverPhone.trim() ? driverPhone.trim() : undefined,
        note: note.trim() || undefined,
        requestedSeats: totalPassengers,
        passengerNames: passengerNamesList.length > 0 ? passengerNamesList : undefined,
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
        title: 'Tự đặt chuyến thành công!',
        description: `Chuyến #${res.code || res.id.slice(0, 8).toUpperCase()} đã được tạo và gán cho bạn.`,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tạo chuyến. Vui lòng thử lại.');
      toast({
        variant: 'destructive',
        title: 'Đặt chuyến thất bại',
        description: err.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadContract = async (bookingId: string) => {
    setDownloadingContract(true);
    try {
      await downloadBookingContractPdf(bookingId);
      toast({ title: 'Đã tải hợp đồng thành công!' });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Không thể tải hợp đồng',
        description: err.message || 'Vui lòng thử lại sau.',
      });
    } finally {
      setDownloadingContract(false);
    }
  };

  const handleResetForm = () => {
    setCreatedBooking(null);
    setCustomerPhone('');
    setCustomerName('');
    setPickup(emptyPoint());
    setDropoff(emptyPoint());
    setCoPassengers([]);
    setNote('');
    setIsCustomPrice(false);
    setCustomPriceStr('');
    setNeedVat(false);
    setCompanyName('');
    setTaxCode('');
    setCompanyAddress('');
    setInvoiceEmail('');
    setErrorMessage(null);
  };

  const handleFinishAndReturn = () => {
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.VigoApp?.postMessage) {
        w.VigoApp.postMessage('return-trip-created');
        if (createdBooking?.id) {
          w.VigoApp.postMessage(`open-booking:${createdBooking.id}`);
        }
        return;
      }
    }
    router.push('/agent-portal/dashboard');
  };

  // ── SUCCESS VIEW ─────────────────────────────────────────────────────
  if (createdBooking) {
    const bookingCode = createdBooking.code || createdBooking.id.slice(0, 8).toUpperCase();
    const finalPrice = createdBooking.finalPrice || createdBooking.price || effectiveBookingPrice;

    return (
      <div className="max-w-xl mx-auto space-y-5 px-3 py-4 sm:p-6">
        <Card className="border-emerald-500/30 shadow-md">
          <CardHeader className="text-center pb-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 mb-2">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle className="text-xl sm:text-2xl font-bold text-emerald-600">
              Tự đặt chuyến thành công!
            </CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Chuyến đi đã được hệ thống xác nhận và gán thẳng cho bạn. Hợp đồng điện tử đã được lập.
            </p>
          </CardHeader>

          <CardContent className="space-y-4 pt-1">
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3 text-sm">
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground text-xs">Mã chuyến:</span>
                <Badge className="font-mono text-sm font-bold bg-primary/15 text-primary border-primary/20">
                  #{bookingCode}
                </Badge>
              </div>

              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground text-xs">Giá cước cuốc xe:</span>
                <span className="font-bold text-lg text-emerald-600">{fmtVnd(finalPrice)}</span>
              </div>

              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground text-xs">Khách hàng:</span>
                <span className="font-semibold text-foreground">
                  {createdBooking.customerName || customerName || 'Khách hàng'} ({createdBooking.customerPhone || customerPhone})
                </span>
              </div>

              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground text-xs">Số lượng khách:</span>
                <Badge variant="secondary" className="font-medium">
                  {createdBooking.requestedSeats || totalPassengers} người
                </Badge>
              </div>

              {/* Route */}
              <div className="space-y-2 pt-1 border-b pb-2 text-xs">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[11px] text-muted-foreground font-medium">Điểm đón:</div>
                    <div className="font-medium text-foreground">{createdBooking.pickupAddress?.address || pickup.address}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Navigation className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[11px] text-muted-foreground font-medium">Điểm trả:</div>
                    <div className="font-medium text-foreground">{createdBooking.dropoffAddress?.address || dropoff.address}</div>
                  </div>
                </div>
              </div>

              {/* VAT info */}
              {createdBooking.vatInfo ? (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs space-y-1">
                  <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <Receipt className="h-3.5 w-3.5" /> Xuất hoá đơn VAT:
                  </div>
                  <div>Công ty: {createdBooking.vatInfo.companyName}</div>
                  <div>MST: {createdBooking.vatInfo.taxCode}</div>
                  {createdBooking.vatInfo.invoiceEmail && <div>Email: {createdBooking.vatInfo.invoiceEmail}</div>}
                </div>
              ) : (
                <div className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground border flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>Hoá đơn VAT:</span>
                  </span>
                  <span className="text-[11px] font-medium">Khách lẻ</span>
                </div>
              )}

              {/* PDF contract button */}
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadContract(createdBooking.id)}
                  disabled={downloadingContract}
                  className="w-full gap-2 text-xs font-semibold h-9"
                >
                  {downloadingContract ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 text-primary" />
                  )}
                  Tải hợp đồng điện tử (PDF)
                </Button>
              </div>
            </div>

            {/* Share link */}
            {createdBooking.shareLink && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate pr-2">
                  <Share2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{createdBooking.shareLink}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(createdBooking.shareLink || '');
                    toast({ title: 'Đã sao chép link hành trình' });
                  }}
                >
                  Sao chép
                </Button>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={handleFinishAndReturn}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 h-11 shadow-sm"
              >
                <Home className="h-4 w-4" /> Về trang chủ nhận khách
              </Button>
              <Button onClick={handleResetForm} variant="outline" className="w-full gap-2 h-10">
                <RotateCcw className="h-4 w-4" /> Tự đặt chuyến khác
              </Button>
              <Button
                onClick={() => router.push('/agent-portal/orders')}
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
              >
                Xem danh sách đơn của tôi
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── MAIN STREAMLINED FORM (KIỂU BÊN ĐẶT HỘ) ──────────────────────────
  return (
    <div className="max-w-xl mx-auto space-y-5 px-3 py-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Car className="h-6 w-6 text-primary shrink-0" /> Tự đặt chuyến
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Tạo chuyến nhanh và tự nhận cuốc cho chính bạn.
          </p>
        </div>
        {me?.walletBalance != null && (
          <Badge variant="outline" className="text-xs font-semibold py-1 px-2.5 bg-muted/40 shrink-0">
            Ví: {fmtVnd(me.walletBalance)}
          </Badge>
        )}
      </div>

      {/* Driver compact banner */}
      <div className="rounded-xl border bg-muted/30 px-3.5 py-2.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-primary shrink-0" />
          <span>
            Tài xế nhận chuyến: <strong className="text-foreground">{me?.displayName || 'Bạn'}</strong>
            {driverPhone && <span className="text-muted-foreground ml-1">({driverPhone})</span>}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsEditingDriverPhone(!isEditingDriverPhone)}
          className="text-primary hover:underline font-medium text-[11px] shrink-0"
        >
          {isEditingDriverPhone ? 'Khoá' : 'Đổi SĐT'}
        </button>
      </div>

      {isEditingDriverPhone && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5 text-xs">
          <Label htmlFor="driverPhone" className="text-xs font-medium">
            Số điện thoại tài xế nhận chuyến
          </Label>
          <Input
            id="driverPhone"
            type="tel"
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
            placeholder="Nhập SĐT tài xế..."
            className="h-9 bg-background"
          />
          <p className="text-[11px] text-muted-foreground">
            Mặc định là SĐT của bạn. Điền SĐT tài xế khác nếu bạn muốn gán chuyến cho đồng nghiệp.
          </p>
        </div>
      )}

      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. THÔNG TIN KHÁCH HÀNG */}
        <Card className="shadow-2xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4 text-primary" /> Thông tin khách hàng
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="customerPhone" className="text-xs font-medium">
                  SĐT khách <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="customerPhone"
                    type="tel"
                    required
                    placeholder="0987654321"
                    value={customerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className="h-10 font-medium"
                  />
                  {checkingCustomer && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customerName" className="text-xs font-medium">
                  Tên khách (tuỳ chọn)
                </Label>
                <Input
                  id="customerName"
                  placeholder="Anh Tuấn, Chị Hoa..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. LỘ TRÌNH DI CHUYỂN */}
        <Card className="shadow-2xs overflow-visible">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" /> Lộ trình di chuyển
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 overflow-visible">
            {/* Pickup */}
            <div className="space-y-1 relative z-20">
              <Label className="text-xs font-medium flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
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

            {/* Swap button */}
            <div className="flex justify-center -my-1 relative z-15">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted"
                onClick={swapAddresses}
                disabled={!pickup.address && !dropoff.address}
                title="Đảo chiều điểm đón và điểm trả"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Dropoff */}
            <div className="space-y-1 relative z-10">
              <Label className="text-xs font-medium flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
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

            {distanceKm != null && distanceKm > 0 && (
              <div className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1">
                <span>Khoảng cách ước tính:</span>
                <strong className="text-foreground">{distanceKm.toFixed(1)} km</strong>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. DỊCH VỤ & HÀNH KHÁCH */}
        <Card className="shadow-2xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4 text-primary" /> Dịch vụ & Hành khách
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Loại dịch vụ</Label>
                <Select value={serviceType} onValueChange={(v: 'CARPOOL' | 'RIDE') => setServiceType(v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CARPOOL">🚌 Đi chung</SelectItem>
                    <SelectItem value="RIDE">🚗 Bao xe</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {serviceType === 'RIDE' ? (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Loại xe</Label>
                  <Select value={vehicleType} onValueChange={(v: 'CAR_4' | 'CAR_7') => setVehicleType(v)}>
                    <SelectTrigger className="h-10">
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
                  <Label className="text-xs font-medium">Tổng số khách</Label>
                  <div className="h-10 flex items-center px-3 rounded-md border bg-muted/20 text-sm font-semibold text-primary">
                    {totalPassengers} khách ({totalPassengers} ghế)
                  </div>
                </div>
              )}
            </div>

            {/* Passenger list (primary + co-passengers) */}
            <div className="space-y-2 rounded-lg border p-3 bg-muted/10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Danh sách khách ({totalPassengers})
                </span>
                <Badge variant="secondary" className="text-xs">
                  {totalPassengers} người
                </Badge>
              </div>

              {/* Khách #1 */}
              <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                <Badge variant="outline" className="shrink-0 text-[11px]">Khách 1</Badge>
                <span className={cn('font-medium', !customerName && 'text-muted-foreground italic')}>
                  {customerName || 'Khách chính (theo SĐT ở trên)'}
                </span>
              </div>

              {/* Co-passengers */}
              {coPassengers.map((name, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Badge variant="outline" className="shrink-0 text-[11px]">Khách {idx + 2}</Badge>
                  <Input
                    placeholder={`Tên khách ${idx + 2} (đi cùng)`}
                    value={name}
                    onChange={(e) => updatePassenger(idx, e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePassenger(idx)}
                    className="h-8 w-8 text-muted-foreground hover:text-rose-500"
                    aria-label="Xoá khách"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              {coPassengers.length < maxExtras && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addPassenger}
                  className="w-full h-8 text-xs gap-1.5 mt-1 border-dashed"
                >
                  <Plus className="h-3.5 w-3.5 text-primary" /> Thêm khách đi cùng
                </Button>
              )}
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label htmlFor="tripNote" className="text-xs font-medium">
                Ghi chú cuốc xe (tuỳ chọn)
              </Label>
              <Textarea
                id="tripNote"
                rows={1}
                placeholder="VD: Đón ở cổng phụ, khách có 1 vali nhỏ..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-[38px] text-xs resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* 4. GIÁ CƯỚC & TỰ CẤU HÌNH GIÁ (KIỂU BÊN ĐẶT HỘ) */}
        <Card className="shadow-2xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
              <Calculator className="h-4 w-4 text-emerald-600" /> Giá cước chuyến đi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Display price */}
            <div className="rounded-xl border bg-muted/30 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  {isEstimating && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                  {isCustomPrice ? 'Giá áp dụng:' : 'Giá dự kiến hệ thống:'}
                </span>
                {effectiveFloorPrice > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    Sàn tối thiểu: {fmtVnd(effectiveFloorPrice)}
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-baseline justify-between">
                <div className="text-xl sm:text-2xl font-black text-emerald-600">
                  {isEstimating ? (
                    <span className="text-sm font-normal text-muted-foreground">Đang tính giá...</span>
                  ) : effectiveBookingPrice > 0 ? (
                    `${fmtVnd(effectiveBookingPrice)}`
                  ) : (
                    '—'
                  )}
                </div>
                {isCustomPrice && (
                  <Badge variant="outline" className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                    Đã gồm thuế VAT
                  </Badge>
                )}
              </div>
            </div>

            {/* Custom price switch */}
            <div className="space-y-3 rounded-xl border p-3.5 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <Label
                    htmlFor="customPriceToggle"
                    className="text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer"
                  >
                    <Calculator className="h-3.5 w-3.5 text-primary" /> Tự cấu hình giá cước
                  </Label>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Bật để tự nhập giá cước thoả thuận (tối thiểu {fmtVnd(effectiveFloorPrice)}, đã gồm thuế).
                  </p>
                </div>
                <Switch
                  id="customPriceToggle"
                  checked={isCustomPrice}
                  onCheckedChange={(checked) => {
                    setIsCustomPrice(checked);
                    if (checked && !customPriceStr) {
                      setCustomPriceStr(effectiveFloorPrice.toLocaleString('vi-VN'));
                    }
                  }}
                />
              </div>

              {isCustomPrice && (
                <div className="space-y-2.5 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="customPriceInput" className="text-xs font-medium">
                      Giá cước thoả thuận (VNĐ) <span className="text-rose-500">*</span>
                    </Label>
                    {effectiveFloorPrice > 0 && (
                      <button
                        type="button"
                        onClick={() => setCustomPriceStr(effectiveFloorPrice.toLocaleString('vi-VN'))}
                        className="text-[11px] text-primary hover:underline font-medium"
                      >
                        Điền giá sàn ({fmtVnd(effectiveFloorPrice)})
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <Input
                      id="customPriceInput"
                      inputMode="numeric"
                      placeholder={effectiveFloorPrice.toLocaleString('vi-VN')}
                      value={customPriceStr}
                      onChange={(e) => handleCustomPriceChange(e.target.value)}
                      className={cn(
                        'h-10 text-base font-bold text-emerald-600 pr-10',
                        isCustomPriceBelowFloor && 'border-rose-500 text-rose-500 focus-visible:ring-rose-500',
                      )}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                      ₫
                    </span>
                  </div>

                  {isCustomPriceBelowFloor && (
                    <p className="text-xs text-rose-500 font-medium flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Giá cước không được thấp hơn giá tối thiểu ({fmtVnd(effectiveFloorPrice)}).
                    </p>
                  )}

                  {/* Quick presets */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[11px] text-muted-foreground mr-0.5">Gợi ý nhanh:</span>
                    {[150000, 200000, 250000, 300000, 500000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCustomPriceStr(amt.toLocaleString('vi-VN'))}
                        className={cn(
                          'text-xs px-2 py-0.5 rounded border transition-colors',
                          parsedCustomPrice === amt
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-semibold'
                            : 'border-muted-foreground/30 hover:bg-muted text-muted-foreground',
                        )}
                      >
                        {amt.toLocaleString('vi-VN')}₫
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 5. XUẤT HOÁ ĐƠN VAT (TUỲ CHỌN) */}
        <Card className="shadow-2xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <Receipt className="h-4 w-4 text-primary" /> Xuất hoá đơn VAT (công ty)
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Bật nếu khách hàng yêu cầu xuất hoá đơn GTGT cho công ty.
                </p>
              </div>
              <Switch checked={needVat} onCheckedChange={setNeedVat} />
            </div>
          </CardHeader>

          {needVat && (
            <CardContent className="space-y-3 pt-0 border-t mt-1">
              <div className="space-y-1.5 pt-3">
                <Label htmlFor="companyName" className="text-xs font-medium">
                  Tên công ty / Đơn vị <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="companyName"
                  placeholder="Công ty TNHH..."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="h-9 text-xs"
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
                    className="h-9 text-xs"
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
                    className="h-9 text-xs"
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
                  className="h-9 text-xs"
                />
              </div>
            </CardContent>
          )}
        </Card>

        {/* SUBMIT BUTTON */}
        <div className="pt-2 pb-6">
          <Button
            type="submit"
            size="lg"
            className="w-full text-base font-bold h-12 shadow-md bg-primary hover:bg-primary/90"
            disabled={
              submitting ||
              isEstimating ||
              !customerPhone ||
              customerPhone.length < 10 ||
              !hasCoords(pickup) ||
              !hasCoords(dropoff) ||
              (isCustomPrice && parsedCustomPrice < effectiveFloorPrice)
            }
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang đặt và nhận chuyến...
              </>
            ) : (
              <>
                Tự đặt chuyến {totalPassengers > 1 ? `(${totalPassengers} khách)` : ''}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
