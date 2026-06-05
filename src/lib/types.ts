
export type User = {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Editor' | 'Viewer' | 'USER' | 'DRIVER'; // Added USER and DRIVER from API
  status: 'Active' | 'Inactive';
  avatarUrl: string;
  lastLogin: string;
  phone?: string; // From API response
  isLocked: boolean; // From API response
  createdAt?: string;
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
  enabledDropoffDistricts?: number[];
  fixedRouteId?: number;
  enabledServices?: string[];
  isSubmittedForApproval?: boolean;
  createdAt?: string;
  fixedRoute?: {
    id: number;
    name: string;
  };
  transportCompanyId?: string;
  transportCompany?: TransportCompany;
  customTransportCompanyName?: string;
  isIndependentDriver?: boolean;
  issues?: string[];
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
};

export type DriverEarnings = {
  grossPrice: number;
  commissionRate: number;          // 0..1, e.g. 0.15 — base rate before VAT roll-in
  commissionAmount: number;        // commission + commission VAT combined
  grossEarnings: number;           // grossPrice - commissionAmount
  personalIncomeTaxRate: number;
  personalIncomeTaxAmount: number;
  netEarnings: number;             // grossEarnings - personalIncomeTaxAmount
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
  isPooled?: boolean;
  requestedSeats?: number;
  requestedVehicleType?: string | null;
  paymentMethod?: string;
  cancelReason?: string | null;
  note?: string | null;
  shareLink?: string;
  createdAt: string;
  updatedAt?: string;
  // Scheduled pickup time set by the customer (null/undefined = ride is "now").
  scheduledTime?: string | null;
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
  name: string;
  discountType: 'FIXED_AMOUNT' | 'PERCENTAGE';
  discountValue: number;
  minOrderValue: number;
  startDate: string;
  endDate: string;
  usageLimit: number;
  usageCount: number;
  pointCost: number;

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

