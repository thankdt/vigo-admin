
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

export type Role = {
  id: string;
  name: 'Admin' | 'Editor' | 'Viewer';
  description: string;
  userCount: number;
  permissions: Permission[];
};

export type Driver = {
  id: string;
  name?: string;
  phone?: string;
  walletBalance?: number;
  isApproved: 'true' | 'false' | 'pending' | '-' | string;
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
}

export type BookingStatus = 'CREATED' | 'SEARCHING' | 'PENDING_MATCHING' | 'ACCEPTED' | 'ARRIVED' | 'PICKED_UP' | 'COMPLETED' | 'CANCELLED' | 'DELIVERY_FAILED' | 'SCHEDULED' | 'DELAYED_WAITING';

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
  customer: {
    id: string;
    fullName: string;
    phone: string;
    role?: string;
    email?: string | null;
  } | null;
  driver?: {
    id: string;
    fullName?: string;
    name?: string;
    phone: string;
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
};

export type Route = {
  id: number;
  name: string;
  districts: AdminUnit[];
  imageUrl?: string;
  imageKey?: string;
}

export type RoutePricing = {
  id: number;
  routeId: number;
  adminUnitId: number;
  startDistrictId?: number; // Optional: ID for Start District
  price: number;
  priority: number;
  serviceType?: 'DELIVERY' | 'CARPOOL' | 'RIDE';
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

