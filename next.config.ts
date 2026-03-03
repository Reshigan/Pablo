import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Pablo v5 config */
  async headers() {
    return [
      {
        // Enable cross-origin isolation for WebContainers (SharedArrayBuffer)
        source: '/session/:path*',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
