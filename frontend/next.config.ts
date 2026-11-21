import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  // Keep the frontend root explicit now that tooling also has a root lockfile.
  turbopack: { root: import.meta.dirname },
  // Originals live in object storage. Do not create local optimizer image files.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
