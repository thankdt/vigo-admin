import type { DriverPresence } from './driver-presence';

export type LoyaltyTier = 'MEMBER' | 'SILVER' | 'GOLD' | 'DIAMOND';

export type User = {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Editor' | 'Viewer' | 'USER' | 'DRIVER' | 'TRANSPORT_COMPANY_OWNER';
  status: 'Active' | 'Inactive';
  avatarUrl: string;
  lastLogin: string;
  phone?: string;
  isLocked: boolean;
  createdAt?: string;
  loyaltyTier?: LoyaltyTier;
  currentBalance?: number;
  totalWithdrawn?: number;
  deletedAt?: string | null;
};

export type Article = {
  id: string;
  title: string;
  author: string;
  status: 'Published' | 'Draft' | 'Archived';
  createdAt: string;
  imageUrl: string;
};

export type News = {
  id: number;
  title: string;
  description: string;
  imageUrl?: string;
  link?: string;
  isActive: boolean;
  createdAt: string;
  deletedAt?: string;
};

export type Banner = {
  id: number;
  imageUrl: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  deletedAt?: string;
};

export type AppPopupDisplayMode = 'ALWAYS' | 'DISMISSIBLE' | 'ONCE';

export type AppPopupAudience = 'CUSTOMER' | 'DRIVER' | 'BOTH';

export type AppPopup = {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  displayMode: AppPopupDisplayMode;
  audience: AppPopupAudience;
  isActive: boolean;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

// --- RBAC (phân quyền admin theo function) ---
// Shape khớp backend GET /admin/me và CRUD role. functions rỗng khi super (super = thấy tất).
export type AdminMe = {
  id: string;
  fullName: string | null;
  phone: string;
  isSuperAdmin: boolean;
  functions: string[];
};

export type AdminRole = {
  id: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  functions: string[];
};

export type FunctionOverride = { functionKey: string; effect: 'GRANT' | 'REVOKE' };

// User admin trên màn gán quyền (/roles). Backend query addSelect isSuperAdmin + load
// role/override (spec §4.6). Chỉ dùng ở admin, không rò ra mobile.
export type AdminAssignmentUser = {
  id: string;
  fullName: string | null;
  phone: string;
  isSuperAdmin: boolean;
  roleIds: string[];
  overrides: FunctionOverride[];
};

// Catalog function cho UI render (GET /admin/functions): key + nhãn + nhóm.
export type FunctionCatalogItem = { key: string; label: string; group: string };

export type TransportCompany = {
  id: string;
  name: string;
  ownerName?: string;
  ownerPhone?: string;
  // Set by admin via "Gán chủ" form — links to a User row with role TRANSPORT_COMPANY_OWNER.
  ownerUserId?: string | null;
  isActive: boolean;
  // Decimal 0..1 — 0.05 = 5%. HTX takes this slice of each booking's finalPrice.
  htxCommissionRate?: number;
  taxCode?: string | null;
  address?: string | null;
  htxHotline?: string | null;
  accountingHotline?: string | null;
  driverCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Một tỉnh hoạt động của tài. `gisCode` (mã gis 2 số, '01' = Nội đô Hà Nội) vắng ở backend cũ. */
export type DriverProvince = {
  id: number;
  name: string;
  gisCode?: string;
};

export type Driver = {
  id: string;
  name?: string;
  phone?: string;
  walletBalance?: number;
  wallets?: {
    deposit: number;
    main: number;
  };
  isApproved: 'true' | 'false' | 'pending' | '-' | boolean | string;
  // Live operational state (from driver.status). Surfaced in the admin table's
  // "Đã duyệt" tab so ops can see who's online right now.
  status?: 'ONLINE' | 'OFFLINE' | 'BUSY' | string;
  // Tín hiệu THẬT từ Redis (socket/heartbeat). `status` chỉ là trạng thái KHAI
  // BÁO — tài bỏ app vẫn ONLINE mãi. Optional: BE cũ không có, và BE bỏ field
  // này khi Redis lỗi. Xem `driverOnlineState`.
  presence?: DriverPresence;
  rejectionReason?: string | null;
  /**
   * Chuyến tài xế ĐANG giữ (đã nhận, chưa chạy xong) — chỉ có ở danh sách gán
   * chuyến của admin. Từ 14/08/2026 danh sách đó không còn ẩn tài chỉ vì họ giữ
   * một cam kết ở khung giờ KHÁC, nên admin phải nhìn thấy cam kết đó trước khi
   * bấm gán. `overlapsCandidate` = cam kết này chồng giờ với chuyến đang tạo.
   */
  activeCommitments?: Array<{
    bookingId: string;
    serviceType?: string | null;
    status?: string | null;
    scheduledFrom?: string | null;
    scheduledTo?: string | null;
    confirmedPickupTime?: string | null;
    overlapsCandidate?: boolean;
  }>;
  // CSKH: loại mốc "lịch sử làm việc" gần nhất (trạng thái cuối) + thời điểm — hiện badge ở danh sách.
  csLastCallType?: string | null;
  csLastCallAt?: string | null;
  vehicle?: {
    id: number;
    plateNumber: string;
    model: string;
  };
  vehicleRegistration?: {
    plateNumber: string;
    brand: string;
    model: string;
    color: string;
    year?: number;
    seats?: number;
    images?: string[];
    registrationImages?: string[];
    inspectionImages?: string[];
    insuranceImages?: string[];
  };
  user?: {
    id: string;
    fullName?: string;
    phone?: string;
    avatarUrl?: string;
    avatar?: string;
    createdAt?: string;
  };
  licenseNumber?: string;
  licenseImages?: string[];
  cccdImages?: string[];
  // Ảnh giấy xác nhận HTX (admin upload hộ). 1 ảnh, S3 key; rỗng = chưa có.
  htxConfirmationImage?: string;
  enabledDropoffDistricts?: number[];
  enabledServices?: string[];
  isSubmittedForApproval?: boolean;
  createdAt?: string;
  /** @deprecated Tuyến đã bỏ: backend vẫn trả khoá này nhưng rỗng. Đừng đọc cho vùng hoạt động. */
  fixedRoute?: {
    id: number;
    name: string;
  };
  /** @deprecated Tuyến đã bỏ: backend vẫn trả khoá này nhưng luôn rỗng. */
  routes?: {
    id: number;
    name: string;
  }[];
  // Tỉnh hoạt động (34 tỉnh sau sáp nhập), nguồn `driver_service_provinces`. Tài đã duyệt mà
  // mảng này rỗng thì KHÔNG bật được "Sẵn sàng" (DRV_PROVINCE_REQUIRED). Undefined = backend cũ.
  provinces?: DriverProvince[];
  transportCompanyId?: string;
  transportCompany?: TransportCompany;
  customTransportCompanyName?: string;
  // SĐT liên hệ HTX tự nhập (chưa xác nhận). Lưu cùng row với name khi tài xế nhập tay
  // ở app — admin xem cell HTX cần thấy cả 2 để liên hệ verify.
  customTransportCompanyPhone?: string | null;
  isIndependentDriver?: boolean;
  issues?: string[];
  // Admin khoá cứng tài khoản (khác isActive của HTX). Additive — backend chỉ THÊM field.
  isBanned?: boolean;
  bannedAt?: string | null;
  bannedReason?: string | null;
  // Tạm khoá nhận chuyến có hẹn giờ (chỉ chặn dispatch). Đang khoá khi suspendedUntil > now.
  suspendedUntil?: string | null;
  suspendedReason?: string | null;
  // CSKH theo dõi đã gọi điện tài xế + ghi chú nội bộ. Backend chỉ trả ở danh sách admin
  // (select:false ở nơi khác). Additive → có thể undefined nếu backend chưa deploy.
  csCalled?: boolean;
  csCalledAt?: string | null;
  csCalledByName?: string | null;
  csNote?: string | null;
  contractPdfUrl?: string | null;
  contractSignatureUrl?: string | null;
  contractSignedAt?: string | null;
  htxApprovalStatus?: 'NONE' | 'PENDING_HTX' | 'HTX_APPROVED' | 'HTX_REJECTED' | string | null;
  htxApprovedAt?: string | null;
  htxSignatureInfo?: any;
}

export type BookingStatus = 'CREATED' | 'SEARCHING' | 'PROCESSING' | 'PENDING_MATCHING' | 'ACCEPTED' | 'ARRIVED' | 'PICKED_UP' | 'COMPLETED' | 'CANCELLED' | 'DELIVERY_FAILED' | 'SCHEDULED' | 'DELAYED_WAITING';

export type PriceBreakdown = {
  transportPrice: number;
  sizeSurcharge: number;
  weightSurcharge: number;
  weekendSurcharge: number;
  holidaySurcharge: number;
  serviceFee: number;
  vatAmount: number;
  loyaltyDiscount: number;
  promotionDiscount: number;
  // VAT-inclusive total before any discount — backend ships this so the
  // customer app can render a tidy strikethrough. Optional because legacy
  // bookings don't have it (admin breakdown doesn't render the strikethrough
  // anyway, so the missing field is harmless here).
  priceBeforeDiscount?: number;
  // Giảm giá CARPOOL theo số ghế đặt (2-5 ghế). Optional — chuyến cũ /
  // chuyến không phải CARPOOL không có field này (hoặc = 0).
  seatDiscountPercent?: number;
  seatDiscountAmount?: number;
};

export type DriverEarnings = {
  grossPrice: number;
  commissionRate: number;
  commissionAmount: number;
  grossEarnings: number;
  personalIncomeTaxRate: number;
  personalIncomeTaxAmount: number;
  netEarnings: number;
  // Fields from the locked-down ops spreadsheet — drive the new
  // "Phân bổ doanh thu" breakdown. Optional with sensible defaults
  // because legacy bookings that completed before
  // 1782000000000-AddBookingEarningsBreakdown don't have these.
  grossPriceBase?: number;
  discountAmount?: number;
  priceAfterDiscount?: number;
  vatAmount?: number;
  finalPrice?: number;
  htxCommission?: number;
  vigoCommission?: number;
  platformIncomeAfterKm?: number;
  driverDiscountBonus?: number;
  taxableEarnings?: number;
  tripCashKept?: number;
  driverTotalReceived?: number;
  htxVatRemit?: number;
  vigoVatRemit?: number;
  htxTotalReceived?: number;
  vigoTotalReceived?: number;
  htxCommissionRate?: number;
  htxShareRate?: number;
  vigoShareRate?: number;
  // % hoa hồng CHUẨN áp dụng chuyến này (trước khi trừ mức riêng của tài, nếu
  // có) + phần hoa hồng VIGO "nhường" cho tài khi tài có mức riêng thấp hơn
  // chuẩn (âm nếu mức riêng CAO hơn chuẩn). Optional — chuyến trước tính năng
  // % hoa hồng riêng theo tài team không có 2 field này.
  standardCommissionRate?: number;
  forgoneCommission?: number;
};

export type Booking = {
  id: string;
  customerId: string;
  driverId?: string | null;
  pickupAddress: string | { address: string; lat: number; lng: number };
  dropoffAddress: string | { address: string; lat: number; lng: number } | null;
  price: number;
  finalPrice?: number;
  status: BookingStatus;
  serviceType?: string;
  // Loại dịch vụ THỰC TẾ sau khi backend auto-switch CARPOOL→RIDE (đủ ghế
  // = sức chứa xe). serviceType giữ nguyên loại GỐC khách/admin chọn;
  // effectiveServiceType phản ánh loại đã áp dụng. Optional — backend cũ /
  // chuyến không switch có thể không có field, hoặc trùng serviceType.
  effectiveServiceType?: string;
  switchedToWholeCar?: boolean;
  isPooled?: boolean;
  requestedSeats?: number;
  requestedVehicleType?: string | null;
  paymentMethod?: string;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  cancelledByRole?: 'CUSTOMER' | 'DRIVER' | 'ADMIN' | 'SYSTEM' | null;
  cancelledByUserId?: string | null;
  cancelledByUser?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
    role?: string;
  } | null;
  // Ghi chú của KHÁCH. Cột này ĐI RA APP TÀI XẾ (hiện dưới nhãn "Ghi chú của
  // khách"). Đừng nhét nội dung vận hành nội bộ vào đây — dùng adminNote.
  note?: string | null;
  // Ghi chú vận hành NỘI BỘ. Backend để select:false nên chỉ endpoint admin trả
  // về; không bao giờ ra app tài/khách.
  //
  // `adminNote` = LOG máy ghi, append-only (đổi trạng thái kèm note, gạt cờ chuyến
  // test, void). Chỉ ĐỌC, hiện ở dialog chi tiết chuyến.
  adminNote?: string | null;
  // `adminMemo` = memo admin TỰ GÕ, GHI ĐÈ được (PUT /bookings/admin/:id/memo). Cũng
  // select:false ở backend. Đừng lẫn với `adminNote` phía trên và đừng ghi memo vào
  // `note` (note đi ra app tài xế).
  // `undefined` = backend chưa deploy cột này; `null` = chưa/đã xoá memo.
  //
  // [DISABLED 2026-08-24] KHÔNG còn UI nào đọc/ghi field này — ô nhập ở cột "Ghi chú"
  // của danh sách chuyến đã bị gỡ (nhường chỗ cho cột "Gọi trước HT"). Cột DB, endpoint
  // và `updateBookingAdminMemo` vẫn còn; dữ liệu đã gõ không mất.
  adminMemo?: string | null;
  // Tên hành khách, index 0 = khách chính (khớp quy ước app khách + hợp đồng).
  // null cho rows cũ trước khi có cột.
  passengerNames?: string[] | null;
  // SĐT người đi cùng (tuỳ chọn) — để tài xế biết gọi cho ai. Backend chuẩn hoá
  // và STRIP field này khỏi feed/offer (tài chưa nhận chuyến không thấy) →
  // null ở đa số response ngoài màn chi tiết chuyến.
  companionPhone?: string | null;
  // Voucher đã áp cho chuyến. Backend chỉ trả id (không join promotion) — muốn
  // biết chi tiết phải đối chiếu với danh sách khuyến mãi.
  promotionId?: number | null;
  shareLink?: string;
  createdAt: string;
  updatedAt?: string;
  // Thời điểm chuyến chuyển COMPLETED (nguồn thật cho "Ngày hoàn thành"). Null cho rows cũ trước
  // khi có cột → UI fallback về updatedAt.
  completedAt?: string | null;
  // Scheduled pickup time set by the customer (null/undefined = ride is "now").
  scheduledTime?: string | null;
  // Pickup-window [from, to] (null/undefined for legacy single-instant trips).
  // scheduledTime mirrors scheduledFromTime so old clients read one instant.
  scheduledFromTime?: string | null;
  scheduledToTime?: string | null;
  customer: {
    id: string;
    fullName: string;
    phone: string;
    role?: string;
    email?: string | null;
  } | null;
  // Immutable snapshot of the booker's contact taken at booking time. Preferred
  // over `customer` for display because it reflects the trip as it was when
  // the customer placed it — `customer` can later have its name/phone edited
  // or be soft-deleted (relation becomes null).
  senderInfo?: { name?: string; phone?: string } | null;
  receiverInfo?: { name?: string; phone?: string } | null;
  // Đặt hộ: tên + SĐT đại lý đã đặt chuyến hộ khách (backend chỉ trả ở endpoint admin list/detail).
  // Null với chuyến thường. Additive → undefined nếu backend chưa deploy.
  agentName?: string | null;
  agentPhone?: string | null;
  driver?: {
    id: string;
    fullName?: string;
    name?: string;
    phone?: string;
    user?: {
      id?: string;
      fullName?: string;
      phone?: string;
      avatar?: string;
      avatarUrl?: string;
    };
    isNew?: boolean;
    completedTrips?: number;
    displayStars?: number | null;
    isHighCancel?: boolean;
    isFrequentlyLate?: boolean;
    hasViolation?: boolean;
    // Ghi chú CSKH của tài xế (= `Driver.csNote`, nhập ở trang Tài xế). Backend chỉ gắn ở
    // danh sách chuyến admin; additive nên undefined nếu backend chưa deploy.
    csNote?: string | null;
  } | null;
  priceBreakdown?: PriceBreakdown | null;
  driverEarnings?: DriverEarnings;
  finalPriceVAT?: number;
  distanceKm?: number;
  // LEGACY (bỏ tuyến 10/2026): tuyến của chuyến TẠO TRƯỚC khi bỏ tuyến. Chuyến mới luôn null —
  // trục địa lý hiện là cặp tỉnh bên dưới. Chỉ hiển thị như dữ liệu lịch sử.
  routeId?: number | null;
  route?: { id: number; name: string } | null;
  // Snapshot địa lý gis (34 tỉnh) hai đầu chuyến, BE stamp lúc tạo từ toạ độ. null/thiếu = chuyến
  // cũ chưa backfill hoặc BE chưa deploy — luôn xử lý tường minh. '01' = Nội đô Hà Nội.
  pickupProvinceCode?: string | null;
  dropoffProvinceCode?: string | null;
  // Vi-now: customer shows a 6-digit code to a nearby driver to claim the
  // trip directly, bypassing dispatch. Admin needs to spot these at a
  // glance because the customer journey + UI flow differ from a normal
  // dispatched booking.
  isVinow?: boolean;
  // Chuyến admin chạy thử. Backend loại nó khỏi mọi số liệu tổng hợp (dashboard,
  // tài chính, hoá đơn VAT, đối soát HTX) — nhưng chuyến vẫn HIỆN ở danh sách này
  // kèm badge TEST, để admin sửa được nếu gạt nhầm.
  //
  // Optional vì backend cũ chưa trả field. Luôn so sánh dạng `=== true` /
  // `booking.isTestTrip &&` — KHÔNG dùng `=== false`: `undefined` và `false` phải
  // cùng nghĩa "chuyến thật", nếu không mọi chuyến cũ sẽ hiện sai.
  isTestTrip?: boolean;
  // Chuyến bị khách ĐẶT LẶP — admin gạt công tắc ở dialog chi tiết để CSKH khỏi gọi lại.
  //
  // ⚠️ ĐỪNG suy ngữ nghĩa từ `isTestTrip` ngay trên. Đây là NHÃN VẬN HÀNH thuần: KHÔNG
  // đụng tiền, KHÔNG loại chuyến khỏi báo cáo/hoá đơn/đối soát, KHÔNG đụng hàng đợi CSKH
  // (/crm-queue vẫn liệt kê chuyến trùng như cũ). Chỉ đổi hiển thị + cho lọc ở bảng chuyến.
  //
  // Cũng đừng lẫn với nút "Nhân bản chuyến" ở menu dòng — nút đó TẠO chuyến mới từ chuyến
  // cũ, nghĩa gần như ngược lại.
  //
  // Optional vì backend cũ chưa trả field. Luôn so `=== true` / `booking.isDuplicateTrip &&`
  // — KHÔNG `=== false`: `undefined` và `false` phải cùng nghĩa "không trùng".
  isDuplicateTrip?: boolean;
  /**
   * Chuyến này là chuyến ĐẦU TIÊN tài khoản khách đó từng đặt (backend đếm mọi chuyến,
   * kể cả huỷ). Optional vì backend cũ chưa trả — LUÔN so `=== true`, đừng dùng
   * `!booking.isFirstBooking` để suy ra "khách cũ": field vắng mặt không có nghĩa gì cả.
   */
  isFirstBooking?: boolean;
  // Admin-claim state for the PROCESSING fallback queue. Both are NULL when
  // the booking is in any other status, or when it's PROCESSING but no admin
  // has clicked "Nhận xử lý" yet.
  adminClaimedAt?: string | null;
  adminClaimedById?: string | null;
  adminClaimedBy?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
  } | null;
  // CSKH "gọi check khách" — trạng thái HIỆN TẠI (event mới nhất). null/undefined = chưa gọi.
  // Additive: backend cũ chưa trả các field này.
  customerCallStatus?: CustomerCallStatus | null;
  // Hai việc gọi ĐỘC LẬP của CSKH: trước và sau khi chuyến hoàn thành. Tách khỏi
  // customerCallStatus (chỉ giữ lần gọi mới nhất) để gọi lần 2 không đè mất dấu lần 1.
  callBeforeStatus?: CustomerCallStatus | null;
  callBeforeAt?: string | null;
  callAfterStatus?: CustomerCallStatus | null;
  callAfterAt?: string | null;
  customerCallCheckedAt?: string | null;
  customerCallCheckedBy?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
  } | null;
  // Ai đang GIỮ VIỆC gọi ở từng pha (BE: booking.callBeforeById/callAfterById). Khác
  // customerCallCheckedBy — cột đó là "lần gọi mới nhất", dùng chung hai pha nên bị đè.
  // Nguồn của tab "Việc của tôi" và cột "Người giữ việc" ở hàng đợi CSKH.
  callBeforeById?: string | null;
  callAfterById?: string | null;
  callBeforeBy?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
  } | null;
  callAfterBy?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
  } | null;
}

/** Trạng thái CSKH gọi check khách. Luồng: (chưa gọi) → CLAIMED (đã nhận gọi) →
 *  CALLED (gọi được) / UNREACHED (không liên lạc được). */
export type CustomerCallStatus = 'CLAIMED' | 'CALLED' | 'UNREACHED';

/** Giá trị filter cột "Gọi check" ngoài danh sách. */
export type CustomerCallFilter = 'claimed' | 'called' | 'unreached' | 'uncalled';

/** Giá trị filter "Chuyến test" ngoài danh sách chuyến đi. Không có 'all' — bộ lọc
 *  tắt được biểu diễn bằng `undefined`, để param không bị gửi thừa lên API. */
export type TestTripFilter = 'exclude' | 'only';

/** Giá trị filter "Chuyến trùng" ngoài danh sách chuyến đi. Không có 'all' — cùng quy ước
 *  với {@link TestTripFilter}: bộ lọc tắt là `undefined` để param không bị gửi thừa. */
export type DuplicateTripFilter = 'exclude' | 'only';

/** Một dòng lịch sử gọi check của 1 chuyến (append-only, mới nhất trước). */
export type BookingCustomerCallEvent = {
  id: string;
  status: CustomerCallStatus;
  /** Lý do đã chuẩn hoá, chọn từ danh mục CSKH_CALL_REASONS. Null = CSKH không chọn. */
  reason: string | null;
  note: string | null;
  createdAt: string;
  byAdminName: string | null;
};

// Permission/allPermissions mock cũ (action:resource string) đã bỏ — RBAC nay theo
// function key (xem AdminRole.functions + src/lib/rbac.ts).

// Master Data Types
export type AdminUnit = {
  id: number;
  name: string;
  level: 'PROVINCE' | 'DISTRICT' | 'WARD';
  parentId?: number;
  parent?: AdminUnit;
  aliases?: string[] | null;
  // True for synthetic POI rows (sân bay, ga tàu, điểm du lịch…). UI uses
  // this to keep the POI picker focused instead of listing every commune.
  isPoi?: boolean;
  // Constituent old provinces (pre-2025 merger)
  oldProvinces?: string[];
  // Mã tỉnh gis (2 số) — chỉ có ở GET /drivers/provinces của backend mới.
  gisCode?: string;
};

export type Route = {
  id: number;
  name: string;
  districts: AdminUnit[];
  imageUrl?: string;
  imageKey?: string;
  // Populated only when admin requested `includeDeleted=true`. Active routes
  // come back with `deletedAt = null/undefined`.
  deletedAt?: string | null;
}

// Vehicle classes used by RIDE (private/charter) pricing — 5-seater vs 7-seater have separate
// fares, so each RIDE route typically has 2 RoutePricing rows distinguished by `vehicleType`.
export type VehicleType = 'CAR_4' | 'CAR_7';

export type RoutePricing = {
  id: number;
  routeId: number;
  adminUnitId: number;
  startDistrictId?: number; // Optional: ID for Start District
  price: number;
  priority: number;
  serviceType?: 'DELIVERY' | 'CARPOOL' | 'RIDE';
  // Required by backend when serviceType = RIDE; ignored for DELIVERY/CARPOOL.
  vehicleType?: VehicleType | null;
  route: Route;
  adminUnit: AdminUnit;
  startDistrict?: AdminUnit; // Optional: Start District Entity
}

export type AreaPriceAdjustment = {
  id: number;
  adminUnitId: number;
  adminUnit?: AdminUnit;
  serviceType: 'CARPOOL' | 'RIDE' | 'ALL' | string;
  deltaAmount: number;
  applyPerSeat: boolean;
  isActive: boolean;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SystemConfig = {
  id: number;
  key: string;
  value: string;
  description: string;
}

export type Promotion = {
  id: number;
  code: string;
  discountType: 'FIXED_AMOUNT' | 'PERCENTAGE';
  discountValue: number;
  minOrderValue: number;
  startDate: string;
  endDate: string;
  usageLimit: number;
  usageCount: number;
  pointCost: number;
  // Admin toggle. When false, customer-facing /promotions hides the voucher
  // (findAllActive filters on `isActive = true`).
  isActive: boolean;

  imageUrl?: string;
  description?: string;
  maxDiscount?: number;
  // Max times a single user can redeem this voucher. null/omitted = unlimited.
  userUsageLimit?: number | null;
  // Max times this voucher can be redeemed in a single calendar day across
  // all users (resets at midnight Asia/Ho_Chi_Minh). 0/omitted = unlimited.
  dailyUsageLimit?: number;
  // Ai THẤY voucher trong danh sách app khách. Bỏ trống → backend mặc định PUBLIC
  // (đúng hành vi trước khi có cột này).
  visibility?: PromotionVisibility;
  // Chiến dịch tự tặng đã sinh ra mã. null = voucher admin tạo tay.
  campaignId?: string | null;
}

/**
 * PUBLIC   — ai cũng thấy trong danh sách (hành vi có từ trước).
 * TARGETED — chỉ khách được gán mới thấy; voucher tự tặng dùng mức này.
 * CODE_ONLY— không hiện trong danh sách, phải gõ đúng mã mới sở hữu.
 */
export type PromotionVisibility = 'PUBLIC' | 'TARGETED' | 'CODE_ONLY';

/** Khách đang được gán một voucher TARGETED. */
export type PromotionAssignee = {
  userId: string;
  fullName: string | null;
  phone: string | null;
  assignedAt: string;
};

/**
 * Cấu hình chiến dịch "tặng mã giữ khách" — trang `Khuyến mãi › Tặng mã giữ khách`.
 * Ba cột tiền là `numeric` ở Postgres nên API trả về dạng CHUỖI; type khai
 * `number | string` để chỗ đọc buộc phải đi qua `Number()`.
 */
export type VoucherCampaign = {
  id: string;
  isActive: boolean;
  discountType: 'FIXED' | 'PERCENTAGE';
  discountValue: number | string;
  maxDiscount: number | string | null;
  minOrderValue: number | string;
  /** N — số ngày sống của mã kể từ lúc tặng. */
  validDays: number;
  /** Loại dịch vụ được tặng. Mảng rỗng = mọi loại. */
  serviceTypes: string[];
  maxGrantsPerUser: number | null;
  maxGrantsPerUserWindowDays: number | null;
  maxTotalGrants: number | null;
  /** Khoảng cách tối thiểu giữa hai lần BÁO cho cùng một khách. */
  minNotifyGapMinutes: number;
  popupGrantedTitle: string;
  popupGrantedBody: string;
  popupReminderTitle: string;
  popupReminderBody: string;
  pushTitle: string;
  pushBody: string;
};

export type VoucherCampaignStats = {
  /** Số MÃ đã sinh (đếm mã, không đếm lượt báo). */
  granted: number;
  /** Số mã đã tiêu trên một chuyến chưa huỷ. */
  used: number;
  usedRate: number;
  /** Tổng tiền giảm THỰC TẾ, không phải discountValue × số mã. */
  totalDiscount: number;
  /** Mã chưa tiêu và còn hạn. */
  active: number;
};

/** App nào nhận thông báo. Lọc theo BẢN CÀI APP, không theo vai trò tài khoản. */
export type NotificationAppTarget = 'CUSTOMER' | 'DRIVER';

export type NotificationTargetType = 'ALL' | 'APP' | 'ROLE' | 'SPECIFIC_USERS';

export type NotificationTargetData = {
  /** targetType=APP */
  appId?: NotificationAppTarget;
  /** targetType=ROLE — chỉ còn ở các lịch cũ, form không tạo mới nữa. */
  role?: 'USER' | 'DRIVER';
  loyaltyTier?: 'MEMBER' | 'SILVER' | 'GOLD' | 'DIAMOND';
  /** targetType=SPECIFIC_USERS */
  userIds?: string[];
}

export type ScheduledNotification = {
  id: number;
  title: string;
  body: string;
  imageUrl?: string;
  // FAILED = backend đã tạo dòng nhưng AWS từ chối lịch. Trước đây trường hợp này
  // bị ghi ACTIVE kèm ARN giả 'local-sched-*' nên không ai biết lịch không chạy.
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  scheduleArn?: string | null;
  scheduleTime?: string | null; // ISO String (UTC) — hiển thị theo giờ VN
  cronExpression?: string | null;
  targetType?: NotificationTargetType;
  targetData?: NotificationTargetData | null;
  createdAt: string;
}

export type NotificationAudience = {
  /** Số thiết bị nhận được push (có endpoint SNS). */
  devices: number;
  /** Số người nhận (dòng trong tab thông báo). */
  users: number;
}

export type GetApiResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type FeedbackCategory =
  | 'APP_BUG'
  | 'FEATURE_REQUEST'
  | 'PAYMENT'
  | 'CUSTOMER_ISSUE'
  | 'DISPATCH'
  | 'OTHER';

export type DriverFeedback = {
  id: string;
  driverId: string;
  category: FeedbackCategory;
  content: string;
  createdAt: string;
  driver?: {
    id: string;
    userId: string;
    user?: {
      id: string;
      fullName: string | null;
      phone: string;
    };
  };
};


// --- Cancel-leakage detection (anti-fraud) ---
// Values mirror the backend enums exactly (leakage-trace.entity.ts).
export type LeakageVerdict = 'PICKUP_DROPOFF_UNEXPLAINED' | 'PICKUP_ONLY' | 'WENT_DARK';
export type LeakageTraceStatus = 'NEW' | 'REVIEWED' | 'DISMISSED' | 'CONFIRMED';

/** A near-hit sample captured at the tick it happened. Coordinates exist only at
 *  that instant (Redis GEO is overwritten per ping), so this is the sole record. */
export type LeakageHit = {
  ts: string;
  lat: number;
  lng: number;
  distanceM: number;
  servingAtHit: boolean;
  /** Upper bound on the sample's staleness (DRIVER_ALIVE_TTL_SEC), not an exact age. */
  maxSampleAgeSec?: number;
};

export type LeakageEvidence = {
  nearPickupAt?: string | null;
  nearPickupServing?: boolean | null;
  nearDropoffAt?: string | null;
  nearDropoffServing?: boolean | null;
  wentDark?: boolean;
  watchType?: 'IMMEDIATE' | 'SCHEDULED_DEFERRED';
  pickupHit?: LeakageHit;
  dropoffHit?: LeakageHit;
};

export type LeakageTraceRow = {
  id: string;
  watchId: string;
  bookingId: string;
  /** Driver entity id (Driver.id, NOT User.id). Kept for backend correlation;
   *  deep-links use driver.userId via /users/detail/?id= — /drivers/{id} does not exist. */
  driverEntityId: string;
  customerId: string | null;
  /** When the customer cancelled = when the incident happened. Filter/sort key. */
  eventAt: string | null;
  /** When the verdict was written (watch window close). Secondary. */
  createdAt: string;
  verdict: LeakageVerdict;
  confidence: 'HIGH' | 'LOW';
  status: LeakageTraceStatus;
  evidence?: LeakageEvidence | null;
  driver: { userId: string; fullName?: string | null; phone?: string | null } | null;
  customer: { userId: string; fullName?: string | null; phone?: string | null } | null;
  booking: {
    id: string;
    pickupAddress?: any;
    dropoffAddress?: any;
    cancelledAt?: string | null;
    cancelReason?: string | null;
    scheduledTime?: string | null;
  } | null;
};

/** Trạng thái admin check tay 1 case tỉ lệ huỷ (auto-enforcement chưa bật). */
export type DriverCancelCheckStatus = 'CHECKING' | 'CHECKED';

export type DriverCancelStat = {
  driverEntityId: string;
  driverUserId: string;
  fullName: string | null;
  phone: string;
  assignedTrips: number;
  customerCancels: number;
  ratePct: number;
  cancelRuleAStrikes: number;
  suspendedUntil: string | null;
  isBanned: boolean;
  depositForfeitFlagged: boolean;
  lastAlertReason: string | null;
  lastAlertAt: string | null;
  // Check-workflow (optional — backend cũ chưa trả các field này).
  checkStatus?: DriverCancelCheckStatus | null;
  checkNote?: string | null;
  checkBy?: string | null;
  checkAt?: string | null;
  /** Đã CHECKED nhưng có khách-huỷ MỚI sau mốc check → cần check lại. */
  hasNewCancelsSinceCheck?: boolean;
};

/** Một dòng lịch sử check của admin (append-only, mới nhất trước). */
export type DriverCancelCheckEvent = {
  id: string;
  status: DriverCancelCheckStatus;
  note: string | null;
  createdAt: string;
  byAdminName: string | null;
};

/** One customer-cancelled trip for a driver, anchored on `cancelledAt` — NOT
 *  the same population as DriverCancelStat.customerCancels (that one filters
 *  out VINOW + test bookings and anchors on createdAt). See driver-detail-sheet.tsx. */
export type DriverCancelTrip = {
  bookingId: string;
  cancelledAt: string;
  acceptedAt: string | null;
  minutesToCancel: number | null;
  secondsToCancel: number | null;
  durationFromCreated: boolean;
  cancelReason: string | null;
  cancelledByRole: string | null;
  pickupAddress: any;
  dropoffAddress: any;
  isVinow: boolean;
};

/** Chỉ số vận hành. `null` = CHƯA CÓ DỮ LIỆU (không phải 0) — xem
 *  src/lib/driver-reputation-format.ts, hiển thị "Đang thu thập". */
export type DriverReputationOps = {
  /** 0..1 */
  acceptRate: number | null;
  /** 0..1 */
  onTimeRate: number | null;
  /** 0..1 */
  completionRate: number | null;
};

/** Điểm uy tín + đánh giá của một tài xế (bản đầy đủ — admin & chính tài xế). */
export type DriverReputation = {
  driverId: string;
  /** 0..100 */
  score: number;
  /** 0..5 — dùng để xếp hạng ở BACKEND. Client giai đoạn 1 CHỈ hiển thị. */
  bayesStars: number;
  /** null = CHƯA ĐỦ đánh giá để công khai → hiện "Chưa có đánh giá", KHÔNG hiện 0. */
  displayStars: number | null;
  ratingCount: number;
  hasEnoughRatings: boolean;
  /** { "1": n, "2": n, "3": n, "4": n, "5": n } */
  distribution: Record<string, number>;
  ops: DriverReputationOps;
  /** Chỉ số CHƯA CÓ DỮ LIỆU: 'accept' | 'onTime' | 'completion' | 'star'. */
  collecting: string[];
  usedComponents: string[];
  lastRatingAt: string | null;
};

/** Một lượt khách đánh giá chuyến. */
export type DriverTripRating = {
  id: string;
  bookingId: string;
  driverId: string;
  customerId: string;
  /** 1..5 */
  stars: number;
  comment: string | null;
  tags: string[] | null;
  serviceType: string | null;
  /** false = KHÔNG tính vào điểm; lý do loại trừ nằm ở `excludeReason`. */
  isCounted: boolean;
  excludeReason: string | null;
  tripCompletedAt: string | null;
  createdAt: string;
};

/** Một dòng bảng xếp hạng điểm uy tín (GET /admin/driver-reputation).
 *  Bản RÚT GỌN — cố ý KHÔNG có 3 chỉ số vận hành: mỗi tài cần 3 truy vấn riêng
 *  nên một trang 20 dòng là 60 truy vấn (xem comment ở controller backend).
 *  Xem chỉ số vận hành ở khối "Điểm & đánh giá" trong chi tiết tài xế. */
export type DriverReputationRankRow = {
  driverId: string;
  fullName: string | null;
  phone: string | null;
  ratingCount: number;
  /** null = CHƯA đủ đánh giá để công khai → "Chưa có đánh giá", KHÔNG hiện 0 sao. */
  displayStars: number | null;
  /** Sao Bayes — backend dùng để XẾP HẠNG. Client chỉ hiển thị/không xếp lại. */
  bayesStars: number | null;
  lastRatingAt: string | null;
};

export type DriverReputationRanking = {
  items: DriverReputationRankRow[];
  total: number;
  /** Ngưỡng số đánh giá tối thiểu để công khai sao (từ system_config). */
  minRatingsToShow: number;
};

/** Một đánh giá trong feed "Đánh giá gần đây" toàn hệ thống
 *  (GET /admin/driver-reputation/ratings/recent) — DriverTripRating rút gọn,
 *  KHÔNG có customerId/tags/tripCompletedAt, nhưng kèm tên + SĐT tài xế. */
export type RecentDriverRating = {
  id: string;
  bookingId: string;
  driverId: string;
  /** 1..5 */
  stars: number;
  comment: string | null;
  serviceType: string | null;
  /** false = KHÔNG tính vào điểm; lý do ở `excludeReason`. */
  isCounted: boolean;
  excludeReason: string | null;
  createdAt: string;
  driverName: string | null;
  driverPhone: string | null;
};

// ---- Đội tài chuyên nghiệp (/driver-team) ----

/** Bậc pipeline tuyển đội tài. null (không có row) = "Tiềm năng" — xem spec §4.1. */
export type DriverTeamStage = 'CONTACTED' | 'INVITED' | 'JOINED' | 'DECLINED' | 'DROPPED';

export type DriverTeamEventType = 'STAGE_CHANGE' | 'CALL' | 'NOTE' | 'ASSIGN' | 'FOLLOW_UP';

export type TeamMemberState = {
  stage: DriverTeamStage;
  /**
   * Tỉnh admin giao cho tài (mã gis 2 chữ số, '01' = Nội đô Hà Nội). Thay `assignedRouteIds`
   * (tuyến đã bỏ — backend luôn trả `[]`). Optional để backend cũ chưa có field không làm vỡ màn.
   */
  assignedProvinceCodes?: string[];
  ownerAdminUserId: string | null;
  ownerAdminName: string | null;
  nextFollowUpAt: string | null;
  note: string | null;
  stageChangedAt: string | null;
  /** null = chưa set (dùng mức chung); 0 là giá trị HỢP LỆ nghĩa "miễn hoa hồng". */
  commissionRate?: number | null;
};

/**
 * Một dòng cấp 1 theo TỈNH. provinceCode null = hàng "Chưa xác định tỉnh". Chuyến X↔Y được đếm ở CẢ
 * dòng X lẫn dòng Y nên cộng các dòng ra số LỚN HƠN tổng chuyến (xem `bucketNote` của response).
 */
export type TeamProvinceRow = {
  provinceCode: string | null;
  provinceName: string;
  driverCount: number;
  /** Đếm theo completedAt. KHÁC mốc với totalBookings — đừng chia cho nhau. */
  completedTrips: number;
  /** Đếm theo createdAt. */
  totalBookings: number;
  lastCompletedAt: string | null;
  contactedCount: number;
  joinedCount: number;
  /** Số tài KHỚP từ khoá tìm tài xế ở tỉnh này; 0 khi không tìm kiếm. */
  matchedDriverCount: number;
};

/** Một dòng cấp 2 — cặp (tài × tỉnh). */
export type TeamDriverRow = {
  driverId: string;
  fullName: string | null;
  phone: string | null;
  transportCompanyName: string | null;
  /** Số chuyến của tài TRONG tỉnh đang xem. */
  tripsInProvince: number;
  /** Tổng chuyến của tài trong kỳ, mỗi chuyến một lần (không phải tổng các tỉnh). */
  tripsAll: number;
  /** 0..1, backend tính sẵn. */
  shareOfProvince: number;
  lastCompletedAt: string | null;
  /** Chuyến đầu tiên TRONG KỲ đang lọc, không phải chuyến đầu tiên từng chạy. */
  firstCompletedAt: string | null;
  isApproved: boolean;
  isBanned: boolean;
  suspendedUntil: string | null;
  /** null = chưa chạm tới = Tiềm năng. */
  team: TeamMemberState | null;
};

/**
 * Thẻ số theo TỪNG TẦNG pipeline. Cố ý không có một con số "đã liên hệ" gộp:
 * gộp lại thì tài đã Từ chối/Loại bị đếm chung với tài đang chăm.
 */
export type TeamSummary = {
  driversWithCompletedTrips: number;
  /** Có chuyến hoàn thành trong kỳ nhưng CHƯA có row pipeline. */
  notContactedDrivers: number;
  contactedDrivers: number;
  invitedDrivers: number;
  joinedDrivers: number;
  declinedDrivers: number;
  droppedDrivers: number;
  followUpDueToday: number;
};

export type DriverTeamEvent = {
  id: string;
  driverId: string;
  type: DriverTeamEventType;
  fromStage: DriverTeamStage | null;
  toStage: DriverTeamStage | null;
  note: string | null;
  byAdminUserId: string | null;
  createdAt: string;
};

/** Chuyến hoàn thành trong kỳ của một tài ở một tỉnh (chuyến X↔Y nằm ở cả X và Y). */
export type TeamProvinceRun = {
  /** null = chuyến chưa xác định tỉnh. */
  provinceCode: string | null;
  provinceName: string;
  trips: number;
};

export type DriverTeamDetail = {
  team: TeamMemberState | null;
  events: DriverTeamEvent[];
  /** Tỉnh thực chạy trong kỳ. Backend cũ chưa có field này → coi như rỗng. */
  provincesRun?: TeamProvinceRun[];
  /** Tỉnh tài ĐĂNG KÝ hoạt động (driver_service_provinces) — đối chiếu với provincesRun. */
  registeredProvinceCodes?: string[];
  /** Cùng độ dài + thứ tự với registeredProvinceCodes. */
  registeredProvinceNames?: string[];
  /** Câu giải thích luật đếm theo tỉnh, do backend trả kèm. */
  bucketNote?: string;
};

export type TeamOwner = { id: string; fullName: string | null; phone: string | null };

/**
 * Dòng danh sách thành viên đội — trả về từ GET /admin/driver-team/members, đi
 * thẳng từ driver_team_member (KHÔNG từ booking). commissionRate: null = chưa
 * set (dùng mức chung); 0 là giá trị HỢP LỆ nghĩa "miễn hoa hồng" — khác nhau,
 * đừng gộp bằng `||`.
 */
export type TeamMemberRow = {
  driverId: string;
  fullName: string | null;
  phone: string | null;
  stage: DriverTeamStage;
  commissionRate: number | null;
  ownerAdminUserId: string | null;
  ownerName: string | null;
  /** Tỉnh được giao (mã gis). Optional: backend cũ chỉ có assignedRouteIds/Names (luôn rỗng giờ). */
  assignedProvinceCodes?: string[];
  /** Cùng độ dài + cùng thứ tự với assignedProvinceCodes ('01' = "Nội đô Hà Nội"). */
  assignedProvinceNames?: string[];
  nextFollowUpAt: string | null;
  stageChangedAt: string | null;
  createdAt: string;
  completedTripsInRange: number;
  lastCompletedAt: string | null;
};

// ───────── PRICING MACRO 2-TIER (TỈNH -> XÃ) TYPES ─────────

/**
 * `MIN_FLOOR`/`MAX_CEILING` chỉ còn để ĐỌC/hiển thị luật cũ: backend không còn áp và từ chối tạo mới
 * (spec bỏ-tuyến §5). Form tạo/sửa chỉ được đưa ra DELTA_AMOUNT và PERCENTAGE.
 */
export type MacroAdjustmentType = 'DELTA_AMOUNT' | 'PERCENTAGE' | 'MIN_FLOOR' | 'MAX_CEILING';

/** Cảnh báo KHÔNG chặn của backend khi lưu luật (xung đột cùng cặp tỉnh, % lọt băng chặn, rút gọn). */
export type MacroRuleWarning = {
  code: 'XUNG_DOT_CUNG_CAP' | 'XUNG_DOT_KHAC_CAP' | 'PHAN_TRAM_NGOAI_BANG' | 'RUT_GON' | string;
  message: string;
  ruleId: number | null;
};

export type PricingMacroRule = {
  id: number;
  name: string;
  isActive: boolean;
  priority: number;
  serviceType: string;
  vehicleType: string;
  originProvinceCode?: string | null;
  originWardCode?: string | null;
  destProvinceCode?: string | null;
  destWardCode?: string | null;
  adjustmentType: MacroAdjustmentType;
  adjustmentValue: number;
  applyPerSeat: boolean;
  /** Luật hai chiều: khớp cả hướng ngược (trả→đón). Backend cũ không có field này (coi như false). */
  isBidirectional?: boolean;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Tên phường/xã hoặc điểm đặc biệt (chỉ có trong danh sách phân trang của backend mới). */
  originWardName?: string;
  destWardName?: string;
};

/** `GET /pricing/macro-rules?page&limit&search`. */
export type PricingMacroRulePage = {
  items: PricingMacroRule[];
  total: number;
  page: number;
  limit: number;
};

/** Một đầu của tổ hợp tạo hàng loạt: tỉnh và/hoặc phường/xã. Bỏ trống cả hai = "bất kỳ". */
export type MacroEndSelector = {
  provinceCode?: string | null;
  wardCode?: string | null;
};

export type BulkCreatePricingMacroRulesRequest = {
  /** Tuỳ chọn (admin không còn nhập; backend cũ vẫn đòi — deploy backend TRƯỚC). */
  namePrefix?: string;
  isActive?: boolean;
  priority?: number;
  serviceType?: string;
  vehicleType?: string;
  adjustmentType: MacroAdjustmentType;
  adjustmentValue: number;
  applyPerSeat?: boolean;
  isBidirectional?: boolean;
  note?: string | null;
  /** Bỏ trống = mọi điểm đón (không được trống cả hai bên). */
  origins?: MacroEndSelector[];
  dests?: MacroEndSelector[];
};

/** Tổ hợp BỊ BỎ QUA khi tạo hàng loạt (không ghi đè luật đang có). */
export type BulkMacroSkippedItem = {
  origin: MacroEndSelector;
  dest: MacroEndSelector;
  reason: 'TRUNG_KHOA' | 'TRUNG_TRONG_YEU_CAU';
  message: string;
  blockedBy?: {
    id: number | null;
    name: string;
    isActive: boolean;
    isBidirectional: boolean;
    adjustmentType: MacroAdjustmentType;
    adjustmentValue: number;
  };
};

export type BulkCreatePricingMacroRulesResult = {
  created: PricingMacroRule[];
  skipped: BulkMacroSkippedItem[];
  /** Chỉ có ở backend mới (thêm field, không đổi shape cũ). */
  warnings?: MacroRuleWarning[];
};

/** Luật vừa lưu + cảnh báo không chặn (backend cũ không trả `warnings`). */
export type SavedPricingMacroRule = PricingMacroRule & { warnings?: MacroRuleWarning[] };

/** `GET /pricing/macro-rules/band-warnings`: luật % đang bật lọt ngoài băng chặn kết quả. */
export type MacroBandWarnings = {
  band: { minRatio?: number; maxRatio?: number; minAbsolute?: number; maxAbsolute?: number };
  warnings: MacroRuleWarning[];
};

export type BulkDeletePricingMacroRulesResult = {
  deleted: number[];
  missing: number[];
};

export type ProvinceOption = {
  code: string;
  name: string;
};

export type WardOption = {
  code: string;
  name: string;
  provinceCode: string;
};

/** Điểm đặc biệt (sân bay…) — `GET pricing/special-zones`. Polygon KHÔNG có API (chỉ nạp bằng migration). */
export type SpecialZone = {
  code: string;
  name: string;
  provinceCode: string;
  provinceName: string | null;
  /** Loại vùng (vd 'AIRPORT'); giữ string vì DB có thể chứa loại màn chưa biết. */
  kind: string;
  active: boolean;
};

/** Một hàng đồng giá — `wardCode` null = hàng mặc định cho cả tỉnh của vùng. Giá null = không áp cho loại đó. */
export type SpecialZoneFlatPrice = {
  id: number;
  zoneCode: string;
  wardCode: string | null;
  wardName: string | null;
  pricePerSeatGhep: number | null;
  priceCar4: number | null;
  priceCar7: number | null;
  note: string | null;
  createdAt?: string;
  updatedAt?: string;
};

/** Body `PUT pricing/special-zones/:code/flat-prices` — ghi đè CẢ hàng; 4 khoá đầu BẮT BUỘC có mặt (null được). */
export type UpsertSpecialZoneFlatPriceRequest = {
  wardCode: string | null;
  pricePerSeatGhep: number | null;
  priceCar4: number | null;
  priceCar7: number | null;
  note?: string | null;
};

export type SimulatePricingMacroDto = {
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  serviceType?: string;
  vehicleType?: string;
  seats?: number;
};

export type SimulatePricingMacroResult = {
  origin: {
    wardCode: string;
    wardName: string;
    provinceCode: string;
    provinceName: string;
  } | null;
  dest: {
    wardCode: string;
    wardName: string;
    provinceCode: string;
    provinceName: string;
  } | null;
  matchedRule: PricingMacroRule | null;
  matchScore: number | null;
  /** FORWARD = đón→trả như luật nhập; REVERSE = hướng đảo của luật hai chiều. */
  matchedOrientation?: 'FORWARD' | 'REVERSE' | null;
  quote: any;
};


/** Nhóm xã do admin đặt (`GET pricing/ward-groups`). `staleCodes` = mã xã không còn trong dữ liệu ranh giới. */
export type WardGroup = {
  id: number;
  name: string;
  note: string | null;
  wardCodes: string[];
  wardCount: number;
  staleCodes: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertWardGroupRequest = { name: string; note?: string | null; wardCodes: string[] };

export type WardLegacyDistrict = { code: string; name: string; wardCount: number; pureWardCount: number };
export type WardLegacyProvince = {
  code: string;
  name: string;
  wardCount: number;
  pureWardCount: number;
  districts: WardLegacyDistrict[];
};

/** Xã mới kèm vùng cũ. `selectable=false`: xã KHÔNG thuần ở mức đang lọc (gộp từ nhiều huyện/tỉnh cũ). */
export type WardLegacyWard = {
  wardCode: string;
  wardName: string;
  provinceCode: string;
  provinceName: string;
  provinceLevel: 'PURE_PROVINCE' | 'CROSS_PROVINCE';
  districtLevel: 'PURE_DISTRICT' | 'MIXED_DISTRICT';
  selectable: boolean;
  parts: {
    legacyProvinceCode: string;
    legacyProvinceName: string;
    legacyDistrictCode: string;
    legacyDistrictName: string;
    legacyWardNames: string[];
    hasPartial: boolean;
  }[];
};
