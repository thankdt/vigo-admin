'use client';

import { useRouter } from 'next/navigation';
import React from 'react';

/**
 * Bare /kol-portal entry — the kol.* subdomain rewrite lands here. Send logged-in users to the
 * dashboard, everyone else to login. The portal layout re-verifies via /kol/me and bounces
 * non-KOLs back to login.
 */
export default function KolPortalRootPage() {
  const router = useRouter();

  React.useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('access_token')) {
      router.replace('/kol-portal/dashboard');
    } else {
      router.replace('/kol-portal/login');
    }
  }, [router]);

  return null;
}
