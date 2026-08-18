'use client';
import type { DriverPresence } from './driver-presence';
import { Driver, User, Booking, AdminUnit, Route, RoutePricing, BookingStatus, SystemConfig, Promotion, PromotionAssignee, VoucherCampaign, VoucherCampaignStats, ScheduledNotification, NotificationTargetType, NotificationTargetData, NotificationAudience, News, Banner, TransportCompany, AppPopup, DriverFeedback, LeakageTraceRow, LeakageTraceStatus, LeakageVerdict, DriverCancelStat, DriverCancelTrip, DriverCancelCheckStatus, DriverCancelCheckEvent, CustomerCallStatus, CustomerCallFilter, TestTripFilter, BookingCustomerCallEvent, AdminMe, AdminRole, FunctionOverride, FunctionCatalogItem, AdminAssignmentUser, DriverReputation, DriverTripRating, DriverReputationRanking, RecentDriverRating, DriverTeamStage, TeamMemberState, TeamRouteRow, TeamDriverRow, TeamSummary, DriverTeamEvent, DriverTeamDetail, TeamOwner, TeamMemberRow } from '@/lib/types';
import {
  buildRankingQuery,
  buildRecentRatingsQuery,
  type RankingQueryInput,
  type RecentRatingsQueryInput,
} from '@/lib/driver-reputation-query';
import { ApiError, buildApiError } from '@/lib/api-error';

export { ApiError } from '@/lib/api-error';

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
  // `options.method` vắng mặt với mọi lời gọi GET — thiếu fallback thì payload
  // nút Sao chép in "undefined /drivers/..." cho toàn bộ lỗi GET.
  const requestPath = `${(options.method ?? 'GET').toUpperCase()} ${url}`;

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
            // Các request đang xếp hàng bị reject bằng chính lỗi này. Trước đây
            // nó là `Error('Refresh failed')` — tiếng Anh, không có mã — nên
            // request thứ hai toast "Refresh failed" ngay lúc trang đang chuyển
            // về màn đăng nhập. Reject bằng ApiError 401 để câu hiện ra là tiếng Việt.
            processQueue(
              buildApiError({ httpStatus: 401, path: requestPath }),
              null,
            );
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

      // BẤT BIẾN: fetchWithAuth KHÔNG BAO GIỜ trả về response có `ok === false`
      // — hoặc ném ở đây, hoặc trả promise không resolve khi đang redirect 401.
      // Vì vậy `if (!response.ok)` đặt sau một lời gọi fetchWithAuth là CODE CHẾT.
      // Từng có 10 khối như vậy trong file này, mang theo 4 câu tiếng Anh
      // ('Clawback failed', 'Approve failed'…) mà không ai từng thấy trên màn hình.
      //
      // Body có thể không phải JSON (HTML 502/504 từ ALB) — khi đó `body` là
      // undefined và buildApiError tự chọn câu chuẩn theo status.
      const errorData = await response.json().catch(() => undefined);
      throw buildApiError({
        body: errorData,
        httpStatus: response.status,
        path: requestPath,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // `fetch` chỉ ném khi chưa nhận được response nào: mất mạng, DNS hỏng, CORS,
    // abort. Trước đây lỗi này lọt nguyên "TypeError: Failed to fetch" lên toast.
    throw buildApiError({ networkError: error, path: requestPath });
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
    // Trước đây ném Error tiếng Anh không có mã, nên 5 call-site upload ảnh
    // (tài xế, banner, tin tức, popup, tuyến) toast nguyên câu tiếng Anh.
    throw new ApiError({
      message: 'Tải ảnh lên không thành công. Vui lòng thử lại.',
      code: `S3_${response.status}`,
      httpStatus: response.status,
      path: 'PUT <S3 presigned URL>',
      rawMessage: errorText || undefined,
    });
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
    // BUG cũ: đọc `errorData.message`, nhưng envelope backend là
    // `{ success, error: { code, message }, timestamp, path }` nên giá trị đó
    // LUÔN undefined → admin sai mật khẩu thì thấy 'Login failed' bằng tiếng Anh
    // trong khi backend đã gửi 'Thông tin đăng nhập không đúng.' (AUTH_002).
    // Đây là màn hình đầu tiên và được nhìn nhiều nhất của toàn bộ admin.
    const errorData = await response.json().catch(() => undefined);
    throw buildApiError({
      body: errorData,
      httpStatus: response.status,
      path: 'POST /auth/login',
    });
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

// Super admin sửa 1 tài khoản admin (tên + reset mật khẩu). Phone bất biến.
export async function updateAdminUser(id: string, body: { fullName?: string; password?: string }): Promise<void> {
  await fetchWithAuth(`/users/admin/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

// Self: user đang đăng nhập tự đổi mật khẩu (cần mật khẩu hiện tại).
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  await fetchWithAuth('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
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
  csCalled?: 'true' | 'false';
  // CSKH: lọc theo mốc "lịch sử làm việc" gần nhất + khoảng ngày làm việc (VN YYYY-MM-DD).
  csLastCallType?: 'CALLED' | 'UNREACHED' | 'CALLBACK' | 'HANDLED' | 'REMINDER' | 'NOTE';
  csNeverWorked?: 'true';
  csWorkedFrom?: string;
  csWorkedTo?: string;
  sort?: 'name' | 'isApproved' | 'createdAt' | 'csLastCallAt';
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
  if (params.csCalled) query.set('csCalled', params.csCalled);
  if (params.csLastCallType) query.set('csLastCallType', params.csLastCallType);
  if (params.csNeverWorked) query.set('csNeverWorked', params.csNeverWorked);
  if (params.csWorkedFrom) query.set('csWorkedFrom', params.csWorkedFrom);
  if (params.csWorkedTo) query.set('csWorkedTo', params.csWorkedTo);
  if (params.sort) query.set('sort', params.sort);
  if (params.order) query.set('order', params.order);

  const response = await fetchWithAuth(`/drivers/admin/list?${query.toString()}`);
  return response.json();
}

// CSKH đánh dấu đã gọi điện tài xế + ghi chú (theo dõi liên hệ). Chỉ gửi field muốn đổi:
// csCalled true→backend stamp thời điểm+CSKH, false→xoá; csNote chuỗi rỗng = xoá ghi chú.
export async function updateDriverCsStatus(
  driverId: string,
  body: { csCalled?: boolean; csNote?: string },
): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${driverId}/cs-status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  const result = await response.json();
  return result.data || result;
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

// CSKH "lịch sử làm việc" với tài xế (timeline).
export type DriverCallEventType =
  | 'CALLED'      // Gọi được
  | 'UNREACHED'   // Không nghe máy
  | 'CALLBACK'    // Hẹn gọi lại
  | 'HANDLED'     // Đã xử lý
  | 'REMINDER'    // Nhắc nhở
  | 'NOTE';       // Ghi chú

export type DriverCallEvent = {
  id: string;
  type: DriverCallEventType;
  note?: string | null;
  byAdminUserId: string | null;
  byAdmin?: { id: string; fullName?: string | null; phone?: string | null } | null;
  createdAt: string;
};

export async function getDriverCallHistory(id: string): Promise<DriverCallEvent[]> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/customer-call-history`);
  const data = await response.json();
  return data.data || data;
}

// Loại liên hệ (CALLED/UNREACHED/CALLBACK) tự tick "đã gọi" phía backend.
export async function recordDriverCall(
  id: string,
  body: { type: DriverCallEventType; note?: string },
): Promise<DriverCallEvent> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/customer-call`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
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
      /** TỔNG ghế kể cả ghế lái. BE chỉ nhận 5 hoặc 7 (`@IsIn([5,7])`). */
      seats?: number;
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

// ── Điểm uy tín & đánh giá tài xế ────────────────────────────────────────────
// ⚠️ Đường dẫn là `/admin/driver-reputation/...` (KHÁC mẫu `/drivers/admin/...`
// ở trên) — theo đúng hợp đồng API, đừng "sửa cho đồng bộ".
// Chỉ số `null` nghĩa là CHƯA CÓ DỮ LIỆU, không phải 0 — xem
// src/lib/driver-reputation-format.ts trước khi render.

export async function getDriverReputation(driverId: string): Promise<DriverReputation> {
  const response = await fetchWithAuth(`/admin/driver-reputation/${driverId}`);
  const json = await response.json();
  return json.data || json;
}

export async function getDriverRatings(
  driverId: string,
  params: { limit?: number; offset?: number } = {},
): Promise<{ items: DriverTripRating[]; total: number }> {
  const query = new URLSearchParams();
  if (params.limit != null) query.set('limit', String(params.limit));
  if (params.offset != null) query.set('offset', String(params.offset));
  const qs = query.toString();
  const response = await fetchWithAuth(
    `/admin/driver-reputation/${driverId}/ratings${qs ? `?${qs}` : ''}`,
  );
  const json = await response.json();
  return json.data || json;
}

/**
 * Bảng xếp hạng điểm uy tín (trang /driver-reputation, tab "Bảng xếp hạng").
 *
 * Phân trang Ở BACKEND (limit/offset) chứ không tải hết rồi cắt ở client như
 * vài màn cũ: bảng này quét toàn bộ tài xế (~11.7k dòng).
 *
 * `minRatings` mặc định 1 — xem `buildRankingQuery`. Muốn xem cả tài chưa có
 * đánh giá thì truyền THẲNG 0.
 */
export async function getDriverReputationRanking(
  params: RankingQueryInput = {},
): Promise<DriverReputationRanking> {
  const qs = buildRankingQuery(params);
  const response = await fetchWithAuth(`/admin/driver-reputation${qs ? `?${qs}` : ''}`);
  const json = await response.json();
  const data = json.data || json;
  // Backend cũ (chưa có endpoint) hoặc payload lạ ⇒ danh sách rỗng, KHÔNG undefined:
  // nơi gọi map thẳng `items` nên undefined là màn hình trắng kèm lỗi runtime.
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: Number(data?.total) || 0,
    minRatingsToShow: Number(data?.minRatingsToShow) || 0,
  };
}

/**
 * Đánh giá mới nhất TOÀN HỆ THỐNG (tab "Đánh giá gần đây").
 * `maxStars` = lọc "chỉ xem đánh giá thấp" — thứ admin cần theo dõi hằng ngày.
 */
export async function getRecentDriverRatings(
  params: RecentRatingsQueryInput = {},
): Promise<{ items: RecentDriverRating[]; total: number }> {
  const qs = buildRecentRatingsQuery(params);
  const response = await fetchWithAuth(
    `/admin/driver-reputation/ratings/recent${qs ? `?${qs}` : ''}`,
  );
  const json = await response.json();
  const data = json.data || json;
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: Number(data?.total) || 0,
  };
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
  // Sắp xếp server-side (sắp cả bảng, không chỉ trang hiện tại). BE whitelist cột:
  // createdAt|updatedAt|completedAt|price|status|scheduledTime. Mặc định createdAt DESC.
  sortBy?: string;
  order?: 'ASC' | 'DESC';
  // Lọc loại chuyến cho 2 tab admin "Chuyến thường / Đặt lịch". true = đặt lịch
  // (scheduledTime IS NOT NULL), false = thường (IS NULL). undefined = không lọc (tab "Tất cả").
  scheduled?: boolean;
  // Lọc "gọi check khách": 'called' = đã gọi được, 'unreached' = gọi không được,
  // 'uncalled' = chưa gọi. undefined = không lọc.
  customerCall?: CustomerCallFilter;
  // Lọc khoảng ngày ĐẶT chuyến (createdAt) — VN-local YYYY-MM-DD. Backend hiểu ranh giới VN (+07:00).
  from?: string;
  to?: string;
  // true = chỉ chuyến do ĐẠI LÝ đặt hộ (booking.agentUserId IS NOT NULL). Nguồn của trang
  // "Đơn đặt hộ" — trước đây trang đó đọc bảng multi_stop_order (rỗng trên prod) nên hiện trắng.
  // undefined = không lọc.
  agentOnly?: boolean;
  // Lọc riêng từng pha gọi CSKH. Hai pha độc lập nên dùng đồng thời được, vd
  // callBefore='called' + callAfter='uncalled' = "đã gọi trước, CHƯA gọi lại sau hoàn thành".
  callBefore?: CustomerCallFilter;
  callAfter?: CustomerCallFilter;
  // ─── Hàng đợi CSKH (/crm-queue) ────────────────────────────────────────────
  // Chỉ chuyến admin này đang GIỮ VIỆC chưa xong ở một trong hai pha (BE lọc
  // callBeforeById/callAfterById + trạng thái CLAIMED).
  claimedBy?: string;
  // CSV trạng thái cần loại trừ, vd 'COMPLETED,CANCELLED'.
  excludeStatus?: string;
  // true = chỉ chuyến hoàn thành quá lâu mà chưa gọi sau. Ngưỡng giờ do BE đọc từ
  // system_config (CSKH_CALL_AFTER_OVERDUE_HOURS) — FE cố ý KHÔNG biết con số này.
  overdue?: boolean;
  // true = việc ĐANG có người giữ (CLAIMED chưa ghi kết quả), của BẤT KỲ ai. Khác
  // `claimedBy` (chỉ việc của một người). Nguồn của tab "Đang giữ".
  claimed?: boolean;
  // Cờ "chuyến test": 'exclude' = ẩn chuyến test, 'only' = chỉ chuyến test.
  // undefined = hiện cả hai (mặc định — admin phải thấy chuyến mình đánh dấu để
  // sửa nếu gạt nhầm). Caller truyền undefined thay vì 'all' để param không bị
  // gửi thừa, và để an toàn khi backend chưa deploy.
  testFilter?: TestTripFilter;
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
    ...(params.scheduled !== undefined && { scheduled: String(params.scheduled) }),
    ...(params.customerCall && { customerCall: params.customerCall }),
    ...(params.from && { from: params.from }),
    ...(params.to && { to: params.to }),
    ...(params.agentOnly && { agentOnly: 'true' }),
    ...(params.callBefore && { callBefore: params.callBefore }),
    ...(params.callAfter && { callAfter: params.callAfter }),
    ...(params.claimedBy && { claimedBy: params.claimedBy }),
    ...(params.excludeStatus && { excludeStatus: params.excludeStatus }),
    ...(params.overdue && { overdue: 'true' }),
    ...(params.claimed && { claimed: 'true' }),
    ...(params.testFilter && { testFilter: params.testFilter }),
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

/**
 * Gạt công tắc "chuyến test". Backend loại chuyến khỏi mọi số liệu tổng hợp
 * (dashboard, tài chính, hoá đơn VAT, đối soát HTX) và ghi vết vào adminNote.
 *
 * Trả về payload GỌN `{ id, isTestTrip }` — CỐ Ý không phải cả Booking: response
 * của backend không kèm quan hệ customer/driver, nên caller phải vá đúng field
 * `isTestTrip` vào state chứ đừng thay cả object (sẽ làm trắng dialog chi tiết).
 *
 * Lưu ý nghiệp vụ: nếu chuyến ĐÃ hoàn thành thì tiền (ví tài xế, hoa hồng) đã
 * chuyển rồi — cờ này chỉ giấu chuyến khỏi báo cáo, không hoàn tiền. Muốn đảo
 * ngược thật phải dùng `voidCompletedBooking`.
 */
export async function setBookingTestFlag(
  id: string,
  isTest: boolean,
): Promise<{ id: string; isTestTrip: boolean }> {
  const response = await fetchWithAuth(`/bookings/admin/${id}/test-flag`, {
    method: 'POST',
    body: JSON.stringify({ isTest }),
  });
  return unwrap<{ id: string; isTestTrip: boolean }>(response);
}

// CSKH ghi nhận đã gọi check khách cho chuyến (append-only + denormalize trạng thái
// mới nhất lên booking). note nội bộ, tách khỏi booking.note (không lộ cho tài/khách).
export async function recordBookingCustomerCall(
  bookingId: string,
  body: { status: CustomerCallStatus; note?: string; reason?: string },
): Promise<void> {
  await fetchWithAuth(`/bookings/admin/${bookingId}/customer-call`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Danh mục lý do cho dropdown "gọi check khách". Đọc từ system_config ở backend nên
 * ops sửa được qua trang Cài đặt mà không cần deploy lại admin.
 */
export async function getCustomerCallReasons(): Promise<string[]> {
  const response = await fetchWithAuth('/bookings/admin/customer-call-reasons');
  return unwrap<string[]>(response);
}

// Lịch sử gọi check của 1 chuyến (mới nhất trước) — hiển thị trong dialog chi tiết.
export async function getBookingCustomerCallHistory(bookingId: string): Promise<BookingCustomerCallEvent[]> {
  const response = await fetchWithAuth(`/bookings/admin/${bookingId}/customer-call-history`);
  return unwrap<BookingCustomerCallEvent[]>(response);
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
  const result = await response.json();
  return result.data ?? result;
}

/**
 * Danh sách tài xế cho màn gán chuyến.
 *
 * `scheduledFrom`/`scheduledTo` (ISO) = khung giờ đón của chuyến đang tạo/đang
 * đổi tài. Backend dùng nó để chỉ ẩn tài THẬT SỰ chồng giờ; không gửi thì backend
 * coi như chuyến đi ngay, và tài đang giữ cam kết ở khung khác vẫn hiện.
 */
export async function getAvailableDrivers(opts?: {
  lat?: number;
  long?: number;
  scheduledFrom?: string;
  scheduledTo?: string;
  /** Chuyến đang đổi tài — không tính là cam kết cản trở của tài đang giữ nó. */
  excludeBookingId?: string;
  /**
   * Hiện CẢ tài đang chồng giờ (ca chiều về: khách đặt lượt về cho ĐÚNG tài đang
   * chở lượt đi). Backend chỉ nới bước lọc chồng giờ — gate duyệt/hồ sơ/khoá giữ
   * nguyên. Tài lọt thêm luôn mang `overlapsCandidate: true` → nhãn đỏ cảnh báo.
   */
  includeBusy?: boolean;
}): Promise<Driver[]> {
  const query = new URLSearchParams();
  if (opts?.lat) query.set('lat', String(opts.lat));
  if (opts?.long) query.set('long', String(opts.long));
  if (opts?.scheduledFrom) query.set('scheduledFrom', opts.scheduledFrom);
  if (opts?.scheduledTo) query.set('scheduledTo', opts.scheduledTo);
  if (opts?.excludeBookingId) query.set('excludeBookingId', opts.excludeBookingId);
  // Chỉ gửi khi BẬT: backend đọc 'true'/'1', và không gửi = hành vi cũ y nguyên.
  if (opts?.includeBusy) query.set('includeBusy', 'true');
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

// Look up a customer by exact phone (create-booking form "Kiểm tra" button, và ô
// chọn khách khi gán voucher TARGETED ở trang khuyến mãi).
//
// `id` là field MỚI của backend. Giữ `?? null` thay vì coi là bắt buộc để bản BE cũ
// (chưa deploy xong) không làm vỡ form tạo chuyến — lúc đó chỉ phần gán voucher là
// chưa dùng được, và UI báo rõ chứ không im lặng gán nhầm.
export async function lookupCustomerByPhone(
  phone: string,
): Promise<{ exists: boolean; id: string | null; fullName: string | null }> {
  const response = await fetchWithAuth(`/users/admin/by-phone?phone=${encodeURIComponent(phone)}`);
  const result = await response.json();
  const data = result.data ?? {};
  return {
    exists: !!data.exists,
    id: data.id ?? null,
    fullName: data.fullName ?? null,
  };
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
  // SĐT người đi cùng (tuỳ chọn). Gửi số đã chuẩn hoá; backend âm thầm bỏ số sai
  // định dạng và lưu null nếu trùng SĐT khách → không bao giờ làm hỏng việc tạo chuyến.
  companionPhone?: string;
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
  // SĐT người đi cùng (tuỳ chọn) — y hệt createAdminBooking.
  companionPhone?: string;
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

/**
 * Danh sách tuyến đường.
 *
 * BẮT BUỘC truyền `limit`: backend `GET /master-data/routes` mặc định `limit = 20`
 * (master-data.controller.ts). Trước đây hàm này không gửi param nào nên admin CHỈ
 * bao giờ nhận 20 tuyến — prod đang có 27, tức 7 tuyến vô hình ở mọi nơi dùng hàm
 * này (quản lý tuyến, combobox chọn tuyến ở bảng giá, bộ lọc tài xế, bộ lọc chuyến),
 * và nút phân trang trong routes-manager vĩnh viễn disabled vì `27 → 20 ≤ 50`.
 *
 * Mặc định 1000 để mọi call-site cũ tự khỏi bệnh mà không phải sửa. Số tuyến là dữ
 * liệu danh mục (hàng chục, không phải hàng vạn) nên tải hết một lần là hợp lý.
 */
export async function getRoutes(
  includeDeleted = false,
  opts?: { search?: string; page?: number; limit?: number },
): Promise<Route[]> {
  const q = new URLSearchParams();
  if (includeDeleted) q.set('includeDeleted', 'true');
  if (opts?.search) q.set('search', opts.search);
  if (opts?.page) q.set('page', String(opts.page));
  q.set('limit', String(opts?.limit ?? 1000));
  const response = await fetchWithAuth(`/master-data/routes?${q.toString()}`);
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
// Endpoint này KHÔNG phân trang. Backend mặc định loại voucher do chiến dịch tự
// sinh (`campaignId IS NOT NULL`) — nếu không, sau vài tuần chạy chiến dịch trang
// admin sẽ ngập hàng chục nghìn mã dùng-một-lần mà chẳng mã nào sửa bằng tay.
// `includeCampaign` chỉ dùng khi cần soi một mã tự sinh cụ thể.
export async function getVouchers(includeCampaign = false): Promise<Promotion[]> {
  const response = await fetchWithAuth(
    `/promotions/management${includeCampaign ? '?includeCampaign=true' : ''}`,
  );
  const result = await response.json();
  return result.data;
}

// `assignUserIds` KHÔNG phải cột của promotion — nó là tham số request để backend
// tạo voucher và gán khách trong CÙNG một lần gọi. Tách thành hai request thì
// request thứ hai hỏng sẽ để lại một voucher TARGETED không ai nhìn thấy.
export async function createVoucher(
  data: Omit<Promotion, 'id' | 'usageCount'> & { assignUserIds?: string[] },
): Promise<Promotion> {
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

// ── Gán voucher TARGETED cho khách cụ thể ───────────────────────────────────────
// Voucher TARGETED chỉ tới tay khách qua bảng `user_promotion`; ba hàm dưới là
// đường duy nhất để admin tạo/xem/gỡ liên kết đó. Thiếu chúng thì chọn TARGETED ở
// form là tạo ra một mã không ai nhìn thấy.

export async function assignPromotionToUsers(
  promotionId: number,
  userIds: string[],
): Promise<{ assigned: number; skipped: number }> {
  const response = await fetchWithAuth(`/promotions/${promotionId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
  const result = await response.json();
  return result.data ?? result;
}

export async function getPromotionAssignees(
  promotionId: number,
): Promise<PromotionAssignee[]> {
  const response = await fetchWithAuth(`/promotions/${promotionId}/assignees`);
  const result = await response.json();
  return result.data ?? [];
}

export async function revokePromotionFromUser(
  promotionId: number,
  userId: string,
): Promise<{ revoked: number }> {
  const response = await fetchWithAuth(`/promotions/${promotionId}/assign/${userId}`, {
    method: 'DELETE',
  });
  const result = await response.json();
  return result.data ?? result;
}

// ── Chiến dịch "tặng mã giữ khách" ──────────────────────────────────────────────
// Bảng chỉ có MỘT dòng nên API không kèm id. Gác bằng đúng function `promotions`
// như trang khuyến mãi cũ — không phát sinh quyền mới cần cấp phát lại.

export async function getVoucherCampaign(): Promise<VoucherCampaign> {
  const response = await fetchWithAuth('/voucher-campaign');
  const result = await response.json();
  return result.data ?? result;
}

export async function updateVoucherCampaign(
  data: Partial<Omit<VoucherCampaign, 'id'>>,
): Promise<VoucherCampaign> {
  const response = await fetchWithAuth('/voucher-campaign', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data ?? result;
}

export async function getVoucherCampaignStats(): Promise<VoucherCampaignStats> {
  const response = await fetchWithAuth('/voucher-campaign/stats');
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

/** Nội dung + đối tượng nhận, dùng chung cho lên lịch và bắn ngay. */
export type NotificationPayload = {
  title: string;
  body: string;
  imageUrl?: string;
  targetType?: NotificationTargetType;
  targetData?: NotificationTargetData;
};

export async function createScheduledNotification(
  data: NotificationPayload & { scheduleTime?: string; cronExpression?: string },
): Promise<ScheduledNotification> {
  const response = await fetchWithAuth('/notifications/schedule', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data ?? result;
}

/**
 * Bắn ngay, không qua AWS Scheduler. Không hoàn tác được — luôn hỏi xác nhận
 * kèm số người nhận từ `previewNotificationAudience` trước khi gọi.
 */
export async function broadcastNotificationNow(
  data: NotificationPayload,
): Promise<ScheduledNotification & { estimated: NotificationAudience }> {
  const response = await fetchWithAuth('/notifications/broadcast-now', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data ?? result;
}

/** Đếm trước số người nhận theo đúng bộ lọc backend sẽ dùng lúc bắn. */
export async function previewNotificationAudience(data: {
  targetType?: NotificationTargetType;
  targetData?: NotificationTargetData;
}): Promise<NotificationAudience> {
  const response = await fetchWithAuth('/notifications/broadcast-preview', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const result = await response.json();
  return result.data ?? result;
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
  return response.json();
}

// Persist a rotated image: backend rotates + recompresses the S3 object in place
// (key must be under uploads/). degrees = CSS clockwise (0/90/180/270).
export async function rotateUploadImage(key: string, degrees: number): Promise<void> {
  // Không cần giữ response: fetchWithAuth đã ném ApiError khi lỗi.
  await fetchWithAuth('/uploads/rotate', {
    method: 'POST',
    body: JSON.stringify({ key, degrees }),
  });
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
  // Tín hiệu THẬT từ Redis. Optional: BE bỏ field này khi Redis lỗi.
  presence?: DriverPresence;
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

// Một chuyến trong lịch sử HTX. Backend CỐ Ý không trả SĐT / ghi chú của khách
// (xem HtxService.listTrips) — đừng thêm field khách vào type này khi backend chưa
// đổi, sẽ chỉ nhận undefined.
export type HtxOwnerTripRow = {
  id: string;
  status: 'COMPLETED' | 'CANCELLED';
  serviceType: string;
  isVinow: boolean;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  /** Mốc hiển thị: chuyến huỷ = lúc huỷ, còn lại = lúc hoàn thành. Cũng là mốc lọc + sắp xếp. */
  eventAt: string;
  pickup: string | null;
  dropoff: string | null;
  distanceKm: number | null;
  customerName: string | null;
  driver: { id: string; name: string | null; phone: string | null; plate: string | null };
  price: number | null;
  finalPrice: number | null;
  cancelledByRole: 'CUSTOMER' | 'DRIVER' | 'ADMIN' | 'SYSTEM' | null;
  /** null khi admin huỷ (ô này dùng chung với ghi chú nội bộ) → hiện nhãn theo vai trò. */
  cancelReason: string | null;
};

export type HtxOwnerTripListResponse = {
  data: HtxOwnerTripRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export async function htxListTrips(
  params: {
    page?: number;
    limit?: number;
    /** Ngày VN (YYYY-MM-DD). Bỏ trống → backend lấy 30 ngày gần nhất. */
    from?: string;
    to?: string;
    status?: 'completed' | 'cancelled' | 'all';
    driverId?: string;
    search?: string;
  } = {},
): Promise<HtxOwnerTripListResponse> {
  const q = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 20),
  });
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.status) q.set('status', params.status);
  if (params.driverId) q.set('driverId', params.driverId);
  if (params.search) q.set('search', params.search);
  const response = await fetchWithAuth(`/htx/trips?${q.toString()}`);
  return unwrap<HtxOwnerTripListResponse>(response);
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
  /**
   * CHỈ tiền đi qua referral_event (thưởng đăng ký + hoa hồng chuyến), giá trị THÔ — có thể ÂM
   * nếu bị thu hồi vượt. Không phải tổng thật, và KHÔNG dùng để khép số (dùng signupReward +
   * tripReward). Giữ nguyên vì `sort=amount` sắp theo đúng cột này.
   */
  totalReward: number;
  // ── Additive; BE cũ không trả → undefined ──
  // Bất biến BE bảo đảm:
  //   signupReward + tripReward + agentReward + kolOverride + adjustment = lifetimeTotal
  /** Thưởng đăng ký, ĐÃ clamp về ≥ 0 — cùng công thức app dùng, để hai màn hình khớp nhau. */
  signupReward?: number;
  /** Hoa hồng chuyến, ĐÃ clamp về ≥ 0. */
  tripReward?: number;
  /** Hoa hồng đặt hộ (agent_commission_event, phần vào ví USER_REFERRAL). */
  agentReward?: number;
  /** Thưởng thủ lĩnh KOL: % trên hoa hồng KOL tuyến dưới kiếm được (kol_override_event). */
  kolOverride?: number;
  /** Số dư ví affiliate HIỆN TẠI (đã trừ phần đang giữ cho lệnh rút). */
  walletBalance?: number;
  /** Đã gửi lệnh rút, tiền rời ví nhưng chưa chuyển — admin còn có thể từ chối. */
  withdrawalHeld?: number;
  /** Đã chuyển khoản xong. */
  withdrawn?: number;
  /** Lũy kế thật = walletBalance + withdrawalHeld + withdrawn. */
  lifetimeTotal?: number;
  /** PHẦN DƯ: khoản bù anti-farm, backfill, nguồn chưa quy được về đâu. Có thể ÂM. */
  adjustment?: number;
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

// `amount` = chỉ referral_event (nghĩa cũ, giữ nguyên). `lifetime` = lũy kế thật của ví,
// gồm cả đặt hộ / KOL override / khoản bù — dùng cái này cho cột "Tổng tiền".
export type ReferrerSort = 'amount' | 'trips' | 'referees' | 'clicks' | 'installs' | 'lifetime';

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
  return unwrap(response);
}

export async function adminRejectWithdrawal(id: string, note: string): Promise<AdminWithdrawalRow> {
  const response = await fetchWithAuth(`/withdrawals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
  return unwrap(response);
}

export async function adminMarkWithdrawalTransferred(id: string): Promise<AdminWithdrawalRow> {
  const response = await fetchWithAuth(`/withdrawals/${id}/mark-transferred`, {
    method: 'POST',
  });
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
  // Mức điểm khách nhận khi đăng ký qua MÃ CÁ NHÂN của KOL này (link chia sẻ
  // mang mã cá nhân, KHÔNG mang kol_code). 0 = tắt → khách nhận welcome bonus
  // chung. Additive — backend cũ không trả thì coi như 0.
  refereeRewardPoints?: number;
  // Trần số lượt được thưởng qua mã cá nhân. 0 = không giới hạn. Đường mã cá
  // nhân không có kol_code để bump usedCount nên đây là trần DUY NHẤT của nó.
  refereeRewardUsageLimit?: number;
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
  refereeRewardPoints?: number;
  refereeRewardUsageLimit?: number;
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
  refereeRewardPoints?: number;
  refereeRewardUsageLimit?: number;
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

// ── Mã ưu đãi của KOL (kol_code): khách dùng mã → khách được cộng điểm thưởng ──

export type KolCodeRow = {
  id: string;
  code: string;
  ownerUserId: string;
  refereeRewardPoints: number;
  isActive: boolean;
  campaignName: string | null;
  startDate: string | null;
  endDate: string | null;
  usageLimit: number;
  dailyLimit: number;
  usedCount: number;
  createdAt: string;
};

export type KolCodeReport = {
  code: string;
  isActive: boolean;
  usageLimit: number;
  usedCount: number;
  dailyLimit: number;
  refereeRewardPoints: number;
  totalReferees: number;
  converted: number;
  totalPointsCredited: number;
};

export async function adminListKolCodes(userId: string): Promise<KolCodeRow[]> {
  const response = await fetchWithAuth(`/kol/admin/kols/${userId}/codes`);
  return unwrap<KolCodeRow[]>(response);
}

export async function adminCreateKolCode(
  userId: string,
  body: {
    code?: string;
    refereeRewardPoints: number;
    usageLimit: number;
    dailyLimit?: number;
    campaignName?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<KolCodeRow> {
  const response = await fetchWithAuth(`/kol/admin/kols/${userId}/codes`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return unwrap<KolCodeRow>(response);
}

export async function adminUpdateKolCode(
  id: string,
  body: {
    refereeRewardPoints?: number;
    usageLimit?: number;
    dailyLimit?: number;
    isActive?: boolean;
    campaignName?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<KolCodeRow> {
  const response = await fetchWithAuth(`/kol/admin/codes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return unwrap<KolCodeRow>(response);
}

export async function adminDeactivateKolCode(id: string): Promise<{ ok: true }> {
  const response = await fetchWithAuth(`/kol/admin/codes/${id}/deactivate`, {
    method: 'POST',
  });
  return unwrap<{ ok: true }>(response);
}

// Hard-delete — backend chỉ cho xoá mã SẠCH (chưa dùng / chưa referral); mã đã dùng trả 400,
// buộc dùng deactivate. Toast lỗi backend cho người dùng.
export async function adminDeleteKolCode(id: string): Promise<{ ok: true }> {
  const response = await fetchWithAuth(`/kol/admin/codes/${id}`, {
    method: 'DELETE',
  });
  return unwrap<{ ok: true }>(response);
}

export async function adminKolCodeReport(id: string): Promise<KolCodeReport> {
  const response = await fetchWithAuth(`/kol/admin/codes/${id}/report`);
  return unwrap<KolCodeReport>(response);
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
    throw buildApiError({
      body: e,
      httpStatus: response.status,
      path: 'POST /auth/send-login-otp',
      fallbackMessage: 'Gửi OTP thất bại. Vui lòng thử lại.',
    });
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
    throw buildApiError({
      body: e,
      httpStatus: response.status,
      path: 'POST /auth/login-otp',
      fallbackMessage: 'Đăng nhập thất bại. Vui lòng thử lại.',
    });
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
  // Số dư ví hoa hồng (additive — có thể undefined nếu backend cũ). walletType để UI đặt nhãn đúng:
  // USER_REFERRAL = ví hoa hồng (đại lý là khách), DRIVER_MAIN = ví tài xế (đại lý là tài xế).
  walletBalance?: number;
  walletType?: 'USER_REFERRAL' | 'DRIVER_MAIN';
  // Số dư ví affiliate (USER_REFERRAL) — additive, backend LUÔN trả kể cả khi
  // walletType là DRIVER_MAIN. Tài xế kiếm hoa hồng đặt hộ lúc CHƯA DUYỆT thì
  // tiền nằm ở ví này; sau khi được duyệt walletType đổi sang DRIVER_MAIN, nếu
  // gate phần rút chỉ theo walletType thì số tiền đó biến mất khỏi màn hình và
  // không rút được nữa dù vẫn là tiền của họ.
  referralBalance?: number;
  // Tiền ĐANG BỊ GIỮ cho lệnh rút chưa xong (PENDING/APPROVED). Lúc gửi lệnh,
  // backend TRỪ HẲN tiền khỏi ví affiliate sang ví trung gian ⇒ referralBalance
  // về 0. Không có field này thì gate `referralBalance > 0` sẽ ẩn cả khối rút
  // lẫn lịch sử đúng lúc người dùng đang chờ chuyển khoản — mất dấu tiền.
  referralHeld?: number;
  // Mức rút tối thiểu (BOK_004 nếu gửi thấp hơn). Hiện trước thay vì để người
  // dùng bấm rồi ăn lỗi.
  referralMinWithdrawal?: number;
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
    throw buildApiError({
      body: e,
      httpStatus: response.status,
      path: 'POST /auth/send-otp',
      fallbackMessage: 'Không gửi được mã OTP. Vui lòng thử lại.',
    });
  }
  return response.json();
}
export async function agentLoginOtp(phone: string, otp: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/auth/login-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp }),
  });
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw buildApiError({
      body: e,
      httpStatus: response.status,
      path: 'POST /auth/login-otp',
      fallbackMessage: 'Đăng nhập thất bại. Vui lòng thử lại.',
    });
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

// ───────── Đăng ký tài khoản tự phục vụ (mirror app khách) + ứng tuyển đại lý ─────────
// Cổng đại lý (backend) mở cho MỌI tài khoản đã đăng nhập, nên đăng ký = tạo tài khoản role
// USER (đúng hợp đồng /auth/* mà app khách đang dùng) rồi tự đăng nhập thẳng vào cổng.

// Bước 1: gửi OTP đăng ký (6 số, hết hạn 5 phút, gửi qua Zalo/SMS). Không cần auth.
export async function sendRegistrationOtp(phone: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/send-registration-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw buildApiError({
      body: e,
      httpStatus: response.status,
      path: 'POST /auth/send-otp',
      fallbackMessage: 'Không gửi được mã OTP. Vui lòng thử lại.',
    });
  }
  return response.json().then((b) => b.data ?? b);
}

// Bước 2: tạo tài khoản (role USER) + lưu token → đăng nhập luôn. Cùng body-shape app khách gửi
// (role mặc định USER; referralCode tuỳ chọn — chỉ gửi khi có, tránh 400 do rỗng).
export async function registerAccount(body: {
  phone: string;
  pass: string;
  fullName?: string;
  otp: string;
  referralCode?: string;
}): Promise<{ access_token?: string; refresh_token?: string; user?: any; requirePhoneUpdate?: boolean }> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, role: 'USER' }),
  });
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw buildApiError({
      body: e,
      httpStatus: response.status,
      path: 'POST /auth/register',
      fallbackMessage: 'Đăng ký thất bại. Vui lòng thử lại.',
    });
  }
  const data = await response.json();
  const tokens = data?.data ?? data;
  if (tokens?.access_token && typeof window !== 'undefined') {
    localStorage.setItem('access_token', tokens.access_token);
    if (tokens.refresh_token) localStorage.setItem('refresh_token', tokens.refresh_token);
  }
  return tokens;
}

// Ứng tuyển làm đại lý đặt hộ — CẦN đã đăng nhập (gọi sau register/login). Best-effort: tạo hồ sơ
// PENDING để admin thấy trong danh sách đại lý và cấp % hoa hồng riêng. Server idempotent; nếu đã
// ACTIVE nó ném lỗi → caller nuốt lỗi, đừng chặn UX.
export async function applyAgent(note?: string): Promise<{ status?: string; commissionPercent?: number | null }> {
  return unwrap(await fetchWithAuth('/agent/apply', { method: 'POST', body: JSON.stringify({ note }) }));
}

// CỔNG AN TOÀN TIỀN: ví hoa hồng đại lý chỉ TỰ RÚT được khi là ví USER_REFERRAL (đại lý là khách) —
// luồng /referrals/me/withdrawals hard-code vào ví USER_REFERRAL. Đại lý là TÀI XẾ → hoa hồng vào ví
// tài xế (DRIVER_MAIN), backend CHƯA có API tự rút → cổng chỉ hiển thị số dư, KHÔNG cho gửi lệnh rút.
export function agentCanSelfWithdraw(walletType: AgentMe['walletType']): boolean {
  return walletType === 'USER_REFERRAL';
}

/**
 * Có được gửi lệnh rút không — dùng cho CỔNG UI (phần "Tạo lệnh rút" + tài khoản
 * nhận tiền). Rộng hơn `agentCanSelfWithdraw` đúng một ca:
 *
 * Tài xế kiếm hoa hồng đặt hộ lúc CHƯA DUYỆT → tiền vào ví affiliate. Sau khi
 * admin duyệt, walletType chuyển sang DRIVER_MAIN và gate cũ sẽ ẩn phần rút —
 * khoá luôn số tiền họ đã kiếm. Nên còn tiền trong ví affiliate thì vẫn cho rút,
 * bất kể walletType hiện là gì.
 *
 * Vẫn KHÔNG mở đường rút cho ví tài xế: /referrals/me/withdrawals hard-code ví
 * USER_REFERRAL, nên lệnh rút chỉ động vào đúng số dư affiliate này.
 */
export function agentCanRequestWithdrawal(
  me: Pick<AgentMe, 'walletType' | 'referralBalance' | 'referralHeld'>,
): boolean {
  const coTien = (me.referralBalance ?? 0) > 0 || (me.referralHeld ?? 0) > 0;
  return agentCanSelfWithdraw(me.walletType) || coTien;
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
  // Hoa hồng "dự kiến" cho đơn CHƯA hoàn thành (null nếu đã có số thật / không phát sinh). additive.
  agentCommissionEstimate?: number | null;
  customerName: string | null;
  customerPhone: string | null;
  passengerNames: string[] | null;
  createdAt: string;
};
export async function listAgentBookings(page = 1, limit = 50): Promise<{ data: AgentBooking[]; meta: any }> {
  return unwrap(await fetchWithAuth(`/agent/bookings?page=${page}&limit=${limit}`));
}
export async function cancelAgentBooking(id: string, reason?: string): Promise<void> {
  // Không cần kiểm `res.ok`: fetchWithAuth đã ném ApiError kèm câu tiếng Việt.
  await fetchWithAuth(`/agent/bookings/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
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
  business: { completedTripsInPeriod: number; createdInPeriod: number; cancelledInPeriod: number };
  supply: { totalDrivers: number; onlineDrivers: number; pendingApproval: number; newDriversInPeriod: number };
  demand: { totalCustomers: number; newCustomersInPeriod: number; activeCustomersInPeriod: number };
};

export async function getAdminOverview(from: string, to: string): Promise<AdminOverview> {
  const qs = new URLSearchParams({ from, to });
  const response = await fetchWithAuth(`/admin/overview?${qs.toString()}`);
  const result = await response.json();
  return result.data;
}

// ─── Acquisition ("Nguồn khách") — where customers come from ────────────────
export type AcquisitionData = {
  range: { from: string; to: string; granularity: 'hour' | 'day' | 'month' };
  // First-party = OUR real customers (source of truth): signups over a VN-day series + referral split.
  firstParty: {
    totalSignups: number;
    viaReferral: number;
    direct: number;
    granularity: 'hour' | 'day' | 'month';
    byDay: Array<{ date: string; label: string; signups: number }>;
  };
  // GA4 acquisition-by-channel (best-effort). `available: false` when GA4 is unconfigured or failed.
  ga4:
    | {
        available: true;
        byChannel: Array<{ channel: string; newUsers: number; totalUsers: number; signups: number }>;
      }
    | { available: false; byChannel: [] };
  // Meta paid-ads registrations (best-effort). `available: false` when unconfigured or failed.
  meta:
    | {
        available: true;
        spend: number;
        impressions: number;
        clicks: number;
        registrations: number;
        campaigns: Array<{
          name: string;
          spend: number;
          impressions: number;
          clicks: number;
          registrations: number;
        }>;
      }
    | { available: false };
  // ChottuLink referral-link CUMULATIVE totals (not range-bounded) — labeled "tổng hiện tại".
  chottulink: {
    totalClicks: number;
    totalInstalls: number;
    linkCount: number;
    referrerCount: number;
    installsUnavailable: boolean;
  };
};

export async function getAcquisition(from: string, to: string): Promise<AcquisitionData> {
  const qs = new URLSearchParams({ from, to });
  const response = await fetchWithAuth(`/admin/acquisition?${qs.toString()}`);
  const result = await response.json();
  return result.data;
}

export type CashflowCategory =
  | 'payos' | 'km' | 'earnings' | 'admin_credit' | 'refund'
  | 'admin_debit' | 'tax' | 'commission' | 'other';
/** Ví tài xế bị trừ / được cộng ở giao dịch này. */
export type DriverWalletType = 'DRIVER_MAIN' | 'DRIVER_DEPOSIT';

export type DriverCashflowRow = {
  id: string;
  amount: number;
  direction: 'in' | 'out';
  category: CashflowCategory;
  createdAt: string;
  description: string;
  refCode: string;
  walletType: DriverWalletType;
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
  /** Mốc hoàn thành chuyến — backend mới trả (additive); FE hiển thị mốc này,
   *  fallback createdAt khi backend cũ chưa deploy. */
  completedAt?: string;
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

// Admin ghi nhận trạng thái xử lý case tỉ lệ huỷ: CHECKING ("tôi đang check") /
// CHECKED ("đã check xong") + note nội bộ cho admin khác. Append-only phía backend.
export async function upsertDriverCancelCheck(
  driverEntityId: string,
  body: { status: DriverCancelCheckStatus; note?: string },
): Promise<void> {
  await fetchWithAuth(`/admin/driver-cancel-stats/${driverEntityId}/check`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Lịch sử check của 1 tài xế (mới nhất trước) — hiển thị trong dialog chi tiết.
export async function getDriverCancelCheckHistory(driverEntityId: string): Promise<DriverCancelCheckEvent[]> {
  const res = await fetchWithAuth(`/admin/driver-cancel-stats/${driverEntityId}/check-history`);
  return unwrap<DriverCancelCheckEvent[]>(res);
}

// --- RBAC (phân quyền admin theo function) ---
// Admin-only endpoints; backend là nguồn an ninh, các hàm này chỉ phục vụ UI gating.

// Quyền hiệu lực của admin đang đăng nhập (functions rỗng nếu super = thấy tất).
export async function getAdminMe(): Promise<AdminMe> {
  const res = await fetchWithAuth('/admin/me');
  return unwrap<AdminMe>(res);
}

// Đăng xuất ĐÚNG: gọi backend (best-effort) rồi xoá CẢ hai token. UserNav cũ chỉ xoá
// access_token — refresh_token còn lại có thể tự đăng nhập lại (spec §5.4).
export async function logout(): Promise<void> {
  try {
    await fetchWithAuth('/auth/logout', { method: 'POST' });
  } catch {
    /* best-effort — vẫn xoá token cục bộ dù backend lỗi/hết hạn */
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
}

// CRUD role (super-only ở backend).
export async function adminListRoles(): Promise<AdminRole[]> {
  const res = await fetchWithAuth('/admin/roles');
  return unwrap<AdminRole[]>(res);
}
export async function adminCreateRole(body: { key: string; name: string; description?: string; functions: string[] }): Promise<AdminRole> {
  const res = await fetchWithAuth('/admin/roles', { method: 'POST', body: JSON.stringify(body) });
  return unwrap<AdminRole>(res);
}
export async function adminUpdateRole(id: string, body: Partial<{ name: string; description: string; functions: string[] }>): Promise<AdminRole> {
  const res = await fetchWithAuth(`/admin/roles/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  return unwrap<AdminRole>(res);
}
export async function adminDeleteRole(id: string): Promise<void> {
  await fetchWithAuth(`/admin/roles/${id}`, { method: 'DELETE' });
}

// Catalog function (key + nhãn + nhóm) để UI render danh sách tick.
export async function adminGetFunctions(): Promise<FunctionCatalogItem[]> {
  const res = await fetchWithAuth('/admin/functions');
  return unwrap<FunctionCatalogItem[]>(res);
}

// Danh sách user admin cho màn gán quyền (kèm isSuperAdmin + role/override hiện tại).
export async function adminListAssignableUsers(): Promise<AdminAssignmentUser[]> {
  const res = await fetchWithAuth('/admin/users?role=ADMIN');
  return unwrap<AdminAssignmentUser[]>(res);
}

// Gán role / override / cờ super cho 1 user admin (set-replace, last-write-wins).
export async function adminSetUserRoles(userId: string, roleIds: string[]): Promise<void> {
  await fetchWithAuth(`/admin/users/${userId}/roles`, { method: 'POST', body: JSON.stringify({ roleIds }) });
}
export async function adminSetUserOverrides(userId: string, overrides: FunctionOverride[]): Promise<void> {
  await fetchWithAuth(`/admin/users/${userId}/overrides`, { method: 'PUT', body: JSON.stringify({ overrides }) });
}
export async function adminSetUserSuper(userId: string, value: boolean): Promise<void> {
  await fetchWithAuth(`/admin/users/${userId}/super`, { method: 'PATCH', body: JSON.stringify({ value }) });
}

// --- Giám sát hoạt động CSKH (/cskh-activity) ---
// Gộp 2 log cuộc gọi có sẵn (gọi check khách theo chuyến + làm việc với tài xế) thành
// một nhật ký chung. Chỉ đọc; quyền riêng 'cskh-activity' ở backend.

export type CskhActivityKind = 'BOOKING' | 'DRIVER';

/** Một mốc CSKH đã chuẩn hoá từ 1 trong 2 bảng nguồn. */
export type CskhCallRow = {
  id: string;
  kind: CskhActivityKind;
  createdAt: string;
  byAdminUserId: string | null;
  byAdminName: string | null;
  /** Mã kết quả: CLAIMED/CALLED/UNREACHED (khách) hoặc CALLED/…/NOTE (tài xế). */
  outcome: string;
  /** Có được tính là CUỘC GỌI THẬT không (backend quyết, xem cskh-call-labels.ts). */
  isContact: boolean;
  /** Chỉ luồng khách — bảng sự kiện tài xế không có cột lý do. */
  reason: string | null;
  /** Chỉ luồng khách: BEFORE_COMPLETE / AFTER_COMPLETE. */
  phase: string | null;
  note: string | null;
  /** bookingId hoặc driverId tuỳ `kind`. */
  targetId: string;
  personId: string | null;
  targetName: string | null;
  targetPhone: string | null;
};

export type CskhStaffStat = {
  adminUserId: string | null;
  adminName: string | null;
  total: number;
  contactCalls: number;
  called: number;
  unreached: number;
  callback: number;
  claimed: number;
  bookingEvents: number;
  driverEvents: number;
  /** Số khách/tài xế KHÁC NHAU đã thực sự gọi được/gọi tới. */
  distinctTargets: number;
  firstAt: string | null;
  lastAt: string | null;
};

export type CskhActivitySummary = {
  range: { from: string; to: string };
  totals: {
    total: number;
    contactCalls: number;
    staffCount: number;
    distinctTargets: number;
    activeStaff: number;
    staffListed: number;
  };
  byStaff: CskhStaffStat[];
  byDay: Array<{ date: string; label: string; total: number; contactCalls: number }>;
  byHour: Array<{ hour: number; label: string; total: number; contactCalls: number }>;
  byReason: Array<{ reason: string; total: number }>;
  byOutcome: Array<{ kind: CskhActivityKind; outcome: string; total: number }>;
};

export type CskhActivityFilters = {
  from: string;
  to: string;
  adminUserId?: string;
  kind?: CskhActivityKind;
  outcome?: string;
  contactOnly?: boolean;
};

/** Chỉ đẩy lên query những filter thực sự có giá trị — tránh `?kind=undefined`. */
function cskhActivityQuery(f: CskhActivityFilters): URLSearchParams {
  const qs = new URLSearchParams({ from: f.from, to: f.to });
  if (f.adminUserId) qs.set('adminUserId', f.adminUserId);
  if (f.kind) qs.set('kind', f.kind);
  if (f.outcome) qs.set('outcome', f.outcome);
  if (f.contactOnly) qs.set('contactOnly', 'true');
  return qs;
}

export async function getCskhActivityFeed(
  f: CskhActivityFilters & { page?: number; limit?: number },
): Promise<{ data: CskhCallRow[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
  const qs = cskhActivityQuery(f);
  if (f.page) qs.set('page', String(f.page));
  if (f.limit) qs.set('limit', String(f.limit));
  const res = await fetchWithAuth(`/admin/cskh-activity?${qs.toString()}`);
  return unwrap(res);
}

export async function getCskhActivitySummary(f: CskhActivityFilters): Promise<CskhActivitySummary> {
  const res = await fetchWithAuth(`/admin/cskh-activity/summary?${cskhActivityQuery(f).toString()}`);
  return unwrap<CskhActivitySummary>(res);
}

/** Danh sách nhân viên admin (id + tên) cho dropdown lọc. */
export async function getCskhActivityStaff(): Promise<Array<{ id: string; fullName: string | null }>> {
  const res = await fetchWithAuth('/admin/cskh-activity/staff');
  return unwrap<Array<{ id: string; fullName: string | null }>>(res);
}

// ---- Đội tài chuyên nghiệp (/driver-team) ----
// Quyền RIÊNG 'driver-team' ở backend. KHÔNG dùng adminListAssignableUsers() cho
// dropdown người phụ trách: GET /admin/users gắn SuperOnlyGuard nên tài khoản chỉ
// có function driver-team sẽ nhận 403.

export async function getTeamSummary(range: { from: string; to: string }): Promise<TeamSummary> {
  const q = new URLSearchParams({ from: range.from, to: range.to });
  return unwrap<TeamSummary>(await fetchWithAuth(`/admin/driver-team/summary?${q}`));
}

/**
 * Cấp 1. Shape trả về là {routes, unassigned, range} — cố ý KHÔNG phải {data, meta}:
 * TransformInterceptor của backend thấy cặp data+meta sẽ dựng lại response và VỨT
 * mọi field khác, làm `unassigned` biến mất im lặng.
 */
export async function getTeamRoutes(params: {
  from: string;
  to: string;
  sort?: string;
  order?: string;
  /** Lọc theo TÊN TUYẾN — bớt dòng ở cấp 1. */
  q?: string;
  /**
   * Tìm theo TÊN/SĐT TÀI XẾ. KHÔNG lọc bớt tuyến — chỉ để backend đếm
   * matchedDriverCount mỗi tuyến, FE tự bung đúng những tuyến có người khớp.
   */
  driverQ?: string;
}): Promise<{ routes: TeamRouteRow[]; unassigned: TeamRouteRow | null }> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.sort) q.set('sort', params.sort);
  if (params.order) q.set('order', params.order);
  if (params.q) q.set('q', params.q);
  if (params.driverQ) q.set('driverQ', params.driverQ);
  return unwrap<{ routes: TeamRouteRow[]; unassigned: TeamRouteRow | null }>(
    await fetchWithAuth(`/admin/driver-team/routes?${q}`),
  );
}

export async function getTeamRouteDrivers(
  routeId: number | 'none',
  params: {
    from: string;
    to: string;
    stage?: string;
    ownerAdminUserId?: string;
    minTrips?: number;
    q?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  },
): Promise<{
  data: TeamDriverRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.stage) q.set('stage', params.stage);
  if (params.ownerAdminUserId) q.set('ownerAdminUserId', params.ownerAdminUserId);
  if (params.minTrips) q.set('minTrips', String(params.minTrips));
  if (params.q) q.set('q', params.q);
  if (params.sort) q.set('sort', params.sort);
  if (params.order) q.set('order', params.order);
  if (params.page) q.set('page', String(params.page));
  if (params.limit) q.set('limit', String(params.limit));
  // routeId giữ NGUYÊN 'none' — nhóm booking không gắn tuyến.
  const res = await fetchWithAuth(`/admin/driver-team/routes/${routeId}/drivers?${q}`);
  const body = await res.json();
  return {
    data: body.data ?? [],
    meta: body.meta ?? { page: 1, limit: 10, total: 0, totalPages: 0 },
  };
}

export async function getTeamOwners(): Promise<TeamOwner[]> {
  return unwrap<TeamOwner[]>(await fetchWithAuth('/admin/driver-team/owners'));
}

export async function getTeamDriverDetail(
  driverId: string,
  range: { from: string; to: string },
): Promise<DriverTeamDetail> {
  const q = new URLSearchParams({ from: range.from, to: range.to });
  return unwrap<DriverTeamDetail>(await fetchWithAuth(`/admin/driver-team/${driverId}?${q}`));
}

/**
 * Chỉ gửi field muốn đổi — field vắng mặt KHÔNG bị backend ghi đè null.
 * note: '' = XOÁ ghi chú; ownerAdminUserId: null = gỡ người phụ trách.
 */
export async function patchTeamMember(
  driverId: string,
  body: {
    stage?: DriverTeamStage;
    assignedRouteIds?: number[];
    ownerAdminUserId?: string | null;
    nextFollowUpAt?: string | null;
    note?: string;
  },
): Promise<TeamMemberState> {
  return unwrap<TeamMemberState>(
    await fetchWithAuth(`/admin/driver-team/${driverId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Danh sách thành viên đội (cấp phẳng, đi thẳng từ driver_team_member). Shape trả
 * về là {members} — cố ý KHÔNG phải {data, meta}: TransformInterceptor của backend
 * thấy cặp data+meta sẽ dựng lại response và VỨT mọi field khác (xem getTeamRoutes
 * ở trên, cùng bẫy). unwrap() vẫn đúng ở đây vì body chỉ có {success, data}.
 */
export async function getTeamMembers(params: {
  from: string;
  to: string;
  stage?: string;
  q?: string;
  ownerId?: string;
}): Promise<{ members: TeamMemberRow[] }> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.stage) q.set('stage', params.stage);
  if (params.q) q.set('q', params.q);
  if (params.ownerId) q.set('ownerId', params.ownerId);
  return unwrap<{ members: TeamMemberRow[] }>(
    await fetchWithAuth(`/admin/driver-team/members?${q}`),
  );
}

/** Số liệu ưu đãi (forgone commission + cash loss thực) cho khoảng ngày đang xem. */
export async function getTeamSubsidySummary(
  range: { from: string; to: string },
): Promise<{ forgone: number; cashLoss: number }> {
  const q = new URLSearchParams({ from: range.from, to: range.to });
  return unwrap<{ forgone: number; cashLoss: number }>(
    await fetchWithAuth(`/admin/driver-team/subsidy-summary?${q}`),
  );
}

/**
 * Sửa % hoa hồng riêng của một tài. Chỉ super admin gọi được — non-super nhận 403
 * (SuperOnlyGuard ở backend). `rate` BẮT BUỘC gửi thật trong body kể cả khi là `0`
 * hay `null`: `0` là giá trị HỢP LỆ ("miễn hoa hồng"), `null` là "gỡ mức riêng,
 * dùng mức chung" — hai nghĩa khác nhau, TUYỆT ĐỐI không lọc bằng `||`/truthiness.
 */
export async function updateTeamCommissionRate(
  driverId: string,
  rate: number | null,
): Promise<TeamMemberState> {
  return unwrap<TeamMemberState>(
    await fetchWithAuth(`/admin/driver-team/${driverId}/commission-rate`, {
      method: 'PATCH',
      body: JSON.stringify({ commissionRate: rate }),
    }),
  );
}

export async function addTeamEvent(
  driverId: string,
  body: { type: 'CALL' | 'NOTE'; note?: string },
): Promise<DriverTeamEvent> {
  return unwrap<DriverTeamEvent>(
    await fetchWithAuth(`/admin/driver-team/${driverId}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phạt vi phạm tài xế (/driver-penalties)
//
// Phạt = thu lại đúng khoản commission của chuyến ĐÃ HUỶ, thay vì để hệ thống hoàn
// về ví tài xế. Số tiền do backend tính từ ledger lịch sử — admin KHÔNG nhập tay.
// ─────────────────────────────────────────────────────────────────────────────

export type PenaltyReasonCode =
  | 'OFF_PLATFORM'
  | 'NO_SHOW'
  | 'FORCED_CANCEL'
  | 'FAKE_TRIP'
  | 'OTHER';
export type PenaltyStatus = 'ACTIVE' | 'REVERSED';
export type PenaltySource = 'PENALTY_PAGE' | 'CANCEL_REVIEW' | 'LEAKAGE_REVIEW';
/** Việc đã xử lý xong chưa. `pending` = còn phải phạt (mặc định của hàng đợi). */
export type PenaltyQueueState = 'pending' | 'all' | 'penalized';
/** Hệ thống thấy dấu hiệu gì. Tách khỏi `state` để lọc được "nghi rò rỉ mà CHƯA phạt". */
export type PenaltyQueueSignal = 'all' | 'leakage' | 'cancelAlert';

/** Mã chặn — câu hiển thị lấy từ `blockedMessage` (backend là nguồn duy nhất). */
export type PenaltyBlockedReason =
  | 'NOT_CANCELLED'
  | 'WAS_COMPLETED'
  | 'ALREADY_PENALIZED'
  | 'NO_COMMISSION'
  | 'NOT_REFUNDED'
  /** Chuyến quá cũ: sổ ví không nhúng mức hoa hồng nên không tự tính được. */
  | 'LEGACY_LEDGER'
  | 'LEDGER_ANOMALY'
  | 'DRIVER_NOT_FOUND';

export type PenaltyPreview = {
  amount: number;
  /** Số tiền ví ký quỹ sẽ ÂM sau khi phạt (0 = không âm). Không lộ số dư thô. */
  willOweDeposit: number;
  blockedReason: PenaltyBlockedReason | null;
  blockedMessage: string | null;
};

export type PenaltyQueueRow = {
  bookingId: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledByRole: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  driverEntityId: string;
  driverName: string | null;
  driverPhone: string | null;
  leakageVerdict: string | null;
  leakageConfidence: 'HIGH' | 'LOW' | null;
  cancelAlertRule: string | null;
  cancelAlertAction: string | null;
  cancelAlertRatePct: number | null;
  cancelAlertShadow: boolean | null;
  /** Câu giải thích kèm số liệu do rule engine sinh ra — dùng làm tooltip. */
  cancelAlertReason: string | null;
  penaltyId: string | null;
  penaltyStatus: PenaltyStatus | null;
  penaltyAmount: number | null;
  collectibleAmount: number;
};

/**
 * Hàng trong LỊCH SỬ phạt — có các field JOIN thêm (tên tài xế, tên người phạt).
 * `createPenalty`/`reversePenalty` KHÔNG trả những field này (backend trả entity thô),
 * nên hai hàm đó dùng `DriverPenaltyEntity` bên dưới.
 */
export type DriverPenaltyRow = {
  id: string;
  bookingId: string;
  driverEntityId: string;
  driverName: string | null;
  driverPhone: string | null;
  amount: number;
  fromMain: number;
  fromDeposit: number;
  reasonCode: PenaltyReasonCode;
  note: string | null;
  source: PenaltySource;
  status: PenaltyStatus;
  createdByName: string | null;
  createdAt: string;
  reversedByName: string | null;
  reversedAt: string | null;
  reverseNote: string | null;
};

/** Entity thô backend trả về khi tạo/huỷ phạt — thiếu mọi field JOIN của danh sách. */
export type DriverPenaltyEntity = Omit<
  DriverPenaltyRow,
  'driverName' | 'driverPhone' | 'createdByName' | 'reversedByName'
>;

type PenaltyMeta = { page: number; limit: number; total: number; totalPages: number };

export async function getPenaltyQueue(params: {
  from: string;
  to: string;
  state?: PenaltyQueueState;
  signal?: PenaltyQueueSignal;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: PenaltyQueueRow[]; meta: PenaltyMeta }> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return unwrap(await fetchWithAuth(`/admin/driver-penalties/queue?${qs.toString()}`));
}

export async function previewPenalty(bookingId: string): Promise<PenaltyPreview> {
  return unwrap(
    await fetchWithAuth(
      `/admin/driver-penalties/preview?bookingId=${encodeURIComponent(bookingId)}`,
    ),
  );
}

export async function createPenalty(body: {
  bookingId: string;
  reasonCode: PenaltyReasonCode;
  note?: string;
  source: PenaltySource;
}): Promise<DriverPenaltyEntity> {
  return unwrap(
    await fetchWithAuth('/admin/driver-penalties', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

export async function listPenalties(params: {
  from: string;
  to: string;
  status?: PenaltyStatus;
  reasonCode?: PenaltyReasonCode;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<{
  data: DriverPenaltyRow[];
  // `totals` nằm TRONG meta: backend buộc phải để đó vì TransformInterceptor vứt mọi
  // key ngoài `data`/`meta` khi dựng lại response phân trang.
  meta: PenaltyMeta & { totals: { count: number; amount: number } };
}> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return unwrap(await fetchWithAuth(`/admin/driver-penalties?${qs.toString()}`));
}

export async function reversePenalty(id: string, note?: string): Promise<DriverPenaltyEntity> {
  return unwrap(
    await fetchWithAuth(`/admin/driver-penalties/${id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ ...(note && { note }) }),
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────
// CRM GĐ2 — Hồ sơ khách 360 (Nguồn khách · tag/ghi chú · timeline · vết đọc)
//
// Toàn bộ gate bằng function `users` ở BE — CÙNG function với chính trang
// /users/detail, nên không tồn tại ca "vào được trang mà khối bị 403".
//
// Khối đặt ở CUỐI file có chủ đích: GĐ1 sửa `getBookings` ở giữa file, để đây
// thì merge giữa hai đợt không đụng nhau.
// ─────────────────────────────────────────────────────────────────────

export type CrmTag = {
  id: string;
  tag: string;
  createdAt: string;
  byAdminUserId: string;
  byAdminName: string | null;
};

export type CrmNote = {
  id: string;
  note: string;
  createdAt: string;
  byAdminUserId: string;
  byAdminName: string | null;
};

export type CrmCustomerSource = {
  referrer: {
    id: string;
    fullName: string | null;
    /** ĐÃ CHE ở backend (vd `0912****78`). Muốn số đủ phải qua `revealCrmCustomerPhone`. */
    phone: string | null;
    /** BE quyết qua `kol_profile`. FE TUYỆT ĐỐI không tự suy từ mã giới thiệu. */
    kind: 'KOL' | 'AFFILIATE';
  };
  codeUsed: string | null;
  referredAt: string | null;
};

export type CrmTimelineKind =
  | 'CALL'
  | 'TRIP_CREATED'
  | 'TRIP_COMPLETED'
  | 'RATING'
  | 'NOTE'
  | 'NOTIFICATION';

export type CrmTimelineItem = {
  /** id của DÒNG NGUỒN — một booking sinh 2 mốc nên id TRÙNG nhau, khác `kind`. */
  id: string;
  kind: CrmTimelineKind;
  /**
   * ISO-8601 CÓ offset (…Z). BE ép mọi nhánh UNION về `timestamptz` — nếu một ngày nào đó
   * chuỗi này mất offset thì `new Date()` sẽ hiểu theo giờ MÁY ADMIN và timeline lệch tới
   * 7 tiếng mà không lỗi gì.
   */
  occurredAt: string;
  /**
   * Với `kind === 'CALL'` đây là MÃ trạng thái thô, KHÔNG phải nhãn hiển thị — map qua
   * `BOOKING_CALL_STATUS_LABEL` (nguồn nhãn duy nhất). Các kind khác là tiếng Việt sẵn.
   */
  title: string | null;
  detail: string | null;
  meta: Record<string, unknown> | null;
  byAdminUserId: string | null;
  byAdminName: string | null;
};

/** Bề mặt phát sinh việc đọc — BE whitelist, gõ sai là 400. */
export type CrmAccessSurface = 'users-list' | 'users-detail';

export async function getCrmTagCatalog(): Promise<string[]> {
  // KHÔNG đi qua `GET system-config`: key CRM_CUSTOMER_TAGS rơi vào nhóm `settings.misc`
  // mà không starter role nào có → người chỉ có `users` sẽ nhận 403 trắng khối tag.
  const response = await fetchWithAuth('/admin/crm/tag-catalog');
  return unwrap<string[]>(response);
}

export async function getCrmCustomerTags(userId: string): Promise<CrmTag[]> {
  const response = await fetchWithAuth(`/admin/crm/customers/${userId}/tags`);
  return unwrap<CrmTag[]>(response);
}

export async function addCrmCustomerTag(userId: string, tag: string): Promise<CrmTag> {
  const response = await fetchWithAuth(`/admin/crm/customers/${userId}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tag }),
  });
  return unwrap<CrmTag>(response);
}

export async function removeCrmCustomerTag(userId: string, tagId: string): Promise<void> {
  await fetchWithAuth(`/admin/crm/customers/${userId}/tags/${tagId}`, { method: 'DELETE' });
}

export async function getCrmCustomerNotes(
  userId: string,
  page = 1,
  limit = 20,
): Promise<{ data: CrmNote[]; meta: { page: number; limit: number; total: number } }> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  const response = await fetchWithAuth(`/admin/crm/customers/${userId}/notes?${query.toString()}`);
  return unwrap<{ data: CrmNote[]; meta: { page: number; limit: number; total: number } }>(response);
}

export async function addCrmCustomerNote(userId: string, note: string): Promise<CrmNote> {
  const response = await fetchWithAuth(`/admin/crm/customers/${userId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
  return unwrap<CrmNote>(response);
}

export async function removeCrmCustomerNote(userId: string, noteId: string): Promise<void> {
  await fetchWithAuth(`/admin/crm/customers/${userId}/notes/${noteId}`, { method: 'DELETE' });
}

/** Ai giới thiệu khách NÀY (chiều inbound). `null` = không qua giới thiệu. */
export async function getCrmCustomerSource(userId: string): Promise<CrmCustomerSource | null> {
  const response = await fetchWithAuth(`/admin/crm/customers/${userId}/source`);
  return unwrap<CrmCustomerSource | null>(response);
}

export async function getCrmCustomerTimeline(
  userId: string,
  p: { days?: number; limit?: number; cursor?: string; sources?: string } = {},
): Promise<{ data: CrmTimelineItem[]; nextCursor: string | null }> {
  // Chỉ gửi khoá khi CÓ giá trị: gửi chuỗi rỗng làm BE rơi vào nhánh parse khác thay vì
  // dùng mặc định (90 ngày / 30 dòng).
  const query = new URLSearchParams({
    ...(p.days !== undefined && { days: String(p.days) }),
    ...(p.limit !== undefined && { limit: String(p.limit) }),
    // Cursor đi NGUYÊN VĂN chuỗi BE trả. Mọi phép "làm sạch" ở FE đều thành 400.
    ...(p.cursor && { cursor: p.cursor }),
    ...(p.sources && { sources: p.sources }),
  });
  const qs = query.toString();
  const response = await fetchWithAuth(
    `/admin/crm/customers/${userId}/timeline${qs ? `?${qs}` : ''}`,
  );
  return unwrap<{ data: CrmTimelineItem[]; nextCursor: string | null }>(response);
}

/**
 * Ghi vết ĐỌC hồ sơ khách. POST vì có tác dụng phụ — GET dễ bị prefetch/retry làm nhiễu
 * log, mà log nhiễu thì mất giá trị truy vết. BE tự gộp các lần gọi trong 10 phút.
 */
export async function logCrmProfileView(
  userId: string,
  surface: CrmAccessSurface,
): Promise<void> {
  await fetchWithAuth(`/admin/crm/customers/${userId}/view`, {
    method: 'POST',
    body: JSON.stringify({ surface }),
  });
}

/** Mở SĐT đầy đủ + ghi vết `REVEAL_PHONE`. Chốt TRUY VẾT ĐƯỢC, không phải chặn được. */
export async function revealCrmCustomerPhone(
  userId: string,
  surface: CrmAccessSurface,
): Promise<{ phone: string | null }> {
  const response = await fetchWithAuth(`/admin/crm/customers/${userId}/reveal-phone`, {
    method: 'POST',
    body: JSON.stringify({ surface }),
  });
  return unwrap<{ phone: string | null }>(response);
}
