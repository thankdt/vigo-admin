import type { NextConfig } from 'next';


const nextConfig: NextConfig = {
  output: 'export', // Enable static export (hosted on Cloudflare Pages; was S3 + CloudFront before 17/10/2026)
  trailingSlash: true, // Required so every route is exported as <route>/index.html
  // assetPrefix is NOT needed when the whole site is served from one origin root

  // Allow the dev server (next dev) to accept requests proxied from the
  // Cloudflare tunnel host. Next 15.5 blocks cross-origin dev requests
  // otherwise. No effect on `next build` / static export.
  allowedDevOrigins: ['admin.vigodev.online'],

  images: {
    unoptimized: true, // Required for static export
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
