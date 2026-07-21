'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getAdminMe } from '@/lib/api';
import type { AdminMe } from '@/lib/types';

// can(fn): super thấy tất; thường chỉ thấy function trong danh sách. Pure + export
// để test không cần render provider. `me` null (chưa load/không đăng nhập) -> false.
export function makeCan(me: AdminMe | null) {
  return (fn: string): boolean => !!me && (me.isSuperAdmin || me.functions.includes(fn));
}

export type AuthContextValue = {
  me: AdminMe | null;
  loading: boolean;
  can: (fn: string) => boolean;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Không có token (chưa đăng nhập / SSR) -> không gọi API, coi như xong.
    if (typeof window === 'undefined' || !localStorage.getItem('access_token')) {
      setMe(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setMe(await getAdminMe());
    } catch {
      // Lỗi (token hết hạn / mạng) -> để null; route guard sẽ xử lý điều hướng.
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthCtx.Provider value={{ me, loading, can: makeCan(me), refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
