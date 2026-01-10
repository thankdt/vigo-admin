'use client';
import { Driver, User, Booking, AdminUnit, Route, RoutePricing, BookingStatus, SystemConfig, Promotion } from '@/lib/types';

const API_BASE_URL = 'https://d191uftsrq8996.cloudfront.net';

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData) && !(options.body instanceof File)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url.startsWith('http') ? url : `${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/') {
      localStorage.removeItem('access_token');
      window.location.href = '/'; 
    }
    const errorData = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(JSON.stringify(errorData) || 'An API error occurred');
  }

  return response;
}

export async function getPresignedUrl(filename: string, contentType: string): Promise<{ url: string; key: string }> {
    const response = await fetchWithAuth('/s3/presigned-url', {
        method: 'POST',
        body: JSON.stringify({ filename, contentType }),
    });
    const result = await response.json();
    return result.data;
}

export async function uploadToS3(url: string, file: File): Promise<Response> {
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': file.type,
        },
        body: file,
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error("S3 Upload Error:", errorText);
        throw new Error('Failed to upload file to S3.');
    }
    
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

export async function approveDriver(id: number): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/approve`, { method: 'POST' });
  return response.json();
}

export async function rejectDriver(id: number, reason: string): Promise<Driver> {
  const response = await fetchWithAuth(`/drivers/admin/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return response.json();
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
  return response.json();
}

export async function getBookingDetails(id: number): Promise<Booking> {
    const response = await fetchWithAuth(`/bookings/admin/${id}`);
    const result = await response.json();
    return result.data;
}

export async function updateBookingStatus(id: number, status: BookingStatus): Promise<Booking> {
    const response = await fetchWithAuth(`/bookings/admin/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
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

export async function reassignBooking(bookingId: number, driverId: string): Promise<Booking> {
    const response = await fetchWithAuth(`/bookings/admin/${bookingId}/reassign`, {
        method: 'PUT',
        body: JSON.stringify({ driverId }),
    });
    const result = await response.json();
    return result.data;
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


export async function getPricingByRoute(routeId: number): Promise<RoutePricing[]> {
    const response = await fetchWithAuth(`/master-data/pricing/${routeId}`);
    const result = await response.json();
    return result.data; // Data is nested
}

export async function createPricing(data: { routeId: number; adminUnitId: number; price: number; priority?: number }): Promise<RoutePricing> {
    const response = await fetchWithAuth('/master-data/pricing', {
        method: 'POST',
        body: JSON.stringify(data),
    });
    return response.json();
}

export async function updatePricing(id: number, data: { price: number }): Promise<RoutePricing> {
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
    const response = await fetchWithAuth('/promotions?type=standard');
    const result = await response.json();
    return result.data;
}

export async function createVoucher(data: Omit<Promotion, 'id' | 'usageCount'>): Promise<Promotion> {
    const response = await fetchWithAuth('/promotions', {
        method: 'POST',
        body: JSON.stringify({
             ...data,
             discountType: data.discountType === 'FIXED_AMOUNT' ? 'FIXED_AMOUNT' : 'PERCENTAGE',
        }),
    });
    const result = await response.json();
    return result.data;
}
