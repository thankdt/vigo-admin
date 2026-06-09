'use client';
import { Driver, User, Booking, AdminUnit, Route, RoutePricing, BookingStatus, SystemConfig, Promotion, ScheduledNotification, News, Banner, TransportCompany, AppPopup } from '@/lib/types';

export const API_BASE_URL = 'https://api.vigogroup.vn';

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData) && !(options.body instanceof File)) {
    headers.set('Content-Type', 'application/json');
  }

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/') {
        const refreshToken = localStorage.getItem('refresh_token');

        if (refreshToken && !url.includes('/auth/refresh')) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            }).then(() => {
              return fetchWithAuth(url, options);
            }).catch(err => {
              throw err;
            });
          }

          isRefreshing = true;

          try {
            const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });

            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              const newAccessToken = refreshData.data?.access_token || refreshData.access_token;

              if (newAccessToken) {
                localStorage.setItem('access_token', newAccessToken);
                if (refreshData.data?.refresh_token) {
                  localStorage.setItem('refresh_token', refreshData.data.refresh_token);
                }
                processQueue(null, newAccessToken);
                return fetchWithAuth(url, options);
              }
            }

            throw new Error('Refresh failed');
          } catch (refreshError) {
            processQueue(refreshError, null);
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            window.location.href = '/';
            // Return a never-resolving promise to prevent further error propagation during redirect
            return new Promise<Response>(() => {});
          } finally {
            isRefreshing = false;
          }
        } else {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/';
          // Return a never-resolving promise to prevent further error propagation during redirect
          return new Promise<Response>(() => {});
        }
      }

      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(JSON.stringify(errorData) || 'An API error occurred');
    }

    return response;
  } catch (error) {
    throw error;
  }
}

export async function getPresignedUrl(filename: string, contentType: string): Promise<{ url: string; key: string }> {
  // ... (unchanged)
  const finalContentType = contentType || 'application/octet-stream';
  console.log('[S3] Requesting presigned URL for:', filename, 'Type:', finalContentType);

  const response = await fetchWithAuth('/s3/presigned-url', {
    method: 'POST',
    body: JSON.stringify({ filename, contentType: finalContentType }),
  });
  const result = await response.json();
  console.log('[S3] Presigned URL result:', result);
  return result.data;
}

export async function uploadToS3(url: string, file: File): Promise<Response> {
  const contentType = file.type || 'application/octet-stream';
  console.log('[S3] Uploading file to:', url);
  console.log('[S3] File Details - Name:', file.name, 'Size:', file.size, 'Type:', contentType);

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[S3] Upload Failed. Status:", response.status, "Error:", errorText);
    throw new Error(`Failed to upload file to S3. Status: ${response.status}`);
  }

  console.log('[S3] Upload Successful');
  return response;
}


export async function login(phone: string, pass: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone, pass }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(errorData.message || 'Login failed');
  }

  const responseData = await response.json();
  if (responseData.data && responseData.data.access_token && typeof window !== 'undefined') {
    localStorage.setItem('access_token', responseData.data.access_token);
    if (responseData.data.refresh_token) {
      localStorage.setItem('refresh_token', responseData.data.refresh_token);
    }
  }
  return responseData;
}

type GetApiResponse<T> = {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
  }
}

export async function getUsers(params: { page?: number; limit?: number; search?: string; role?: string } = {}): Promise<GetApiResponse<User>> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
    ...(params.search && { search: params.search }),
    ...(params.role && { role: params.role }),
  });

  const response = await fetchWithAuth(`/users/admin/list?${query.toString()}`);
  return response.json();
}

export async function lockUser(id: string): Promise<void> {
  await fetchWithAuth(`/users/admin/${id}/lock`, { method: 'POST' });
}

export async function unlockUser(id: string): Promise<void> {
  await fetchWithAuth(`/users/admin/${id}/unlock`, { method: 'POST' });
}

export type AdminUserDetail = {
  id: string;
  role: 'USER' | 'DRIVER' | 'ADMIN' | 'TRANSPORT_COMPANY_OWNER';
  phone: string;
  email?: string | null;
  fullName?: string | null;
  avatar?: string;
  isActive: boolean;
  loyaltyPoints: number;
  loyaltyTier: 'MEMBER' | 'SILVER' | 'GOLD' | 'DIAMOND';
  referralCode?: string | null;
  bankInfo?: { bankName: string; accountNumber: string; accountHolder: string } | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  wallets: { type: string; balance: number; lockedBalance: number }[];
  bookingCount: number;
  bookingCountByStatus: Record<string, number>;
  totalWithdrawn?: number;
};

export async function getAdminUserDetail(id: string): Promise<AdminUserDetail> {
  const response = await fetchWithAuth(`/users/admin/${id}`);
  // Backend TransformInterceptor wraps every response as { success, data, ... };
  // unwrap so callers can use the user shape directly. Fall back to the raw
  // body if a future endpoint stops wrapping.
  const json = await response.json();
  return json?.data ?? json;
}

export async function deleteAdminUser(id: string): Promise<{ success: boolean; message: string }> {
  const response = await fetchWithAuth(`/users/admin/${id}`, { method: 'DELETE' });
  const json = await response.json();
  // softDelete returns { success, message }; TransformInterceptor sees the
  // `message` key and re-wraps as { success: true, data: { success, message }, ... }.
  // Either shape is fine — unwrap if present.
  return json?.data ?? json;
}

export async function adminAdjustDriverWallet(driverId: string, body: {
  wallet: 'DRIVER_DEPOSIT' | 'DRIVER_MAIN';
  operation: 'credit' | 'debit';
  amount: number;
  note?: string;
  secondaryPassword: string;
}): Promise<{ wallet: string; operation: 'credit' | 'debit'; amount: number; newBalance: number }> {
  const response = await fetchWithAuth(`/wallets/admin/drivers/${driverId}/adjust`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return data.data || data;
}

export async function createAdminUser(body: {
  phone: string;
  password: string;
  fullName?: string;
  email?: string;
}): Promise<User> {
  const response = await fetchWithAuth('/users/admin/create', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return data.data || data;
}

export async function getDrivers(params: {
  page?: number;
  limit?: number;
  search?: string;
  isApproved?: 'true' | 'false' | 'pending' | 'unsubmitted';
  name?: string;
  phone?: string;
  plate?: string;
  transportCompanyId?: string;
  transportCompanyName?: string;
  fixedRouteId?: string;
  needsReview?: 'true' | 'false';
  unconfirmedTransportCompany?: 'true' | 'false';
  sort?: 'name' | 'isApproved' | 'createdAt';
  order?: 'asc' | 'desc';
} = {}): Promise<GetApiResponse<Driver>> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
  });
  if (params.search) query.set('search', params.search);
  if (params.isApproved) query.set('isApproved', params.isApproved);
  if (params.name) query.set('name', params.name);
  if (params.phone) query.set('phone', params.phone);
  if (params.plate) query.set('plate', params.plate);
  if (params.transportCompanyId) query.set('transportCompanyId', params.transportCompanyId);
  if (params.transportCompanyName) query.set('transportCompanyName', params.transportCompanyName);
  if (params.fixedRouteId) query.set('fixedRouteId', params.fixedRouteId);
  if (params.needsReview) query.set('needsReview', params.needsReview);
  if (params.unconfirmedTransportCompany) query.set('unconfirmedTransportCompany', params.unconfirmedTransportCompany);
  if (params.sort) query.set('sort', params.sort);
  if (params.order) query.set('order', params.order);

  const response = await fetchWithAuth(`/drivers/admin/list?${query.toString()}`);
  return response.json();
}

export async function approveDriver(id: string, enabledServices: string[]): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/approve`, { 
    method: 'POST',
    body: JSON.stringify({ enabledServices }),
  });
  const data = await response.json();
  return data.data || data;
}

export async function moveDriverBackToPending(id: string): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/move-back-to-pending`, {
    method: 'POST',
  });
  const data = await response.json();
  return data.data || data;
}

export async function rejectDriver(id: string, reason: string): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  const data = await response.json();
  return data.data || data;
}

export type DriverApprovalAction =
  | 'APPROVED'
  | 'REJECTED'
  | 'SUBMITTED'
  | 'MOVED_BACK_TO_PENDING';

export type DriverApprovalEvent = {
  id: string;
  driverId: string;
  action: DriverApprovalAction;
  reason: string | null;
  byAdminUserId: string | null;
  byAdmin?: {
    id: string;
    fullName?: string | null;
    phone?: string | null;
  } | null;
  createdAt: string;
};

export async function getDriverApprovalHistory(id: string): Promise<DriverApprovalEvent[]> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/approval-history`);
  const data = await response.json();
  return data.data || data;
}

export async function updateDriverServices(id: string, enabledServices: string[]): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/services`, {
    method: 'PATCH',
    body: JSON.stringify({ enabledServices }),
  });
  const data = await response.json();
  return data.data || data;
}

export async function updateDriverProfile(
  id: string,
  data: {
    fullName?: string;
    vehicleRegistration?: {
      plateNumber?: string;
      brand?: string;
      model?: string;
      color?: string;
    };
  },
): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/profile`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  const json = await response.json();
  return json.data || json;
}

export type AdminInvoiceRow = {
  id: string;
  tripDate: string;
  bookingCode: string;
  contractNo: string;
  pickupAddress: string;
  dropoffAddress: string;
  totalWithVat: number;
  vehiclePlate: string;
};

export type AdminInvoiceListResponse = {
  data: AdminInvoiceRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

// Returns a Blob of the contract PDF. Caller wires the download (object URL + click).
export async function downloadAdminContractPdf(bookingId: string): Promise<Blob> {
  const response = await fetchWithAuth(`/bookings/admin/${bookingId}/contract.pdf`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Không tải được hợp đồng (${response.status})`);
  }
  return response.blob();
}

export async function getAdminInvoices(params: {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  search?: string;
  transportCompanyId?: string;
  driverId?: string;
} = {}): Promise<AdminInvoiceListResponse> {
  const q = new URLSearchParams();
  q.set('page', String(params.page ?? 1));
  q.set('limit', String(params.limit ?? 20));
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.search) q.set('search', params.search);
  if (params.transportCompanyId) q.set('transportCompanyId', params.transportCompanyId);
  if (params.driverId) q.set('driverId', params.driverId);
  const response = await fetchWithAuth(`/bookings/admin/invoices?${q.toString()}`);
  return unwrap<AdminInvoiceListResponse>(response);
}

export async function getBookings(params: {
  page?: number;
  limit?: number;
  status?: string;
  customerId?: string;
  driverId?: string;
  processingState?: 'unclaimed' | 'claimed';
  // Numeric route id → exact match; 'none' → bookings with no route stamped
  // (legacy + routing-miss). Caller passes the raw value through.
  routeId?: number | 'none';
} = {}): Promise<{ data: Booking[]; total: number; page: number; limit: number; totalPages: number }> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
    ...(params.status && { status: params.status }),
    ...(params.customerId && { customerId: params.customerId }),
    ...(params.driverId && { driverId: params.driverId }),
    ...(params.processingState && { processingState: params.processingState }),
    ...(params.routeId !== undefined && { routeId: String(params.routeId) }),
  });

  const response = await fetchWithAuth(`/bookings/admin/list?${query.toString()}`);
  const result = await response.json();
  return {
    data: result.data || [],
    total: result.meta?.total ?? result.total ?? 0,
    page: result.meta?.page ?? result.page ?? 1,
    limit: result.meta?.limit ?? result.limit ?? 20,
    totalPages: result.meta?.totalPages ?? result.totalPages ?? 1,
  };
}

// Admin clicks "Nhận xử lý" on a PROCESSING booking — backend stamps
// adminClaimedAt/By, scheduler stops the 5-min auto-cancel + Telegram nags.
export async function claimProcessingBooking(id: string): Promise<Booking> {
  const response = await fetchWithAuth(`/bookings/admin/${id}/claim`, {
    method: 'POST',
  });
  const result = await response.json();
  return result.data || result;
}

export async function getBookingDetails(id: string): Promise<Booking> {
  const response = await fetchWithAuth(`/bookings/admin/${id}`);
  const result = await response.json();
  return result.data;
}

export async function updateBookingStatus(id: string, status: BookingStatus, note?: string): Promise<Booking> {
  const response = await fetchWithAuth(`/bookings/admin/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, ...(note && { note }) }),
  });
  const result = await response.json();
  return result.data;
}

export async function getAvailableDrivers(lat?: number, long?: number): Promise<Driver[]> {
  const query = new URLSearchParams();
  if (lat) query.set('lat', String(lat));
  if (long) query.set('long', String(long));
  const response = await fetchWithAuth(`/bookings/admin/available-drivers?${query.toString()}`);
  const result = await response.json();
  return result.data;
}

export async function reassignBooking(bookingId: string, driverId: string): Promise<Booking> {
  const response = await fetchWithAuth(`/bookings/admin/${bookingId}/reassign`, {
    method: 'PUT',
    body: JSON.stringify({ driverId }),
  });
  const result = await response.json();
  return result.data;
}

export async function createAdminBooking(data: {
  customerPhone: string;
  customerName?: string;
  pickupAddress: { address: string; lat: number; long: number };
  dropoffAddress: { address: string; lat: number; long: number };
  serviceType?: 'RIDE' | 'DELIVERY' | 'CARPOOL';
  note?: string;
  driverId?: string;
  // ISO 8601 timestamp (e.g. new Date(...).toISOString()). Omit for an
  // immediate (SEARCHING) booking; set for a SCHEDULED trip.
  scheduledTime?: string;
}): Promise<Booking> {
  const response = await fetchWithAuth('/bookings/admin/create', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data || result;
}

export async function adminAcceptBooking(bookingId: string): Promise<Booking> {
  const response = await fetchWithAuth(`/bookings/admin/${bookingId}/accept`, {
    method: 'POST',
  });
  const result = await response.json();
  return result.data || result;
}


// Master Data APIs
export async function getAdminUnits(): Promise<AdminUnit[]> {
  const response = await fetchWithAuth('/master-data/admin-units');
  const result = await response.json();
  return result.data;
}

export async function createAdminUnit(data: {
  name: string;
  level: 'PROVINCE' | 'DISTRICT' | 'WARD';
  parentId?: number;
  aliases?: string[];
  // Flip true when creating a POI (sân bay / điểm du lịch …). The pricing
  // manager filters its POI picker by this flag.
  isPoi?: boolean;
}): Promise<AdminUnit> {
  const response = await fetchWithAuth('/master-data/admin-units', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function getRoutes(includeDeleted = false): Promise<Route[]> {
  const url = includeDeleted
    ? '/master-data/routes?includeDeleted=true'
    : '/master-data/routes';
  const response = await fetchWithAuth(url);
  const result = await response.json();
  return result.data;
}

export async function createRoute(data: { name: string; districtIds: number[], basePolyline?: string, imageKey?: string }): Promise<Route> {
  const response = await fetchWithAuth('/master-data/routes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function updateRoute(id: number, data: { name: string, districtIds: number[], basePolyline?: string, imageKey?: string }): Promise<Route> {
  const response = await fetchWithAuth(`/master-data/routes/${id}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function deleteRoute(id: number): Promise<{ success: boolean; affectedDrivers: number }> {
  const response = await fetchWithAuth(`/master-data/routes/${id}/delete`, {
    method: 'POST',
  });
  const json = await response.json();
  return json?.data ?? json;
}

export async function restoreRoute(id: number): Promise<Route> {
  const response = await fetchWithAuth(`/master-data/routes/${id}/restore`, {
    method: 'POST',
  });
  const json = await response.json();
  return json?.data ?? json;
}

export type RouteUsage = {
  routeId: number;
  routeName: string;
  isDeleted: boolean;
  driverCount: number;
  pricingCount: number;
};

export async function getRouteUsage(id: number): Promise<RouteUsage> {
  const response = await fetchWithAuth(`/master-data/routes/${id}/usage`);
  const json = await response.json();
  return json?.data ?? json;
}


export async function getPricingByRoute(routeId: number, serviceType?: string, vehicleType?: string): Promise<RoutePricing[]> {
  const query = new URLSearchParams();
  if (serviceType) query.set('serviceType', serviceType);
  if (vehicleType) query.set('vehicleType', vehicleType);
  const queryStr = query.toString();
  const response = await fetchWithAuth(`/master-data/pricing/${routeId}${queryStr ? '?' + queryStr : ''}`);
  const result = await response.json();
  return result.data;
}

export async function createPricing(data: { routeId: number; adminUnitId: number; startDistrictId?: number | null; price: number; priority?: number; serviceType?: string; vehicleType?: string }): Promise<RoutePricing> {
  const response = await fetchWithAuth('/master-data/pricing', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function updatePricing(id: number, data: { price: number; serviceType?: string; vehicleType?: string }): Promise<RoutePricing> {
  const response = await fetchWithAuth(`/master-data/pricing/${id}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function deletePricing(id: number): Promise<void> {
  await fetchWithAuth(`/master-data/pricing/${id}/delete`, {
    method: 'POST',
  });
}


// System Config APIs
export async function getSystemConfigs(): Promise<SystemConfig[]> {
  const response = await fetchWithAuth('/master-data/system-config');
  const result = await response.json();
  return result.data;
}

export async function updateSystemConfig(key: string, value: string, description: string): Promise<SystemConfig> {
  const response = await fetchWithAuth('/master-data/system-config', {
    method: 'POST',
    body: JSON.stringify({ key, value, description }),
  });
  return response.json();
}

// Promotions API
export async function getVouchers(): Promise<Promotion[]> {
  const response = await fetchWithAuth('/promotions/management');
  const result = await response.json();
  return result.data;
}

export async function createVoucher(data: Omit<Promotion, 'id' | 'usageCount'>): Promise<Promotion> {
  const response = await fetchWithAuth('/promotions', {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      discountType: data.discountType === 'FIXED_AMOUNT' ? 'FIXED' : 'PERCENTAGE',
    }),
  });
  const result = await response.json();
  return result.data;
}

export async function updateVoucher(
  id: number,
  data: Partial<Omit<Promotion, 'id' | 'usageCount' | 'code'>>,
): Promise<Promotion> {
  // Same FIXED_AMOUNT → FIXED mapping as create. discountType is optional on
  // update so only translate when present.
  const body = {
    ...data,
    ...(data.discountType !== undefined && {
      discountType: data.discountType === 'FIXED_AMOUNT' ? 'FIXED' : 'PERCENTAGE',
    }),
  };
  const response = await fetchWithAuth(`/promotions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  const result = await response.json();
  return result.data ?? result;
}

// Scheduled Notifications API
export async function getScheduledNotifications(params: { page?: number; limit?: number } = {}): Promise<GetApiResponse<ScheduledNotification>> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
  });
  const response = await fetchWithAuth(`/notifications/schedule?${query.toString()}`);
  return response.json();
}

export async function createScheduledNotification(data: { title: string; body: string; imageUrl?: string; scheduleTime?: string; cronExpression?: string }): Promise<ScheduledNotification> {
  const response = await fetchWithAuth('/notifications/schedule', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result; // API returns the object directly usually, or wrapped. Based on user request "Response" section, it returns the object directly (or we assume standard wrapper).
  // Wait, the user guide says response is { id: 12, ... }. 
  // However, traditionally this codebase wraps in `data`. The user guide example might be simplified.
  // I'll check `getVouchers` above. it uses `result.data`.
  // I will return `result` for now but if it's wrapped I might need `result.data`.
  // User guide says:
  // {
  //   "id": 12,
  //   ...
  // }
  // So likely it is NOT wrapped in `data` for the CREATE response based on the text.
  // BUT the LIST response says "Returns a list...".
  // Let's assume consistent API wrapper unless stated otherwise, but the user example was explicit.
  // Actually, usually my `fetchWithAuth` wrapper throws if error.
  // Let's look at `createVoucher`: `return result.data`.
  // I will tread carefully. If the user provided example is exact, it's not wrapped.
  // But standard Vigo API seems to be wrapped.
  // The user wrote the guide, maybe they copied backend docs.
  // I'll assume standard `result.data` or `result` depending on if `data` key exists.
  // SAFEST: `return result.data || result;`
}

export async function cancelScheduledNotification(id: number): Promise<ScheduledNotification> {
  const response = await fetchWithAuth(`/notifications/schedule/${id}`, {
    method: 'DELETE',
  });
  const result = await response.json();
  return result.data || result;
}

// News API
export async function getNews(params: { page?: number; limit?: number } = {}): Promise<GetApiResponse<News>> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
  });
  const response = await fetchWithAuth(`/news/admin?${query.toString()}`);
  return response.json();
}

export async function createNews(data: { title: string; description: string; imageUrl?: string; link?: string; isActive?: boolean }): Promise<News> {
  const response = await fetchWithAuth('/news', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data || result;
}

export async function updateNews(id: number, data: { title?: string; description?: string; imageUrl?: string; link?: string; isActive?: boolean }): Promise<News> {
  const response = await fetchWithAuth(`/news/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data || result;
}

export async function deleteNews(id: number): Promise<void> {
  await fetchWithAuth(`/news/${id}`, {
    method: 'DELETE',
  });
}

// Banner API
export async function getBanners(): Promise<Banner[]> {
  const response = await fetchWithAuth('/banners/admin');
  // User said "Response: List of all banners". Assuming array or { data: [] }.
  const result = await response.json();
  return result.data || result;
}

export async function createBanner(data: { imageUrl: string; priority: number; isActive: boolean }): Promise<Banner> {
  const response = await fetchWithAuth('/banners', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data || result;
}

export async function updateBanner(id: number, data: { priority?: number; isActive?: boolean }): Promise<Banner> {
  const response = await fetchWithAuth(`/banners/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data || result;
}

export async function deleteBanner(id: number): Promise<void> {
  await fetchWithAuth(`/banners/${id}`, {
    method: 'DELETE',
  });
}

// App Popup API
export type AppPopupPayload = {
  imageUrl: string;
  linkUrl?: string | null;
  displayMode: 'ALWAYS' | 'DISMISSIBLE' | 'ONCE';
  audience: 'CUSTOMER' | 'DRIVER' | 'BOTH';
  isActive: boolean;
  priority: number;
  startAt?: string | null;
  endAt?: string | null;
};

export async function getAppPopups(): Promise<AppPopup[]> {
  const response = await fetchWithAuth('/app-popups/admin');
  const result = await response.json();
  return result.data || result;
}

export async function createAppPopup(data: AppPopupPayload): Promise<AppPopup> {
  const response = await fetchWithAuth('/app-popups', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data || result;
}

export async function updateAppPopup(id: string, data: Partial<AppPopupPayload>): Promise<AppPopup> {
  const response = await fetchWithAuth(`/app-popups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data || result;
}

export async function deleteAppPopup(id: string): Promise<void> {
  await fetchWithAuth(`/app-popups/${id}`, {
    method: 'DELETE',
  });
}

// ── Maps / Autocomplete ──────────────────────────────────────────────

export interface AutocompleteResult {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
  compound?: {
    district: string;
    commune: string;
    province: string;
  };
}

export interface PlaceDetail {
  place_id: string;
  formatted_address: string;
  name?: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  compound?: {
    district: string;
    commune: string;
    province: string;
  };
}

export async function searchAddress(input: string): Promise<AutocompleteResult[]> {
  const response = await fetchWithAuth(`/maps/autocomplete?input=${encodeURIComponent(input)}`);
  const result = await response.json();
  return result.data || result;
}

export async function getPlaceDetail(placeId: string): Promise<PlaceDetail> {
  const response = await fetchWithAuth(`/maps/place-detail?place_id=${encodeURIComponent(placeId)}`);
  const result = await response.json();
  return result.data || result;
}

// Transport Company APIs
export async function getTransportCompanies(params: { page?: number; limit?: number; search?: string } = {}): Promise<GetApiResponse<TransportCompany>> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
    ...(params.search && { search: params.search }),
  });
  const response = await fetchWithAuth(`/transport-companies/admin?${query.toString()}`);
  return response.json();
}

export async function createTransportCompany(data: { name: string; ownerName?: string; ownerPhone?: string; isActive?: boolean; htxCommissionRate?: number; taxCode?: string; address?: string; htxHotline?: string; accountingHotline?: string }): Promise<TransportCompany> {
  const response = await fetchWithAuth('/transport-companies', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data || result;
}

export async function getTransportCompany(id: string): Promise<TransportCompany> {
  const response = await fetchWithAuth(`/transport-companies/${id}`);
  const result = await response.json();
  return result.data || result;
}

export async function updateTransportCompany(id: string, data: { name?: string; ownerName?: string; ownerPhone?: string; isActive?: boolean; htxCommissionRate?: number; taxCode?: string; address?: string; htxHotline?: string; accountingHotline?: string }): Promise<TransportCompany> {
  const response = await fetchWithAuth(`/transport-companies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data || result;
}

export async function deleteTransportCompany(id: string): Promise<void> {
  await fetchWithAuth(`/transport-companies/${id}`, {
    method: 'DELETE',
  });
}

// Admin: link a User account to this TC so the owner can sign into htx.vigogroup.vn.
// Backend creates the user if missing, or upgrades an existing one to TRANSPORT_COMPANY_OWNER.
export async function assignTransportCompanyOwner(
  id: string,
  data: { phone: string; password: string; fullName?: string },
): Promise<TransportCompany> {
  const response = await fetchWithAuth(`/transport-companies/${id}/assign-owner`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Không gán được chủ HTX');
  }
  return response.json();
}

// ─────────────────────────────────────────────────────────────────────
// HTX portal — endpoints for the cooperative owner (htx.vigogroup.vn).
// All require an access token belonging to a TRANSPORT_COMPANY_OWNER.
// ─────────────────────────────────────────────────────────────────────

export type HtxDriverRow = {
  id: string;
  userId: string;
  fullName: string | null;
  phone: string | null;
  avatar: string | null;
  status: 'ONLINE' | 'BUSY' | 'OFFLINE' | string;
  isActive: boolean;
  isApproved: boolean;
  createdAt: string;
  vehicleRegistration: { plateNumber?: string; brand?: string; model?: string; seats?: number } | null;
  tripCount: number;
  lifetimeIncome: number;
  lifetimeTax: number;
};

export type HtxDashboard = {
  period: 'day' | 'month' | 'year';
  date: string;
  range: { start: string; end: string };
  vehicleCount: number;
  onlineVehicleCount: number;
  ticketCount: number;
  cancelledTripCount: number;
  grossRevenue: number;
  finalRevenue: number;
  vatAmount: number;
  commissionRate: number;
  commissionAmount: number;
  pitAmount: number;
  htxCommissionRate: number;
  htxCommissionAmount: number;
};

// NestJS wraps responses globally as { data, success, ... } so every htx/* call has to
// unwrap .data — the rest of the app does the same with master-data + transport-companies.
async function unwrap<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (body && typeof body === 'object') {
    // Paginated response — backend's TransformInterceptor wraps as {success, data, meta}.
    // Caller's typed shape is `{data, meta}`, so return the whole body (minus `success`)
    // rather than peeling off `data` alone, otherwise we lose pagination metadata.
    if ('data' in body && 'meta' in body) return body as T;
    // Standard wrapped response: return just the data field.
    if ('data' in body) return body.data as T;
  }
  // Unwrapped (rare — e.g. raw POST returning the entity directly): use the body as-is.
  return body as T;
}

export async function htxGetMe(): Promise<TransportCompany> {
  const response = await fetchWithAuth('/htx/me');
  return unwrap<TransportCompany>(response);
}

export type HtxDriverListResponse = {
  data: HtxDriverRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export async function htxListDrivers(params: {
  page?: number;
  limit?: number;
  search?: string;
  isApproved?: 'true' | 'false' | 'pending' | 'unsubmitted';
  status?: 'ONLINE' | 'OFFLINE' | 'BUSY';
  isActive?: 'true' | 'false';
} = {}): Promise<HtxDriverListResponse> {
  const q = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  });
  if (params.search) q.set('search', params.search);
  if (params.isApproved) q.set('isApproved', params.isApproved);
  if (params.status) q.set('status', params.status);
  if (params.isActive) q.set('isActive', params.isActive);
  const response = await fetchWithAuth(`/htx/drivers?${q.toString()}`);
  return unwrap<HtxDriverListResponse>(response);
}

export async function htxToggleDriverActive(driverId: string): Promise<{ id: string; isActive: boolean }> {
  const response = await fetchWithAuth(`/htx/drivers/${driverId}/toggle-active`, {
    method: 'POST',
  });
  return unwrap<{ id: string; isActive: boolean }>(response);
}

export type HtxDashboardRange =
  | { mode: 'period'; period: 'day' | 'month' | 'year'; dateISO?: string }
  | { mode: 'range'; from: string; to: string };

export async function htxGetDashboard(range: HtxDashboardRange): Promise<HtxDashboard> {
  const query = new URLSearchParams();
  if (range.mode === 'period') {
    query.set('period', range.period);
    if (range.dateISO) query.set('date', range.dateISO);
  } else {
    query.set('from', range.from);
    query.set('to', range.to);
  }
  const response = await fetchWithAuth(`/htx/dashboard?${query.toString()}`);
  return unwrap<HtxDashboard>(response);
}

// Admin view of a company's stats (same numbers the HTX owner dashboard shows)
// plus the driver approval-state breakdown. Reuses the HTX dashboard shape +
// range model so the two stay in sync.
export type CompanyStats = HtxDashboard & {
  totalTripCount: number;
  driverCounts: { total: number; approved: number; pending: number; rejected: number };
};

export async function getTransportCompanyStats(
  id: string,
  range: HtxDashboardRange,
): Promise<CompanyStats> {
  const query = new URLSearchParams();
  if (range.mode === 'period') {
    query.set('period', range.period);
    if (range.dateISO) query.set('date', range.dateISO);
  } else {
    query.set('from', range.from);
    query.set('to', range.to);
  }
  const response = await fetchWithAuth(`/transport-companies/${id}/stats?${query.toString()}`);
  return unwrap<CompanyStats>(response);
}

// ─────────────────────────────────────────────────────────────────────
// Affiliate / referrals (admin)
// ─────────────────────────────────────────────────────────────────────

export type AdminReferralRow = {
  id: string;
  referrer: { id: string; phone?: string; fullName?: string };
  referee: { id: string; phone?: string; fullName?: string };
  codeUsed: string;
  signupRewardCredited: boolean;
  tripCountUsed: number;
  tripRewardTotal: number;
  // Net amount = signup bonus + trip rewards - clawbacks. Sourced from referral_event sum.
  totalAmount: number;
  createdAt: string;
};

export type AdminReferralListResponse = {
  data: AdminReferralRow[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
};

export type AdminReferrerSummary = {
  id: string;
  phone?: string;
  fullName?: string;
  refereeCount: number;
  tripCount: number;
  totalReward: number;
};

export type AdminReferrerListResponse = {
  data: AdminReferrerSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
};

export async function adminListReferrers(params: {
  page?: number;
  limit?: number;
  search?: string;
  sort?: 'amount' | 'trips' | 'referees';
} = {}): Promise<AdminReferrerListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);
  if (params.sort) q.set('sort', params.sort);
  const qs = q.toString();
  const response = await fetchWithAuth(`/referrals/admin/referrers${qs ? '?' + qs : ''}`);
  return unwrap<AdminReferrerListResponse>(response);
}

export async function adminListReferrals(params: { page?: number; limit?: number; referrerId?: string } = {}): Promise<AdminReferralListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.referrerId) q.set('referrerId', params.referrerId);
  const qs = q.toString();
  const response = await fetchWithAuth(`/referrals/admin${qs ? '?' + qs : ''}`);
  return unwrap<AdminReferralListResponse>(response);
}

export type AdminReferralDetail = AdminReferralRow & {
  events: Array<{ id: string; type: 'SIGNUP' | 'TRIP' | 'CLAWBACK'; amount: number; bookingId: string | null; note: string | null; createdAt: string; createdByAdminId: string | null }>;
};

export async function adminGetReferralDetail(id: string): Promise<AdminReferralDetail> {
  const response = await fetchWithAuth(`/referrals/admin/${id}`);
  return unwrap<AdminReferralDetail>(response);
}

export async function adminClawbackReferralEvent(eventId: string, reason: string): Promise<{ id: string }> {
  const response = await fetchWithAuth(`/referrals/admin/events/${eventId}/clawback`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Clawback failed');
  }
  return unwrap(response);
}

// Same shape the end user sees on the mobile app — for admin support to look up a specific
// customer's affiliate balance + recent referees on their behalf.
export type AdminUserReferralStats = {
  code: string;
  shareLink: string;
  balance: number;
  refereeCount: number;
  referees: Array<{
    refereeId: string;
    refereePhone: string | null;
    refereeName: string | null;
    signupRewardCredited: boolean;
    tripCountUsed: number;
    tripRewardTotal: number;
    createdAt: string;
  }>;
};

export async function adminGetUserReferralStats(userId: string): Promise<AdminUserReferralStats> {
  const response = await fetchWithAuth(`/referrals/admin/users/${userId}/stats`);
  return unwrap<AdminUserReferralStats>(response);
}

// ─────────────────────────────────────────────────────────────────────
// Withdrawals (admin)
// ─────────────────────────────────────────────────────────────────────

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'TRANSFERRED' | 'REJECTED';

export type AdminWithdrawalRow = {
  id: string;
  userId: string;
  userPhone?: string;
  userName?: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  status: WithdrawalStatus;
  adminNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
};

export type AdminWithdrawalListResponse = {
  data: AdminWithdrawalRow[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
};

export async function adminListWithdrawals(params: { status?: WithdrawalStatus; page?: number; limit?: number } = {}): Promise<AdminWithdrawalListResponse> {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  const response = await fetchWithAuth(`/withdrawals${qs ? '?' + qs : ''}`);
  return unwrap<AdminWithdrawalListResponse>(response);
}

export async function adminApproveWithdrawal(id: string, note?: string): Promise<AdminWithdrawalRow> {
  const response = await fetchWithAuth(`/withdrawals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Approve failed');
  }
  return unwrap(response);
}

export async function adminRejectWithdrawal(id: string, note: string): Promise<AdminWithdrawalRow> {
  const response = await fetchWithAuth(`/withdrawals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Reject failed');
  }
  return unwrap(response);
}

export async function adminMarkWithdrawalTransferred(id: string): Promise<AdminWithdrawalRow> {
  const response = await fetchWithAuth(`/withdrawals/${id}/mark-transferred`, {
    method: 'POST',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Mark transferred failed');
  }
  return unwrap(response);
}

export async function assignTransportCompany(driverId: string, transportCompanyId: string): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${driverId}/transport-company`, {
    method: 'PUT',
    body: JSON.stringify({ transportCompanyId }),
  });
  const result = await response.json();
  return result.data || result;
}

export async function getTransportCompanyList(): Promise<TransportCompany[]> {
  const response = await fetchWithAuth('/transport-companies');
  const result = await response.json();
  return result.data || result;
}

export type FinanceDashboard = {
  range: { from: string; to: string };
  cashFlow: {
    totalIn: number;
    totalOut: number;
    net: number;
    operationalRevenue: number;
    driverTopUp: number;
    driverDeducted: number;
    totalTripIncludingTax: number;
  };
  breakdown: {
    htxNetIncome: number;
    htxVatCollected: number;
    htxPitCollected: number;
    driverNetEarnings: number;
    affiliateCredited: number;
    customerRefund: number;
  };
  trend: Array<{ date: string; in: number; out: number }>;
  topHtx: Array<{
    id: string;
    name: string;
    bookingCount: number;
    grossRevenue: number;
    commissionAmount: number;
    netIncome: number;
  }>;
  topDrivers: Array<{
    id: string;
    fullName: string;
    phone: string;
    bookingCount: number;
    netEarnings: number;
  }>;
  topAffiliates: Array<{
    id: string;
    fullName: string;
    phone: string;
    tripCount: number;
    totalCredited: number;
  }>;
};

export async function getFinanceDashboard(from: string, to: string): Promise<FinanceDashboard> {
  const qs = new URLSearchParams({ from, to });
  const response = await fetchWithAuth(`/admin/finance/dashboard?${qs.toString()}`);
  const result = await response.json();
  return result.data;
}
