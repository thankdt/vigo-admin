'use client';

import * as React from 'react';
import { Loader2, Plus, Phone, User, Users, MapPin, Car, Clock, Calculator, CheckCircle2, UserPlus, Search, X, Ticket, ArrowUpDown } from 'lucide-react';
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
import { createAdminBooking, createAgentBooking, getAvailableDrivers, lookupCustomerByPhone, estimateTripPrice, getVouchers } from '@/lib/api';
import type { Driver, Promotion } from '@/lib/types';
import { isValidVnPhoneOrEmpty, normalizeVnPhone, sameVnPhone } from '@/lib/phone';
import { getImageUrl } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AddressAutocomplete } from './address-autocomplete';
import { fmtVnd, isVoucherSelectable, voucherLabel } from './voucher-utils';
import { validateWindow, toIso, formatLocal } from './schedule-utils';
import { DriverCommitmentBadge } from './driver-commitment-badge';
import { isVehicleTypeApplicable, resolveRequestedVehicleType } from './vehicle-type-utils';
import type { BookingDraft } from './duplicate-utils';

interface CreateBookingDialogProps {
  onSuccess: () => void;
  // 'agent' = đặt hộ portal: no admin customer-lookup / driver-assign; posts to /agent/bookings
  // (agentUserId from the JWT) → commission credited to the agent at COMPLETE.
  mode?: 'admin' | 'agent';
  // Controlled mode — dùng khi mở từ "Nhân bản chuyến". Truyền `open` thì cha giữ
  // state mở/đóng và dialog KHÔNG render nút trigger (tránh 2 nút "Tạo chuyến").
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Bản nháp điền sẵn (nhân bản chuyến). Áp đúng một lần cho mỗi lần mở dialog.
  initial?: BookingDraft | null;
}

interface AddressData {
  address: string;
  lat: number;
  long: number;
}

export function CreateBookingDialog({
  onSuccess,
  mode = 'admin',
  open: controlledOpen,
  onOpenChange,
  initial = null,
}: CreateBookingDialogProps) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = React.useCallback((v: boolean) => {
    if (isControlled) onOpenChange?.(v);
    else setInternalOpen(v);
  }, [isControlled, onOpenChange]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { toast } = useToast();
  // Chống response cũ đè kết quả mới (SĐT đổi giữa chừng / giá tính lại liên tiếp).
  const lookupSeqRef = React.useRef(0);
  const estimateSeqRef = React.useRef(0);

  // Form state
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  // Phone-first flow: name stays locked until the phone is checked.
  //   idle → chưa kiểm tra | checking | existing (khách cũ, khoá tên) | new (khách mới, bắt nhập tên)
  // Agent mode has no admin phone-lookup → start in 'new' so the name field is open + submit-ready.
  const [customerStatus, setCustomerStatus] = React.useState<'idle' | 'checking' | 'existing' | 'new'>(mode === 'agent' ? 'new' : 'idle');
  const [pickup, setPickup] = React.useState<AddressData | null>(null);
  const [dropoff, setDropoff] = React.useState<AddressData | null>(null);
  // AddressAutocomplete trả lat/long = 0 khi không resolve được place detail (lỗi
  // mạng/quota) → phải coi như CHƯA có toạ độ, nếu không chuyến sẽ được định vị
  // ngoài vịnh Guinea (giá theo quãng đường + dispatch đều sai).
  const hasCoords = (p: AddressData | null) => !!p && !(p.lat === 0 && p.long === 0);
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
  // SĐT người đi cùng (tuỳ chọn, MỘT số / chuyến) — để tài xế biết gọi cho ai.
  // KHÔNG chặn submit khi sai: backend âm thầm bỏ số sai định dạng và lưu null
  // khi trùng SĐT khách, nên ở đây chỉ cảnh báo tại chỗ.
  const [companionPhone, setCompanionPhone] = React.useState('');
  const companionPhoneValid = isValidVnPhoneOrEmpty(companionPhone);
  const companionPhoneIsCustomer = sameVnPhone(companionPhone, customerPhone);

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
  const [vouchersLoaded, setVouchersLoaded] = React.useState(false);
  const [vouchersError, setVouchersError] = React.useState(false);
  const [selectedPromotionId, setSelectedPromotionId] = React.useState<number | null>(null);
  // Wrap the predicate — passing it straight to filter would feed the array
  // index in as the `now` argument and break the date-window check.
  const selectableVouchers = React.useMemo(() => vouchers.filter((v) => isVoucherSelectable(v)), [vouchers]);
  const clearEstimate = () => { setPriceEstimate(null); setEstimateOriginal(null); };

  // `phoneOverride` cho luồng nhân bản: state SĐT vừa set trong cùng tick nên
  // closure chưa thấy giá trị mới → truyền thẳng vào.
  // `fallbackName`: khách của chuyến gốc có thể đã bị xoá mềm → lookup trả "mới";
  // giữ lại tên đã chép thay vì bắt admin gõ lại.
  const checkCustomer = async (phoneOverride?: string, fallbackName?: string) => {
    const phone = phoneOverride ?? customerPhone;
    if (!phone || phone.length < 10) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Nhập SĐT hợp lệ (≥10 số) trước khi kiểm tra.' });
      return;
    }
    // Bỏ kết quả cũ: admin sửa SĐT trong lúc lookup đang bay thì response trước đó
    // KHÔNG được đè tên/trạng thái của SĐT mới (đã từng tạo khách mới mang tên
    // người khác lên hợp đồng).
    const seq = ++lookupSeqRef.current;
    setCustomerStatus('checking');
    try {
      const res = await lookupCustomerByPhone(phone);
      if (seq !== lookupSeqRef.current) return;
      if (res.exists) {
        setCustomerName(res.fullName ?? '');
        setCustomerStatus('existing');
      } else {
        setCustomerName(fallbackName ?? '');
        setCustomerStatus('new');
      }
    } catch (err: any) {
      if (seq !== lookupSeqRef.current) return;
      setCustomerStatus('idle');
      toast({ variant: 'destructive', title: 'Không kiểm tra được SĐT', description: err.message });
    }
  };

  const handleEstimate = async (silent = false) => {
    if (!pickup || !dropoff) {
      if (!silent) toast({ variant: 'destructive', title: 'Lỗi', description: 'Chọn điểm đón và điểm trả trước khi tính giá.' });
      return;
    }
    // Debounce chỉ huỷ timer, không huỷ request đang bay → response chậm của cấu
    // hình cũ có thể resolve sau và hiển thị giá sai để admin báo khách.
    const seq = ++estimateSeqRef.current;
    setEstimating(true);
    try {
      const res = await estimateTripPrice({
        pickup: { address: pickup.address, lat: pickup.lat, long: pickup.long },
        dropoff: { address: dropoff.address, lat: dropoff.lat, long: dropoff.long },
        serviceType,
        requestedVehicleType: resolveRequestedVehicleType(serviceType, vehicleType),
        requestedSeats: showPassengerFields ? totalPassengers : undefined,
        promotionId: selectedPromotionId ?? undefined,
        // Chuyến đặt lịch → tính phụ phí theo NGÀY ĐI (đầu khung giờ), không phải
        // ngày đặt. Đi ngay → bỏ trống, backend dùng hiện tại.
        departureTime: isScheduled && scheduledFrom ? toIso(scheduledFrom) : undefined,
      });
      if (seq !== estimateSeqRef.current) return;
      const final = res.finalPrice ?? res.price;
      setPriceEstimate(final);
      setEstimateOriginal(res.priceBeforeDiscount ?? final);
    } catch (err: any) {
      if (seq !== estimateSeqRef.current) return;
      clearEstimate();
      if (!silent) toast({ variant: 'destructive', title: 'Tính giá thất bại', description: err.message });
    } finally {
      // Chỉ lần tính mới nhất được tắt spinner — lần cũ resolve sau không được
      // báo "xong" trong khi lần mới còn đang chạy.
      if (seq === estimateSeqRef.current) setEstimating(false);
    }
  };

  // Scheduled-trip state. Pickup WINDOW [from, to] — raw <input
  // type="datetime-local"> values (no timezone suffix). Converted to ISO at
  // submit. Default to from=+30m / to=+60m when the operator toggles on.
  const [isScheduled, setIsScheduled] = React.useState(false);
  const [scheduledFrom, setScheduledFrom] = React.useState('');
  const [scheduledTo, setScheduledTo] = React.useState('');

  // Auto tính giá: mỗi khi input ảnh hưởng giá đổi (đã chọn đón/trả), tự tính lại sau 600ms
  // (debounce để khỏi spam BE). Thay cho việc bấm nút "Tính giá" thủ công.
  React.useEffect(() => {
    if (!open) return;
    if (!pickup || !dropoff) { clearEstimate(); return; }
    const t = setTimeout(() => { handleEstimate(true); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pickup, dropoff, serviceType, vehicleType, totalPassengers, selectedPromotionId, isScheduled, scheduledFrom]);

  // Driver selection
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = React.useState(false);
  const [selectedDriverId, setSelectedDriverId] = React.useState<string | null>(null);
  const [driverSearch, setDriverSearch] = React.useState('');
  // Ca CHIỀU VỀ: khách đặt lượt về cho ĐÚNG tài đang chở lượt đi. Mặc định TẮT —
  // bật là hành động có chủ ý, và tài hiện thêm luôn kèm nhãn đỏ cảnh báo.
  const [includeBusy, setIncludeBusy] = React.useState(false);
  // Đọc lựa chọn hiện tại BÊN TRONG effect nạp danh sách mà không phải đưa
  // `selectedDriverId` vào deps — làm vậy sẽ nạp lại danh sách mỗi lần bấm chọn.
  const selectedDriverIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    selectedDriverIdRef.current = selectedDriverId;
  }, [selectedDriverId]);

  // Khung giờ đón gửi kèm khi hỏi danh sách tài xế: backend chỉ ẩn tài CHỒNG GIỜ
  // với chuyến này. Chuyến đi ngay → bỏ trống (backend hiểu là "bây giờ"). Ngày
  // gõ dở trong ô datetime-local là Invalid Date → bỏ qua, đừng ném vào API.
  const assignFromIso = React.useMemo(() => {
    if (!isScheduled || !scheduledFrom) return undefined;
    const d = new Date(scheduledFrom);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }, [isScheduled, scheduledFrom]);
  const assignToIso = React.useMemo(() => {
    if (!isScheduled || !scheduledTo) return undefined;
    const d = new Date(scheduledTo);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }, [isScheduled, scheduledTo]);

  // Đổi khung giờ đón = đổi tập tài xế rảnh → nạp lại danh sách.
  //
  // Ô `datetime-local` bắn onChange MỖI LẦN sửa một thành phần (gõ "1" rồi "5" của
  // 15 giờ = hai lần), nên phải có cả hai lớp chống:
  //  - debounce: một lần sửa giờ không thành 4-8 request (mỗi request là 3 query DB
  //    trên toàn pool);
  //  - seq guard: phản hồi của khung giờ CŨ về sau không được ghi đè danh sách của
  //    khung giờ MỚI — admin sẽ nhìn danh sách ứng với 01:00 trong khi ô ghi 15:00
  //    rồi gán nhầm, và tệ hơn là bị bỏ chọn oan bởi nhánh dưới.
  const driverFetchSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (!open || mode === 'agent') return; // agent can't force-assign a driver → skip the fetch
    const seq = ++driverFetchSeqRef.current;
    const fetchDrivers = async () => {
      setIsLoadingDrivers(true);
      try {
        const data = await getAvailableDrivers({
          scheduledFrom: assignFromIso,
          scheduledTo: assignToIso,
          includeBusy,
        });
        if (seq !== driverFetchSeqRef.current) return; // phản hồi cũ → vứt
        setDrivers(data);
        // Đổi khung giờ có thể làm tài ĐANG CHỌN rơi khỏi danh sách (giờ mới chồng
        // với cam kết của họ). Lúc đó UI hiện lại ô tìm kiếm — trông như chưa chọn
        // ai — trong khi `selectedDriverId` vẫn còn và vẫn được gửi lúc tạo chuyến.
        // Bỏ chọn hẳn và nói rõ, đừng gán ngầm một người admin tưởng đã bỏ.
        const stillSelected = selectedDriverIdRef.current;
        if (stillSelected && !data.some((d) => getDriverId(d) === stillSelected)) {
          setSelectedDriverId(null);
          toast({
            title: 'Đã bỏ chọn tài xế',
            // Rơi khỏi danh sách vì ĐỔI KHUNG GIỜ hoặc vì TẮT ô "hiện tài đang bận".
            // Câu chữ phải đúng cho cả hai, đừng khẳng định là do đổi giờ.
            description: 'Tài xế vừa chọn đang bận trùng khung giờ — vui lòng chọn lại.',
          });
        }
      } catch {
        // Ignore — driver list is optional
      } finally {
        if (seq === driverFetchSeqRef.current) setIsLoadingDrivers(false);
      }
    };
    const timer = setTimeout(fetchDrivers, 350);
    return () => clearTimeout(timer);
  }, [open, mode, assignFromIso, assignToIso, toast, includeBusy]);

  React.useEffect(() => {
    if (!open) return;
    setVouchersLoaded(false);
    setVouchersError(false);
    getVouchers()
      .then(setVouchers)
      .catch(() => {
        // Ignore — voucher list is optional; promo selector just stays empty.
        setVouchersError(true);
      })
      // Cờ "đã tải xong" (kể cả lỗi) để luồng nhân bản biết lúc nào chốt được
      // voucher chép sang còn hiệu lực hay không.
      .finally(() => setVouchersLoaded(true));
  }, [open]);

  // ——— Nhân bản chuyến ———
  // Nguồn + cảnh báo phát sinh khi chép; null = đang tạo chuyến mới bình thường.
  const [duplicateInfo, setDuplicateInfo] = React.useState<
    { sourceId: string; missingCoords: Array<'pickup' | 'dropoff'> } | null
  >(null);
  // Voucher của chuyến gốc, chờ danh sách voucher tải xong mới biết còn dùng được không.
  const [pendingPromotionId, setPendingPromotionId] = React.useState<number | null>(null);
  const [voucherDropped, setVoucherDropped] = React.useState(false);
  // Draft đã áp — chặn effect ghi đè state admin vừa sửa ở các lần render sau.
  const appliedDraftRef = React.useRef<BookingDraft | null>(null);

  const resetForm = () => {
    setCustomerPhone('');
    setCustomerName('');
    // Agent portal KHÔNG có nút "Kiểm tra" SĐT và onPhoneChange không đổi status
    // → reset về 'idle' sẽ khoá ô tên và chặn submit vĩnh viễn cho đến khi F5.
    // Phải trả về đúng trạng thái khởi tạo theo mode.
    setCustomerStatus(mode === 'agent' ? 'new' : 'idle');
    setPickup(null);
    setDropoff(null);
    setServiceType('CARPOOL');
    setVehicleType('CAR_4');
    setCoPassengers([]);
    setCompanionPhone('');
    clearEstimate();
    setSelectedPromotionId(null);
    setNote('');
    setSelectedDriverId(null);
    setDriverSearch('');
    setIncludeBusy(false);
    setIsScheduled(false);
    setScheduledFrom('');
    setScheduledTo('');
    setDuplicateInfo(null);
    setPendingPromotionId(null);
    setVoucherDropped(false);
  };

  // Cờ "đã áp bản nháp" chỉ được xoá khi dialog ĐÓNG, không xoá trong resetForm:
  // tạo chuyến xong resetForm chạy trong lúc dialog còn đang mở, xoá cờ ở đó sẽ
  // khiến effect điền lại draft (và gọi lookup SĐT thừa) trước khi dialog kịp đóng.
  React.useEffect(() => {
    if (!open) appliedDraftRef.current = null;
  }, [open]);

  // Áp bản nháp nhân bản đúng MỘT LẦN mỗi lần dialog mở (so sánh theo identity của
  // draft) — nếu chạy lại sẽ xoá mất phần admin vừa sửa tay.
  React.useEffect(() => {
    if (!open || !initial || appliedDraftRef.current === initial) return;
    appliedDraftRef.current = initial;

    setPickup(initial.pickup);
    setDropoff(initial.dropoff);
    setServiceType(initial.serviceType);
    setVehicleType(initial.vehicleType);
    setCoPassengers(initial.coPassengers);
    setCompanionPhone(initial.companionPhone);
    setNote(initial.note);
    setIsScheduled(initial.isScheduled);
    setScheduledFrom(initial.scheduledFrom);
    setScheduledTo(initial.scheduledTo);
    // Tài xế và giá KHÔNG chép: chuyến mới tự dispatch, giá tự tính lại.
    setSelectedDriverId(null);
    setDriverSearch('');
    setIncludeBusy(false);
    clearEstimate();
    setSelectedPromotionId(null);
    setPendingPromotionId(initial.promotionId);
    setVoucherDropped(false);
    setDuplicateInfo({ sourceId: initial.sourceBookingId, missingCoords: initial.missingCoords });

    setCustomerPhone(initial.customerPhone);
    setCustomerName(initial.customerName);
    if (mode === 'admin' && initial.customerPhone.length >= 10) {
      // Tự kiểm tra SĐT: admin đỡ một cú bấm, đồng thời lấy tên mới nhất từ server
      // (khách có thể đã đổi tên sau chuyến gốc).
      checkCustomer(initial.customerPhone, initial.customerName);
    } else {
      setCustomerStatus(mode === 'agent' ? 'new' : 'idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, mode]);

  // Voucher chuyến gốc: chỉ chọn lại khi còn hiệu lực (còn hạn, còn lượt, đang bật).
  React.useEffect(() => {
    if (pendingPromotionId == null || !vouchersLoaded) return;
    // Admin đã tự chọn voucher trong lúc danh sách còn đang tải → tôn trọng lựa chọn đó.
    if (selectedPromotionId != null) {
      setPendingPromotionId(null);
      return;
    }
    if (selectableVouchers.some((v) => v.id === pendingPromotionId)) {
      setSelectedPromotionId(pendingPromotionId);
    } else {
      setVoucherDropped(true);
    }
    setPendingPromotionId(null);
  }, [pendingPromotionId, vouchersLoaded, selectableVouchers, selectedPromotionId]);

  // Editing the phone after a check invalidates the customer lookup → re-check.
  const onPhoneChange = (v: string) => {
    setCustomerPhone(v);
    // Agent portal has no admin phone-lookup → keep the name field open ('new').
    if (mode === 'admin' && customerStatus !== 'idle') {
      setCustomerStatus('idle');
      setCustomerName('');
    }
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
    // Địa chỉ có chữ nhưng toạ độ 0/0 (place detail lỗi) → chặn, đừng gửi lên BE:
    // giá tính theo quãng đường và dispatch đều dựa vào toạ độ này.
    const noCoords = [!hasCoords(pickup) && 'đón', !hasCoords(dropoff) && 'trả'].filter(Boolean);
    if (noCoords.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Thiếu toạ độ',
        description: `Điểm ${noCoords.join(' và ')} chưa có toạ độ — chọn lại địa chỉ từ danh sách gợi ý.`,
      });
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
      const payload = {
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
        requestedVehicleType: resolveRequestedVehicleType(serviceType, vehicleType),
        requestedSeats: showPassengerFields ? totalPassengers : undefined,
        // [primary, ...co-passengers] — primary is the booking customer. Only
        // sent when there's at least one co-passenger; a solo ride needs no list.
        passengerNames: (() => {
          if (!showPassengerFields) return undefined;
          const extras = coPassengers.map((n) => n.trim()).filter(Boolean);
          return extras.length > 0 ? [customerName.trim(), ...extras] : undefined;
        })(),
        // SĐT người đi cùng — gửi số ĐÃ chuẩn hoá, bỏ trống thì không gửi field.
        // Số sai định dạng vẫn gửi: backend là chốt chặn duy nhất (âm thầm bỏ,
        // trùng SĐT khách → lưu null) và tuyệt đối không được chặn tạo chuyến.
        // Gate theo `showPassengerFields` y như passengerNames/requestedSeats: ô
        // nhập nằm trong khối "Hành khách" (ẩn với DELIVERY), gõ số ở CARPOOL rồi
        // đổi sang Giao hàng mà vẫn gửi = lưu dữ liệu admin không còn nhìn thấy
        // và không xoá được.
        companionPhone: showPassengerFields ? normalizeVnPhone(companionPhone) || undefined : undefined,
        note: note || undefined,
        // Pickup window. Send scheduledTime = from too: a backend without window
        // support (whitelist:true strips the unknown from/to fields) then still
        // schedules at the window start instead of silently falling back to
        // "now". All three are undefined for an immediate trip.
        scheduledTime: scheduledFromIso,
        scheduledFromTime: scheduledFromIso,
        scheduledToTime: scheduledToIso,
        promotionId: selectedPromotionId ?? undefined,
      };
      // đặt hộ: agent posts to /agent/bookings (agentUserId from JWT, no driver-assign);
      // admin keeps the driver pre-assign path.
      if (mode === 'agent') {
        await createAgentBooking(payload);
      } else {
        await createAdminBooking({ ...payload, driverId: selectedDriverId || undefined });
      }
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

  // Đảo chiều đón ↔ trả (chuyến khứ hồi). AddressAutocomplete sync text theo prop
  // `value` nên chỉ cần hoán đổi state; effect ước giá tự chạy lại.
  const swapAddresses = () => {
    setPickup(dropoff);
    setDropoff(pickup);
    clearEstimate();
  };

  // Tính theo trạng thái HIỆN TẠI của form (không theo vai trò ở chuyến gốc) để
  // sau khi bấm đảo chiều nhãn vẫn chỉ đúng ô đang thiếu.
  const missingCoordFields = React.useMemo(() => {
    if (!duplicateInfo || duplicateInfo.missingCoords.length === 0) return [] as Array<'pickup' | 'dropoff'>;
    const out: Array<'pickup' | 'dropoff'> = [];
    if (!hasCoords(pickup)) out.push('pickup');
    if (!hasCoords(dropoff)) out.push('dropoff');
    return out;
  }, [duplicateInfo, pickup, dropoff]);

  // Giờ đón chép từ chuyến gốc có thể đã qua — cảnh báo sớm thay vì để admin
  // bấm "Tạo chuyến" mới thấy lỗi (validateWindow vẫn là chốt chặn thật).
  const scheduledFromInPast =
    !!duplicateInfo && isScheduled && !!scheduledFrom && new Date(scheduledFrom).getTime() < Date.now() - 60_000;

  // Đóng dialog ở đâu cũng phải dọn form (kể cả nút "Hủy" ở footer), nếu không
  // lần mở sau còn dính dữ liệu chuyến vừa nhân bản.
  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Controlled mode (nhân bản) do cha mở → không render nút trigger. */}
      {!isControlled && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {mode === 'agent' ? 'Đặt hộ chuyến' : 'Tạo chuyến'}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}
        onFocusCapture={(e) => {
          // iOS WKWebView ignores `interactive-widget` and dvh doesn't shrink for the soft
          // keyboard, so a focused field can end up hidden behind it (with the dark overlay
          // covering it). On touch devices, nudge the field into view once the keyboard has
          // finished animating. No-op on desktop (fine pointer) to avoid scroll jumps.
          if (!window.matchMedia?.('(pointer: coarse)').matches) return;
          const t = e.target as HTMLElement;
          if (t.matches('input, textarea')) {
            setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {duplicateInfo ? 'Nhân bản chuyến' : mode === 'agent' ? 'Đặt hộ chuyến mới' : 'Tạo chuyến mới'}
          </DialogTitle>
          <DialogDescription>
            {duplicateInfo
              ? `Từ chuyến #${duplicateInfo.sourceId.slice(0, 8)} — thông tin đã điền sẵn, sửa lại phần cần đổi rồi tạo chuyến MỚI. Chuyến gốc không thay đổi.`
              : 'Nhập thông tin khách hàng và chuyến đi. Nếu khách chưa có tài khoản, hệ thống sẽ tự tạo mới.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {(missingCoordFields.length > 0 || scheduledFromInPast) && (
            <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {missingCoordFields.length > 0 && (
                <p>
                  Chuyến gốc không có toạ độ cho{' '}
                  {missingCoordFields.map((k) => (k === 'pickup' ? 'điểm đón' : 'điểm trả')).join(' và ')} — vui lòng
                  chọn lại địa chỉ để tính giá và điều phối đúng.
                </p>
              )}
              {scheduledFromInPast && <p>Giờ đón của chuyến gốc đã qua — vui lòng chọn lại giờ đón.</p>}
            </div>
          )}
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
                  {mode === 'admin' && (
                    <Button type="button" variant="outline" onClick={() => checkCustomer()} disabled={customerStatus === 'checking' || customerPhone.length < 10}>
                      {customerStatus === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      <span className="ml-1.5">Kiểm tra</span>
                    </Button>
                  )}
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
            {/* Đảo chiều đón ↔ trả — chuyến khứ hồi khỏi phải gõ lại 2 địa chỉ. */}
            <div className="flex justify-center -my-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={swapAddresses}
                disabled={!pickup && !dropoff}
                title="Đảo chiều điểm đón và điểm trả"
                aria-label="Đảo chiều điểm đón và điểm trả"
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
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
            {isVehicleTypeApplicable(serviceType) ? (
              <div className="space-y-1.5">
                <Label>
                  Loại xe {serviceType === 'RIDE' && <span className="text-destructive">*</span>}
                </Label>
                <Select value={vehicleType} onValueChange={(v) => { setVehicleType(v as any); clearEstimate(); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAR_4">🚗 5 chỗ</SelectItem>
                    <SelectItem value="CAR_7">🚙 7 chỗ</SelectItem>
                  </SelectContent>
                </Select>
                {serviceType === 'CARPOOL' && (
                  <p className="text-xs text-muted-foreground">
                    Đặt đủ số ghế của loại xe này (5 chỗ = 4 khách, 7 chỗ = 6 khách) sẽ tự chuyển sang Bao xe (tính giá cả xe, KHÔNG áp giảm giá theo ghế).
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="cb-note">Ghi chú</Label>
                <Textarea id="cb-note" placeholder="Ghi chú..." value={note} onChange={(e) => setNote(e.target.value)} rows={1} className="min-h-[36px] resize-none" />
              </div>
            )}
          </div>

          {isVehicleTypeApplicable(serviceType) && (
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

              {/* SĐT người đi cùng — MỘT số cho cả chuyến, để tài xế biết gọi cho ai.
                  Không ảnh hưởng giá → không clearEstimate(). Sai định dạng chỉ cảnh
                  báo, KHÔNG khoá nút "Tạo chuyến" (backend tự bỏ số sai). */}
              <div className="space-y-1.5 border-t pt-3">
                <Label htmlFor="cb-companion-phone">SĐT người đi cùng (không bắt buộc)</Label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="cb-companion-phone"
                    inputMode="tel"
                    placeholder="0912345678"
                    value={companionPhone}
                    onChange={(e) => setCompanionPhone(e.target.value)}
                    aria-invalid={!companionPhoneValid}
                    className={cn('pl-8', !companionPhoneValid && 'border-destructive focus-visible:ring-destructive')}
                  />
                </div>
                {!companionPhoneValid && (
                  <p className="text-xs text-destructive">SĐT không hợp lệ (10 số, bắt đầu bằng 0)</p>
                )}
                {companionPhoneValid && companionPhoneIsCustomer && (
                  <p className="text-xs text-amber-600">Trùng SĐT khách — sẽ không được lưu.</p>
                )}
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
            {voucherDropped && selectedPromotionId == null && (
              <p className="text-xs text-amber-600">
                {vouchersError
                  ? 'Chưa tải được danh sách khuyến mãi nên chưa áp lại được khuyến mãi của chuyến gốc — đóng và mở lại form để thử lại.'
                  : 'Khuyến mãi của chuyến gốc không còn dùng được (hết hạn / hết lượt / đã tắt / loại đổi điểm) — chọn khuyến mãi khác nếu cần.'}
              </p>
            )}
            {selectedPromotionId != null ? (
              <p className="text-xs text-muted-foreground">Giá dự kiến tự cập nhật sau khi áp khuyến mãi.</p>
            ) : selectableVouchers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {vouchers.length === 0
                  ? 'Chưa tải được danh sách khuyến mãi.'
                  : 'Không có khuyến mãi khả dụng (cần đang bật, còn hạn, còn lượt, loại công khai).'}
              </p>
            ) : null}
          </div>

          {/* Price estimate — tự động tính (debounce) khi đủ điểm đón/trả */}
          <div className="rounded-lg border p-3">
            <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Calculator className="h-4 w-4" /> Giá dự kiến
              {estimating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </div>
            {priceEstimate != null ? (
              <div className="mt-1">
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
              <p className="text-xs text-muted-foreground mt-1">
                {estimating
                  ? 'Đang tính giá…'
                  : `Chọn điểm đón/trả${serviceType === 'RIDE' ? ' + loại xe' : ''} để tự tính giá.`}
              </p>
            )}
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

          {/* Driver Selection — admin only (an agent can't force-assign a driver). */}
          {mode === 'admin' && (
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
                  <div className="font-semibold flex items-center gap-2">
                    {getDriverName(selectedDriver)}
                    {/* Giữ nhãn cả sau khi chọn: cảnh báo mà biến mất lúc bấm chọn
                        thì đúng lúc cần nhất lại không có. */}
                    <DriverCommitmentBadge commitments={selectedDriver.activeCommitments} />
                  </div>
                  <div className="text-muted-foreground">
                    {selectedDriver.phone}
                    {selectedDriver.fixedRoute?.name ? ` • ${selectedDriver.fixedRoute.name}` : ''}
                    {/* `> 0` chứ không `!= null` — cùng luật với dòng danh sách bên dưới.
                        Tài lọt vào nhờ công tắc "hiện tài đang bận" có availableSeats = 0
                        (accept() zero hoá cho chuyến không-ghép); in "còn 0 ghế khách" ngay
                        trên thẻ admin nhìn TRƯỚC KHI bấm Tạo chuyến là UI tự phủ định. */}
                    {(selectedDriver as any).availableSeats > 0 ? ` • còn ${(selectedDriver as any).availableSeats} ghế khách` : ''}
                  </div>
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {/* Ca CHIỀU VỀ: khách đặt lượt về cho đúng tài đang chở lượt đi.
                    Lệnh gán vốn đã cho phép (không có guard bận) — chỗ này chỉ mở
                    tầng hiển thị, nên tài hiện thêm luôn kèm nhãn đỏ. */}
                <div className="flex items-start gap-2.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
                  <Switch
                    id="cb-include-busy"
                    checked={includeBusy}
                    onCheckedChange={setIncludeBusy}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="cb-include-busy" className="cursor-pointer text-xs font-medium">
                      Hiện cả tài xế đang bận
                    </Label>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Cho ca khách đặt chiều về cho đúng tài đang chở. Tài hiện thêm có
                      nhãn đỏ — hệ thống không chặn double-book.
                    </p>
                  </div>
                </div>
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
                    <p className="text-center text-sm text-muted-foreground py-4">
                      Không tìm thấy tài xế.
                      {!includeBusy && !driverSearch && ' Tài đang bận trùng khung giờ đang bị ẩn.'}
                    </p>
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
                            <DriverCommitmentBadge commitments={driver.activeCommitments} />
                            {/* Ẩn khi 0: `accept()` zero hoá `availableSeats` cho chuyến
                                không-ghép, nên tài lọt vào danh sách nhờ luật khung giờ mới
                                gần như luôn hiện "còn 0 ghế khách" — bày ra để gán mà lại
                                ghi 0 ghế thì UI tự mâu thuẫn. Số ghế thật nằm ở nhãn cam kết. */}
                            {(driver as any).availableSeats > 0 && (
                              <Badge variant="outline" className="text-xs">
                                còn {(driver as any).availableSeats} ghế khách
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
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>Hủy</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Tạo chuyến
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
