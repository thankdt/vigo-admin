'use client';

import { useRouter } from 'next/navigation';
import React from 'react';

/**
 * Bare /htx entry — pick a destination based on session.
 * Subdomain rewrite (htx.vigogroup.vn → /htx) lands here, and the role gate inside the
 * portal layout takes care of bouncing unauthorized visitors back to /htx/login.
 */
export default function HtxRootPage() {
  const router = useRouter();

  React.useEffect(() => {
    const token = localStorage.getItem('access_token');
    const role = localStorage.getItem('user_role');
    if (token && role === 'TRANSPORT_COMPANY_OWNER') {
      router.replace('/htx/dashboard');
    } else {
      router.replace('/htx/login');
    }
  }, [router]);

  return null;
}
