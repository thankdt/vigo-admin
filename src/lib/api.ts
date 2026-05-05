'use client';
import { Driver, User, Booking, AdminUnit, Route, RoutePricing, BookingStatus, SystemConfig, Promotion, ScheduledNotification, News, Banner, TransportCompany } from '@/lib/types';

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

export async function getDrivers(params: { page?: number; limit?: number; search?: string; isApproved?: 'true' | 'false' | 'pending' } = {}): Promise<GetApiResponse<Driver>> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
    ...(params.search && { search: params.search }),
    ...(params.isApproved && { isApproved: params.isApproved }),
  });

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

export async function rejectDriver(id: string, reason: string): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  const data = await response.json();
  return data.data || data;
}

export async function getBookings(params: { page?: number; limit?: number; status?: string, customerId?: string, driverId?: string } = {}): Promise<GetApiResponse<Booking>> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
    ...(params.status && { status: params.status }),
    ...(params.customerId && { customerId: params.customerId }),
    ...(params.driverId && { driverId: params.driverId }),
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

export async function createAdminUnit(data: { name: string; level: 'PROVINCE' | 'DISTRICT' | 'WARD'; parentId?: number }): Promise<AdminUnit> {
  const response = await fetchWithAuth('/master-data/admin-units', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function getRoutes(): Promise<Route[]> {
  const response = await fetchWithAuth('/master-data/routes');
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

export async function deleteRoute(id: number): Promise<void> {
  await fetchWithAuth(`/master-data/routes/${id}/delete`, {
    method: 'POST',
  });
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

export async function createTransportCompany(data: { name: string; ownerName?: string; ownerPhone?: string; isActive?: boolean }): Promise<TransportCompany> {
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

export async function updateTransportCompany(id: string, data: { name?: string; ownerName?: string; ownerPhone?: string; isActive?: boolean }): Promise<TransportCompany> {
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
};

export type HtxDashboard = {
  period: 'day' | 'month' | 'year';
  date: string;
  range: { start: string; end: string };
  vehicleCount: number;
  ticketCount: number;
  grossRevenue: number;
  finalRevenue: number;
  vatAmount: number;
  commissionRate: number;
  commissionAmount: number;
  netIncome: number;
};

export async function htxGetMe(): Promise<TransportCompany> {
  const response = await fetchWithAuth('/htx/me');
  return response.json();
}

export async function htxListDrivers(): Promise<HtxDriverRow[]> {
  const response = await fetchWithAuth('/htx/drivers');
  return response.json();
}

export async function htxToggleDriverActive(driverId: string): Promise<{ id: string; isActive: boolean }> {
  const response = await fetchWithAuth(`/htx/drivers/${driverId}/toggle-active`, {
    method: 'POST',
  });
  return response.json();
}

export async function htxGetDashboard(period: 'day' | 'month' | 'year', dateISO?: string): Promise<HtxDashboard> {
  const query = new URLSearchParams({ period });
  if (dateISO) query.set('date', dateISO);
  const response = await fetchWithAuth(`/htx/dashboard?${query.toString()}`);
  return response.json();
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
