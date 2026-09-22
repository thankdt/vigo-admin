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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddressAutocomplete } from '@/app/(app)/bookings/components/address-autocomplete';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  createDriverReturnTrip,
  estimateTripPrice,
  getAgentMe,
  downloadBookingContractPdf,
  type AgentMe,
  type DriverReturnTripResult,
  type RetailPassengerInput,
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
  Minus,
  Plus,
  DollarSign,
  Receipt,
  RotateCcw,
  Navigation,
  Share2,
  Home,
  Download,
  Trash2,
  FileText,
  Split,
  UserPlus,
} from 'lucide-react';

interface AddressPoint {
  address: string;
  lat: number;
  long: number;
}

const emptyPoint = (): AddressPoint => ({ address: '', lat: 0, long: 0 });
const fmtVnd = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('vi-VN')}₫`);

interface RetailPassengerItem {
  id: string;
  name: string;
  phone: string;
  pickup: AddressPoint;
  dropoff: AddressPoint;
  minPrice: number | null;
  distanceKm: number | null;
  isEstimating: boolean;
  hasCustomPrice: boolean;
  customPriceStr: string;
  needVat: boolean;
  companyName: string;
  taxCode: string;
  companyAddress: string;
  invoiceEmail: string;
}

const createInitialRetailPassenger = (): RetailPassengerItem => ({
  id: Math.random().toString(36).substring(2, 9),
  name: '',
  phone: '',
  pickup: emptyPoint(),
  dropoff: emptyPoint(),
  minPrice: null,
  distanceKm: null,
  isEstimating: false,
  hasCustomPrice: false,
  customPriceStr: '',
  needVat: false,
  companyName: '',
  taxCode: '',
  companyAddress: '',
  invoiceEmail: '',
});

export default function ReturnTripPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [tripMode, setTripMode] = React.useState<'GROUP' | 'RETAIL'>('GROUP');
  const [me, setMe] = React.useState<AgentMe | null>(null);
  const [driverPhone, setDriverPhone] = React.useState('');
  const [isEditingDriverPhone, setIsEditingDriverPhone] = React.useState(false);

  // ── GROUP MODE STATES ────────────────────────────────────────────────
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  const [requestedSeats, setRequestedSeats] = React.useState<number>(1);
  const [companionNames, setCompanionNames] = React.useState<string[]>([]);
  const [note, setNote] = React.useState('');
  const [pickup, setPickup] = React.useState<AddressPoint>(emptyPoint());
  const [dropoff, setDropoff] = React.useState<AddressPoint>(emptyPoint());
  const [isEstimatingGroup, setIsEstimatingGroup] = React.useState(false);
  const [groupMinPrice, setGroupMinPrice] = React.useState<number | null>(null);
  const [groupDistanceKm, setGroupDistanceKm] = React.useState<number | null>(null);
  const [groupCustomPriceStr, setGroupCustomPriceStr] = React.useState('');
  const [groupNeedVat, setGroupNeedVat] = React.useState(false);
  const [groupCompanyName, setGroupCompanyName] = React.useState('');
  const [groupTaxCode, setGroupTaxCode] = React.useState('');
  const [groupCompanyAddress, setGroupCompanyAddress] = React.useState('');
  const [groupInvoiceEmail, setGroupInvoiceEmail] = React.useState('');

  // ── RETAIL MODE STATES ───────────────────────────────────────────────
  const [retailPassengers, setRetailPassengers] = React.useState<RetailPassengerItem[]>([
    createInitialRetailPassenger(),
  ]);
  const [retailNote, setRetailNote] = React.useState('');
  const [retailTotalPriceStr, setRetailTotalPriceStr] = React.useState('');

  // ── SUBMISSION & RESULT STATES ───────────────────────────────────────
  const [submitting, setSubmitting] = React.useState(false);
  const [createdBooking, setCreatedBooking] = React.useState<DriverReturnTripResult | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [downloadingContractIndex, setDownloadingContractIndex] = React.useState<number | 'all' | null>(null);

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

  // Update companion names array size when requestedSeats changes (Group Mode)
  React.useEffect(() => {
    if (requestedSeats <= 1) {
      setCompanionNames([]);
    } else {
      setCompanionNames((prev) => {
        const next = [...prev];
        while (next.length < requestedSeats - 1) next.push('');
        return next.slice(0, requestedSeats - 1);
      });
    }
  }, [requestedSeats]);

  // Recalculate floor price for Group mode
  React.useEffect(() => {
    if (!pickup.lat || !pickup.long || !dropoff.lat || !dropoff.long) {
      setGroupMinPrice(null);
      setGroupDistanceKm(null);
      return;
    }

    let active = true;
    setIsEstimatingGroup(true);
    setErrorMessage(null);

    estimateTripPrice({
      pickup: { address: pickup.address, lat: pickup.lat, long: pickup.long },
      dropoff: { address: dropoff.address, lat: dropoff.lat, long: dropoff.long },
      serviceType: 'CARPOOL',
      requestedSeats,
    })
      .then((res) => {
        if (!active) return;
        const floor = res.finalPrice || res.price;
        setGroupMinPrice(floor);
        setGroupDistanceKm(res.distanceKm ?? null);
        setGroupCustomPriceStr((prev) => {
          const current = Number(prev.replace(/\D/g, '')) || 0;
          if (!prev || current < floor) return floor.toString();
          return prev;
        });
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to estimate return trip min price:', err);
        setGroupMinPrice(null);
      })
      .finally(() => {
        if (active) setIsEstimatingGroup(false);
      });

    return () => {
      active = false;
    };
  }, [pickup.lat, pickup.long, dropoff.lat, dropoff.long, pickup.address, dropoff.address, requestedSeats]);

  // ── Retail Helpers & Allocations ────────────────────────────────────
  const groupCustomPrice = Number(groupCustomPriceStr.replace(/\D/g, '')) || 0;
  const isGroupPriceBelowFloor = groupMinPrice != null && groupCustomPrice < groupMinPrice;

  // Sum of base route prices
  const totalRetailMinPrice = retailPassengers.reduce((sum, p) => sum + (p.minPrice || 0), 0);

  // Sum of individual contract prices: custom price if configured, otherwise original route price (minPrice)
  const totalCalculatedRetailPrice = retailPassengers.reduce((sum, p) => {
    const cp = Number(p.customPriceStr.replace(/\D/g, '')) || 0;
    return sum + (p.hasCustomPrice && cp > 0 ? cp : (p.minPrice || 0));
  }, 0);

  const retailCustomPriceTotal = Number(retailTotalPriceStr.replace(/\D/g, '')) || 0;

  // Auto-adjust or default retailTotalPriceStr when calculated price changes
  React.useEffect(() => {
    if (tripMode === 'RETAIL' && totalCalculatedRetailPrice > 0) {
      setRetailTotalPriceStr((prev) => {
        const cur = Number(prev.replace(/\D/g, '')) || 0;
        if (!prev || cur < totalCalculatedRetailPrice) {
          return totalCalculatedRetailPrice.toString();
        }
        return prev;
      });
    }
  }, [tripMode, totalCalculatedRetailPrice]);

  const updateRetailPassenger = (index: number, updates: Partial<RetailPassengerItem>) => {
    setRetailPassengers((prev) => {
      const next = [...prev];
      if (index >= 0 && index < next.length) {
        next[index] = { ...next[index], ...updates };
      }
      return next;
    });
  };

  const addRetailPassenger = () => {
    if (retailPassengers.length >= 7) {
      toast({
        variant: 'destructive',
        title: 'Đạt giới hạn',
        description: 'Tối đa 7 khách lẻ trong một chuyến xe.',
      });
      return;
    }
    setRetailPassengers((prev) => [...prev, createInitialRetailPassenger()]);
  };

  const removeRetailPassenger = (index: number) => {
    if (retailPassengers.length <= 1) return;
    setRetailPassengers((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Form Submissions ────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (tripMode === 'GROUP') {
      // Validate Group Mode
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
      if (!groupCustomPrice || groupCustomPrice <= 0) {
        setErrorMessage('Vui lòng nhập giá cước cho chuyến đi.');
        return;
      }
      if (groupMinPrice != null && groupCustomPrice < groupMinPrice) {
        setErrorMessage(
          `Giá cước không được thấp hơn giá sàn tối thiểu ${fmtVnd(groupMinPrice)} (${requestedSeats} ghế ghép theo công thức).`,
        );
        return;
      }
      if (groupNeedVat) {
        if (!groupCompanyName.trim() || !groupTaxCode.trim() || !groupCompanyAddress.trim()) {
          setErrorMessage('Vui lòng điền đầy đủ Tên công ty, MST và Địa chỉ công ty để xuất hoá đơn.');
          return;
        }
      }

      const allPassengerNames = [
        customerName.trim(),
        ...companionNames.map((n) => n.trim()),
      ].filter((n) => n.length > 0);

      setSubmitting(true);
      try {
        const res = await createDriverReturnTrip({
          tripMode: 'GROUP',
          customerPhone: customerPhone.trim(),
          customerName: customerName.trim() || undefined,
          pickupAddress: pickup,
          dropoffAddress: dropoff,
          customPrice: groupCustomPrice,
          requestedSeats,
          passengerNames: allPassengerNames.length > 0 ? allPassengerNames : undefined,
          driverPhone: driverPhone.trim() || undefined,
          note: note.trim() || undefined,
          vatInfo: groupNeedVat
            ? {
                companyName: groupCompanyName.trim(),
                taxCode: groupTaxCode.trim(),
                companyAddress: groupCompanyAddress.trim(),
                invoiceEmail: groupInvoiceEmail.trim() || undefined,
              }
            : undefined,
        });

        setCreatedBooking(res);
        toast({
          title: 'Tự tạo chuyến thành công!',
          description: `Chuyến xe #${res.code || res.id.slice(0, 8).toUpperCase()} đã được nhận thành công.`,
        });

        if (typeof window !== 'undefined') {
          try {
            const w = window as any;
            if (w.VigoApp?.postMessage) {
              w.VigoApp.postMessage('return-trip-created');
            }
          } catch (_) {}
        }
      } catch (err: any) {
        console.error('Error creating group return trip:', err);
        setErrorMessage(err.message || 'Không thể tự tạo chuyến. Vui lòng thử lại.');
        toast({
          variant: 'destructive',
          title: 'Tạo chuyến thất bại',
          description: err.message || 'Vui lòng kiểm tra lại thông tin.',
        });
      } finally {
        setSubmitting(false);
      }
    } else {
      // Validate Retail Mode
      if (retailPassengers.length === 0) {
        setErrorMessage('Vui lòng thêm ít nhất một khách lẻ.');
        return;
      }

      for (let i = 0; i < retailPassengers.length; i++) {
        const p = retailPassengers[i];
        if (!p.phone.trim()) {
          setErrorMessage(`Khách lẻ #${i + 1} chưa có số điện thoại.`);
          return;
        }
        if (!p.pickup.lat || !p.pickup.long || !p.pickup.address) {
          setErrorMessage(`Khách lẻ #${i + 1} chưa chọn điểm đón hợp lệ từ gợi ý.`);
          return;
        }
        if (!p.dropoff.lat || !p.dropoff.long || !p.dropoff.address) {
          setErrorMessage(`Khách lẻ #${i + 1} chưa chọn điểm trả hợp lệ từ gợi ý.`);
          return;
        }

        if (p.hasCustomPrice) {
          const pCustom = Number(p.customPriceStr.replace(/\D/g, '')) || 0;
          if (pCustom <= 0) {
            setErrorMessage(`Vui lòng nhập giá cước riêng cho khách lẻ #${i + 1}.`);
            return;
          }
          if (p.minPrice != null && pCustom < p.minPrice) {
            setErrorMessage(
              `Giá cước của khách #${i + 1} (${fmtVnd(pCustom)}) không được thấp hơn giá sàn 1 ghế (${fmtVnd(p.minPrice)}).`,
            );
            return;
          }
        }

        if (p.needVat) {
          if (!p.companyName.trim() || !p.taxCode.trim() || !p.companyAddress.trim()) {
            setErrorMessage(`Khách lẻ #${i + 1}: Vui lòng điền đầy đủ Tên công ty, MST và Địa chỉ công ty để xuất hoá đơn.`);
            return;
          }
        }
      }

      const finalRetailPrice = Math.max(retailCustomPriceTotal, totalCalculatedRetailPrice);
      if (finalRetailPrice <= 0) {
        setErrorMessage('Vui lòng nhập tổng giá cước chuyến đi.');
        return;
      }

      const retailPassengersPayload: RetailPassengerInput[] = retailPassengers.map((p) => {
        const pCustom = Number(p.customPriceStr.replace(/\D/g, '')) || 0;
        // Giá hợp đồng: nếu cấu hình riêng thì lấy giá riêng, ngược lại lấy giá gốc của chặng (minPrice)
        const pFinalPrice = p.hasCustomPrice && pCustom > 0 ? pCustom : (p.minPrice || 0);
        return {
          name: p.name.trim() || undefined,
          phone: p.phone.trim(),
          pickupAddress: p.pickup,
          dropoffAddress: p.dropoff,
          seats: 1,
          hasCustomPrice: p.hasCustomPrice,
          price: pFinalPrice,
          minPrice: p.minPrice ?? undefined,
          needVat: p.needVat,
          vatInfo: p.needVat
            ? {
                companyName: p.companyName.trim(),
                taxCode: p.taxCode.trim(),
                companyAddress: p.companyAddress.trim(),
                invoiceEmail: p.invoiceEmail.trim() || undefined,
              }
            : undefined,
        };
      });

      setSubmitting(true);
      try {
        const res = await createDriverReturnTrip({
          tripMode: 'RETAIL',
          customPrice: finalRetailPrice,
          driverPhone: driverPhone.trim() || undefined,
          note: retailNote.trim() || undefined,
          retailPassengers: retailPassengersPayload,
        });

        setCreatedBooking(res);
        toast({
          title: 'Tự tạo chuyến thành công!',
          description: `Chuyến xe #${res.code || res.id.slice(0, 8).toUpperCase()} với ${retailPassengers.length} khách lẻ đã được nhận thành công.`,
        });

        if (typeof window !== 'undefined') {
          try {
            const w = window as any;
            if (w.VigoApp?.postMessage) {
              w.VigoApp.postMessage('return-trip-created');
            }
          } catch (_) {}
        }
      } catch (err: any) {
        console.error('Error creating retail return trip:', err);
        setErrorMessage(err.message || 'Không thể tự tạo chuyến khách lẻ. Vui lòng thử lại.');
        toast({
          variant: 'destructive',
          title: 'Tạo chuyến thất bại',
          description: err.message || 'Vui lòng kiểm tra lại thông tin.',
        });
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleDownloadContract = async (bookingId: string, passengerIndex?: number) => {
    try {
      setDownloadingContractIndex(passengerIndex !== undefined ? passengerIndex : 'all');
      await downloadBookingContractPdf(bookingId, passengerIndex);
      toast({
        title: 'Tải hợp đồng thành công',
        description:
          passengerIndex !== undefined
            ? `Hợp đồng khách lẻ #${passengerIndex + 1} đã được tải về.`
            : 'Hợp đồng điện tử đã được tải về.',
      });
    } catch (err: any) {
      console.error('Download contract failed:', err);
      toast({
        variant: 'destructive',
        title: 'Lỗi tải hợp đồng',
        description: err.message || 'Không thể tải hợp đồng lúc này.',
      });
    } finally {
      setDownloadingContractIndex(null);
    }
  };

  const handleResetForm = () => {
    setCreatedBooking(null);
    setErrorMessage(null);
    setCustomerPhone('');
    setCustomerName('');
    setRequestedSeats(1);
    setCompanionNames([]);
    setNote('');
    setPickup(emptyPoint());
    setDropoff(emptyPoint());
    setGroupMinPrice(null);
    setGroupDistanceKm(null);
    setGroupCustomPriceStr('');
    setGroupNeedVat(false);
    setGroupCompanyName('');
    setGroupTaxCode('');
    setGroupCompanyAddress('');
    setGroupInvoiceEmail('');

    setRetailPassengers([createInitialRetailPassenger()]);
    setRetailNote('');
    setRetailTotalPriceStr('');
  };

  // ── SUCCESS VIEW ─────────────────────────────────────────────────────
  if (createdBooking) {
    const isRetailTrip =
      createdBooking.tripMode === 'RETAIL' ||
      (Array.isArray(createdBooking.retailPassengers) && createdBooking.retailPassengers.length > 0);

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="border-green-500/30 bg-green-500/5 shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/50 dark:text-green-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle className="text-2xl font-bold text-green-700 dark:text-green-400">
              Tự tạo chuyến thành công!
            </CardTitle>
            <CardDescription className="text-sm">
              {isRetailTrip
                ? `Chuyến xe khách lẻ ghép (${createdBooking.retailPassengers?.length} khách) đã được gán trực tiếp cho tài xế.`
                : 'Chuyến xe đã được tự động nhận và xếp cho tài xế.'}
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
                <span className="text-muted-foreground">Hình thức:</span>
                <Badge variant={isRetailTrip ? 'secondary' : 'outline'} className="font-medium">
                  {isRetailTrip ? 'Khách lẻ ghép chuyến' : 'Khách hàng đi chung'}
                </Badge>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground">Trạng thái:</span>
                <Badge className="bg-emerald-600 hover:bg-emerald-700">Đã nhận (ACCEPTED)</Badge>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground">Tổng giá cước:</span>
                <span className="font-bold text-lg text-emerald-600">
                  {fmtVnd(createdBooking.price)}
                </span>
              </div>
              <div className="flex justify-between items-center border-b pb-2">
                <span className="text-muted-foreground">Hình thức thanh toán:</span>
                <Badge variant="outline" className="font-normal">Tiền mặt (CASH)</Badge>
              </div>

              {/* GROUP TRIP SUMMARY */}
              {!isRetailTrip && (
                <>
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-muted-foreground">Khách hàng:</span>
                    <span className="font-medium">
                      {createdBooking.customerName || 'Khách vãng lai'} ({createdBooking.customerPhone || customerPhone})
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-muted-foreground">Số lượng khách / Ghế:</span>
                    <Badge variant="secondary" className="font-semibold">
                      {createdBooking.requestedSeats || requestedSeats} ghế
                    </Badge>
                  </div>
                  <div className="space-y-2 pt-1 border-b pb-2">
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
                    <div className="rounded-md bg-muted/50 p-2.5 text-xs space-y-1">
                      <div className="font-semibold flex items-center gap-1">
                        <Receipt className="h-3.5 w-3.5" /> Hoá đơn VAT gộp:
                      </div>
                      <div>Công ty: {createdBooking.vatInfo.companyName}</div>
                      <div>MST: {createdBooking.vatInfo.taxCode}</div>
                      {createdBooking.vatInfo.invoiceEmail && <div>Email: {createdBooking.vatInfo.invoiceEmail}</div>}
                    </div>
                  )}

                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadContract(createdBooking.id)}
                      disabled={downloadingContractIndex === 'all'}
                      className="w-full gap-2 text-xs font-semibold"
                    >
                      {downloadingContractIndex === 'all' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-primary" />
                      )}
                      Tải hợp đồng điện tử (PDF)
                    </Button>
                  </div>
                </>
              )}

              {/* RETAIL TRIP SUMMARY & INDIVIDUAL CONTRACTS */}
              {isRetailTrip && createdBooking.retailPassengers && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">
                      Danh sách {createdBooking.retailPassengers.length} khách lẻ & hợp đồng riêng:
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadContract(createdBooking.id)}
                      disabled={downloadingContractIndex === 'all'}
                      className="h-7 text-xs gap-1.5"
                    >
                      {downloadingContractIndex === 'all' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                      Tải toàn bộ hợp đồng
                    </Button>
                  </div>

                  <div className="space-y-2.5">
                    {createdBooking.retailPassengers.map((p, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs hover:border-primary/40 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-foreground">
                            Khách #{idx + 1}: {p.name || 'Khách hàng'} - {p.phone}
                          </span>
                          <span className="font-bold text-emerald-600 text-sm">
                            {fmtVnd(p.price)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-1 text-muted-foreground text-[11px]">
                          <div className="flex items-center gap-1">
                            {p.hasCustomPrice ? (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-primary border-primary/40">
                                Giá riêng
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                                Giá gốc chặng
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-start gap-1">
                            <span className="text-emerald-600 font-medium shrink-0">Đón:</span>
                            <span className="truncate">{p.pickupAddress?.address}</span>
                          </div>
                          <div className="flex items-start gap-1">
                            <span className="text-rose-600 font-medium shrink-0">Trả:</span>
                            <span className="truncate">{p.dropoffAddress?.address}</span>
                          </div>
                        </div>

                        {p.needVat && p.vatInfo && (
                          <div className="rounded bg-background/80 p-1.5 border text-[11px] space-y-0.5">
                            <div className="font-medium text-foreground flex items-center gap-1">
                              <Receipt className="h-3 w-3 text-primary" /> VAT: {p.vatInfo.companyName}
                            </div>
                            <div className="text-muted-foreground">MST: {p.vatInfo.taxCode}</div>
                          </div>
                        )}

                        <div className="pt-1 flex justify-end">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownloadContract(createdBooking.id, idx)}
                            disabled={downloadingContractIndex === idx}
                            className="h-7 text-xs gap-1.5 font-medium"
                          >
                            {downloadingContractIndex === idx ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3 text-primary" />
                            )}
                            Tải HĐ riêng khách #{idx + 1}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
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
              <Button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    const w = window as any;
                    if (w.VigoApp?.postMessage) {
                      w.VigoApp.postMessage(
                        createdBooking?.id
                          ? `open-booking:${createdBooking.id}`
                          : 'close',
                      );
                      return;
                    }
                  }
                  router.push('/agent-portal/dashboard');
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2 shadow-sm"
              >
                <Home className="h-4 w-4" /> Về trang chủ nhận khách
              </Button>
              <Button onClick={handleResetForm} variant="outline" className="w-full gap-2">
                <RotateCcw className="h-4 w-4" /> Tự tạo chuyến khác
              </Button>
              <Button
                onClick={() => router.push('/agent-portal/orders')}
                variant="ghost"
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

  // ── MAIN FORM VIEW ───────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Car className="h-6 w-6 text-primary" /> Tự tạo chuyến
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tài xế tự tạo cuốc cho chính mình với giá cước thoả thuận, tối thiểu bằng giá 1 ghế ghép.
        </p>
      </div>

      {/* Tabs Mode Selector */}
      <Tabs
        value={tripMode}
        onValueChange={(v) => {
          setTripMode(v as 'GROUP' | 'RETAIL');
          setErrorMessage(null);
        }}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-muted/60">
          <TabsTrigger
            value="GROUP"
            className="text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow"
          >
            <Users className="h-4 w-4" />
            Khách hàng đi chung
          </TabsTrigger>
          <TabsTrigger
            value="RETAIL"
            className="text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow"
          >
            <Split className="h-4 w-4" />
            Khách lẻ (Nhiều khách)
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Driver assignment (common to both modes) */}
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

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* MODE 1: KHÁCH HÀNG ĐI CHUNG                                      */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {tripMode === 'GROUP' && (
          <div className="space-y-5">
            {/* Customer info */}
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

                {/* Passenger count / seats selector */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      Số lượng khách / Số ghế <span className="text-rose-500">*</span>
                    </Label>
                    <span className="text-xs font-semibold text-primary">
                      {requestedSeats} khách ({requestedSeats} ghế)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex rounded-md border p-1 bg-muted/40 gap-1 flex-1">
                      {[1, 2, 3, 4].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setRequestedSeats(num)}
                          className={cn(
                            'flex-1 py-1.5 text-xs font-medium rounded transition-colors',
                            requestedSeats === num
                              ? 'bg-background text-foreground shadow-sm font-semibold'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {num} khách
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center border rounded-md h-9 px-1 bg-background shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-sm"
                        disabled={requestedSeats <= 1}
                        onClick={() => setRequestedSeats((s) => Math.max(1, s - 1))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-7 text-center text-sm font-bold">{requestedSeats}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-sm"
                        disabled={requestedSeats >= 7}
                        onClick={() => setRequestedSeats((s) => Math.min(7, s + 1))}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {requestedSeats > 1 && (
                    <div className="space-y-2 pt-2">
                      <Label className="text-[11px] text-muted-foreground">
                        Tên các khách đi cùng (tuỳ chọn):
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {companionNames.map((name, idx) => (
                          <Input
                            key={idx}
                            placeholder={`Khách ${idx + 2} (người đi cùng)`}
                            value={name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCompanionNames((prev) => {
                                const next = [...prev];
                                next[idx] = val;
                                return next;
                              });
                            }}
                            className="h-8 text-xs"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 pt-1">
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

            {/* Route */}
            <Card className="overflow-visible">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> Lộ trình di chuyển
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 overflow-visible">
                <div className="space-y-1.5 relative z-20">
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

                <div className="space-y-1.5 relative z-10">
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

                {(isEstimatingGroup || groupMinPrice != null) && (
                  <div className="rounded-lg bg-muted/60 p-3.5 border text-sm space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Khoảng cách ước tính:</span>
                      <span className="font-semibold text-foreground">
                        {isEstimatingGroup ? (
                          <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                        ) : groupDistanceKm != null ? (
                          `${groupDistanceKm.toFixed(1)} km`
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Giá sàn tối thiểu ({requestedSeats} ghế ghép):
                      </span>
                      <span className="text-base font-bold text-primary">
                        {isEstimatingGroup ? (
                          <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tính...
                          </span>
                        ) : (
                          fmtVnd(groupMinPrice)
                        )}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Hệ thống không cho phép nhập giá thấp hơn giá sàn của {requestedSeats} ghế xe ghép theo công thức định giá.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Agreed Price & Payment */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" /> Giá cước & Thanh toán
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="groupCustomPrice" className="text-xs font-medium">
                      Giá cước thoả thuận (VNĐ) <span className="text-rose-500">*</span>
                    </Label>
                    {groupMinPrice != null && (
                      <button
                        type="button"
                        onClick={() => setGroupCustomPriceStr(groupMinPrice.toString())}
                        className="text-xs text-primary hover:underline"
                      >
                        Điền giá sàn ({fmtVnd(groupMinPrice)})
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="groupCustomPrice"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={
                        groupCustomPrice > 0
                          ? groupCustomPrice.toLocaleString('vi-VN')
                          : groupCustomPriceStr
                      }
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        setGroupCustomPriceStr(raw);
                      }}
                      className={`text-lg font-bold pr-10 ${
                        isGroupPriceBelowFloor ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">
                      ₫
                    </span>
                  </div>

                  {isGroupPriceBelowFloor && (
                    <p className="text-xs font-medium text-rose-500 flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Giá bạn nhập ({fmtVnd(groupCustomPrice)}) thấp hơn giá sàn tối thiểu ({fmtVnd(groupMinPrice)}).
                    </p>
                  )}

                  {groupMinPrice != null && (
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {[0, 20000, 50000, 100000].map((delta) => {
                        const target = groupMinPrice + delta;
                        return (
                          <Button
                            key={delta}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setGroupCustomPriceStr(target.toString())}
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

            {/* VAT Invoice (gộp chung cho cả đoàn đi chung) */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-primary" /> Xuất hoá đơn VAT (Gộp)
                  </CardTitle>
                  <Switch checked={groupNeedVat} onCheckedChange={setGroupNeedVat} />
                </div>
                <CardDescription className="text-xs">
                  Bật nếu khách hàng yêu cầu công ty xuất hoá đơn điện tử gộp cho toàn bộ cuốc xe.
                </CardDescription>
              </CardHeader>
              {groupNeedVat && (
                <CardContent className="space-y-3 pt-0 border-t mt-3">
                  <div className="space-y-1.5 pt-3">
                    <Label htmlFor="groupCompanyName" className="text-xs font-medium">
                      Tên công ty / Đơn vị <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="groupCompanyName"
                      placeholder="Công ty TNHH..."
                      value={groupCompanyName}
                      onChange={(e) => setGroupCompanyName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="groupTaxCode" className="text-xs font-medium">
                        Mã số thuế (MST) <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        id="groupTaxCode"
                        placeholder="0123456789"
                        value={groupTaxCode}
                        onChange={(e) => setGroupTaxCode(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="groupInvoiceEmail" className="text-xs font-medium">
                        Email nhận hoá đơn
                      </Label>
                      <Input
                        id="groupInvoiceEmail"
                        type="email"
                        placeholder="ketoan@congty.com"
                        value={groupInvoiceEmail}
                        onChange={(e) => setGroupInvoiceEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="groupCompanyAddress" className="text-xs font-medium">
                      Địa chỉ công ty <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="groupCompanyAddress"
                      placeholder="Số nhà, đường, phường, quận, tỉnh/thành..."
                      value={groupCompanyAddress}
                      onChange={(e) => setGroupCompanyAddress(e.target.value)}
                    />
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* MODE 2: KHÁCH LẺ (NHIỀU KHÁCH, ĐIỂM ĐÓN/TRẢ RIÊNG, HĐ RIÊNG)     */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {tripMode === 'RETAIL' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Danh sách khách lẻ ({retailPassengers.length})
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRetailPassenger}
                disabled={retailPassengers.length >= 7}
                className="h-8 gap-1.5 text-xs text-primary font-semibold"
              >
                <UserPlus className="h-3.5 w-3.5" /> Thêm khách lẻ
              </Button>
            </div>

            {/* Render each Retail Passenger Card */}
            {retailPassengers.map((p, idx) => (
              <RetailPassengerCard
                key={p.id}
                index={idx}
                totalPassengers={retailPassengers.length}
                passenger={p}
                onUpdate={(updates) => updateRetailPassenger(idx, updates)}
                onRemove={() => removeRetailPassenger(idx)}
              />
            ))}

            {/* Trip-level Note */}
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="space-y-1.5">
                  <Label htmlFor="retailNote" className="text-xs font-medium">
                    Ghi chú chung chuyến đi (tuỳ chọn)
                  </Label>
                  <Textarea
                    id="retailNote"
                    rows={2}
                    placeholder="Ghi chú về thứ tự đón trả, hành lý, lộ trình..."
                    value={retailNote}
                    onChange={(e) => setRetailNote(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Retail Total Price & Contract Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-primary" /> Tổng giá cước & Hợp đồng từng khách
                </CardTitle>
                <CardDescription className="text-xs">
                  Giá ghi nhận trên từng hợp đồng giữ nguyên giá gốc theo chặng của khách. Nếu cần, tài xế có thể cấu hình giá riêng cho từng người.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Total floor indicator */}
                <div className="rounded-lg bg-muted/60 p-3.5 border text-sm space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Tổng số khách:</span>
                    <span className="font-semibold text-foreground">
                      {retailPassengers.length} khách (mỗi khách 1 ghế)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Tổng giá cước chuyến đi:
                    </span>
                    <span className="text-base font-bold text-primary">
                      {fmtVnd(totalCalculatedRetailPrice)}
                    </span>
                  </div>
                </div>

                {/* Overall price input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="retailTotalPrice" className="text-xs font-medium">
                      Tổng giá cước chuyến đi (VNĐ) <span className="text-rose-500">*</span>
                    </Label>
                    {totalCalculatedRetailPrice > 0 && (
                      <button
                        type="button"
                        onClick={() => setRetailTotalPriceStr(totalCalculatedRetailPrice.toString())}
                        className="text-xs text-primary hover:underline"
                      >
                        Điền tổng tiền ({fmtVnd(totalCalculatedRetailPrice)})
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="retailTotalPrice"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={
                        retailCustomPriceTotal > 0
                          ? retailCustomPriceTotal.toLocaleString('vi-VN')
                          : retailTotalPriceStr
                      }
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        setRetailTotalPriceStr(raw);
                      }}
                      className={`text-lg font-bold pr-10 ${
                        totalRetailMinPrice > 0 && retailCustomPriceTotal < totalRetailMinPrice
                          ? 'border-rose-500 focus-visible:ring-rose-500'
                          : ''
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">
                      ₫
                    </span>
                  </div>

                  {totalRetailMinPrice > 0 && retailCustomPriceTotal < totalRetailMinPrice && (
                    <p className="text-xs font-medium text-rose-500 flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Tổng giá nhập ({fmtVnd(retailCustomPriceTotal)}) thấp hơn tổng giá sàn ({fmtVnd(totalRetailMinPrice)}).
                    </p>
                  )}

                  {totalRetailMinPrice > 0 && (
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {[0, 20000, 50000, 100000, 200000].map((delta) => {
                        const target = totalCalculatedRetailPrice + delta;
                        return (
                          <Button
                            key={delta}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setRetailTotalPriceStr(target.toString())}
                          >
                            {delta === 0 ? 'Bằng tổng tính' : `+${(delta / 1000).toFixed(0)}k (${(target / 1000).toFixed(0)}k)`}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Contract Price List */}
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Giá ghi nhận trên từng hợp đồng:
                  </Label>
                  <div className="rounded-md border divide-y bg-card text-xs">
                    {retailPassengers.map((p, idx) => {
                      const pCustom = Number(p.customPriceStr.replace(/\D/g, '')) || 0;
                      const pEffective = p.hasCustomPrice && pCustom > 0 ? pCustom : (p.minPrice || 0);

                      return (
                        <div key={idx} className="p-2.5 flex items-center justify-between">
                          <div>
                            <div className="font-medium">
                              Khách #{idx + 1}: {p.name || p.phone || '(Chưa nhập)'}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {p.hasCustomPrice ? (
                                <span className="text-primary font-medium">Giá riêng tự cấu hình</span>
                              ) : (
                                <span>Giá gốc theo chặng đón/trả</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-sm text-emerald-600">
                              {pEffective > 0 ? fmtVnd(pEffective) : '—'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
          </div>
        )}

        {/* Submit action */}
        <div className="pt-2">
          <Button
            type="submit"
            size="lg"
            className="w-full text-base font-semibold shadow-lg"
            disabled={
              submitting ||
              (tripMode === 'GROUP' && (isGroupPriceBelowFloor || isEstimatingGroup)) ||
              (tripMode === 'RETAIL' && totalRetailMinPrice > 0 && retailCustomPriceTotal < totalRetailMinPrice)
            }
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Đang tạo và nhận chuyến...
              </>
            ) : (
              <>
                {tripMode === 'RETAIL'
                  ? `Tự tạo chuyến cho ${retailPassengers.length} khách lẻ`
                  : 'Tự tạo và nhận chuyến'}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── RETAIL PASSENGER CARD COMPONENT ────────────────────────────────────
function RetailPassengerCard({
  index,
  totalPassengers,
  passenger,
  onUpdate,
  onRemove,
}: {
  index: number;
  totalPassengers: number;
  passenger: RetailPassengerItem;
  onUpdate: (updates: Partial<RetailPassengerItem>) => void;
  onRemove: () => void;
}) {
  const { pickup, dropoff } = passenger;
  const onUpdateRef = React.useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  // Auto-estimate floor price when pickup/dropoff change (1 seat by default)
  React.useEffect(() => {
    if (!pickup.lat || !pickup.long || !dropoff.lat || !dropoff.long) {
      onUpdateRef.current({ minPrice: null, distanceKm: null, isEstimating: false });
      return;
    }

    let active = true;
    onUpdateRef.current({ isEstimating: true });

    estimateTripPrice({
      pickup: { address: pickup.address, lat: pickup.lat, long: pickup.long },
      dropoff: { address: dropoff.address, lat: dropoff.lat, long: dropoff.long },
      serviceType: 'CARPOOL',
      requestedSeats: 1,
    })
      .then((res) => {
        if (!active) return;
        const floor = res.finalPrice || res.price;
        onUpdateRef.current({
          minPrice: floor,
          distanceKm: res.distanceKm ?? null,
          isEstimating: false,
        });
      })
      .catch((err) => {
        if (!active) return;
        console.error(`Failed to estimate retail price for passenger ${index + 1}:`, err);
        onUpdateRef.current({ minPrice: null, isEstimating: false });
      });

    return () => {
      active = false;
    };
  }, [pickup.lat, pickup.long, pickup.address, dropoff.lat, dropoff.long, dropoff.address, index]);

  const pCustomPrice = Number(passenger.customPriceStr.replace(/\D/g, '')) || 0;
  const isCustomBelowFloor =
    passenger.hasCustomPrice &&
    passenger.minPrice != null &&
    pCustomPrice < passenger.minPrice;

  return (
    <Card className="border-primary/20 shadow-sm overflow-visible">
      <CardHeader className="pb-3 bg-muted/20 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <span className="flex h-6 w-6 rounded-full bg-primary/10 text-primary items-center justify-center text-xs font-bold">
              {index + 1}
            </span>
            <span>Khách lẻ #{index + 1}</span>
            {passenger.hasCustomPrice && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-primary border-primary/40">
                Giá riêng
              </Badge>
            )}
            {passenger.needVat && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-emerald-600 border-emerald-600/40">
                VAT
              </Badge>
            )}
          </CardTitle>

          {totalPassengers > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="h-7 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 px-2 gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" /> Xoá khách
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4 overflow-visible">
        {/* Passenger Contact Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Số điện thoại khách <span className="text-rose-500">*</span>
            </Label>
            <Input
              type="tel"
              placeholder="0987654321"
              value={passenger.phone}
              onChange={(e) => onUpdate({ phone: e.target.value })}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Tên khách hàng (tuỳ chọn)
            </Label>
            <Input
              placeholder="Anh Tuấn, Chị Hoa..."
              value={passenger.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="h-9"
            />
          </div>
        </div>

        {/* Individual Route */}
        <div className="space-y-3 pt-2 border-t overflow-visible">
          <div className="space-y-1 relative z-20">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              Điểm đón của khách #{index + 1} <span className="text-rose-500">*</span>
            </Label>
            <AddressAutocomplete
              value={passenger.pickup.address}
              placeholder="Tìm địa chỉ đón..."
              onSelect={(data) => onUpdate({ pickup: data })}
              onClear={() => onUpdate({ pickup: emptyPoint() })}
            />
          </div>

          <div className="space-y-1 relative z-10">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <span className="flex h-2 w-2 rounded-full bg-rose-500" />
              Điểm trả của khách #{index + 1} <span className="text-rose-500">*</span>
            </Label>
            <AddressAutocomplete
              value={passenger.dropoff.address}
              placeholder="Tìm địa chỉ trả..."
              onSelect={(data) => onUpdate({ dropoff: data })}
              onClear={() => onUpdate({ dropoff: emptyPoint() })}
            />
          </div>

          {/* Passenger Floor Price Display */}
          {(passenger.isEstimating || passenger.minPrice != null) && (
            <div className="rounded-md bg-muted/50 p-2.5 border text-xs flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                {passenger.isEstimating && <Loader2 className="h-3 w-3 animate-spin" />}
                Giá gốc chặng này (1 ghế):
              </span>
              <span className="font-bold text-primary">
                {passenger.isEstimating ? 'Đang tính...' : fmtVnd(passenger.minPrice)}
              </span>
            </div>
          )}
        </div>

        {/* Individual Price Switch */}
        <div className="pt-2 border-t space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-primary" />
                Cấu hình giá riêng cho khách này
              </div>
              <div className="text-[11px] text-muted-foreground">
                Gạt bật để đặt giá riêng; nếu tắt, giá hợp đồng mặc định là giá gốc theo chặng ({fmtVnd(passenger.minPrice)}).
              </div>
            </div>
            <Switch
              checked={passenger.hasCustomPrice}
              onCheckedChange={(checked) => {
                onUpdate({
                  hasCustomPrice: checked,
                  customPriceStr:
                    checked && !passenger.customPriceStr && passenger.minPrice
                      ? passenger.minPrice.toString()
                      : passenger.customPriceStr,
                });
              }}
            />
          </div>

          {passenger.hasCustomPrice ? (
            <div className="space-y-2 rounded-md bg-muted/20 p-3 border">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">
                  Giá cước riêng của khách #{index + 1} (VNĐ) <span className="text-rose-500">*</span>
                </Label>
                {passenger.minPrice != null && (
                  <button
                    type="button"
                    onClick={() => onUpdate({ customPriceStr: passenger.minPrice!.toString() })}
                    className="text-xs text-primary hover:underline"
                  >
                    Điền sàn ({fmtVnd(passenger.minPrice)})
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={
                    pCustomPrice > 0
                      ? pCustomPrice.toLocaleString('vi-VN')
                      : passenger.customPriceStr
                  }
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    onUpdate({ customPriceStr: raw });
                  }}
                  className={`text-base font-bold pr-8 h-9 ${
                    isCustomBelowFloor ? 'border-rose-500 focus-visible:ring-rose-500' : ''
                  }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">
                  ₫
                </span>
              </div>

              {isCustomBelowFloor && (
                <p className="text-[11px] font-medium text-rose-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Giá ({fmtVnd(pCustomPrice)}) không được thấp hơn giá sàn 1 ghế ({fmtVnd(passenger.minPrice)}).
                </p>
              )}

              {passenger.minPrice != null && (
                <div className="flex gap-1.5 pt-1 flex-wrap">
                  {[0, 20000, 50000, 100000].map((delta) => {
                    const target = passenger.minPrice! + delta;
                    return (
                      <Button
                        key={delta}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] px-2"
                        onClick={() => onUpdate({ customPriceStr: target.toString() })}
                      >
                        {delta === 0 ? 'Bằng sàn' : `+${(delta / 1000).toFixed(0)}k`}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground flex items-center justify-between">
              <span>Giá ghi nhận trên hợp đồng (giá gốc chặng):</span>
              <span className="font-semibold text-foreground">
                {fmtVnd(passenger.minPrice)}
              </span>
            </div>
          )}
        </div>

        {/* Individual VAT Switch */}
        <div className="pt-2 border-t space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-primary" />
                Xuất hoá đơn VAT riêng cho khách này
              </div>
              <div className="text-[11px] text-muted-foreground">
                Bật nếu khách này yêu cầu xuất hoá đơn công ty riêng.
              </div>
            </div>
            <Switch
              checked={passenger.needVat}
              onCheckedChange={(checked) => onUpdate({ needVat: checked })}
            />
          </div>

          {passenger.needVat && (
            <div className="space-y-2.5 rounded-md bg-muted/20 p-3 border text-xs">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium">
                  Tên công ty / Đơn vị <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="Công ty TNHH..."
                  value={passenger.companyName}
                  onChange={(e) => onUpdate({ companyName: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">
                    Mã số thuế (MST) <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    placeholder="0123456789"
                    value={passenger.taxCode}
                    onChange={(e) => onUpdate({ taxCode: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-medium">Email nhận hoá đơn</Label>
                  <Input
                    type="email"
                    placeholder="ketoan@congty.com"
                    value={passenger.invoiceEmail}
                    onChange={(e) => onUpdate({ invoiceEmail: e.target.value })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-medium">
                  Địa chỉ công ty <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="Số nhà, đường, phường, quận, tỉnh/thành..."
                  value={passenger.companyAddress}
                  onChange={(e) => onUpdate({ companyAddress: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
