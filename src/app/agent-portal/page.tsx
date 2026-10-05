'use client';

import { useRouter } from 'next/navigation';
import React from 'react';

/** Bare /agent-portal entry — the đặt-hộ subdomain rewrite lands here. */
export default function AgentPortalRootPage() {
  const router = useRouter();
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const ssoToken = searchParams.get('sso_token') || searchParams.get('token');
        if (ssoToken) {
          localStorage.setItem('access_token', ssoToken);
        }
      } catch (_) {}

      if (localStorage.getItem('access_token')) {
        router.replace('/agent-portal/dashboard');
      } else {
        router.replace('/agent-portal/login');
      }
    }
  }, [router]);
  return null;
}
