'use client';

import { useRouter } from 'next/navigation';
import React from 'react';
import { stripUrlTokens } from './strip-url-tokens';

/** Bare /agent-portal entry — the đặt-hộ subdomain rewrite lands here. */
export default function AgentPortalRootPage() {
  const router = useRouter();
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      // Token chỉ đến từ localStorage, KHÔNG từ URL (xem stripUrlTokens).
      stripUrlTokens();
      if (localStorage.getItem('access_token')) {
        router.replace('/agent-portal/dashboard');
      } else {
        router.replace('/agent-portal/login');
      }
    }
  }, [router]);
  return null;
}
