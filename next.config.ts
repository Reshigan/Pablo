import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Pablo v5 config */
  async headers() {
    return [
      {
        // Enable cross-origin isolation ONLY for the preview iframe route.
        // Applying COOP: same-origin to all /session/* pages causes mobile
        // browsers (especially Safari) to break the auth cookie context when
        // navigating from the OAuth callback (non-COOP) into session pages
        // (COOP: same-origin). This manifests as "redirect to login" on
        // every click because the session cookie is lost in the new
        // browsing context group.
        source: '/api/preview/:path*',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
