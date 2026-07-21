
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

export type Role = {
  id: string;
  name: 'Admin' | 'Editor' | 'Viewer';
  description: string;
  userCount: number;
  permissions: Permission[];
};

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
  shareLink?: string;
  createdAt: string;
  updatedAt?: string;
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
}

export type Permission =
  | 'users:create' | 'users:read' | 'users:update' | 'users:delete'
  | 'content:create' | 'content:read' | 'content:update' | 'content:delete'
  | 'roles:create' | 'roles:read' | 'roles:update' | 'roles:delete'
  | 'reports:generate' | 'analytics:view'
  | 'settings:update';

export const allPermissions: Permission[] = [
  'users:create', 'users:read', 'users:update', 'users:delete',
  'content:create', 'content:read', 'content:update', 'content:delete',
  'roles:create', 'roles:read', 'roles:update', 'roles:delete',
  'reports:generate', 'analytics:view',
  'settings:update'
];

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

export type ScheduledNotification = {
  id: number;
  title: string;
  body: string;
  imageUrl?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  scheduleArn?: string;
  scheduleTime?: string; // ISO String
  cronExpression?: string;
  createdAt: string;
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
