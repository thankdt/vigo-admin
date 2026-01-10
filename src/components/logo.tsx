import type React from 'react';

export function Logo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5 12s2.545-8 7-8 7 8 7 8-2.545 8-7 8-7-8-7-8z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}
