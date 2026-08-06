
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
  rejectionReason?: string | null;
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
  fixedRouteId?: number;
  enabledServices?: string[];
  isSubmittedForApproval?: boolean;
  createdAt?: string;
  fixedRoute?: {
    id: number;
    name: string;
  };
  // Multi-route: backend started returning the M2M `routes` collection
  // alongside the legacy `fixedRoute`. Old admin code only reads
  // `fixedRoute`; new components prefer `routes` and fall back when empty.
  routes?: {
    id: number;
    name: string;
  }[];
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
  note?: string | null;
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
  } | null;
  priceBreakdown?: PriceBreakdown | null;
  driverEarnings?: DriverEarnings;
  finalPriceVAT?: number;
  distanceKm?: number;
  // Defined route this trip priced against. null = legacy booking from
  // before the routeId column existed, or runtime fell through to km-based
  // pricing because nothing in defined_routes matched.
  routeId?: number | null;
  route?: { id: number; name: string } | null;
  // Vi-now: customer shows a 6-digit code to a nearby driver to claim the
  // trip directly, bypassing dispatch. Admin needs to spot these at a
  // glance because the customer journey + UI flow differ from a normal
  // dispatched booking.
  isVinow?: boolean;
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
}

/** Trạng thái CSKH gọi check khách. Luồng: (chưa gọi) → CLAIMED (đã nhận gọi) →
 *  CALLED (gọi được) / UNREACHED (không liên lạc được). */
export type CustomerCallStatus = 'CLAIMED' | 'CALLED' | 'UNREACHED';

/** Giá trị filter cột "Gọi check" ngoài danh sách. */
export type CustomerCallFilter = 'claimed' | 'called' | 'unreached' | 'uncalled';

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
}

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
