'use client';
import { Driver, User, Booking, AdminUnit, Route, RoutePricing, BookingStatus, SystemConfig, Promotion, ScheduledNotification, News, Banner, TransportCompany, AppPopup, DriverFeedback, LeakageTraceRow, LeakageTraceStatus, LeakageVerdict, DriverCancelStat, DriverCancelTrip } from '@/lib/types';

// Overridable per-environment. Dev (docker/next dev) sets
// NEXT_PUBLIC_API_BASE_URL=https://api.vigodev.online; prod builds fall back to
// the production API. NEXT_PUBLIC_* is read at runtime in `next dev` and inlined
// at build time for `next build`.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.vigogroup.vn';

// On an unrecoverable 401 we bounce to a login page. Pick the one for the current area so a KOL
// (passwordless) isn't stranded on the admin password login, and HTX owners land on their own login.
function loginPathForCurrentArea(): string {
  if (typeof window === 'undefined') return '/';
  const p = window.location.pathname;
  if (p.startsWith('/kol-portal')) return '/kol-portal/login';
  if (p.startsWith('/agent-portal')) return '/agent-portal/login';
  if (p.startsWith('/htx')) return '/htx/login';
  return '/';
}

// The backend wraps errors as { error: { code, message } }; some legacy endpoints use { message }.
// fetchWithAuth throws Error(JSON.stringify(envelope)) — this pulls out the human sentence for toasts.
export function parseApiError(msg: string): string {
  try {
    const o = JSON.parse(msg);
    return o?.error?.message || o?.message || msg;
  } catch {
    return msg;
  }
}

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
            window.location.href = loginPathForCurrentArea();
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

export async function getUsers(params: { page?: number; limit?: number; search?: string; role?: string; includeDrivers?: boolean; deleted?: 'only' | 'all' } = {}): Promise<GetApiResponse<User>> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
    ...(params.search && { search: params.search }),
    ...(params.role && { role: params.role }),
    ...(params.includeDrivers && { includeDrivers: 'true' }),
    ...(params.deleted && { deleted: params.deleted }),
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

// Khôi phục user đã soft-delete (đảo deletedAt). Khác lock/unlock (isActive).
export async function restoreUser(id: string): Promise<{ success: boolean; message: string }> {
  const response = await fetchWithAuth(`/users/admin/${id}/restore`, { method: 'POST' });
  const json = await response.json();
  return json?.data ?? json;
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
  // Thông tin xuất hoá đơn VAT khách nhập ở hồ sơ.
  companyName?: string | null;
  taxCode?: string | null;
  companyAddress?: string | null;
  invoiceEmail?: string | null;
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

export async function approveDriver(id: string, enabledServices: string[], note?: string): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ enabledServices, note: note?.trim() || undefined }),
  });
  const data = await response.json();
  return data.data || data;
}

export async function moveDriverBackToPending(id: string, note?: string): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/move-back-to-pending`, {
    method: 'POST',
    body: JSON.stringify({ note: note?.trim() || undefined }),
  });
  const data = await response.json();
  return data.data || data;
}

export async function rejectDriver(id: string, reason: string, note?: string): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason, note: note?.trim() || undefined }),
  });
  const data = await response.json();
  return data.data || data;
}

// Admin khoá cứng tài khoản tài xế (chặn đăng nhập + dispatch + force-logout).
// Lý do bắt buộc — hiển thị cho tài xế khi họ cố đăng nhập.
export async function banDriver(id: string, reason: string, note?: string): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/ban`, {
    method: 'POST',
    body: JSON.stringify({ reason, note: note?.trim() || undefined }),
  });
  const data = await response.json();
  return data.data || data;
}

// Mở khoá — backend không đụng isActive/isApproved (giữ nguyên trạng thái trước ban).
export async function unbanDriver(id: string, note?: string): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/unban`, {
    method: 'POST',
    body: JSON.stringify({ note: note?.trim() || undefined }),
  });
  const data = await response.json();
  return data.data || data;
}

// Tạm khoá NHẬN CHUYẾN có hẹn giờ (chỉ chặn dispatch, tự hết hạn). Đặt bằng
// durationMinutes (presets) HOẶC until (ISO tuyệt đối — FE quy đổi từ giờ VN).
export async function suspendDriver(
  id: string,
  opts: { until?: string; durationMinutes?: number; reason: string },
): Promise<Driver> {
  const body: { reason: string; until?: string; durationMinutes?: number } = { reason: opts.reason };
  if (typeof opts.durationMinutes === 'number') body.durationMinutes = opts.durationMinutes;
  else if (opts.until) body.until = opts.until;
  const response = await fetchWithAuth(`/drivers/admin/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return data.data || data;
}

// Gỡ tạm khoá nhận chuyến (mở sớm).
export async function unsuspendDriver(id: string, note?: string): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/unsuspend`, {
    method: 'POST',
    body: JSON.stringify({ note: note?.trim() || undefined }),
  });
  const data = await response.json();
  return data.data || data;
}

export type DriverApprovalAction =
  | 'APPROVED'
  | 'REJECTED'
  | 'SUBMITTED'
  | 'MOVED_BACK_TO_PENDING'
  | 'BANNED'
  | 'UNBANNED'
  | 'SUSPENDED'
  | 'UNSUSPENDED';

export type DriverApprovalEvent = {
  id: string;
  driverId: string;
  action: DriverApprovalAction;
  reason: string | null;
  note?: string | null;
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
    // S3 key ảnh giấy xác nhận HTX (admin upload hộ). Gửi = tải lên/thay ảnh.
    htxConfirmationImage?: string;
  },
): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/profile`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  const json = await response.json();
  return json.data || json;
}

// Admin sets a driver's dispatch routes (multi-route). Pass [] to clear all
// (driver becomes undispatchable until re-assigned).
export async function updateDriverRoutes(id: string, routeIds: number[]): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/routes`, {
    method: 'PUT',
    body: JSON.stringify({ routeIds }),
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
  vat: number;
  vehiclePlate: string;
  transportCompanyName: string;
  // Thông tin xuất hoá đơn VAT (snapshot lúc complete). null ⇒ "Khách lẻ".
  customerName?: string | null;
  vatInfo?: {
    companyName?: string | null;
    taxCode?: string | null;
    companyAddress?: string | null;
    invoiceEmail?: string | null;
  } | null;
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

// Download the e-contract PDF for a booking. Hits the admin endpoint backed by
// the SAME ContractService as the customer/driver apps, so the document is
// byte-for-byte identical across all three. Returns the raw PDF blob; the caller
// triggers the browser download.
export async function getAdminContractPdfBlob(bookingId: string): Promise<Blob> {
  const response = await fetchWithAuth(`/bookings/admin/${bookingId}/contract.pdf`);
  if (!response.ok) {
    throw new Error('Không tải được hợp đồng. Vui lòng thử lại.');
  }
  return response.blob();
}

export async function getBookings(params: {
  page?: number;
  limit?: number;
  status?: string;
  // UUID — used by UserBookingsCard for direct customer-detail drill-down.
  // BE validates UUID format; invalid input is silently dropped.
  customerId?: string;
  driverId?: string;
  processingState?: 'unclaimed' | 'claimed';
  // Numeric route id → exact match; 'none' → bookings with no route stamped
  // (legacy + routing-miss). Caller passes the raw value through.
  routeId?: number | 'none';
  // Free-text search — BE LIKE %q% on customer name/phone OR driver name/phone.
  q?: string;
  // Booking ID prefix match — BE casts UUID to text and matches 'q%'.
  bookingId?: string;
  // Sắp xếp server-side (sắp cả bảng, không chỉ trang hiện tại). BE whitelist
  // cột: createdAt|updatedAt|price|status. Mặc định createdAt DESC.
  sortBy?: string;
  order?: 'ASC' | 'DESC';
} = {}): Promise<{ data: Booking[]; total: number; page: number; limit: number; totalPages: number }> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
    ...(params.status && { status: params.status }),
    ...(params.customerId && { customerId: params.customerId }),
    ...(params.driverId && { driverId: params.driverId }),
    ...(params.processingState && { processingState: params.processingState }),
    ...(params.routeId !== undefined && { routeId: String(params.routeId) }),
    ...(params.q && { q: params.q }),
    ...(params.bookingId && { bookingId: params.bookingId }),
    ...(params.sortBy && { sortBy: params.sortBy }),
    ...(params.order && { order: params.order }),
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

// Void a COMPLETED booking (reverse commission + affiliate clawback + CANCELLED).
// Requires the "password cấp 2" (same as wallet adjustments).
export async function voidCompletedBooking(
  id: string,
  secondaryPassword: string,
  reason?: string,
): Promise<{ success: boolean; affiliateClawedBack: number }> {
  const response = await fetchWithAuth(`/bookings/admin/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ secondaryPassword, ...(reason && { reason }) }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Huỷ chuyến thất bại (${response.status})`);
  }
  const result = await response.json();
  return result.data ?? result;
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

// Look up a customer by exact phone (create-booking form "Kiểm tra" button).
export async function lookupCustomerByPhone(phone: string): Promise<{ exists: boolean; fullName: string | null }> {
  const response = await fetchWithAuth(`/users/admin/by-phone?phone=${encodeURIComponent(phone)}`);
  const result = await response.json();
  return result.data ?? { exists: false, fullName: null };
}

// Price estimate for the create-booking form "Tính giá" button.
export async function estimateTripPrice(body: {
  pickup: { address: string; lat: number; long: number };
  dropoff: { address: string; lat: number; long: number };
  serviceType?: 'RIDE' | 'DELIVERY' | 'CARPOOL';
  requestedVehicleType?: 'CAR_4' | 'CAR_7';
  // CARPOOL nhân giá theo số ghế — truyền vào để ước tính khớp giá tạo chuyến.
  requestedSeats?: number;
  // Voucher áp thử để xem giá sau giảm. BE validate ở context admin (userId =
  // admin); với voucher công khai (pointCost=0) kết quả khớp lúc tạo chuyến.
  promotionId?: number;
  // Thời điểm đi (ISO) — quyết định phụ phí cuối tuần/lễ theo NGÀY ĐI, không phải
  // ngày đặt. Bỏ trống (đi ngay) → backend tính theo hiện tại.
  departureTime?: string;
}): Promise<{ price: number; finalPrice: number; distanceKm?: number; discount?: number; priceBeforeDiscount?: number }> {
  const response = await fetchWithAuth('/pricing/calculate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const result = await response.json();
  const data = result.data ?? result;
  return {
    price: data.price,
    finalPrice: data.finalPrice,
    distanceKm: data.distanceKm,
    discount: data.discount,
    // VAT-inclusive total trước khi trừ khuyến mãi — backend tính sẵn để hiển
    // thị giá gạch ngang chính xác (tránh tự cộng discount trước-thuế vào giá
    // sau-thuế gây lệch làm tròn).
    priceBeforeDiscount: data.breakdown?.priceBeforeDiscount,
  };
}

export async function createAdminBooking(data: {
  customerPhone: string;
  customerName?: string;
  pickupAddress: { address: string; lat: number; long: number };
  dropoffAddress: { address: string; lat: number; long: number };
  serviceType?: 'RIDE' | 'DELIVERY' | 'CARPOOL';
  requestedVehicleType?: 'CAR_4' | 'CAR_7';
  // Số lượng hành khách (default 1). Với CARPOOL nó nhân giá ở backend.
  requestedSeats?: number;
  // Tên các hành khách đi cùng (nếu có) — in lên hợp đồng/hoá đơn.
  passengerNames?: string[];
  note?: string;
  driverId?: string;
  // ISO 8601 timestamp (e.g. new Date(...).toISOString()). Omit for an
  // immediate (SEARCHING) booking; set for a SCHEDULED trip.
  // For a pickup-window trip send scheduledTime = scheduledFromTime so a backend
  // without window support (whitelist strips the unknown fields) still schedules
  // at the window start instead of silently falling back to "now".
  scheduledTime?: string;
  // Pickup-window [from, to] (ISO). Backend with window support prefers these;
  // omit (all three undefined) for an immediate trip.
  scheduledFromTime?: string;
  scheduledToTime?: string;
  // Voucher áp cho chuyến (tuỳ chọn). BE tính giảm giá, lưu lên booking và đếm
  // lượt dùng ở compl() — dùng lại y luồng khách tự đặt.
  promotionId?: number;
}): Promise<Booking> {
  const response = await fetchWithAuth('/bookings/admin/create', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data || result;
}

/**
 * Đặt hộ: an ACTIVE agent (đại lý) creates ONE normal trip on a customer's behalf. Same body as
 * createAdminBooking MINUS driverId (an agent can't force-assign). The server injects agentUserId from
 * the JWT → the agent commission is credited at COMPLETE (driver→ví khuyến mại, user→ví affiliate).
 */
export async function createAgentBooking(data: {
  customerPhone: string;
  customerName?: string;
  pickupAddress: { address: string; lat: number; long: number };
  dropoffAddress: { address: string; lat: number; long: number };
  serviceType?: 'RIDE' | 'DELIVERY' | 'CARPOOL';
  requestedVehicleType?: 'CAR_4' | 'CAR_7';
  requestedSeats?: number;
  passengerNames?: string[];
  note?: string;
  scheduledTime?: string;
  scheduledFromTime?: string;
  scheduledToTime?: string;
  promotionId?: number;
}): Promise<Booking> {
  const response = await fetchWithAuth('/agent/bookings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data || result;
}

// [DISABLED 2026-07-09] "admin ôm chuyến về operator" — endpoint BE (admin/:id/accept) đã tắt
// vì gán về tài khoản ảo, 0 commission => vỡ dòng tiền. Dùng reassign tài xế THẬT thay thế.
/*
export async function adminAcceptBooking(bookingId: string): Promise<Booking> {
  const response = await fetchWithAuth(`/bookings/admin/${bookingId}/accept`, {
    method: 'POST',
  });
  const result = await response.json();
  return result.data || result;
}
*/


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

// Persist a rotated image: backend rotates + recompresses the S3 object in place
// (key must be under uploads/). degrees = CSS clockwise (0/90/180/270).
export async function rotateUploadImage(key: string, degrees: number): Promise<void> {
  const response = await fetchWithAuth('/uploads/rotate', {
    method: 'POST',
    body: JSON.stringify({ key, degrees }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Lưu ảnh thất bại (${response.status})`);
  }
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

// ChottuLink fixed-bucket counts (total / last 7d / last 30d).
export type ReferralLinkCounts = { total: number; last7: number; last30: number };

export type AdminReferrerSummary = {
  id: string;
  phone?: string;
  fullName?: string;
  referralCode?: string | null;
  refereeCount: number;
  tripCount: number;
  totalReward: number;
  // ChottuLink referral-link + analytics (additive; null = no link minted / not synced yet).
  shortUrl?: string | null;
  clicks?: ReferralLinkCounts | null;
  installs?: ReferralLinkCounts | null;
  // true when install-analytics returned 403 (no premium subscription) → installs left null on purpose.
  installsUnavailable?: boolean;
  analyticsSyncedAt?: string | null;
};

export type AdminReferrerListResponse = {
  data: AdminReferrerSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
};

export type ReferrerSort = 'amount' | 'trips' | 'referees' | 'clicks' | 'installs';

export async function adminListReferrers(params: {
  page?: number;
  limit?: number;
  search?: string;
  sort?: ReferrerSort;
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

// Trigger a ChottuLink referral-link sync now (mint missing links + refresh clicks/installs).
// Backend shares the cron's Redis lock, so this no-ops if a run is already in progress.
export async function adminTriggerLinkSync(): Promise<{ ranBy: string; skipped: boolean; discovered: number; synced: number }> {
  const response = await fetchWithAuth('/referrals/admin/link-sync', { method: 'POST' });
  return unwrap<{ ranBy: string; skipped: boolean; discovered: number; synced: number }>(response);
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

// ─────────────────────────────────────────────────────────────────────
// KOL / KOC (admin)
// ─────────────────────────────────────────────────────────────────────

export type KolKind = 'STANDARD' | 'LEADER';
export type KolStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export type AdminKolRow = {
  userId: string;
  userFullName: string | null;
  userPhone: string | null;
  kind: KolKind;
  status: KolStatus;
  commissionPercent: number | null;
  leaderId: string | null;
  leaderName: string | null;
  displayName: string | null;
  note: string | null;
  createdAt: string;
};

export type AdminKolListResponse = {
  data: AdminKolRow[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
};

export async function adminListKols(params: {
  page?: number;
  limit?: number;
  search?: string;
  kind?: KolKind;
  status?: KolStatus;
} = {}): Promise<AdminKolListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);
  if (params.kind) q.set('kind', params.kind);
  if (params.status) q.set('status', params.status);
  const qs = q.toString();
  const response = await fetchWithAuth(`/kol/admin/kols${qs ? '?' + qs : ''}`);
  return unwrap<AdminKolListResponse>(response);
}

// Promote / approve a user to KOL (also re-activates a REVOKED profile). Sets status ACTIVE.
export async function adminPromoteKol(userId: string, body: {
  kind: KolKind;
  commissionPercent?: number | null;
  leaderId?: string;
  displayName?: string;
  note?: string;
}): Promise<AdminKolRow> {
  const response = await fetchWithAuth(`/kol/admin/users/${userId}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap<AdminKolRow>(response);
}

export async function adminUpdateKol(userId: string, body: {
  kind?: KolKind;
  commissionPercent?: number | null;
  leaderId?: string | null;
  displayName?: string;
  note?: string;
  status?: KolStatus;
}): Promise<AdminKolRow> {
  const response = await fetchWithAuth(`/kol/admin/kols/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return unwrap<AdminKolRow>(response);
}

export async function adminAssignKolLeader(userId: string, leaderId: string): Promise<AdminKolRow> {
  const response = await fetchWithAuth(`/kol/admin/kols/${userId}/assign-leader`, {
    method: 'POST',
    body: JSON.stringify({ leaderId }),
  });
  return unwrap<AdminKolRow>(response);
}

export async function adminRevokeKol(userId: string): Promise<AdminKolRow> {
  const response = await fetchWithAuth(`/kol/admin/kols/${userId}/revoke`, {
    method: 'POST',
  });
  return unwrap<AdminKolRow>(response);
}

// ─────────────────────────────────────────────────────────────────────
// Booking-agent (đại lý đặt hộ) — admin management
// ─────────────────────────────────────────────────────────────────────

export type AgentStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export type AdminAgentRow = {
  id: string;
  userId: string;
  status: AgentStatus;
  commissionPercent: number | null; // null ⇒ dùng mức nhóm (BOOKING_AGENT_COMMISSION_PERCENT)
  displayName: string | null;
  note: string | null;
  userFullName: string | null;
  userPhone: string | null;
  isDriver: boolean; // tài khoản này cũng là tài xế?
  createdAt: string;
};

export type AdminAgentListResponse = {
  data: AdminAgentRow[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
};

export async function adminListAgents(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: AgentStatus;
} = {}): Promise<AdminAgentListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.search) q.set('search', params.search);
  if (params.status) q.set('status', params.status);
  const qs = q.toString();
  return unwrap<AdminAgentListResponse>(await fetchWithAuth(`/agent/admin/agents${qs ? '?' + qs : ''}`));
}

// Promote / approve an account (USER or DRIVER) to booking-agent (also re-activates REVOKED). → ACTIVE.
export async function adminPromoteAgent(userId: string, body: {
  commissionPercent?: number | null;
  displayName?: string;
  note?: string;
}): Promise<AdminAgentRow> {
  return unwrap<AdminAgentRow>(await fetchWithAuth(`/agent/admin/users/${userId}`, {
    method: 'POST',
    body: JSON.stringify(body),
  }));
}

export async function adminUpdateAgent(userId: string, body: {
  commissionPercent?: number | null;
  displayName?: string;
  note?: string;
  status?: AgentStatus;
}): Promise<AdminAgentRow> {
  return unwrap<AdminAgentRow>(await fetchWithAuth(`/agent/admin/agents/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }));
}

export async function adminRevokeAgent(userId: string): Promise<AdminAgentRow> {
  return unwrap<AdminAgentRow>(await fetchWithAuth(`/agent/admin/agents/${userId}/revoke`, {
    method: 'POST',
  }));
}

// ── admin browse + void of đặt-hộ orders ──
export type AdminAgentOrder = {
  id: string;
  status: 'DRAFT' | 'SEARCHING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  billingMode: 'BAO' | 'GHEP';
  waypoints: AgentWaypoint[];
  passengers: AgentPassenger[];
  capacityRequired: number;
  totalFare: number | null;
  commissionAmount: number | null;
  paymentMethod: string | null;
  contractNumber: string | null;
  createdAt: string;
  completedAt: string | null;
  agentUserId: string;
  agentName: string | null;
  agentPhone: string | null;
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  customerName: string | null;
  customerPhone: string | null;
};

export type AdminAgentOrderListResponse = {
  data: AdminAgentOrder[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
};

export async function adminListAgentOrders(params: {
  page?: number;
  limit?: number;
  status?: AdminAgentOrder['status'];
  search?: string;
} = {}): Promise<AdminAgentOrderListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.status) q.set('status', params.status);
  if (params.search) q.set('search', params.search);
  const qs = q.toString();
  return unwrap<AdminAgentOrderListResponse>(await fetchWithAuth(`/agent/admin/orders${qs ? '?' + qs : ''}`));
}

/** Void a COMPLETED order → clawback the agent commission. */
export async function adminVoidAgentOrder(id: string, reason?: string): Promise<AdminAgentOrder> {
  return unwrap<AdminAgentOrder>(await fetchWithAuth(`/agent/admin/orders/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }));
}

// ─────────────────────────────────────────────────────────────────────
// KOL / KOC portal (self-service — the KOL logs in here to see their own dashboard)
// ─────────────────────────────────────────────────────────────────────

// Passwordless login for the KOL portal.
export async function sendKolLoginOtp(phone: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/send-login-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw new Error(e?.error?.message || e?.message || 'Gửi OTP thất bại');
  }
  return response.json().then((b) => b.data ?? b);
}

// Verify OTP → tokens. Stores them (single-session: this invalidates the KOL's mobile session).
export async function kolLoginOtp(phone: string, otp: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/auth/login-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp }),
  });
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw new Error(e?.error?.message || e?.message || 'Đăng nhập thất bại');
  }
  const data = await response.json();
  if (data?.data?.access_token && typeof window !== 'undefined') {
    localStorage.setItem('access_token', data.data.access_token);
    if (data.data.refresh_token) localStorage.setItem('refresh_token', data.data.refresh_token);
  }
  return data;
}

export type KolBankInfo = { bankName: string; accountNumber: string; accountHolder: string };

export type KolMe = {
  kind: KolKind;
  status: KolStatus;
  displayName: string | null;
  code: string;
  shareLink: string | null;
  commissionPercent: number | null;
  balance: number;
  tripRewardTotal: number;
  refereeCount: number;
  tripCount: number;
  bankInfo: KolBankInfo | null;
};

export async function getKolMe(): Promise<KolMe> {
  const response = await fetchWithAuth('/kol/me');
  return unwrap<KolMe>(response);
}

// ─────────────────────────── Booking-agent (đặt hộ) portal ───────────────────────────
export type AgentMe = {
  status: string;
  displayName: string | null;
  commissionPercent: number | null;
  bankInfo: KolBankInfo | null;
};
export type AgentWaypoint = { label?: string | null; address: string; lat: number; lng: number };
export type AgentPassenger = {
  name: string; phone: string; pickupIdx: number; dropoffIdx: number; note?: string | null;
};
export type AgentOrder = {
  id: string;
  status: 'DRAFT' | 'SEARCHING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  billingMode: 'BAO' | 'GHEP';
  waypoints: AgentWaypoint[];
  passengers: AgentPassenger[];
  capacityRequired: number;
  totalFare: number | null;
  priceBreakdown: Record<string, any> | null;
  perPassengerFare: { passengerIdx: number; amount: number }[] | null;
  driverId: string | null;
  commissionAmount: number | null;
  createdAt: string;
};

export async function sendAgentLoginOtp(phone: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/send-login-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
  });
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw new Error(e?.error?.message || e?.message || 'Không gửi được OTP');
  }
  return response.json();
}
export async function agentLoginOtp(phone: string, otp: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/auth/login-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp }),
  });
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw new Error(e?.error?.message || e?.message || 'Đăng nhập thất bại');
  }
  const data = await response.json();
  if (data?.data?.access_token && typeof window !== 'undefined') {
    localStorage.setItem('access_token', data.data.access_token);
    if (data.data.refresh_token) localStorage.setItem('refresh_token', data.data.refresh_token);
  }
  return data;
}
export async function getAgentMe(): Promise<AgentMe> {
  return unwrap<AgentMe>(await fetchWithAuth('/agent/me'));
}
export async function listAgentOrders(page = 1, limit = 20): Promise<{ data: AgentOrder[]; meta: any }> {
  return unwrap(await fetchWithAuth(`/agent/orders?page=${page}&limit=${limit}`));
}

// Đặt hộ chuyến-thường (POST /agent/bookings) → "Đơn của tôi". Slim shape from the backend.
export type AgentBooking = {
  id: string;
  status: string;
  serviceType: 'RIDE' | 'DELIVERY' | 'CARPOOL';
  pickupAddress: { address?: string } | null;
  dropoffAddress: { address?: string } | null;
  finalPrice: number | null;
  agentCommissionAmount: number | null;
  agentCommissionPercent: number | null;
  customerName: string | null;
  customerPhone: string | null;
  passengerNames: string[] | null;
  createdAt: string;
};
export async function listAgentBookings(page = 1, limit = 50): Promise<{ data: AgentBooking[]; meta: any }> {
  return unwrap(await fetchWithAuth(`/agent/bookings?page=${page}&limit=${limit}`));
}
export async function cancelAgentBooking(id: string, reason?: string): Promise<void> {
  const res = await fetchWithAuth(`/agent/bookings/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || e?.message || 'Không huỷ được đơn');
  }
}
export async function getAgentOrder(id: string): Promise<AgentOrder> {
  return unwrap<AgentOrder>(await fetchWithAuth(`/agent/orders/${id}`));
}
export async function createAgentOrder(body: {
  billingMode: 'BAO' | 'GHEP';
  waypoints: AgentWaypoint[];
  passengers: AgentPassenger[];
  paymentMethod?: string;
}): Promise<AgentOrder> {
  return unwrap<AgentOrder>(await fetchWithAuth('/agent/orders', { method: 'POST', body: JSON.stringify(body) }));
}
export async function quoteAgentOrder(id: string): Promise<AgentOrder> {
  return unwrap<AgentOrder>(await fetchWithAuth(`/agent/orders/${id}/quote`, { method: 'POST' }));
}
export async function submitAgentOrder(id: string): Promise<AgentOrder> {
  return unwrap<AgentOrder>(await fetchWithAuth(`/agent/orders/${id}/submit`, { method: 'POST' }));
}
export async function redispatchAgentOrder(id: string): Promise<{ offered: number }> {
  return unwrap(await fetchWithAuth(`/agent/orders/${id}/redispatch`, { method: 'POST' }));
}
export async function cancelAgentOrder(id: string): Promise<AgentOrder> {
  return unwrap<AgentOrder>(await fetchWithAuth(`/agent/orders/${id}/cancel`, { method: 'POST' }));
}
/**
 * Fetch the contract PDF WITH the auth header and hand it to the browser (a bare URL can't carry
 * the JWT). We use a synthetic <a download> click rather than window.open: the fetch+blob awaits
 * push us out of the click gesture, so window.open would be popup-blocked in Safari/others. A
 * download-anchor click is not gated by the popup blocker. Rejects on fetch/blob failure so the
 * caller can surface it (don't swallow — otherwise the button silently does nothing).
 */
export async function openAgentContract(id: string): Promise<void> {
  const res = await fetchWithAuth(`/agent/orders/${id}/contract.pdf`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hop-dong-dat-ho-${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Đại lý "đi ghép": tạo booking carpool hộ từng khách (giá theo tuyến) ──
export type AgentGhepAddr = { address: string; lat: number; long: number };
export type AgentGhepPassenger = {
  phone: string;
  name?: string;
  pickupAddress: AgentGhepAddr;
  dropoffAddress: AgentGhepAddr;
  promotionId?: number;
};
export type AgentGhepResult = {
  count: number;
  bookings: Array<{ id: string; shareLink?: string; customerPhone?: string; finalPrice?: number | null }>;
  failed: Array<{ phone: string; error: string }>;
};

export async function createAgentGhepBookings(body: {
  passengers: AgentGhepPassenger[];
  note?: string;
  scheduledTime?: string;
}): Promise<AgentGhepResult> {
  return unwrap<AgentGhepResult>(
    await fetchWithAuth('/agent/bookings/ghep', { method: 'POST', body: JSON.stringify(body) }),
  );
}

export type KolReferee = {
  refereeId: string;
  refereeName: string | null;
  refereePhone: string | null;
  firstTripDone: boolean;
  firstTripAt: string | null;
  commissionEarned: number;
  createdAt: string;
};

export async function getKolReferees(page = 1, limit = 20): Promise<{ data: KolReferee[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
  const response = await fetchWithAuth(`/kol/me/referees?page=${page}&limit=${limit}`);
  return unwrap(response);
}

export type KolLeaderDashboard = {
  kind: KolKind;
  yearMonthVn: string;
  teamEarningsThisMonth: number;
  threshold: number;
  currentRate: number;
  overrideEarnedMonth: number;
  overrideEarnedTotal: number;
  subKols: Array<{ subKolUserId: string; name: string | null; earnings: number; myOverride: number }>;
};

export async function getKolLeaderDashboard(): Promise<KolLeaderDashboard> {
  const response = await fetchWithAuth('/kol/me/leader');
  return unwrap<KolLeaderDashboard>(response);
}

export type KolEarningsSeries = {
  kind: KolKind;
  granularity: 'hour' | 'day' | 'month';
  points: Array<{ label: string; value: number }>;
};

export async function getKolEarnings(from: string, to: string): Promise<KolEarningsSeries> {
  const response = await fetchWithAuth(`/kol/me/earnings?from=${from}&to=${to}`);
  return unwrap<KolEarningsSeries>(response);
}

// Withdrawal (reused from the referral module; the KOL uses the same USER_REFERRAL balance).
export type KolWithdrawal = {
  id: string;
  amount: number;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  status: 'PENDING' | 'APPROVED' | 'TRANSFERRED' | 'REJECTED';
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export async function updateMyBankInfo(body: KolBankInfo): Promise<KolBankInfo> {
  const response = await fetchWithAuth('/referrals/me/bank-info', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return unwrap<KolBankInfo>(response);
}

export async function getMyWithdrawals(): Promise<KolWithdrawal[]> {
  const response = await fetchWithAuth('/referrals/me/withdrawals');
  const rows = await unwrap<KolWithdrawal[]>(response);
  // amount is a numeric column → pg serializes it as a string; coerce so the `number` type is honest.
  return rows.map((w) => ({ ...w, amount: Number(w.amount) }));
}

export async function submitMyWithdrawal(amount: number): Promise<KolWithdrawal> {
  const response = await fetchWithAuth('/referrals/me/withdrawals', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
  return unwrap<KolWithdrawal>(response);
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
    driverPayosTopUp: number;
    driverAdminPromoCredit: number;
    driverDeducted: number;
    totalTripIncludingTax: number;
  };
  breakdown: {
    vigoRevenue: number;
    totalVat: number;
    vigoVatRemit: number;
    htxTotalReceived: number;
    driverTotalReceived: number;
    totalPit: number;
    affiliateCredited: number;
    affiliateWithdrawn: number;
  };
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

export type FinanceSeries = {
  metric: string;
  granularity: 'hour' | 'day' | 'month';
  points: Array<{ label: string; value: number }>;
};

export async function getFinanceSeries(metric: string, from: string, to: string): Promise<FinanceSeries> {
  const qs = new URLSearchParams({ metric, from, to });
  const response = await fetchWithAuth(`/admin/finance/series?${qs.toString()}`);
  const result = await response.json();
  return result.data;
}

export type AdminOverview = {
  range: { from: string; to: string };
  realtime: { activeTrips: number; waitingCustomers: number; onlineDrivers: number; busyDrivers: number };
  today: { created: number; completed: number; cancelled: number; completionRate: number; newUsers: number };
  queues: { awaitingClaim: number; processing: number; driversPendingApproval: number; withdrawalsPending: number };
  business: { completedTripsInPeriod: number };
  supply: { totalDrivers: number; onlineDrivers: number; pendingApproval: number; newDriversInPeriod: number };
  demand: { totalCustomers: number; newCustomersInPeriod: number; activeCustomersInPeriod: number };
};

export async function getAdminOverview(from: string, to: string): Promise<AdminOverview> {
  const qs = new URLSearchParams({ from, to });
  const response = await fetchWithAuth(`/admin/overview?${qs.toString()}`);
  const result = await response.json();
  return result.data;
}

export type CashflowCategory =
  | 'payos' | 'km' | 'earnings' | 'admin_credit' | 'refund'
  | 'admin_debit' | 'tax' | 'commission' | 'other';
export type DriverCashflowRow = {
  id: string;
  amount: number;
  direction: 'in' | 'out';
  category: CashflowCategory;
  createdAt: string;
  description: string;
  refCode: string;
  driverUserId: string;
  driverName: string;
  driverPhone: string;
  htxName: string;
  plate: string;
};
export type DriverCashflowResponse = {
  data: DriverCashflowRow[];
  meta: { page: number; limit: number; total: number; totalPages: number; totalIn: number; totalOut: number };
};

export type HtxReconRow = {
  id: string;
  name: string;
  bookingCount: number;
  grossRevenue: number;
  totalVat: number;
  htxCommission: number;
  htxVatRemit: number;
  htxTotalReceived: number;
  vigoCommission: number;
  vigoVatRemit: number;
  platformFeeGross: number;
  km: number;
};
export type HtxReconTotals = Omit<HtxReconRow, 'id' | 'name'>;
export type HtxTripRow = {
  bookingId: string;
  createdAt: string;
  driverName: string;
  driverPhone: string;
  plate: string;
  grossRevenue: number;
  totalVat: number;
  htxCommission: number;
  htxVatRemit: number;
  htxTotalReceived: number;
  vigoCommission: number;
  vigoVatRemit: number;
  platformFeeGross: number;
  km: number;
};

export async function getHtxReconciliation(from: string, to: string): Promise<{ data: HtxReconRow[]; totals: HtxReconTotals }> {
  const qs = new URLSearchParams({ from, to });
  const response = await fetchWithAuth(`/admin/finance/htx-reconciliation?${qs.toString()}`);
  const result = await response.json();
  return result.data ?? { data: [], totals: {} as HtxReconTotals };
}

export async function getHtxTrips(id: string, from: string, to: string): Promise<{ htx: { id: string; name: string }; bookingCount: number; trips: HtxTripRow[]; totals: HtxReconTotals }> {
  const qs = new URLSearchParams({ from, to });
  const response = await fetchWithAuth(`/admin/finance/htx-reconciliation/${encodeURIComponent(id)}?${qs.toString()}`);
  const result = await response.json();
  return result.data ?? { htx: { id, name: '' }, bookingCount: 0, trips: [], totals: {} as HtxReconTotals };
}

export async function getDriverCashflow(params: {
  from: string;
  to: string;
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
}): Promise<DriverCashflowResponse> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  });
  if (params.search?.trim()) qs.set('search', params.search.trim());
  if (params.category) qs.set('category', params.category);
  const response = await fetchWithAuth(`/admin/finance/driver-cashflow?${qs.toString()}`);
  const result = await response.json();
  // TransformInterceptor hoists a paginated {data, meta} to { success, data: [...],
  // meta: {...} } — so the rows live on result.data and meta at the top level (same
  // shape getBookings reads). Returning result.data alone (the array) made the page
  // read res.data/res.meta = undefined → "Cannot read properties of undefined".
  return {
    data: result.data ?? [],
    meta: result.meta ?? {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      total: 0,
      totalPages: 1,
      totalIn: 0,
      totalOut: 0,
    },
  };
}

export async function getFeedback(params: {
  page?: number;
  limit?: number;
  category?: string;
  from?: string;
  to?: string;
  phone?: string;
} = {}): Promise<{ data: DriverFeedback[]; total: number; page: number; limit: number; totalPages: number }> {
  const query = new URLSearchParams({
    page: params.page?.toString() || '1',
    limit: params.limit?.toString() || '20',
    ...(params.category && { category: params.category }),
    ...(params.from && { from: params.from }),
    ...(params.to && { to: params.to }),
    ...(params.phone && { phone: params.phone }),
  });

  const response = await fetchWithAuth(`/feedback/admin?${query.toString()}`);
  const result = await response.json();
  return {
    data: result.data || [],
    total: result.meta?.total ?? 0,
    page: result.meta?.page ?? 1,
    limit: result.meta?.limit ?? 20,
    totalPages: result.meta?.totalPages ?? 1,
  };
}

// --- Cancel-leakage detection (anti-fraud) ---

/** Suspicious cancel-leakage traces for admin review. The backend filters/sorts
 *  by `eventAt` (when the customer cancelled), not by detection time. */
export async function getLeakageTraces(
  params: {
    status?: LeakageTraceStatus;
    verdict?: LeakageVerdict;
    confidence?: 'HIGH' | 'LOW';
    driverUserId?: string;
    from?: string; // VN YYYY-MM-DD
    to?: string;   // VN YYYY-MM-DD
  } = {},
): Promise<LeakageTraceRow[]> {
  const query = new URLSearchParams({
    ...(params.status && { status: params.status }),
    ...(params.verdict && { verdict: params.verdict }),
    ...(params.confidence && { confidence: params.confidence }),
    ...(params.driverUserId && { driverUserId: params.driverUserId }),
    ...(params.from && { from: params.from }),
    ...(params.to && { to: params.to }),
  });
  const qs = query.toString();
  const response = await fetchWithAuth(`/admin/leakage-traces${qs ? `?${qs}` : ''}`);
  return unwrap<LeakageTraceRow[]>(response);
}

export async function updateLeakageTraceStatus(id: string, status: LeakageTraceStatus): Promise<void> {
  await fetchWithAuth(`/admin/leakage-traces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function getDriverCancelStats(from?: string, to?: string): Promise<DriverCancelStat[]> {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  const res = await fetchWithAuth(`/admin/driver-cancel-stats${qs ? `?${qs}` : ''}`);
  return unwrap<DriverCancelStat[]>(res);
}

// Per-driver list of cancelled trips backing the detail sheet's "Danh sách chuyến
// huỷ". Anchored on cancelledAt (not createdAt) and does NOT exclude VINOW/test
// bookings the way the stats row's customerCancels does — counts can legitimately
// differ, see DriverCancelTrip's doc comment.
export async function getDriverCancelDetail(driverId: string, from?: string, to?: string): Promise<DriverCancelTrip[]> {
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  const qs = q.toString();
  const res = await fetchWithAuth(`/admin/driver-cancel-stats/${driverId}/detail${qs ? `?${qs}` : ''}`);
  return unwrap<DriverCancelTrip[]>(res);
}
