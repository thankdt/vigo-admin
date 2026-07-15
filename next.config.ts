import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: 'export', // Enable static export for S3 hosting
  trailingSlash: true, // Required for S3 to serve index.html for directories
  // assetPrefix is NOT needed when hosting the entire site on S3

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
